#!/usr/bin/env python3
"""
Syncs federal court dockets & lawsuits involving Flock Safety / municipal ALPR cameras
from CourtListener REST API v4 (`https://www.courtlistener.com/api/rest/v4/search/`).
Cleanly skips (exit 0) until COURTLISTENER_API_TOKEN is configured in env / GitHub Secrets.
"""

from __future__ import annotations

import os
import re
import sys
import psycopg2
import requests
from dotenv import load_dotenv

SEARCH_URL = "https://www.courtlistener.com/api/rest/v4/search/"
QUERIES = [
    '"Flock Safety"',
    '"automated license plate reader" AND ("police" OR "city" OR "sheriff")',
]


def main():
    load_dotenv()
    token = os.getenv("COURTLISTENER_API_TOKEN", "").strip()
    db_url = os.getenv("SUPABASE_DATABASE_URL") or os.getenv("DATABASE_URL")

    if not token:
        print("COURTLISTENER_API_TOKEN not configured; skipping CourtListener sync.")
        sys.exit(0)
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    hdr = {"Authorization": f"Token {token}", "User-Agent": "FourthRoute/1.0"}
    cases: dict[str, dict] = {}
    for q in QUERIES:
        resp = requests.get(SEARCH_URL, params={"q": q, "type": "r"}, headers=hdr, timeout=20)
        resp.raise_for_status()
        for r in (resp.json().get("results") or [])[:40]:
            docket_id = r.get("docket_id") or r.get("id")
            key = f"cl-{docket_id}" if docket_id else None
            if key:
                cases[key] = r

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT slug, agency_name, city, state FROM agency_portals WHERE city IS NOT NULL")
    portals = cur.fetchall()

    upserted = 0
    for key, r in cases.items():
        case_name = (r.get("caseName") or r.get("case_name") or "Federal Docket").strip()
        abs_url = r.get("docket_absolute_url") or r.get("absolute_url") or ""
        case_url = f"https://www.courtlistener.com{abs_url}" if abs_url.startswith("/") else (abs_url or "https://www.courtlistener.com")
        matched_slug, matched_city, matched_state = None, None, None
        cname_l = case_name.lower()
        for slug, ag_name, city, st in portals:
            if city and len(city) >= 4 and re.search(rf"\b{re.escape(city.lower())}\b", cname_l):
                matched_slug, matched_city, matched_state = slug, city, st
                break

        cur.execute(
            """
            INSERT INTO agency_court_cases (
                case_key, docket_id, agency_slug, city, state, case_name, court,
                date_filed, docket_number, case_url, summary, synced_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (case_key) DO UPDATE SET
                agency_slug = COALESCE(EXCLUDED.agency_slug, agency_court_cases.agency_slug),
                case_name = EXCLUDED.case_name,
                court = EXCLUDED.court,
                date_filed = EXCLUDED.date_filed,
                docket_number = EXCLUDED.docket_number,
                case_url = EXCLUDED.case_url,
                synced_at = now()
            """,
            (
                key,
                r.get("docket_id"),
                matched_slug,
                matched_city,
                matched_state,
                case_name,
                r.get("court") or r.get("court_id"),
                (r.get("dateFiled") or "")[:10] or None,
                r.get("docketNumber") or r.get("docket_number"),
                case_url,
                None,
            ),
        )
        upserted += 1

    conn.commit()
    conn.close()
    print(f"Upserted {upserted} CourtListener ALPR dockets")


if __name__ == "__main__":
    main()
