"""Generates plausible fill-level readings for every device in
DEVICE_REGISTRY and feeds them through the exact same path a real
firmware POST would use (app/telemetry.record_reading). This is a
bridge, not a permanent feature: it lets the backend go live on the city
broker — and start earning uptime score — before firmware is ready.
Turn it off (MOCK_TELEMETRY_ENABLED=false) once real firmware is posting
to /api/devices/{id}/readings for the same device IDs, or the two will
interleave.

Assumes a bin depth of ~60cm for the synthesized distance_cm — purely for
a plausible demo number, not a real calibration.

Mirrors all four independent subsystems in
firmware/src/OctocoEsp32Project.ino (fill, gas, traffic, movement), not
just the ultrasonic sensor — so hazard/tamper alerts, emergency mode, and
the dashboard's per-sensor display all have something to show before real
firmware is wired up, instead of looking broken/empty for three of the
four signals.
"""
from __future__ import annotations

import logging
import random
import threading
from typing import Any

from app import telemetry
from app.config import DEVICE_REGISTRY, Settings

logger = logging.getLogger("mock_generator")

BIN_DEPTH_CM = 60.0
OVERFLOW_THRESHOLD_PCT = 95.0

# Gas baseline sits well under the GAS_THRESHOLD in the firmware (800) with
# an occasional spike above it, so a hazard alert fires sometimes without
# the demo being gas-alert-every-tick noisy.
GAS_BASELINE_RANGE = (150, 400)
GAS_SPIKE_CHANCE = 0.03
GAS_SPIKE_RANGE = (850, 1000)

# PIR events in a ~10s window — occasional 0 is realistic (no one's near
# the bin right now), occasional high burst crosses TRAFFIC_THRESHOLD (5).
PEOPLE_COUNT_RANGE = (0, 8)

# Rare, like a real tamper/theft attempt should be.
MOVEMENT_ALERT_CHANCE = 0.02

_state: dict[str, dict[str, float]] = {}
_stop_event = threading.Event()
_thread: threading.Thread | None = None


def _initial_state() -> dict[str, float]:
    return {"fill_pct": random.uniform(5, 30), "uptime_s": 0}


def _tick(device_id: str, interval_s: int) -> dict[str, Any]:
    state = _state.setdefault(device_id, _initial_state())
    state["uptime_s"] += interval_s

    # Random walk upward, with a chance to "empty" once nearly full —
    # simulates a collection run so the demo doesn't just alarm forever.
    if state["fill_pct"] >= OVERFLOW_THRESHOLD_PCT and random.random() < 0.3:
        state["fill_pct"] = random.uniform(3, 12)
    else:
        state["fill_pct"] = min(100.0, state["fill_pct"] + random.uniform(1.0, 4.5))

    fill_pct = round(state["fill_pct"], 1)
    distance_cm = round(BIN_DEPTH_CM * (1 - fill_pct / 100), 1)

    gas_raw = (
        random.randint(*GAS_SPIKE_RANGE)
        if random.random() < GAS_SPIKE_CHANCE
        else random.randint(*GAS_BASELINE_RANGE)
    )

    return {
        "uptime_s": int(state["uptime_s"]),
        "fill_pct": fill_pct,
        "distance_cm": max(distance_cm, 0.0),
        "overflow_flag": fill_pct >= OVERFLOW_THRESHOLD_PCT,
        "gas_raw": gas_raw,
        "people_count": random.randint(*PEOPLE_COUNT_RANGE),
        "movement_alert": random.random() < MOVEMENT_ALERT_CHANCE,
    }


def _run(interval_s: int) -> None:
    logger.info("mock telemetry generator started (%ss interval, %d devices)", interval_s, len(DEVICE_REGISTRY))
    while not _stop_event.is_set():
        for device_id in DEVICE_REGISTRY:
            try:
                metrics = _tick(device_id, interval_s)
                telemetry.record_reading(device_id, metrics)
            except Exception:
                logger.exception("mock tick failed for %s", device_id)
        _stop_event.wait(interval_s)


def start(settings: Settings) -> None:
    global _thread
    if not settings.mock_telemetry_enabled:
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_run, args=(settings.mock_interval_s,), daemon=True)
    _thread.start()


def stop() -> None:
    _stop_event.set()
    if _thread is not None:
        _thread.join(timeout=5)
