"""
Load Eyes on Flock transparency portal records into Supabase.

Source: Eyes on Flock (https://eyesonflock.com), licensed under CC BY-SA 4.0.
Aggregates public transparency portal data published by law enforcement agencies using Flock Safety.

Usage:
    DATABASE_URL=postgres://... python etl/load_agency_portals.py [JSON_PATH]
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values

DEFAULT_JSON = os.path.expanduser(
    "/Users/bthornley/.gemini/antigravity/brain/c99fba47-a520-436b-a408-1d642e43c444/scratch/eyesonflock_2026-10-07.json"
)

# Common city name aliases to ensure 100% clean matching with Census place names
CITY_ALIASES = {
    "CA": {
        "carmel": "Carmel-by-the-Sea",
        "city of riverside": "Riverside",
        "foster": "Foster City",
        "rohnert": "Rohnert Park",
        "union": "Union City",
        "ventura": "San Buenaventura (Ventura)",
    },
    "TX": {
        "mcallen": "McAllen",
        "edinburg": "Edinburg",
    }
}


def derive_agency_name(p: dict) -> str:
    city = p.get("city")
    county = p.get("county")
    atype = (p.get("type") or "PD").upper()

    if city:
        if atype in ("PD", "POLICE"):
            return f"{city} Police Department"
        return f"{city} {atype}"
    elif county:
        clean_county = county.replace(" County", "").strip()
        if atype in ("SD", "SO", "SHERIFF"):
            return f"{clean_county} County Sheriff's Office"
        return f"{clean_county} County {atype}"
    return p.get("slug", "Unknown Agency").replace("-", " ").title()


def parse_timestamp(val: str | None) -> str | None:
    if not val:
        return None
    try:
        # Normalize ISO strings
        return datetime.fromisoformat(val.replace("Z", "+00:00")).isoformat()
    except Exception:
        return None


def main():
    json_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_JSON
    if not os.path.exists(json_path):
        print(f"Error: JSON file not found at {json_path}")
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    portals = data.get("portals", [])
    snapshot_date_raw = data.get("snapshot_date", {})
    if isinstance(snapshot_date_raw, dict) and "$date" in snapshot_date_raw:
        snapshot_date = snapshot_date_raw["$date"]
    else:
        snapshot_date = str(snapshot_date_raw or datetime.utcnow().isoformat())

    print(f"Loaded {len(portals)} portal records from {json_path} (Snapshot: {snapshot_date})")

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL environment variable is required")
        sys.exit(1)

    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # 1. Ensure schema exists
    schema_path = os.path.join(os.path.dirname(__file__), "..", "db", "agency_portals.sql")
    if os.path.exists(schema_path):
        with open(schema_path, "r") as f:
            cur.execute(f.read())
        conn.commit()
        print("Applied db/agency_portals.sql schema and camera_agency view.")

    # 2. Prepare records
    rows = []
    for p in portals:
        slug = p.get("slug")
        if not slug:
            continue

        st = (p.get("state") or "").upper()
        raw_city = p.get("city")
        city = CITY_ALIASES.get(st, {}).get(raw_city.lower() if raw_city else "", raw_city)
        county = p.get("county")
        atype = (p.get("type") or "PD").upper()
        agency_name = derive_agency_name({**p, "city": city})

        portal_url = p.get("portal_url") or f"https://transparency.flocksafety.com/{slug}"
        pop = p.get("population")
        cams = p.get("total_cameras")
        searches = p.get("total_searches")
        retention = p.get("data_retention")
        vehicles = p.get("vehicles_captured")
        hits = p.get("hotlist_hits")
        hit_rate = p.get("hotlist_hit_rate")
        org_count = p.get("organization_count")
        shared_with = json.dumps(p.get("organizations_shared_with") or [])
        rec_count = p.get("receiving_organization_count")
        rec_from = json.dumps(p.get("organizations_received_from") or [])
        prohibited = p.get("prohibited_uses")
        audit = p.get("public_search_audit", False)
        updated_at = parse_timestamp(p.get("data_last_updated"))

        rows.append((
            slug, portal_url, agency_name, city, county, st, atype,
            pop, cams, searches, retention, vehicles, hits, hit_rate,
            org_count, shared_with, rec_count, rec_from, prohibited,
            audit, updated_at, snapshot_date
        ))

    # 3. Upsert
    upsert_sql = """
    INSERT INTO agency_portals (
        slug, portal_url, agency_name, city, county, state, agency_type,
        population, total_cameras, total_searches, data_retention,
        vehicles_captured, hotlist_hits, hotlist_hit_rate,
        organization_count, organizations_shared_with,
        receiving_organization_count, organizations_received_from,
        prohibited_uses, public_search_audit, data_last_updated,
        snapshot_date, updated_at
    ) VALUES %s
    ON CONFLICT (slug) DO UPDATE SET
        portal_url = EXCLUDED.portal_url,
        agency_name = EXCLUDED.agency_name,
        city = EXCLUDED.city,
        county = EXCLUDED.county,
        state = EXCLUDED.state,
        agency_type = EXCLUDED.agency_type,
        population = EXCLUDED.population,
        total_cameras = EXCLUDED.total_cameras,
        total_searches = EXCLUDED.total_searches,
        data_retention = EXCLUDED.data_retention,
        vehicles_captured = EXCLUDED.vehicles_captured,
        hotlist_hits = EXCLUDED.hotlist_hits,
        hotlist_hit_rate = EXCLUDED.hotlist_hit_rate,
        organization_count = EXCLUDED.organization_count,
        organizations_shared_with = EXCLUDED.organizations_shared_with,
        receiving_organization_count = EXCLUDED.receiving_organization_count,
        organizations_received_from = EXCLUDED.organizations_received_from,
        prohibited_uses = EXCLUDED.prohibited_uses,
        public_search_audit = EXCLUDED.public_search_audit,
        data_last_updated = EXCLUDED.data_last_updated,
        snapshot_date = EXCLUDED.snapshot_date,
        updated_at = now();
    """

    template = """(
        %s, %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s,
        %s, %s::jsonb,
        %s, %s::jsonb,
        %s, %s, %s,
        %s, now()
    )"""

    execute_values(cur, upsert_sql, rows, template=template, page_size=200)
    conn.commit()

    # 4. Print summary stats
    cur.execute("SELECT count(*) FROM agency_portals;")
    total_stored = cur.fetchone()[0]

    cur.execute("""
        SELECT state, count(*) 
        FROM agency_portals 
        GROUP BY state 
        ORDER BY count(*) DESC 
        LIMIT 10;
    """)
    top_states = cur.fetchall()

    cur.execute("""
        SELECT count(*), count(agency_slug) 
        FROM camera_agency;
    """)
    cam_total, cam_matched = cur.fetchone()

    print(f"\nSuccessfully stored {total_stored} agency portals in database.")
    print("Top states in portal database:")
    for st, count in top_states:
        print(f"  {st}: {count} agencies")

    print(f"\nCamera Matching Results:")
    print(f"  Total cameras in system: {cam_total}")
    print(f"  Cameras matched to verified transparency portals: {cam_matched} ({cam_matched / max(1, cam_total) * 100:.1f}%)")

    conn.close()


if __name__ == "__main__":
    main()
