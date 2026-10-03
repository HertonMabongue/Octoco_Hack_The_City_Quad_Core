import Link from "next/link";

// Static nav for the municipal/operator side. Plain server component —
// no interactivity needed yet.
export default function Sidebar() {
  return (
    <nav
      style={{
        width: 220,
        padding: 20,
        borderRight: "1px solid #e1e0d9",
        minHeight: "100vh",
      }}
    >
      <strong style={{ display: "block", marginBottom: 20 }}>Ops Dashboard</strong>
      <Link href="/dashboard" style={{ display: "block", marginBottom: 10 }}>
        Overview
      </Link>
      <Link href="/" style={{ display: "block", color: "#898781" }}>
        ← Back to home
      </Link>
    </nav>
  );
}
