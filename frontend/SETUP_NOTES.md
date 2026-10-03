# Setup notes

## 1. Install the extra dependencies

These files use a map and a chart, neither of which you had installed yet:

```
npm install leaflet react-leaflet chart.js react-chartjs-2
```

## 2. Environment variable

Copy `.env.local.example` to `.env.local` and point it at wherever your
FastAPI backend runs (localhost while developing, the venue machine's
address during the event). `.env.local` should already be in Next's
default `.gitignore` — don't commit it.

## 3. Files that might collide with what create-next-app generated

`app/layout.js`, `app/page.js`, and `app/globals.css` are provided here
as working starting points. If your existing versions have content you
want to keep, diff before overwriting rather than blindly replacing.

## 4. Backend contract this frontend expects

`lib/api.js` calls these endpoints and falls back to mock data if any of
them aren't there yet, so the frontend works standalone in the meantime.
Share this list with whoever builds the FastAPI side:

- `GET  /api/bins` → array of `{ id, label, lat, lng, fillPct, status, mode, lastUpdated }`
- `GET  /api/bins/:id` → one bin, same shape
- `GET  /api/bins/:id/history` → array of `{ timestamp, fillPct }`
- `GET  /api/alerts` → array of `{ id, binId, type, message, createdAt }`
- `POST /api/reports` (multipart form: `lat`, `lng`, `note`, `photo`) → `{ id, status }`

`status` is one of `good` / `warning` / `critical` (see `lib/constants.js`
for the fill-percent thresholds that decide which).

## 5. Leaflet note

`components/map/BinMap.js` is imported with `dynamic(..., { ssr: false })`
in every page that uses it. Don't import it directly — Leaflet needs
`window`, which doesn't exist during server rendering, and you'll get a
build error without the dynamic wrapper.
