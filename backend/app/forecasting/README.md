# Forecasting

Scaffold only — no model code here yet. This package is where the
fill-rate prediction model (linear/Bayesian regression) goes once it's
ready to be built.

## Goal

Right now the system only reacts: a bin crosses `FILL_CRITICAL_PCT` and an
`overflow` alert fires (see `app/telemetry.py::record_reading`). The
goal here is to get ahead of that — given a bin's recent fill-level
history, predict its fill rate and estimate when it'll actually hit full,
so collection can be scheduled proactively instead of reactively. That's
also a genuinely strong pitch point (predictive vs. reactive monitoring).

## Data available

Historical readings are already persisted — no new data pipeline needed,
just read what's there:

- `app.db.history(device_id, limit)` → chronological
  `[{"ts": <iso str>, "fill_pct": <float>}, ...]` for one bin. Fill only —
  widen it (or add a sibling) to return the other sensor columns.
- `app.db.latest_reading_by_device()` → latest reading per bin, if the
  model needs current state across all bins at once.

Each reading stores four signals: `fill_pct`/`distance_cm` (ultrasonic),
`people_count` (PIR), `gas_raw` (gas), `movement_alert` (accelerometer).
Time-to-full is the main model; the rest can be features or their own
models (hazard trend, tamper anomaly).

Both are plain functions in `app/db.py` — import and call them directly,
no need to go through the REST API internally.

## Suggested shape when you start

1. **Model code** goes in this package (e.g. `model.py` for the
   fit/predict logic, `train.py` as a script entrypoint that reads from
   the DB and writes a fitted model out).
2. **Trained artifacts** (pickled/joblib model files, etc.) go in
   `artifacts/` — it's gitignored on purpose. Treat artifacts as
   regenerable from `train.py`, not something to commit.
3. **Exposing it** — once there's a `predict(device_id)` function worth
   calling from the API, add a Pydantic response model to `app/models.py`
   (e.g. `BinForecast`) and a route in a new `app/routers/forecast.py`,
   registered in `backend/main.py` the same way `bins`/`alerts`/`reports`
   are. Something like `GET /api/bins/{id}/forecast` would slot naturally
   next to the existing `/api/bins/{id}/history`.
4. **Dependencies** — put anything beyond the base backend stack (numpy,
   scikit-learn, pymc, etc.) in `backend/requirements-ml.txt`, not the
   main `requirements.txt`. Keeps the core backend install light for
   anyone not touching this part. Wire it into `start.sh` once it's
   actually used.

Nothing here is prescriptive beyond the data access points above — model
choice, feature engineering, and the exact prediction output shape are
yours to decide.
