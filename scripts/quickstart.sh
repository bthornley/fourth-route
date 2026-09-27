#!/usr/bin/env bash
# scripts/quickstart.sh
# One-shot setup: install ETL deps, start services, run first sync, open docs
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      ALPR-Nav Phase 1 Quick Start        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Install ETL Python deps locally
echo "▶ Installing ETL dependencies..."
pip3 install -q -r "$ROOT/etl/requirements.txt"
echo "  ✓ Done"

# 2. Start Docker services
echo ""
echo "▶ Starting PostGIS + API via Docker Compose..."
docker compose -f "$ROOT/docker-compose.yml" up -d --build
echo "  ✓ Services starting..."

# 3. Wait for API to be healthy
echo ""
echo "▶ Waiting for API to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/ > /dev/null 2>&1; then
        echo "  ✓ API is up!"
        break
    fi
    sleep 2
    echo "  ... ($i/30)"
done

# 4. Run ETL for SF Bay Area as a quick test (much faster than global)
echo ""
echo "▶ Running first OSM sync (SF Bay Area bounding box)..."
echo "  (Use --bbox '' to sync globally — takes longer)"
DATABASE_URL="postgresql://alpr:alprpass@localhost:5432/alpr_nav" \
    python3 "$ROOT/etl/fetch_cameras.py" \
    --bbox "37.2,-122.6,38.0,-121.8"
echo "  ✓ Sync complete"

# 5. Show camera count
echo ""
echo "▶ Camera count in DB:"
curl -s http://localhost:8000/sync/status | python3 -m json.tool

# 6. Done
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  All done! Open these in your browser:   ║"
echo "║  API docs:  http://localhost:8000/docs   ║"
echo "║  Alt docs:  http://localhost:8000/redoc  ║"
echo "╚══════════════════════════════════════════╝"
echo ""
