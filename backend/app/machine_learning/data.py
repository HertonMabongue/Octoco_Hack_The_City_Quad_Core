"""Read-only access to the readings the backend already stores.

Queries the same SQLite file as app/db.py (path from app.config), but
with its own SELECT so nothing in the existing backend code has to
change. Opens the database read-only.
"""
from __future__ import annotations

import sqlite3
from typing import Any

from app.config import get_settings


def history_with_traffic(device_id: str, limit: int) -> list[dict[str, Any]]:
    """The last `limit` readings for one bin, oldest first:
    [{"ts": <iso str>, "fill_pct": <float>, "people_count": <int | None>}, ...]
    """
    path = get_settings().db_path
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return []  # database not created yet (main backend never started)
    try:
        rows = con.execute(
            """
            SELECT ts, fill_pct, people_count FROM readings
            WHERE device_id = ?
            ORDER BY id DESC LIMIT ?
            """,
            (device_id, limit),
        ).fetchall()
    except sqlite3.OperationalError:
        return []  # readings table not created yet
    finally:
        con.close()
    return [
        {"ts": ts, "fill_pct": fill_pct, "people_count": people_count}
        for ts, fill_pct, people_count in rows
    ][::-1]
