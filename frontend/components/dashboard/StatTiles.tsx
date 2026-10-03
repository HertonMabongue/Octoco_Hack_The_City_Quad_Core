import { AlertTriangle, Gauge, PackageCheck, Truck } from "lucide-react";

import { FILL_THRESHOLDS } from "@/lib/constants";
import type { Alert, Bin } from "@/lib/types";

import Tile, { type TileProps } from "./Tile";

// The headline numbers an operator checks first, before the map or the
// list below it. No trend arrows: there isn't a prior period stored to
// compare against yet, and a fabricated "+4%" would be decoration, not
// data — the sub-line under each figure states the real threshold or
// count behind it instead.
export default function StatTiles({ bins, alerts }: { bins: Bin[]; alerts: Alert[] }) {
  const avgFill = bins.length ? Math.round(bins.reduce((sum, b) => sum + b.fillPct, 0) / bins.length) : 0;
  const needsCollection = bins.filter((b) => b.status === "critical").length;
  const offline = bins.filter((b) => b.connection === "offline").length;

  const tiles: TileProps[] = [
    {
      label: "Bins monitored",
      value: String(bins.length),
      icon: PackageCheck,
      sub: offline ? `${offline} offline` : "all reporting",
    },
    {
      label: "Average fill",
      value: `${avgFill}%`,
      icon: Gauge,
      sub: `collection threshold ${FILL_THRESHOLDS.critical}%`,
    },
    {
      label: "Active alerts",
      value: String(alerts.length),
      icon: AlertTriangle,
      tone: alerts.length ? "warning" : "good",
      sub: alerts.length ? "needs review" : "all clear",
    },
    {
      label: "Needs collection",
      value: String(needsCollection),
      icon: Truck,
      tone: needsCollection ? "critical" : "good",
      sub: needsCollection ? "schedule a pickup" : "none at risk",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Tile key={tile.label} {...tile} />
      ))}
    </div>
  );
}
