"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FILL_THRESHOLDS } from "@/lib/constants";
import type { ForecastPoint } from "@/lib/types";

// One panel per bin, most urgent first: a "Collect by" time, the measured
// fill level, and the forecast line to the collection threshold with its
// 80% range. Driven by what backend/app/routers/forecast.py returns (the
// Bayesian model in machine_learning/model.py), so it is the same on real
// sensor readings as on the mock generator's. Data arrives as props and is
// refreshed by the page's AutoRefresh, so this component never fetches.

const LEAD_OPTIONS: { hours: number; label: string }[] = [
  { hours: 5 / 60, label: "5 minutes" },
  { hours: 0.25, label: "15 minutes" },
  { hours: 1, label: "1 hour" },
  { hours: 2, label: "2 hours" },
  { hours: 6, label: "6 hours" },
];
const DEFAULT_LEAD_HOURS = 2;
const MIN_READINGS = 9; // the model needs 8 intervals, so 9 readings
const HOUR_MS = 3_600_000;

const W = 640;
const H = 230;
const M = { l: 34, r: 14, t: 14, b: 24 };

const mono = "font-mono tabular-nums";

interface Times {
  last: number;
  mid: number;
  low: number;
  high: number;
}

// Clock times are the last reading's timestamp plus the model's hours.
function forecastTimes(bin: ForecastPoint): Times | null {
  if (
    bin.status !== "ok" ||
    !bin.lastReadingAt ||
    bin.predictedFullInHours == null ||
    bin.predictedLowHours == null ||
    bin.predictedHighHours == null
  ) {
    return null;
  }
  const last = Date.parse(bin.lastReadingAt);
  return {
    last,
    mid: last + bin.predictedFullInHours * HOUR_MS,
    low: last + bin.predictedLowHours * HOUR_MS,
    high: last + bin.predictedHighHours * HOUR_MS,
  };
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function span(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h${m ? ` ${m} min` : ""}`;
}

// Most urgent first: already at the threshold, then by earliest time, then the rest.
function urgency(bin: ForecastPoint): number {
  if (bin.status === "at_threshold") return 0;
  return forecastTimes(bin)?.low ?? Infinity;
}

type Tone = "good" | "warning" | "critical" | "secondary";

interface Summary {
  headline: ReactNode;
  detail: ReactNode;
  badge: { tone: Tone; text: string };
}

function Num({ children }: { children: ReactNode }) {
  return <span className={`${mono} text-foreground`}>{children}</span>;
}

function summarise(bin: ForecastPoint, now: number, leadHours: number): Summary {
  const threshold = Math.round(FILL_THRESHOLDS.critical);
  const lastFill = bin.history[bin.history.length - 1]?.fillPct ?? null;
  const fill =
    lastFill == null ? null : (
      <>
        <Num>{Math.round(lastFill)}%</Num> full now
      </>
    );
  const times = forecastTimes(bin);

  if (times) {
    const wait = times.low - now;
    const collectSoon = wait <= leadHours * HOUR_MS;
    return {
      headline: (
        <>
          Collect by <span className={`${mono} whitespace-nowrap`}>{clock(times.low)}</span>
        </>
      ),
      detail: (
        <>
          {fill}, {wait > 0 ? `in ${span(wait)}` : "overdue"}. Expected to reach {threshold}% at{" "}
          <Num>{clock(times.mid)}</Num>, between <Num>{clock(times.low)}</Num> and{" "}
          <Num>{clock(times.high)}</Num>.
        </>
      ),
      badge: collectSoon
        ? { tone: "warning", text: "Collect soon" }
        : { tone: "good", text: "On track" },
    };
  }
  if (bin.status === "at_threshold") {
    return {
      headline: "Collect now",
      detail: (
        <>
          {fill}, past the {threshold}% collection threshold.
        </>
      ),
      badge: { tone: "critical", text: "Needs collection" },
    };
  }
  if (bin.status === "not_filling") {
    return {
      headline: "No collection needed yet",
      detail: <>{fill}. The fill level isn&apos;t rising, so there is nothing to forecast.</>,
      badge: { tone: "good", text: "Not filling" },
    };
  }
  return {
    headline: "Gathering readings",
    detail: (
      <>
        {fill ? <>{fill}. </> : null}A forecast appears after {MIN_READINGS} readings since the bin
        was last emptied. This bin has <Num>{bin.history.length}</Num> stored.
      </>
    ),
    badge: { tone: "secondary", text: "No forecast yet" },
  };
}

function ForecastChart({ bin }: { bin: ForecastPoint }) {
  const pts = bin.history.map((p) => ({ t: Date.parse(p.ts), v: p.fillPct }));
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last || pts.length < 2) return null;
  const times = forecastTimes(bin);
  const thr = FILL_THRESHOLDS.critical;

  // Don't let a very uncertain late end squash the rest of the chart.
  let tEnd = times
    ? Math.min(times.high, last.t + 3 * (times.mid - last.t))
    : last.t + 0.15 * (last.t - first.t);
  tEnd += 0.04 * (tEnd - first.t);

  const x = (t: number) => M.l + ((t - first.t) / (tEnd - first.t)) * (W - M.l - M.r);
  const y = (v: number) => M.t + ((100 - Math.max(0, Math.min(100, v))) / 100) * (H - M.t - M.b);

  const line = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const label = times
    ? `Fill level history, with a forecast reaching ${Math.round(thr)}% around ${clock(times.mid)}`
    : "Fill level history";

  const axisText = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${bin.label}. ${label}`}
      className="block h-auto w-full"
    >
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
          <text x={M.l - 6} y={y(v) + 3} textAnchor="end" className="font-mono" style={axisText}>
            {v}
          </text>
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((i) => {
        const t = first.t + ((tEnd - first.t) * i) / 4;
        return (
          <text
            key={i}
            x={x(t)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
            className="font-mono"
            style={axisText}
          >
            {clock(t)}
          </text>
        );
      })}

      <line
        x1={M.l}
        x2={W - M.r}
        y1={y(thr)}
        y2={y(thr)}
        stroke="hsl(var(--status-critical))"
        strokeDasharray="4 4"
      />
      <text
        x={M.l + 4}
        y={y(thr) - 5}
        style={{ fontSize: 10, fontWeight: 500, fill: "hsl(var(--status-critical))" }}
      >
        Collect at {Math.round(thr)}%
      </text>

      <polygon
        points={`${x(first.t)},${y(0)} ${line} ${x(last.t)},${y(0)}`}
        fill="hsl(var(--primary) / 0.08)"
      />
      <polyline
        points={line}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {times && (
        <>
          <polygon
            points={`${x(last.t)},${y(last.v)} ${x(times.low)},${y(thr)} ${x(Math.min(times.high, tEnd))},${y(thr)}`}
            fill="hsl(var(--status-warning) / 0.18)"
          />
          <line
            x1={x(last.t)}
            y1={y(last.v)}
            x2={x(times.mid)}
            y2={y(thr)}
            stroke="hsl(var(--status-warning))"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
          <circle
            cx={x(times.mid)}
            cy={y(thr)}
            r={4.5}
            fill="hsl(var(--status-warning))"
            stroke="hsl(var(--card))"
            strokeWidth={2}
          />
        </>
      )}
      <circle
        cx={x(last.t)}
        cy={y(last.v)}
        r={4.5}
        fill="hsl(var(--primary))"
        stroke="hsl(var(--card))"
        strokeWidth={2}
      />
    </svg>
  );
}

