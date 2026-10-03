"""Bayesian linear regression for bin fill forecasting.

The model learns how much a bin fills per person who visits, from two
sensors: the ultrasonic fill level and the presence/PIR visit count.

For each pair of consecutive readings (an "interval") it uses

    fill increase = base_rate * hours + fill_per_visit * visits + noise

- ``base_rate`` (percent per hour) is filling the visit count doesn't
  explain, for example people the sensor missed.
- ``fill_per_visit`` (percent per counted visit) is what the footfall
  explains.

The fit is Bayesian (scikit-learn's BayesianRidge), so instead of one
answer it gives a distribution over both numbers. Sampling from that
distribution gives a range for:

1. when a bin reaches the collection threshold (``predict``), and
2. how fast a bin would fill at any spot with a known footfall
   (``estimate_for_footfall``), which is the bin-placement question.

If a bin reports no visit counts, the model drops the footfall term and
becomes a plain Bayesian fill-over-time regression.

Pure functions over reading rows: no database or FastAPI imports here, so
it can be tested on its own (see data.py in this folder for the row
shape).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np
from sklearn.linear_model import BayesianRidge

# The firmware counts presence events over a window of this length
# (TRAFFIC_INTERVAL in firmware/src/OctocoEsp32Project.ino) and reports
# the count for the last completed window. Keep the two in sync.
PEOPLE_WINDOW_S = 10.0

MIN_INTERVALS = 8          # fewer than this and we refuse to forecast
EMPTIED_DROP_PCT = 30.0    # a drop this large means the bin was emptied
MAX_GAP_S = 300.0          # skip intervals spanning a long outage
N_SAMPLES = 4000           # posterior samples behind every range
MIN_PROB_FILLING = 0.8     # below this we say "not filling", not a number
RANGE_PERCENTILES = (10, 50, 90)   # low, median, high (an 80% range)


def _intervals(points: list[dict[str, Any]]) -> list[tuple[float, float | None, float]]:
    """Turns chronological readings into (hours, visits, fill_increase)
    rows, one per pair of consecutive readings since the last emptying.

    ``visits`` is None when the later reading has no people_count.
    """
    start = 0
    for i in range(1, len(points)):
        if points[i]["fill_pct"] - points[i - 1]["fill_pct"] < -EMPTIED_DROP_PCT:
            start = i
    points = points[start:]

    rows: list[tuple[float, float | None, float]] = []
    for prev, cur in zip(points, points[1:]):
        dt_s = (
            datetime.fromisoformat(cur["ts"]) - datetime.fromisoformat(prev["ts"])
        ).total_seconds()
        if dt_s <= 0 or dt_s > MAX_GAP_S:
            continue
        count = cur.get("people_count")
        # The count covers one PEOPLE_WINDOW_S window; scale it to the
        # whole interval between the two readings.
        visits = None if count is None else float(count) * dt_s / PEOPLE_WINDOW_S
        rows.append((dt_s / 3600.0, visits, cur["fill_pct"] - prev["fill_pct"]))
    return rows


class _Fit:
    """Posterior over (base_rate, fill_per_visit) from a set of intervals."""

    def __init__(self, rows: list[tuple[float, float | None, float]]):
        hours = np.array([r[0] for r in rows])
        y = np.array([r[2] for r in rows])
        has_visits = all(r[1] is not None for r in rows)
        visits = np.array([r[1] for r in rows], dtype=float) if has_visits else None

        self.uses_footfall = bool(has_visits and visits is not None and visits.sum() > 0)
        columns = [hours, visits] if self.uses_footfall else [hours]
        X = np.column_stack(columns)

        # Put both columns on the same scale so the shared prior doesn't
        # favour one coefficient, then undo the scaling afterwards.
        scale = np.sqrt((X**2).mean(axis=0))
        model = BayesianRidge(fit_intercept=False)
        model.fit(X / scale, y)
        self.mean = model.coef_ / scale
        self.cov = model.sigma_ / np.outer(scale, scale)

        # Recent footfall, with its own uncertainty (standard error).
        if self.uses_footfall:
            rates = visits / hours
            self.visits_per_hour = float(rates.mean())
            self.visits_per_hour_se = float(rates.std(ddof=1) / np.sqrt(len(rates)))
        else:
            self.visits_per_hour = None
            self.visits_per_hour_se = 0.0

    def sample(self, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
        """Samples of (base_rate, fill_per_visit)."""
        draws = rng.multivariate_normal(self.mean, self.cov, N_SAMPLES)
        base = draws[:, 0]
        per_visit = draws[:, 1] if self.uses_footfall else np.zeros(N_SAMPLES)
        return base, per_visit

    @property
    def fill_per_visit(self) -> float | None:
        return float(self.mean[1]) if self.uses_footfall else None


def _hours_range(remaining_pct: float, rates: np.ndarray) -> dict[str, Any]:
    """Summarises sampled fill rates (percent per hour) as hours until
    ``remaining_pct`` more fill, or says the bin isn't filling."""
    prob_filling = float(np.mean(rates > 0))
    out: dict[str, Any] = {
        "rate_pct_per_hour": float(np.median(rates)),
        "prob_filling": prob_filling,
    }
    if prob_filling < MIN_PROB_FILLING:
        out["status"] = "not_filling"
        return out
    hours = remaining_pct / rates[rates > 0]
    low, mid, high = np.percentile(hours, RANGE_PERCENTILES)
    out.update(status="ok", hours=float(mid), hours_low=float(low), hours_high=float(high))
    return out


