"""Fill a separate demo database with made-up readings, so the forecast
service and chart page can be tested without the main backend, the
sensors or the city network.

It never touches the real database (backend/data.sqlite3) or any other
file in the repo. It writes to backend/demo.sqlite3, which you can delete
at any time.

Run from the repo root, in two PowerShell windows.

Window 1 (writes readings, and keeps adding one every 10 seconds):

    .\\.venv\\Scripts\\python.exe backend\\app\\machine_learning\\seed_demo.py

Window 2 (the forecast service, pointed at the demo database):

    $env:DB_PATH = "$PWD\\backend\\demo.sqlite3"
    .\\.venv\\Scripts\\python.exe -m uvicorn app.machine_learning.service:app --app-dir backend --port 8001

Then open http://localhost:8001/dashboard and choose "15 minutes".

It also writes made-up littering reports in a few clusters around the
corridor, each with a waste type, so the heatmap page
(http://localhost:8001/hotspots/map) has something to show. Their notes
start with "[simulated]".

The three bins are given different behaviour so every state shows up:
a bin filling steadily, a busy bin close to its threshold, and a quiet
one. Fill depends on the people count, so fill per visit is meaningful
here. It is simulated data: it shows the software working, not how real
bins behave.
"""
from __future__ import annotations

import argparse
import os
import random
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB = BACKEND_DIR / "demo.sqlite3"
REAL_DB = BACKEND_DIR / "data.sqlite3"

# Per bin: starting fill, fill added per reading regardless of visits,
# fill added per person counted, and the average people count.
BINS = {
    "bin-01": {"start": 20.0, "base": 0.05, "per_person": 0.12, "people": 2.0},
    "bin-02": {"start": 55.0, "base": 0.05, "per_person": 0.13, "people": 3.0},
    "bin-03": {"start": 8.0, "base": 0.05, "per_person": 0.10, "people": 1.5},
}
# Made-up littering reports: (centre lat, centre lng, how many, waste types).
# One cluster far from any bin, one beside a bin, one of dumped rubble,
# plus a few scattered single reports.
REPORT_CLUSTERS = [
    (-33.9310, 18.8600, 8, ["household", "household", "recyclables", "paper"]),
    (-33.9339, 18.8664, 6, ["overflowing_bin", "recyclables", "recyclables"]),
    (-33.9385, 18.8690, 5, ["rubble"]),
]
SCATTERED_REPORTS = [
    (-33.9322, 18.8641, "garden"), (-33.9366, 18.8612, "household"),
    (-33.9351, 18.8702, "recyclables"), (-33.9298, 18.8668, "paper"),
]
REPORT_SPREAD_DEG = 0.00025   # about 25 m

SENSOR_NOISE_PCT = 0.3
EMPTY_AT_PCT = 97.0     # a "collection" happens once a bin gets this full


def _poisson(mean: float) -> int:
    """Small Poisson draw without numpy (Knuth's method)."""
    limit, k, p = pow(2.718281828459045, -mean), 0, 1.0
    while True:
        p *= random.random()
        if p <= limit:
            return k
        k += 1


class Simulator:
    def __init__(self, con: sqlite3.Connection, interval_s: int):
        self.con = con
        self.interval_s = interval_s
        self.fill = {bin_id: cfg["start"] for bin_id, cfg in BINS.items()}
        self.uptime = 0

    def step(self, when: datetime) -> None:
        self.uptime += self.interval_s
        for bin_id, cfg in BINS.items():
            count = _poisson(cfg["people"])
            if self.fill[bin_id] >= EMPTY_AT_PCT:
                self.fill[bin_id] = random.uniform(3, 8)   # emptied by a collection
            else:
                self.fill[bin_id] += cfg["base"] + cfg["per_person"] * count
            measured = min(max(self.fill[bin_id] + random.gauss(0, SENSOR_NOISE_PCT), 0.0), 100.0)
            self.con.execute(
                "INSERT INTO readings(device_id, ts, uptime_s, fill_pct, people_count) VALUES (?, ?, ?, ?, ?)",
                (bin_id, when.isoformat(), self.uptime, round(measured, 1), count),
            )
        self.con.commit()


def seed_reports(con: sqlite3.Connection) -> int:
    """Writes the made-up reports and their waste types. Returns how many."""
    from app.machine_learning import hotspots  # noqa: E402  (needs DB_PATH set first)

    con.execute("DELETE FROM reports")
    label_con = hotspots._labels_connection()
    label_con.execute("DELETE FROM report_labels")
    label_con.execute("DELETE FROM ml_reports")
    label_con.commit()
    label_con.close()

    now = datetime.now(timezone.utc)
    rows = []
    for lat, lng, count, types in REPORT_CLUSTERS:
        for _ in range(count):
            rows.append((lat + random.gauss(0, REPORT_SPREAD_DEG),
                         lng + random.gauss(0, REPORT_SPREAD_DEG), random.choice(types)))
    rows += SCATTERED_REPORTS

    for lat, lng, waste_type in rows:
        report_id = str(uuid.uuid4())
        created = now - timedelta(hours=random.uniform(1, 72))
        con.execute(
            "INSERT INTO reports(id, lat, lng, note, photo_path, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
            (report_id, lat, lng, "[simulated] littering report", created.isoformat()),
        )
        hotspots.save_label(report_id, waste_type, None, "simulated")
    con.commit()
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a demo database with made-up bin readings.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="demo database file (default: backend/demo.sqlite3)")
    parser.add_argument("--interval", type=int, default=10, help="seconds between readings (default: 10)")
    parser.add_argument("--backfill", type=int, default=45, help="past readings to create per bin (default: 45)")
    parser.add_argument("--once", action="store_true", help="backfill only, then stop (no live updates)")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    if db_path == REAL_DB.resolve():
        sys.exit("Refusing to write made-up readings into the real database. Use a different --db path.")

    # Create the tables with the backend's own schema, in the demo file.
    os.environ["DB_PATH"] = str(db_path)
    sys.path.insert(0, str(BACKEND_DIR))
    from app import db  # noqa: E402  (imported after DB_PATH is set)

    db.init_db()
    con = sqlite3.connect(db_path)
    con.execute("DELETE FROM readings")   # start each run from a clean demo
    con.commit()

    random.seed()
    sim = Simulator(con, args.interval)
    now = datetime.now(timezone.utc)
    for i in range(args.backfill, 0, -1):
        sim.step(now - timedelta(seconds=args.interval * i))
    print(f"Wrote {args.backfill} past readings for each of {len(BINS)} bins to {db_path}")
    print(f"Wrote {seed_reports(con)} made-up littering reports for the heatmap")

    if args.once:
        return
    print(f"Adding a new reading every {args.interval} s. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(args.interval)
            sim.step(datetime.now(timezone.utc))
    except KeyboardInterrupt:
        print("Stopped.")


if __name__ == "__main__":
    main()
