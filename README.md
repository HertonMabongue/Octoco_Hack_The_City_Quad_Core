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
firmware/   ESP32 + ultrasonic sensor — bin fill-level telemetry (owned by a
            teammate, built independently; not touched by this overhaul)
backend/    Python/FastAPI — subscribes to the city MQTT broker, persists
            readings/alerts/reports in SQLite, and exposes a typed REST API
frontend/   Next.js (App Router) — the municipal dashboard and community app
```

**Tech stack:** TypeScript (strict) + Tailwind CSS + shadcn/ui on the
frontend, Pydantic models + typed FastAPI routers on the backend, built to
match end to end — the same `Bin`/`Alert`/`Report` shapes exist as Pydantic
models in `backend/app/models.py` and TypeScript interfaces in
`frontend/lib/types.ts`.

> **Note on firmware/backend alignment:** `firmware/src/main.cpp` currently
> contains an early scaffold (a gas/temperature/pH "river contamination"
> sensor) from this project's initial setup commit, not the ultrasonic
> fill-level sensor described above and built against here. The backend and
> frontend in this repo are built against the fill-level contract below —
> whoever wires up the real firmware should target that contract (MQTT
> payload shape, topic names, and the 3 metrics) rather than what's
> currently in `main.cpp`.

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

The backend (`backend/app/mqtt_client.py`) subscribes to
`hack/kmm4v/+/telemetry` and `hack/kmm4v/+/status` on that same broker,
persists readings, and raises an `overflow` alert when a bin crosses the
critical fill threshold, or an `offline` alert when a device's retained
status flips to offline.

## API contract (backend ↔ frontend)

All response field names are camelCase; see `backend/app/models.py`
(Pydantic, source of truth) and `frontend/lib/types.ts` (mirrors it).

| Method | Path                   | Description                                      |
| ------ | ---------------------- | ------------------------------------------------- |
| GET    | `/api/bins`             | All bins, derived from latest telemetry + status  |
| GET    | `/api/bins/:id`          | One bin                                           |
| GET    | `/api/bins/:id/history`  | Fill-level history points for one bin             |
| GET    | `/api/alerts`            | Recent alerts (overflow, littering, offline)      |
| POST   | `/api/reports`           | Multipart form: `lat`, `lng`, `note`, `photo`     |
| GET    | `/health`                | Liveness check                                    |

`Bin.status` is `good` / `warning` / `critical`, derived from `fillPct`
against `FILL_WARNING_PCT` / `FILL_CRITICAL_PCT` (backend
`app/config.py`, mirrored in frontend `lib/constants.ts` — keep both in
sync if you tune them).

The frontend falls back to mock data (`frontend/lib/api.ts`) if the backend
is unreachable, so either side can be developed and demoed independently.

## Setup

### 1. Firmware (ESP32)

Owned separately — see the firmware team for build/flash instructions. It
must publish to the topics and payload shape in the integration spec above.

### 2. Backend (FastAPI + MQTT subscriber)

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
  main.py                 FastAPI app, CORS, static /uploads, MQTT lifecycle
  app/
    config.py              Settings (env-driven) + known device registry
    db.py                  SQLite persistence
    models.py               Pydantic request/response models
    mqtt_client.py           MQTT subscriber + alert evaluation
    routers/
      bins.py, alerts.py, reports.py
```

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
