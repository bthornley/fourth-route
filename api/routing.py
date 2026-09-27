"""
routing.py — Valhalla integration for ALPR-camera-aware routing.

Strategy:
  - HARD avoidance: pass camera exclusion polygons to Valhalla's
    `exclude_polygons` parameter. Route will completely avoid these zones.
    Fails if no camera-free path exists.
  - SOFT avoidance (future): custom Valhalla sif costing model that
    penalises edges near cameras without blocking them entirely.
"""

import math
import logging
import os
from typing import Any

import requests

log = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")

# Radius in metres around each camera to exclude from routing
DEFAULT_EXCLUSION_RADIUS_M = 40


def _deg_per_metre(lat: float) -> float:
    """Approximate degrees-per-metre at a given latitude."""
    lat_deg = 1 / 111_320
    lon_deg = 1 / (111_320 * math.cos(math.radians(lat)))
    return lat_deg, lon_deg


def camera_exclusion_polygon(
    lat: float, lon: float, radius_m: float = DEFAULT_EXCLUSION_RADIUS_M, steps: int = 16
) -> dict:
    """
    Build a GeoJSON Polygon circle centred on the camera.
    Valhalla's `exclude_polygons` expects GeoJSON Polygon geometry objects.
    """
    lat_deg, lon_deg = _deg_per_metre(lat)
    points = [
        [
            lon + radius_m * lon_deg * math.cos(math.radians(a)),
            lat + radius_m * lat_deg * math.sin(math.radians(a)),
        ]
        for a in range(0, 360, 360 // steps)
    ]
    points.append(points[0])  # close ring
    return {"type": "Polygon", "coordinates": [points]}


def build_route_request(
    origin: tuple[float, float],
    destination: tuple[float, float],
    cameras: list[dict],
    exclusion_radius_m: float = DEFAULT_EXCLUSION_RADIUS_M,
    costing: str = "auto",
    use_highways: float = 0.5,
) -> dict:
    """
    Build a Valhalla /route JSON payload with camera exclusion zones.

    Args:
        origin: (lat, lon)
        destination: (lat, lon)
        cameras: list of camera dicts with lat/lon keys
        exclusion_radius_m: metres radius around each camera to exclude
        costing: Valhalla costing model ('auto', 'bicycle', 'pedestrian')
        use_highways: 0=avoid freeways entirely, 0.5=neutral, 1=prefer.
                      Set low for privacy routing so cameras on surface streets
                      are the actual bottleneck, not bypassed by freeway.
    """
    exclude_polygons = [
        camera_exclusion_polygon(c["lat"], c["lon"], exclusion_radius_m)
        for c in cameras
    ]

    return {
        "locations": [
            {"lat": origin[0], "lon": origin[1], "type": "break"},
            {"lat": destination[0], "lon": destination[1], "type": "break"},
        ],
        "costing": costing,
        "exclude_polygons": exclude_polygons,
        "directions_options": {
            "units": "miles",
            "language": "en-US",
        },
        "costing_options": {
            "auto": {
                "use_tolls": 0.5,
                "use_highways": use_highways,
            }
        },
    }


def get_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
    cameras: list[dict],
    exclusion_radius_m: float = DEFAULT_EXCLUSION_RADIUS_M,
    costing: str = "auto",
    fallback_to_standard: bool = True,
    use_highways: float = 0.0,
) -> dict:
    """
    Request a camera-avoiding route from Valhalla.

    If hard exclusion fails (no camera-free path), optionally falls back
    to a standard route with cameras flagged but not excluded.

    Returns a dict with:
        route        - Valhalla route response
        avoided      - number of cameras excluded
        fallback     - True if camera exclusion was dropped
        cameras      - list of cameras in corridor (for UI overlay)
    """
    payload = build_route_request(
        origin, destination, cameras, exclusion_radius_m, costing, use_highways
    )

    log.info(
        f"Requesting route: {origin} → {destination} "
        f"excluding {len(cameras)} camera zones (r={exclusion_radius_m}m)"
    )

    try:
        resp = requests.post(
            f"{VALHALLA_URL}/route",
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        return {
            "route": resp.json(),
            "avoided": len(cameras),
            "fallback": False,
            "cameras": cameras,
        }

    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        body = e.response.text if e.response is not None else ""
        log.warning(f"Valhalla returned {status}: {body[:200]}")

        # 400 with "No path found" means hard exclusion made route impossible
        if status == 400 and fallback_to_standard:
            log.info("No camera-free path found — falling back to standard route")
            fallback_payload = build_route_request(
                origin, destination, [], 0, costing  # no exclusions
            )
            fb_resp = requests.post(
                f"{VALHALLA_URL}/route",
                json=fallback_payload,
                timeout=30,
            )
            fb_resp.raise_for_status()
            return {
                "route": fb_resp.json(),
                "avoided": 0,
                "fallback": True,
                "cameras": cameras,
                "fallback_reason": "No camera-free path exists for this route",
            }
        raise


def get_standard_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
    costing: str = "auto",
) -> dict:
    """Get a plain route with no camera avoidance (for comparison)."""
    payload = {
        "locations": [
            {"lat": origin[0], "lon": origin[1], "type": "break"},
            {"lat": destination[0], "lon": destination[1], "type": "break"},
        ],
        "costing": costing,
        "directions_options": {"units": "miles", "language": "en-US"},
    }
    resp = requests.post(f"{VALHALLA_URL}/route", json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def valhalla_status() -> dict:
    """Check if Valhalla is up and has tiles loaded."""
    try:
        resp = requests.get(f"{VALHALLA_URL}/status", timeout=5)
        resp.raise_for_status()
        return {"ok": True, "detail": resp.json()}
    except Exception as e:
        return {"ok": False, "detail": str(e)}
