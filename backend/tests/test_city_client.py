"""The city link must never stall the caller — the firmware's POST is
waiting on it, and gives up after 5 s."""
from __future__ import annotations

import threading

from app import city_client
from app.config import get_settings


def test_publishing_never_blocks_even_when_the_city_is_unreachable(monkeypatch):
    # Nothing listens on port 1: MQTT refuses fast, so both the MQTT path
    # and the HTTP fallback are exercised without waiting on a real network.
    monkeypatch.setenv("BROKER_HOST", "127.0.0.1")
    monkeypatch.setenv("BROKER_PORT", "1")
    monkeypatch.setenv("CITY_HTTP_HOST", "127.0.0.1")
    monkeypatch.setenv("CITY_HTTP_PORT", "1")
    get_settings.cache_clear()

    def publish():
        city_client.publish_telemetry("bin-01", {"uptime_s": 1, "fill_pct": 10.0})
        city_client.publish_status("bin-01", "online", "normal")

    worker = threading.Thread(target=publish, daemon=True)
    worker.start()
    worker.join(timeout=3)
    try:
        # Regression: _get_client held a plain Lock while _set_state took it
        # again, so the first publish for any device deadlocked forever.
        assert not worker.is_alive(), "publish blocked"
    finally:
        city_client.shutdown()
        get_settings.cache_clear()
