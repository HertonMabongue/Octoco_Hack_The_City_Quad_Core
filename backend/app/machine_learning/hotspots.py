"""Turns residents' littering reports into hotspots and recommendations.

Pipeline:

    photo + location (community app)  ->  waste type (classifier.py)
        ->  clusters of nearby reports (DBSCAN)  ->  what the city should do

Reads the reports the main backend already stores (read-only). Photo
classifications are kept in a separate small database next to it, so the
main database is never written to.
"""
from __future__ import annotations

import math
import sqlite3
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.cluster import DBSCAN

from app.config import DEVICE_REGISTRY, get_settings
from app.machine_learning import classifier

EARTH_RADIUS_M = 6_371_000.0
CLUSTER_RADIUS_M = 80.0      # reports this close together belong to one hotspot
MIN_REPORTS = 3              # fewer than this is not a hotspot
BIN_NEARBY_M = 150.0         # a bin within this distance "serves" a hotspot
DUMPING_TYPES = {"rubble", "household", "garden"}

TYPE_LABELS = {key: label for key, (_, label, _) in classifier.LABELS.items()}
TYPE_LABELS.update(unclear="Unclear photo", unclassified="Not classified")


def _labels_path() -> Path:
    """Our own label store, beside the backend database it describes."""
    db_path = Path(get_settings().db_path)
    return db_path.with_name(f"ml_labels_{db_path.stem}.sqlite3")


def _labels_connection() -> sqlite3.Connection:
    con = sqlite3.connect(_labels_path())
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS report_labels (
          report_id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          confidence REAL,
          source TEXT NOT NULL
        )
        """
    )
    # Reports uploaded through this layer's own map page. Only the waste
    # type and location are kept: the photo itself is never stored.
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS ml_reports (
          id TEXT PRIMARY KEY,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          type TEXT NOT NULL,
          confidence REAL,
          created_at TEXT NOT NULL
        )
        """
    )
    return con


def add_report(lat: float, lng: float, waste_type: str, confidence: float | None) -> str:
    """Stores a report made through the map page. Returns its id."""
    report_id = f"ml-{uuid.uuid4()}"
    con = _labels_connection()
    try:
        con.execute(
            "INSERT INTO ml_reports(id, lat, lng, type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (report_id, lat, lng, waste_type, confidence, datetime.now(timezone.utc).isoformat()),
        )
        con.commit()
    finally:
        con.close()
    return report_id


def _read_own_reports() -> list[dict[str, Any]]:
    con = _labels_connection()
    try:
        rows = con.execute(
            "SELECT id, lat, lng, type, confidence, created_at FROM ml_reports ORDER BY created_at"
        ).fetchall()
    finally:
        con.close()
    return [
        {"id": r[0], "lat": r[1], "lng": r[2], "note": None, "photo_path": None, "created_at": r[5],
         "type": r[3], "type_label": TYPE_LABELS.get(r[3], r[3]), "confidence": r[4], "label_source": "upload"}
        for r in rows
    ]


def save_label(report_id: str, waste_type: str, confidence: float | None, source: str) -> None:
    con = _labels_connection()
    try:
        con.execute(
            "INSERT OR REPLACE INTO report_labels(report_id, type, confidence, source) VALUES (?, ?, ?, ?)",
            (report_id, waste_type, confidence, source),
        )
        con.commit()
    finally:
        con.close()


def _load_labels() -> dict[str, tuple[str, float | None, str]]:
    con = _labels_connection()
    try:
        rows = con.execute("SELECT report_id, type, confidence, source FROM report_labels").fetchall()
    finally:
        con.close()
    return {r[0]: (r[1], r[2], r[3]) for r in rows}


