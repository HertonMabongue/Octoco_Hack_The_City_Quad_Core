import json
import os
import sqlite3
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

BROKER_HOST = os.getenv("BROKER_HOST", "localhost")
BROKER_PORT = int(os.getenv("BROKER_PORT", "1883"))
BROKER_USERNAME = os.getenv("BROKER_USERNAME", "")
BROKER_PASSWORD = os.getenv("BROKER_PASSWORD", "")
TEAM_ID = os.getenv("TEAM_ID", "team-alpha")
DB_PATH = Path(os.getenv("DB_PATH", "backend/data.sqlite3"))
MAX_TREND_POINTS = int(os.getenv("MAX_TREND_POINTS", "50"))

THRESHOLDS = {
    "gas_ppm": float(os.getenv("ALERT_GAS_PPM", "700")),
    "temp_c": float(os.getenv("ALERT_TEMP_C", "55")),
    "ph_low": float(os.getenv("ALERT_PH_LOW", "5.5")),
    "ph_high": float(os.getenv("ALERT_PH_HIGH", "9.0")),
}

app = FastAPI(title="River Corridor Sensor Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS readings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              node_id TEXT NOT NULL,
              ts TEXT NOT NULL,
              uptime_s INTEGER NOT NULL,
              gas_ppm REAL NOT NULL,
              temp_c REAL NOT NULL,
              ph REAL NOT NULL
            )
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              node_id TEXT NOT NULL,
              ts TEXT NOT NULL,
              level TEXT NOT NULL,
              metric TEXT NOT NULL,
              value REAL NOT NULL,
              threshold REAL NOT NULL,
              message TEXT NOT NULL
            )
            """
        )
        con.commit()


def parse_topic(topic: str) -> tuple[str, str] | None:
    parts = topic.split("/")
    if len(parts) != 4 or parts[0] != "hack" or parts[1] != TEAM_ID:
        return None
    return parts[2], parts[3]


def insert_reading(node_id: str, payload: dict[str, Any]) -> None:
    ts = utc_now()
    with sqlite3.connect(DB_PATH) as con:
        con.execute(
            """
            INSERT INTO readings(node_id, ts, uptime_s, gas_ppm, temp_c, ph)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                node_id,
                ts,
                int(payload["uptime_s"]),
                float(payload["gas_ppm"]),
                float(payload["temp_c"]),
                float(payload["ph"]),
            ),
        )
        con.commit()


def insert_alert(node_id: str, metric: str, value: float, threshold: float, message: str) -> None:
    with sqlite3.connect(DB_PATH) as con:
        con.execute(
            """
            INSERT INTO alerts(node_id, ts, level, metric, value, threshold, message)
            VALUES (?, ?, 'warning', ?, ?, ?, ?)
            """,
            (node_id, utc_now(), metric, value, threshold, message),
        )
        con.commit()


def evaluate_alerts(node_id: str, reading: dict[str, float]) -> None:
    if reading["gas_ppm"] >= THRESHOLDS["gas_ppm"]:
        insert_alert(node_id, "gas_ppm", reading["gas_ppm"], THRESHOLDS["gas_ppm"], "Elevated gas concentration")
    if reading["temp_c"] >= THRESHOLDS["temp_c"]:
        insert_alert(node_id, "temp_c", reading["temp_c"], THRESHOLDS["temp_c"], "Potential waste fire temperature")
    if reading["ph"] <= THRESHOLDS["ph_low"]:
        insert_alert(node_id, "ph", reading["ph"], THRESHOLDS["ph_low"], "Low pH indicates acidic contamination")
    if reading["ph"] >= THRESHOLDS["ph_high"]:
        insert_alert(node_id, "ph", reading["ph"], THRESHOLDS["ph_high"], "High pH indicates alkaline contamination")


def on_message(_client: mqtt.Client, _userdata: Any, msg: mqtt.MQTTMessage) -> None:
    parsed = parse_topic(msg.topic)
    if parsed is None:
        return

    device, channel = parsed
    node_id = f"{TEAM_ID}/{device}"

    if channel != "telemetry":
        return

    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        for field in ("uptime_s", "gas_ppm", "temp_c", "ph"):
            if field not in payload:
                return
        insert_reading(node_id, payload)
        evaluate_alerts(node_id, {
            "gas_ppm": float(payload["gas_ppm"]),
            "temp_c": float(payload["temp_c"]),
            "ph": float(payload["ph"]),
        })
    except (ValueError, TypeError, json.JSONDecodeError):
        return


