"""The single thing in this stack that speaks the Hack the City MQTT
protocol. Firmware (and, for now, our own mock generator) never talks to
the city broker directly — it POSTs raw readings to our local
/api/devices/{id}/readings endpoint instead, and app/telemetry.py forwards
them here for republishing. That split means one place handles the
protocol correctly (topic shape, retained status, LWT, reconnects)
regardless of how flaky the device's own network connection is.

Each device gets its own MQTT client connection (not one shared
connection) because MQTT's Last Will and Testament is a per-connection
feature — a device only gets its own "offline" status published
automatically on an unexpected drop if it has its own connection.
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Literal

import paho.mqtt.client as mqtt

from app.config import Settings, get_settings

logger = logging.getLogger("city_client")

DeviceMode = Literal["normal", "maintenance", "emergency"]

_clients: dict[str, mqtt.Client] = {}
_lock = threading.Lock()


def _topic(team_id: str, device_id: str, channel: str) -> str:
    return f"hack/{team_id}/{device_id}/{channel}"


def _get_client(device_id: str, settings: Settings) -> mqtt.Client:
    with _lock:
        existing = _clients.get(device_id)
        if existing is not None:
            return existing

        client_id = f"{settings.team_id}-{device_id}"
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
        if settings.broker_username:
            client.username_pw_set(settings.broker_username, settings.broker_password)

        client.will_set(
            _topic(settings.team_id, device_id, "status"),
            json.dumps({"status": "offline"}),
            qos=1,
            retain=True,
        )

        def on_connect(_c: mqtt.Client, _userdata: object, _flags: object, rc: int, _props: object = None) -> None:
            if rc == 0:
                logger.info("city broker connected (%s)", device_id)
            else:
                logger.warning("city broker connect failed (%s) rc=%s", device_id, rc)

        def on_disconnect(_c: mqtt.Client, _userdata: object, rc: int, _props: object = None) -> None:
            if rc != 0:
                logger.warning("city broker connection dropped (%s) rc=%s, reconnecting", device_id, rc)

        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.reconnect_delay_set(min_delay=1, max_delay=30)

        try:
            client.connect_async(settings.broker_host, settings.broker_port, keepalive=60)
            client.loop_start()
        except Exception:
            logger.exception("initial connect_async failed for %s", device_id)

        _clients[device_id] = client
        return client


def publish_telemetry(device_id: str, metrics: dict[str, object]) -> None:
    settings = get_settings()
    client = _get_client(device_id, settings)
    payload = json.dumps({"metrics": metrics})
    client.publish(_topic(settings.team_id, device_id, "telemetry"), payload, qos=0)


def publish_status(device_id: str, status: Literal["online", "offline"], mode: DeviceMode) -> None:
    settings = get_settings()
    client = _get_client(device_id, settings)
    payload = json.dumps({"status": status, "mode": mode})
    client.publish(_topic(settings.team_id, device_id, "status"), payload, qos=1, retain=True)


def shutdown() -> None:
    settings = get_settings()
    with _lock:
        for device_id, client in _clients.items():
            try:
                client.publish(
                    _topic(settings.team_id, device_id, "status"),
                    json.dumps({"status": "offline"}),
                    qos=1,
                    retain=True,
                )
                client.loop_stop()
                client.disconnect()
            except Exception:
                logger.exception("error shutting down city client for %s", device_id)
        _clients.clear()
