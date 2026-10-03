"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getBin, getBinHistory } from "../../../../lib/api";
import Badge from "../../../../components/ui/Badge";
import FillLevelChart from "../../../../components/dashboard/FillLevelChart";

export default function BinDetailPage() {
  const { id } = useParams();
  const [bin, setBin] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    getBin(id).then(setBin);
    getBinHistory(id).then(setHistory);
  }, [id]);

  if (!bin) return <p>Loading…</p>;

  return (
    <div>
      <h1>
        {bin.label} <Badge status={bin.status}>{bin.status}</Badge>
      </h1>
      <p style={{ color: "#52514e" }}>
        {bin.fillPct}% full · mode: {bin.mode} · last updated{" "}
        {new Date(bin.lastUpdated).toLocaleString()}
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Fill level history</h2>
      <div style={{ maxWidth: 640 }}>
        <FillLevelChart history={history} />
      </div>
    </div>
  );
}
