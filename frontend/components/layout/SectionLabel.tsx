"use client";

import { usePathname } from "next/navigation";

// Maps the current dashboard route to a short section label for the
// topbar breadcrumb. A lookup table rather than title-casing the last
// path segment, since /dashboard/bins/[id] should read "Bin detail",
// not "[id]".
const SECTION_LABELS: Array<[RegExp, string]> = [
  [/^\/dashboard\/bins\/[^/]+$/, "Bin detail"],
  [/^\/dashboard\/insights/, "Insights"],
  [/^\/dashboard\/library/, "Library"],
  [/^\/dashboard\/account/, "Account"],
  [/^\/dashboard$/, "Overview"],
];

export default function SectionLabel() {
  const pathname = usePathname();
  const label = SECTION_LABELS.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Dashboard";

  return (
    <span className="text-sm font-semibold text-foreground">
      <span className="text-muted-foreground">Dashboard</span>
      <span className="mx-1.5 text-muted-foreground/50">/</span>
      {label}
    </span>
  );
}
