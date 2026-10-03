import Link from "next/link";

// Top nav for the public/community side.
export default function Navbar() {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 24px",
        borderBottom: "1px solid #e1e0d9",
      }}
    >
      <Link href="/community" style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}>
        Clean Corridor
      </Link>
      <Link href="/community/report">Report littering</Link>
    </header>
  );
}
