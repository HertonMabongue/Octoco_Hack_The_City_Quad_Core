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
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Bin</th>
            <th className="px-4 py-2.5 font-medium">Projected time to collection</th>
            <th className="px-4 py-2.5 font-medium">Risk</th>
            <th className="px-4 py-2.5 font-medium">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((f) => (
            <tr key={f.binId}>
              <td className="px-4 py-2.5 font-medium">{f.label}</td>
              <td className="px-4 py-2.5 font-mono tabular-nums">
                {f.predictedFullInHours == null ? "N/A" : `${f.predictedFullInHours}h`}
              </td>
              <td className="px-4 py-2.5">
                <Badge variant={RISK_BADGE_VARIANT[f.riskLevel]} dot>
                  {RISK_LABELS[f.riskLevel]}
                </Badge>
              </td>
              <td className="px-4 py-2.5">
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
