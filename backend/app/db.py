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
              overflow_flag INTEGER
            )
            """
        )
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
              created_at TEXT NOT NULL
            )
            """
        )
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
              created_at TEXT NOT NULL
            )
            """
        )
        con.commit()


def insert_reading(device_id: str, metrics: dict[str, Any]) -> None:
    with get_connection() as con:
        con.execute(
            """
            INSERT INTO readings(device_id, ts, uptime_s, fill_pct, distance_cm, overflow_flag)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                device_id,
                utc_now(),
                int(metrics["uptime_s"]),
                float(metrics["fill_pct"]),
                metrics.get("distance_cm"),
                int(bool(metrics.get("overflow_flag", 0))),
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
            SELECT r.device_id, r.ts, r.uptime_s, r.fill_pct, r.distance_cm, r.overflow_flag
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
        }
        for row in rows
    ]


def latest_reading(device_id: str) -> dict[str, Any] | None:
    with get_connection() as con:
        row = con.execute(
            """
            SELECT ts, uptime_s, fill_pct, distance_cm, overflow_flag
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
    }


def history(device_id: str, limit: int) -> list[dict[str, Any]]:
    with get_connection() as con:
        rows = con.execute(
            """
            SELECT ts, fill_pct FROM readings
            WHERE device_id = ?
            ORDER BY id DESC LIMIT ?
            """,
            (device_id, limit),
        ).fetchall()
    return [{"ts": ts, "fill_pct": fill_pct} for ts, fill_pct in rows][::-1]


def insert_alert(device_id: str, alert_type: str, message: str) -> None:
    with get_connection() as con:
        con.execute(
            "INSERT INTO alerts(id, device_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), device_id, alert_type, message, utc_now()),
        )
        con.commit()


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


def list_alerts(limit: int) -> list[dict[str, Any]]:
    with get_connection() as con:
        rows = con.execute(
            "SELECT id, device_id, type, message, created_at FROM alerts ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {"id": r[0], "device_id": r[1], "type": r[2], "message": r[3], "created_at": r[4]}
        for r in rows
    ]


def insert_report(lat: float | None, lng: float | None, note: str | None, photo_path: str | None) -> str:
    report_id = str(uuid.uuid4())
    with get_connection() as con:
        con.execute(
            "INSERT INTO reports(id, lat, lng, note, photo_path, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (report_id, lat, lng, note, photo_path, utc_now()),
        )
        con.commit()
    return report_id
