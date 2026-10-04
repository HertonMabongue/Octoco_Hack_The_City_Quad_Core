"""Data-minimisation helpers for community reports.

A phone photo carries far more than the litter in it: GPS position, device
make/model, timestamps, sometimes a thumbnail. We keep only the pixels.
"""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageOps

# Pillow refuses (DecompressionBombError) anything over twice this, so a
# tiny file that inflates to gigapixels can't exhaust memory.
Image.MAX_IMAGE_PIXELS = 50_000_000

MAX_PHOTO_EDGE_PX = 1600   # plenty for a clean-up crew and the classifier
JPEG_QUALITY = 85

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
MAX_NOTE_CHARS = 500


def sanitize_photo(src: Path, dest: Path) -> None:
    """Re-encode `src` as a plain JPEG at `dest`: EXIF/GPS/maker notes gone,
    orientation baked into the pixels, long edge capped. Also proves the
    upload really is an image, whatever Content-Type the client claimed.
    Raises ValueError if it can't be decoded.
    """
    try:
        with Image.open(src) as img:
            img = ImageOps.exif_transpose(img)   # apply rotation before the metadata is dropped
            img = img.convert("RGB")
            img.thumbnail((MAX_PHOTO_EDGE_PX, MAX_PHOTO_EDGE_PX))
            img.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)   # no exif= → none written
    except Exception as exc:   # Pillow raises many types for corrupt/unsupported input
        dest.unlink(missing_ok=True)
        raise ValueError("not a readable image") from exc


def round_coord(value: float | None, decimals: int) -> float | None:
    return round(value, decimals) if value is not None else None


def clean_note(note: str | None) -> str | None:
    if note is None:
        return None
    cleaned = _CONTROL_CHARS.sub("", note).strip()[:MAX_NOTE_CHARS]
    return cleaned or None
