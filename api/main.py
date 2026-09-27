"""
ALPR Navigation API — Phase 1
Endpoints: camera listing, bounding box query, user reports, sync status
"""

import os
import math
import logging
from contextlib import asynccontextmanager
from typing import Generator

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from routing import get_route, get_standard_route, valhalla_status

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://alpr:alprpass@localhost:5432/alpr_nav"
)
# Railway provides postgres:// but psycopg2 needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)


# ---------------------------------------------------------------------------
# DB connection
# ---------------------------------------------------------------------------

def get_db() -> Generator:
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("API starting — checking DB connection...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.close()
        log.info("DB connection OK ✓")
    except Exception as e:
        log.error(f"DB connection failed: {e}")
    yield

app = FastAPI(
    title="Fourth Route API",
    description="ALPR camera-aware privacy routing for fourthroute.app",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["System"])
def health():
    """Railway healthcheck endpoint."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.close()
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class Camera(BaseModel):
    id: int
    lat: float
    lon: float
    source: str
    operator: str | None
    direction: int | None
    confidence: float

class CameraReport(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    operator: str | None = None
    notes: str | None = None

class BBoxQuery(BaseModel):
    min_lat: float = Field(..., ge=-90, le=90)
    min_lon: float = Field(..., ge=-180, le=180)
    max_lat: float = Field(..., ge=-90, le=90)
    max_lon: float = Field(..., ge=-180, le=180)

    @field_validator("max_lat")
    @classmethod
    def max_lat_gt_min(cls, v, info):
        if "min_lat" in info.data and v <= info.data["min_lat"]:
            raise ValueError("max_lat must be greater than min_lat")
        return v

class NearbyQuery(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radius_m: float = Field(default=500, ge=10, le=50_000)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", tags=["Meta"])
def root():
    return {"service": "alpr-nav-api", "version": "0.1.0", "status": "ok"}


@app.get("/cameras", response_model=list[Camera], tags=["Cameras"])
def list_cameras(
    limit: int = Query(default=500, le=5000),
    source: str | None = Query(default=None, description="Filter by source: osm, user, foia"),
    db=Depends(get_db),
):
    """List cameras with optional source filter. Paginated by limit."""
    with db.cursor() as cur:
        if source:
            cur.execute(
                """
                SELECT id,
                       ST_Y(geom::geometry) AS lat,
                       ST_X(geom::geometry) AS lon,
                       source, operator, direction, confidence
                FROM cameras
                WHERE source = %s
                ORDER BY id
                LIMIT %s
                """,
                (source, limit),
            )
        else:
            cur.execute(
                """
                SELECT id,
                       ST_Y(geom::geometry) AS lat,
                       ST_X(geom::geometry) AS lon,
                       source, operator, direction, confidence
                FROM cameras
                ORDER BY id
                LIMIT %s
                """,
                (limit,),
            )
        return cur.fetchall()


@app.post("/cameras/bbox", response_model=list[Camera], tags=["Cameras"])
def cameras_in_bbox(query: BBoxQuery, db=Depends(get_db)):
    """Return all cameras within a lat/lon bounding box."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   ST_Y(geom::geometry) AS lat,
                   ST_X(geom::geometry) AS lon,
                   source, operator, direction, confidence
            FROM cameras
            WHERE geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
            ORDER BY confidence DESC
            """,
            (query.min_lon, query.min_lat, query.max_lon, query.max_lat),
        )
        return cur.fetchall()


@app.post("/cameras/nearby", response_model=list[Camera], tags=["Cameras"])
def cameras_nearby(query: NearbyQuery, db=Depends(get_db)):
    """Return cameras within radius_m meters of a point, ordered by distance."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   ST_Y(geom::geometry) AS lat,
                   ST_X(geom::geometry) AS lon,
                   source, operator, direction, confidence,
                   ST_Distance(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) AS distance_m
            FROM cameras
            WHERE ST_DWithin(
                geom,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                %s
            )
            ORDER BY distance_m ASC
            """,
            (query.lon, query.lat, query.lon, query.lat, query.radius_m),
        )
        return cur.fetchall()


@app.post("/cameras/corridor", response_model=list[Camera], tags=["Cameras"])
def cameras_in_corridor(
    origin_lat: float = Query(..., ge=-90, le=90),
    origin_lon: float = Query(..., ge=-180, le=180),
    dest_lat: float = Query(..., ge=-90, le=90),
    dest_lon: float = Query(..., ge=-180, le=180),
    buffer_deg: float = Query(default=0.05, ge=0.01, le=1.0,
                               description="Buffer in degrees around the straight-line corridor"),
    db=Depends(get_db),
):
    """
    Return cameras within a buffered corridor between origin and destination.
    Used by the routing service to determine which cameras to exclude.
    """
    min_lat = min(origin_lat, dest_lat) - buffer_deg
    max_lat = max(origin_lat, dest_lat) + buffer_deg
    min_lon = min(origin_lon, dest_lon) - buffer_deg
    max_lon = max(origin_lon, dest_lon) + buffer_deg

    with db.cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   ST_Y(geom::geometry) AS lat,
                   ST_X(geom::geometry) AS lon,
                   source, operator, direction, confidence
            FROM cameras
            WHERE geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
            ORDER BY confidence DESC
            """,
            (min_lon, min_lat, max_lon, max_lat),
        )
        return cur.fetchall()


