"""SQLite persistence: readings, device status, alerts, and community reports.

Kept as plain sqlite3 (no ORM) deliberately — the schema is small and
read-heavy, and this matches what the rest of the stack already uses.
"""
from __future__ import annotations

import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from app.config import get_settings


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    settings = get_settings()
    path = Path(settings.db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    try:
        yield con
    finally:
        con.close()


def init_db() -> None:
    with get_connection() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS readings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              device_id TEXT NOT NULL,
              ts TEXT NOT NULL,
              uptime_s INTEGER NOT NULL,
              fill_pct REAL NOT NULL,
              distance_cm REAL,
              overflow_flag INTEGER,
              gas_raw INTEGER,
              people_count INTEGER,
              movement_alert INTEGER
            )
            """
        )
        # Migration for DBs created before the gas/traffic/movement columns
        # existed (firmware originally shipped with ultrasonic-only data) —
        # same "no ADD COLUMN IF NOT EXISTS" workaround as `resolved` below.
        existing_reading_columns = {row[1] for row in con.execute("PRAGMA table_info(readings)").fetchall()}
        for column in ("gas_raw", "people_count", "movement_alert"):
            if column not in existing_reading_columns:
                con.execute(f"ALTER TABLE readings ADD COLUMN {column} INTEGER")
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS device_status (
              device_id TEXT PRIMARY KEY,
              connection TEXT NOT NULL,
              mode TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
              id TEXT PRIMARY KEY,
              device_id TEXT NOT NULL,
              type TEXT NOT NULL,
              message TEXT NOT NULL,
              created_at TEXT NOT NULL,
              resolved INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        # Migration for DBs created before `resolved` existed — SQLite has
        # no "ADD COLUMN IF NOT EXISTS", so check first.
        existing_columns = {row[1] for row in con.execute("PRAGMA table_info(alerts)").fetchall()}
        if "resolved" not in existing_columns:
            con.execute("ALTER TABLE alerts ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0")

        # Every read query filters/sorts by device_id, so the default
        # rowid-only index isn't enough once more than a couple of devices
        # are reporting — these keep the latest-per-device join, the
        # history lookup, and the alert dedupe check off a full table scan.
        con.execute("CREATE INDEX IF NOT EXISTS idx_readings_device_id ON readings(device_id, id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_alerts_device_type ON alerts(device_id, type, created_at)")

        con.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
              id TEXT PRIMARY KEY,
              lat REAL,
              lng REAL,
              note TEXT,
              photo_path TEXT,
              created_at TEXT NOT NULL,
              resolved INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        # Same "no ADD COLUMN IF NOT EXISTS" migration as alerts.resolved
        # above — lets the municipal dashboard's incident log (see
        # routers/reports.py) mark a report handled without a fresh DB.
        existing_report_columns = {row[1] for row in con.execute("PRAGMA table_info(reports)").fetchall()}
        if "resolved" not in existing_report_columns:
            con.execute("ALTER TABLE reports ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0")
        # What the photo classifier (machine_learning/classifier.py) decided
        # the report shows. NULL for reports made before it existed, or while
        # its packages weren't installed.
        for column, sql_type in (("waste_type", "TEXT"), ("waste_confidence", "REAL")):
            if column not in existing_report_columns:
                con.execute(f"ALTER TABLE reports ADD COLUMN {column} {sql_type}")
        # Privacy columns: when a report was closed (starts the photo
        # retention clock), and a hash of the one-time token that lets an
        # anonymous reporter withdraw their own report. Only the hash is
        # stored, so a database leak can't be used to delete reports.
        for column, sql_type in (("resolved_at", "TEXT"), ("withdraw_token_hash", "TEXT")):
            if column not in existing_report_columns:
                con.execute(f"ALTER TABLE reports ADD COLUMN {column} {sql_type}")
        con.execute("CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts)")

        con.commit()


def insert_reading(device_id: str, metrics: dict[str, Any]) -> None:
    # gas_raw/people_count/movement_alert are independently optional, same
    # as the firmware's "four independent subsystems" design — a bin
    # without a working accelerometer, say, still reports fill+gas+traffic.
    gas_raw = metrics.get("gas_raw")
    people_count = metrics.get("people_count")
    movement_alert = metrics.get("movement_alert")

    with get_connection() as con:
        con.execute(
            """
            INSERT INTO readings(
              device_id, ts, uptime_s, fill_pct, distance_cm, overflow_flag,
              gas_raw, people_count, movement_alert
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                device_id,
                utc_now(),
                int(metrics["uptime_s"]),
                float(metrics["fill_pct"]),
                metrics.get("distance_cm"),
                int(bool(metrics.get("overflow_flag", 0))),
                int(gas_raw) if gas_raw is not None else None,
                int(people_count) if people_count is not None else None,
                int(bool(movement_alert)) if movement_alert is not None else None,
            ),
        )
        con.commit()


