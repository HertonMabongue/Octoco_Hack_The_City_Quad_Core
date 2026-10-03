import { AlertTriangle, Gauge, PackageCheck, Truck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Alert, Bin } from "@/lib/types";

interface Tile {
  label: string;
  value: string;
  icon: typeof Gauge;
  tone?: "default" | "warning" | "critical";
}

// The headline numbers an operator checks first, before the map or the
// list below it — a card grid alone doesn't answer "how are we doing
// right now" at a glance, which is the first thing any shift lead wants
// from a dashboard like this. Values are plain figures (no sparkline),
// since that's what read-ready-at-a-glance means for four numbers this
// small; status colour is reserved for the two that can actually be a
// problem (active alerts, bins needing collection), and always paired
// with an icon so colour never carries the only signal.
export default function StatTiles({ bins, alerts }: { bins: Bin[]; alerts: Alert[] }) {
  const avgFill = bins.length ? Math.round(bins.reduce((sum, b) => sum + b.fillPct, 0) / bins.length) : 0;
  const needsCollection = bins.filter((b) => b.status === "critical").length;

  const tiles: Tile[] = [
    { label: "Bins monitored", value: String(bins.length), icon: PackageCheck },
    { label: "Average fill", value: `${avgFill}%`, icon: Gauge },
    {
      label: "Active alerts",
      value: String(alerts.length),
      icon: AlertTriangle,
      tone: alerts.length ? "warning" : "default",
    },
    {
      label: "Needs collection",
      value: String(needsCollection),
      icon: Truck,
      tone: needsCollection ? "critical" : "default",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={cn(
            "rounded-lg border p-4",
            tile.tone === "critical"
              ? "border-status-critical/30 bg-status-critical/5"
              : tile.tone === "warning"
                ? "border-status-warning/30 bg-status-warning/5"
                : "border-border"
          )}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{tile.label}</span>
            <tile.icon
              className={cn(
                "h-3.5 w-3.5",
                tile.tone === "critical" && "text-status-critical",
                tile.tone === "warning" && "text-status-warning"
              )}
            />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight">
            {tile.value}
          </div>
        </div>
      ))}
    </div>
  );
}
