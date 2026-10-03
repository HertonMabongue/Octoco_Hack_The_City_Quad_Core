import type { Metadata } from "next";
import Link from "next/link";

import BinsSummaryStrip from "@/components/community/BinsSummaryStrip";
import BinMapLoader from "@/components/map/BinMapLoader";
import MapLegend from "@/components/map/MapLegend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/constants";
import { getBins } from "@/lib/api";

export const metadata: Metadata = {
  title: "Bins near you",
  description:
    "See which bins along the Adam Tas Corridor are filling up, and report a littered area.",
};

export default async function CommunityPage() {
  const bins = await getBins();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Bins near you</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See which bins are filling up, or report a littered area.
          </p>
        </div>
        <Button asChild>
          <Link href="/community/report">Report littering</Link>
        </Button>
      </div>

      <div className="mt-3">
        <BinsSummaryStrip bins={bins} />
      </div>

      <div className="mt-4 h-72 min-w-0 overflow-hidden rounded-xl border border-border/60 shadow-card sm:h-96">
        <BinMapLoader bins={bins} />
      </div>
      <div className="mt-3">
        <MapLegend />
      </div>

      {bins.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No bins reporting yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
          <ul className="divide-y divide-border/60">
            {bins.map((bin, i) => (
              <li
                key={bin.id}
                className={`flex items-center gap-4 px-4 py-3 text-sm ${i % 2 ? "bg-secondary/30" : ""}`}
              >
                <span className="min-w-0 flex-1 font-medium">{bin.label}</span>
                <div className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-secondary sm:block">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--status-good))] data-[status=critical]:bg-[hsl(var(--status-critical))] data-[status=warning]:bg-[hsl(var(--status-warning))]"
                    data-status={bin.status}
                    style={{ width: `${bin.fillPct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {bin.fillPct}%
                </span>
                <Badge variant={bin.status} dot className="shrink-0">
                  {STATUS_LABELS[bin.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