@app.get("/cameras/{camera_id}", response_model=Camera, tags=["Cameras"])
def get_camera(camera_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   ST_Y(geom::geometry) AS lat,
                   ST_X(geom::geometry) AS lon,
                   source, operator, direction, confidence
            FROM cameras
            WHERE id = %s
            """,
            (camera_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Camera not found")
    return row


@app.post("/cameras/report", tags=["Crowdsourcing"], status_code=201)
def report_camera(report: CameraReport, db=Depends(get_db)):
    """Submit a new user-reported camera sighting (goes into moderation queue)."""
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO camera_reports (lat, lon, operator, notes)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (report.lat, report.lon, report.operator, report.notes),
        )
        new_id = cur.fetchone()["id"]
    db.commit()
    return {"id": new_id, "status": "pending", "message": "Report received, thank you!"}


@app.get("/sync/status", tags=["Admin"])
def sync_status(db=Depends(get_db)):
    """Return the last few sync log entries."""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT source, started_at, finished_at, inserted, updated, deleted, error
            FROM sync_log
            ORDER BY started_at DESC
            LIMIT 10
            """
        )
        logs = cur.fetchall()

        cur.execute("SELECT COUNT(*) AS total FROM cameras")
        total = cur.fetchone()["total"]

        cur.execute(
            "SELECT source, COUNT(*) AS count FROM cameras GROUP BY source ORDER BY source"
        )
        by_source = cur.fetchall()

    return {
        "total_cameras": total,
        "by_source": by_source,
        "recent_syncs": logs,
    }


# ---------------------------------------------------------------------------
# Routing endpoints (Phase 2)
# ---------------------------------------------------------------------------

class RouteRequest(BaseModel):
    origin_lat: float = Field(..., ge=-90, le=90)
    origin_lon: float = Field(..., ge=-180, le=180)
    dest_lat: float = Field(..., ge=-90, le=90)
    dest_lon: float = Field(..., ge=-180, le=180)
    exclusion_radius_m: float = Field(
        default=40, ge=10, le=200,
        description="Exclusion zone radius around each camera in metres"
    )
    corridor_buffer_deg: float = Field(
        default=0.05, ge=0.01, le=1.0,
        description="Bounding box buffer around straight-line corridor when fetching cameras"
    )
    costing: str = Field(
        default="auto",
        description="Valhalla costing model: auto, bicycle, pedestrian"
    )
    fallback: bool = Field(
        default=True,
        description="If no camera-free path exists, fall back to standard route"
    )
    use_highways: float = Field(
        default=0.0, ge=0.0, le=1.0,
        description="0=avoid freeways (recommended for camera avoidance — cameras are on surface streets), 0.5=neutral, 1=prefer freeways"
    )


