"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { DEFAULT_MAP_CENTER, STATUS_COLORS } from "@/lib/constants";
import type { Bin, BinStatus } from "@/lib/types";

// Requires: npm install maplibre-gl
// Must be loaded with `ssr: false` (see app/dashboard/page.tsx and
// app/community/page.tsx) — MapLibre touches `window`, which doesn't exist
// during server rendering.
//
// Vector tiles via MapLibre GL JS rather than raster Leaflet/OSM tiles —
// no API key, no billing account to set up mid-hackathon (ruled out Google
// Maps for that reason), and it's the same rendering engine behind Mapbox's
// current SDKs, so it reads as the more current choice without locking the
// project to a paid provider. Tiles come from OpenFreeMap, a free
// no-signup vector tile host built on the same OSM data Leaflet was using.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Coloured dot markers encode bin status directly, same approach as the
// previous Leaflet divIcon markers.
function markerElement(status: BinStatus) {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "50%";
  el.style.background = STATUS_COLORS[status];
  el.style.border = "2px solid white";
  el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.2)";
  el.style.cursor = "pointer";
  return el;
}

export interface BinMapProps {
  bins: Bin[];
  onSelectBin?: (bin: Bin) => void;
}

export default function BinMap({ bins, onSelectBin }: BinMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Mirrors the latest props into the marker click handlers below without
  // re-creating the map on every bins/onSelectBin update.
  const onSelectBinRef = useRef(onSelectBin);
  onSelectBinRef.current = onSelectBin;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      // MapLibre takes [lng, lat]; DEFAULT_MAP_CENTER is stored [lat, lng]
      // to match the brief's usual convention, so it's flipped here.
      center: [DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]],
      zoom: 15,
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    // Mobile browsers resize the viewport after first paint (address bar
    // collapsing, orientation change); a ResizeObserver on the container
    // catches that even when no window "resize" event fires.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Arrow function (not a declaration) so the `map` null-check above stays narrowed.
    const syncMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = bins.map((bin) => {
        const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(
          `<strong>${bin.label}</strong><br />${bin.fillPct}% full (${bin.status})`
        );

        const marker = new maplibregl.Marker({ element: markerElement(bin.status) })
          .setLngLat([bin.lng, bin.lat])
          .setPopup(popup)
          .addTo(map);

        if (onSelectBinRef.current) {
          marker.getElement().addEventListener("click", () => onSelectBinRef.current?.(bin));
        }

        return marker;
      });
    };

    if (map.isStyleLoaded()) {
      syncMarkers();
    } else {
      map.once("load", syncMarkers);
    }
  }, [bins]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-72 w-full overflow-hidden rounded-lg"
    />
  );
}