def upsert_device_status(device_id: str, connection: str, mode: str) -> None:
    with get_connection() as con:
        con.execute(
            """
            INSERT INTO device_status(device_id, connection, mode, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
              connection = excluded.connection,
              mode = excluded.mode,
              updated_at = excluded.updated_at
            """,
            (device_id, connection, mode, utc_now()),
        )
        con.commit()


def get_device_status(device_id: str) -> tuple[str, str]:
    with get_connection() as con:
        row = con.execute(
            "SELECT connection, mode FROM device_status WHERE device_id = ?",
            (device_id,),
        ).fetchone()
    return (row[0], row[1]) if row else ("offline", "normal")


def list_online_device_ids() -> list[str]:
    with get_connection() as con:
        rows = con.execute("SELECT device_id FROM device_status WHERE connection = 'online'").fetchall()
    return [row[0] for row in rows]


def latest_reading_by_device() -> list[dict[str, Any]]:
    with get_connection() as con:
        rows = con.execute(
            """
            SELECT r.device_id, r.ts, r.uptime_s, r.fill_pct, r.distance_cm, r.overflow_flag,
                   r.gas_raw, r.people_count, r.movement_alert
            FROM readings r
            JOIN (
                SELECT device_id, MAX(id) AS max_id
                FROM readings
                GROUP BY device_id
            ) latest ON latest.max_id = r.id
            ORDER BY r.device_id
            """
        ).fetchall()

    return [
        {
            "device_id": row[0],
            "ts": row[1],
            "uptime_s": row[2],
            "fill_pct": row[3],
            "distance_cm": row[4],
            "overflow_flag": bool(row[5]),
            "gas_raw": row[6],
            "people_count": row[7],
            "movement_alert": bool(row[8]) if row[8] is not None else None,
        }
        for row in rows
    ]


def latest_reading(device_id: str) -> dict[str, Any] | None:
    with get_connection() as con:
        row = con.execute(
            """
            SELECT ts, uptime_s, fill_pct, distance_cm, overflow_flag,
                   gas_raw, people_count, movement_alert
            FROM readings WHERE device_id = ?
            ORDER BY id DESC LIMIT 1
            """,
            (device_id,),
        ).fetchone()

    if row is None:
        return None
    return {
        "ts": row[0],
        "uptime_s": row[1],
        "fill_pct": row[2],
        "distance_cm": row[3],
        "overflow_flag": bool(row[4]),
        "gas_raw": row[5],
        "people_count": row[6],
        "movement_alert": bool(row[7]) if row[7] is not None else None,
    }


def history(device_id: str, limit: int) -> list[dict[str, Any]]:
    with get_connection() as con:
        rows = con.execute(
            """
            SELECT ts, fill_pct, people_count FROM readings
            WHERE device_id = ?
            ORDER BY id DESC LIMIT ?
            """,
            (device_id, limit),
        ).fetchall()
    return [
        {"ts": ts, "fill_pct": fill_pct, "people_count": people_count}
        for ts, fill_pct, people_count in rows
    ][::-1]


