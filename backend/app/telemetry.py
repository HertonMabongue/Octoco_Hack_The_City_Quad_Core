"""Records a device reading (from the local ingest router or the mock
generator) and relays it to the city mainframe. This is the one place
that turns a raw reading into: a stored row, an alert decision, a derived
device mode, and a city publish — so the real ingest path and the mock
path can't drift apart.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app import city_client, db
from app.config import Settings, get_settings

logger = logging.getLogger("telemetry")

REQUIRED_METRICS = ("uptime_s", "fill_pct")


def fill_status(fill_pct: float, settings: Settings) -> str:
    if fill_pct >= settings.fill_critical_pct:
        return "critical"
    if fill_pct >= settings.fill_warning_pct:
        return "warning"
    return "good"


def record_reading(device_id: str, metrics: dict[str, Any]) -> None:
    settings = get_settings()
    missing = [field for field in REQUIRED_METRICS if field not in metrics]
    if missing:
        raise ValueError(f"missing required metrics: {', '.join(missing)}")

    db.insert_reading(device_id, metrics)

    status = fill_status(float(metrics["fill_pct"]), settings)
    if status == "critical" and not db.recent_alert_exists(device_id, "overflow"):
        db.insert_alert(
            device_id, "overflow", f"Bin {device_id} is {metrics['fill_pct']:.0f}% full — needs collection"
        )

    new_mode = "emergency" if status == "critical" else "normal"
    prev_connection, prev_mode = db.get_device_status(device_id)

    db.upsert_device_status(device_id, "online", new_mode)
    city_client.publish_telemetry(device_id, metrics)

    # Status is retained on the city broker, so we only need to republish
    # it on a real change (initial handshake or a mode toggle) rather than
    # every 30s alongside telemetry.
    if prev_connection != "online" or prev_mode != new_mode:
        city_client.publish_status(device_id, "online", new_mode)


def sweep_offline_devices() -> None:
    """Mark devices offline (locally + to the city) once they've stopped
    reporting for longer than `offline_after_s`. Without this, a device
    that silently dies (mock stopped, firmware crashed, wifi dropped
    without a clean MQTT disconnect) keeps showing "online" on the city's
    retained status forever.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)

    for device_id in db.list_online_device_ids():
        reading = db.latest_reading(device_id)
        if reading is None:
            continue

        age_s = (now - datetime.fromisoformat(reading["ts"])).total_seconds()
        if age_s <= settings.offline_after_s:
            continue

        _, mode = db.get_device_status(device_id)
        db.upsert_device_status(device_id, "offline", mode)
        city_client.publish_status(device_id, "offline", mode)
        if not db.recent_alert_exists(device_id, "offline"):
            db.insert_alert(device_id, "offline", f"Bin {device_id} stopped reporting ({int(age_s)}s)")
        logger.info("marked %s offline after %ds without a reading", device_id, int(age_s))
