// Shared constants for the dashboard + community app.
// Centralising these means both sides (the municipal dashboard and the
// public app) agree on what "overflowing" means, and on what colour means what.
import type { BinStatus } from "./types";

// Status colours, as CSS custom properties defined in app/globals.css
// (--status-good / --status-warning / --status-critical), so Tailwind
// utilities (bg-status-good etc.) and this map always stay in sync.
export const STATUS_COLORS: Record<BinStatus, string> = {
  good: "hsl(var(--status-good))",
  warning: "hsl(var(--status-warning))",
  critical: "hsl(var(--status-critical))",
};

export const STATUS_LABELS: Record<BinStatus, string> = {
  good: "Good",
  warning: "Filling up",
  critical: "Needs collection",
};

// Ultrasonic fill-level thresholds (percent full). Tune these once you
// know your bin depth and where the sensor is mounted. Must match
// backend/app/config.py's fill_warning_pct / fill_critical_pct.
export const FILL_THRESHOLDS = {
  warning: 60,
  critical: 85,
};

export function fillStatus(fillPct: number): BinStatus {
  if (fillPct >= FILL_THRESHOLDS.critical) return "critical";
  if (fillPct >= FILL_THRESHOLDS.warning) return "warning";
  return "good";
}

// Where the FastAPI backend lives. Set per machine in .env.local —
// never hardcode an IP here, it'll be wrong the moment anyone changes wifi.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Default map center: roughly the Adam Tas Corridor, Stellenbosch.
export const DEFAULT_MAP_CENTER: [number, number] = [-33.9346, 18.8653];
