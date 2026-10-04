"""Classifies a photo of waste into a type, with a pretrained model.

Uses CLIP "zero-shot" classification: the model scores the photo against
the text descriptions in LABELS and picks the best match. Nothing is
trained here, so it needs no labelled photos of our own.

The model needs extra packages (requirements-vision.txt) and downloads
about 600 MB the first time it runs. Without them everything else in
this folder still works: photos are simply left as "unclassified".
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

MODEL_NAME = "openai/clip-vit-base-patch32"
MIN_CONFIDENCE = 0.35   # below this the photo is reported as "unclear"

# key -> (text the model compares the photo with, label shown to people, recyclable?)
LABELS: dict[str, tuple[str, str, bool]] = {
    "household": ("a photo of household rubbish bags dumped on the ground", "Household rubbish", False),
    "rubble": ("a photo of building rubble and construction waste", "Building rubble", False),
    "recyclables": ("a photo of plastic bottles, cans and glass litter", "Bottles, cans and glass", True),
    "paper": ("a photo of paper and cardboard waste", "Paper and cardboard", True),
    "garden": ("a photo of garden waste, branches and leaves", "Garden waste", False),
    "overflowing_bin": ("a photo of an overflowing rubbish bin", "Overflowing bin", False),
    "no_waste": ("a photo of a clean street with no rubbish", "No waste visible", False),
}

# What to call each type in the UI, including the two that aren't model labels.
TYPE_LABELS = {key: label for key, (_, label, _) in LABELS.items()}
TYPE_LABELS.update(unclear="Unclear photo", unclassified="Not classified")

_pipeline: Any = None
_load_error: str | None = None
# The model is warmed up in the background at startup (main.py) while an
# upload may trigger the same load, so make sure it only happens once.
_load_lock = threading.Lock()


def installed() -> bool:
    """True if the model's packages are installed (doesn't load the model)."""
    from importlib.util import find_spec

    return all(find_spec(name) is not None for name in ("transformers", "torch", "PIL"))


def available() -> bool:
    """True if the model can be used on this machine."""
    _load()
    return _pipeline is not None


def load_error() -> str | None:
    return _load_error


def _load() -> None:
    global _pipeline, _load_error
    with _load_lock:
        if _pipeline is not None or _load_error is not None:
            return
        try:
            from transformers import pipeline

            _pipeline = pipeline("zero-shot-image-classification", model=MODEL_NAME)
        except Exception as exc:  # missing packages, no internet for the download, etc.
            _load_error = f"{type(exc).__name__}: {exc}"


def classify(image_path: str | Path) -> dict[str, Any] | None:
    """Returns {"type", "label", "confidence", "is_waste",
    "waste_probability", "recyclable", "scores"} for one photo, or None if the model isn't available or the file can't be
    read. "type" is a key of LABELS, or "unclear" when no description
    matched well.
    """
    _load()
    if _pipeline is None:
        return None
    try:
        from PIL import Image

        image = Image.open(image_path).convert("RGB")
    except Exception:
        return None

    prompts = {text: key for key, (text, _, _) in LABELS.items()}
    results = _pipeline(image, candidate_labels=list(prompts))
    scores = {prompts[r["label"]]: float(r["score"]) for r in results}
    return summarise(scores)


def photo_location(image_path: str | Path) -> tuple[float, float] | None:
    """The GPS position stored in a photo's metadata (its geotag), or None.
    Many phones and browsers strip this on upload, so callers need a
    fallback such as the browser's own location."""
    try:
        from PIL import Image

        gps = Image.open(image_path).getexif().get_ifd(0x8825)   # GPSInfo
        lat_ref, lat, lng_ref, lng = gps[1], gps[2], gps[3], gps[4]

        def degrees(dms: Any) -> float:
            return float(dms[0]) + float(dms[1]) / 60 + float(dms[2]) / 3600

        latitude = degrees(lat) * (-1 if lat_ref in ("S", b"S") else 1)
        longitude = degrees(lng) * (-1 if lng_ref in ("W", b"W") else 1)
        return latitude, longitude
    except Exception:
        return None


def summarise(scores: dict[str, float]) -> dict[str, Any]:
    """Turns per-label scores into the result dict. Separate from
    classify() so the decision rule can be tested without the model."""
    best = max(scores, key=scores.get)
    confidence = scores[best]
    # "Is it waste?" is the first decision: everything except the
    # no-waste description counts as waste, so add those scores up.
    waste_probability = 1.0 - scores.get("no_waste", 0.0)
    is_waste = best != "no_waste"
    if confidence < MIN_CONFIDENCE:
        return {"type": "unclear", "label": "Unclear photo", "confidence": confidence,
                "is_waste": waste_probability >= 0.5, "waste_probability": waste_probability,
                "recyclable": False, "scores": scores}
    _, label, recyclable = LABELS[best]
    return {"type": best, "label": label, "confidence": confidence,
            "is_waste": is_waste, "waste_probability": waste_probability,
            "recyclable": recyclable, "scores": scores}
