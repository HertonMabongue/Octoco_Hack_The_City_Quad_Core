from __future__ import annotations

import io
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image

from app import db, retention
from app.config import get_settings


def jpeg_with_gps(lat_ref="S", lat=(33, 56, 4.56), lng_ref="E", lng=(18, 51, 55.08)) -> bytes:
    """A JPEG carrying a GPS geotag and device make, like a real phone photo."""
    exif = Image.Exif()
    exif[0x010F] = "AcmePhone"
    exif[0x8825] = {1: lat_ref, 2: lat, 3: lng_ref, 4: lng}
    buf = io.BytesIO()
    Image.new("RGB", (640, 480), (120, 90, 60)).save(buf, "JPEG", exif=exif)
    return buf.getvalue()


def submit(client, photo: bytes | None = None, **form):
    form = {"consent": "true", **form}
    files = {"photo": ("p.jpg", photo, "image/jpeg")} if photo is not None else None
    return client.post("/api/reports", data=form, files=files)


# ---- what the public can reach ---------------------------------------------

def test_uploads_are_not_served_statically(client):
    assert client.get("/uploads/anything.jpg").status_code == 404
    assert client.get("/api/privacy/policy").status_code == 200


# ---- what a report stores --------------------------------------------------

def test_report_requires_consent(client):
    r = client.post("/api/reports", data={"note": "x"})
    assert r.status_code == 422


def test_photo_metadata_is_stripped_and_location_rounded(client):
    r = submit(client, jpeg_with_gps())
    assert r.status_code == 200, r.text
    report_id = r.json()["id"]

    row = db.get_report(report_id)
    stored = Image.open(row["photo_path"])
    assert not dict(stored.getexif()), "EXIF must not survive"
    assert stored.getexif().get_ifd(0x8825) == {}, "GPS must not survive"
    assert Path(row["photo_path"]).suffix == ".jpg"

    # geotag was used for the location, then rounded to coord_decimals (4)
    assert row["lat"] == round(-(33 + 56 / 60 + 4.56 / 3600), 4)
    assert row["lng"] == round(18 + 51 / 60 + 55.08 / 3600, 4)

    # the raw upload is gone — only the clean .jpg remains
    assert [p.suffix for p in Path(get_settings().upload_dir).iterdir()] == [".jpg"]


def test_non_images_are_rejected_whatever_they_claim(client):
    r = client.post(
        "/api/reports",
        data={"consent": "true"},
        files={"photo": ("evil.jpg", b"<?php echo 1; ?>", "image/jpeg")},
    )
    assert r.status_code == 415
    assert list(Path(get_settings().upload_dir).iterdir()) == []


def test_note_is_not_copied_into_the_alert_feed(client):
    submit(client, None, note="my neighbour Jane at 12 Oak St dumped this", lat="-33.93", lng="18.86")
    alerts = client.get("/api/alerts").json()
    assert alerts and all("Jane" not in a["message"] for a in alerts)


def test_photo_served_per_report_not_as_a_directory(client):
    report_id = submit(client, jpeg_with_gps()).json()["id"]
    url = f"/api/reports/{report_id}/photo"
    ok = client.get(url)
    assert ok.status_code == 200 and ok.headers["content-type"] == "image/jpeg"
    # and the listing points at the per-report route, not a static file
    listed = client.get("/api/reports").json()
    assert listed[0]["photoUrl"] == url


def test_report_endpoint_is_rate_limited(client):
    limit = get_settings().report_rate_limit
    codes = [submit(client, None).status_code for _ in range(limit + 1)]
    assert codes[:limit] == [200] * limit and codes[-1] == 429


# ---- deletion --------------------------------------------------------------

def test_author_can_withdraw_with_their_token_only(client):
    body = submit(client, jpeg_with_gps()).json()
    report_id, token = body["id"], body["withdrawToken"]
    photo = Path(db.get_report(report_id)["photo_path"])

    assert client.delete(f"/api/reports/{report_id}").status_code == 404
    assert client.delete(f"/api/reports/{report_id}", headers={"X-Withdraw-Token": "wrong"}).status_code == 404
    assert photo.exists()

    assert client.delete(f"/api/reports/{report_id}", headers={"X-Withdraw-Token": token}).status_code == 204
    assert db.get_report(report_id) is None and not photo.exists()


