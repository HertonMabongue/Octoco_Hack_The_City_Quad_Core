"""Shows exactly what our team is publishing to the city broker, live.

    .venv/bin/python backend/tools/watch_city.py          # run until Ctrl+C
    .venv/bin/python backend/tools/watch_city.py 60       # run for 60 seconds

Read-only: it subscribes to hack/<TEAM_ID>/# using the broker settings in
the repo-root .env, with its own client id so it can't knock a bin's real
connection (and its Last Will) off the broker. Needs the venue network.
Retained messages (the bins' current status) arrive immediately; telemetry
arrives every ~30 s per bin.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).resolve().parents[2] / ".env")
team = env.get("TEAM_ID") or "kmm4v"
host = env.get("BROKER_HOST") or "192.168.101.123"
port = int(env.get("BROKER_PORT") or 1883)
duration = float(sys.argv[1]) if len(sys.argv) > 1 else None

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"{team}-watch-{int(time.time())}")
if env.get("BROKER_USERNAME"):
    client.username_pw_set(env["BROKER_USERNAME"], env.get("BROKER_PASSWORD") or "")


def on_connect(c, _u, _f, rc, _p=None):
    print(f"connected to {host}:{port} (rc={rc}), listening on hack/{team}/# ...\n")
    c.subscribe(f"hack/{team}/#")


def on_message(_c, _u, msg):
    kind = "retained" if msg.retain else "live    "
    topic = msg.topic.removeprefix(f"hack/{team}/")
    print(f"{time.strftime('%H:%M:%S')}  {kind}  {topic:24} {msg.payload.decode(errors='replace')}")


client.on_connect, client.on_message = on_connect, on_message
client.connect(host, port, 20)
client.loop_start()
try:
    time.sleep(duration) if duration else time.sleep(10**9)
except KeyboardInterrupt:
    pass
client.loop_stop()
client.disconnect()
