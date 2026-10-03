import type { Metadata } from "next";

import CostSavingsTiles from "@/components/dashboard/CostSavingsTiles";
import FillLevelChart from "@/components/dashboard/FillLevelChart";
import ForecastTable from "@/components/dashboard/ForecastTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBinHistory, getBins, getForecast } from "@/lib/api";

export const metadata: Metadata = {
  title: "Insights",
  description: "Collection forecasts, trends, and cost-savings estimates for the corridor.",
};

export default async function InsightsPage() {
  const [bins, forecast] = await Promise.all([getBins(), getForecast()]);
  const binsWithHistory = await Promise.all(
    bins.map(async (bin) => ({ bin, history: await getBinHistory(bin.id) }))
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Where collection effort is actually needed, and what that&apos;s worth in avoided trips.
      </p>

      <div className="mt-6">
        <CostSavingsTiles bins={bins} forecast={forecast} />
      </div>

      <h2 className="mb-3 mt-10 text-base font-semibold">Collection forecast</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Projected time until each bin reaches the collection threshold, from its recent fill
        history. Ranked by what needs attention soonest.
      </p>
      <ForecastTable forecast={forecast} />

      <h2 className="mb-3 mt-10 text-base font-semibold">Fill trend by bin</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {binsWithHistory.map(({ bin, history }) => (
          <Card key={bin.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{bin.label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No readings yet.</p>
              ) : (
                <FillLevelChart history={history} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
