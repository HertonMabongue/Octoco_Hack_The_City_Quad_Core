import type { Metadata } from "next";

import AlertFeed from "@/components/dashboard/AlertFeed";
import BinStatusCard from "@/components/dashboard/BinStatusCard";
import BinMapLoader from "@/components/map/BinMapLoader";
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
      <h1 className="text-2xl font-semibold tracking-tight">Corridor overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {bins.length} bins monitored · {alerts.length} active alerts
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-[420px]">
          <BinMapLoader bins={bins} />
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
      {bins.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bins reporting yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bins.map((bin) => (
            <BinStatusCard key={bin.id} bin={bin} />
          ))}
        </div>
      )}
    </div>
  );
}
