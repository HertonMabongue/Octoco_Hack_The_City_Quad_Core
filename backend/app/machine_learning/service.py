"""Standalone forecast API for the machine learning layer.

Runs next to the main backend as its own small FastAPI app, so it adds
the model without changing any existing file. It reads the readings the
main backend stores and serves:

    GET /forecast                               one row per bin
    GET /forecast/placement?visitsPerHour=120   bin-placement estimate
    GET /health

Run from the repo root (main backend on :8000, this on :8001):

    python -m uvicorn app.machine_learning.service:app --app-dir backend --port 8001

Rows from /forecast use the same field names as the main backend's
/api/forecast (binId, label, predictedFullInHours, riskLevel, source),
plus the model's range and what it learned.
"""
from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import DEVICE_REGISTRY, device_info, get_settings
from app.machine_learning import data, model

app = FastAPI(title="Clean Corridor: fill forecast (machine learning layer)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

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


@app.get("/forecast", response_model=list[BinForecast])
def get_forecast() -> list[BinForecast]:
    settings = get_settings()
    out: list[BinForecast] = []
    for device_id in sorted(DEVICE_REGISTRY):
        points = data.history_with_traffic(device_id, settings.max_history_points)
        result = model.predict(points, settings.fill_critical_pct)
        hours = result.get("hours")
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
