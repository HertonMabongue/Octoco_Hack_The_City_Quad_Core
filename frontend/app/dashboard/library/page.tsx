import type { Metadata } from "next";

import AssetRegistryTable from "@/components/library/AssetRegistryTable";
import DocsAndSops from "@/components/library/DocsAndSops";
import IncidentList from "@/components/library/IncidentList";
import LibraryTabs from "@/components/library/LibraryTabs";
import { getBins, getReports } from "@/lib/api";

export const metadata: Metadata = {
  title: "Library",
  description: "Incident log, bin and sensor asset registry, and reference documents.",
};

export default async function LibraryPage() {
  const [bins, reports] = await Promise.all([getBins(), getReports()]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reports and incidents, the bin and sensor registry, and reference documents, all in one
        place.
      </p>

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
