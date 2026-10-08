"""
routing.py — Valhalla integration for ALPR-camera-aware routing.

Strategy:
  - HARD avoidance, applied iteratively: route, find the cameras the route
    actually passes, add exclusion rings for those cameras via Valhalla's
    `exclude_polygons` parameter, and re-route. Repeat until the route is
    camera-free, no path exists, or the exclusion budget is spent.
    The route with the fewest cameras seen is returned.
  - SOFT avoidance (future): custom Valhalla sif costing model that
    penalises edges near cameras without blocking them entirely.

Valhalla notes (verified against production 2026-10-07):
  - `exclude_polygons` must be a list of rings, each ring a list of
    [lon, lat] pairs. GeoJSON Polygon objects are silently ignored.
  - Valhalla rejects requests whose rings exceed
    `service_limits.max_exclude_polygons_length` total perimeter
    (default 10,000 m) with error 167. EXCLUDE_PERIMETER_BUDGET_M keeps
    requests under that limit.
"""

import math
import logging
import os
from typing import Any, Callable

import requests

log = logging.getLogger(__name__)

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")

# Radius in metres around each camera to exclude from routing
DEFAULT_EXCLUSION_RADIUS_M = 40

# Vertices per exclusion ring (octagon ≈ 6.1 × radius perimeter)
POLYGON_STEPS = 8

# Total ring perimeter allowed per Valhalla request. Must stay below the
# server's max_exclude_polygons_length (10,000 m by default).
EXCLUDE_PERIMETER_BUDGET_M = float(os.getenv("EXCLUDE_PERIMETER_BUDGET_M", "9500"))

# Maximum re-route attempts when searching for a lower-camera route
MAX_PRIVACY_ITERATIONS = int(os.getenv("MAX_PRIVACY_ITERATIONS", "6"))

# Cameras this close to the origin/destination are never excluded —
# excluding them would block the trip from starting or ending.
ENDPOINT_GUARD_M = 150


def _deg_per_metre(lat: float) -> tuple[float, float]:
    """Approximate degrees-per-metre at a given latitude."""
    lat_deg = 1 / 111_320
    lon_deg = 1 / (111_320 * math.cos(math.radians(lat)))
    return lat_deg, lon_deg


def camera_exclusion_ring(
    lat: float, lon: float, radius_m: float = DEFAULT_EXCLUSION_RADIUS_M,
    steps: int = POLYGON_STEPS,
) -> list[list[float]]:
    """
    Build a closed ring of [lon, lat] points approximating a circle around
    the camera — the format Valhalla's `exclude_polygons` expects.
    """
    lat_deg, lon_deg = _deg_per_metre(lat)
    points = [
        [
            lon + radius_m * lon_deg * math.cos(2 * math.pi * k / steps),
            lat + radius_m * lat_deg * math.sin(2 * math.pi * k / steps),
        ]
        for k in range(steps)
    ]
    points.append(points[0])  # close ring
    return points


def ring_perimeter_m(radius_m: float, steps: int = POLYGON_STEPS) -> float:
    """Perimeter of a regular polygon ring with the given circumradius."""
    return 2 * steps * radius_m * math.sin(math.pi / steps)


