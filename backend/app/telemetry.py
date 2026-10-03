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


def gas_alert(gas_raw: int | None, settings: Settings) -> bool:
    return gas_raw is not None and gas_raw >= settings.gas_alert_raw


def select_city_metrics(device_id: str, metrics: dict[str, Any]) -> dict[str, float]:
    """The city protocol wants exactly uptime_s + 3 numeric metrics,
    prioritized by impact. Four independent sensors can report in any
    given reading (see firmware/src/OctocoEsp32Project.ino), so this picks
    the three that matter most rather than forwarding whatever happened to
    arrive: fill level (the core overflow problem), the gas reading
    (safety hazard — highest-impact when present), then traffic (useful
    collection-planning signal). Movement/tamper is deliberately NOT one
    of the three — it already drives `mode` below, which is the channel
    the brief gives for exactly this kind of state change, and it isn't
    numeric in any meaningful unit.

    Booleans never go in this dict — the brief requires numeric-only
    values, and overflow_flag/movement_alert are both booleans. A missing
    optional sensor is reported as 0, not omitted, so the city always sees
    the same 3 keys from this device regardless of which subsystems
    reported this tick.
    """
    return {
        "uptime_s": int(metrics["uptime_s"]),
        "fill_pct": round(float(metrics["fill_pct"]), 1),
        "gas_raw": int(metrics.get("gas_raw") or 0),
        "people_count": int(metrics.get("people_count") or 0),
    }


def record_reading(device_id: str, metrics: dict[str, Any]) -> None:
    settings = get_settings()
    missing = [field for field in REQUIRED_METRICS if field not in metrics]
    if missing:
        raise ValueError(f"missing required metrics: {', '.join(missing)}")

    db.insert_reading(device_id, metrics)

    fill = fill_status(float(metrics["fill_pct"]), settings)
    hazard = gas_alert(metrics.get("gas_raw"), settings)
    tamper = bool(metrics.get("movement_alert"))

    if fill == "critical" and not db.recent_alert_exists(device_id, "overflow"):
        db.insert_alert(
            device_id, "overflow", f"Bin {device_id} is {metrics['fill_pct']:.0f}% full — needs collection"
        )
    if hazard and not db.recent_alert_exists(device_id, "hazard"):
        db.insert_alert(device_id, "hazard", f"Bin {device_id} gas reading at {metrics['gas_raw']} — possible hazard")
    if tamper and not db.recent_alert_exists(device_id, "tamper"):
        db.insert_alert(device_id, "tamper", f"Bin {device_id} unusual movement detected — possible tamper/theft")

    # Mode priority mirrors the firmware's own OLED priority order (see the
    # file header comment in OctocoEsp32Project.ino): gas > movement > bin
    # full > normal. Keeping the two in sync means a bin's physical display
    # and its dashboard/city state never disagree about what's most urgent.
    if hazard or tamper or fill == "critical":
        new_mode = "emergency"
    else:
        new_mode = "normal"

    prev_connection, prev_mode = db.get_device_status(device_id)

    db.upsert_device_status(device_id, "online", new_mode)
    city_client.publish_telemetry(device_id, select_city_metrics(device_id, metrics))

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