function ChartKey() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-0 w-4 border-t-2 border-primary" />
        Measured fill
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-0 w-4 border-t-2 border-dashed border-status-warning" />
        Forecast
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-2 w-4 rounded-sm bg-status-warning/30" />
        80% range
      </span>
    </div>
  );
}

export default function ForecastPanels({ forecast }: { forecast: ForecastPoint[] }) {
  const [leadHours, setLeadHours] = useState(DEFAULT_LEAD_HOURS);
  // Clock times and "in 25 min" depend on the viewer's timezone and the
  // current time, so they render after mount only (no hydration mismatch).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...forecast].sort((a, b) => urgency(a) - urgency(b));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          When each bin will reach its collection threshold, so a truck can get there first.
        </p>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Flag bins due within
          <select
            value={leadHours}
            onChange={(e) => setLeadHours(Number(e.target.value))}
            className="rounded-md border border-input bg-card px-2 py-1.5 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {LEAD_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bins are registered yet. Add one to DEVICE_REGISTRY in the backend config.
        </p>
      ) : now === null ? (
        <div className="grid gap-4">
          {sorted.map((bin) => (
            <Skeleton key={bin.binId} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4" aria-live="polite">
          {sorted.map((bin) => {
            const s = summarise(bin, now, leadHours);
            return (
              <Card key={bin.binId} className="grid gap-6 p-5 md:grid-cols-[280px_1fr]">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{bin.label}</h3>
                  <p className="mt-1.5 font-display text-2xl font-semibold leading-tight tracking-tight">
                    {s.headline}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{s.detail}</p>
                  {bin.fillPerVisitPct != null && bin.visitsPerHour != null && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Each visit adds about <Num>{bin.fillPerVisitPct}%</Num> at roughly{" "}
                      <Num>{bin.visitsPerHour}</Num> visits an hour.
                    </p>
                  )}
                  <Badge variant={s.badge.tone} dot className="mt-3">
                    {s.badge.text}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <ForecastChart bin={bin} />
                  {bin.status === "ok" && <ChartKey />}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Forecast: Bayesian regression of fill gained against time and visits.
      </p>
    </div>
  );
}
