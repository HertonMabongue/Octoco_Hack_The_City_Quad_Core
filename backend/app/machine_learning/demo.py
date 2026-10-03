"""Try the model on made-up readings. No backend, database or sensors needed.

Run from the repo root:

    python backend/app/machine_learning/demo.py

It simulates one bin whose true behaviour we choose, feeds the readings
to the model, and prints what the model estimated next to the truth.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model  # noqa: E402  (same folder; imported this way so no backend is needed)

# ---- The "true" bin we simulate. Change these and re-run. ----
TRUE_BASE_RATE = 2.0        # percent per hour not explained by visits
TRUE_FILL_PER_VISIT = 0.05  # percent gained per counted visit
MEAN_PEOPLE_COUNT = 0.5     # average count per 10-second window
READING_INTERVAL_S = 300    # one reading every 5 minutes
N_READINGS = 50
SENSOR_NOISE_PCT = 0.3      # ultrasonic jitter, in percent fill
START_FILL_PCT = 10.0
THRESHOLD_PCT = 85.0        # collection threshold


def simulate(rng: np.random.Generator) -> tuple[list[dict], float]:
    """Readings in the shape data.history_with_traffic() returns, plus the
    bin's true fill level at the last reading."""
    start = datetime.now(timezone.utc) - timedelta(seconds=READING_INTERVAL_S * N_READINGS)
    fill = START_FILL_PCT
    points = []
    for i in range(N_READINGS):
        count = int(rng.poisson(MEAN_PEOPLE_COUNT))
        if i > 0:
            visits = count * READING_INTERVAL_S / model.PEOPLE_WINDOW_S
            fill += TRUE_BASE_RATE * READING_INTERVAL_S / 3600 + TRUE_FILL_PER_VISIT * visits
        points.append({
            "ts": (start + timedelta(seconds=READING_INTERVAL_S * i)).isoformat(),
            "fill_pct": fill + rng.normal(0, SENSOR_NOISE_PCT),
            "people_count": count,
        })
    return points, fill


def main() -> None:
    rng = np.random.default_rng(7)
    points, true_fill = simulate(rng)

    true_visits_per_hour = MEAN_PEOPLE_COUNT * 3600 / model.PEOPLE_WINDOW_S
    true_rate = TRUE_BASE_RATE + TRUE_FILL_PER_VISIT * true_visits_per_hour
    true_hours = (THRESHOLD_PCT - true_fill) / true_rate

    result = model.predict(points, THRESHOLD_PCT)
    print(f"Simulated {N_READINGS} readings, one every {READING_INTERVAL_S // 60} min. "
          f"Bin is now {true_fill:.1f}% full.\n")
    print(f"Status: {result['status']}")
    if result["status"] != "ok":
        return

    print(f"{'':28}{'model':>10}{'truth':>10}")
    print(f"{'Fill per visit (%)':28}{result['fill_per_visit_pct']:>10.3f}{TRUE_FILL_PER_VISIT:>10.3f}")
    print(f"{'Visits per hour':28}{result['visits_per_hour']:>10.0f}{true_visits_per_hour:>10.0f}")
    print(f"{'Fill rate (% per hour)':28}{result['rate_pct_per_hour']:>10.1f}{true_rate:>10.1f}")
    print(f"{'Hours to threshold':28}{result['hours']:>10.2f}{true_hours:>10.2f}")
    print(f"{'  80% range':28}{result['hours_low']:>7.2f} to {result['hours_high']:.2f}")

    print("\nBin placement: how fast would a bin fill elsewhere?")
    print(f"{'Visits per hour':>16}{'model % per hour':>20}{'truth':>10}{'hours to threshold':>22}")
    for visits in (60, 180, 360, 720):
        est = model.estimate_for_footfall([points], visits, THRESHOLD_PCT)
        truth = TRUE_BASE_RATE + TRUE_FILL_PER_VISIT * visits
        hours = f"{est['hours']:.1f} ({est['hours_low']:.1f} to {est['hours_high']:.1f})" if est["status"] == "ok" else est["status"]
        print(f"{visits:>16}{est['rate_pct_per_hour']:>20.1f}{truth:>10.1f}{hours:>22}")


if __name__ == "__main__":
    main()
