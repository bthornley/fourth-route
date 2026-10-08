"""
ALPR Navigation API — Phase 1
Endpoints: camera listing, bounding box query, user reports, sync status
"""

import os
import math
import logging
from contextlib import asynccontextmanager
from typing import Generator

import hmac
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Depends, Query, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from routing import find_privacy_route, get_standard_route, valhalla_status
from geocode import router as geocode_router

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

app.include_router(geocode_router)


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


def _notify_new_camera_report(report_id: int, lat: float, lon: float, operator: str, notes: str):
    """Best-effort notification via Webhook, Resend, or SMTP if configured."""
    log.info(f"🚨 NEW CAMERA REPORTED [ID #{report_id}]: ({lat}, {lon}) operator={operator}")
    
    # 1. Discord/Slack/Generic Webhook
    webhook_url = os.getenv("ALERT_WEBHOOK_URL")
    if webhook_url:
        try:
            payload = {
                "text": f"🚨 *New ALPR Camera Reported* (ID #{report_id})\n• Location: {lat:.5f}, {lon:.5f}\n• Operator: {operator or 'Unknown'}\n• Notes: {notes or 'None'}\n• Inspect: https://fourthroute.org?lat={lat}&lon={lon}"
            }
            requests.post(webhook_url, json=payload, timeout=5)
        except Exception as e:
            log.warning(f"Failed to post alert webhook: {e}")

    # 2. Resend API if configured
    resend_key = os.getenv("RESEND_API_KEY")
    alert_email = os.getenv("ALERT_EMAIL", "bthornley@gmail.com")
    if resend_key:
        try:
            requests.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                json={
                    "from": "Fourth Route Alerts <alerts@fourthroute.org>",
                    "to": [alert_email],
                    "subject": f"🚨 New Camera Reported: ({lat:.4f}, {lon:.4f})",
                    "text": (
                        f"A user reported a new surveillance camera:\n\n"
                        f"ID: #{report_id}\n"
                        f"Coordinates: {lat}, {lon}\n"
                        f"Operator: {operator or 'Not specified'}\n"
                        f"Notes: {notes or 'None'}\n\n"
                        f"Map link: https://fourthroute.org?lat={lat}&lon={lon}"
                    )
                },
                timeout=5
            )
        except Exception as e:
            log.warning(f"Failed to send email via Resend: {e}")


def verify_admin_token(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    authorization: str | None = Header(default=None),
    admin_token: str | None = Query(default=None),
) -> bool:
    """
    Validate admin credentials via Header (X-Admin-Token or Authorization: Bearer <token>)
    or URL query parameter (for backwards compatibility).
    """
    expected_token = os.getenv("ADMIN_TOKEN", "fourthroute-admin-2026")

    token = x_admin_token
    if not token and authorization:
        if authorization.startswith("Bearer "):
            token = authorization[7:].strip()
        else:
            token = authorization.strip()
    if not token and admin_token:
        token = admin_token

    if not token or not hmac.compare_digest(token, expected_token):
        raise HTTPException(status_code=401, detail="Unauthorized admin token")
    return True


@app.post("/cameras/report", tags=["Crowdsourcing"], status_code=201)
def report_camera(report: CameraReport, background_tasks: BackgroundTasks, db=Depends(get_db)):
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

    # Dispatch email / webhook notifications asynchronously without blocking client response
    background_tasks.add_task(
        _notify_new_camera_report,
        new_id, report.lat, report.lon, report.operator, report.notes
    )

    return {"id": new_id, "status": "pending", "message": "Report received, thank you!"}


@app.get("/admin/reports", tags=["Admin"])
def get_reports(
    status: str = Query(default="all", description="all, pending, approved, or rejected"),
    _auth: bool = Depends(verify_admin_token),
    db=Depends(get_db)
):
    """View crowdsourced camera reports for moderation."""
    query = """
        SELECT id, lat, lon, operator, notes, status, created_at
        FROM camera_reports
    """
    params = []
    if status != "all":
        query += " WHERE status = %s"
        params.append(status)
    query += " ORDER BY created_at DESC LIMIT 100"

    with db.cursor() as cur:
        cur.execute(query, params)
        reports = cur.fetchall()

        cur.execute("SELECT COUNT(*) AS pending_count FROM camera_reports WHERE status = 'pending'")
        pending_cnt = cur.fetchone()["pending_count"]

    return {
        "pending_count": pending_cnt,
        "total_returned": len(reports),
        "reports": reports
    }