def _read_reports() -> list[dict[str, Any]]:
    """Unresolved reports that have a location, straight from the backend
    database (opened read-only)."""
    try:
        con = sqlite3.connect(f"file:{get_settings().db_path}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return []
    try:
        rows = con.execute(
            """
            SELECT id, lat, lng, note, photo_path, created_at FROM reports
            WHERE resolved = 0 AND lat IS NOT NULL AND lng IS NOT NULL
            ORDER BY created_at
            """
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    finally:
        con.close()
    return [
        {"id": r[0], "lat": r[1], "lng": r[2], "note": r[3], "photo_path": r[4], "created_at": r[5]}
        for r in rows
    ]


def labelled_reports(classify_new: bool = True) -> list[dict[str, Any]]:
    """Reports with a waste type attached. Photos that haven't been
    classified yet are classified now (if the model is available) and the
    result is remembered, so each photo is only processed once."""
    reports = _read_reports()
    labels = _load_labels()
    for report in reports:
        if report["id"] not in labels and classify_new and report["photo_path"]:
            result = classifier.classify(report["photo_path"])
            if result is not None:
                save_label(report["id"], result["type"], result["confidence"], "model")
                labels[report["id"]] = (result["type"], result["confidence"], "model")
        waste_type, confidence, source = labels.get(report["id"], ("unclassified", None, "none"))
        report.update(type=waste_type, type_label=TYPE_LABELS.get(waste_type, waste_type),
                      confidence=confidence, label_source=source)
    return reports + _read_own_reports()


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle (haversine) distance in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2)
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def _nearest_bin(lat: float, lng: float) -> tuple[str | None, float | None]:
    best: tuple[str | None, float | None] = (None, None)
    for info in DEVICE_REGISTRY.values():
        d = _distance_m(lat, lng, info.lat, info.lng)
        if best[1] is None or d < best[1]:
            best = (info.label, d)
    return best


def _recommend(count: int, dominant: str, bin_label: str | None, bin_m: float | None) -> dict[str, str]:
    """The rule that turns a hotspot into an action for the city."""
    has_bin = bin_m is not None and bin_m <= BIN_NEARBY_M
    if dominant == "rubble":
        return {"action": "cleanup_crew", "title": "Send a clean-up crew",
                "reason": f"{count} reports, mostly building rubble. This is dumping, which a bin won't solve."}
    if not has_bin:
        where = f"the nearest bin is {bin_m:.0f} m away" if bin_m is not None else "there is no bin nearby"
        return {"action": "add_bin", "title": "Add a bin here",
                "reason": f"{count} reports and {where}."}
    return {"action": "more_staff", "title": "Add cleaning staff or collect more often",
            "reason": f"{count} reports even though {bin_label} is {bin_m:.0f} m away."}


def find_hotspots(reports: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Groups nearby reports with DBSCAN and attaches a recommendation to
    each group. Sets report["hotspot"] to the group's id (or None)."""
    for report in reports:
        report["hotspot"] = None
    # "No waste visible" photos aren't evidence of a problem.
    usable = [r for r in reports if r["type"] != "no_waste"]
    if len(usable) < MIN_REPORTS:
        return []

    coords = np.radians([[r["lat"], r["lng"]] for r in usable])
    groups = DBSCAN(eps=CLUSTER_RADIUS_M / EARTH_RADIUS_M, min_samples=MIN_REPORTS,
                    metric="haversine").fit_predict(coords)

    hotspots: list[dict[str, Any]] = []
    for group in sorted(set(groups) - {-1}):
        members = [r for r, g in zip(usable, groups) if g == group]
        lat = float(np.mean([r["lat"] for r in members]))
        lng = float(np.mean([r["lng"] for r in members]))
        types = Counter(r["type"] for r in members)
        known = {t: n for t, n in types.items() if t not in ("unclassified", "unclear")}
        dominant = max(known, key=known.get) if known else "unclassified"
        bin_label, bin_m = _nearest_bin(lat, lng)
        hotspot_id = f"hotspot-{len(hotspots) + 1}"
        for r in members:
            r["hotspot"] = hotspot_id
        hotspots.append({
            "id": hotspot_id,
            "lat": lat,
            "lng": lng,
            "count": len(members),
            "dominant_type": dominant,
            "dominant_label": TYPE_LABELS.get(dominant, dominant),
            "types": dict(types),
            "recyclable_share": sum(1 for r in members
                                    if classifier.LABELS.get(r["type"], ("", "", False))[2]) / len(members),
            "nearest_bin": bin_label,
            "nearest_bin_m": bin_m,
            "latest_report": max(r["created_at"] for r in members),
            **_recommend(len(members), dominant, bin_label, bin_m),
        })
    hotspots.sort(key=lambda h: h["count"], reverse=True)
    return hotspots
