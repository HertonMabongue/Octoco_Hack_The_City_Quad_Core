"""Standalone forecast API for the machine learning layer.

Runs next to the main backend as its own small FastAPI app, so it adds
the model without changing any existing file. It reads the readings the
main backend stores and serves:

    GET /forecast                               one row per bin
    GET /forecast?leadHours=0.1                 same, with a custom alert lead time
    GET /forecast/placement?visitsPerHour=120   bin-placement estimate
    GET /health

Run from the repo root (main backend on :8000, this on :8001):

    python -m uvicorn app.machine_learning.service:app --app-dir backend --port 8001

Rows from /forecast use the same field names as the main backend's
/api/forecast (binId, label, predictedFullInHours, riskLevel, source),
plus the model's range, what it learned, and when to collect:
predictedFullAt / earliestFullAt are clock times, and collectSoon is true
when the earliest plausible time is within the lead time (default 2 h,
or the ML_COLLECT_LEAD_HOURS environment variable).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Literal

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import DEVICE_REGISTRY, device_info, get_settings
from app.machine_learning import data, model

app = FastAPI(title="Clean Corridor: fill forecast (machine learning layer)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

# How far ahead "collect soon" looks. Real bins fill over hours, so the
# default is 2 h; the mock bins fill in minutes, so use a few minutes
# (for example ML_COLLECT_LEAD_HOURS=0.1) when demoing on mock data.
DEFAULT_LEAD_HOURS = float(os.environ.get("ML_COLLECT_LEAD_HOURS", "2.0"))

RiskLevel = Literal["low", "medium", "high"]
ModelStatus = Literal["ok", "at_threshold", "not_filling", "not_enough_data"]


class BinForecast(BaseModel):
    binId: str
    label: str
    status: ModelStatus
    predictedFullInHours: float | None = None
    predictedLowHours: float | None = None
    predictedHighHours: float | None = None
    riskLevel: RiskLevel
    source: Literal["model"] = "model"
    fillPerVisitPct: float | None = None
    visitsPerHour: float | None = None
    # Clock times (ISO, same timezone as the readings) for scheduling.
    # earliestFullAt is the low end of the range: plan collection by then.
    predictedFullAt: str | None = None
    earliestFullAt: str | None = None
    collectSoon: bool = False
    lastReadingAt: str | None = None


class PlacementEstimate(BaseModel):
    status: Literal["ok", "not_filling", "not_enough_data"]
    visitsPerHour: float
    fillPctPerHour: float | None = None
    fillPerVisitPct: float | None = None
    hoursToThreshold: float | None = None
    hoursLow: float | None = None
    hoursHigh: float | None = None


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


def _risk_level(hours: float | None) -> RiskLevel:
    # Same bands as the main backend's routers/forecast.py.
    if hours is None:
        return "low"
    if hours <= 12:
        return "high"
    if hours <= 48:
        return "medium"
    return "low"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _clock_time(last_reading_at: str | None, hours: float | None) -> str | None:
    """The forecast runs from the bin's latest reading, so the clock time
    is that reading's timestamp plus the forecast hours."""
    if last_reading_at is None or hours is None:
        return None
    return (datetime.fromisoformat(last_reading_at) + timedelta(hours=hours)).isoformat()


@app.get("/forecast", response_model=list[BinForecast])
def get_forecast(
    lead_hours: float = Query(DEFAULT_LEAD_HOURS, alias="leadHours", ge=0),
) -> list[BinForecast]:
    settings = get_settings()
    out: list[BinForecast] = []
    for device_id in sorted(DEVICE_REGISTRY):
        points = data.history_with_traffic(device_id, settings.max_history_points)
        result = model.predict(points, settings.fill_critical_pct)
        hours = result.get("hours")
        hours_low = result.get("hours_low")
        last_reading_at = points[-1]["ts"] if points else None
        out.append(
            BinForecast(
                binId=device_id,
                label=device_info(device_id).label,
                status=result["status"],
                predictedFullInHours=_round(hours),
                predictedLowHours=_round(result.get("hours_low")),
                predictedHighHours=_round(result.get("hours_high")),
                riskLevel=_risk_level(hours),
                fillPerVisitPct=_round(result.get("fill_per_visit_pct"), 3),
                visitsPerHour=_round(result.get("visits_per_hour"), 1),
                predictedFullAt=_clock_time(last_reading_at, hours),
                earliestFullAt=_clock_time(last_reading_at, hours_low),
                # Uses the earliest plausible time, not the median: a
                # truck that's early costs little, a late one is an overflow.
                collectSoon=hours_low is not None and hours_low <= lead_hours,
                lastReadingAt=last_reading_at,
            )
        )
    return out


@app.get("/forecast/placement", response_model=PlacementEstimate)
def get_placement_estimate(
    visits_per_hour: float = Query(..., alias="visitsPerHour", ge=0),
) -> PlacementEstimate:
    settings = get_settings()
    histories = [
        data.history_with_traffic(device_id, settings.max_history_points)
        for device_id in sorted(DEVICE_REGISTRY)
    ]
    result = model.estimate_for_footfall(histories, visits_per_hour, settings.fill_critical_pct)
    return PlacementEstimate(
        status=result["status"],
        visitsPerHour=visits_per_hour,
        fillPctPerHour=_round(result.get("rate_pct_per_hour"), 1),
        fillPerVisitPct=_round(result.get("fill_per_visit_pct"), 3),
        hoursToThreshold=_round(result.get("hours")),
        hoursLow=_round(result.get("hours_low")),
        hoursHigh=_round(result.get("hours_high")),
    )
