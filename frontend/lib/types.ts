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
}

export interface BinHistoryPoint {
  timestamp: string;
  fillPct: number;
}

export type AlertType = "overflow" | "littering" | "offline";

export interface Alert {
  id: string;
  binId: string;
  type: AlertType;
  message: string;
  createdAt: string;
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
