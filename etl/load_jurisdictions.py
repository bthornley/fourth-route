"""
Load jurisdiction boundaries (incorporated cities/towns + counties) into PostGIS.

Source: US Census Bureau 2023 cartographic boundary files (public domain).
  https://www2.census.gov/geo/tiger/GENZ2023/shp/

These tables power the `camera_jurisdiction` view (db/jurisdictions.sql), which
assigns each camera to the city or county it sits in. That is the first step
toward answering "who likely operates this camera, and who can search its data?"

Only *incorporated* places are loaded (LSAD 25 = city, 43 = town). Census-designated
places (unincorporated communities) are policed by the county sheriff, so a camera
inside one falls through to its county.

Usage:
    DATABASE_URL=postgres://... python etl/load_jurisdictions.py [STATEFP ...]
    (default states: 06 = California, 32 = Nevada)

Safe to re-run: loads into staging tables, then swaps them in one transaction.
Touches no existing tables.
"""
import io
import json
import os
import sys
import zipfile

import psycopg2
import requests
import shapefile  # pyshp

BASE = "https://www2.census.gov/geo/tiger/GENZ2023/shp"
INCORPORATED_LSAD = {"25", "43"}  # city, town


def fetch_shapefile(name: str) -> shapefile.Reader:
    r = requests.get(f"{BASE}/{name}.zip", timeout=120)
    r.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(r.content))
    parts = {ext: io.BytesIO(z.read(f"{name}.{ext}")) for ext in ("shp", "shx", "dbf")}
    return shapefile.Reader(shp=parts["shp"], shx=parts["shx"], dbf=parts["dbf"])


def records(reader: shapefile.Reader):
    fields = [f[0].lower() for f in reader.fields[1:]]
    for sr in reader.iterShapeRecords():
        yield dict(zip(fields, sr.record)), sr.shape.__geo_interface__


# NAD83 (4269) → WGS84 (4326) so boundaries share an SRID with cameras.geom.
INSERT = """
INSERT INTO {table} (geoid, statefp, name, namelsad, lsad, geom)
VALUES (%s, %s, %s, %s, %s,
        ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4269), 4326)))
"""


def main():
    states = sys.argv[1:] or ["06", "32"]
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    for stage in ("jurisdiction_place_stage", "jurisdiction_county_stage"):
        cur.execute(f"DROP TABLE IF EXISTS {stage}")
        cur.execute(f"""CREATE TABLE {stage} (
            geoid text PRIMARY KEY, statefp text NOT NULL, name text NOT NULL,
            namelsad text, lsad text, geom geometry(MultiPolygon, 4326) NOT NULL)""")

    n_place = 0
    for st in states:
        for rec, geo in records(fetch_shapefile(f"cb_2023_{st}_place_500k")):
            if rec["lsad"] not in INCORPORATED_LSAD:
                continue
            cur.execute(INSERT.format(table="jurisdiction_place_stage"),
                        (rec["geoid"], rec["statefp"], rec["name"], rec["namelsad"], rec["lsad"], json.dumps(geo)))
            n_place += 1

    n_county = 0
    for rec, geo in records(fetch_shapefile("cb_2023_us_county_500k")):
        if rec["statefp"] not in states:
            continue
        cur.execute(INSERT.format(table="jurisdiction_county_stage"),
                    (rec["geoid"], rec["statefp"], rec["name"], rec["namelsad"], rec["lsad"], json.dumps(geo)))
        n_county += 1

    # Atomic swap. The camera_jurisdiction view depends on these tables, so drop it
    # first and recreate it from db/jurisdictions.sql afterwards.
    cur.execute("DROP VIEW IF EXISTS camera_jurisdiction")
    for kind in ("place", "county"):
        cur.execute(f"DROP TABLE IF EXISTS jurisdiction_{kind}")
        cur.execute(f"ALTER TABLE jurisdiction_{kind}_stage RENAME TO jurisdiction_{kind}")
        cur.execute(f"ALTER INDEX jurisdiction_{kind}_stage_pkey RENAME TO jurisdiction_{kind}_pkey")
        cur.execute(f"CREATE INDEX jurisdiction_{kind}_geom_idx ON jurisdiction_{kind} USING gist (geom)")
    cur.execute("COMMENT ON TABLE jurisdiction_place IS "
                "'US Census 2023 cartographic boundaries (public domain): incorporated cities/towns'")
    cur.execute("COMMENT ON TABLE jurisdiction_county IS "
                "'US Census 2023 cartographic boundaries (public domain): counties'")

    sql_path = os.path.join(os.path.dirname(__file__), "..", "db", "jurisdictions.sql")
    with open(sql_path) as f:
        cur.execute(f.read())

    conn.commit()
    print(f"Loaded {n_place} incorporated places and {n_county} counties for states {states}.")


if __name__ == "__main__":
    main()
