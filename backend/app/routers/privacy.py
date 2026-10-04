"""Machine-readable statement of what we keep and for how long, so the
public privacy page shows the live configuration rather than a copy that
can drift, plus a way to run the retention sweep on demand
(useful for demonstrating deletion)."""
from __future__ import annotations

from fastapi import APIRouter

from app import retention
from app.config import get_settings

router = APIRouter(prefix="/api/privacy", tags=["privacy"])


@router.get("/policy")
def policy() -> dict[str, object]:
    s = get_settings()
    return {
        "photoRetentionResolvedHours": s.photo_retention_resolved_hours,
        "photoRetentionOpenDays": s.photo_retention_open_days,
        "reportRetentionDays": s.report_retention_days,
        "readingsRetentionDays": s.readings_retention_days,
        "coordinateDecimals": s.coord_decimals,
    }


@router.post("/purge")
def purge_now() -> dict[str, int]:
    return retention.purge()
