import { Banknote, CalendarCheck, PackageCheck, Truck } from "lucide-react";

import { ASSUMED_COST_PER_TRIP_ZAR, FIXED_SCHEDULE_VISITS_PER_WEEK } from "@/lib/constants";
import type { Bin, ForecastPoint } from "@/lib/types";

import Tile from "./Tile";

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
        <Tile label="Fixed roster baseline" value={`${scheduledTrips}/wk`} icon={CalendarCheck} />
        <Tile label="Collections actually needed" value={`${neededTrips}/wk`} icon={PackageCheck} />
        <Tile
          label="Trips saved by need, not schedule"
          value={String(tripsSaved)}
          icon={Truck}
          tone="good"
        />
        <Tile
          label="Estimated weekly savings"
          value={`R${savingsZAR.toLocaleString("en-ZA")}`}
          icon={Banknote}
          tone="good"
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Assumes a fixed roster of {FIXED_SCHEDULE_VISITS_PER_WEEK}x/week per bin and R
        {ASSUMED_COST_PER_TRIP_ZAR} per collection trip. Tune both in lib/constants.ts to the
        municipality&apos;s real schedule and cost.
      </p>
    </div>
  );
}