def build_route_request(
    origin: tuple[float, float],
    destination: tuple[float, float],
    rings: list[list[list[float]]],
    costing: str = "auto",
    use_highways: float = 0.5,
) -> dict:
    """
    Build a Valhalla /route JSON payload with camera exclusion rings.

    Args:
        origin: (lat, lon)
        destination: (lat, lon)
        rings: exclusion rings from camera_exclusion_ring()
        costing: Valhalla costing model ('auto', 'bicycle', 'pedestrian')
        use_highways: 0=avoid freeways entirely, 0.5=neutral, 1=prefer.
    """
    payload: dict[str, Any] = {
        "locations": [
            {"lat": origin[0], "lon": origin[1], "type": "break"},
            {"lat": destination[0], "lon": destination[1], "type": "break"},
        ],
        "costing": costing,
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
    if rings:
        payload["exclude_polygons"] = rings
    return payload


def _post_route(payload: dict) -> dict:
    resp = requests.post(f"{VALHALLA_URL}/route", json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _route_time(route: dict) -> float:
    return route.get("trip", {}).get("summary", {}).get("time") or float("inf")


def find_privacy_route(
    origin: tuple[float, float],
    destination: tuple[float, float],
    cameras_near_route: Callable[[dict], list[dict]],
    exclusion_radius_m: float = DEFAULT_EXCLUSION_RADIUS_M,
    costing: str = "auto",
    use_highways: float = 0.0,
    seed_routes: list[tuple[dict, list[dict]]] | None = None,
) -> dict:
    """
    Iteratively search for the route that passes the fewest cameras.

    Args:
        cameras_near_route: callback(route) -> list of camera dicts with keys
            id, lat, lon, endpoint_dist_m for cameras within the detection
            radius of the route geometry.
        seed_routes: optional (route, cameras_on_route) candidates (e.g. the
            standard fastest route) so the result is never worse than them.

    Returns dict with:
        route             - best Valhalla route found
        cameras_on_route  - cameras the best route passes
        excluded_ids      - camera ids sent to Valhalla as exclusions
        iterations        - number of routing attempts
        stop_reason       - clean | endpoint_only | budget | no_path |
                            max_iterations | valhalla_error

    Raises requests exceptions only if the very first route request fails.
    """
    perimeter = ring_perimeter_m(exclusion_radius_m)
    max_rings = max(0, int(EXCLUDE_PERIMETER_BUDGET_M // perimeter))

    best_route, best_cams = None, None

    def consider(route: dict, cams: list[dict]):
        nonlocal best_route, best_cams
        if (
            best_route is None
            or len(cams) < len(best_cams)
            or (len(cams) == len(best_cams) and _route_time(route) < _route_time(best_route))
        ):
            best_route, best_cams = route, cams

    for route, cams in seed_routes or []:
        consider(route, cams)

    excluded: dict[Any, list[list[float]]] = {}
    current = _post_route(build_route_request(origin, destination, [], costing, use_highways))
    iterations, stop_reason = 1, "max_iterations"

    while True:
        cams = cameras_near_route(current)
        consider(current, cams)

        new = [c for c in cams if c["id"] not in excluded and c["endpoint_dist_m"] > ENDPOINT_GUARD_M]
        if not cams:
            stop_reason = "clean"
            break
        if not new:
            stop_reason = "endpoint_only"
            break
        if iterations >= MAX_PRIVACY_ITERATIONS:
            stop_reason = "max_iterations"
            break
        room = max_rings - len(excluded)
        if room <= 0:
            stop_reason = "budget"
            break
        for c in new[:room]:
            excluded[c["id"]] = camera_exclusion_ring(c["lat"], c["lon"], exclusion_radius_m)

        iterations += 1
        try:
            current = _post_route(build_route_request(
                origin, destination, list(excluded.values()), costing, use_highways,
            ))
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            body = e.response.text[:200] if e.response is not None else ""
            log.info(f"Privacy search stopped at iteration {iterations}: Valhalla {status} {body}")
            stop_reason = "no_path" if status == 400 else "valhalla_error"
            break
        except requests.RequestException as e:
            log.warning(f"Privacy search stopped at iteration {iterations}: {e}")
            stop_reason = "valhalla_error"
            break

    log.info(
        f"Privacy route {origin} → {destination}: {len(best_cams)} cameras on best route, "
        f"{len(excluded)} excluded, {iterations} iterations, stop={stop_reason}"
    )
    return {
        "route": best_route,
        "cameras_on_route": best_cams,
        "excluded_ids": list(excluded.keys()),
        "iterations": iterations,
        "stop_reason": stop_reason,
    }


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
