"""Application settings, sourced from environment variables / .env."""
from __future__ import annotations

from functools import lru_cache

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Storage
    db_path: str = "backend/data.sqlite3"
    upload_dir: str = "backend/uploads"

    # Bin fill-level thresholds (percent full), mirrored on the frontend
    # in lib/constants.ts so both sides agree on what "critical" means.
    fill_warning_pct: float = 60.0
    fill_critical_pct: float = 85.0

    max_history_points: int = 50

    cors_origins: list[str] = ["*"]


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
