import { Badge } from "@/components/ui/badge";
import { BIN_ASSET_INFO, DEFAULT_BIN_ASSET_INFO, STATUS_LABELS } from "@/lib/constants";
import type { Bin } from "@/lib/types";

// The corridor's device registry as a reference table, rather than the
// status cards BinList already gives the overview page — a registry is
// for looking a specific asset up (what's fitted, when it went in),
// not for scanning what needs attention right now.
export default function AssetRegistryTable({ bins }: { bins: Bin[] }) {
  if (!bins.length) {
    return <p className="text-sm text-muted-foreground">No registered bins yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">ID</th>
            <th className="px-4 py-2.5 font-medium">Location</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Sensors fitted</th>
            <th className="px-4 py-2.5 font-medium">Firmware</th>
            <th className="px-4 py-2.5 font-medium">Installed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {bins.map((bin) => {
            const asset = BIN_ASSET_INFO[bin.id] ?? DEFAULT_BIN_ASSET_INFO;
            return (
              <tr key={bin.id}>
                <td className="px-4 py-2.5 font-mono text-xs">{bin.id}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{bin.label}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {bin.lat.toFixed(4)}, {bin.lng.toFixed(4)}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={bin.status} dot>
                    {STATUS_LABELS[bin.status]}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {asset.sensors.join(", ")}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{asset.firmware}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{asset.installedAt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
