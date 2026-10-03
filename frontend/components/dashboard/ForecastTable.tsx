import { Calculator, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RISK_LABELS } from "@/lib/constants";
import type { ForecastPoint, RiskLevel } from "@/lib/types";

const RISK_BADGE_VARIANT: Record<RiskLevel, "critical" | "warning" | "good"> = {
  high: "critical",
  medium: "warning",
  low: "good",
};

// The forecast table itself is deliberately dumb about where the
// numbers came from — it renders whatever routers/forecast.py returns.
// Today that's always source: "heuristic" (a linear projection, see
// that file); once app/forecasting/'s real model is trained and swapped
// in, rows start arriving with source: "model" and pick up the Sparkles
// badge automatically, no frontend change needed.
export default function ForecastTable({ forecast }: { forecast: ForecastPoint[] }) {
  const sorted = [...forecast].sort(
    (a, b) => (a.predictedFullInHours ?? Infinity) - (b.predictedFullInHours ?? Infinity)
  );

  if (!sorted.length) {
    return <p className="text-sm text-muted-foreground">No forecast data yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Bin</th>
            <th className="px-4 py-3 font-semibold">Projected time to collection</th>
            <th className="px-4 py-3 font-semibold">Risk</th>
            <th className="px-4 py-3 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((f) => (
            <tr key={f.binId} className="transition-colors hover:bg-secondary/30">
              <td className="px-4 py-3 font-medium">{f.label}</td>
              <td className="px-4 py-3 font-mono tabular-nums">
                {f.predictedFullInHours == null ? "N/A" : `${f.predictedFullInHours}h`}
              </td>
              <td className="px-4 py-3">
                <Badge variant={RISK_BADGE_VARIANT[f.riskLevel]} dot>
                  {RISK_LABELS[f.riskLevel]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {f.source === "model" ? (
                    <Sparkles className="h-3 w-3" />
                  ) : (
                    <Calculator className="h-3 w-3" />
                  )}
                  {f.source === "model" ? "Model" : "Heuristic"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
