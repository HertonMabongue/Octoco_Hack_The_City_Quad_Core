import { STATUS_COLORS } from "../../lib/constants";

// A small status pill. Always paired with a text label — colour alone
// never carries the meaning, so this is never used without `children`.
export default function Badge({ status, children }) {
  const color = STATUS_COLORS[status] ?? "#898781";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        color: "#0b0b0b",
        background: `${color}22`,
        border: `1px solid ${color}`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {children}
    </span>
  );
}
