import type { Metadata } from "next";

import AlertFeed from "@/components/dashboard/AlertFeed";
import AutoRefresh from "@/components/dashboard/AutoRefresh";
import BinList from "@/components/dashboard/BinList";
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
          <h1 className="text-2xl font-semibold tracking-tight">Corridor overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bins.length} bins monitored · {alerts.length} active alerts
          </p>
        </div>
        <AutoRefresh />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="h-72 min-w-0 sm:h-96 lg:h-[420px]">
            <BinMapLoader bins={bins} />
          </div>
          <div className="mt-2">
            <MapLegend />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active alerts</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AlertFeed alerts={alerts} />
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-base font-semibold">Bins</h2>
      <BinList bins={bins} />
    </div>
  );
}