def insert_alert(device_id: str, alert_type: str, message: str) -> None:
    with get_connection() as con:
        con.execute(
            "INSERT INTO alerts(id, device_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), device_id, alert_type, message, utc_now()),
        )
        con.commit()


def count_alerts_since(device_id: str, alert_types: tuple[str, ...], since_iso: str) -> int:
    """Alerts of the given types raised for a device since a timestamp,
    resolved or not (an incident that was handled still happened)."""
    marks = ",".join("?" * len(alert_types))
    with get_connection() as con:
        return con.execute(
            f"SELECT COUNT(*) FROM alerts WHERE device_id = ? AND type IN ({marks}) AND created_at >= ?",
            (device_id, *alert_types, since_iso),
        ).fetchone()[0]


def recent_alert_exists(device_id: str, alert_type: str, within_seconds: int = 900) -> bool:
    cutoff = time.time() - within_seconds
    with get_connection() as con:
        rows = con.execute(
            "SELECT created_at FROM alerts WHERE device_id = ? AND type = ? ORDER BY id DESC LIMIT 1",
            (device_id, alert_type),
        ).fetchone()
    if not rows:
        return False
    last = datetime.fromisoformat(rows[0]).timestamp()
    return last >= cutoff


def list_alerts(limit: int, include_resolved: bool = False) -> list[dict[str, Any]]:
    query = "SELECT id, device_id, type, message, created_at, resolved FROM alerts"
    if not include_resolved:
        query += " WHERE resolved = 0"
    query += " ORDER BY created_at DESC LIMIT ?"

    with get_connection() as con:
        rows = con.execute(query, (limit,)).fetchall()
    return [
        {
            "id": r[0],
            "device_id": r[1],
            "type": r[2],
            "message": r[3],
            "created_at": r[4],
            "resolved": bool(r[5]),
        }
        for r in rows
    ]


def resolve_alert(alert_id: str) -> bool:
    """Marks an alert resolved. Returns False if no such alert exists."""
    with get_connection() as con:
        cursor = con.execute("UPDATE alerts SET resolved = 1 WHERE id = ?", (alert_id,))
        con.commit()
        return cursor.rowcount > 0


