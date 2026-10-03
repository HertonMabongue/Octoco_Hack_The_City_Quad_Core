"""Per-bin fill-rate forecast for the municipal dashboard's Insights page.

Today this is a naive linear projection over each bin's recent
fill-history (the same rows app.db.history() already returns), not a
trained model — app/forecasting/ is reserved for that (see its README,
it's scaffolded but not built). The point of this file is the response
contract: {binId, label, predictedFullInHours, riskLevel, source}. Drop
the real model's prediction into source="model" here and the frontend
(lib/api.ts getForecast, app/dashboard/insights) needs no changes at
all, it already renders whichever source it's given.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from app import db
from app.config import DEVICE_REGISTRY, device_info, get_settings
from app.models import ForecastPoint, RiskLevel

router = APIRouter(prefix="/api/forecast", tags=["forecast"])

MIN_POINTS_FOR_TREND = 3


def _linear_slope(points: list[dict]) -> float | None:
    """Least-squares slope of fill_pct over time, in percent per hour.
    None if there isn't enough history, or the points span ~0 time (a
    slope needs more than one instant).
    """
    if len(points) < MIN_POINTS_FOR_TREND:
        return None

    hours = [datetime.fromisoformat(p["ts"]).timestamp() / 3600 for p in points]
    values = [p["fill_pct"] for p in points]
    n = len(points)
    mean_t = sum(hours) / n
    mean_v = sum(values) / n

    denominator = sum((t - mean_t) ** 2 for t in hours)
    if denominator == 0:
        return None
    numerator = sum((t - mean_t) * (v - mean_v) for t, v in zip(hours, values))
    return numerator / denominator


def _risk_level(hours_to_critical: float | None) -> RiskLevel:
    if hours_to_critical is None:
        return "low"
    if hours_to_critical <= 12:
        return "high"
    if hours_to_critical <= 48:
        return "medium"
    return "low"


@router.get("", response_model=list[ForecastPoint])
def get_forecast() -> list[ForecastPoint]:
    settings = get_settings()
    out: list[ForecastPoint] = []

    for device_id in sorted(DEVICE_REGISTRY):
        info = device_info(device_id)
        points = db.history(device_id, settings.max_history_points)
        current = points[-1]["fill_pct"] if points else None
        slope = _linear_slope(points)

        hours_to_critical: float | None = None
        if slope is not None and slope > 0 and current is not None:
            remaining_pct = settings.fill_critical_pct - current
            hours_to_critical = max(remaining_pct / slope, 0.0) if remaining_pct > 0 else 0.0

        out.append(
            ForecastPoint(
                binId=device_id,
                label=info.label,
                predictedFullInHours=(
                    round(hours_to_critical, 1) if hours_to_critical is not None else None
                ),
                riskLevel=_risk_level(hours_to_critical),
                source="heuristic",
            )
        )

    return out
