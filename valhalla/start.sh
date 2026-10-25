#!/bin/bash
set -e

TILES_TAR="/custom_files/valhalla_tiles.tar"

echo "=== Fourth Route — Valhalla 14-state tiles startup (CA/NV/TX/GA/IL/FL/OH/NY/PA/VA/NC/AZ/WA/OR) ==="
mkdir -p /custom_files

TILES_URL="${TILES_URL_V5:-https://github.com/bthornley/fourth-route/releases/download/v5-tiles-14states/valhalla_tiles.tar.gz.partaa}"

# Download pre-built tiles if not already present
if [ ! -f "$TILES_TAR" ]; then
  if [ -z "$TILES_URL" ]; then
    echo "ERROR: TILES_URL environment variable is not set"
    exit 1
  fi

  if echo "$TILES_URL" | grep -q "partaa"; then
    TILES_URL_AA="$TILES_URL"
    TILES_URL_AB="${TILES_URL/partaa/partab}"
    TILES_URL_AC="${TILES_URL/partaa/partac}"
    echo "Streaming 3-part tile archive..."
    {
      curl -L --retry 3 --retry-delay 10 "$TILES_URL_AA"
      curl -L --retry 3 --retry-delay 10 "$TILES_URL_AB"
      curl -L --retry 3 --retry-delay 10 "$TILES_URL_AC"
    } | gunzip > "$TILES_TAR"
  else
    echo "Downloading single-file tiles from $TILES_URL ..."
    curl -L --retry 3 --retry-delay 10 --progress-bar "$TILES_URL" \
      | gunzip > "$TILES_TAR"
  fi
  echo "Tiles ready ✓ ($(du -sh $TILES_TAR | cut -f1))"
else
  echo "Tiles already present ✓"
fi

# Delete root-owned valhalla.json so run.sh regenerates it cleanly with port 8002
rm -f /custom_files/valhalla.json

# Start nginx on 8080 → proxies to Valhalla on 8002
echo "Starting nginx (port 8080 → Valhalla:8002)..."
nginx

# Switch to valhalla user for gis-ops run.sh (it requires the valhalla user)
echo "Starting Valhalla (port 8002, as valhalla user)..."
exec su -s /bin/bash valhalla -c "
  export use_tiles_ignore_pbf=True
  export force_rebuild=False
  export build_admins=False
  export build_time_zones=False
  export server_threads=2
  export port=8002
  export PORT=8002
  exec /valhalla/scripts/run.sh build_tiles
"
