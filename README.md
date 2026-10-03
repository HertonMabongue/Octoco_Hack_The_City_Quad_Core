# Clean Corridor — Intelligent Waste Management System

**Hack the City 2026 — Team Quad-Core — Waste & Recycling challenge**

The Adam Tas Corridor's bins overflow before anyone notices, littering
goes unreported, and the municipality has no live insight into either.
Clean Corridor fixes that with sensor nodes that stream bin fill-level to
a municipal dashboard (live map, trends, alerts) and a community app that
lets residents report littering straight into the same alert feed.

## Architecture

```
firmware/   ESP32 + ultrasonic sensor — posts raw readings to the backend
            over the local network (no MQTT on the device itself)
backend/    Python/FastAPI — the one thing that speaks the city's MQTT
            protocol; persists readings/alerts/reports and exposes a
            typed REST API to the frontend
frontend/   Next.js (App Router) — municipal dashboard + community app,
            deployed at https://kleanclorridor.vercel.app
```

Firmware never talks to the city broker directly — it POSTs to the
backend over plain local HTTP (far more stable on event wifi than a
persistent MQTT connection), and the backend is the one place that
speaks the city's protocol correctly (topics, retained status, LWT,
reconnects). This also lets the backend go live on the city broker with
generated readings today, before firmware is ready — see Mock telemetry.

**Tech stack:** TypeScript (strict) + Tailwind + shadcn/ui on the
frontend; Pydantic + typed FastAPI routers on the backend. The same
`Bin`/`Alert`/`Report` shapes exist as Pydantic models
(`backend/app/models.py`) and TypeScript interfaces
(`frontend/lib/types.ts`) — keep both in sync.

**Deployment:** frontend-only on Vercel, **https://kleanclorridor.vercel.app**
(the backend needs a persistent MQTT connection + local DB, which doesn't
fit serverless — it runs wherever the live demo runs).

## City mainframe integration

- **Team ID** `kmm4v` · **Broker** `192.168.101.123:1883`
- **Telemetry**, every 30s, `hack/{team}/{device}/telemetry`:
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
- **Status**, retained, `hack/{team}/{device}/status`:
  ```json
  { "status": "online", "mode": "normal" }
  ```
  `{"status": "offline"}` is the MQTT Last Will. `mode` ∈ `normal` / `maintenance` / `emergency`.
- **HTTP fallback** (the city's own, used when MQTT can't connect):
  `POST http://192.168.101.123:8000/api/v1/teams/{team}/devices/{device}/telemetry`

`backend/app/city_client.py` owns this protocol — one MQTT connection per
device (LWT is per-connection), with automatic HTTP fallback if MQTT
isn't actually connected.

**Local ingest (firmware → backend)** — not the city, and not the city's
fallback:

```
POST http://<backend-host>:8000/api/devices/{device_id}/readings
{"uptime_s": 128, "fill_pct": 64.0, "distance_cm": 18.4, "overflow_flag": false}
```

`device_id` must be in `DEVICE_REGISTRY` (`backend/app/config.py`).
`backend/app/telemetry.py` stores it, evaluates alerts, derives `mode`,
and relays to the city.

**Mock telemetry:** `MOCK_TELEMETRY_ENABLED=true` (default) generates
readings for every registered device through the same code path a real
firmware POST uses (`backend/app/mock_generator.py`), so the backend is
live on the city board before firmware is. Set it `false` once firmware
is posting for real. A watchdog (`app/watchdog.py`) marks a device
offline if it stops reporting for `OFFLINE_AFTER_S` (default 90s).

## API contract (backend ↔ frontend)

CamelCase everywhere; `backend/app/models.py` is the source of truth, mirrored in `frontend/lib/types.ts`.

| Method | Path                      | Description                                        |
| ------ | ------------------------- | -------------------------------------------------- |
| GET    | `/api/bins`               | All bins, derived from latest telemetry + status   |
| GET    | `/api/bins/:id`           | One bin                                            |
| GET    | `/api/bins/:id/history`   | Fill-level history                                 |
| GET    | `/api/alerts`             | Active alerts (resolved ones hidden by default)    |
| POST   | `/api/alerts/:id/resolve` | Mark an alert resolved                             |
| POST   | `/api/reports`            | Multipart: `lat`, `lng`, `note`, `photo`           |
| GET    | `/health`                 | Liveness + per-device city broker connection state |

`Bin.status` (`good`/`warning`/`critical`) is derived from `fillPct`
against `FILL_WARNING_PCT`/`FILL_CRITICAL_PCT` — tune in
`backend/app/config.py`, mirror in `frontend/lib/constants.ts`.

The frontend falls back to mock data if the backend is unreachable, so
either side works standalone.

## Setup

```bash
./start.sh
```

Manages its own `.venv`, installs both sides' deps if missing, seeds
`.env`/`.env.local`, runs backend (`:8000`) + frontend (`:3000`)
together. Ctrl+C stops both.

<details>
<summary>Running each part by hand</summary>

**Backend**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # adjust BROKER_HOST if off the venue network
uvicorn main:app --reload --app-dir backend
```

```
backend/
  main.py          FastAPI app, CORS, background task lifecycle
  app/
    config.py        Settings + device registry
    db.py             SQLite persistence
    models.py          Pydantic request/response models
    telemetry.py         Reading → DB + alerts + relay to the city
    city_client.py        Speaks the city MQTT protocol (+ HTTP fallback)
    mock_generator.py     Generates readings until firmware is posting
    watchdog.py             Marks stale devices offline
    routers/                 bins, alerts, reports, ingest
    forecasting/              Fill-rate prediction model — scaffolded,
                               not built; see its README before starting
```

**Frontend**

```bash
cd frontend && npm install
cp .env.local.example .env.local
npm run dev        # or: lint / typecheck / build / format
```

**Firmware** — owned separately; posts to the backend's local
`/api/devices/{id}/readings`, not to the city.

</details>

## Forecasting (ML — not built yet)

`backend/app/forecasting/` is reserved for a regression model that
predicts a bin's time-to-full from its fill-history (`app.db.history()`),
so collection can be scheduled before a bin overflows instead of after.
Not started — see `backend/app/forecasting/README.md` before picking it up.

## The deal

**Hardware-as-a-service**: we own/maintain the sensor nodes and
platform; the municipality pays a per-bin subscription (no capital
outlay). The Adam Tas Corridor redevelopment is the pilot — new bins
specified with sensors built in from the start, extending corridor-wide
and then town-wide on success. IP stays with the team/Octoco, licensed
to the municipality for the contract term.
