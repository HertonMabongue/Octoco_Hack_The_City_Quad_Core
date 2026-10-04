"""Per-bin collection forecast for the municipal dashboard's Insights page.

Fits machine_learning/model.py (a Bayesian regression of fill gained
against time and visits) to each bin's stored readings, so it works the
same on real sensor data as on the mock generator's. Each row carries the
readings it was made from, so the dashboard can chart them without a
second request.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app import db
from app.config import DEVICE_REGISTRY, device_info, get_settings
from app.machine_learning import model
from app.models import ForecastHistoryPoint, ForecastPoint, PlacementEstimate

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


@router.get("", response_model=list[ForecastPoint])
def get_forecast() -> list[ForecastPoint]:
    settings = get_settings()
    out: list[ForecastPoint] = []

    for device_id in sorted(DEVICE_REGISTRY):
        points = db.history(device_id, settings.forecast_history_points)
        result = model.predict(points, settings.fill_critical_pct)
        hours = result.get("hours")
        out.append(
            ForecastPoint(
                binId=device_id,
                label=device_info(device_id).label,
                status=result["status"],
                predictedFullInHours=_round(hours),
                predictedLowHours=_round(result.get("hours_low")),
                predictedHighHours=_round(result.get("hours_high")),
                fillPerVisitPct=_round(result.get("fill_per_visit_pct"), 3),
                visitsPerHour=_round(result.get("visits_per_hour"), 1),
                lastReadingAt=points[-1]["ts"] if points else None,
                history=[ForecastHistoryPoint(ts=p["ts"], fillPct=p["fill_pct"]) for p in points],
            )
        )

    return out


@router.get("/placement", response_model=PlacementEstimate)
def get_placement_estimate(
    visits_per_hour: float = Query(alias="visitsPerHour", ge=0),
) -> PlacementEstimate:
    """Bin placement: how fast would an empty bin fill at a spot with this
    footfall? Pools every monitored bin's readings into one fit."""
    settings = get_settings()
    histories = [db.history(device_id, settings.forecast_history_points) for device_id in DEVICE_REGISTRY]
    result = model.estimate_for_footfall(histories, visits_per_hour, settings.fill_critical_pct)
    return PlacementEstimate(
        status=result["status"],
        visitsPerHour=visits_per_hour,
        fillPctPerHour=_round(result.get("rate_pct_per_hour")),
        fillPerVisitPct=_round(result.get("fill_per_visit_pct"), 3),
        hoursToThreshold=_round(result.get("hours")),
        hoursLow=_round(result.get("hours_low")),
        hoursHigh=_round(result.get("hours_high")),
    )
