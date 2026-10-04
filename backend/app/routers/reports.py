"""Community littering reports: a resident submits a photo + location,
which we store and surface straight into the municipal alert feed.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from app import db
from app.config import get_settings
from app.machine_learning import classifier
from app.models import Report, ReportResult

router = APIRouter(prefix="/api/reports", tags=["reports"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB — comfortably fits a phone photo, caps abuse on a public endpoint
CHUNK_SIZE = 1024 * 1024


def _save_photo(photo: UploadFile) -> str | None:
    if photo is None or not photo.filename:
        return None

    if photo.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported photo type")

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(photo.filename).suffix or ".jpg"
    filename = f"{uuid.uuid4()}{suffix}"
    destination = upload_dir / filename

    size = 0
    with destination.open("wb") as out:
        while chunk := photo.file.read(CHUNK_SIZE):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Photo exceeds 8MB limit")
            out.write(chunk)
    return str(destination)


def _photo_url(photo_path: str | None) -> str | None:
    # Stored as an absolute filesystem path (see _save_photo above); the
    # static mount in main.py serves settings.upload_dir at /uploads, so
    # only the filename carries over into the public URL.
    return f"/uploads/{Path(photo_path).name}" if photo_path else None


def _to_report(row: dict) -> Report:
    return Report(
        id=row["id"],
        lat=row["lat"],
        lng=row["lng"],
        note=row["note"],
        photoUrl=_photo_url(row["photo_path"]),
        createdAt=row["created_at"],
        resolved=row["resolved"],
        wasteLabel=classifier.TYPE_LABELS.get(row["waste_type"]) if row["waste_type"] else None,
    )


@router.get("", response_model=list[Report])
def list_reports(
    limit: int = Query(100, ge=1, le=500),
    include_resolved: bool = Query(True),
) -> list[Report]:
    rows = db.list_reports(limit, include_resolved=include_resolved)
    return [_to_report(row) for row in rows]


@router.post("/{report_id}/resolve", response_model=Report)
def resolve_report(report_id: str) -> Report:
    if not db.resolve_report(report_id):
        raise HTTPException(status_code=404, detail="Report not found")

    rows = db.list_reports(limit=500, include_resolved=True)
    row = next((r for r in rows if r["id"] == report_id), None)
    assert row is not None  # just resolved it above, so it exists
    return _to_report(row)


@router.post("", response_model=ReportResult)
async def submit_report(
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
    note: str | None = Form(default=None),
    photo: UploadFile | None = File(default=None),
) -> ReportResult:
    """Stores a report. If a photo comes with it and the photo model is
    installed, the photo is first checked for waste: one with none in it
    is rejected (and deleted), otherwise its waste type is kept on the
    report so it can feed the hotspot map. The photo's own geotag, if it
    has one, takes priority over the lat/lng sent with it.
    """
    photo_path = _save_photo(photo) if photo is not None else None

    result = None
    if photo_path:
        if classifier.installed():
            # Blocking, and slow on first use while the model loads.
            result = await run_in_threadpool(classifier.classify, photo_path)
        geotag = classifier.photo_location(photo_path)
        if geotag is not None:
            lat, lng = geotag

    if result is not None and not result["is_waste"]:
        Path(photo_path).unlink(missing_ok=True)
        return ReportResult(
            id="",
            status="rejected",
            confidence=round(result["confidence"], 2),
            message="No waste found in this photo, so the report wasn't added.",
        )

    waste_type = result["type"] if result else None
    confidence = result["confidence"] if result else None
    report_id = db.insert_report(lat, lng, note, photo_path, waste_type, confidence)

    waste_label = classifier.TYPE_LABELS[waste_type] if waste_type else None
    nearest_device = "corridor"
    message = note.strip() if note and note.strip() else f"Community report: {waste_label or 'littered area'}"
    db.insert_alert(nearest_device, "littering", message)

    return ReportResult(
        id=report_id,
        status="received",
        wasteType=waste_type,
        wasteLabel=waste_label,
        confidence=round(confidence, 2) if confidence is not None else None,
        message=None if result or not photo_path else "Added, but the photo wasn't checked.",
    )
