"""Pydantic request/response models. Field aliases are camelCase to match
the frontend's TypeScript types in frontend/lib/types.ts — keep the two in
sync when either side changes.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BinStatus = Literal["good", "warning", "critical"]
DeviceMode = Literal["normal", "maintenance", "emergency"]
DeviceConnection = Literal["online", "offline"]


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class Bin(CamelModel):
    id: str
    label: str
    lat: float
    lng: float
    fill_pct: float = Field(alias="fillPct")
    status: BinStatus
    mode: DeviceMode
    connection: DeviceConnection
    last_updated: str = Field(alias="lastUpdated")
    distance_cm: float | None = Field(default=None, alias="distanceCm")
    overflow_flag: bool | None = Field(default=None, alias="overflowFlag")
    uptime_s: int | None = Field(default=None, alias="uptimeS")
    # The other three independent sensor subsystems (see
    # firmware/src/OctocoEsp32Project.ino) — each optional since a bin
    # reports whichever of its four subsystems are actually fitted/working.
    gas_raw: int | None = Field(default=None, alias="gasRaw")
    people_count: int | None = Field(default=None, alias="peopleCount")
    movement_alert: bool | None = Field(default=None, alias="movementAlert")


class BinHistoryPoint(CamelModel):
    timestamp: str
    fill_pct: float = Field(alias="fillPct")


class Alert(CamelModel):
    id: str
    bin_id: str = Field(alias="binId")
    type: Literal["overflow", "littering", "offline", "hazard", "tamper"]
    message: str
    created_at: str = Field(alias="createdAt")
    resolved: bool = False


class ReportResult(CamelModel):
    id: str
    status: Literal["queued", "received"]
