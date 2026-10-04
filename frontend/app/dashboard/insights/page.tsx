import type { Metadata } from "next";

import AutoRefresh from "@/components/dashboard/AutoRefresh";
import CostSavingsTiles from "@/components/dashboard/CostSavingsTiles";
import ForecastPanels from "@/components/dashboard/ForecastPanels";
import HotspotInsights from "@/components/hotspots/HotspotInsights";
import { getBins, getForecast, getHotspots } from "@/lib/api";

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Collection forecasts, litter hotspots, and cost-savings estimates for the corridor.",
};

export default async function InsightsPage() {
  const [bins, forecast, hotspots] = await Promise.all([getBins(), getForecast(), getHotspots()]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where collection effort is actually needed, and what that&apos;s worth in avoided trips.
          </p>
        </div>
        <AutoRefresh />
      </div>

      <div className="mt-6">
        <CostSavingsTiles bins={bins} forecast={forecast} />
      </div>

      <h2 className="mb-3 mt-10 font-display text-base font-semibold">Collection forecast</h2>
      <ForecastPanels forecast={forecast} />

      <h2 className="mb-1 mt-10 font-display text-base font-semibold">Litter hotspots</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Residents&apos; photo reports, checked for waste and pinned where they were taken. Where
        reports cluster, the city gets a recommendation.
      </p>
      <HotspotInsights data={hotspots} bins={bins} />
    </div>
  );
}
