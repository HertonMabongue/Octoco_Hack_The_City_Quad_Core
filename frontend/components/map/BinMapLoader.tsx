"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { BinMapProps } from "./BinMap";

// Leaflet touches `window`, so it can only render on the client. `ssr:
// false` is only legal inside a Client Component boundary, which is why
// this thin wrapper exists — Server Component pages import this instead
// of BinMap directly.
const BinMap = dynamic(() => import("./BinMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full" />,
});

export default function BinMapLoader(props: BinMapProps) {
  return <BinMap {...props} />;
}
