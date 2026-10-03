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
| `dashboard.html` | A live forecast chart page, served by `service.py` at `/dashboard` |
| `demo.py` | Runs the model on made-up readings, with no backend needed |
| `seed_demo.py` | Fills a separate demo database with made-up readings, to test the service and chart page on their own |
| `requirements.txt` | `numpy` and `scikit-learn` |

## Run it

From the repo root, with the main backend already running on port 8000:

```bash
pip install -r backend/requirements.txt -r backend/app/machine_learning/requirements.txt
python -m uvicorn app.machine_learning.service:app --app-dir backend --port 8001
```

Then open http://localhost:8001/dashboard for the live chart page, or
http://localhost:8001/forecast for the raw data.

## Testing without the backend or sensors

`seed_demo.py` writes made-up readings for the three bins into
`backend/demo.sqlite3` (never the real database) and keeps adding one
every 10 seconds. Run it in one window:

```powershell
.\.venv\Scripts\python.exe backend\app\machine_learning\seed_demo.py
```

and start the service in another, pointed at the demo database:

```powershell
$env:DB_PATH = "$PWD\backend\demo.sqlite3"
.\.venv\Scripts\python.exe -m uvicorn app.machine_learning.service:app --app-dir backend --port 8001
```

Open http://localhost:8001/dashboard and choose "15 minutes". Close that
window (or run `Remove-Item Env:DB_PATH`) to go back to the real
database.

## The chart page

`/dashboard` shows one panel per bin, most urgent first: a "Collect by"
time, the measured fill level, and the forecast line to the collection
threshold with its 80% range. It refreshes every 5 seconds and has a
"Flag bins due within" control for the alert lead time.

It reads `GET /forecast/series`, which returns each bin's forecast row
plus its fill history (`history`), the threshold (`thresholdPct`) and
`latestFullAt`.

To show it inside the main dashboard without rebuilding it in React,
embed it:

```html
<iframe src="http://<host>:8001/dashboard?theme=light&leadHours=2"
        style="width:100%;height:900px;border:0"></iframe>
```

`theme` is `light` or `dark`. `leadHours` presets the alert lead time.
The page copies its colours from `frontend/app/globals.css`.

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
| `predictedFullAt` | Clock time of the median forecast |
| `earliestFullAt` | Clock time of the low end of the range. Schedule collection by this time |
| `collectSoon` | True when `earliestFullAt` is within the lead time, or the bin is already at the threshold |
| `lastReadingAt` | Timestamp of the reading the forecast runs from |

### The lead time

`collectSoon` looks ahead by a lead time, 2 hours by default. Change it
per request with `GET /forecast?leadHours=0.1`, or for the whole service
with the `ML_COLLECT_LEAD_HOURS` environment variable. The mock bins fill
in minutes, so use a lead time of a few minutes when demoing on mock
data.

The clock times are the latest reading's timestamp plus the forecast
hours, in the same timezone as the stored readings (UTC). Convert to
local time when displaying them.

## Litter reports: photo to recommendation

The second part of this layer turns residents' photos into advice for
the city:

```
photo -> is it waste? (classifier.py) -> where was it taken?
      -> pin on the map -> heatmap -> clusters of reports (hotspots.py)
      -> "add a bin", "add staff" or "send a clean-up crew"
```

Open http://localhost:8001/hotspots/map. The page shows the heatmap, the
bins, each problem area with its recommendation, and a form to send a
photo report.

| File | Purpose |
|---|---|
| `classifier.py` | Pretrained image model (CLIP, zero-shot): waste or not, and which type |
| `hotspots.py` | Reads reports, clusters them with DBSCAN, and applies the recommendation rules |
| `hotspots.html` | The map page |
| `static/` | Leaflet and its heatmap plugin (BSD-2 licences included) |
| `requirements-vision.txt` | Extra packages for the photo model |

### How each step works

- **Waste or not:** the model scores the photo against short text
  descriptions ("household rubbish bags dumped on the ground", "a clean
  street with no rubbish", and so on). A photo that best matches the
  no-waste description is rejected and never pinned.
- **Location:** the photo's own geotag if it has one, otherwise the
  browser's location or a point clicked on the map. Many phones strip
  geotags on upload, which is why the fallback exists.
- **Hotspots:** DBSCAN groups reports within about 80 m of each other. A
  group of 3 or more is a problem area.
- **Recommendation:** mostly rubble means a clean-up crew. No bin within
  150 m means add a bin. A bin nearby but reports anyway means more
  staff or more frequent collection. The thresholds are constants at the
  top of `hotspots.py`.

It reads the community app's reports from the backend database
(read-only) as well as reports sent through its own form. Classifications
and its own reports live in `backend/ml_labels_<database>.sqlite3`. Photos
sent through the form are deleted after classification.

### Installing the photo model

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\app\machine_learning\requirements-vision.txt
```

This is a large install, and the model downloads about 600 MB the first
time a photo is classified. Without it everything else works, and photos
are pinned as "Not classified". Try the model on one photo at
http://localhost:8001/docs under `POST /classify`.

### Limits

- **The model is untested here.** It was written without access to the
  model download, so check it on real photos before relying on it.
- **Reports show where people report,** not where all the litter is.
- **The recommendation rules are simple thresholds,** not learned.

## Showing it on the dashboard

Two options, both for whoever owns those files to decide:

- Point the frontend's forecast fetch at `http://<host>:8001/forecast`,
  and show a "collect soon" badge where `collectSoon` is true.
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
