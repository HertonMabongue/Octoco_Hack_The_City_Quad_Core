import type { Metadata } from "next";
import Link from "next/link";

import BinMapLoader from "@/components/map/BinMapLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/constants";
import { getBins } from "@/lib/api";

export const metadata: Metadata = {
  title: "Bins near you",
  description: "See which bins along the Adam Tas Corridor are filling up, and report a littered area.",
};

export default async function CommunityPage() {
  const bins = await getBins();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bins near you</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See which bins are filling up, or report a littered area.
          </p>
        </div>
        <Button asChild>
          <Link href="/community/report">Report littering</Link>
        </Button>
      </div>

      <div className="mt-6 h-72 min-w-0 sm:h-96">
        <BinMapLoader bins={bins} />
      </div>

      {bins.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No bins reporting yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border">
          {bins.map((bin) => (
            <li key={bin.id} className="flex items-center justify-between py-3 text-sm">
              {bin.label}
              <Badge variant={bin.status} dot>
                {STATUS_LABELS[bin.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
