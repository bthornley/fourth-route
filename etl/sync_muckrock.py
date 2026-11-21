#!/usr/bin/env python3
"""
Syncs filed ALPR / Flock Safety FOIA requests from MuckRock REST API v2 into Postgres
`agency_foia_requests`, matching each MuckRock agency to `agency_portals.slug` and city/state.
Cleanly skips (exit 0) if MUCKROCK_USERNAME / MUCKROCK_PASSWORD are unset.
"""

from __future__ import annotations

import os
import re
import sys
import time
import psycopg2
import requests
from dotenv import load_dotenv

TOKEN_URL = "https://accounts.muckrock.com/api/token/"
API_V2 = "https://www.muckrock.com/api_v2"
SEARCH_TERMS = ["Flock Safety", "Flock camera", "ALPR", "license plate reader"]
ALPR_PATTERN = re.compile(
    r"(flock\s*safety|flock\s*cam|flock\s*group|alpr|lpr|license\s*plate\s*reader|automated\s*license\s*plate)",
    re.IGNORECASE,
)


def get_jwt(username: str, password: str) -> str:
    r = requests.post(
        TOKEN_URL,
        json={"username": username, "password": password},
        headers={"Content-Type": "application/json", "User-Agent": "FourthRoute/1.0"},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["access"]


def norm_agency_name(name: str) -> str:
    s = (name or "").lower().strip()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\b(police department|police dept|sheriff s office|sheriffs office|department|dept|pd|so|city of|town of)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_state_abbr(jur: dict) -> str | None:
    if jur.get("level") == "s" and jur.get("abbrev"):
        return str(jur["abbrev"]).upper()[:2]
    if jur.get("parent_abbrev") and len(str(jur["parent_abbrev"])) == 2:
        return str(jur["parent_abbrev"]).upper()[:2]
    return None


def main():
    load_dotenv()
    username = os.getenv("MUCKROCK_USERNAME", "").strip()
    password = os.getenv("MUCKROCK_PASSWORD", "").strip()
    db_url = os.getenv("SUPABASE_DATABASE_URL") or os.getenv("DATABASE_URL")

    if not username or not password:
        print("MUCKROCK_USERNAME / MUCKROCK_PASSWORD not configured; skipping MuckRock FOIA sync.")
        sys.exit(0)
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    token = get_jwt(username, password)
    hdr = {"Authorization": f"Bearer {token}", "User-Agent": "FourthRoute/1.0"}

    seen_requests: dict[int, dict] = {}
    for term in SEARCH_TERMS:
        url = f"{API_V2}/requests/?search={requests.utils.quote(term)}&page_size=50"
        pages = 0
        while url and pages < 4:
            resp = requests.get(url, headers=hdr, timeout=20)
            if resp.status_code == 429:
                time.sleep(2.0)
                continue
            resp.raise_for_status()
            payload = resp.json()
            for req_obj in payload.get("results") or []:
                rid = req_obj.get("id")
                title = (req_obj.get("title") or "").strip()
                docs = (req_obj.get("requested_docs") or "")[:400]
                if not rid or not req_obj.get("agency"):
                    continue
                if not ALPR_PATTERN.search(f"{title} {docs}"):
                    continue
                seen_requests[int(rid)] = req_obj
            url = payload.get("next")
            pages += 1
            time.sleep(0.25)

    print(f"Collected {len(seen_requests)} ALPR/Flock MuckRock FOIA requests; resolving agencies...")

    agency_cache: dict[int, dict] = {}
    jur_cache: dict[int, dict] = {}

    unique_agency_ids = {int(r["agency"]) for r in seen_requests.values() if r.get("agency")}
    for aid in unique_agency_ids:
        try:
            ar = requests.get(f"{API_V2}/agencies/{aid}/", headers=hdr, timeout=15)
            if ar.status_code == 429:
                time.sleep(2.0)
                ar = requests.get(f"{API_V2}/agencies/{aid}/", headers=hdr, timeout=15)
            if ar.ok:
                ag_data = ar.json()
                agency_cache[aid] = ag_data
                jid = ag_data.get("jurisdiction")
                if jid and int(jid) not in jur_cache:
                    jr = requests.get(f"{API_V2}/jurisdictions/{int(jid)}/", headers=hdr, timeout=15)
                    if jr.ok:
                        jur_cache[int(jid)] = jr.json()
            time.sleep(0.12)
        except Exception:
            continue

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT slug, agency_name, city, state
        FROM agency_portals
        """
    )
    by_norm_name: dict[tuple[str, str], str] = {}
    by_city_state: dict[tuple[str, str], str] = {}
    for slug, ag_name, city, st in cur.fetchall():
        st_u = (st or "").upper()
        n_key = (norm_agency_name(ag_name or ""), st_u)
        if n_key[0] and n_key not in by_norm_name:
            by_norm_name[n_key] = slug
        if city and st_u:
            c_key = (city.lower().strip(), st_u)
            if c_key not in by_city_state:
                by_city_state[c_key] = slug

    upserted = 0
    for rid, req_obj in seen_requests.items():
        aid = int(req_obj["agency"])
        ag = agency_cache.get(aid) or {}
        ag_name = (ag.get("name") or f"Agency #{aid}").strip()
        jid = ag.get("jurisdiction")
        jur = jur_cache.get(int(jid)) if jid else {}
        jur = jur or {}

        state = extract_state_abbr(jur)
        city = jur.get("name") if jur.get("level") == "l" else None
        jur_slug = jur.get("slug") or "agency"
        req_slug = req_obj.get("slug") or "request"
        foia_url = f"https://www.muckrock.com/foi/{jur_slug}/{req_slug}-{rid}/"

        # Conservative matching against verified agency_portals
        slug = None
        if state:
            slug = by_norm_name.get((norm_agency_name(ag_name), state))
            if not slug and city:
                slug = by_city_state.get((city.lower().strip(), state))

        sub_dt = (req_obj.get("datetime_submitted") or "")[:10] or None
        done_dt = (req_obj.get("datetime_done") or "")[:10] or None

        cur.execute(
            """
            INSERT INTO agency_foia_requests (
                request_id, agency_slug, muckrock_agency_id, agency_name,
                city, state, title, status, submitted_at, completed_at, foia_url, synced_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (request_id) DO UPDATE SET
                agency_slug = COALESCE(EXCLUDED.agency_slug, agency_foia_requests.agency_slug),
                agency_name = EXCLUDED.agency_name,
                city = COALESCE(EXCLUDED.city, agency_foia_requests.city),
                state = COALESCE(EXCLUDED.state, agency_foia_requests.state),
                title = EXCLUDED.title,
                status = EXCLUDED.status,
                submitted_at = EXCLUDED.submitted_at,
                completed_at = EXCLUDED.completed_at,
                foia_url = EXCLUDED.foia_url,
                synced_at = now()
            """,
            (
                rid,
                slug,
                aid,
                ag_name,
                city,
                state,
                (req_obj.get("title") or "ALPR FOIA Request").strip(),
                (req_obj.get("status") or "unknown").strip(),
                sub_dt,
                done_dt,
                foia_url,
            ),
        )
        upserted += 1

    conn.commit()
    cur.execute("SELECT COUNT(*), COUNT(agency_slug), COUNT(*) FILTER (WHERE status='done') FROM agency_foia_requests")
    tot, matched, done_cnt = cur.fetchone()
    conn.close()
    print(f"Upserted {upserted} MuckRock FOIA rows -> DB total={tot} (matched portals={matched}, completed={done_cnt})")


if __name__ == "__main__":
    main()
