"""Spins the real FastAPI app up against a throwaway database and upload
dir, with the city broker and photo model stubbed out, so these tests
exercise our own code only (no network, no model download)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("MOCK_TELEMETRY_ENABLED", "false")
    monkeypatch.setenv("SEED_DEMO_REPORTS", "false")

    from app import city_client, retention, telemetry
    from app.config import get_settings
    from app.machine_learning import classifier
    from app.security import report_limiter

    get_settings.cache_clear()
    report_limiter._hits.clear()
    telemetry._last_real_post.clear()
    monkeypatch.setattr(city_client, "publish_telemetry", lambda *a, **k: None)
    monkeypatch.setattr(city_client, "publish_status", lambda *a, **k: None)
    monkeypatch.setattr(city_client, "shutdown", lambda: None)
    # Tests call retention.purge() themselves; the background sweep would race them.
    monkeypatch.setattr(retention, "start", lambda settings: None)
    monkeypatch.setattr(classifier, "installed", lambda: False)

    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c
    get_settings.cache_clear()
