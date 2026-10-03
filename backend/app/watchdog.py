"""Periodically marks devices offline (locally + to the city, via
app/telemetry.sweep_offline_devices) once they've stopped reporting.
Runs regardless of whether readings are coming from real firmware or the
mock generator — either can go silent without a clean MQTT disconnect.
"""
from __future__ import annotations

import logging
import threading

from app import telemetry
from app.config import Settings

logger = logging.getLogger("watchdog")

_stop_event = threading.Event()
_thread: threading.Thread | None = None


def _run(interval_s: int) -> None:
    while not _stop_event.is_set():
        try:
            telemetry.sweep_offline_devices()
        except Exception:
            logger.exception("offline sweep failed")
        _stop_event.wait(interval_s)


def start(settings: Settings) -> None:
    global _thread
    _stop_event.clear()
    _thread = threading.Thread(target=_run, args=(settings.mock_interval_s,), daemon=True)
    _thread.start()


def stop() -> None:
    _stop_event.set()
    if _thread is not None:
        _thread.join(timeout=5)
