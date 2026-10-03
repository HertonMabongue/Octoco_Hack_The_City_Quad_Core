"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STATUS_COLORS } from "../../lib/constants";

// Requires: npm install leaflet react-leaflet
// Must be loaded with `ssr: false` (see app/dashboard/page.js and
// app/community/page.js) — Leaflet touches `window`, which doesn't
// exist during server rendering.

// Coloured dot markers instead of the default Leaflet pin — this avoids
// a well-known Next.js/webpack issue where the default marker icon
// images fail to resolve, and it encodes bin status for free.
function statusIcon(status) {
  const color = STATUS_COLORS[status] ?? "#898781";
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.2);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Default centre: roughly the Adam Tas Corridor, Stellenbosch.
const DEFAULT_CENTER = [-33.9346, 18.8653];

export default function BinMap({ bins, onSelectBin }) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={15}
      style={{ height: "100%", width: "100%", minHeight: 320, borderRadius: 12 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      {bins.map((bin) => (
        <Marker
          key={bin.id}
          position={[bin.lat, bin.lng]}
          icon={statusIcon(bin.status)}
          eventHandlers={onSelectBin ? { click: () => onSelectBin(bin) } : undefined}
        >
          <Popup>
            <strong>{bin.label}</strong>
            <br />
            {bin.fillPct}% full ({bin.status})
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
