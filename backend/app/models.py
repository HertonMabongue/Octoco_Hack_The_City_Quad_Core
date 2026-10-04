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
    """Outcome of a community photo report. "rejected" means the photo
    classifier found no waste in it, so nothing was stored."""

    id: str
    status: Literal["queued", "received", "rejected"]
    waste_type: str | None = Field(default=None, alias="wasteType")
    waste_label: str | None = Field(default=None, alias="wasteLabel")
    confidence: float | None = None
    message: str | None = None


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
    waste_label: str | None = Field(default=None, alias="wasteLabel")


ForecastStatus = Literal["ok", "at_threshold", "not_filling", "not_enough_data"]
HotspotAction = Literal["add_bin", "more_staff", "cleanup_crew"]


class ForecastHistoryPoint(CamelModel):
    ts: str
    fill_pct: float = Field(alias="fillPct")


class ForecastPoint(CamelModel):
    """One bin's time-to-collection forecast from machine_learning/model.py,
    plus the readings it was made from so the dashboard can chart them.

    The three `predicted*Hours` values are the model's median and 80%
    range, counted from `lastReadingAt`. They are only set when `status`
    is "ok" (or 0 for "at_threshold").
    """

    bin_id: str = Field(alias="binId")
    label: str
    status: ForecastStatus
    predicted_full_in_hours: float | None = Field(default=None, alias="predictedFullInHours")
    predicted_low_hours: float | None = Field(default=None, alias="predictedLowHours")
    predicted_high_hours: float | None = Field(default=None, alias="predictedHighHours")
    fill_per_visit_pct: float | None = Field(default=None, alias="fillPerVisitPct")
    visits_per_hour: float | None = Field(default=None, alias="visitsPerHour")
    last_reading_at: str | None = Field(default=None, alias="lastReadingAt")
    history: list[ForecastHistoryPoint]


class PlacementEstimate(CamelModel):
    """How fast a new bin would fill at a spot with a given footfall."""

    status: Literal["ok", "not_filling", "not_enough_data"]
    visits_per_hour: float = Field(alias="visitsPerHour")
    fill_pct_per_hour: float | None = Field(default=None, alias="fillPctPerHour")
    fill_per_visit_pct: float | None = Field(default=None, alias="fillPerVisitPct")
    hours_to_threshold: float | None = Field(default=None, alias="hoursToThreshold")
    hours_low: float | None = Field(default=None, alias="hoursLow")
    hours_high: float | None = Field(default=None, alias="hoursHigh")


class HotspotReport(CamelModel):
    id: str
    lat: float
    lng: float
    type: str
    type_label: str = Field(alias="typeLabel")
    confidence: float | None = None
    created_at: str = Field(alias="createdAt")
    hotspot: str | None = None
    simulated: bool = False


class Hotspot(CamelModel):
    """A cluster of nearby littering reports and what the city should do."""

    id: str
    lat: float
    lng: float
    count: int
    dominant_label: str = Field(alias="dominantLabel")
    recyclable_share: float = Field(alias="recyclableShare")
    action: HotspotAction
    title: str
    reason: str


class HotspotSummary(CamelModel):
    reports: int
    hotspots: int
    add_bin: int = Field(alias="addBin")
    more_staff: int = Field(alias="moreStaff")
    cleanup_crew: int = Field(alias="cleanupCrew")


class HotspotsResponse(CamelModel):
    classifier_installed: bool = Field(alias="classifierInstalled")
    summary: HotspotSummary
    hotspots: list[Hotspot]
    reports: list[HotspotReport]
