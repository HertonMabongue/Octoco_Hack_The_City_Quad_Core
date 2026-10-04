"""FastAPI entrypoint: app wiring, CORS, static uploads, and background
task lifecycle (mock telemetry generator + offline watchdog).

Run with: uvicorn main:app --reload --app-dir backend
"""
from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import city_client, db, mock_generator, watchdog
from app.config import get_settings
from app.machine_learning import classifier
from app.routers import alerts, bins, forecast, hotspots, ingest, reports

# Without this, our own logger.info()/logger.warning() calls across the
# app are silently dropped — Python's root logger defaults to WARNING
# with no handler, so even a successful MQTT connect or a connect
# failure never reaches the console. This is what makes them visible.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    db.init_db()
    mock_generator.start(settings)
    watchdog.start(settings)
    # Loading the photo model can take minutes the first time (it downloads),
    # so do it now in the background instead of during a resident's upload.
    if classifier.installed():
        threading.Thread(target=classifier.available, daemon=True).start()
    yield
    watchdog.stop()
    mock_generator.stop()
    city_client.shutdown()


app = FastAPI(title="Adam Tas Corridor — Waste & Recycling API", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(bins.router)
app.include_router(alerts.router)
app.include_router(reports.router)
app.include_router(ingest.router)
app.include_router(forecast.router)
app.include_router(hotspots.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, object]:
    return {"status": "ok", "cityBroker": city_client.status()}
