"""Standalone forecast API for the machine learning layer.

Runs next to the main backend as its own small FastAPI app, so it adds
the model without changing any existing file. It reads the readings the
main backend stores and serves:

    GET /forecast                               one row per bin
    GET /forecast?leadHours=0.1                 same, with a custom alert lead time
    GET /forecast/series                        the same rows plus fill history, for charts
    GET /forecast/placement?visitsPerHour=120   bin-placement estimate
    GET /dashboard                              a live forecast chart page (dashboard.html)
    GET /hotspots                               littering reports, hotspots and recommendations
    GET /hotspots/map                           the heatmap page (hotspots.html)
    POST /reports                               photo + location -> waste or not -> pin on the map
    POST /classify                              classify one uploaded photo (to try the model)
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
from pathlib import Path
from typing import Literal

import tempfile

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import DEVICE_REGISTRY, device_info, get_settings
from app.machine_learning import classifier, data, hotspots, model

app = FastAPI(title="Clean Corridor: fill forecast (machine learning layer)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])

HERE = Path(__file__).resolve().parent
# Leaflet and its heatmap plugin are bundled in static/ so the map page
# doesn't depend on a CDN.
app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")

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
    latestFullAt: str | None = None
    collectSoon: bool = False
    lastReadingAt: str | None = None


class HistoryPoint(BaseModel):
    ts: str
    fillPct: float


class BinSeries(BinForecast):
    """A forecast row plus what a chart needs: the readings the forecast
    was made from, and the threshold it is forecasting towards."""

    thresholdPct: float
    history: list[HistoryPoint]


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


def _bin_forecast(device_id: str, lead_hours: float) -> tuple[BinForecast, list[dict]]:
    """One bin's forecast row, and the readings it was made from."""
    settings = get_settings()
    points = data.history_with_traffic(device_id, settings.max_history_points)
    result = model.predict(points, settings.fill_critical_pct)
    hours = result.get("hours")
    hours_low = result.get("hours_low")
    hours_high = result.get("hours_high")
    last_reading_at = points[-1]["ts"] if points else None

    row = BinForecast(
        binId=device_id,
        label=device_info(device_id).label,
        status=result["status"],
        predictedFullInHours=_round(hours),
        predictedLowHours=_round(hours_low),
        predictedHighHours=_round(hours_high),
        riskLevel=_risk_level(hours),
        fillPerVisitPct=_round(result.get("fill_per_visit_pct"), 3),
        visitsPerHour=_round(result.get("visits_per_hour"), 1),
        predictedFullAt=_clock_time(last_reading_at, hours),
        earliestFullAt=_clock_time(last_reading_at, hours_low),
        latestFullAt=_clock_time(last_reading_at, hours_high),
        # Uses the earliest plausible time, not the median: a truck
        # that's early costs little, a late one is an overflow.
        collectSoon=hours_low is not None and hours_low <= lead_hours,
        lastReadingAt=last_reading_at,
    )
    return row, points


@app.get("/forecast", response_model=list[BinForecast])
def get_forecast(
    lead_hours: float = Query(DEFAULT_LEAD_HOURS, alias="leadHours", ge=0),
) -> list[BinForecast]:
    return [_bin_forecast(device_id, lead_hours)[0] for device_id in sorted(DEVICE_REGISTRY)]


@app.get("/forecast/series", response_model=list[BinSeries])
def get_forecast_series(
    lead_hours: float = Query(DEFAULT_LEAD_HOURS, alias="leadHours", ge=0),
) -> list[BinSeries]:
    """Forecast rows with each bin's fill history attached, so a chart
    can draw the readings and the projection from one request."""
    threshold = get_settings().fill_critical_pct
    out: list[BinSeries] = []
    for device_id in sorted(DEVICE_REGISTRY):
        row, points = _bin_forecast(device_id, lead_hours)
        out.append(
            BinSeries(
                **row.model_dump(),
                thresholdPct=threshold,
                history=[HistoryPoint(ts=p["ts"], fillPct=p["fill_pct"]) for p in points],
            )
        )
    return out


@app.get("/dashboard", include_in_schema=False)
@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    """The live forecast chart page. Open it directly, or embed it in the
    main dashboard with an iframe."""
    return FileResponse(HERE / "dashboard.html", media_type="text/html")


# ---------- Littering reports: classification, hotspots, recommendations ----------


