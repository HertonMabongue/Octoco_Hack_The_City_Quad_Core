"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { DEFAULT_MAP_CENTER } from "@/lib/constants";
import type { Bin, Hotspot, HotspotReport } from "@/lib/types";

// Same map engine and tile style as BinMap (see its header for why).
// Must be loaded with `ssr: false` (HotspotInsights does) — MapLibre
// touches `window`.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Matches CLUSTER_RADIUS_M in backend/app/machine_learning/hotspots.py
// plus a little margin, so the ring visibly contains its reports.
const AREA_RADIUS_M = 90;

export interface HotspotMapProps {
  reports: HotspotReport[];
  hotspots: Hotspot[];
  bins: Bin[];
  // Bumping `nonce` re-centres the map on a hotspot, even the same one twice.
  focus?: { lat: number; lng: number; nonce: number } | null;
}

// Canvas paint values can't use `hsl(var(--x))`, so resolve a design token
// to a concrete colour. MapLibre's parser wants comma-separated hsl().
function token(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw.split(/\s+/).join(",")})` : fallback;
}

// A ring of points around a centre, for drawing a radius in metres.
function circlePolygon(lat: number, lng: number, radiusM: number, steps = 48): GeoJSON.Feature {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export default function HotspotMap({ reports, hotspots, bins, focus }: HotspotMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const fittedRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const latestRef = useRef({ reports, hotspots, bins });
  latestRef.current = { reports, hotspots, bins };

  // Pushes the latest props into the map's sources and bin markers.
  function draw() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { reports, hotspots, bins } = latestRef.current;

    (map.getSource("reports") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: reports.map((r) => ({
        type: "Feature",
        properties: {
          label: `${r.typeLabel}${r.confidence == null ? "" : ` (${Math.round(r.confidence * 100)}% sure)`}${r.simulated ? ", simulated" : ""}`,
        },
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      })),
    });
    (map.getSource("areas") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: hotspots.map((h) => circlePolygon(h.lat, h.lng, AREA_RADIUS_M)),
    });

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = bins.map((bin) => {
      const el = document.createElement("div");
      el.style.cssText = `width:14px;height:14px;border-radius:50%;border:2px solid #fff;background:${token("--primary", "#1b7a33")};box-shadow:0 0 0 1px rgba(0,0,0,0.2)`;
      return new maplibregl.Marker({ element: el })
        .setLngLat([bin.lng, bin.lat])
        .setPopup(new maplibregl.Popup({ offset: 10, closeButton: false }).setText(bin.label))
        .addTo(map);
    });

    if (!fittedRef.current && (reports.length || bins.length)) {
      const bounds = new maplibregl.LngLatBounds();
      [...reports, ...bins].forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 0 });
      fittedRef.current = true;
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]],
      zoom: 15,
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on("load", () => {
      const critical = token("--status-critical", "#c8322b");
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      map.addSource("reports", { type: "geojson", data: empty });
      map.addSource("areas", { type: "geojson", data: empty });

      map.addLayer({
        id: "report-heat",
        type: "heatmap",
        source: "reports",
        paint: {
          "heatmap-weight": 0.7,
          "heatmap-radius": 30,
          "heatmap-opacity": 0.8,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(243,197,111,0)",
            0.3,
            "#f3c56f",
            0.6,
            "#ec8b22",
            1,
            "#c8322b",
          ],
        },
      });
      map.addLayer({
        id: "report-dots",
        type: "circle",
        source: "reports",
        paint: {
          "circle-radius": 4,
          "circle-color": "#3a3530",
          "circle-opacity": 0.85,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "area-rings",
        type: "line",
        source: "areas",
        paint: { "line-color": critical, "line-width": 2, "line-dasharray": [2, 1.5] },
      });

      const popup = new maplibregl.Popup({ closeButton: false, offset: 8 });
      map.on("mouseenter", "report-dots", (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        map.getCanvas().style.cursor = "pointer";
        popup
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setText(String(feature.properties?.label ?? ""))
          .addTo(map);
      });
      map.on("mouseleave", "report-dots", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      readyRef.current = true;
      draw();
    });

    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draw() reads latestRef, so it never goes stale
  }, []);

  useEffect(draw, [reports, hotspots, bins]);

  useEffect(() => {
    if (focus) mapRef.current?.flyTo({ center: [focus.lng, focus.lat], zoom: 17 });
  }, [focus]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Map of litter reports, bins and problem areas"
      className="h-full min-h-72 w-full overflow-hidden rounded-lg"
    />
  );
}
