"""Generates plausible fill-level readings for every device in
DEVICE_REGISTRY and feeds them through the exact same path a real
firmware POST would use (app/telemetry.record_reading). This is a
bridge, not a permanent feature: it lets the backend go live on the city
broker — and start earning uptime score — before firmware is ready.
It stands down per device automatically while real firmware is posting
for that device (see telemetry.has_live_hardware), so bins without
hardware keep looking alive on the city board. MOCK_TELEMETRY_ENABLED=false
turns it off entirely.

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
import math
import random
import threading
from typing import Any

from app import telemetry
from app.config import DEVICE_REGISTRY, Settings, get_settings

logger = logging.getLogger("mock_generator")

BIN_DEPTH_CM = 60.0
OVERFLOW_THRESHOLD_PCT = 95.0

# Gas baseline sits well under the GAS_THRESHOLD in the firmware (800) with
# an occasional spike above it, so a hazard alert fires sometimes without
# the demo being gas-alert-every-tick noisy.
GAS_BASELINE_RANGE = (150, 400)
GAS_SPIKE_CHANCE = 0.03
GAS_SPIKE_RANGE = (850, 1000)

# PIR events in a ~10s window, Poisson-distributed around a per-bin mean
# (a busy corner vs a quiet one). 0 is realistic — no one's near the bin
# right now — and a burst can cross TRAFFIC_THRESHOLD (5).
PEOPLE_COUNT_MEAN = {"bin-01": 2.0, "bin-02": 3.5, "bin-03": 1.5}
DEFAULT_PEOPLE_COUNT_MEAN = 2.0

# Fill gained per tick = a small constant + FILL_PER_VISIT_PCT per visit,
# where visits = count scaled from the firmware's 10s window up to the tick
# (the same scaling machine_learning/model.py undoes). Fill depends on
# footfall, like a real bin, so the forecast model has a relationship to
# learn instead of noise.
BASE_FILL_PER_TICK_PCT = 0.5
FILL_PER_VISIT_PCT = 0.15
PEOPLE_WINDOW_S = 10.0
SENSOR_NOISE_PCT = 0.3

# Rare, like a real tamper/theft attempt should be.
MOVEMENT_ALERT_CHANCE = 0.02

_state: dict[str, dict[str, float]] = {}
_stop_event = threading.Event()
_thread: threading.Thread | None = None


def _poisson(mean: float) -> int:
    """Small Poisson draw (Knuth's method), no numpy needed here."""
    limit, k, p = math.exp(-mean), 0, 1.0
    while True:
        p *= random.random()
        if p <= limit:
            return k
        k += 1


def _initial_state() -> dict[str, float]:
    return {"fill_pct": random.uniform(5, 30), "uptime_s": 0}


def _tick(device_id: str, interval_s: int) -> dict[str, Any]:
    state = _state.setdefault(device_id, _initial_state())
    state["uptime_s"] += interval_s

    people_count = _poisson(PEOPLE_COUNT_MEAN.get(device_id, DEFAULT_PEOPLE_COUNT_MEAN))

    # Fills with footfall, with a chance to "empty" once nearly full —
    # simulates a collection run so the demo doesn't just alarm forever.
    if state["fill_pct"] >= OVERFLOW_THRESHOLD_PCT and random.random() < 0.3:
        state["fill_pct"] = random.uniform(3, 12)
    else:
        visits = people_count * interval_s / PEOPLE_WINDOW_S
        gained = BASE_FILL_PER_TICK_PCT + FILL_PER_VISIT_PCT * visits
        state["fill_pct"] = min(100.0, state["fill_pct"] + gained)

    fill_pct = round(min(max(state["fill_pct"] + random.gauss(0, SENSOR_NOISE_PCT), 0.0), 100.0), 1)
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
        "people_count": people_count,
        "movement_alert": random.random() < MOVEMENT_ALERT_CHANCE,
    }


def _run(interval_s: int) -> None:
    logger.info("mock telemetry generator started (%ss interval, %d devices)", interval_s, len(DEVICE_REGISTRY))
    while not _stop_event.is_set():
        real = get_settings().real_device_list
        for device_id in DEVICE_REGISTRY:
            if device_id in real:   # REAL_DEVICES: silent hardware must read as offline, never as fake data
                continue
            # Real firmware posting for this bin? Then it owns the bin —
            # no env flag to flip, the mock just stands down until the
            # hardware goes quiet again.
            if telemetry.has_live_hardware(device_id, within_s=interval_s * 3):
                continue
            try:
                metrics = _tick(device_id, interval_s)
                telemetry.record_reading(device_id, metrics, source="mock")
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
