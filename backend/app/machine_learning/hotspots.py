"""Turns residents' littering reports into hotspots and recommendations.

Pipeline:

    photo + location (POST /api/reports)  ->  waste type (classifier.py,
    stored on the report)  ->  clusters of nearby reports (DBSCAN)
    ->  what the city should do

Reads the unresolved reports with a location from the main database
(app.db), so a report resolved on the Library page drops off the map.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Any

import numpy as np
from sklearn.cluster import DBSCAN

from app import db
from app.config import DEVICE_REGISTRY
from app.machine_learning import classifier

EARTH_RADIUS_M = 6_371_000.0
CLUSTER_RADIUS_M = 80.0      # reports this close together belong to one hotspot
MIN_REPORTS = 3              # fewer than this is not a hotspot
BIN_NEARBY_M = 150.0         # a bin within this distance "serves" a hotspot
MAX_REPORTS = 500

SIMULATED_NOTE_PREFIX = "[simulated]"   # see seed_reports.py


def located_reports() -> list[dict[str, Any]]:
    """Unresolved reports that have a location, each with a waste type
    (``unclassified`` if the photo was never classified)."""
    out = []
    for row in db.list_reports(MAX_REPORTS, include_resolved=False):
        if row["lat"] is None or row["lng"] is None:
            continue
        waste_type = row["waste_type"] or "unclassified"
        out.append({
            "id": row["id"],
            "lat": row["lat"],
            "lng": row["lng"],
            "created_at": row["created_at"],
            "type": waste_type,
            "type_label": classifier.TYPE_LABELS.get(waste_type, waste_type),
            "confidence": row["waste_confidence"],
            "simulated": bool(row["note"] and row["note"].startswith(SIMULATED_NOTE_PREFIX)),
        })
    return out


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
            "dominant_label": classifier.TYPE_LABELS.get(dominant, dominant),
            "recyclable_share": sum(1 for r in members
                                    if classifier.LABELS.get(r["type"], ("", "", False))[2]) / len(members),
            **_recommend(len(members), dominant, bin_label, bin_m),
        })
    hotspots.sort(key=lambda h: h["count"], reverse=True)
    return hotspots
