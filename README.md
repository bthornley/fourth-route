# Fourth Route

**Navigate within your 4th Amendment rights — CA, WA, OR & TX.**

Fourth Route is a free, open-source navigation app that maps 38,368 Automated License Plate Reader (ALPR) cameras across California, Washington, Oregon, and Texas and calculates a driving route that avoids as many as possible — showing you the exact tradeoff in time, distance, and cameras skipped.

🌐 **Live at [fourthroute.org](https://fourthroute.org)** — no account required, no user tracking.

---

## What it does

Enter an origin and destination. Fourth Route returns two routes side by side:

| | Privacy Route | Fastest Route |
|---|---|---|
| **Goal** | Avoid ALPR cameras | Minimize travel time |
| **Shows** | Cameras avoided, unavoidable cameras, time overhead, fuel/CO₂ saved | Baseline time and distance |

**Example — Oakland Financial District → Fruitvale:**
- Corridor contains **716 ALPR cameras**
- Privacy route avoids **686** of them (leaves 30 unavoidable)
- Overhead: **+2 minutes**, ~$0.03 in fuel

---

## Camera data

- **38,368 cameras** mapped across CA, WA, OR & TX
- Sources: OpenStreetMap/Overpass (`surveillance:type=ALPR`), FOIA public records
- Updated weekly via automated GitHub Actions sync
- Regions: Bay Area · LA/OC · San Diego · Sacramento · Central Valley · NorCal

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  React Native   │────▶│  FastAPI (Railway)   │────▶│ Valhalla Router │
│  Expo + MapLibre│     │  /route/compare      │     │ (Railway)       │
│  (Vercel)       │     │  /cameras            │     └─────────────────┘
└─────────────────┘     │  /cameras/nearby     │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  PostGIS (Supabase)  │
                        │  38,368 cameras          │
                        │  ST_DWithin queries  │
                        └──────────────────────┘
```

| Layer | Stack |
|---|---|
| Frontend | React Native / Expo, MapLibre GL, Vercel |
| API | Python / FastAPI, Railway |
| Routing | Valhalla routing engine, Railway |
| Database | PostgreSQL + PostGIS, Supabase |
| Camera ETL | Python / Overpass API, GitHub Actions (weekly) |

---

## Privacy

Fourth Route collects nothing about you:

- No user accounts
- No route logging
- No IP storage
- No location tracking
- Vercel Analytics records only aggregate page views (no individual user data)

The camera database is built entirely from public sources. Your route calculations happen server-side with no association to your identity.

---

## Self-hosting

### Requirements
- PostgreSQL 16+ with PostGIS
- Python 3.12+
- [Valhalla routing engine with multi-state tiles (CA, WA, OR, TX)

### 1. Database setup

```sql
CREATE EXTENSION postgis;

CREATE TABLE cameras (
    id          SERIAL PRIMARY KEY,
    osm_id      BIGINT UNIQUE,
    geom        GEOGRAPHY(Point, 4326) NOT NULL,
    source      TEXT NOT NULL DEFAULT 'osm',
    operator    TEXT,
    direction   INTEGER,
    confidence  REAL NOT NULL DEFAULT 0.6,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX cameras_geom_idx ON cameras USING GIST(geom);

CREATE TABLE sync_log (
    id          SERIAL PRIMARY KEY,
    source      TEXT,
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    inserted    INTEGER DEFAULT 0,
    updated     INTEGER DEFAULT 0,
    deleted     INTEGER DEFAULT 0,
    error       TEXT
);
```

### 2. Run the API

```bash
cd api
pip install -r requirements.txt
DATABASE_URL=postgresql://... VALHALLA_URL=http://localhost:8002 uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Seed camera data

```bash
cd etl
pip install psycopg2-binary requests

# Single region
DATABASE_URL=postgresql://... python fetch_cameras.py --region bay_area

# All regions — CA, WA, OR, TX (takes ~15 min, respects Overpass rate limits)
DATABASE_URL=postgresql://... python fetch_cameras.py --region all
```

Available regions: `bay_area`, `la_oc`, `san_diego`, `sacramento`, `central_valley`, `norcal`

### 4. Frontend

```bash
cd mobile
npm install --legacy-peer-deps
npm start          # Expo dev server
npm run build:web  # Production build → web-build/
npm run deploy     # Build + deploy to Vercel
```

---

## Project structure

```
fourth-route/
├── api/
│   ├── main.py              # FastAPI app (cameras, routing, health)
│   ├── routing.py           # Valhalla integration
│   ├── requirements.txt
│   └── Dockerfile
├── etl/
│   ├── fetch_cameras.py     # Overpass → PostGIS ETL
│   └── requirements.txt
├── mobile/
│   ├── App.tsx
│   ├── src/
│   │   ├── components/
│   │   │   ├── SearchPanel.tsx      # Geocoding + route input
│   │   │   ├── MapView.web.tsx      # MapLibre map
│   │   │   └── RouteInfoSheet.tsx   # Route comparison panel
│   │   ├── hooks/
│   │   │   └── useRoute.ts          # Route fetch + state
│   │   └── services/
│   │       ├── api.ts               # API client
│   │       └── fuel.ts              # Fuel/CO₂ calculator
│   └── vercel.json
├── valhalla/
│   ├── start.sh             # Tile download + server start
│   └── railway.toml
└── .github/
    └── workflows/
        └── sync-cameras.yml # Weekly Overpass sync
```

---

## API reference

Base URL: `https://fourth-route-production.up.railway.app`

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check (`{"status":"ok","db":true}`) |
| `/cameras` | GET | All cameras (up to 5,000, `?limit=`) |
| `/cameras/nearby` | POST | Cameras within radius of a point |
| `/route/compare` | POST | Privacy route vs fastest route comparison |

### `POST /route/compare`

```json
{
  "origin_lat": 37.7946,
  "origin_lon": -122.3999,
  "dest_lat": 37.7749,
  "dest_lon": -122.4194,
  "vehicle": "sedan",
  "radius_km": 5
}
```

Response includes `privacy_route`, `standard_route`, `overhead`, `cameras_in_corridor`, and per-route `cameras_avoided` / `cameras_unavoidable`.

---

## Roadmap

- [x] PostGIS camera database (38,368 cameras — CA, WA, OR, TX)
- [x] Valhalla routing engine integration
- [x] Privacy vs fastest route comparison
- [x] Fuel / CO₂ savings calculator
- [x] Nominatim geocoding with multi-state bounds
- [x] Weekly automated camera sync (GitHub Actions)
- [x] In-app crowdsourced camera reporting
- [ ] Native iOS + Android apps
- [x] Expansion to WA, OR, TX (states actively fighting ALPR surveillance)

---

## License

AGPL-3.0 — fork it, self-host it, adapt it for your city. Commercial use requires a separate license.

Camera location data is from OpenStreetMap (ODbL) and public records (public domain).

---

## Background

ALPR networks have expanded from niche law enforcement tools to mass-surveillance infrastructure. Flock Safety alone deployed 100,000+ cameras in 2023. A Brookings Institution analysis found ALPR deployments are 2.3× denser in majority-Black and Latino neighborhoods. Data is retained an average of 12 months with no meaningful public oversight.

Fourth Route is an experiment in making the invisible visible — and giving people the same awareness of surveillance infrastructure that ALPR vendors already sell to their clients.
