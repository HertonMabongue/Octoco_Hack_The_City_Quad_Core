"""Community littering reports: a resident submits a photo + location,
which we store and surface straight into the municipal alert feed.

Residents are anonymous — no account, name, phone or email is collected —
and the endpoint is built to keep it that way: photos are stripped of
metadata, coordinates are rounded, free text is capped, and photos are
only served per report id and deleted on a schedule.
Retention and deletion live in app/retention.py; the full data-handling
statement is docs/DATA_PROTECTION.md.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from app import db
from app.config import get_settings
from app.machine_learning import classifier
from app.models import Report, ReportResult
from app.privacy import clean_note, round_coord, sanitize_photo
from app.security import client_ip, report_limiter

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Content-Type is client-declared, so it is only a first filter; the real
# check is that Pillow can decode the bytes (privacy.sanitize_photo). HEIC
# isn't listed: Pillow can't read it, and phone browsers convert to JPEG
# on upload from <input accept="image/*">.
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB — comfortably fits a phone photo, caps abuse on a public endpoint
CHUNK_SIZE = 1024 * 1024


def _save_upload(photo: UploadFile, destination: Path) -> None:
    size = 0
    with destination.open("wb") as out:
        while chunk := photo.file.read(CHUNK_SIZE):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Photo exceeds 8MB limit")
            out.write(chunk)


def _store_clean_photo(photo: UploadFile) -> tuple[str, tuple[float, float] | None]:
    """Saves the upload, reads its geotag (if any) *before* the metadata is
    destroyed, and stores a metadata-free JPEG. Returns (path, geotag). The
    original upload never outlives this function."""
    if photo.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported photo type")

    upload_dir = Path(get_settings().upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stem = uuid.uuid4()
    raw = upload_dir / f"{stem}.upload"
    clean = upload_dir / f"{stem}.jpg"

    try:
        _save_upload(photo, raw)
        geotag = classifier.photo_location(raw)
        try:
            sanitize_photo(raw, clean)
        except ValueError:
            raise HTTPException(status_code=415, detail="That file isn't a readable image")
    finally:
        raw.unlink(missing_ok=True)
    return str(clean), geotag


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _photo_url(report_id: str, photo_path: str | None) -> str | None:
    # Not a static directory listing: one file per report id, served by
    # get_report_photo below, and gone once retention deletes it.
    return f"/api/reports/{report_id}/photo" if photo_path else None


def _to_report(row: dict) -> Report:
    return Report(
        id=row["id"],
        lat=row["lat"],
        lng=row["lng"],
        note=row["note"],
        photoUrl=_photo_url(row["id"], row["photo_path"]),
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


@router.get("/{report_id}/photo")
def get_report_photo(report_id: str) -> FileResponse:
    row = db.get_report(report_id)
    if row is None or not row["photo_path"] or not Path(row["photo_path"]).is_file():
        raise HTTPException(status_code=404, detail="No photo for this report")
    return FileResponse(
        row["photo_path"],
        media_type="image/jpeg",
        headers={"Cache-Control": "private, no-store"},
    )


@router.post("/{report_id}/resolve", response_model=Report)
def resolve_report(report_id: str) -> Report:
    if not db.resolve_report(report_id):
        raise HTTPException(status_code=404, detail="Report not found")

    row = db.get_report(report_id)
    assert row is not None  # just resolved it above, so it exists
    return _to_report(row)


@router.delete("/{report_id}", status_code=204, response_class=Response)
def withdraw_report(report_id: str, x_withdraw_token: str | None = Header(default=None)) -> Response:
    """Lets the (anonymous) author delete their own report and photo, using
    the one-time token returned when it was submitted. Same 404 for "no such
    report" and "wrong token" so report ids can't be probed."""
    row = db.get_report(report_id)
    stored = row["withdraw_token_hash"] if row else None
    if row is None or not stored or not x_withdraw_token or not hmac.compare_digest(
        stored, _hash_token(x_withdraw_token)
    ):
        raise HTTPException(status_code=404, detail="Report not found")

    if row["photo_path"]:
        Path(row["photo_path"]).unlink(missing_ok=True)
    db.delete_report(report_id)
    return Response(status_code=204)


@router.post("", response_model=ReportResult)
async def submit_report(
    request: Request,
    consent: bool = Form(default=False),
    lat: float | None = Form(default=None, ge=-90, le=90),
    lng: float | None = Form(default=None, ge=-180, le=180),
    note: str | None = Form(default=None),
    photo: UploadFile | None = File(default=None),
) -> ReportResult:
    """Stores a report. If a photo comes with it and the photo model is
    installed, the photo is first checked for waste: one with none in it
    is rejected (and deleted), otherwise its waste type is kept on the
    report so it can feed the hotspot map. The photo's own geotag, if it
    has one, takes priority over the lat/lng sent with it.
    """
    settings = get_settings()

    if not consent:
        raise HTTPException(status_code=422, detail="Consent to the privacy notice is required")
    if not report_limiter.allow(client_ip(request), settings.report_rate_limit, settings.report_rate_window_s):
        raise HTTPException(status_code=429, detail="Too many reports from this connection — try again later")

    photo_path: str | None = None
    if photo is not None and photo.filename:
        photo_path, geotag = _store_clean_photo(photo)
        if geotag is not None:
            lat, lng = geotag

    result = None
    if photo_path and classifier.installed():
        # Blocking, and slow on first use while the model loads.
        result = await run_in_threadpool(classifier.classify, photo_path)

    if result is not None and not result["is_waste"]:
        Path(photo_path).unlink(missing_ok=True)
        return ReportResult(
            id="",
            status="rejected",
            confidence=round(result["confidence"], 2),
            message="No waste found in this photo, so the report wasn't added. The photo was deleted.",
        )

    waste_type = result["type"] if result else None
    confidence = result["confidence"] if result else None
    withdraw_token = secrets.token_urlsafe(16)
    report_id = db.insert_report(
        round_coord(lat, settings.coord_decimals),
        round_coord(lng, settings.coord_decimals),
        clean_note(note),
        photo_path,
        waste_type,
        confidence,
        _hash_token(withdraw_token),
    )

    waste_label = classifier.TYPE_LABELS[waste_type] if waste_type else None
    # Deliberately not the resident's free text: alerts are long-lived and
    # shown to every operator, so they carry only the classifier's label.
    db.insert_alert("corridor", "littering", f"Community report: {waste_label or 'littered area'}")

    return ReportResult(
        id=report_id,
        status="received",
        wasteType=waste_type,
        wasteLabel=waste_label,
        confidence=round(confidence, 2) if confidence is not None else None,
        message=None if result or not photo_path else "Added, but the photo wasn't checked.",
        withdrawToken=withdraw_token,
    )
