import type { Metadata } from "next";

import AlertFeed from "@/components/dashboard/AlertFeed";
import AutoRefresh from "@/components/dashboard/AutoRefresh";
import BinList from "@/components/dashboard/BinList";
import StatTiles from "@/components/dashboard/StatTiles";
import BinMapLoader from "@/components/map/BinMapLoader";
import MapLegend from "@/components/map/MapLegend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAlerts, getBins } from "@/lib/api";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Live bin status, fill-level trends, and alerts for the Adam Tas Corridor.",
};

export default async function DashboardPage() {
  const [bins, alerts] = await Promise.all([getBins(), getAlerts()]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Corridor overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bins.length} bins monitored · {alerts.length} active alerts
          </p>
        </div>
        <AutoRefresh />
      </div>

      <div className="mt-4">
        <StatTiles bins={bins} alerts={alerts} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle>Corridor map</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-72 min-w-0 overflow-hidden rounded-lg sm:h-96 lg:h-[420px]">
              <BinMapLoader bins={bins} />
            </div>
            <div className="mt-3">
              <MapLegend />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Active alerts</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AlertFeed alerts={alerts} />
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-10 font-display text-base font-semibold">Bins</h2>
      <BinList bins={bins} />
    </div>
  );
}
