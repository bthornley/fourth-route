#!/usr/bin/env python3
"""
Syncs verified federal ALPR contracts & law-enforcement grants from USASpending.gov
(api.usaspending.gov — zero API key required) into Postgres `federal_alpr_awards`,
automatically cross-matching municipal recipients to `agency_portals.slug`.
"""

from __future__ import annotations

import json
import os
import re
import sys
import psycopg2
import requests
from dotenv import load_dotenv

USASPENDING_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
KEYWORDS = ["Flock Safety", "Flock Group"]
FIELDS = [
    "Award ID",
    "Recipient Name",
    "Award Amount",
    "Awarding Agency",
    "Awarding Sub Agency",
    "Start Date",
    "Description",
    "Place of Performance State Code",
    "generated_internal_id",
]


def extract_city_name(recipient: str) -> str | None:
    """Extract clean city/town name from USASpending municipality strings like 'CITY OF LAKEWOOD'."""
    r = (recipient or "").strip()
    m = re.match(r"^(?:CITY|TOWN|VILLAGE|BOROUGH)\s+OF\s+(.+)$", r, re.IGNORECASE)
    if m:
        return m.group(1).strip().title()
    m2 = re.match(r"^(.+?)\s+(?:CITY|TOWN|VILLAGE)\s+OF$", r, re.IGNORECASE)
    if m2:
        return m2.group(1).strip().title()
    m3 = re.match(r"^([A-Z\s]+?)\s+CITY$", r, re.IGNORECASE)
    if m3:
        return m3.group(1).strip().title()
    return None


def fetch_awards(award_type: str, type_codes: list[str]) -> list[dict]:
    results = []
    page = 1
    while page <= 5:
        payload = {
            "filters": {
                "keywords": KEYWORDS,
                "award_type_codes": type_codes,
            },
            "fields": FIELDS,
            "limit": 50,
            "page": page,
            "sort": "Award Amount",
            "order": "desc",
        }
        resp = requests.post(
            USASPENDING_URL,
            json=payload,
            headers={"Content-Type": "application/json", "User-Agent": "FourthRoute/1.0"},
            timeout=25,
        )
        resp.raise_for_status()
        data = resp.json()
        batch = data.get("results") or []
        for row in batch:
            row["_award_type"] = award_type
            results.append(row)
        if not (data.get("page_metadata") or {}).get("hasNext"):
            break
        page += 1
    return results


def main():
    load_dotenv()
    db_url = os.getenv("SUPABASE_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    awards = fetch_awards("contract", ["A", "B", "C", "D"]) + fetch_awards("grant", ["02", "03", "04", "05"])
    print(f"Fetched {len(awards)} records from USASpending.gov")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Load known city+state -> agency_slug lookup for clean attribution
    cur.execute(
        """
        SELECT DISTINCT ON (lower(city), state) lower(city), state, slug
        FROM agency_portals
        WHERE city IS NOT NULL AND state IS NOT NULL
        ORDER BY lower(city), state, total_cameras DESC NULLS LAST
        """
    )
    city_map = {(c, s): slug for c, s, slug in cur.fetchall()}

    # Handle historical spelling variants like Marlboro -> Marlborough
    aliases = {"marlboro": "marlborough"}

    upserted = 0
    for row in awards:
        award_id = (row.get("Award ID") or "").strip()
        if not award_id:
            continue
        state = (row.get("Place of Performance State Code") or "").strip().upper()[:2] or None
        recipient = (row.get("Recipient Name") or "Unknown Recipient").strip()
        city_guess = extract_city_name(recipient)
        lookup_city = aliases.get((city_guess or "").lower(), (city_guess or "").lower())
        slug = city_map.get((lookup_city, state)) if (lookup_city and state) else None

        gen_id = (row.get("generated_internal_id") or "").strip()
        source_url = (
            f"https://www.usaspending.gov/award/{gen_id}"
            if gen_id
            else f"https://www.usaspending.gov/search/?hash=flock"
        )
        awarding = (row.get("Awarding Sub Agency") or row.get("Awarding Agency") or "U.S. Federal Agency").strip()
        amount = float(row.get("Award Amount") or 0)
        start_date = row.get("Start Date") or None
        desc = (row.get("Description") or "Automated License Plate Reader procurement / grant").strip()

        cur.execute(
            """
            INSERT INTO federal_alpr_awards (
                award_id, award_type, generated_internal_id, agency_slug,
                city, state, awarding_agency, recipient_name, amount_usd,
                start_date, description, source_url, synced_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (award_id) DO UPDATE SET
                award_type = EXCLUDED.award_type,
                generated_internal_id = EXCLUDED.generated_internal_id,
                agency_slug = COALESCE(EXCLUDED.agency_slug, federal_alpr_awards.agency_slug),
                city = COALESCE(EXCLUDED.city, federal_alpr_awards.city),
                state = COALESCE(EXCLUDED.state, federal_alpr_awards.state),
                awarding_agency = EXCLUDED.awarding_agency,
                recipient_name = EXCLUDED.recipient_name,
                amount_usd = EXCLUDED.amount_usd,
                start_date = EXCLUDED.start_date,
                description = EXCLUDED.description,
                source_url = EXCLUDED.source_url,
                synced_at = now()
            """,
            (
                award_id,
                row["_award_type"],
                gen_id or None,
                slug,
                city_guess,
                state,
                awarding,
                recipient,
                amount,
                start_date,
                desc,
                source_url,
            ),
        )
        upserted += 1

    conn.commit()
    cur.execute("SELECT COUNT(*), COUNT(agency_slug) FROM federal_alpr_awards")
    total, matched = cur.fetchone()
    conn.close()
    print(f"Upserted {upserted} USASpending awards -> DB total={total} (matched to agency_portals={matched})")


if __name__ == "__main__":
    main()
