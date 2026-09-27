# ALPR Navigation — Phase 1

Privacy-focused routing API that sources ALPR camera locations from OpenStreetMap
and exposes them via a spatial REST API. Phase 2 will add Valhalla routing with
camera avoidance.

## Stack

| Layer | Tool |
|---|---|
| Database | PostgreSQL 16 + PostGIS 3.4 |
| API | FastAPI (Python 3.12) |
| Camera data | OSM Overpass API (DeFlock-tagged nodes) |
| Infrastructure | Docker Compose |

---

## Prerequisites

- **Docker Desktop** — [download here](https://www.docker.com/products/docker-desktop/)  
  *(Install and start it before running the commands below)*

---

## Quick Start

```bash
cd ~/Documents/alpr-nav
chmod +x scripts/quickstart.sh
./scripts/quickstart.sh
```

Then open **http://localhost:8000/docs** for the interactive API explorer.

---

## Manual Steps

### 1. Start services
```bash
docker compose up -d --build
```

### 2. Run ETL sync

**Specific region (fast, good for dev):**
```bash
# SF Bay Area
DATABASE_URL="postgresql://alpr:alprpass@localhost:5432/alpr_nav" \
    python3 etl/fetch_cameras.py --bbox "37.2,-122.6,38.0,-121.8"

# Los Angeles
DATABASE_URL="postgresql://alpr:alprpass@localhost:5432/alpr_nav" \
    python3 etl/fetch_cameras.py --bbox "33.7,-118.7,34.3,-117.9"
```

**Global sync (slow, ~2–5 min):**
```bash
DATABASE_URL="postgresql://alpr:alprpass@localhost:5432/alpr_nav" \
    python3 etl/fetch_cameras.py
```

### 3. Query cameras

**All cameras (up to 500):**
```bash
curl http://localhost:8000/cameras
```

**Cameras in a bounding box:**
```bash
curl -X POST http://localhost:8000/cameras/bbox \
  -H "Content-Type: application/json" \
  -d '{"min_lat":37.7,"min_lon":-122.5,"max_lat":37.8,"max_lon":-122.4}'
```

**Cameras within 1km of a point:**
```bash
curl -X POST http://localhost:8000/cameras/nearby \
  -H "Content-Type: application/json" \
  -d '{"lat":37.77,"lon":-122.42,"radius_m":1000}'
```

**Cameras in a routing corridor:**
```bash
curl -X POST "http://localhost:8000/cameras/corridor?\
origin_lat=37.77&origin_lon=-122.42&\
dest_lat=37.33&dest_lon=-121.88&buffer_deg=0.05"
```

**Report a new camera:**
```bash
curl -X POST http://localhost:8000/cameras/report \
  -H "Content-Type: application/json" \
  -d '{"lat":37.77,"lon":-122.42,"operator":"Flock Safety","notes":"On pole at intersection"}'
```

**Sync status:**
```bash
curl http://localhost:8000/sync/status
```

---

## Stop / Reset

```bash
# Stop services (keep data)
docker compose down

# Stop and wipe DB (full reset)
docker compose down -v
```

---

## Project Structure

```
alpr-nav/
├── docker-compose.yml      # PostGIS + API services
├── db/
│   └── init.sql            # Schema (runs once on first start)
├── api/
│   ├── main.py             # FastAPI app
│   ├── requirements.txt
│   └── Dockerfile
├── etl/
│   ├── fetch_cameras.py    # OSM Overpass sync
│   └── requirements.txt
└── scripts/
    └── quickstart.sh       # One-shot setup
```

---

## Roadmap

- [x] **Phase 1** — Camera data layer (this)
- [ ] **Phase 2** — Valhalla routing with `exclude_polygons`
- [ ] **Phase 3** — React Native mobile app
- [ ] **Phase 4** — In-app crowdsourced reporting + moderation
- [ ] **Phase 5** — Soft-penalty costing model, heatmap, offline tiles
