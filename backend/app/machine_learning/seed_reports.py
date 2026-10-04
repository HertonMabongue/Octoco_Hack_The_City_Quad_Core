"""Add made-up littering reports in a few clusters around the corridor, so
the hotspot map has something to show before residents have sent any.

Run from backend/:

    python -m app.machine_learning.seed_reports            # add them
    python -m app.machine_learning.seed_reports --clear    # remove them again

They go in the real reports table with a note starting "[simulated]"
(the map labels them as simulated), so --clear removes only these.
Bin readings need no seeding: the mock generator already feeds the
database (see app/mock_generator.py).
"""
from __future__ import annotations

import argparse
import random
import uuid
from datetime import datetime, timedelta, timezone

from app import db
from app.machine_learning.hotspots import SIMULATED_NOTE_PREFIX

# (centre lat, centre lng, how many, waste types to pick from): one cluster
# far from any bin, one beside a bin, one of dumped rubble.
CLUSTERS = [
    (-33.9310, 18.8600, 8, ["household", "household", "recyclables", "paper"]),
    (-33.9339, 18.8664, 6, ["overflowing_bin", "recyclables", "recyclables"]),
    (-33.9385, 18.8690, 5, ["rubble"]),
]
SCATTERED = [
    (-33.9322, 18.8641, "garden"), (-33.9366, 18.8612, "household"),
    (-33.9351, 18.8702, "recyclables"), (-33.9298, 18.8668, "paper"),
]
SPREAD_DEG = 0.00025   # about 25 m


def clear() -> int:
    with db.get_connection() as con:
        cursor = con.execute("DELETE FROM reports WHERE note LIKE ?", (f"{SIMULATED_NOTE_PREFIX}%",))
        con.commit()
        return cursor.rowcount


def seed() -> int:
    rows = list(SCATTERED)
    for lat, lng, count, types in CLUSTERS:
        rows += [
            (lat + random.gauss(0, SPREAD_DEG), lng + random.gauss(0, SPREAD_DEG), random.choice(types))
            for _ in range(count)
        ]
    now = datetime.now(timezone.utc)
    with db.get_connection() as con:
        for lat, lng, waste_type in rows:
            con.execute(
                """
                INSERT INTO reports(id, lat, lng, note, photo_path, created_at, waste_type, waste_confidence)
                VALUES (?, ?, ?, ?, NULL, ?, ?, NULL)
                """,
                (str(uuid.uuid4()), lat, lng, f"{SIMULATED_NOTE_PREFIX} littering report",
                 (now - timedelta(hours=random.uniform(1, 72))).isoformat(), waste_type),
            )
        con.commit()
    return len(rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--clear", action="store_true", help="remove the simulated reports instead")
    args = parser.parse_args()

    db.init_db()
    if args.clear:
        print(f"Removed {clear()} simulated reports.")
    else:
        clear()   # re-running replaces the set instead of doubling it
        print(f"Added {seed()} simulated reports.")
