import Link from "next/link";

// Landing page: pick which side of the app you're here for.
// Swap this for a proper login flow once auth is in place.
export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 20px" }}>
      <h1>Clean Corridor</h1>
      <p style={{ color: "#52514e" }}>
        Bin overflow and littering monitoring for the Adam Tas Corridor.
      </p>

      <div style={{ display: "grid", gap: 16, marginTop: 32 }}>
        <Link
          href="/dashboard"
          style={{ padding: 16, border: "1px solid #e1e0d9", borderRadius: 12, textDecoration: "none", color: "inherit" }}
        >
          <strong>Municipal dashboard</strong>
          <p style={{ margin: "4px 0 0", color: "#52514e" }}>
            For operators — live bin status, alerts, collection decisions.
          </p>
        </Link>

        <Link
          href="/community"
          style={{ padding: 16, border: "1px solid #e1e0d9", borderRadius: 12, textDecoration: "none", color: "inherit" }}
        >
          <strong>Community app</strong>
          <p style={{ margin: "4px 0 0", color: "#52514e" }}>
            For residents — see nearby bins, report littered areas.
          </p>
        </Link>
      </div>
    </main>
  );
}
