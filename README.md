# Streetwise — Intelligent Waste Management System

**Hack the City 2026 — Team Quad-Core — Waste & Recycling challenge**

The Adam Tas Corridor's bins overflow before anyone notices, littering
goes unreported, and the municipality has no live insight into either.
Streetwise fixes that with sensor nodes that stream bin fill-level to
a municipal dashboard (live map, trends, alerts) and a community app that
lets residents report littering straight into the same alert feed.

## Architecture

```
firmware/   ESP32 (ultrasonic + gas + PIR + accelerometer, OLED + LED) —
            joins wifi and POSTs raw readings to the backend's public URL
            (ngrok); no MQTT on the device itself
backend/    Python/FastAPI — the one thing that speaks the city's MQTT
            protocol; persists readings/alerts/reports and exposes a
            typed REST API to the frontend
frontend/   Next.js (App Router) — municipal dashboard + community app,
            deployed at https://streetwise-app.vercel.app
```

Firmware never talks to the city broker directly — it POSTs JSON over
HTTP(S) to the backend (far more stable on event wifi than a persistent
MQTT connection), and the backend is the one place that
speaks the city's protocol correctly (topics, retained status, LWT,
reconnects). This also lets the backend go live on the city broker with
generated readings today, before firmware is ready — see Mock telemetry.

**Tech stack:** TypeScript (strict) + Tailwind + shadcn/ui on the
frontend; Pydantic + typed FastAPI routers on the backend. The same
`Bin`/`Alert`/`Report` shapes exist as Pydantic models
(`backend/app/models.py`) and TypeScript interfaces
(`frontend/lib/types.ts`) — keep both in sync.

**Deployment:** frontend on Vercel, **https://streetwise-app.vercel.app**

## City mainframe integration

- **Team ID** `kmm4v` · **Broker** `192.168.101.123:1883`
- **Telemetry**, every 30s, `hack/{team}/{device}/telemetry`:
  ```json
  {
    "metrics": {
      "uptime_s": 128,
      "collection_priority_pct": 68.0,
      "hours_to_full_h": 5.2,
      "safety_incidents_24h_n": 0
    }
  }
  ```
  These are **derived**, not raw sensor values: the device posts raw
  readings to the backend (for our own dashboard, alerts and forecast), and
  `select_city_metrics()` in `backend/app/telemetry.py` publishes
  `collection_priority_pct` (how urgently a truck is needed: the worse of
  smoothed fill and forecast time pressure), `hours_to_full_h` (forecast
  time until collection is needed: 0 = now, 168 = a week or more) and
  `safety_incidents_24h_n` (gas hazards + tamper events in the last 24 h).
  Instant emergencies also reach the city through the retained status `mode`.
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
POST {PUBLIC_API_URL}/api/devices/{device_id}/readings
{"uptime_s": 128, "fill_pct": 64.0, "distance_cm": 6.3, "overflow_flag": false,
 "gas_raw": 210, "people_count": 3, "movement_alert": false, "mode": "normal"}
```

`device_id` must be in `DEVICE_REGISTRY` (`backend/app/config.py`).
`backend/app/telemetry.py` stores it, evaluates alerts, derives `mode`,
and relays to the city.

**Mock telemetry:** `MOCK_TELEMETRY_ENABLED=true` (default) generates
readings for every registered device through the same code path a real
firmware POST uses (`backend/app/mock_generator.py`), so the backend is
live on the city board before firmware is. It stands down for a device
automatically while real firmware is posting for it — nothing to switch off. A watchdog (`app/watchdog.py`) marks a device
offline if it stops reporting for `OFFLINE_AFTER_S` (default 90s).

## Going live (ngrok + Vercel + firmware)

There is **one env file**: the repo-root `.env` (template: `.env.example`).
Backend, local frontend and firmware all read it.

1. `cp .env.example .env`, then set `WIFI_SSID`, `WIFI_PASSWORD` (2.4 GHz
   network) and `DEVICE_SLUG`.
2. `./start.sh`, then in another terminal run ngrok against **`127.0.0.1`**
   (not plain `8000`/`localhost` — ngrok tries IPv6 first, the backend only
   listens on IPv4, and you get `ERR_NGROK_8012`). A static domain keeps the
   URL fixed: `ngrok http --url=<your-domain> 127.0.0.1:8000`.
3. Put the https URL in `.env` as **`PUBLIC_API_URL`** — the only line that
   changes per tunnel. The firmware and the frontend both read it.
4. Vercel: add the same `PUBLIC_API_URL` under Project → Settings →
   Environment Variables and redeploy (Vercel can't see your local `.env`;
   the value is baked in at build time).
5. Flash: `cd firmware && pio run -t upload && pio device monitor`. Expect
   `wifi up` then `POST … -> 202` every 30 s; the OLED bottom line shows
   `LIVE`. (Arduino IDE: copy `firmware/src/secrets.h.example` to
   `secrets.h` instead — PlatformIO is what reads `.env`.)
6. Check `GET {PUBLIC_API_URL}/health` (city broker per device) and the
   dashboard.

The firmware's URL is compiled in, so changing it means re-flashing.
Browser origins allowed to call the API are `CORS_ORIGINS` (defaults to the
Vercel site + localhost; Vercel preview URLs are matched automatically).
ngrok's free interstitial page is bypassed by a header the frontend and
firmware already send.

## Data handling

Residents report anonymously (no login). Photos are stripped of metadata,
locations rounded to ~11 m, and photos deleted after resolution (24 h) or
30 days at most; withdrawn or non-waste photos are deleted immediately.
Full detail, POPIA mapping and honest limitations:
[`docs/DATA_PROTECTION.md`](docs/DATA_PROTECTION.md). Panel prep:
[`docs/JUDGE_READINESS.md`](docs/JUDGE_READINESS.md).

## API contract (backend ↔ frontend)

CamelCase everywhere; `backend/app/models.py` is the source of truth, mirrored in `frontend/lib/types.ts`.

| Method | Path                       | Description                                                                                         |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/api/bins`                | All bins, derived from latest telemetry + status                                                    |
| GET    | `/api/bins/:id`            | One bin                                                                                             |
| GET    | `/api/bins/:id/history`    | Fill-level history                                                                                  |
| GET    | `/api/alerts`              | Active alerts (resolved ones hidden by default)                                                     |
| POST   | `/api/alerts/:id/resolve`  | Mark an alert resolved                                                                              |
| POST   | `/api/reports`             | Multipart: `consent` (required), `lat`, `lng`, `note`, `photo` (checked for waste; `status: "rejected"` if none). Returns a one-time `withdrawToken` |
| GET    | `/api/reports`             | All community reports (resolved included)                                                           |
| GET    | `/api/reports/:id/photo`   | The report's (metadata-stripped) photo, until retention deletes it                                  |
| DELETE | `/api/reports/:id`         | Author withdraws their report + photo (`X-Withdraw-Token` header)                                   |
| POST   | `/api/reports/:id/resolve` | Mark a report resolved                                                                              |
| GET    | `/api/privacy/policy`      | Live retention settings (drives the `/privacy` page)                                                |
| POST   | `/api/privacy/purge`       | Run the retention sweep now (it also runs hourly)                                                   |
| GET    | `/api/forecast`            | Per-bin collection forecast + the readings it used (see Machine learning below)                     |
| GET    | `/api/forecast/placement`  | `?visitsPerHour=N` — how fast a new bin would fill at that footfall                                 |
| GET    | `/api/hotspots`            | Litter hotspots from photo reports, with a recommended action each                                  |
| GET    | `/health`                  | Liveness + per-device city broker connection state                                                  |

