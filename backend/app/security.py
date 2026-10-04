"""Abuse protection for the public report endpoint.

Deliberately NOT authentication: this is a hackathon POC and the demo has
no real auth (the dashboard login is a mock — see frontend/lib/auth.ts).
Production hardening (device keys, operator auth) is listed in
docs/DATA_PROTECTION.md under "Before a real pilot".
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import Request


def client_ip(request: Request) -> str:
    # Behind ngrok the socket peer is ngrok itself; it appends the real
    # client to X-Forwarded-For, so the last entry is the one to trust.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """Sliding-window limiter held in memory only: IPs are used as a
    transient key to stop abuse and are never persisted or logged."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_s: int) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > window_s:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            # Drop idle keys so the table can't grow without bound.
            if len(self._hits) > 10_000:
                for stale in [k for k, v in self._hits.items() if not v or now - v[-1] > window_s]:
                    del self._hits[stale]
            return True


report_limiter = RateLimiter()
