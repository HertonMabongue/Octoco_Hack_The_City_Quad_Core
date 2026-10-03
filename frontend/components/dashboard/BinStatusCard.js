import Link from "next/link";
import Badge from "../ui/Badge";
import { STATUS_COLORS } from "../../lib/constants";

// One bin, summarised: fill-level bar + status badge. Used in the ops
// dashboard list and reused wherever a compact bin summary is needed.
export default function BinStatusCard({ bin }) {
  const barColor = STATUS_COLORS[bin.status] ?? "#898781";

  return (
    <Link
      href={`/dashboard/bins/${bin.id}`}
      style={{
        display: "block",
        padding: 16,
        borderRadius: 12,
        border: "1px solid #e1e0d9",
        marginBottom: 12,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>{bin.label}</strong>
        <Badge status={bin.status}>{bin.status}</Badge>
      </div>

      <div style={{ background: "#e1e0d9", borderRadius: 999, height: 8, overflow: "hidden" }}>
        <div
          style={{
            width: `${bin.fillPct}%`,
            background: barColor,
            height: "100%",
          }}
        />
      </div>

      <div style={{ fontSize: 13, color: "#52514e", marginTop: 6 }}>
        {bin.fillPct}% full · mode: {bin.mode}
      </div>
    </Link>
  );
}
