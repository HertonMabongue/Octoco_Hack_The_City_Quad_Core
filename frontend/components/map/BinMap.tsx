"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { DEFAULT_MAP_CENTER, STATUS_COLORS } from "@/lib/constants";
import type { Bin, BinStatus } from "@/lib/types";

// Requires: npm install leaflet react-leaflet
// Must be loaded with `ssr: false` (see app/dashboard/page.tsx and
// app/community/page.tsx) — Leaflet touches `window`, which doesn't
// exist during server rendering.

// Coloured dot markers instead of the default Leaflet pin — this avoids
// a well-known Next.js/webpack issue where the default marker icon
// images fail to resolve, and it encodes bin status for free.
function statusIcon(status: BinStatus) {
  const color = STATUS_COLORS[status];
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.2);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Mobile browsers resize the viewport after first paint (address bar
// collapsing, orientation change), and Leaflet caches its container size
// at init — without this it renders into a stale, often-zero-height box
// and tiles show up cut off or blank until the user manually interacts.
function InvalidateOnResize() {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => map.invalidateSize();
    const timer = window.setTimeout(invalidate, 200);
    window.addEventListener("resize", invalidate);
    window.addEventListener("orientationchange", invalidate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("orientationchange", invalidate);
    };
  }, [map]);

  return null;
}

export interface BinMapProps {
  bins: Bin[];
  onSelectBin?: (bin: Bin) => void;
}

export default function BinMap({ bins, onSelectBin }: BinMapProps) {
  return (
    <MapContainer
      center={DEFAULT_MAP_CENTER}
      zoom={15}
      scrollWheelZoom={false}
      className="h-full min-h-72 w-full overflow-hidden rounded-lg"
    >
      <InvalidateOnResize />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
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
