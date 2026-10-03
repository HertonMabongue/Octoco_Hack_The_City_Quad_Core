"use client";

import { useState } from "react";
import PhotoUpload from "./PhotoUpload";
import { submitReport } from "../../lib/api";

// Lets a resident report a littered area: a photo, an optional note,
// and their current location (via the browser's geolocation API).
export default function ReportForm() {
  const [photo, setPhoto] = useState(null);
  const [note, setNote] = useState("");
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | locating | submitting | done | error

  function captureLocation() {
    if (!navigator.geolocation) return;
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("idle");
      },
      () => setStatus("idle"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("submitting");
    try {
      await submitReport({ lat: coords?.lat, lng: coords?.lng, note, photo });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p>Thanks — your report was submitted and will show up on the municipal dashboard.</p>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16, maxWidth: 420 }}>
      <PhotoUpload onSelect={setPhoto} />

      <div>
        <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          What's going on? (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #e1e0d9" }}
        />
      </div>

      <div>
        <button type="button" onClick={captureLocation} disabled={status === "locating"}>
          {coords ? "Location captured ✓" : status === "locating" ? "Locating…" : "Use my location"}
        </button>
      </div>

      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting…" : "Submit report"}
      </button>

      {status === "error" && <p style={{ color: "#d03b3b" }}>Something went wrong — try again.</p>}
    </form>
  );
}
