import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flame, ShieldAlert, Users } from "lucide-react";

import FillLevelChart from "@/components/dashboard/FillLevelChart";
import { Badge } from "@/components/ui/badge";
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
        <h1 className="text-2xl font-semibold tracking-tight">{bin.label}</h1>
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
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame className="h-3.5 w-3.5" /> Gas (raw)
          </dt>
          <dd className={`mt-1 text-lg font-semibold ${gasHazard ? "text-destructive" : ""}`}>
            {bin.gasRaw ?? "—"}
            {gasHazard && <span className="ml-2 text-xs font-normal">hazard</span>}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Traffic (10s window)
          </dt>
          <dd className={`mt-1 text-lg font-semibold ${highTraffic ? "text-destructive" : ""}`}>
            {bin.peopleCount ?? "—"}
            {highTraffic && <span className="ml-2 text-xs font-normal">high</span>}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" /> Movement
          </dt>
          <dd className={`mt-1 text-lg font-semibold ${bin.movementAlert ? "text-destructive" : ""}`}>
            {bin.movementAlert == null ? "—" : bin.movementAlert ? "Tamper alert" : "Normal"}
          </dd>
        </div>
      </dl>

      <h2 className="mb-4 mt-8 text-base font-semibold">Fill level history</h2>
      <div className="max-w-2xl">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No readings yet for this bin.</p>
        ) : (
          <FillLevelChart history={history} />
        )}
      </div>
    </div>
  );
}
