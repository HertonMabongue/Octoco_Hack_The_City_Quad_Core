"use client";

import { useEffect, useRef, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

import { FILL_THRESHOLDS } from "@/lib/constants";
import type { BinHistoryPoint } from "@/lib/types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Legend, Tooltip);

// Reads a design-token color straight off the document rather than
// hardcoding a hex — canvas can't resolve `hsl(var(--x))` itself, so this
// is the one place that needs to. Keeps the chart's line color tied to
// the same --primary / --status-* tokens every other surface uses,
// through both themes, instead of an unrelated stock chart-library blue.
function useThemeColors() {
  const [colors, setColors] = useState({
    primary: "27, 122, 51",
    warning: "217, 119, 6",
    critical: "200, 60, 50",
    grid: "0, 0, 0",
  });

  useEffect(() => {
    const read = (name: string) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const [h = 0, s = 0, l = 0] = raw.split(" ").map((v) => parseFloat(v));
      return hslToRgbString(h, s, l);
    };
    setColors({
      primary: read("--primary"),
      warning: read("--status-warning"),
      critical: read("--status-critical"),
      grid: read("--foreground"),
    });
  }, []);

  return colors;
}

function hslToRgbString(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `${Math.round(f(0) * 255)}, ${Math.round(f(8) * 255)}, ${Math.round(f(4) * 255)}`;
}

// Fill-level history for one bin, with the collection thresholds drawn
// in as flat reference lines (lib/constants.ts's FILL_THRESHOLDS) rather
// than left for the viewer to infer from the status colours elsewhere —
// a 78% reading only means something next to the line it's being judged
// against.
export default function FillLevelChart({ history }: { history: BinHistoryPoint[] }) {
  const colors = useThemeColors();
  const labels = history.map((point) =>
    new Date(point.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  const data = {
    labels,
    datasets: [
      {
        label: `Critical (${FILL_THRESHOLDS.critical}%)`,
        data: labels.map(() => FILL_THRESHOLDS.critical),
        borderColor: `rgb(${colors.critical})`,
        borderDash: [4, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
      {
        label: `Warning (${FILL_THRESHOLDS.warning}%)`,
        data: labels.map(() => FILL_THRESHOLDS.warning),
        borderColor: `rgb(${colors.warning})`,
        borderDash: [4, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
      {
        label: "Fill level",
        data: history.map((point) => point.fillPct),
        borderColor: `rgb(${colors.primary})`,
        backgroundColor: `rgba(${colors.primary}, 0.12)`,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: `rgb(${colors.primary})`,
        tension: 0.3,
        fill: "origin" as const,
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: "index" as const, intersect: false },
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: { color: `rgba(${colors.grid}, 0.08)` },
        ticks: { callback: (value: unknown) => `${value}%` },
      },
      x: { grid: { display: false } },
    },
    plugins: {
      legend: {
        position: "top" as const,
        align: "end" as const,
        labels: { usePointStyle: true, boxHeight: 6, boxWidth: 6, font: { size: 11 } },
      },
      tooltip: { enabled: true, mode: "index" as const, intersect: false },
    },
  };

  return <Line data={data} options={options} />;
}
