"""Litter hotspots for the municipal dashboard's Insights page: where
residents' photo reports cluster, and what the city should do about each
cluster (machine_learning/hotspots.py)."""
from __future__ import annotations

from fastapi import APIRouter

from app.machine_learning import classifier, hotspots
from app.models import Hotspot, HotspotReport, HotspotsResponse, HotspotSummary

router = APIRouter(prefix="/api/hotspots", tags=["hotspots"])


@router.get("", response_model=HotspotsResponse)
def get_hotspots() -> HotspotsResponse:
    reports = hotspots.located_reports()
    found = hotspots.find_hotspots(reports)
    actions = [h["action"] for h in found]

    return HotspotsResponse(
        classifierInstalled=classifier.installed(),
        summary=HotspotSummary(
            reports=len(reports),
            hotspots=len(found),
            addBin=actions.count("add_bin"),
            moreStaff=actions.count("more_staff"),
            cleanupCrew=actions.count("cleanup_crew"),
        ),
        hotspots=[
            Hotspot(
                id=h["id"],
                lat=h["lat"],
                lng=h["lng"],
                count=h["count"],
                dominantLabel=h["dominant_label"],
                recyclableShare=round(h["recyclable_share"], 2),
                action=h["action"],
                title=h["title"],
                reason=h["reason"],
            )
            for h in found
        ],
        reports=[
            HotspotReport(
                id=r["id"],
                lat=r["lat"],
                lng=r["lng"],
                type=r["type"],
                typeLabel=r["type_label"],
                confidence=round(r["confidence"], 2) if r["confidence"] is not None else None,
                createdAt=r["created_at"],
                hotspot=r["hotspot"],
                simulated=r["simulated"],
            )
            for r in reports
        ],
    )
