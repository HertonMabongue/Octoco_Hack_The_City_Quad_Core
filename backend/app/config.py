"""Application settings, sourced from environment variables / .env."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ — computed from this file's own location, not the process's
# current working directory. DB_PATH/UPLOAD_DIR default off this, so they
# land in the same place whether uvicorn is launched from the repo root
# or from inside backend/ itself (a relative "backend/data.sqlite3"
# default would otherwise resolve to backend/backend/data.sqlite3 in the
# latter case — this bit us for real, twice).
BACKEND_DIR = Path(__file__).resolve().parent.parent


class DeviceInfo(BaseModel):
    label: str
    lat: float
    lng: float


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # City mainframe MQTT broker
    broker_host: str = "192.168.101.123"
    broker_port: int = 1883
    broker_username: str = ""
    broker_password: str = ""
    team_id: str = "kmm4v"

    # HTTP fallback used by devices when the MQTT broker is unreachable.
    # Exposed under /api/v1 so firmware can POST here if it can't dial MQTT.
    city_http_host: str = "192.168.101.123"
    city_http_port: int = 8000

    # Storage — absolute, cwd-independent defaults (see BACKEND_DIR above).
    # Override via .env if you actually want a different location.
    db_path: str = str(BACKEND_DIR / "data.sqlite3")
    upload_dir: str = str(BACKEND_DIR / "uploads")

    # Bin fill-level thresholds (percent full), mirrored on the frontend
    # in lib/constants.ts so both sides agree on what "critical" means.
    fill_warning_pct: float = 60.0
    fill_critical_pct: float = 85.0

    # Raw ADC alert threshold for the gas sensor — mirrors GAS_THRESHOLD in
    # firmware/src/OctocoEsp32Project.ino. Not a calibrated ppm value, same
    # caveat as the firmware comment: a prototype alert level based on the
    # raw electrical reading.
    gas_alert_raw: int = 800

    # PIR traffic events per ~10s window considered "high" — mirrors
    # TRAFFIC_THRESHOLD in the same firmware file. Display-only; doesn't
    # drive mode/alerts.
    traffic_high_count: int = 5

    max_history_points: int = 50

    # How many of a bin's latest readings the forecast model (see
    # machine_learning/model.py) is fitted on. Longer than the chart
    # history above: a real bin fills slowly, and 50 readings (~25 min at
    # one per 30s) is too short a window to see a trend in it.
    forecast_history_points: int = 240

    # Browser origins allowed to call this API (comma-separated). The Vercel
    # frontend's own server-side calls aren't browsers, so CORS only matters
    # for the browser-direct calls: bins on the community page and photo
    # report uploads. The regex also admits Vercel preview deployments.
    cors_origins: str = "https://streetwise-app.vercel.app,http://localhost:3000"
    cors_origin_regex: str = r"https://streetwise-app(-[a-z0-9-]+)?\.vercel\.app"

    # Data retention (see app/retention.py and docs/DATA_PROTECTION.md).
    # A resident's photo is only needed until the municipality has dealt
    # with the report, so it is deleted shortly after resolution, with a
    # hard cap for reports nobody ever resolves. The report row itself
    # (rounded location, waste type, timestamps — no photo, no note) is
    # kept longer as anonymous analytics, then deleted too.
    photo_retention_resolved_hours: int = 24
    photo_retention_open_days: int = 30
    report_retention_days: int = 365
    readings_retention_days: int = 90
    alert_retention_days: int = 365
    retention_sweep_minutes: int = 60

    # Public report endpoint abuse limit, per client IP, held in memory only
    # (never written to disk or the database).
    report_rate_limit: int = 5
    report_rate_window_s: int = 600

    # Reported coordinates are rounded to this many decimal places (4 ≈ 11 m):
    # precise enough to cluster litter hotspots, too coarse to pinpoint a
    # reporter's home.
    coord_decimals: int = 4

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # Mock telemetry — generates plausible readings for every device in
    # DEVICE_REGISTRY and feeds them through the same path a real firmware
    # POST would use, so the city broker shows us online today. Turn off
    # (MOCK_TELEMETRY_ENABLED=false) once real firmware is posting — running
    # both at once for the same device IDs will interleave fake and real
    # readings.
    mock_telemetry_enabled: bool = True
    mock_interval_s: int = 30

    # Seed made-up littering reports (labelled "[simulated]" on the map) at
    # startup if none exist yet, so the hotspot map has clusters to show
    # before residents have sent any. Remove them with
    # `python -m app.machine_learning.seed_reports --clear`, and set this
    # false so they aren't re-added.
    seed_demo_reports: bool = True

    # If a device hasn't posted a reading in this long, we stop telling the
    # city it's online (publishes a retained offline status) — otherwise a
    # dead device/mock looks perpetually "online" on the city dashboard.
    offline_after_s: int = 90


# Known bin devices and where they sit along the corridor. Telemetry only
# carries a device slug + sensor metrics, not a label or coordinates, so
# we keep that mapping here. Add an entry whenever a new sensor node goes
# into the field.
DEVICE_REGISTRY: dict[str, DeviceInfo] = {
    "bin-01": DeviceInfo(label="Van der Stel St bin", lat=-33.9346, lng=18.8653),
    "bin-02": DeviceInfo(label="University Ave bin", lat=-33.9337, lng=18.8661),
    "bin-03": DeviceInfo(label="Bergkelder corner bin", lat=-33.9358, lng=18.8632),
}


def device_info(device_id: str) -> DeviceInfo:
    return DEVICE_REGISTRY.get(
        device_id,
        DeviceInfo(label=device_id, lat=-33.9346, lng=18.8653),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
