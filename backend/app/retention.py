"""Deletes data once it has served its purpose (POPIA condition 3: purpose
specification and retention limitation).

Runs once at startup and then every RETENTION_SWEEP_MINUTES:

    resident photos      deleted PHOTO_RETENTION_RESOLVED_HOURS after the
                         report is resolved, or PHOTO_RETENTION_OPEN_DAYS
                         after submission if it is never resolved
    resolved notes       wiped with the photo
    orphaned files       any file in the upload dir no report points to
    report rows          deleted after REPORT_RETENTION_DAYS (until then they
                         are anonymous: rounded location + waste type + time)
    sensor readings      deleted after READINGS_RETENTION_DAYS
    resolved alerts      deleted after ALERT_RETENTION_DAYS

Photos rejected by the classifier and reports withdrawn by their author are
deleted immediately at request time (routers/reports.py), not here.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app import db
from app.config import Settings, get_settings

logger = logging.getLogger("retention")

# A file this young may be mid-upload (saved, row not inserted yet).
ORPHAN_GRACE_S = 3600

_stop_event = threading.Event()
_thread: threading.Thread | None = None
_lock = threading.Lock()


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) - delta).isoformat()


def purge(settings: Settings | None = None) -> dict[str, int]:
    """One retention pass. Safe to call any time; returns what was removed."""
    settings = settings or get_settings()
    counts = {"photos": 0, "orphan_files": 0, "reports": 0, "readings": 0, "alerts": 0}

    with _lock:
        expired = db.reports_with_expired_photos(
            resolved_before=_iso(timedelta(hours=settings.photo_retention_resolved_hours)),
            open_before=_iso(timedelta(days=settings.photo_retention_open_days)),
        )
        for report in expired:
            Path(report["photo_path"]).unlink(missing_ok=True)
            db.clear_report_media(report["id"], scrub_note=report["resolved"])
            counts["photos"] += 1

        upload_dir = Path(settings.upload_dir)
        if upload_dir.is_dir():
            keep = db.referenced_photo_names()
            for file in upload_dir.iterdir():
                if file.is_file() and file.name not in keep and time.time() - file.stat().st_mtime > ORPHAN_GRACE_S:
                    file.unlink(missing_ok=True)
                    counts["orphan_files"] += 1

        counts["reports"] = db.delete_reports_before(_iso(timedelta(days=settings.report_retention_days)))
        counts["readings"] = db.delete_readings_before(_iso(timedelta(days=settings.readings_retention_days)))
        counts["alerts"] = db.delete_alerts_before(_iso(timedelta(days=settings.alert_retention_days)))

    if any(counts.values()):
        logger.info("retention sweep removed %s", counts)
    return counts


def _run(interval_s: int) -> None:
    while not _stop_event.is_set():
        try:
            purge()
        except Exception:
            logger.exception("retention sweep failed")
        _stop_event.wait(interval_s)


def start(settings: Settings) -> None:
    global _thread
    _stop_event.clear()
    _thread = threading.Thread(target=_run, args=(settings.retention_sweep_minutes * 60,), daemon=True)
    _thread.start()


def stop() -> None:
    _stop_event.set()
    if _thread is not None:
        _thread.join(timeout=5)
