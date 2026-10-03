import { ASSUMED_COST_PER_TRIP_ZAR, FIXED_SCHEDULE_VISITS_PER_WEEK } from "@/lib/constants";
import type { Bin, ForecastPoint } from "@/lib/types";

const WEEK_HOURS = 24 * 7;

// Turns the forecast into a decision an operator actually cares about:
// not "bin-02 is at 78%" but "collecting only what the forecast says
// needs it this week, instead of visiting every bin on a fixed roster,
// costs this many fewer trips." The cost-per-trip and roster-frequency
// numbers are stated assumptions (see lib/constants.ts), not measured
// ones, shown on the card itself rather than baked silently into one
// opaque number.
export default function CostSavingsTiles({ bins, forecast }: { bins: Bin[]; forecast: ForecastPoint[] }) {
  const scheduledTrips = bins.length * FIXED_SCHEDULE_VISITS_PER_WEEK;
  const neededTrips = forecast.filter(
    (f) => f.predictedFullInHours != null && f.predictedFullInHours <= WEEK_HOURS
  ).length;
  const tripsSaved = Math.max(scheduledTrips - neededTrips, 0);
  const savingsZAR = tripsSaved * ASSUMED_COST_PER_TRIP_ZAR;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Fixed roster baseline" value={`${scheduledTrips}/wk`} />
        <Tile label="Collections actually needed" value={`${neededTrips}/wk`} />
        <Tile label="Trips saved by need, not schedule" value={String(tripsSaved)} tone="good" />
        <Tile
          label="Estimated weekly savings"
          value={`R${savingsZAR.toLocaleString("en-ZA")}`}
          tone="good"
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Assumes a fixed roster of {FIXED_SCHEDULE_VISITS_PER_WEEK}x/week per bin and R
        {ASSUMED_COST_PER_TRIP_ZAR} per collection trip. Tune both in lib/constants.ts to the
        municipality&apos;s real schedule and cost.
      </p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div
      className={
        tone === "good"
          ? "rounded-lg border border-status-good/30 bg-status-good/5 p-4"
          : "rounded-lg border border-border p-4"
      }
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}
