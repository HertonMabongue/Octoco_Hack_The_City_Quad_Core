import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Clean Corridor — Waste Management System";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#0a1a0f",
          backgroundImage: "linear-gradient(135deg, #123a1e 0%, #0a1a0f 100%)",
          padding: "80px",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#1a7a33",
              display: "flex",
            }}
          />
          <span style={{ fontSize: 28, fontWeight: 600, color: "#9fe3ad", display: "flex" }}>
            Adam Tas Corridor · Hack the City
          </span>
        </div>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, display: "flex" }}>Clean Corridor</div>
        <div style={{ fontSize: 32, color: "#c7d6cb", marginTop: 20, display: "flex", maxWidth: 860 }}>
          Waste Management System — live bin monitoring &amp; community reporting
        </div>
      </div>
    ),
    { ...size }
  );
}
