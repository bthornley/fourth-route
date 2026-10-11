#!/usr/bin/env python3
"""
ETL: Load nationwide ALPR cameras GeoJSON (144,000+ points across all 50 states)
into PostGIS cameras table.

Source: OpenStreetMap surveillance tagging + DeFlock dataset.
"""

import json
import logging
import os
import sys
import time
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    for env_file in [os.path.join(ROOT, ".env"), os.path.join(ROOT, ".env.local")]:
        if os.path.exists(env_file):
            for line in open(env_file):
                if line.startswith("DATABASE_URL="):
                    DATABASE_URL = line.strip().split("=", 1)[1].strip("\"'")
                    break
        if DATABASE_URL:
            break

if not DATABASE_URL:
    log.error("DATABASE_URL not found")
    sys.exit(1)

GEOJSON_PATH = os.path.join(ROOT, "scratch/nationwide/cameras.geojson")
if not os.path.exists(GEOJSON_PATH):
    log.error(f"GeoJSON not found at {GEOJSON_PATH}")
    sys.exit(1)

def parse_direction(val):
    if val is None:
        return None
    try:
        d = int(float(val))
        return d if 0 <= d <= 360 else None
    except (ValueError, TypeError):
        return None

def main():
    log.info(f"Loading {GEOJSON_PATH} ...")
    t0 = time.time()
    with open(GEOJSON_PATH, "r") as f:
        data = json.load(f)
    features = data.get("features", [])
    log.info(f"Loaded {len(features):,} features from JSON in {time.time() - t0:.2f}s")

    conn = psycopg2.connect(DATABASE_URL)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM cameras")
        before_count = cur.fetchone()[0]
    log.info(f"Current cameras in database: {before_count:,}")

    batch_size = 5000
    rows = []
    total_processed = 0
    t_start = time.time()

    insert_sql = """
    INSERT INTO cameras (osm_id, geom, source, operator, direction, confidence, notes, updated_at)
    VALUES %s
    ON CONFLICT (osm_id) DO UPDATE SET
        geom       = EXCLUDED.geom,
        operator   = COALESCE(cameras.operator, EXCLUDED.operator),
        direction  = COALESCE(cameras.direction, EXCLUDED.direction),
        notes      = COALESCE(cameras.notes, EXCLUDED.notes),
        updated_at = now()
    """
    template = """(
        %s,
        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
        %s, %s, %s, %s, %s, now()
    )"""

    for feat in features:
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        if not coords or len(coords) < 2:
            continue
        lon, lat = coords[0], coords[1]
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            continue

        props = feat.get("properties") or {}
        raw_id = props.get("osmId")
        if raw_id is None:
            continue

        osm_type = props.get("osmType", "node")
        osm_id = -abs(int(raw_id)) if osm_type == "way" else int(raw_id)

        operator = props.get("operator") or props.get("brand") or "ALPR Camera"
        direction = parse_direction(props.get("direction"))
        mount = props.get("mountType")
        notes = f"mount:{mount}" if mount else None

        rows.append((
            osm_id,
            lon,
            lat,
            "osm",
            operator,
            direction,
            1.0,
            notes
        ))

        if len(rows) >= batch_size:
            with conn.cursor() as cur:
                execute_values(cur, insert_sql, rows, template=template)
            conn.commit()
            total_processed += len(rows)
            log.info(f"Upserted {total_processed:,} / {len(features):,} cameras ({total_processed / len(features) * 100:.1f}%)")
            rows = []

    if rows:
        with conn.cursor() as cur:
            execute_values(cur, insert_sql, rows, template=template)
        conn.commit()
        total_processed += len(rows)
        log.info(f"Upserted final batch. Total processed: {total_processed:,}")

    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM cameras")
        after_count = cur.fetchone()[0]
    log.info(f"Finished in {time.time() - t_start:.2f}s! Cameras in DB: {after_count:,} (+{after_count - before_count:,} net new)")
    conn.close()

if __name__ == "__main__":
    main()
