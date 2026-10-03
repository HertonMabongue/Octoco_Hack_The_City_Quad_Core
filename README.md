# Clean Corridor — Waste Management System

**Hack the City 2026 — Team Quad-Core — Waste & Recycling challenge**

The Adam Tas Corridor sits on old industrial land with a polluted river (the
Plankenbrug) running through it. Waste along the corridor is handled
reactively today: bins overflow before anyone notices, litter and illegal
dumping go unreported, and the municipality has no live insight into any of
it.

Clean Corridor is a two-sided IoT platform that fixes that:

- **Sensor nodes** on corridor bins measure fill level with an ultrasonic
  sensor and stream it to the city every 30 seconds.
- **A municipal dashboard** gives operators live bin status on a map,
  fill-level trends, and a single alert feed — sensor-triggered overflow
  alerts and resident-submitted littering reports, together.
- **A community app** lets residents see which bins nearby are filling up
  and report a littered area with a photo and their location in a few taps,
  feeding straight into the same alert feed operators already watch.

It's a platform, not a sensor readout: the value is in connecting what the
hardware sees to what a resident sees to what an operator can act on.

## Architecture

```
firmware/   ESP32 + ultrasonic sensor — posts raw readings to the backend
            over the local network (no MQTT on the device itself)
backend/    Python/FastAPI — the one thing that speaks the city's MQTT
            protocol; persists readings/alerts/reports in SQLite and
            exposes a typed REST API to the frontend
frontend/   Next.js (App Router) — the municipal dashboard and community app,
            deployed at https://kleanclorridor.vercel.app
```

Firmware does **not** talk to the city MQTT broker directly. It POSTs raw
readings to the backend over the local network (plain HTTP — far more
stable than a persistent MQTT connection on a battery-powered device over
flaky event wifi), and the backend is the single place that speaks the
city's protocol correctly: topic shape, retained status, LWT, reconnects.
This also means the backend can go live on the city broker with generated
readings today, before firmware is ready — see Mock telemetry below.

**Tech stack:** TypeScript (strict) + Tailwind CSS + shadcn/ui on the
frontend, Pydantic models + typed FastAPI routers on the backend, built to
match end to end — the same `Bin`/`Alert`/`Report` shapes exist as Pydantic
models in `backend/app/models.py` and TypeScript interfaces in
`frontend/lib/types.ts`.

### Deployment

The frontend is deployed to Vercel (frontend-only — see below for why) at
**https://kleanclorridor.vercel.app**.

## City mainframe integration

Conforms to the Hack the City communication protocol.

