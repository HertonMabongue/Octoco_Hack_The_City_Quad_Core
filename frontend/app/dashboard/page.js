"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getBins, getAlerts } from "../../lib/api";
import BinStatusCard from "../../components/dashboard/BinStatusCard";
import AlertFeed from "../../components/dashboard/AlertFeed";

// Leaflet touches `window`, so it can only render on the client —
// ssr: false is required here, not optional.
const BinMap = dynamic(() => import("../../components/map/BinMap"), { ssr: false });

export default function DashboardPage() {
  const [bins, setBins] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    getBins().then(setBins);
    getAlerts().then(setAlerts);
  }, []);

  return (
    <div>
      <h1>Corridor overview</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, marginTop: 20 }}>
        <div style={{ height: 420 }}>
          <BinMap bins={bins} />
        </div>

        <div>
          <h2 style={{ fontSize: 16 }}>Active alerts</h2>
          <AlertFeed alerts={alerts} />
        </div>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Bins</h2>
      <div>
        {bins.map((bin) => (
          <BinStatusCard key={bin.id} bin={bin} />
        ))}
      </div>
    </div>
  );
}
