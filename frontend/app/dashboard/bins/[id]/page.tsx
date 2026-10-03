import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flame, ShieldAlert, Users } from "lucide-react";

import FillLevelChart from "@/components/dashboard/FillLevelChart";
import Tile from "@/components/dashboard/Tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAS_ALERT_RAW, STATUS_LABELS, TRAFFIC_HIGH_COUNT } from "@/lib/constants";
import { getBin, getBinHistory } from "@/lib/api";

interface BinDetailPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: BinDetailPageProps): Promise<Metadata> {
  const bin = await getBin(params.id);
  return { title: bin ? bin.label : "Bin not found" };
}

export default async function BinDetailPage({ params }: BinDetailPageProps) {
  const [bin, history] = await Promise.all([getBin(params.id), getBinHistory(params.id)]);

  if (!bin) notFound();

  const gasHazard = bin.gasRaw != null && bin.gasRaw >= GAS_ALERT_RAW;
  const highTraffic = bin.peopleCount != null && bin.peopleCount >= TRAFFIC_HIGH_COUNT;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{bin.label}</h1>
        <Badge variant={bin.status} dot>
          {STATUS_LABELS[bin.status]}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {bin.fillPct}% full · mode: {bin.mode} · last updated{" "}
        {new Date(bin.lastUpdated).toLocaleString()}
      </p>

      {/* The bin's other three independent sensors (see
          firmware/src/OctocoEsp32Project.ino) — shown as a readout rather
          than just the fill chart, since an operator who opens a single
          bin wants the full picture, not only what triggered the overflow
          alert. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Tile
          label="Gas (raw)"
          icon={Flame}
          tone={gasHazard ? "critical" : "default"}
          value={bin.gasRaw != null ? String(bin.gasRaw) : "—"}
          sub={gasHazard ? "above hazard threshold" : "normal"}
        />
        <Tile
          label="Traffic (10s window)"
          icon={Users}
          tone={highTraffic ? "warning" : "default"}
          value={bin.peopleCount != null ? String(bin.peopleCount) : "—"}
          sub={highTraffic ? "high traffic" : "normal"}
        />
        <Tile
          label="Movement"
          icon={ShieldAlert}
          tone={bin.movementAlert ? "critical" : "default"}
          value={bin.movementAlert == null ? "—" : bin.movementAlert ? "Tamper" : "Normal"}
          sub={bin.movementAlert ? "possible tamper event" : "no movement flagged"}
        />
      </div>

      <h2 className="mb-4 mt-8 font-display text-base font-semibold">Fill level history</h2>
      <Card className="max-w-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Last {history.length} readings
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No readings yet for this bin.</p>
          ) : (
            <FillLevelChart history={history} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
