"""Bin status endpoints for the municipal dashboard and the community app."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import db
from app.config import DEVICE_REGISTRY, device_info, get_settings
from app.models import Bin, BinHistoryPoint
from app.telemetry import fill_status

router = APIRouter(prefix="/api/bins", tags=["bins"])


def _to_bin(device_id: str, reading: dict | None) -> Bin:
    settings = get_settings()
    info = device_info(device_id)
    connection, mode = db.get_device_status(device_id)

    if reading is None:
        return Bin(
            id=device_id,
            label=info.label,
            lat=info.lat,
            lng=info.lng,
            fillPct=0,
            status="good",
            mode=mode,
            connection=connection,
            lastUpdated=db.utc_now(),
        )

    pct = float(reading["fill_pct"])
    return Bin(
        id=device_id,
        label=info.label,
        lat=info.lat,
        lng=info.lng,
        fillPct=pct,
        status=fill_status(pct, settings),
        mode=mode,
        connection=connection,
        lastUpdated=reading["ts"],
        distanceCm=reading.get("distance_cm"),
        overflowFlag=reading.get("overflow_flag"),
        uptimeS=reading.get("uptime_s"),
    )


@router.get("", response_model=list[Bin])
def list_bins() -> list[Bin]:
    latest = {row["device_id"]: row for row in db.latest_reading_by_device()}
    device_ids = set(DEVICE_REGISTRY) | set(latest)
    return [_to_bin(device_id, latest.get(device_id)) for device_id in sorted(device_ids)]


@router.get("/{bin_id}", response_model=Bin)
def get_bin(bin_id: str) -> Bin:
    reading = db.latest_reading(bin_id)
    if reading is None and bin_id not in DEVICE_REGISTRY:
        raise HTTPException(status_code=404, detail="Bin not found")
    return _to_bin(bin_id, reading)


@router.get("/{bin_id}/history", response_model=list[BinHistoryPoint])
def get_bin_history(
    bin_id: str, limit: int = Query(default=None, ge=1, le=500)
) -> list[BinHistoryPoint]:
    settings = get_settings()
    rows = db.history(bin_id, limit or settings.max_history_points)
    return [BinHistoryPoint(timestamp=row["ts"], fillPct=row["fill_pct"]) for row in rows]
