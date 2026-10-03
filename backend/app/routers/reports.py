"""Community littering reports: a resident submits a photo + location,
which we store and surface straight into the municipal alert feed.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile

from app import db
from app.config import get_settings
from app.models import ReportResult

router = APIRouter(prefix="/api/reports", tags=["reports"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _save_photo(photo: UploadFile) -> str | None:
    if photo is None or not photo.filename:
        return None

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(photo.filename).suffix or ".jpg"
    filename = f"{uuid.uuid4()}{suffix}"
    destination = upload_dir / filename
    with destination.open("wb") as out:
        out.write(photo.file.read())
    return str(destination)


@router.post("", response_model=ReportResult)
async def submit_report(
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
    note: str | None = Form(default=None),
    photo: UploadFile | None = File(default=None),
) -> ReportResult:
    photo_path = _save_photo(photo) if photo is not None else None
    report_id = db.insert_report(lat, lng, note, photo_path)

    nearest_device = "corridor"
    message = note.strip() if note and note.strip() else "Community report: littered area"
    db.insert_alert(nearest_device, "littering", message)

    return ReportResult(id=report_id, status="received")
