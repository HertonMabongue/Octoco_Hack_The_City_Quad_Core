# Machine learning layer

Runs inside the main backend (no separate service) and shows on the
dashboard's Insights page.

| File | Purpose |
|---|---|
| `model.py` | Bayesian regression: collection forecast and bin placement. Pure functions over reading rows |
| `classifier.py` | Pretrained image model (CLIP, zero-shot): is it waste, and which type |
| `hotspots.py` | Clusters located reports with DBSCAN and applies the recommendation rules |
| `seed_reports.py` | Adds/removes simulated reports for the hotspot map |

Wired in through `routers/forecast.py`, `routers/hotspots.py` and
`routers/reports.py` (photo upload). Types: `models.py` and
`frontend/lib/types.ts`. UI: `frontend/components/dashboard/ForecastPanels.tsx`
and `frontend/components/hotspots/`.

## Forecast model

Each pair of consecutive readings is one data point:

```
fill increase = base_rate * hours + fill_per_visit * visits + noise
```

- `fill increase` is from the ultrasonic sensor (`fill_pct`).
- `visits` is from the presence sensor (`people_count`), a count per
  `PEOPLE_WINDOW_S` (10 s) window scaled to the time between readings.
  Keep it equal to `TRAFFIC_INTERVAL` in the firmware.
- `base_rate` is filling the visit count doesn't explain.

Fitted with scikit-learn's `BayesianRidge`. It draws 4,000 samples from the
posterior, turns each into a time-to-threshold, and reports the 10th, 50th
and 90th percentiles (the forecast and an 80% range). Only readings since
the last emptying (a drop of more than 30%) are used.

`GET /api/forecast` returns one row per bin in `DEVICE_REGISTRY`:
`status` (`ok`, `at_threshold`, `not_filling`, `not_enough_data`),
`predictedFullInHours` with `predictedLowHours` / `predictedHighHours`,
`fillPerVisitPct`, `visitsPerHour`, `lastReadingAt`, and the `history` it
was fitted on. Clock times are `lastReadingAt` plus the hours; the
dashboard computes them, including the "flag bins due within" lead time.

`GET /api/forecast/placement?visitsPerHour=120` pools every bin's readings
to estimate how fast a new bin would fill at a spot with that footfall
(not shown in the UI yet).

## Photo reports to recommendations

```
photo -> is it waste? (classifier.py) -> where? (photo geotag, else the
sent lat/lng) -> stored on the report -> clusters (hotspots.py)
      -> "add a bin", "more staff" or "send a clean-up crew"
```

- A photo that best matches "a clean street" is rejected and deleted.
- Without the vision packages (`backend/requirements-vision.txt`), photos
  are stored with no waste type and the form says they weren't checked.
- 3 or more reports within about 80 m make a hotspot. Mostly rubble means
  a clean-up crew; no bin within 150 m means add a bin; otherwise more
  staff. Thresholds are constants at the top of `hotspots.py`.
- Reports resolved on the Library page drop off the map.

## Limits

- The photo model is untested on real photos here. Check it before relying on it.
- The forecast assumes recent footfall continues; it doesn't know time of day.
- The visit count is an index, not a headcount (a presence sensor merges
  people who arrive together).
- Reports show where people report, not where all the litter is.
