# Octoco_Hack_The_City_Quad_Core

IoT sensor network for early detection of illegal dumping and waste along the Adam Tas Corridor, fusing gas, temperature, and pH readings into a municipal alert dashboard.

## Project structure

- `firmware/` ESP32 PlatformIO sketch for gas + DS18B20 + pH telemetry and device mode indicators.
- `backend/` FastAPI + paho-mqtt service that ingests telemetry, stores readings/alerts in SQLite, and exposes REST endpoints.
- `frontend/` Next.js dashboard that polls the backend REST API for live node cards, trend charts, and alert feed.

## 1) Firmware (ESP32 + PlatformIO)

1. Install PlatformIO.
2. Open `firmware/platformio.ini` and set `WIFI_*`, `MQTT_HOST`, `MQTT_TEAM`, and `MQTT_DEVICE` build flags.
3. Wire sensors:
   - gas analog sensor -> GPIO34
   - pH analog sensor -> GPIO35
   - DS18B20 data -> GPIO4
   - LED -> GPIO2
   - buzzer -> GPIO15
4. Build/flash:

```bash
cd firmware
pio run
pio run -t upload
pio device monitor
```

Publishes telemetry every 30s to:

- `hack/{team}/{device}/telemetry` with `{ uptime_s, gas_ppm, temp_c, ph }`
- retained status on `hack/{team}/{device}/status` with LWT `{"status":"offline"}`

Supports mode changes via `hack/{team}/{device}/mode` payload: `normal`, `maintenance`, `emergency`.

## 2) Backend (FastAPI + MQTT subscriber)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
uvicorn backend.main:app --reload
```

REST API:

- `GET /api/dashboard`
- `GET /api/nodes`
- `GET /api/nodes/{node_id}/readings?limit=20`
- `GET /api/alerts?limit=30`

## 3) Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE` (see `.env.example`) so the dashboard can call the backend.

## Notes

- Backend subscribes to `hack/{TEAM_ID}/+/telemetry`.
- Alerts trigger when gas, temperature, or pH thresholds are crossed.
