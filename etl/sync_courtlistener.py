#!/usr/bin/env python3
"""
Syncs federal court dockets & published judicial opinions involving Flock Safety / municipal ALPR cameras
from CourtListener REST API v4 (`https://www.courtlistener.com/api/rest/v4/search/`).
Cleanly skips (exit 0) until COURTLISTENER_API_TOKEN is configured in env / GitHub Secrets.
"""

from __future__ import annotations

import os
import re
import sys
import time
import psycopg2
import requests
from dotenv import load_dotenv

SEARCH_URL = "https://www.courtlistener.com/api/rest/v4/search/"
SEARCH_TASKS = [
    ("r", '"Flock Safety"', 2),
    ("o", '"Flock Safety"', 1),
    ("r", '"automated license plate reader" AND ("police" OR "city" OR "sheriff")', 1),
]

US_STATE_ABBRS = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
    "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
    "WV", "WI", "WY",
}

STATE_NAMES = {
    "AL": "alabama", "AK": "alaska", "AZ": "arizona", "AR": "arkansas", "CA": "california",
    "CO": "colorado", "CT": "connecticut", "DE": "delaware", "DC": "district of columbia",
    "FL": "florida", "GA": "georgia", "HI": "hawaii", "ID": "idaho", "IL": "illinois",
    "IN": "indiana", "IA": "iowa", "KS": "kansas", "KY": "kentucky", "LA": "louisiana",
    "ME": "maine", "MD": "maryland", "MA": "massachusetts", "MI": "michigan", "MN": "minnesota",
    "MS": "mississippi", "MO": "missouri", "MT": "montana", "NE": "nebraska", "NV": "nevada",
    "NH": "new hampshire", "NJ": "new jersey", "NM": "new mexico", "NY": "new york",
    "NC": "north carolina", "ND": "north dakota", "OH": "ohio", "OK": "oklahoma", "OR": "oregon",
    "PA": "pennsylvania", "RI": "rhode island", "SC": "south carolina", "SD": "south dakota",
    "TN": "tennessee", "TX": "texas", "UT": "utah", "VT": "vermont", "VA": "virginia",
    "WA": "washington", "WV": "west virginia", "WI": "wisconsin", "WY": "wyoming",
}


def infer_state_from_court(court_id: str | None, text_blob: str) -> str | None:
    cid = (court_id or "").lower().strip()
    if len(cid) >= 2 and cid[:2].upper() in US_STATE_ABBRS and cid[:2] not in ("us", "ca", "dc"):
        return cid[:2].upper()
    if cid in ("cacd", "caed", "cand", "casd") or cid.startswith("cal"):
        return "CA"
    if cid == "dcd":
        return "DC"
    tl = text_blob.lower()
    for st, full_name in STATE_NAMES.items():
        if re.search(rf"\b{re.escape(full_name)}\b", tl):
            return st
    return None


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
    cases: dict[str, tuple[str, dict]] = {}

    for qtype, q, max_pages in SEARCH_TASKS:
        next_url: str | None = SEARCH_URL
        params: dict | None = {"q": q, "type": qtype}
        page = 0
        while next_url and page < max_pages:
            resp = None
            for attempt in range(3):
                resp = requests.get(next_url, params=params, headers=hdr, timeout=20)
                if resp.status_code in (429, 502, 503, 504):
                    retry_after = float(resp.headers.get("Retry-After") or (4 * (attempt + 1)))
                    time.sleep(min(20.0, retry_after))
                    continue
                break
            if resp is None or resp.status_code >= 429:
                print(f"CourtListener HTTP {resp.status_code if resp else 'err'} on page {page + 1}; saving partial results.")
                break
            resp.raise_for_status()
            data = resp.json()
            for r in data.get("results") or []:
                did = r.get("docket_id") or r.get("cluster_id") or r.get("id")
                if not did:
                    continue
                key = f"cl-{qtype}-{did}"
                if key not in cases:
                    cases[key] = (qtype, r)
            next_url = data.get("next")
            params = None
            page += 1
            time.sleep(2.5)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT slug, agency_name, city, state FROM agency_portals WHERE city IS NOT NULL")
    portals = cur.fetchall()

    upserted = 0
    matched_count = 0
    for key, (qtype, r) in cases.items():
        case_name = (r.get("caseName") or r.get("caseNameFull") or r.get("case_name_full") or "Federal Docket").strip()
        abs_url = r.get("docket_absolute_url") or r.get("absolute_url") or ""
        case_url = (
            f"https://www.courtlistener.com{abs_url}"
            if abs_url.startswith("/")
            else (abs_url or "https://www.courtlistener.com")
        )
        parties = " ".join(r.get("party") or []) if isinstance(r.get("party"), list) else ""
        blob = f"{case_name} {parties} {r.get('court') or ''} {r.get('court_citation_string') or ''}"
        court_state = infer_state_from_court(r.get("court_id"), blob)

        matched_slug, matched_city, matched_state = None, None, court_state
        blob_l = blob.lower()
        for slug, ag_name, city, st in portals:
            if not city or len(city) < 4:
                continue
            if court_state and st != court_state:
                continue
            if re.search(rf"\b{re.escape(city.lower())}\b", blob_l):
                # Require municipal context or state confirmation to avoid generic city word collisions
                if st == court_state or re.search(rf"\b(?:city of {re.escape(city.lower())}|{re.escape(city.lower())} police|police department)\b", blob_l):
                    matched_slug, matched_city, matched_state = slug, city, st
                    matched_count += 1
                    break

        suit_nature = (r.get("suitNature") or "").strip()
        cause = (r.get("cause") or "").strip()
        summary = " · ".join(p for p in [suit_nature, cause] if p) or None

        cur.execute(
            """
            INSERT INTO agency_court_cases (
                case_key, docket_id, agency_slug, city, state, case_name, court,
                date_filed, docket_number, case_url, summary, synced_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (case_key) DO UPDATE SET
                agency_slug = COALESCE(EXCLUDED.agency_slug, agency_court_cases.agency_slug),
                city = COALESCE(EXCLUDED.city, agency_court_cases.city),
                state = COALESCE(EXCLUDED.state, agency_court_cases.state),
                case_name = EXCLUDED.case_name,
                court = EXCLUDED.court,
                date_filed = EXCLUDED.date_filed,
                docket_number = EXCLUDED.docket_number,
                case_url = EXCLUDED.case_url,
                summary = COALESCE(EXCLUDED.summary, agency_court_cases.summary),
                synced_at = now()
            """,
            (
                key,
                r.get("docket_id"),
                matched_slug,
                matched_city,
                matched_state,
                case_name,
                (r.get("court") or r.get("court_id") or "").strip() or None,
                (r.get("dateFiled") or "")[:10] or None,
                (r.get("docketNumber") or "")[:80] or None,
                case_url,
                summary,
            ),
        )
        upserted += 1

    conn.commit()
    cur.execute("SELECT COUNT(*), COUNT(agency_slug) FROM agency_court_cases")
    total, slug_matches = cur.fetchone()
    conn.close()
    print(f"Upserted {upserted} CourtListener ALPR records -> DB total={total} (matched portals={slug_matches})")


if __name__ == "__main__":
    main()
