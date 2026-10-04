"""The single thing in this stack that speaks the Hack the City protocol.
Firmware (and, for now, our own mock generator) never talks to the city
directly — it POSTs raw readings to our local /api/devices/{id}/readings
endpoint instead, and app/telemetry.py forwards them here for
republishing. That split means one place handles the protocol correctly
(topic shape, retained status, LWT, reconnects, and the HTTP fallback)
regardless of how flaky the device's own network connection is.

Each device gets its own MQTT client connection (not one shared
connection) because MQTT's Last Will and Testament is a per-connection
feature — a device only gets its own "offline" status published
automatically on an unexpected drop if it has its own connection.

If MQTT isn't actually connected when a telemetry publish is attempted —
which can happen on event wifi that blocks port 1883 even though plain
HTTP gets through fine — telemetry falls back to the city's documented
HTTP endpoint instead of silently vanishing. (Status/retained-LWT has no
HTTP equivalent, so that part stays MQTT-only.)
"""
from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request
from typing import Literal

import paho.mqtt.client as mqtt

from app.config import Settings, get_settings

logger = logging.getLogger("city_client")

DeviceMode = Literal["normal", "maintenance", "emergency"]
ConnectionState = Literal["connecting", "connected", "failed", "disconnected"]

_clients: dict[str, mqtt.Client] = {}
_state: dict[str, ConnectionState] = {}
# Reentrant: _get_client holds it while calling _set_state, which takes it too.
_lock = threading.RLock()


def _topic(team_id: str, device_id: str, channel: str) -> str:
    return f"hack/{team_id}/{device_id}/{channel}"


def _set_state(device_id: str, state: ConnectionState) -> None:
    with _lock:
        _state[device_id] = state


def status() -> dict[str, ConnectionState]:
    """Current MQTT connection state per device — surfaced on /health so
    this is checkable from a browser instead of digging through logs.
    """
    with _lock:
        return dict(_state)


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
                _set_state(device_id, "connected")
            else:
                logger.warning("city broker connect failed (%s) rc=%s", device_id, rc)
                _set_state(device_id, "failed")

        def on_disconnect(_c: mqtt.Client, _userdata: object, rc: int, _props: object = None) -> None:
            if rc != 0:
                logger.warning("city broker connection dropped (%s) rc=%s, reconnecting", device_id, rc)
            _set_state(device_id, "disconnected")

        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.reconnect_delay_set(min_delay=1, max_delay=30)

        _set_state(device_id, "connecting")
        try:
            client.connect_async(settings.broker_host, settings.broker_port, keepalive=60)
            client.loop_start()
        except Exception:
            logger.exception("initial connect_async failed for %s", device_id)
            _set_state(device_id, "failed")

        _clients[device_id] = client
        return client


def _http_fallback_telemetry(device_id: str, metrics: dict[str, object], settings: Settings) -> None:
    url = (
        f"http://{settings.city_http_host}:{settings.city_http_port}"
        f"/api/v1/teams/{settings.team_id}/devices/{device_id}/telemetry"
    )
    body = json.dumps({"metrics": metrics}).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            logger.info("telemetry sent via HTTP fallback (%s): %s", device_id, response.status)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        # One line, not a traceback: off the venue network this fires for
        # every device every 30 s, and the cause is always "city unreachable".
        logger.warning(
            "HTTP fallback telemetry also failed for %s (%s:%s unreachable: %s)",
            device_id, settings.city_http_host, settings.city_http_port, getattr(exc, "reason", exc),
        )


def publish_telemetry(device_id: str, metrics: dict[str, object]) -> None:
    settings = get_settings()
    client = _get_client(device_id, settings)

    if client.is_connected():
        payload = json.dumps({"metrics": metrics})
        client.publish(_topic(settings.team_id, device_id, "telemetry"), payload, qos=0)
    else:
        # MQTT isn't up right now (connecting, or genuinely unreachable —
        # e.g. event wifi blocking port 1883). A qos=0 publish while
        # disconnected is silently dropped by paho, not queued, so this
        # fallback is the difference between "offline on the city board"
        # and actually showing up.
        logger.warning("MQTT not connected for %s, using HTTP fallback", device_id)
        # Off the caller's thread: the city host can be unreachable (we're
        # off the venue network) and the fallback's 5 s timeout would
        # otherwise hold up the firmware's own POST, which gives up at 5 s
        # too and would report a failure for a reading we did accept.
        threading.Thread(
            target=_http_fallback_telemetry, args=(device_id, metrics, settings), daemon=True
        ).start()


def publish_status(device_id: str, status_value: Literal["online", "offline"], mode: DeviceMode) -> None:
    settings = get_settings()
    client = _get_client(device_id, settings)
    payload = json.dumps({"status": status_value, "mode": mode})
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
        _state.clear()
