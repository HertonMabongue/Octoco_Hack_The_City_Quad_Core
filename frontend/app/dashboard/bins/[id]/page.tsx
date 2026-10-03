import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FillLevelChart from "@/components/dashboard/FillLevelChart";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";
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
