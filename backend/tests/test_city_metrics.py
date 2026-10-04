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
    assert set(metrics) == {"uptime_s", "fill_pct", "hours_to_full_h", "open_alerts_n"}
    assert all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in metrics.values())


def test_raw_sensor_values_are_not_forwarded(client):
    _fill_history("bin-01", 20.0, 0.5, 10)
    metrics = telemetry.select_city_metrics(
        "bin-01", {"uptime_s": 1, "fill_pct": 25.0, "gas_raw": 950, "people_count": 9, "movement_alert": True}
    )
    assert not {"gas_raw", "people_count", "movement_alert", "distance_cm"} & set(metrics)


def test_fill_is_smoothed_over_recent_readings(client):
    _fill_history("bin-01", 50.0, 0.0, 4)
    db.insert_reading("bin-01", {"uptime_s": 999, "fill_pct": 100.0})   # one wild echo
    assert telemetry.select_city_metrics("bin-01", {"uptime_s": 999, "fill_pct": 100.0})["fill_pct"] == 60.0


def test_hours_to_full_comes_from_the_forecast_and_is_capped(client):
    _fill_history("bin-01", 10.0, 1.0, 40)   # ~2 %/min, so full within hours
    soon = telemetry.select_city_metrics("bin-01", {"uptime_s": 1, "fill_pct": 49.0})["hours_to_full_h"]
    assert 0 < soon < telemetry.MAX_HOURS_TO_FULL

    # no history at all: no honest ETA, so the "a week or more" cap
    assert telemetry.select_city_metrics("bin-02", {"uptime_s": 1, "fill_pct": 10.0})["hours_to_full_h"] == 168.0


def test_open_alerts_folds_gas_and_tamper_into_one_number(client):
    telemetry.record_reading("bin-01", {"uptime_s": 1, "fill_pct": 20.0, "gas_raw": 950, "movement_alert": True}, source="mock")
    assert db.count_open_alerts("bin-01") == 2
    metrics = telemetry.select_city_metrics("bin-01", {"uptime_s": 1, "fill_pct": 20.0})
    assert metrics["open_alerts_n"] == 2
