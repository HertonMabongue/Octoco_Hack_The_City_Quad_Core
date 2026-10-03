"""FastAPI entrypoint: app wiring, CORS, static uploads, and MQTT lifecycle.

Run with: uvicorn main:app --reload --app-dir backend
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import db
from app.config import get_settings
from app.mqtt_client import start_mqtt_subscriber, stop_mqtt_subscriber
from app.routers import alerts, bins, reports


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    start_mqtt_subscriber()
    yield
    stop_mqtt_subscriber()


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


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
