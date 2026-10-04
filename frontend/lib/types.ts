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

export type ReportStatus = "queued" | "received" | "rejected";

// Outcome of a community photo report. "rejected" means the photo
// classifier (backend/app/machine_learning/classifier.py) found no waste
// in it, so nothing was stored. "queued" is only ever the offline mock.
export interface ReportResult {
  id: string;
  status: ReportStatus;
  wasteType?: string | null;
  wasteLabel?: string | null;
  confidence?: number | null;
  message?: string | null;
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
  wasteLabel?: string | null;
}

export type ForecastStatus = "ok" | "at_threshold" | "not_filling" | "not_enough_data";

export interface ForecastHistoryPoint {
  ts: string;
  fillPct: number;
}

// One bin's time-to-collection forecast from the Bayesian model in
// backend/app/machine_learning/model.py, plus the readings it was made
// from so the Insights page can chart them. The three `predicted*Hours`
// values (median and 80% range) count from `lastReadingAt`, and are set
// only when `status` is "ok" (all 0 for "at_threshold").
export interface ForecastPoint {
  binId: string;
  label: string;
  status: ForecastStatus;
  predictedFullInHours: number | null;
  predictedLowHours: number | null;
  predictedHighHours: number | null;
  fillPerVisitPct: number | null;
  visitsPerHour: number | null;
  lastReadingAt: string | null;
  history: ForecastHistoryPoint[];
}

export type HotspotAction = "add_bin" | "more_staff" | "cleanup_crew";

// A cluster of nearby littering reports and what the city should do about
// it (backend/app/machine_learning/hotspots.py).
export interface Hotspot {
  id: string;
  lat: number;
  lng: number;
  count: number;
  dominantLabel: string;
  recyclableShare: number;
  action: HotspotAction;
  title: string;
  reason: string;
}

export interface HotspotReport {
  id: string;
  lat: number;
  lng: number;
  type: string;
  typeLabel: string;
  confidence: number | null;
  createdAt: string;
  hotspot: string | null;
  simulated: boolean;
}

export interface HotspotsResponse {
  classifierInstalled: boolean;
  summary: {
    reports: number;
    hotspots: number;
    addBin: number;
    moreStaff: number;
    cleanupCrew: number;
  };
  hotspots: Hotspot[];
  reports: HotspotReport[];
}
