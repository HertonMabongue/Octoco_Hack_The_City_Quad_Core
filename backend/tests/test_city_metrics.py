from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app import db, telemetry


def _fill_history(device_id: str, start: float, step: float, n: int) -> None:
    """n readings 30 s apart ending now, rising by `step` % each."""
    now = datetime.now(timezone.utc)
    with db.get_connection() as con:
        for i in range(n):
            ts = (now - timedelta(seconds=30 * (n - 1 - i))).isoformat()
            con.execute(
                "INSERT INTO readings(device_id, ts, uptime_s, fill_pct, people_count) VALUES (?, ?, ?, ?, ?)",
                (device_id, ts, i * 30, start + step * i, 2),
            )
        con.commit()


def test_city_gets_exactly_uptime_plus_three_numeric_metrics(client):
    _fill_history("bin-01", 20.0, 0.5, 30)
    metrics = telemetry.select_city_metrics("bin-01", {"uptime_s": 900, "fill_pct": 34.5, "gas_raw": 950})
    assert set(metrics) == {"uptime_s", "collection_priority_pct", "hours_to_full_h", "safety_incidents_24h_n"}
    assert all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in metrics.values())


def test_no_raw_sensor_value_is_forwarded(client):
    _fill_history("bin-01", 20.0, 0.5, 10)
    metrics = telemetry.select_city_metrics(
        "bin-01", {"uptime_s": 1, "fill_pct": 25.0, "gas_raw": 950, "people_count": 9, "movement_alert": True}
    )
    assert not {"fill_pct", "gas_raw", "people_count", "movement_alert", "distance_cm"} & set(metrics)


def test_priority_takes_the_worse_of_fill_and_time_pressure():
    assert telemetry.collection_priority(fill_pct=70, eta_hours=168) == 70      # full-ish, filling slowly
    assert telemetry.collection_priority(fill_pct=40, eta_hours=6) == 75        # emptier but filling fast
    assert telemetry.collection_priority(fill_pct=40, eta_hours=0) == 100       # due now
    assert telemetry.collection_priority(fill_pct=10, eta_hours=48) == 10       # a day+ to spare: fill decides


def test_fill_component_is_smoothed_over_recent_readings(client):
    _fill_history("bin-01", 50.0, 0.0, 4)
    db.insert_reading("bin-01", {"uptime_s": 999, "fill_pct": 100.0})   # one wild echo
    assert telemetry.smoothed_fill("bin-01", fallback=100.0) == 60.0     # mean of 50, 50, 50, 50, 100


def test_hours_to_full_comes_from_the_forecast_and_is_capped(client):
    _fill_history("bin-01", 10.0, 1.0, 40)   # ~2 %/min, so full within hours
    soon = telemetry.select_city_metrics("bin-01", {"uptime_s": 1, "fill_pct": 49.0})["hours_to_full_h"]
    assert 0 < soon < telemetry.MAX_HOURS_TO_FULL

    # no history at all: no honest ETA, so the "a week or more" cap
    assert telemetry.select_city_metrics("bin-02", {"uptime_s": 1, "fill_pct": 10.0})["hours_to_full_h"] == 168.0


def test_safety_incidents_count_gas_and_tamper_in_the_last_day_only(client):
    telemetry.record_reading("bin-01", {"uptime_s": 1, "fill_pct": 20.0, "gas_raw": 950, "movement_alert": True}, source="mock")
    assert telemetry.select_city_metrics("bin-01", {"uptime_s": 1, "fill_pct": 20.0})["safety_incidents_24h_n"] == 2

    old = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
    with db.get_connection() as con:
        con.execute("UPDATE alerts SET created_at = ? WHERE type = 'tamper'", (old,))
        con.commit()
    assert telemetry.select_city_metrics("bin-01", {"uptime_s": 1, "fill_pct": 20.0})["safety_incidents_24h_n"] == 1


def test_device_readings_are_logged_with_what_the_city_gets(client, caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="telemetry"):
        telemetry.record_reading(
            "bin-01",
            {"uptime_s": 5, "fill_pct": 64.0, "distance_cm": 6.3, "gas_raw": 210, "people_count": 3, "movement_alert": False},
            source="device",
        )
        telemetry.record_reading("bin-02", {"uptime_s": 5, "fill_pct": 10.0}, source="mock")
    lines = [r.getMessage() for r in caplog.records if r.name == "telemetry"]
    assert len(lines) == 1, "mock readings must stay quiet"
    assert "bin-01" in lines[0] and "fill=64.0%" in lines[0] and "gas=210" in lines[0]
    assert "to city:" in lines[0] and "collection_priority_pct" in lines[0]