@app.post("/admin/reports/{report_id}/approve", tags=["Admin"])
def approve_report(report_id: int, _auth: bool = Depends(verify_admin_token), db=Depends(get_db)):
    """Approve a report: add to cameras table and mark approved."""
    with db.cursor() as cur:
        cur.execute("SELECT * FROM camera_reports WHERE id = %s", (report_id,))
        rep = cur.fetchone()
        if not rep:
            raise HTTPException(status_code=404, detail="Report not found")

        # Insert into cameras table
        cur.execute(
            """
            INSERT INTO cameras (geom, source, operator, notes, confidence, verified_at)
            VALUES (ST_SetSRID(ST_Point(%s, %s), 4326)::geography, 'user', %s, %s, 1.0, now())
            RETURNING id
            """,
            (rep["lon"], rep["lat"], rep.get("operator") or "User Reported", rep.get("notes")),
        )
        cam_id = cur.fetchone()["id"]

        cur.execute("UPDATE camera_reports SET status = 'approved' WHERE id = %s", (report_id,))
    db.commit()
    return {"message": "Report approved and added to active camera network", "camera_id": cam_id}


@app.post("/admin/reports/{report_id}/reject", tags=["Admin"])
def reject_report(report_id: int, _auth: bool = Depends(verify_admin_token), db=Depends(get_db)):
    """Reject a report."""
    with db.cursor() as cur:
        cur.execute("UPDATE camera_reports SET status = 'rejected' WHERE id = %s RETURNING id", (report_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Report not found")
    db.commit()
    return {"message": "Report rejected"}


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

    Iteratively excludes the cameras each candidate route passes and
    re-routes, returning the route with the fewest cameras found.

    Returns the Valhalla route plus verified camera counts for that route.
    """
    origin = (req.origin_lat, req.origin_lon)
    dest = (req.dest_lat, req.dest_lon)
    radius = _effective_radius(req.exclusion_radius_m)

    # Cameras in the rough corridor (for map display only)
    cameras = _fetch_corridor_cameras(db, origin, dest, req.corridor_buffer_deg)

    try:
        result = find_privacy_route(
            origin=origin,
            destination=dest,
            cameras_near_route=lambda r: _cameras_near_route(db, r, radius, origin, dest),
            exclusion_radius_m=radius,
            costing=req.costing,
            use_highways=req.use_highways,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing error: {e}")

    on_route = result["cameras_on_route"]
    on_ids = {c["id"] for c in on_route}
    avoided = sum(1 for cid in result["excluded_ids"] if cid not in on_ids)
    camera_free = len(on_route) == 0

    if not camera_free and not req.fallback:
        raise HTTPException(
            status_code=502,
            detail=f"Routing error: no camera-free path found ({len(on_route)} cameras on best route)",
        )

    summary = result["route"].get("trip", {}).get("summary", {})

    return {
        "status": "avoided" if camera_free else "fallback",
        "cameras_in_corridor": len(cameras),
        "cameras_avoided": avoided,
        "cameras_on_route": len(on_route),
        "fallback": not camera_free,
        "fallback_reason": None if camera_free else (
            f"No camera-free path found; returning the route with the fewest cameras found "
            f"({len(on_route)})."
        ),
        "detection_radius_m": radius,
        "search": {"iterations": result["iterations"], "stop_reason": result["stop_reason"]},
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

    Camera counts are verified against each route's geometry. For backward
    compatibility with older clients (which display
    `cameras_in_corridor - cameras_avoided` as "unavoidable"),
    `cameras_in_corridor` is the number of cameras on the fastest route and
    `cameras_avoided` is how many fewer the privacy route passes. The raw
    bounding-box count is returned as `cameras_in_area`.
    """
    origin = (req.origin_lat, req.origin_lon)
    dest = (req.dest_lat, req.dest_lon)
    radius = _effective_radius(req.exclusion_radius_m)

    cameras = _fetch_corridor_cameras(db, origin, dest, req.corridor_buffer_deg)
    near = lambda r: _cameras_near_route(db, r, radius, origin, dest)

    try:
        standard_route = get_standard_route(origin, dest, req.costing)
        std_cams = near(standard_route)
        std_summary = standard_route.get("trip", {}).get("summary", {})
        standard_result = {
            "distance_miles": std_summary.get("length"),
            "duration_seconds": std_summary.get("time"),
            "cameras_on_route": len(std_cams),
            "route": standard_route,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Standard routing error: {e}")

    try:
        privacy = find_privacy_route(
            origin=origin,
            destination=dest,
            cameras_near_route=near,
            exclusion_radius_m=radius,
            costing=req.costing,
            use_highways=req.use_highways,
            seed_routes=[(standard_route, std_cams)],
        )
        prv_cams = privacy["cameras_on_route"]
        prv_summary = privacy["route"].get("trip", {}).get("summary", {})
        avoiding_result = {
            "distance_miles": prv_summary.get("length"),
            "duration_seconds": prv_summary.get("time"),
            "cameras_avoided": max(0, len(std_cams) - len(prv_cams)),
            "cameras_unavoidable": len(prv_cams),
            "cameras_on_route": len(prv_cams),
            "search": {"iterations": privacy["iterations"], "stop_reason": privacy["stop_reason"]},
            "route": privacy["route"],
        }
    except Exception as e:
        log.warning(f"Privacy routing failed: {e}")
        avoiding_result = None

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
        "cameras_in_corridor": len(std_cams),
        "cameras_in_area": len(cameras),
        "detection_radius_m": radius,
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


def _decode_valhalla_polyline(encoded: str) -> list[tuple[float, float]]:
    """Decode a Valhalla 6-digit precision encoded polyline → [(lat, lon), ...]."""
    result, index, lat, lon = [], 0, 0, 0
    while index < len(encoded):
        for is_lon in (False, True):
            b, shift, delta = 0, 0, 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                delta |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~delta >> 1 if delta & 1 else delta >> 1
            if is_lon:
                lon += delta
            else:
                lat += delta
        result.append((lat / 1e6, lon / 1e6))
    return result


# Cap on the camera detection / exclusion radius. Flock-class ALPRs read plates
# within roughly 30–50 m; larger radii count cameras on parallel streets and
# block cross streets, and exhaust Valhalla's exclusion budget. The frontend
# requests 120 m, so this cap is what actually applies.
MAX_DETECTION_RADIUS_M = float(os.getenv("MAX_DETECTION_RADIUS_M", "40"))


def _effective_radius(requested_m: float) -> float:
    return min(requested_m, MAX_DETECTION_RADIUS_M)


def _cameras_near_route(conn, route: dict, radius_m: float,
                        origin: tuple[float, float], dest: tuple[float, float]) -> list[dict]:
    """
    Return every camera within radius_m of the route geometry, with its distance
    to the nearer trip endpoint (used to avoid excluding cameras at the endpoints).
    """
    all_coords: list[tuple[float, float]] = []
    for leg in route.get("trip", {}).get("legs", []):
        shape = leg.get("shape", "")
        if shape:
            all_coords.extend(_decode_valhalla_polyline(shape))

    if len(all_coords) < 2:
        return []

    # Only thin very long routes; thinning cuts corners and skews counts
    step = max(1, len(all_coords) // 4000)
    coords = all_coords[::step]
    if coords[-1] != all_coords[-1]:
        coords.append(all_coords[-1])

    wkt = "LINESTRING(" + ", ".join(f"{lon} {lat}" for lat, lon in coords) + ")"

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   ST_Y(geom::geometry) AS lat,
                   ST_X(geom::geometry) AS lon,
                   operator,
                   LEAST(
                       ST_Distance(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography),
                       ST_Distance(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)
                   ) AS endpoint_dist_m
            FROM cameras
            WHERE ST_DWithin(geom, ST_GeomFromText(%s, 4326)::geography, %s)
            """,
            (origin[1], origin[0], dest[1], dest[0], wkt, radius_m),
        )
        return [dict(r) for r in cur.fetchall()]

