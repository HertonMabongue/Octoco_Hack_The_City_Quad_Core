"""MQTT subscriber: ingests telemetry/status from the city mainframe broker.

Conforms to the Hack the City protocol:
  - hack/{team}/{device}/telemetry -> {"metrics": {"uptime_s": int, ...}}
  - hack/{team}/{device}/status    -> {"status": "online"|"offline", "mode": "..."}
    (retained, with {"status": "offline"} as the device's LWT)
"""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

import paho.mqtt.client as mqtt

from app import db
from app.config import Settings, get_settings

logger = logging.getLogger("mqtt")

REQUIRED_METRICS = ("uptime_s", "fill_pct")


def parse_topic(topic: str, team_id: str) -> tuple[str, str] | None:
    parts = topic.split("/")
    if len(parts) != 4 or parts[0] != "hack" or parts[1] != team_id:
        return None
    return parts[2], parts[3]


def fill_status(fill_pct: float, settings: Settings) -> str:
    if fill_pct >= settings.fill_critical_pct:
        return "critical"
    if fill_pct >= settings.fill_warning_pct:
        return "warning"
    return "good"


def handle_telemetry(device_id: str, payload: dict[str, Any], settings: Settings) -> None:
    metrics = payload.get("metrics")
    if not isinstance(metrics, dict):
        logger.warning("telemetry from %s missing 'metrics' object", device_id)
        return
    if any(field not in metrics for field in REQUIRED_METRICS):
        logger.warning("telemetry from %s missing required metrics", device_id)
        return

    db.insert_reading(device_id, metrics)

    status = fill_status(float(metrics["fill_pct"]), settings)
    if status == "critical" and not db.recent_alert_exists(device_id, "overflow"):
        db.insert_alert(device_id, "overflow", f"Bin {device_id} is {metrics['fill_pct']:.0f}% full — needs collection")


def handle_status(device_id: str, payload: dict[str, Any]) -> None:
    connection = payload.get("status", "offline")
    mode = payload.get("mode", "normal")
    was_online = db.get_device_status(device_id)[0] == "online"
    db.upsert_device_status(device_id, connection, mode)

    if connection == "offline" and was_online:
        db.insert_alert(device_id, "offline", f"Bin {device_id} went offline")


def _on_message(_client: mqtt.Client, settings: Settings, msg: mqtt.MQTTMessage) -> None:
    parsed = parse_topic(msg.topic, settings.team_id)
    if parsed is None:
        return
    device_id, channel = parsed

    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        logger.warning("bad JSON on topic %s", msg.topic)
        return

    if channel == "telemetry":
        handle_telemetry(device_id, payload, settings)
    elif channel == "status":
        handle_status(device_id, payload)


class MqttSubscriber:
    """Runs the paho-mqtt network loop on a background thread for the
    lifetime of the app, reconnecting on failure.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        if settings.broker_username:
            self._client.username_pw_set(settings.broker_username, settings.broker_password)
        self._client.on_connect = self._on_connect
        self._client.on_message = lambda c, _u, msg: _on_message(c, settings, msg)

    def _on_connect(self, client: mqtt.Client, _userdata: Any, _flags: Any, rc: int, _props: Any = None) -> None:
        if rc == 0:
            client.subscribe(f"hack/{self._settings.team_id}/+/telemetry")
            client.subscribe(f"hack/{self._settings.team_id}/+/status")
            logger.info("subscribed to hack/%s/+/{telemetry,status}", self._settings.team_id)
        else:
            logger.warning("MQTT connect failed with rc=%s", rc)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._client.disconnect()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self._client.connect(self._settings.broker_host, self._settings.broker_port, keepalive=60)
                self._client.loop_forever()
            except Exception:
                logger.exception("MQTT connection lost, retrying in 5s")
                time.sleep(5)


_subscriber: MqttSubscriber | None = None


def start_mqtt_subscriber() -> MqttSubscriber:
    global _subscriber
    _subscriber = MqttSubscriber(get_settings())
    _subscriber.start()
    return _subscriber


def stop_mqtt_subscriber() -> None:
    if _subscriber is not None:
        _subscriber.stop()
