#!/usr/bin/env python3
"""
ETL: Fetch ALPR cameras from OSM Overpass API and upsert into PostGIS.

Usage:
    python etl/fetch_cameras.py

Env vars:
    DATABASE_URL  - PostgreSQL connection string
                    default: postgresql://alpr:alprpass@localhost:5432/alpr_nav
"""

from __future__ import annotations

import os
import sys
import time
import logging
from datetime import datetime, timezone
from typing import Optional

import requests
import psycopg2
from psycopg2.extras import execute_values

try:
    from dotenv import load_dotenv
    # Load root .env or .env.local if present
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
except ImportError:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://alpr:alprpass@localhost:5432/alpr_nav"
)

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Query for all ALPR/ANPR and Flock Safety nodes in OSM
OVERPASS_QUERY = """
[out:json][timeout:180];
(
  node["man_made"="surveillance"]["surveillance:type"~"^[Aa][Ll][Pp][Rr]$|^[Aa][Nn][Pp][Rr]$"];
  node["man_made"="surveillance"]["camera:type"~"^[Aa][Ll][Pp][Rr]$|^[Aa][Nn][Pp][Rr]$"];
  node["man_made"="surveillance"]["operator"~"Flock",i];
  node["man_made"="surveillance"]["manufacturer"~"Flock",i];
  node["man_made"="surveillance"]["brand"~"Flock",i];
  node["surveillance"~"^[Aa][Ll][Pp][Rr]$|^[Aa][Nn][Pp][Rr]$"];
);
out body;
"""

# For dev/testing/regional sync: limit to a specific bounding box
# Format: south,west,north,east
BBOX_QUERY_TEMPLATE = """
[out:json][timeout:90];
(
  node["man_made"="surveillance"]["surveillance:type"~"^[Aa][Ll][Pp][Rr]$|^[Aa][Nn][Pp][Rr]$"]({bbox});
  node["man_made"="surveillance"]["camera:type"~"^[Aa][Ll][Pp][Rr]$|^[Aa][Nn][Pp][Rr]$"]({bbox});
  node["man_made"="surveillance"]["operator"~"Flock",i]({bbox});
  node["man_made"="surveillance"]["manufacturer"~"Flock",i]({bbox});
  node["man_made"="surveillance"]["brand"~"Flock",i]({bbox});
  node["surveillance"~"^[Aa][Ll][Pp][Rr]$|^[Aa][Nn][Pp][Rr]$"]({bbox});
);
out body;
"""