`Bin.status` (`good`/`warning`/`critical`) is derived from `fillPct`
against `FILL_WARNING_PCT`/`FILL_CRITICAL_PCT` — tune in
`backend/app/config.py`, mirror in `frontend/lib/constants.ts`.

The frontend falls back to mock data if the backend is unreachable, so
either side works standalone.

## Quick start

```bash
./start.sh          # macOS/Linux, or Windows via Git Bash/WSL
```

```powershell
.\start.ps1          # Windows PowerShell, no bash required
```

Either one manages its own `.venv`, installs both sides' deps if
missing, seeds `.env`, and runs backend (`:8000`, listening on all
interfaces so the ESP32 can reach it over the LAN) + frontend (`:3000`)
together. Ctrl+C stops both. Tests: `.venv/bin/python -m pytest backend`.

<details>
<summary>Running each part by hand</summary>

**Backend**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # see "Going live"
uvicorn main:app --reload --app-dir backend
```

```
backend/
  main.py          FastAPI app, CORS, background task lifecycle
  app/
    config.py        Settings + device registry
    privacy.py        Photo metadata stripping, coordinate rounding
    retention.py       Scheduled deletion of photos, reports, readings
    security.py         Rate limiter for the public report endpoint
    db.py             SQLite persistence
    models.py          Pydantic request/response models
    telemetry.py         Reading → DB + alerts + relay to the city
    city_client.py        Speaks the city MQTT protocol (+ HTTP fallback)
    mock_generator.py     Generates readings until firmware is posting
    watchdog.py             Marks stale devices offline
    routers/                 bins, alerts, reports, ingest, forecast, hotspots
    machine_learning/         Fill forecast, photo classifier, hotspots —
                               see its README
```

**Frontend**

```bash
cd frontend && npm install     # reads the repo-root .env (see next.config.js)
npm run dev        # or: lint / typecheck / build / format
```

**Firmware** — `cd firmware && pio run -t upload`. Config comes from the
repo-root `.env` via `firmware/load_env.py`. Three modes: normal (LED off),
maintenance (slow blink, BOOT button toggles, alerts paused), emergency
(fast blink: gas, tamper or bin ≥ 85% full). Networking runs in its own
FreeRTOS task so it never stalls sensing.

</details>

## Machine learning

- **Collection forecast** (`model.py`) — a Bayesian regression of fill gained
  against time and visits, fitted per bin on the `readings` table
  (`fill_pct` from the ultrasonic sensor, `people_count` from the PIR). It
  reads whatever is stored, so it works the same on mock and real firmware
  readings.
- **Photo classifier** (`classifier.py`) — a pretrained CLIP model checks
  that a resident's photo shows waste, and which type. Optional install:
  `pip install -r backend/requirements-vision.txt`. Without it, photos are stored unchecked.
- **Hotspots** (`hotspots.py`) — clusters located reports (DBSCAN) and
  recommends a bin, more staff, or a clean-up crew.

**Switching to real sensor readings:** nothing to do — the mock skips any bin
whose firmware is posting.
