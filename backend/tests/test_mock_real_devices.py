from __future__ import annotations

from app import mock_generator, telemetry
from app.config import get_settings


def test_mock_never_covers_a_declared_real_device(client, monkeypatch):
    monkeypatch.setenv("REAL_DEVICES", "bin-01")
    get_settings.cache_clear()
    seen = []
    monkeypatch.setattr(telemetry, "record_reading", lambda device_id, metrics, source="device": seen.append(device_id))
    monkeypatch.setattr(mock_generator._stop_event, "wait", lambda t: mock_generator._stop_event.set())
    mock_generator._stop_event.clear()
    mock_generator._run(30)
    assert "bin-01" not in seen and {"bin-02", "bin-03"} <= set(seen)