def start_mqtt() -> None:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if BROKER_USERNAME:
        client.username_pw_set(BROKER_USERNAME, BROKER_PASSWORD)

    def on_connect(c: mqtt.Client, _userdata: Any, _flags: Any, rc: int, _properties: Any = None) -> None:
        if rc == 0:
            c.subscribe(f"hack/{TEAM_ID}/+/telemetry")

    client.on_connect = on_connect
    client.on_message = on_message

    while True:
        try:
            client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
            client.loop_forever()
        except Exception:
            time.sleep(5)


@app.on_event("startup")
def startup() -> None:
    init_db()
    thread = threading.Thread(target=start_mqtt, daemon=True)
    thread.start()


def fetch_latest_by_node() -> list[dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as con:
        rows = con.execute(
            """
            SELECT r.node_id, r.ts, r.uptime_s, r.gas_ppm, r.temp_c, r.ph
            FROM readings r
            JOIN (
                SELECT node_id, MAX(id) AS max_id
                FROM readings
                GROUP BY node_id
            ) latest ON latest.max_id = r.id
            ORDER BY r.node_id
            """
        ).fetchall()

    return [
        {
            "node_id": row[0],
            "ts": row[1],
            "uptime_s": row[2],
            "gas_ppm": row[3],
            "temp_c": row[4],
            "ph": row[5],
        }
        for row in rows
    ]


def fetch_trends(limit: int) -> dict[str, list[dict[str, Any]]]:
    with sqlite3.connect(DB_PATH) as con:
        rows = con.execute(
            """
            SELECT node_id, ts, gas_ppm, temp_c, ph
            FROM readings
            ORDER BY id DESC
            LIMIT ?
            """,
            (max(limit, 1) * 20,),
        ).fetchall()

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for node_id, ts, gas_ppm, temp_c, ph in reversed(rows):
        data = grouped[node_id]
        if len(data) >= limit:
            continue
        data.append({"ts": ts, "gas_ppm": gas_ppm, "temp_c": temp_c, "ph": ph})
    return grouped


@app.get("/api/nodes")
def get_nodes() -> list[dict[str, Any]]:
    return fetch_latest_by_node()


@app.get("/api/nodes/{node_id}/readings")
def get_node_readings(node_id: str, limit: int = Query(20, ge=1, le=500)) -> list[dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as con:
        rows = con.execute(
            """
            SELECT ts, uptime_s, gas_ppm, temp_c, ph
            FROM readings
            WHERE node_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (node_id, limit),
        ).fetchall()

    return [
        {"ts": ts, "uptime_s": uptime_s, "gas_ppm": gas_ppm, "temp_c": temp_c, "ph": ph}
        for ts, uptime_s, gas_ppm, temp_c, ph in rows
    ][::-1]


@app.get("/api/alerts")
def get_alerts(limit: int = Query(30, ge=1, le=200)) -> list[dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as con:
        rows = con.execute(
            """
            SELECT node_id, ts, level, metric, value, threshold, message
            FROM alerts
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [
        {
            "node_id": node_id,
            "ts": ts,
            "level": level,
            "metric": metric,
            "value": value,
            "threshold": threshold,
            "message": message,
        }
        for node_id, ts, level, metric, value, threshold, message in rows
    ]


@app.get("/api/dashboard")
def get_dashboard(limit: int = Query(MAX_TREND_POINTS, ge=5, le=200)) -> dict[str, Any]:
    latest = fetch_latest_by_node()
    trends = fetch_trends(limit)
    alerts = get_alerts(20)
    nodes = []
    for row in latest:
        nodes.append(
            {
                "node_id": row["node_id"],
                "latest": row,
                "trend": trends.get(row["node_id"], []),
            }
        )

    return {"nodes": nodes, "alerts": alerts, "thresholds": THRESHOLDS}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