@app.post("/route", tags=["Routing"])
def route(req: RouteRequest, db=Depends(get_db)):
    """
    Get a camera-avoiding route between two points.

    Fetches ALPR cameras in the corridor, builds exclusion polygons around each,
    and requests a route from Valhalla that avoids them.

    Returns the Valhalla route GeoJSON plus metadata about cameras avoided.
    """
    origin = (req.origin_lat, req.origin_lon)
    dest = (req.dest_lat, req.dest_lon)

    # 1. Fetch cameras in the rough corridor
    cameras = _fetch_corridor_cameras(db, origin, dest, req.corridor_buffer_deg)

    # 2. Get camera-avoiding route from Valhalla
    try:
        result = get_route(
            origin=origin,
            destination=dest,
            cameras=cameras,
            exclusion_radius_m=req.exclusion_radius_m,
            costing=req.costing,
            fallback_to_standard=req.fallback,
            use_highways=req.use_highways,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing error: {e}")

    # 3. Summarise route metadata
    legs = result["route"].get("trip", {}).get("legs", [{}])
    summary = result["route"].get("trip", {}).get("summary", {})

    return {
        "status": "fallback" if result.get("fallback") else "avoided",
        "cameras_in_corridor": len(cameras),
        "cameras_avoided": result["avoided"],
        "fallback": result.get("fallback", False),
        "fallback_reason": result.get("fallback_reason"),
        "distance_miles": summary.get("length"),
        "duration_seconds": summary.get("time"),
        "route": result["route"],
        "camera_locations": [
            {"lat": c["lat"], "lon": c["lon"], "operator": c.get("operator")}
            for c in cameras
        ],
    }


@app.post("/route/compare", tags=["Routing"])
def route_compare(req: RouteRequest, db=Depends(get_db)):
    """
    Compare a camera-avoiding route vs. a standard fastest route side by side.
    Useful for showing the user the privacy/time tradeoff.
    """
    origin = (req.origin_lat, req.origin_lon)
    dest = (req.dest_lat, req.dest_lon)

    cameras = _fetch_corridor_cameras(db, origin, dest, req.corridor_buffer_deg)

    # Run both routes
    try:
        avoiding = get_route(
            origin=origin,
            destination=dest,
            cameras=cameras,
            exclusion_radius_m=req.exclusion_radius_m,
            costing=req.costing,
            fallback_to_standard=False,
            use_highways=req.use_highways,
        )
        avoiding_summary = avoiding["route"].get("trip", {}).get("summary", {})
        avoiding_result = {
            "distance_miles": avoiding_summary.get("length"),
            "duration_seconds": avoiding_summary.get("time"),
            "cameras_avoided": len(cameras),
            "route": avoiding["route"],
        }
    except Exception:
        avoiding_result = None

    try:
        standard_route = get_standard_route(origin, dest, req.costing)
        std_summary = standard_route.get("trip", {}).get("summary", {})
        standard_result = {
            "distance_miles": std_summary.get("length"),
            "duration_seconds": std_summary.get("time"),
            "cameras_on_route": len(cameras),  # approximate
            "route": standard_route,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Standard routing error: {e}")

    # Compute overhead
    overhead = None
    if avoiding_result and standard_result:
        std_time = standard_result["duration_seconds"] or 0
        avoid_time = avoiding_result["duration_seconds"] or 0
        if std_time > 0:
            overhead = {
                "extra_seconds": round(avoid_time - std_time),
                "extra_miles": round(
                    (avoiding_result["distance_miles"] or 0)
                    - (standard_result["distance_miles"] or 0), 2
                ),
                "pct_slower": round((avoid_time - std_time) / std_time * 100, 1),
            }

    return {
        "cameras_in_corridor": len(cameras),
        "privacy_route": avoiding_result,
        "standard_route": standard_result,
        "overhead": overhead,
        "camera_locations": [
            {"lat": c["lat"], "lon": c["lon"], "operator": c.get("operator")}
            for c in cameras
        ],
    }


@app.get("/valhalla/status", tags=["Admin"])
def check_valhalla():
    """Check if the Valhalla routing engine is up and tiles are loaded."""
    status = valhalla_status()
    if not status["ok"]:
        raise HTTPException(status_code=503, detail=status["detail"])
    return status


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fetch_corridor_cameras(conn, origin, dest, buffer_deg: float) -> list[dict]:
    """Fetch cameras in bounding box around origin→dest corridor."""
    min_lat = min(origin[0], dest[0]) - buffer_deg
    max_lat = max(origin[0], dest[0]) + buffer_deg
    min_lon = min(origin[1], dest[1]) - buffer_deg
    max_lon = max(origin[1], dest[1]) + buffer_deg

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   ST_Y(geom::geometry) AS lat,
                   ST_X(geom::geometry) AS lon,
                   source, operator, direction, confidence
            FROM cameras
            WHERE geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
            ORDER BY confidence DESC
            """,
            (min_lon, min_lat, max_lon, max_lat),
        )
        return [dict(row) for row in cur.fetchall()]