def test_only_a_hash_of_the_withdraw_token_is_stored(client):
    body = submit(client, None).json()
    assert db.get_report(body["id"])["withdraw_token_hash"] != body["withdrawToken"]


def _age(report_id: str, **cols: timedelta) -> None:
    with db.get_connection() as con:
        for col, delta in cols.items():
            con.execute(
                f"UPDATE reports SET {col} = ? WHERE id = ?",
                ((datetime.now(timezone.utc) - delta).isoformat(), report_id),
            )
        con.commit()


def test_retention_deletes_photo_and_note_after_resolution(client):
    report_id = submit(client, jpeg_with_gps(), note="behind the shop", lat="-33.9", lng="18.8").json()["id"]
    photo = Path(db.get_report(report_id)["photo_path"])
    client.post(f"/api/reports/{report_id}/resolve")

    retention.purge()                       # resolved just now: inside the grace period
    assert photo.exists()

    _age(report_id, resolved_at=timedelta(hours=get_settings().photo_retention_resolved_hours + 1))
    counts = retention.purge()
    row = db.get_report(report_id)
    assert counts["photos"] == 1 and not photo.exists()
    assert row["photo_path"] is None and row["note"] is None
    assert row["lat"] is not None and row["waste_type"] is None   # anonymous analytics row survives


def test_retention_caps_unresolved_photos_and_sweeps_orphans(client):
    report_id = submit(client, jpeg_with_gps()).json()["id"]
    photo = Path(db.get_report(report_id)["photo_path"])
    _age(report_id, created_at=timedelta(days=get_settings().photo_retention_open_days + 1))

    orphan = Path(get_settings().upload_dir) / "left-behind.jpg"
    orphan.write_bytes(b"x")
    old = (datetime.now(timezone.utc) - timedelta(hours=3)).timestamp()
    os.utime(orphan, (old, old))

    counts = retention.purge()
    assert counts["photos"] == 1 and counts["orphan_files"] == 1
    assert not photo.exists() and not orphan.exists()


def test_old_rows_and_readings_are_deleted(client):
    client.post("/api/devices/bin-01/readings", json={"uptime_s": 1, "fill_pct": 10.0})
    with db.get_connection() as con:
        con.execute("UPDATE readings SET ts = ?", ((datetime.now(timezone.utc) - timedelta(days=91)).isoformat(),))
        con.commit()
    assert retention.purge()["readings"] == 1


# ---- device modes ----------------------------------------------------------

def test_maintenance_mode_silences_tamper_but_not_gas(client):
    base = {"uptime_s": 5, "fill_pct": 20.0, "movement_alert": True, "mode": "maintenance"}
    client.post("/api/devices/bin-01/readings", json=base)
    assert client.get("/api/bins/bin-01").json()["mode"] == "maintenance"
    assert client.get("/api/alerts").json() == []

    client.post("/api/devices/bin-01/readings", json={**base, "gas_raw": 950})
    assert client.get("/api/bins/bin-01").json()["mode"] == "emergency"
    assert {a["type"] for a in client.get("/api/alerts").json()} == {"hazard"}


def test_tamper_outside_maintenance_is_an_emergency(client):
    client.post(
        "/api/devices/bin-01/readings",
        json={"uptime_s": 5, "fill_pct": 20.0, "movement_alert": True, "mode": "normal"},
    )
    assert client.get("/api/bins/bin-01").json()["mode"] == "emergency"
    assert {a["type"] for a in client.get("/api/alerts").json()} == {"tamper"}


def test_mock_stands_down_for_live_hardware(client):
    from app import telemetry

    assert not telemetry.has_live_hardware("bin-01", 90)
    client.post("/api/devices/bin-01/readings", json={"uptime_s": 1, "fill_pct": 5.0})
    assert telemetry.has_live_hardware("bin-01", 90)
    assert not telemetry.has_live_hardware("bin-02", 90)
