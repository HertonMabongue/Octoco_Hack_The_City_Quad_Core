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

// Mirrors backend/app/config.py's gas_alert_raw / traffic_high_count,
// which mirror the firmware's own GAS_THRESHOLD / TRAFFIC_THRESHOLD in
// turn — display-only here (the backend already decides alerts/mode), but
// badges need the same numbers to explain *why* a reading looks notable.
export const GAS_ALERT_RAW = 800;
export const TRAFFIC_HIGH_COUNT = 5;

// Where the FastAPI backend lives. Set per machine in .env.local —
// never hardcode an IP here, it'll be wrong the moment anyone changes wifi.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Canonical deployed URL, used for metadataBase / OpenGraph / sitemap.
// Override with NEXT_PUBLIC_SITE_URL if the Vercel domain changes.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kleanclorridor.vercel.app";

// Default map center: roughly the Adam Tas Corridor, Stellenbosch.
export const DEFAULT_MAP_CENTER: [number, number] = [-33.9346, 18.8653];

// Insights page (app/dashboard/insights) cost-savings estimate. A fixed
// collection schedule sends a truck to every registered bin this many
// times a week regardless of fill level; comparing that to how many
// bins actually need collection is what turns the forecast into a
// savings figure instead of just a number of trips. Both constants are
// placeholder assumptions, stated on the page itself rather than buried
// in code, so tune them to the municipality's real schedule and
// per-trip cost rather than trusting the default.
export const FIXED_SCHEDULE_VISITS_PER_WEEK = 2;
export const ASSUMED_COST_PER_TRIP_ZAR = 450;

// Static asset metadata for the Library's bin registry
// (app/dashboard/library) — install date and sensor loadout aren't part
// of the live telemetry contract (backend/app/models.py's Bin), so
// they're kept here rather than invented fields on that model. Once
// there's a real asset database behind the registry, this becomes its
// seed data instead of a frontend constant.
export interface BinAssetInfo {
  installedAt: string;
  sensors: string[];
  firmware: string;
}

export const BIN_ASSET_INFO: Record<string, BinAssetInfo> = {
  "bin-01": {
    installedAt: "2026-07-14",
    sensors: ["Ultrasonic (HC-SR04)", "Gas (MQ-series)", "PIR motion", "Accelerometer"],
    firmware: "OctocoEsp32Project v1.2",
  },
  "bin-02": {
    installedAt: "2026-07-14",
    sensors: ["Ultrasonic (HC-SR04)", "Gas (MQ-series)", "PIR motion", "Accelerometer"],
    firmware: "OctocoEsp32Project v1.2",
  },
  "bin-03": {
    installedAt: "2026-08-02",
    sensors: ["Ultrasonic (HC-SR04)", "Gas (MQ-series)", "PIR motion", "Accelerometer"],
    firmware: "OctocoEsp32Project v1.2",
  },
};

export const DEFAULT_BIN_ASSET_INFO: BinAssetInfo = {
  installedAt: "Unregistered",
  sensors: ["Ultrasonic (HC-SR04)", "Gas (MQ-series)", "PIR motion", "Accelerometer"],
  firmware: "OctocoEsp32Project v1.2",
};
