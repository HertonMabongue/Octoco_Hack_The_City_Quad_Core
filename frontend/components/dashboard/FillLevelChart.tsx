"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

import type { BinHistoryPoint } from "@/lib/types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

// Fill-level history for one bin. Single series, so no legend needed —
// the chart title/heading next to this component names it.
export default function FillLevelChart({ history }: { history: BinHistoryPoint[] }) {
  const data = {
    labels: history.map((point) =>
      new Date(point.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    ),
    datasets: [
      {
        label: "Fill level (%)",
        data: history.map((point) => point.fillPct),
        borderColor: "#2a78d6",
        backgroundColor: "#2a78d6",
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.25,
      },
    ],
  };

  const options = {
    responsive: true,
    scales: {
      y: { min: 0, max: 100, grid: { color: "#e1e0d9" } },
      x: { grid: { display: false } },
    },
    plugins: {
      tooltip: { enabled: true },
    },
  };

  return <Line data={data} options={options} />;
}