@app.get("/hotspots")
def get_hotspots() -> dict:
    """Residents' unresolved reports with a waste type each, the hotspots
    they cluster into, and what the city should do about each hotspot."""
    reports = hotspots.labelled_reports()
    found = hotspots.find_hotspots(reports)
    actions = [h["action"] for h in found]
    return {
        "classifierInstalled": classifier.installed(),
        "summary": {
            "reports": len(reports),
            "hotspots": len(found),
            "addBin": actions.count("add_bin"),
            "moreStaff": actions.count("more_staff"),
            "cleanupCrew": actions.count("cleanup_crew"),
        },
        "hotspots": [
            {
                "id": h["id"],
                "lat": h["lat"],
                "lng": h["lng"],
                "count": h["count"],
                "dominantType": h["dominant_type"],
                "dominantLabel": h["dominant_label"],
                "types": h["types"],
                "recyclableShare": round(h["recyclable_share"], 2),
                "nearestBin": h["nearest_bin"],
                "nearestBinM": _round(h["nearest_bin_m"], 0),
                "latestReport": h["latest_report"],
                "action": h["action"],
                "title": h["title"],
                "reason": h["reason"],
            }
            for h in found
        ],
        "reports": [
            {
                "id": r["id"],
                "lat": r["lat"],
                "lng": r["lng"],
                "type": r["type"],
                "typeLabel": r["type_label"],
                "confidence": _round(r["confidence"]),
                "createdAt": r["created_at"],
                "hotspot": r["hotspot"],
                "simulated": bool(r["note"] and r["note"].startswith("[simulated]")),
                "source": r["label_source"],
            }
            for r in reports
        ],
        "bins": [
            {"id": device_id, "label": info.label, "lat": info.lat, "lng": info.lng}
            for device_id, info in sorted(DEVICE_REGISTRY.items())
        ],
    }


@app.get("/hotspots/map", include_in_schema=False)
def hotspots_map() -> FileResponse:
    return FileResponse(HERE / "hotspots.html", media_type="text/html")


async def _save_upload(photo: UploadFile) -> str:
    suffix = Path(photo.filename or "photo.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await photo.read())
        return tmp.name


@app.post("/reports")
async def submit_report(
    photo: UploadFile = File(...),
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
) -> dict:
    """The whole pipeline for one photo: classify it (waste or not), find
    where it was taken, and pin it on the map if it shows waste.

    Location comes from the photo's own geotag when it has one, otherwise
    from the lat/lng sent with it (the browser's location, or a point the
    person picked on the map). The photo is deleted straight after
    classification: only the waste type and location are kept.
    """
    tmp_path = await _save_upload(photo)
    try:
        result = classifier.classify(tmp_path) if classifier.installed() else None
        geotag = classifier.photo_location(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if geotag is not None:
        lat, lng, location_source = geotag[0], geotag[1], "photo geotag"
    elif lat is not None and lng is not None:
        location_source = "location sent with the photo"
    else:
        raise HTTPException(422, "No location: the photo has no geotag and no lat/lng was sent.")

    if result is not None and not result["is_waste"]:
        return {
            "accepted": False,
            "isWaste": False,
            "typeLabel": result["label"],
            "confidence": round(result["confidence"], 2),
            "message": "No waste found in this photo, so it wasn't added to the map.",
        }

    waste_type = result["type"] if result else "unclassified"
    confidence = result["confidence"] if result else None
    report_id = hotspots.add_report(lat, lng, waste_type, confidence)
    return {
        "accepted": True,
        "id": report_id,
        "isWaste": True if result else None,
        "type": waste_type,
        "typeLabel": hotspots.TYPE_LABELS.get(waste_type, waste_type),
        "confidence": _round(confidence),
        "lat": lat,
        "lng": lng,
        "locationSource": location_source,
        "message": (
            "Added to the map." if result
            else "Added to the map, but not checked: the photo model isn't installed."
        ),
    }


@app.post("/classify")
async def classify_photo(photo: UploadFile = File(...)) -> dict:
    """Classify one uploaded photo. For trying the model out; nothing is stored."""
    if not classifier.installed():
        raise HTTPException(503, "The photo model isn't installed. See requirements-vision.txt.")
    tmp_path = await _save_upload(photo)
    try:
        result = classifier.classify(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    if result is None:
        raise HTTPException(422, classifier.load_error() or "That file couldn't be read as a photo.")
    return {
        "isWaste": result["is_waste"],
        "wasteProbability": round(result["waste_probability"], 2),
        "type": result["type"],
        "label": result["label"],
        "confidence": round(result["confidence"], 2),
        "recyclable": result["recyclable"],
        "scores": {k: round(v, 3) for k, v in sorted(result["scores"].items(), key=lambda kv: -kv[1])},
    }
