"""Records a device reading (from the local ingest router or the mock
generator) and relays it to the city mainframe. This is the one place
that turns a raw reading into: a stored row, an alert decision, a derived
device mode, and a city publish — so the real ingest path and the mock
path can't drift apart.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app import city_client, db
from app.config import Settings, get_settings
from app.machine_learning import model

logger = logging.getLogger("telemetry")

REQUIRED_METRICS = ("uptime_s", "fill_pct")

# When real firmware last posted for each device (monotonic seconds). The
# mock generator consults this so it steps aside the moment real hardware
# shows up for a device, instead of interleaving fake and real readings.
_last_real_post: dict[str, float] = {}
_real_lock = threading.Lock()


def has_live_hardware(device_id: str, within_s: float) -> bool:
    with _real_lock:
        seen = _last_real_post.get(device_id)
    return seen is not None and time.monotonic() - seen <= within_s


def derive_mode(*, hazard: bool, tamper: bool, fill: str, requested: str | None) -> str:
    """Priority: gas hazard > technician's maintenance switch > tamper or
    critical fill > normal. Maintenance deliberately outranks tamper and
    overflow (a technician lifting the lid and emptying the bin trips both)
    but never a gas hazard, which stays an emergency whoever is standing
    there. The firmware mirrors this for its own LED/OLED."""
    if hazard:
        return "emergency"
    if requested == "maintenance":
        return "maintenance"
    if tamper or fill == "critical":
        return "emergency"
    return "normal"


def fill_status(fill_pct: float, settings: Settings) -> str:
    if fill_pct >= settings.fill_critical_pct:
        return "critical"
    if fill_pct >= settings.fill_warning_pct:
        return "warning"
    return "good"


def gas_alert(gas_raw: int | None, settings: Settings) -> bool:
    return gas_raw is not None and gas_raw >= settings.gas_alert_raw


# How far ahead "no collection needed" is reported as. The city wants a
# number, and a bin that isn't filling (or has no history yet) has no
# honest ETA, so it reads as the cap: "a week or more".
MAX_HOURS_TO_FULL = 168.0
SMOOTHING_READINGS = 5


def smoothed_fill(device_id: str, fallback: float) -> float:
    """Mean of the last few readings (~2.5 min at one per 30 s): one noisy
    echo can't swing what the city sees."""
    recent = db.history(device_id, SMOOTHING_READINGS)
    return sum(p["fill_pct"] for p in recent) / len(recent) if recent else fallback


def hours_to_full(device_id: str, settings: Settings) -> float:
    """Forecast hours until the bin reaches the collection threshold, from
    the same Bayesian model the Insights page uses. 0 once it's there."""
    result = model.predict(db.history(device_id, settings.forecast_history_points), settings.fill_critical_pct)
    if result["status"] == "at_threshold":
        return 0.0
    if result["status"] == "ok" and result.get("hours") is not None:
        return min(float(result["hours"]), MAX_HOURS_TO_FULL)
    return MAX_HOURS_TO_FULL   # not_filling / not_enough_data


# Collection priority: the worse of "how full" and "how soon". A bin forecast
# to hit the threshold within this many hours starts to outrank its raw fill.
PRIORITY_HORIZON_H = 24.0
SAFETY_ALERT_TYPES = ("hazard", "tamper")
SAFETY_WINDOW_H = 24


def collection_priority(fill_pct: float, eta_hours: float) -> float:
    """0–100: how urgently a truck is needed. Takes the worse of the bin's
    fill level and the time pressure from the forecast (0% with a day or
    more to spare, rising linearly to 100% when it's due now). A bin at
    40% that is filling fast can therefore outrank one sitting at 60%."""
    time_pressure = 100.0 * max(0.0, 1.0 - eta_hours / PRIORITY_HORIZON_H)
    return max(fill_pct, time_pressure)


def select_city_metrics(device_id: str, metrics: dict[str, Any]) -> dict[str, float]:
    """What the city mainframe sees. The protocol wants uptime_s plus three
    numeric metrics, prioritized by impact — and nothing requires them to
    be raw sensor values. A single ultrasonic echo or an uncalibrated gas
    ADC count means little to a municipality, so the device posts raw
    readings to us (they power our own dashboard, alerts and forecast) and
    we publish three derived, decision-oriented metrics instead:

      collection_priority_pct  how urgently the bin needs collecting (0–100):
                               worse of smoothed fill and forecast time
                               pressure — see collection_priority()
      hours_to_full_h          when, from the forecast model: 0 = due now,
                               168 = a week or more (also when there isn't
                               enough history yet)
      safety_incidents_24h_n   gas hazards + tamper events on this bin in the
                               last 24 h — the gas and movement sensors as a
                               count of incidents, not an ADC value

    No boolean goes in this dict (the brief requires numeric-only values),
    and the same keys are always sent so the city board sees a stable shape
    whichever sensors reported this tick. Instantaneous emergencies still
    reach the city through the retained status `mode`.
    """
    settings = get_settings()
    fill = float(metrics["fill_pct"])
    try:
        fill = smoothed_fill(device_id, fill)
        eta = hours_to_full(device_id, settings)
    except Exception:
        # A modelling hiccup must never stop telemetry reaching the city.
        logger.exception("could not derive city metrics for %s, sending defaults", device_id)
        eta = MAX_HOURS_TO_FULL if fill < settings.fill_critical_pct else 0.0

    since = (datetime.now(timezone.utc) - timedelta(hours=SAFETY_WINDOW_H)).isoformat()
    return {
        "uptime_s": int(metrics["uptime_s"]),
        "collection_priority_pct": round(min(collection_priority(fill, eta), 100.0), 1),
        "hours_to_full_h": round(eta, 1),
        "safety_incidents_24h_n": db.count_alerts_since(device_id, SAFETY_ALERT_TYPES, since),
    }


def record_reading(device_id: str, metrics: dict[str, Any], source: str = "device") -> None:
    settings = get_settings()
    missing = [field for field in REQUIRED_METRICS if field not in metrics]
    if missing:
        raise ValueError(f"missing required metrics: {', '.join(missing)}")

    if source == "device":
        with _real_lock:
            _last_real_post[device_id] = time.monotonic()

    db.insert_reading(device_id, metrics)

    fill = fill_status(float(metrics["fill_pct"]), settings)
    hazard = gas_alert(metrics.get("gas_raw"), settings)
    tamper = bool(metrics.get("movement_alert"))
    in_maintenance = metrics.get("mode") == "maintenance"

    # A bin in maintenance is being serviced on purpose, so the lid moving
    # or the bin being emptied isn't news; a gas hazard always is.
    if fill == "critical" and not in_maintenance and not db.recent_alert_exists(device_id, "overflow"):
        db.insert_alert(
            device_id, "overflow", f"Bin {device_id} is {metrics['fill_pct']:.0f}% full — needs collection"
        )
    if hazard and not db.recent_alert_exists(device_id, "hazard"):
        db.insert_alert(device_id, "hazard", f"Bin {device_id} gas reading at {metrics['gas_raw']} — possible hazard")
    if tamper and not in_maintenance and not db.recent_alert_exists(device_id, "tamper"):
        db.insert_alert(device_id, "tamper", f"Bin {device_id} unusual movement detected — possible tamper/theft")

    # Mode priority mirrors the firmware's own OLED/LED priority order (see
    # the file header comment in OctocoEsp32Project.ino) so a bin's physical
    # display and its dashboard/city state never disagree about what's most
    # urgent.
    new_mode = derive_mode(hazard=hazard, tamper=tamper, fill=fill, requested=metrics.get("mode"))

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
