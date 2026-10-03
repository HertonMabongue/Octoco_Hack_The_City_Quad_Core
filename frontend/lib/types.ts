// Domain types shared across the municipal dashboard and the community app.
// Mirrors backend/app/models.py field-for-field — keep both in sync.

export type BinStatus = "good" | "warning" | "critical";
export type DeviceMode = "normal" | "maintenance" | "emergency";
export type DeviceConnection = "online" | "offline";

export interface Bin {
  id: string;
  label: string;
  lat: number;
  lng: number;
  fillPct: number;
  status: BinStatus;
  mode: DeviceMode;
  connection: DeviceConnection;
  lastUpdated: string;
  distanceCm?: number | null;
  overflowFlag?: boolean | null;
  uptimeS?: number | null;
  // The other three independent sensor subsystems the hardware actually
  // carries (see firmware/src/OctocoEsp32Project.ino) — each optional
  // since a bin reports whichever of its four subsystems are fitted.
  gasRaw?: number | null;
  peopleCount?: number | null;
  movementAlert?: boolean | null;
}

export interface BinHistoryPoint {
  timestamp: string;
  fillPct: number;
}

export type AlertType = "overflow" | "littering" | "offline" | "hazard" | "tamper";

export interface Alert {
  id: string;
  binId: string;
  type: AlertType;
  message: string;
  createdAt: string;
  resolved: boolean;
}

export interface ReportInput {
  lat?: number;
  lng?: number;
  note?: string;
  photo?: File | null;
}

export type ReportStatus = "queued" | "received";

export interface ReportResult {
  id: string;
  status: ReportStatus;
}

// A stored community report, for the municipal dashboard's incident log
// (app/dashboard/library). Distinct from ReportInput/ReportResult above,
// which are the submit-time shapes the community app uses.
export interface ReportRecord {
  id: string;
  lat: number | null;
  lng: number | null;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  resolved: boolean;
}

export type RiskLevel = "low" | "medium" | "high";
export type ForecastSource = "heuristic" | "model";

// One bin's projected time to needing collection (app/dashboard/insights).
// `source` distinguishes today's naive projection from the real model in
// backend/app/forecasting/ once it's trained — same shape either way.
export interface ForecastPoint {
  binId: string;
  label: string;
  predictedFullInHours: number | null;
  riskLevel: RiskLevel;
  source: ForecastSource;
}
