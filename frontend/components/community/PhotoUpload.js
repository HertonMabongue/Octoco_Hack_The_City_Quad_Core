"use client";

import { useState } from "react";

// A simple file input with a preview. Keeps image handling in one place
// so ReportForm stays focused on the overall submit flow.
export default function PhotoUpload({ onSelect }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  function handleChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onSelect?.(file);
  }

  return (
    <div>
      <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
        Photo of the littered area
      </label>
      <input type="file" accept="image/*" capture="environment" onChange={handleChange} />
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Preview of the report photo"
          style={{ marginTop: 10, maxWidth: "100%", borderRadius: 8 }}
        />
      )}
    </div>
  );
}
