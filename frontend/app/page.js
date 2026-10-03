"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

function Sparkline({ values, color }) {
  if (!values.length) return <span className="muted">No trend data</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 120;
      const y = 36 - ((v - min) / range) * 32;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width="120" height="40" viewBox="0 0 120 40" role="img" aria-label="trend chart">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}

export default function Dashboard() {
  const [data, setData] = useState({ nodes: [], alerts: [] });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const response = await fetch(`${API_BASE}/api/dashboard`, { cache: "no-store" });
      const payload = await response.json();
      if (!cancelled) setData(payload);
    };

    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const nodes = useMemo(() => data.nodes || [], [data.nodes]);
  const alerts = useMemo(() => data.alerts || [], [data.alerts]);

  return (
    <main className="container">
      <h1>River Corridor Sensor Dashboard</h1>
      <p className="muted">Polling backend every 5 seconds</p>

      <section>
        <h2>Live Per-Node Readings</h2>
        <div className="grid">
          {nodes.length === 0 ? (
            <p className="muted">No telemetry received yet.</p>
          ) : (
            nodes.map((node) => (
              <article key={node.node_id} className="card">
                <h3>{node.node_id}</h3>
                <p>Updated: {node.latest.ts}</p>
                <ul>
                  <li>Gas: {node.latest.gas_ppm.toFixed(2)} ppm</li>
                  <li>Temp: {node.latest.temp_c.toFixed(2)} °C</li>
                  <li>pH: {node.latest.ph.toFixed(2)}</li>
                </ul>
                <div className="trends">
                  <div>
                    <strong>Gas trend</strong>
                    <Sparkline values={node.trend.map((v) => v.gas_ppm)} color="#d14" />
                  </div>
                  <div>
                    <strong>Temp trend</strong>
                    <Sparkline values={node.trend.map((v) => v.temp_c)} color="#e88f00" />
                  </div>
                  <div>
                    <strong>pH trend</strong>
                    <Sparkline values={node.trend.map((v) => v.ph)} color="#0077cc" />
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section>
        <h2>Alert Feed</h2>
        <ul className="alerts">
          {alerts.length === 0 ? (
            <li className="muted">No alerts triggered.</li>
          ) : (
            alerts.map((alert, idx) => (
              <li key={`${alert.node_id}-${alert.ts}-${idx}`}>
                <strong>{alert.node_id}</strong> · {alert.metric}={alert.value} ({alert.message}) @ {alert.ts}
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
