# Machine learning layer

A Bayesian linear regression that learns how much a bin fills per person
who visits, and uses that to answer two questions:

1. **When will this bin need collecting?** `GET /forecast`
2. **How fast would a bin fill at a spot with this footfall?**
   `GET /forecast/placement?visitsPerHour=120`

Everything is in this folder. No existing file in the repo is changed.

| File | Purpose |
|---|---|
| `model.py` | The regression (fit, forecast, placement). Pure functions |
| `data.py` | Reads stored readings from the backend's SQLite file, read-only |
| `service.py` | A small FastAPI app that serves the results on its own port |
| `requirements.txt` | `numpy` and `scikit-learn` |

## Run it

From the repo root, with the main backend already running on port 8000:

```bash
pip install -r backend/requirements.txt -r backend/app/machine_learning/requirements.txt
python -m uvicorn app.machine_learning.service:app --app-dir backend --port 8001
```

Then open http://localhost:8001/forecast.

## The model

Each pair of consecutive readings is one data point:

```
fill increase = base_rate * hours + fill_per_visit * visits + noise
```

- `fill increase` comes from the ultrasonic sensor (`fill_pct`).
- `visits` comes from the presence sensor (`people_count`). The firmware
  reports a count per 10-second window, so the model scales it to the
  time between the two readings (`PEOPLE_WINDOW_S` in `model.py` must
  match `TRAFFIC_INTERVAL` in the firmware).
- `base_rate` is filling that the visit count doesn't explain.
- `fill_per_visit` is the percent a bin gains per counted visit.

It is fitted with scikit-learn's `BayesianRidge`. Being Bayesian, the fit
is a probability distribution over `base_rate` and `fill_per_visit`, not
one pair of numbers. The model draws 4,000 samples from it, turns each
into a time-to-threshold, and reports the 10th, 50th and 90th
percentiles: the forecast and an 80% range.

Only readings since the bin was last emptied are used (a drop of more
than 30% counts as an emptying).

## What `/forecast` returns

One row per bin in `DEVICE_REGISTRY`, with the same field names as the
main backend's `/api/forecast` plus the model's extras:

| Field | Meaning |
|---|---|
| `status` | `ok`, `at_threshold`, `not_filling` or `not_enough_data` |
| `predictedFullInHours` | Median hours until the collection threshold (null unless `ok` or `at_threshold`) |
| `predictedLowHours`, `predictedHighHours` | The 80% range |
| `riskLevel` | Same bands as the main backend |
| `fillPerVisitPct` | Percent of the bin gained per counted visit |
| `visitsPerHour` | Recent footfall at this bin |

## Showing it on the dashboard

Two options, both for whoever owns those files to decide:

- Point the frontend's forecast fetch at `http://<host>:8001/forecast`.
- Or call the model from the main backend, in
  `backend/app/routers/forecast.py`:

  ```python
  from app.machine_learning import data, model
  points = data.history_with_traffic(device_id, settings.max_history_points)
  result = model.predict(points, settings.fill_critical_pct)
  ```

## Limits

- **On the current mock data, fill per visit is meaningless.**
  `mock_generator.py` draws fill and people count independently, so
  there is no relationship to learn. The time-to-threshold forecast is
  still valid there, because `base_rate` absorbs the filling. Real
  readings, or a mock where fill depends on footfall, are needed before
  quoting `fillPerVisitPct` or the placement estimate.
- **Short memory.** It sees the last `max_history_points` readings (50,
  about 25 minutes at one reading per 30 s). The forecast assumes recent
  footfall continues, so it doesn't know about time of day.
- **The visit count is an index, not a headcount.** A presence sensor
  merges people who arrive together.
- **`fillPerVisitPct` is noisy on 50 readings.** In simulation its error
  was typically around a fifth of the true value.
