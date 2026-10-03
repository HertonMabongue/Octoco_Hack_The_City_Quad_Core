import { API_URL, FILL_THRESHOLDS } from "./constants";
import type {
  Alert,
  Bin,
  BinHistoryPoint,
  ForecastPoint,
  ReportInput,
  ReportRecord,
  ReportResult,
} from "./types";

// Every network call the frontend makes goes through this file.
// Each function tries the real backend first; if it's not reachable yet
// (or the fetch fails), it falls back to mock data so the dashboard keeps
// working on its own — the brief's "mock your data early" tip, applied on
// the consuming side so frontend work isn't blocked on the backend/firmware.
// Called from Server Components (dashboard/community pages) as well as
// client components, so it only relies on the standard `fetch` global.

// Covers all four of the firmware's independent subsystems (fill, gas,
// traffic, movement — see firmware/src/OctocoEsp32Project.ino), not just
// fill level, so the dashboard looks and behaves the same way in mock mode
// as it will once real sensor data arrives.
const MOCK_BINS: Bin[] = [
  {
    id: "bin-01",
    label: "Van der Stel St bin",
    lat: -33.9346,
    lng: 18.8653,
    fillPct: 42,
    status: "good",
    mode: "normal",
    connection: "online",
    lastUpdated: new Date().toISOString(),
    gasRaw: 210,
    peopleCount: 3,
    movementAlert: false,
  },
  {
    id: "bin-02",
    label: "University Ave bin",
    lat: -33.9337,
    lng: 18.8661,
    fillPct: 78,
    status: "warning",
    mode: "normal",
    connection: "online",
    lastUpdated: new Date().toISOString(),
    gasRaw: 340,
    peopleCount: 7,
    movementAlert: false,
  },
  {
    id: "bin-03",
    label: "Bergkelder corner bin",
    lat: -33.9358,
    lng: 18.8632,
    fillPct: 93,
    status: "critical",
    mode: "emergency",
    connection: "online",
    lastUpdated: new Date().toISOString(),
    gasRaw: 890,
    peopleCount: 1,
    movementAlert: true,
  },
];

const MOCK_ALERTS: Alert[] = [
  {
    id: "a1",
    binId: "bin-03",
    type: "overflow",
    message: "Bin 93% full, needs collection",
    createdAt: new Date().toISOString(),
    resolved: false,
  },
  {
    id: "a2",
    binId: "bin-03",
    type: "hazard",
    message: "Bin bin-03 gas reading at 890, possible hazard",
    createdAt: new Date().toISOString(),
    resolved: false,
  },
  {
    id: "a3",
    binId: "bin-03",
    type: "tamper",
    message: "Bin bin-03 unusual movement detected, possible tamper or theft",
    createdAt: new Date().toISOString(),
    resolved: false,
  },
  {
    id: "a4",
    binId: "bin-02",
    type: "littering",
    message: "Community report: littering nearby",
    createdAt: new Date().toISOString(),
    resolved: false,
  },
];

const MOCK_REPORTS: ReportRecord[] = [
  {
    id: "r1",
    lat: -33.9349,
    lng: 18.8657,
    note: "Overflowing bin spilling onto the sidewalk near the crossing.",
    photoUrl: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    resolved: false,
  },
  {
    id: "r2",
    lat: -33.9341,
    lng: 18.8649,
    note: "Dumped building rubble behind the parking area.",
    photoUrl: null,
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    resolved: true,
  },
];

async function safeFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...options });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[api] falling back to mock data for ${path}:`, message);
    return null;
  }
}

export async function getBins(): Promise<Bin[]> {
  const data = await safeFetch<Bin[]>("/api/bins");
  return data ?? MOCK_BINS;
}

export async function getBin(id: string): Promise<Bin | null> {
  const data = await safeFetch<Bin>(`/api/bins/${id}`);
  return data ?? MOCK_BINS.find((b) => b.id === id) ?? null;
}

export async function getBinHistory(id: string): Promise<BinHistoryPoint[]> {
  const data = await safeFetch<BinHistoryPoint[]>(`/api/bins/${id}/history`);
  if (data) return data;
  // Mock a day of readings rising toward "now" so the chart has shape.
  return Array.from({ length: 12 }, (_, i) => ({
    timestamp: new Date(Date.now() - (11 - i) * 60 * 60 * 1000).toISOString(),
    fillPct: Math.min(95, 10 + i * 7),
  }));
}

export async function getAlerts(): Promise<Alert[]> {
  const data = await safeFetch<Alert[]>("/api/alerts");
  return data ?? MOCK_ALERTS;
}

export async function resolveAlert(id: string): Promise<Alert | null> {
  return safeFetch<Alert>(`/api/alerts/${id}/resolve`, { method: "POST" });
}

export async function getReports(): Promise<ReportRecord[]> {
  const data = await safeFetch<ReportRecord[]>("/api/reports");
  return data ?? MOCK_REPORTS;
}

export async function resolveReport(id: string): Promise<ReportRecord | null> {
  return safeFetch<ReportRecord>(`/api/reports/${id}/resolve`, { method: "POST" });
}

export async function getForecast(): Promise<ForecastPoint[]> {
  const data = await safeFetch<ForecastPoint[]>("/api/forecast");
  if (data) return data;

  // Mirrors the backend's own heuristic (routers/forecast.py) against
  // MOCK_BINS, rather than a separate mock shape, so Insights looks the
  // same whether or not the backend is reachable.
  const ASSUMED_PCT_PER_HOUR = 3; // roughly matches mock_generator.py's random walk
  return MOCK_BINS.map((bin) => {
    const remaining = FILL_THRESHOLDS.critical - bin.fillPct;
    const hours = remaining > 0 ? Math.round((remaining / ASSUMED_PCT_PER_HOUR) * 10) / 10 : 0;
    return {
      binId: bin.id,
      label: bin.label,
      predictedFullInHours: hours,
      riskLevel: hours <= 12 ? "high" : hours <= 48 ? "medium" : "low",
      source: "heuristic",
    };
  });
}

export async function submitReport({ lat, lng, note, photo }: ReportInput): Promise<ReportResult> {
  const formData = new FormData();
  formData.append("lat", lat?.toString() ?? "");
  formData.append("lng", lng?.toString() ?? "");
  formData.append("note", note ?? "");
  if (photo) formData.append("photo", photo);

  const data = await safeFetch<ReportResult>("/api/reports", { method: "POST", body: formData });
  return data ?? { id: `mock-${Date.now()}`, status: "queued" };
}