def fetch_from_overpass(bbox = None, max_retries: int = 4) -> list[dict]:
    """Fetch ALPR camera nodes from Overpass API with retry and mirror fallback."""
    query = BBOX_QUERY_TEMPLATE.format(bbox=bbox) if bbox else OVERPASS_QUERY

    for attempt in range(1, max_retries + 1):
        endpoint = OVERPASS_URLS[(attempt - 1) % len(OVERPASS_URLS)]
        try:
            log.info(f"Fetching from Overpass ({endpoint}, attempt {attempt})...")
            resp = requests.post(
                endpoint,
                data={"data": query},
                timeout=130,
                headers={"User-Agent": "alpr-nav-etl/1.0 (https://fourthroute.org)"},
            )
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
            log.info(f"Fetched {len(elements)} elements from Overpass")
            return elements
        except (requests.RequestException, ValueError) as e:
            log.warning(f"Overpass request failed on {endpoint}: {e}")
            if attempt < max_retries:
                wait = 10 * attempt
                log.info(f"Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise


def parse_element(el: dict):
    """Convert an OSM element to a camera dict. Returns None if invalid."""
    if el.get("type") != "node":
        return None
    lat = el.get("lat")
    lon = el.get("lon")
    if lat is None or lon is None:
        return None

    tags = el.get("tags", {})
    direction_raw = tags.get("camera:direction") or tags.get("direction")
    try:
        direction = int(float(direction_raw)) if direction_raw else None
    except (ValueError, TypeError):
        direction = None

    # Identify operator / manufacturer / brand
    op = tags.get("operator")
    mfr = tags.get("manufacturer")
    brand = tags.get("brand")

    # Combine operator and vendor info cleanly (e.g. "City of Piedmont (Flock Safety)")
    operator_str = None
    if op and mfr and op.lower() != mfr.lower():
        operator_str = f"{op} ({mfr})"
    elif op:
        operator_str = op
    elif mfr:
        operator_str = mfr
    elif brand:
        operator_str = brand

    is_flock = any("flock" in (s or "").lower() for s in (op, mfr, brand))

    # Derive confidence from tagging richness
    confidence = 0.6  # base for any ALPR tag
    if is_flock:
        confidence += 0.25
    elif mfr or op:
        confidence += 0.2
    if direction is not None:
        confidence += 0.1
    if tags.get("verified"):
        confidence += 0.1

    notes = tags.get("description")
    if not notes:
        extras = []
        if tags.get("camera:mount"):
            extras.append(f"Mounted on {tags.get('camera:mount')}")
        if tags.get("electricity") == "solar":
            extras.append("Solar-powered")
        if extras:
            notes = " · ".join(extras)

    return {
        "osm_id": el["id"],
        "lat": lat,
        "lon": lon,
        "operator": operator_str,
        "direction": direction,
        "confidence": round(min(confidence, 1.0), 2),
        "notes": notes,
    }


def upsert_cameras(conn, cameras: list[dict]) -> tuple[int, int]:
    """Upsert cameras into the DB. Returns (total_upserted, 0) counts."""
    if not cameras:
        return 0, 0

    rows = [
        (
            c["osm_id"],
            c["lon"],   # ST_MakePoint expects (lon, lat)
            c["lat"],
            "osm",
            c["operator"],
            c["direction"],
            c["confidence"],
            c["notes"],
        )
        for c in cameras
    ]

    with conn.cursor() as cur:
        # Count before so we can report accurate insert vs update numbers
        cur.execute("SELECT COUNT(*) FROM cameras WHERE source = 'osm'")
        before = cur.fetchone()[0]

        execute_values(
            cur,
            """
            INSERT INTO cameras
                (osm_id, geom, source, operator, direction, confidence, notes, updated_at)
            VALUES %s
            ON CONFLICT (osm_id) DO UPDATE SET
                geom       = EXCLUDED.geom,
                operator   = EXCLUDED.operator,
                direction  = EXCLUDED.direction,
                confidence = EXCLUDED.confidence,
                notes      = EXCLUDED.notes,
                updated_at = now()
            """,
            rows,
            template="""(
                %s,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                %s, %s, %s, %s, %s, now()
            )""",
        )
        cur.execute("SELECT COUNT(*) FROM cameras WHERE source = 'osm'")
        after = cur.fetchone()[0]

    conn.commit()
    inserted = after - before
    updated = len(cameras) - inserted
    return inserted, updated


def delete_stale_osm_cameras(conn, live_osm_ids: set[int], bbox: str | None = None) -> int:
    """Remove OSM cameras that no longer appear in the Overpass result.

    If bbox is provided, only deletes cameras within that bounding box
    (so multi-region syncs don't clobber each other).
    """
    if not live_osm_ids:
        return 0

    with conn.cursor() as cur:
        if bbox:
            # Parse "south,west,north,east"
            south, west, north, east = [float(x) for x in bbox.split(",")]
            cur.execute(
                """
                DELETE FROM cameras
                WHERE source = 'osm'
                  AND osm_id IS NOT NULL
                  AND osm_id > 0
                  AND osm_id != ALL(%s)
                  AND geom::geometry && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
                  AND ST_Within(geom::geometry, ST_MakeEnvelope(%s, %s, %s, %s, 4326))
                """,
                (list(live_osm_ids), west, south, east, north, west, south, east, north),
            )
        else:
            # Global sync — safe to delete anything not in results
            cur.execute(
                """
                DELETE FROM cameras
                WHERE source = 'osm'
                  AND osm_id IS NOT NULL
                  AND osm_id != ALL(%s)
                """,
                (list(live_osm_ids),),
            )
        deleted = cur.rowcount
    conn.commit()
    log.info(f"Deleted {deleted} stale OSM cameras (bbox={bbox or 'global'})")
    return deleted



def log_sync(conn, source: str, started_at: datetime, inserted: int,
             updated: int, deleted: int, error: str | None = None):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sync_log
                (source, started_at, finished_at, inserted, updated, deleted, error)
            VALUES (%s, %s, now(), %s, %s, %s, %s)
            """,
            (source, started_at, inserted, updated, deleted, error),
        )
    conn.commit()


def run(bbox=None, exit_on_error: bool = True) -> bool:
    started_at = datetime.now(timezone.utc)
    log.info("Starting OSM ALPR camera sync")
    log.info(f"Bounding box: {bbox or 'global (all OSM)'}")

    conn = psycopg2.connect(DATABASE_URL)

    error = None
    inserted = updated = deleted = 0

    try:
        elements = fetch_from_overpass(bbox=bbox)
        cameras = [c for el in elements if (c := parse_element(el))]
        log.info(f"Parsed {len(cameras)} valid camera records")

        inserted, updated = upsert_cameras(conn, cameras)
        log.info(f"Upserted: +{inserted} net new, {updated} updated")

        live_ids = {c["osm_id"] for c in cameras}
        deleted = delete_stale_osm_cameras(conn, live_ids, bbox=bbox)

    except Exception as e:
        error = str(e)
        log.error(f"Sync failed: {e}")

    finally:
        log_sync(conn, "osm", started_at, inserted, updated, deleted, error)
        conn.close()

    if error:
        if exit_on_error:
            sys.exit(1)
        return False

    log.info("Sync complete ✓")
    return True


REGIONS: dict[str, str] = {
    # 1. West Coast (CA, WA, OR)
    "ca_bay_area":          "37.2,-122.6,38.0,-121.8",
    "ca_la_oc":             "33.4,-119.0,34.4,-117.0",
    "ca_san_diego":         "32.5,-118.0,33.5,-116.0",
    "ca_sacramento":        "38.0,-122.5,39.5,-120.5",
    "ca_central_valley":    "35.5,-122.0,38.0,-118.5",
    "ca_norcal":            "39.5,-124.5,42.0,-120.0",
    "wa_seattle":           "47.3,-122.6,47.8,-121.9",
    "wa_rest":              "45.5,-124.8,49.0,-116.9",
    "or_portland":          "45.2,-123.2,45.7,-122.3",
    "or_rest":              "41.9,-124.6,46.3,-116.5",
    # 2. Southwest & Mountain (TX, NV, AZ, CO, UT, NM, ID, MT, WY)
    "tx_dfw":               "32.5,-97.8,33.3,-96.5",
    "tx_houston":           "29.4,-95.9,30.2,-94.8",
    "tx_austin_sa":         "29.0,-98.8,30.6,-97.0",
    "tx_rest":              "25.8,-106.7,36.5,-93.5",
    "nv_las_vegas":         "35.8,-115.5,36.5,-114.9",
    "nv_reno":              "39.3,-120.0,39.7,-119.6",
    "nv_rest":              "35.0,-120.0,42.0,-114.0",
    "az_all":               "31.33,-114.81,37.0,-109.04",
    "co_ut_nm":             "31.3,-114.1,42.0,-102.0",
    "id_mt_wy":             "41.0,-117.3,49.0,-104.0",
    # 3. Midwest & Great Plains (IL, WI, IN, MI, OH, MN, IA, MO, KS, NE, SD, ND)
    "il_wi":                "36.9,-92.9,47.1,-86.8",
    "in_mi_oh":             "38.4,-88.1,48.3,-80.5",
    "mn_ia_mo":             "35.9,-97.2,49.4,-89.1",
    "plains_ks_ne_dakotas": "36.9,-104.1,49.0,-94.5",
    # 4. Southeast & Mid-Atlantic (FL, GA, NC, SC, VA, WV, MD, DC, DE, KY, TN, AL, MS, OK, AR, LA)
    "fl_south_central":     "24.4,-83.0,29.0,-79.8",
    "fl_north_ga":          "29.0,-87.6,35.0,-80.0",
    "nc_sc":                "32.0,-84.4,36.6,-75.4",
    "va_wv_dc_md_de":       "36.5,-83.7,39.8,-75.0",
    "ky_tn_al_ms":          "30.1,-91.7,39.2,-81.6",
    "ok_ar_la":             "28.9,-103.0,37.0,-88.8",
    # 5. Northeast & New England (PA, NJ, NY, CT, RI, MA, VT, NH, ME)
    "pa_nj":                "38.9,-80.6,42.3,-73.8",
    "ny_ct_ri":             "40.4,-79.8,45.1,-71.1",
    "ma_vt_nh_me":          "41.2,-73.6,47.5,-66.9",
    # 6. Non-Contiguous (HI, AK)
    "hi_all":               "18.8,-160.3,22.3,-154.7",
    "ak_all":               "51.2,-179.2,71.4,-129.9",
}

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Sync ALPR cameras from OSM Overpass")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--bbox",
        help="Bounding box as 'south,west,north,east'",
    )
    group.add_argument(
        "--region",
        choices=list(REGIONS.keys()) + ["all"],
        help="Named region, or 'all' to sync every region across all 50 states",
    )
    args = parser.parse_args()

    if args.region == "all":
        failed_regions = []
        for idx, (name, bbox) in enumerate(REGIONS.items(), 1):
            log.info(f"=== [{idx}/{len(REGIONS)}] Region: {name} ({bbox}) ===")
            ok = run(bbox=bbox, exit_on_error=False)
            if not ok:
                failed_regions.append(name)
            log.info("Sleeping 6s before next region...")
            time.sleep(6)
        log.info(f"=== Nationwide sync finished ({len(REGIONS) - len(failed_regions)}/{len(REGIONS)} regions succeeded) ===")
        if failed_regions:
            log.warning(f"Failed regions: {failed_regions}")
    elif args.region:
        run(bbox=REGIONS[args.region])
    else:
        run(bbox=args.bbox)
