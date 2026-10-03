"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getBins } from "../../lib/api";
import Badge from "../../components/ui/Badge";

const BinMap = dynamic(() => import("../../components/map/BinMap"), { ssr: false });

export default function CommunityPage() {
  const [bins, setBins] = useState([]);

  useEffect(() => {
    getBins().then(setBins);
  }, []);

  return (
    <div>
      <h1>Bins near you</h1>
      <p style={{ color: "#52514e" }}>
        See which bins are filling up, and{" "}
        <Link href="/community/report">report a littered area</Link>.
      </p>

      <div style={{ height: 400, marginTop: 16 }}>
        <BinMap bins={bins} />
      </div>

      <ul style={{ listStyle: "none", padding: 0, marginTop: 20 }}>
        {bins.map((bin) => (
          <li
            key={bin.id}
            style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #e1e0d9" }}
          >
            {bin.label}
            <Badge status={bin.status}>{bin.status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
