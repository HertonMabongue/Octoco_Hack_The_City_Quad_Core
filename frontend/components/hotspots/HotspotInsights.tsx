"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Bin, HotspotAction, HotspotsResponse } from "@/lib/types";

// MapLibre needs the browser, and `ssr: false` is only legal inside a
// Client Component, which is why this file is one.
const HotspotMap = dynamic(() => import("./HotspotMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full" />,
});

const ACTION_VARIANT: Record<HotspotAction, "good" | "warning" | "critical"> = {
  add_bin: "good",
  more_staff: "warning",
  cleanup_crew: "critical",
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function summaryText(s: HotspotsResponse["summary"]): string {
  if (!s.reports) return "No reports yet. Residents can send one from the community app.";
  if (!s.hotspots) {
    return `${plural(s.reports, "report")}, none clustered yet. A problem area needs 3 reports within about 80 m.`;
  }
  const parts: string[] = [];
  if (s.addBin) parts.push(`${s.addBin} need${s.addBin === 1 ? "s" : ""} a bin`);
  if (s.moreStaff) parts.push(`${s.moreStaff} need${s.moreStaff === 1 ? "s" : ""} more staff`);
  if (s.cleanupCrew)
    parts.push(`${s.cleanupCrew} need${s.cleanupCrew === 1 ? "s" : ""} a clean-up crew`);
  return `${plural(s.reports, "report")} in ${plural(s.hotspots, "problem area")}: ${parts.join(", ")}.`;
}

// Where residents' photo reports cluster, and what the city should do
// about each cluster (backend/app/machine_learning/hotspots.py).
export default function HotspotInsights({ data, bins }: { data: HotspotsResponse; bins: Bin[] }) {
  const [focus, setFocus] = useState<{ lat: number; lng: number; nonce: number } | null>(null);
  const simulated = data.reports.filter((r) => r.simulated).length;

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <Card className="p-1.5">
          <div className="h-96 lg:h-[34rem]">
            <HotspotMap reports={data.reports} hotspots={data.hotspots} bins={bins} focus={focus} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-3 pb-2 pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-7 rounded-sm bg-gradient-to-r from-[#f3c56f] via-[#ec8b22] to-[#c8322b]" />
              Report density
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-foreground/65" />
              Report
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
              Bin
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-status-critical" />
              Problem area
            </span>
          </div>
        </Card>

        <Card className="p-5" aria-live="polite">
          <h3 className="font-display text-base font-semibold">Problem areas</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{summaryText(data.summary)}</p>
          <ul className="mt-4 grid gap-2.5">
            {data.hotspots.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setFocus({ lat: h.lat, lng: h.lng, nonce: Date.now() })}
                  className="w-full rounded-md border border-transparent bg-secondary/50 px-3.5 py-3 text-left transition-colors hover:border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Badge variant={ACTION_VARIANT[h.action]} dot className="mb-1.5">
                    {h.dominantLabel}
                  </Badge>
                  <strong className="block text-[15px] font-semibold">{h.title}</strong>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{h.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {simulated > 0 &&
          `${plural(simulated, "report")} on this map ${simulated === 1 ? "is" : "are"} simulated. `}
        {data.classifierInstalled
          ? "Photos are checked by a pretrained image model."
          : "The photo model isn't installed, so new photos are added without being checked."}{" "}
        Problem areas are found by clustering nearby reports (DBSCAN).
      </p>
    </div>
  );
}
