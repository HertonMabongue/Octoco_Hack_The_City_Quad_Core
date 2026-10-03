import type { Metadata } from "next";
import { Archive, BookOpen, CheckCircle2, Clock } from "lucide-react";

import AssetRegistryTable from "@/components/library/AssetRegistryTable";
import DocsAndSops, { DOCS_COUNT } from "@/components/library/DocsAndSops";
import IncidentList from "@/components/library/IncidentList";
import LibraryTabs from "@/components/library/LibraryTabs";
import Tile from "@/components/dashboard/Tile";
import { getBins, getReports } from "@/lib/api";

export const metadata: Metadata = {
  title: "Library",
  description: "Incident log, bin and sensor asset registry, and reference documents.",
};

export default async function LibraryPage() {
  const [bins, reports] = await Promise.all([getBins(), getReports()]);
  const openReports = reports.filter((r) => !r.resolved).length;
  const resolvedReports = reports.length - openReports;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Library</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reports and incidents, the bin and sensor registry, and reference documents, all in one
        place.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Open reports"
          value={String(openReports)}
          icon={Clock}
          tone={openReports ? "warning" : "good"}
          sub={openReports ? "needs review" : "all clear"}
        />
        <Tile
          label="Resolved reports"
          value={String(resolvedReports)}
          icon={CheckCircle2}
          tone="good"
          sub="closed out"
        />
        <Tile
          label="Registered bins"
          value={String(bins.length)}
          icon={Archive}
          tone="info"
          sub="in the asset registry"
        />
        <Tile
          label="Reference docs"
          value={String(DOCS_COUNT)}
          icon={BookOpen}
          tone="violet"
          sub="SOPs and guides"
        />
      </div>

      <div className="mt-6">
        <LibraryTabs
          tabs={[
            {
              id: "reports",
              label: `Reports & incidents (${reports.length})`,
              panel: <IncidentList reports={reports} />,
            },
            {
              id: "registry",
              label: `Bin & asset registry (${bins.length})`,
              panel: <AssetRegistryTable bins={bins} />,
            },
            {
              id: "docs",
              label: "Docs & SOPs",
              panel: <DocsAndSops />,
            },
          ]}
        />
      </div>
    </div>
  );
}
