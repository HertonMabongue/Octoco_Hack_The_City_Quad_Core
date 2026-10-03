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


class Report(CamelModel):
    """A community littering report, for the municipal dashboard's
    incident log (see routers/reports.py GET + resolve, and
    app/library/ReportsTable on the frontend). Mirrors the `reports`
    table in db.py field-for-field.
    """

    id: str
    lat: float | None = None
    lng: float | None = None
    note: str | None = None
    photo_url: str | None = Field(default=None, alias="photoUrl")
    created_at: str = Field(alias="createdAt")
    resolved: bool = False


RiskLevel = Literal["low", "medium", "high"]
ForecastSource = Literal["heuristic", "model"]


class ForecastPoint(CamelModel):
    """One bin's projected time to needing collection. `source` is
    "heuristic" until app/forecasting/'s real model is trained (see its
    README) — the frontend labels the two differently, but the shape
    never changes, so swapping the implementation in routers/forecast.py
    is the only change the handoff needs.
    """

    bin_id: str = Field(alias="binId")
    label: str
    predicted_full_in_hours: float | None = Field(default=None, alias="predictedFullInHours")
    risk_level: RiskLevel = Field(alias="riskLevel")
    source: ForecastSource = "heuristic"
