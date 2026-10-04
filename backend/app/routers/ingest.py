"""Local ingest endpoint for firmware. Firmware does NOT talk to the city
broker directly — over flaky event wifi on a battery-powered device, a
simple HTTP POST is much easier to keep stable than a persistent MQTT
connection. It posts raw readings here (over wifi, via the ngrok URL in
.env), and app/telemetry.py takes it from there (stores it, evaluates
alerts, and republishes to the city mainframe via app/city_client.py).

This is intentionally separate from the city's own HTTP fallback
(POST http://<city-host>:8000/api/v1/teams/{team}/devices/{device}/telemetry)
documented in the README — that one is the city's endpoint, not ours.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import telemetry
from app.config import DEVICE_REGISTRY

router = APIRouter(prefix="/api/devices", tags=["ingest"])


class ReadingIn(BaseModel):
    uptime_s: int = Field(ge=0)
    fill_pct: float = Field(ge=0, le=100)
    distance_cm: float | None = None
    overflow_flag: bool | None = None
    # The other three independent subsystems in
    # firmware/src/OctocoEsp32Project.ino — each optional because the
    # firmware itself treats them as independent (e.g. movement detection
    # disables itself if no accelerometer is found, nothing else blocks).
    gas_raw: int | None = Field(default=None, ge=0)
    people_count: int | None = Field(default=None, ge=0)
    movement_alert: bool | None = None
    # What the device's own mode switch says. Only "maintenance" is taken
    # at face value (a technician toggled it on the bin); normal/emergency
    # are derived from the readings in telemetry.derive_mode.
    mode: Literal["normal", "maintenance", "emergency"] | None = None


@router.post("/{device_id}/readings", status_code=202)
def post_reading(device_id: str, reading: ReadingIn) -> dict[str, str]:
    if device_id not in DEVICE_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown device '{device_id}' — add it to DEVICE_REGISTRY in app/config.py first",
        )

    telemetry.record_reading(device_id, reading.model_dump(exclude_none=True), source="device")
    return {"status": "accepted"}