- **Team ID:** `kmm4v`
- **MQTT broker:** `192.168.101.123:1883`
- **Telemetry** — published every 30s to `hack/{team}/{device}/telemetry`:

  ```json
  {
    "metrics": {
      "uptime_s": 128,
      "fill_pct": 64.0,
      "distance_cm": 18.4,
      "overflow_flag": 0
    }
  }
  ```

  `fill_pct` is the primary metric (derived from the ultrasonic distance
  reading and the bin's known depth); `distance_cm` is the raw reading;
  `overflow_flag` is 1 once the bin is effectively full. `uptime_s` is
  mandatory per the protocol.

- **Status** — published to `hack/{team}/{device}/status`, retained:

  ```json
  { "status": "online", "mode": "normal" }
  ```

  `{"status": "offline"}` is set as the device's MQTT Last Will and
  Testament. `mode` is one of `normal` / `maintenance` / `emergency`, and
  each mode must produce distinct visual/functional feedback on the
  hardware (LED/buzzer pattern).

- **HTTP fallback**, if MQTT is unreachable:
  `POST http://192.168.101.123:8000/api/v1/teams/{team}/devices/{device}/telemetry`
  (the city's own fallback endpoint — not ours; see below for the
  backend's own local endpoint firmware actually posts to)

`backend/app/city_client.py` is the only thing in this stack that opens a
connection to the city broker. It keeps one MQTT connection per device
(not one shared connection), because LWT is a per-connection feature — a
device only gets its own `"offline"` published automatically on an
unexpected drop if it has its own connection.

### Local ingest (firmware → backend)

Firmware POSTs raw readings to the backend over the local network —
**not** to the city broker or the city's HTTP fallback:

```
POST http://<backend-host>:8000/api/devices/{device_id}/readings
Content-Type: application/json

{"uptime_s": 128, "fill_pct": 64.0, "distance_cm": 18.4, "overflow_flag": false}
```

`device_id` must already be in `DEVICE_REGISTRY` (`backend/app/config.py`)
— that's where label/lat/lng come from, since the reading itself doesn't
carry them. `backend/app/telemetry.py` takes it from there: stores the
reading, evaluates the overflow threshold, derives `mode`, and republishes
to the city broker in the correct protocol shape (`app/city_client.py`).

### Mock telemetry (bridge until firmware is posting)

With `MOCK_TELEMETRY_ENABLED=true` (the default — see `.env.example`), the
backend generates plausible readings for every device in
`DEVICE_REGISTRY` and feeds them through the exact same
`app/telemetry.record_reading` path a real firmware POST would use
(`backend/app/mock_generator.py`). That means the backend shows up online
on the city broker and starts earning uptime score immediately, without
waiting on firmware. **Turn it off** (`MOCK_TELEMETRY_ENABLED=false`) once
real firmware is posting to `/api/devices/{id}/readings` for the same
device IDs — running both at once interleaves fake and real readings for
the same bin.

A background watchdog (`backend/app/watchdog.py`) also marks a device
offline — locally and to the city, via a retained status publish — if it
hasn't posted a reading in `OFFLINE_AFTER_S` (default 90s), so a dead
mock/firmware doesn't look perpetually online.

## API contract (backend ↔ frontend)

All response field names are camelCase; see `backend/app/models.py`
(Pydantic, source of truth) and `frontend/lib/types.ts` (mirrors it).

| Method | Path                    | Description                                      |
| ------ | ----------------------- | ------------------------------------------------ |
| GET    | `/api/bins`             | All bins, derived from latest telemetry + status |
| GET    | `/api/bins/:id`         | One bin                                          |
| GET    | `/api/bins/:id/history` | Fill-level history points for one bin            |
| GET    | `/api/alerts`           | Recent alerts (overflow, littering, offline)     |
| POST   | `/api/reports`          | Multipart form: `lat`, `lng`, `note`, `photo`    |
| GET    | `/health`               | Liveness check                                   |

`Bin.status` is `good` / `warning` / `critical`, derived from `fillPct`
against `FILL_WARNING_PCT` / `FILL_CRITICAL_PCT` (backend
`app/config.py`, mirrored in frontend `lib/constants.ts` — keep both in
sync if you tune them).

The frontend falls back to mock data (`frontend/lib/api.ts`) if the backend
is unreachable, so either side can be developed and demoed independently.

## Setup

### Quick start (backend + frontend together)

```bash
./start.sh
```

Creates/reuses a `.venv` for the backend, installs both sides' dependencies
if missing, copies `.env.example`/`frontend/.env.local.example` on first
run, and starts the backend on `:8000` and frontend on `:3000`. Ctrl+C
stops both. See below for running each side individually, or if you hit
the `ModuleNotFoundError: No module named 'pydantic_settings'` error —
that means `uvicorn` is running outside a venv with the current
`requirements.txt` installed; `./start.sh` avoids that by managing its own.

### 1. Firmware (ESP32)

Owned separately — see the firmware team for build/flash instructions. It
posts to the backend's local `/api/devices/{id}/readings` endpoint (see
Local ingest above), not to the city broker directly.

### 2. Backend (FastAPI + city publisher)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # adjust BROKER_HOST if not on the venue network
uvicorn main:app --reload --app-dir backend
```

Project layout:

```
backend/
  main.py                 FastAPI app, CORS, static /uploads, background task lifecycle
  app/
    config.py              Settings (env-driven) + known device registry
    db.py                  SQLite persistence
    models.py               Pydantic request/response models
    telemetry.py             Records a reading → DB + alerts + relays to the city
    city_client.py           The only thing that speaks the city MQTT protocol
    mock_generator.py        Generates readings until firmware is posting (toggleable)
    watchdog.py               Marks stale devices offline (locally + to the city)
    routers/
      bins.py, alerts.py, reports.py, ingest.py
    forecasting/             Fill-rate prediction model (scaffolded, not built yet)
```

**Forecasting (not started):** `backend/app/forecasting/` is scaffolded for
a fill-rate prediction model (linear/Bayesian regression over a bin's
fill-level history, to estimate time-to-full ahead of it actually
overflowing). See `backend/app/forecasting/README.md` for the data access
points and suggested shape before starting on it.

### 3. Frontend (Next.js + TypeScript + Tailwind + shadcn/ui)

```bash
cd frontend
npm install
cp .env.local.example .env.local   # point at the backend URL
npm run dev
```

```bash
npm run lint        # eslint (next/core-web-vitals + prettier)
npm run typecheck   # tsc --noEmit, strict mode
npm run build        # production build
npm run format       # prettier --write
```

## The deal (commercialisation summary)

Clean Corridor is offered to the municipality as **hardware-as-a-service**:
Octoco/the operating team owns and maintains the sensor nodes and the
software platform, and the municipality pays a per-bin monthly subscription
covering hardware, connectivity, hosting, and support — no capital
outlay, no procurement of bespoke IoT infrastructure. The Adam Tas Corridor
redevelopment is the natural pilot: a contained, already-approved area
where new bins and sensor nodes can be specified as part of the build-out
rather than retrofitted. A successful pilot gives the municipality a
reference deployment to extend corridor-wide and, eventually, town-wide,
with the community-reporting side of the app driving resident adoption
independent of the sensor rollout pace. IP (firmware, backend, and the
frontend platform) stays with the team/Octoco under the pilot agreement,
licensed to the municipality for the term of the contract.
