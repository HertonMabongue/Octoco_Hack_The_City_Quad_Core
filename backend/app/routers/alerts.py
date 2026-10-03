from __future__ import annotations

from fastapi import APIRouter, Query

from app import db
from app.models import Alert

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[Alert])
def list_alerts(limit: int = Query(30, ge=1, le=200)) -> list[Alert]:
    rows = db.list_alerts(limit)
    return [
        Alert(id=row["id"], binId=row["device_id"], type=row["type"], message=row["message"], createdAt=row["created_at"])
        for row in rows
    ]
