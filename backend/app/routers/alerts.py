from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import db
from app.models import Alert

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[Alert])
def list_alerts(
    limit: int = Query(30, ge=1, le=200),
    include_resolved: bool = Query(False),
) -> list[Alert]:
    rows = db.list_alerts(limit, include_resolved=include_resolved)
    return [
        Alert(
            id=row["id"],
            binId=row["device_id"],
            type=row["type"],
            message=row["message"],
            createdAt=row["created_at"],
            resolved=row["resolved"],
        )
        for row in rows
    ]


@router.post("/{alert_id}/resolve", response_model=Alert)
def resolve_alert(alert_id: str) -> Alert:
    if not db.resolve_alert(alert_id):
        raise HTTPException(status_code=404, detail="Alert not found")

    row = db.get_alert(alert_id)
    assert row is not None  # just resolved it above, so it exists
    return Alert(
        id=row["id"],
        binId=row["device_id"],
        type=row["type"],
        message=row["message"],
        createdAt=row["created_at"],
        resolved=row["resolved"],
    )