def predict(points: list[dict[str, Any]], threshold_pct: float, seed: int = 0) -> dict[str, Any]:
    """Forecast for one bin.

    points: chronological rows with "ts" (ISO string), "fill_pct" and
        optionally "people_count".
    threshold_pct: the fill level that counts as needing collection.

    Returns a dict with "status":
        "ok"               hours, hours_low, hours_high are set
        "at_threshold"     already at or past the threshold (hours = 0)
        "not_filling"      no clear upward trend
        "not_enough_data"  fewer than MIN_INTERVALS usable intervals
    plus, when fitted: rate_pct_per_hour, prob_filling, uses_footfall,
    fill_per_visit_pct and visits_per_hour (the last two None without
    footfall data).
    """
    if not points:
        return {"status": "not_enough_data"}
    current = float(points[-1]["fill_pct"])
    if current >= threshold_pct:
        return {"status": "at_threshold", "hours": 0.0, "hours_low": 0.0, "hours_high": 0.0}

    rows = _intervals(points)
    if len(rows) < MIN_INTERVALS:
        return {"status": "not_enough_data"}

    fit = _Fit(rows)
    rng = np.random.default_rng(seed)
    base, per_visit = fit.sample(rng)
    if fit.uses_footfall:
        footfall = rng.normal(fit.visits_per_hour, fit.visits_per_hour_se, N_SAMPLES)
        rates = base + per_visit * np.maximum(footfall, 0.0)
    else:
        rates = base

    out = _hours_range(threshold_pct - current, rates)
    out.update(
        uses_footfall=fit.uses_footfall,
        fill_per_visit_pct=fit.fill_per_visit,
        visits_per_hour=fit.visits_per_hour,
    )
    return out


def estimate_for_footfall(
    histories: list[list[dict[str, Any]]],
    visits_per_hour: float,
    threshold_pct: float,
    seed: int = 0,
) -> dict[str, Any]:
    """Bin placement: how fast would a bin fill at a spot with this much
    footfall? Pools the intervals of every monitored bin into one fit.

    histories: one chronological reading list per monitored bin.
    visits_per_hour: footfall measured (or assumed) at the candidate spot.

    Returns "status" of "ok", "not_filling" or "not_enough_data" (the
    last also when no bin has reported visit counts), with
    rate_pct_per_hour and, when ok, hours / hours_low / hours_high for an
    empty bin to reach the threshold.
    """
    rows = [r for points in histories for r in _intervals(points) if r[1] is not None]
    if len(rows) < MIN_INTERVALS:
        return {"status": "not_enough_data"}

    fit = _Fit(rows)
    if not fit.uses_footfall:
        return {"status": "not_enough_data"}

    base, per_visit = fit.sample(np.random.default_rng(seed))
    out = _hours_range(threshold_pct, base + per_visit * visits_per_hour)
    out.update(fill_per_visit_pct=fit.fill_per_visit, visits_per_hour=float(visits_per_hour))
    return out