def get_alert(alert_id: str) -> dict[str, Any] | None:
    with get_connection() as con:
        row = con.execute(
            "SELECT id, device_id, type, message, created_at, resolved FROM alerts WHERE id = ?",
            (alert_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row[0],
        "device_id": row[1],
        "type": row[2],
        "message": row[3],
        "created_at": row[4],
        "resolved": bool(row[5]),
    }


def insert_report(
    lat: float | None,
    lng: float | None,
    note: str | None,
    photo_path: str | None,
    waste_type: str | None = None,
    waste_confidence: float | None = None,
    withdraw_token_hash: str | None = None,
) -> str:
    report_id = str(uuid.uuid4())
    with get_connection() as con:
        con.execute(
            """
            INSERT INTO reports(
              id, lat, lng, note, photo_path, created_at, waste_type, waste_confidence, withdraw_token_hash
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (report_id, lat, lng, note, photo_path, utc_now(), waste_type, waste_confidence, withdraw_token_hash),
        )
        con.commit()
    return report_id


def list_reports(limit: int, include_resolved: bool = True) -> list[dict[str, Any]]:
    """Powers the municipal dashboard's incident log (routers/reports.py
    GET). Resolved reports stay included by default, unlike
    list_alerts — a closed-out littering report is still useful history
    for the library, where an operator reviewing past incidents outnumbers
    one triaging only what's still open.
    """
    query = (
        "SELECT id, lat, lng, note, photo_path, created_at, resolved, waste_type, waste_confidence "
        "FROM reports"
    )
    if not include_resolved:
        query += " WHERE resolved = 0"
    query += " ORDER BY created_at DESC LIMIT ?"

    with get_connection() as con:
        rows = con.execute(query, (limit,)).fetchall()
    return [
        {
            "id": r[0],
            "lat": r[1],
            "lng": r[2],
            "note": r[3],
            "photo_path": r[4],
            "created_at": r[5],
            "resolved": bool(r[6]),
            "waste_type": r[7],
            "waste_confidence": r[8],
        }
        for r in rows
    ]


def resolve_report(report_id: str) -> bool:
    """Marks a report resolved. Returns False if no such report exists."""
    with get_connection() as con:
        cursor = con.execute(
            "UPDATE reports SET resolved = 1, resolved_at = COALESCE(resolved_at, ?) WHERE id = ?",
            (utc_now(), report_id),
        )
        con.commit()
        return cursor.rowcount > 0


def get_report(report_id: str) -> dict[str, Any] | None:
    with get_connection() as con:
        row = con.execute(
            "SELECT id, lat, lng, note, photo_path, created_at, resolved, waste_type, waste_confidence, "
            "withdraw_token_hash FROM reports WHERE id = ?",
            (report_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row[0],
        "lat": row[1],
        "lng": row[2],
        "note": row[3],
        "photo_path": row[4],
        "created_at": row[5],
        "resolved": bool(row[6]),
        "waste_type": row[7],
        "waste_confidence": row[8],
        "withdraw_token_hash": row[9],
    }


def delete_report(report_id: str) -> bool:
    with get_connection() as con:
        cursor = con.execute("DELETE FROM reports WHERE id = ?", (report_id,))
        con.commit()
        return cursor.rowcount > 0


# ---- Retention (driven by app/retention.py) -------------------------------

def reports_with_expired_photos(resolved_before: str, open_before: str) -> list[dict[str, Any]]:
    """Reports still holding a photo that has outlived its purpose: resolved
    ones past the resolved cutoff (a report resolved before `resolved_at`
    was tracked falls back to its creation time), and unresolved ones past
    the hard cap."""
    with get_connection() as con:
        rows = con.execute(
            """
            SELECT id, photo_path, resolved FROM reports
            WHERE photo_path IS NOT NULL AND (
              (resolved = 1 AND COALESCE(resolved_at, created_at) < ?)
              OR (resolved = 0 AND created_at < ?)
            )
            """,
            (resolved_before, open_before),
        ).fetchall()
    return [{"id": r[0], "photo_path": r[1], "resolved": bool(r[2])} for r in rows]


def clear_report_media(report_id: str, scrub_note: bool) -> None:
    """Detach the photo from a report; for a resolved one also drop the
    free-text note, which is the other place a resident might have typed
    something identifying. The row stays as anonymous analytics."""
    with get_connection() as con:
        if scrub_note:
            con.execute("UPDATE reports SET photo_path = NULL, note = NULL WHERE id = ?", (report_id,))
        else:
            con.execute("UPDATE reports SET photo_path = NULL WHERE id = ?", (report_id,))
        con.commit()


def referenced_photo_names() -> set[str]:
    with get_connection() as con:
        rows = con.execute("SELECT photo_path FROM reports WHERE photo_path IS NOT NULL").fetchall()
    return {Path(r[0]).name for r in rows}


def delete_reports_before(cutoff: str) -> int:
    with get_connection() as con:
        cursor = con.execute("DELETE FROM reports WHERE created_at < ?", (cutoff,))
        con.commit()
        return cursor.rowcount


def delete_readings_before(cutoff: str) -> int:
    with get_connection() as con:
        cursor = con.execute("DELETE FROM readings WHERE ts < ?", (cutoff,))
        con.commit()
        return cursor.rowcount


def delete_alerts_before(cutoff: str) -> int:
    """Only resolved alerts: an open alert is still live operational state."""
    with get_connection() as con:
        cursor = con.execute("DELETE FROM alerts WHERE resolved = 1 AND created_at < ?", (cutoff,))
        con.commit()
        return cursor.rowcount
