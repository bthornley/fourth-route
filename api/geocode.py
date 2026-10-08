"""
Geocoding proxy: address search + reverse geocoding via Nominatim (OpenStreetMap).

Why this exists: when the browser called nominatim.openstreetmap.org directly, every
address a user typed (often their home or workplace) was sent to a third party along
with the user's IP address. Routing it through our API means Nominatim only ever sees
our server.

Privacy rules for this module:
  * POST bodies only, so queries never appear in URL access logs.
  * Never log queries, coordinates, or results. Errors log only the exception type.
  * Reverse-geocode coordinates are rounded to 4 decimals (~11 m) before forwarding.
  * Results are cached in process memory only (1 hour, max 1000 entries) to respect
    Nominatim's usage policy. Nothing is written to disk or the database.

Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
max 1 request/second, identifying User-Agent, cache results, attribute OSM.
"""
import logging
import os
import threading
import time
from collections import OrderedDict

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/")
USER_AGENT = "FourthRoute/1.0 (+https://fourthroute.org)"
MIN_INTERVAL_S = float(os.getenv("NOMINATIM_MIN_INTERVAL_S", "1.0"))  # policy: <= 1 req/s
MAX_WAIT_S = 3.0          # give up rather than leave the user hanging behind a queue
CACHE_TTL_S = 3600
CACHE_MAX = 1000

log = logging.getLogger(__name__)

router = APIRouter(prefix="/geocode", tags=["Geocoding"])

_lock = threading.Lock()
_next_slot = 0.0
_cache: "OrderedDict[tuple, tuple[float, object]]" = OrderedDict()
_cache_lock = threading.Lock()


def _cache_get(key):
    with _cache_lock:
        hit = _cache.get(key)
        if not hit:
            return None
        ts, val = hit
        if time.monotonic() - ts > CACHE_TTL_S:
            _cache.pop(key, None)
            return None
        _cache.move_to_end(key)
        return val


def _cache_put(key, val):
    with _cache_lock:
        _cache[key] = (time.monotonic(), val)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX:
            _cache.popitem(last=False)


def _reserve_slot() -> float:
    """Reserve the next upstream slot (global 1 req/s). Returns seconds to wait."""
    global _next_slot
    with _lock:
        now = time.monotonic()
        start = max(now, _next_slot)
        wait = start - now
        if wait > MAX_WAIT_S:
            return -1.0
        _next_slot = start + MIN_INTERVAL_S
        return wait


def _upstream(path: str, params: dict):
    wait = _reserve_slot()
    if wait < 0:
        raise HTTPException(status_code=503, detail="Address search is busy. Try again in a moment.")
    if wait:
        time.sleep(wait)
    try:
        r = requests.get(
            f"{NOMINATIM_URL}{path}",
            params={**params, "format": "json"},
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            timeout=8,
        )
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        # Deliberately no query/coordinates in the log line.
        log.warning("Nominatim request failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="Address search is unavailable right now.")


class SearchRequest(BaseModel):
    q: str = Field(..., min_length=2, max_length=200)
    viewbox: str | None = Field(None, description="minLon,minLat,maxLon,maxLat")
    limit: int = Field(5, ge=1, le=10)

    @field_validator("viewbox")
    @classmethod
    def _viewbox(cls, v):
        if v is None:
            return v
        parts = v.split(",")
        if len(parts) != 4:
            raise ValueError("viewbox must be minLon,minLat,maxLon,maxLat")
        nums = [float(p) for p in parts]
        if not (-180 <= nums[0] <= 180 and -180 <= nums[2] <= 180 and -90 <= nums[1] <= 90 and -90 <= nums[3] <= 90):
            raise ValueError("viewbox out of range")
        return ",".join(str(n) for n in nums)


class ReverseRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


@router.post("/search")
def geocode_search(req: SearchRequest):
    q = " ".join(req.q.split())
    key = ("s", q.lower(), req.viewbox, req.limit)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    params = {"q": q, "limit": req.limit, "countrycodes": "us", "addressdetails": 1, "dedupe": 1}
    if req.viewbox:
        params["viewbox"] = req.viewbox
    data = _upstream("/search", params)
    result = data if isinstance(data, list) else []
    _cache_put(key, result)
    return result


@router.post("/reverse")
def geocode_reverse(req: ReverseRequest):
    lat, lon = round(req.lat, 4), round(req.lon, 4)  # ~11 m; enough to name the street
    key = ("r", lat, lon)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    data = _upstream("/reverse", {"lat": lat, "lon": lon, "addressdetails": 1})
    result = data if isinstance(data, dict) else {}
    _cache_put(key, result)
    return result
