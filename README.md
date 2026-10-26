# Fourth Route

**Navigate within your 4th Amendment rights.**

Fourth Route is a free, open-source navigation app that maps **145,154 Automated License Plate Reader (ALPR) cameras across all 50 US states** and calculates driving routes that avoid as many cameras as possible — showing you the exact tradeoff in time, distance, and cameras skipped, alongside verified law enforcement agency transparency data.

🌐 **Live at [fourthroute.org](https://fourthroute.org)** — no account required, no user tracking.  
☕ **Support server costs on [Ko-fi](https://ko-fi.com/fourthroute)**  
📷 **Follow updates on [Instagram (@fourthroute)](https://instagram.com/fourthroute)**

[![Ko-Fi](https://img.shields.io/badge/Ko--fi-Support_Fourth_Route-F16061?logo=ko-fi&logoColor=white)](https://ko-fi.com/fourthroute)
[![Instagram](https://img.shields.io/badge/Instagram-@fourthroute-E4405F?logo=instagram&logoColor=white)](https://instagram.com/fourthroute)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

---

## What It Does

Enter an origin and destination (or tap a live demo corridor). Fourth Route computes two routes side by side using the open-source Valhalla routing engine and verifies every camera within 40 meters of the actual road geometry via PostGIS `ST_DWithin`:

| | Privacy Route | Fastest Route |
|---|---|---|
| **Goal** | Iteratively route around ALPR cameras | Minimize travel time |
| **Shows** | Cameras avoided, unavoidable cameras, time/distance delta, fuel/CO₂ impact | Baseline travel time, distance, and cameras passed |

### Verified Live Routing Examples (40m Road-Corridor Buffer)

| Corridor | Fastest Route Cameras | Privacy Route Cameras | Cameras Avoided | Time / Distance Delta |
|---|---|---|---|---|
| **Downtown Oakland → Fruitvale, CA** | 26 cameras | **1 camera** | **25 avoided (96%)** | +2.8 min · 0.39 mi shorter |
| **Pasadena → Altadena, CA** | 22 cameras | **1 camera** | **21 avoided (95%)** | 0.7 min faster |
| **North Park → City Heights (San Diego, CA)** | 13 cameras | **0 cameras** | **13 avoided (100%)** | 0.4 min faster |
| **Las Vegas Strip → Chinatown, NV** | 8 cameras | **0 cameras** | **8 avoided (100%)** | +1.3 min |

---

## Camera & Agency Transparency Data

- **145,283 ALPR cameras mapped nationwide** across all 50 US states and Washington, D.C.
- **15-State Active Privacy Routing:** Real-time camera-avoidance routing enabled across 15 states (**CA, NV, TX, GA, IL, FL, OH, NY, PA, VA, NC, AZ, WA, OR, ID**), covering ~81.5% of all mapped US cameras.
- **Agency Transparency Profiles:** Tapping any camera marker reveals its operating jurisdiction and verified Flock Safety transparency portal metrics where published:
  - Operating agency & city/county jurisdiction (via US Census TIGER/Line spatial attribution)
  - 30-day vehicles captured, officer search volume, and hotlist hit rate
  - Data retention period (e.g., 30 days)
  - External agency sharing network size (`portal_sharing_partners_count`) and prohibited uses
- **Data Sources & Attribution:**
  - Camera coordinates: OpenStreetMap contributors (`man_made=surveillance`, `surveillance:type=ALPR`), DeFlock volunteer mappers, and public records / FOIA disclosures
  - Agency transparency portals: Eyes on Flock (CC BY-SA 4.0)
  - Synced automatically via GitHub Actions ETL pipelines

---

## Architecture

```
┌──────────────────────┐     ┌────────────────────────────┐     ┌─────────────────────────┐
│  React Native / Expo │────▶│  FastAPI (Railway)         │────▶│ Valhalla Routing Engine │
│  MapLibre GL Web     │     │  /route/compare            │     │ 13-State Driving Graph  │
│  (Vercel)            │     │  /cameras/bbox & /agency   │     │ (Railway)               │
└──────────────────────┘     │  /geocode/search (proxied) │     └─────────────────────────┘
                             └─────────────┬──────────────┘
                                           │
                             ┌─────────────▼──────────────┐
                             │  PostgreSQL 16 + PostGIS   │
                             │  145,154 cameras (50 US)   │
                             │  Agency & TIGER/Line tables│
                             └────────────────────────────┘
```

| Layer | Stack |
|---|---|
| **Frontend** | React Native / Expo Web, MapLibre GL JS, OpenFreeMap vector tiles, Vercel |
| **API & Geocode Proxy** | Python 3.12 / FastAPI, Railway |
| **Routing Engine** | Valhalla (iterative `exclude_polygons` hard-avoidance router), Railway |
| **Spatial Database** | PostgreSQL + PostGIS (`ST_DWithin` geography queries), Supabase |
| **ETL Pipelines** | Python (`fetch_cameras.py`, `load_nationwide_cameras.py`, `load_agency_portals.py`, `load_jurisdictions.py`), GitHub Actions |

---

## Privacy & Security Architecture

Fourth Route is built for privacy-conscious drivers, journalists, domestic violence survivors, and researchers:

- **No accounts, logins, or persistent identifiers:** You never sign up or provide an email address to use the app.
- **Zero-log ephemeral routing:** Origin and destination coordinates are held strictly in memory during the Valhalla + PostGIS calculation and immediately discarded. [`api/routing.py`](api/routing.py) explicitly suppresses request/response body and endpoint logging.
- **Server-side geocoding proxy with coordinate rounding:** Address searches (`/geocode/search`) and reverse-geocoding requests (`/geocode/reverse`) are proxied through the FastAPI backend ([`api/geocode.py`](api/geocode.py)) with coordinate rounding (~110m grid) and TTL caching, so your browser never exposes your IP address + search query to Nominatim.
- **No GPS coordinates in analytics:** Client-side telemetry uses cookie-less Vercel Web Analytics for aggregate page/event counts only; GPS coordinates and search strings are never transmitted in analytics payloads.
- **Infrastructure transparency:** Like any web application, our hosting providers (Vercel, Railway) and open vector map tile server (`tiles.openfreemap.org`) see standard HTTP connection metadata (such as client IP address) when serving pages and map tiles. We never store or correlate IPs in our database.

---

## Project Structure

```
fourth-route/
├── api/
│   ├── main.py                      # FastAPI endpoints (cameras, agency portals, routing, reports)
│   ├── routing.py                   # Iterative Valhalla polygon-exclusion privacy router
│   ├── geocode.py                   # Privacy-preserving Nominatim search & reverse proxy
│   ├── requirements.txt
│   └── Dockerfile
├── db/
│   └── init.sql                     # PostGIS schema (cameras, camera_reports, sync_log)
├── etl/
│   ├── fetch_cameras.py             # Overpass API regional camera sync
│   ├── load_nationwide_cameras.py   # 50-state GeoJSON camera ingestion into PostGIS
│   ├── load_agency_portals.py       # Law enforcement transparency portal ETL
│   ├── load_jurisdictions.py        # Census TIGER/Line county/place spatial join
│   └── requirements.txt
├── mobile/
│   ├── App.tsx
│   ├── src/
│   │   ├── components/
│   │   │   ├── SearchPanel.tsx      # State selector, demo routes, geocoding inputs
│   │   │   ├── MapView.web.tsx      # MapLibre GL map, clustering, agency popups, navigation HUD
│   │   │   ├── RouteInfoSheet.tsx   # Fastest vs. Privacy route comparison & turn-by-turn launcher
│   │   │   └── ReportCameraModal.tsx# Crowdsourced camera sighting submission
│   │   ├── pages/
│   │   │   ├── AboutPage.tsx        # Mission, methodology, and open-source stack
│   │   │   ├── PrivacyPolicy.tsx    # Full data-flow and privacy disclosure
│   │   │   └── TermsOfService.tsx
│   │   ├── hooks/
│   │   │   └── useRoute.ts          # Route comparison state hook
│   │   └── services/
│   │       ├── api.ts               # API client
│   │       └── fuel.ts              # Fuel & CO₂ overhead calculator
│   └── vercel.json                  # Security headers (CSP, HSTS, Permissions-Policy)
├── valhalla/
│   ├── Dockerfile                   # Nginx + Valhalla routing container
│   ├── start.sh                     # Multi-part streaming tile extractor & startup
│   └── railway.toml
└── .github/
    └── workflows/
        └── sync-cameras.yml         # Scheduled weekly Overpass camera sync
```

---

## Self-Hosting

### Requirements
- PostgreSQL 16+ with PostGIS (`CREATE EXTENSION postgis;`)
- Python 3.12+
- Docker (for building/running Valhalla tiles)
- Node.js 20+ (for the Expo web frontend)

### 1. Database & ETL Setup

```bash
# Initialize PostGIS schema
psql "$DATABASE_URL" -f db/init.sql

# Seed camera data and agency transparency portals
cd etl
pip install -r requirements.txt
DATABASE_URL=postgresql://... python load_nationwide_cameras.py
DATABASE_URL=postgresql://... python load_agency_portals.py
DATABASE_URL=postgresql://... python load_jurisdictions.py
```

### 2. Run the API

```bash
cd api
pip install -r requirements.txt
DATABASE_URL=postgresql://... VALHALLA_URL=http://localhost:8002 uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Run the Frontend

```bash
cd mobile
npm install --legacy-peer-deps
npm start          # Local Expo development server
npm run build:web  # Export production static web bundle to web-build/
```

---

## API Reference

Base URL: `https://fourth-route-production.up.railway.app`

| Endpoint | Method | Description |
|---|---|---|
| `/health` | `GET` | Health check (`{"status":"ok","db":true}`) |
| `/cameras/bbox` | `POST` | Cameras within a bounding box (`min_lat`, `min_lon`, `max_lat`, `max_lon`) |
| `/cameras/nearby` | `POST` | Cameras within `radius_m` meters of a coordinate |
| `/cameras/{id}/agency` | `GET` | Operating agency, retention, 30d searches, and sharing partner count for a camera |
| `/agencies` | `GET` | Search/filter law enforcement transparency portals (`?state=CA&q=Pasadena`) |
| `/geocode/search` | `GET` | Privacy-proxied address search (`?q=...&viewbox=...`) |
| `/geocode/reverse` | `GET` | Privacy-proxied reverse geocoding with coordinate rounding |
| `/route/compare` | `POST` | Side-by-side Fastest vs. Privacy-optimised route comparison |
| `/cameras/report` | `POST` | Submit a crowdsourced ALPR camera sighting for moderation |

### Example: `POST /route/compare`

```json
{
  "origin_lat": 37.8044,
  "origin_lon": -122.2711,
  "dest_lat": 37.7749,
  "dest_lon": -122.2241,
  "exclusion_radius_m": 40,
  "use_highways": 0.0
}
```

Returns `privacy_route`, `standard_route`, `overhead` (`extra_seconds`, `extra_miles`, `pct_slower`), `cameras_in_corridor`, and per-route `cameras_avoided` / `cameras_unavoidable`.

---

## Roadmap

- [x] Nationwide 50-state PostGIS camera database (**145,154 cameras**)
- [x] Verified law enforcement agency transparency portal attribution (**Eyes on Flock + Census TIGER/Line**)
- [x] Iterative Valhalla polygon-exclusion privacy routing (`40m` road-corridor verification)
- [x] Privacy-preserving server-side Nominatim geocoding proxy
- [x] Live turn-by-turn browser navigation mode + Google/Apple Maps waypoint handoff
- [x] In-app crowdsourced camera reporting & moderation queue
- [x] Phase 1 multi-state privacy routing expansion (**CA, NV, TX, GA, IL, FL, OH, NY, VA, NC, AZ, WA, OR**)
- [ ] Phase 2 full 50-state continental US Valhalla routing graph
- [ ] Native iOS & Android offline-capable releases

---

## License

Released under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see [LICENSE](LICENSE).

Camera location data is sourced from OpenStreetMap contributors (ODbL) and public records. Agency transparency portal metadata is attributed to Eyes on Flock (CC BY-SA 4.0).
