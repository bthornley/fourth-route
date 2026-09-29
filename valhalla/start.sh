#!/bin/bash
set -e

TILES_TAR="/custom_files/valhalla_tiles.tar"

echo "=== Fourth Route — Valhalla multi-state tiles startup (CA/WA/OR/TX) ==="
mkdir -p /custom_files

# Download pre-built tiles if not already present
if [ ! -f "$TILES_TAR" ]; then
  if [ -z "$TILES_URL" ]; then
    echo "ERROR: TILES_URL environment variable is not set"
    exit 1
  fi

  TILES_URL_AA="$TILES_URL"
  TILES_URL_AB="${TILES_URL/partaa/partab}"
  TILES_URL_AC="${TILES_URL/partaa/partac}"

  echo "Streaming 3-part tile archive directly to disk (no temp files)..."
  echo "  Part 1: $TILES_URL_AA"
  echo "  Part 2: $TILES_URL_AB"
  echo "  Part 3: $TILES_URL_AC"

  # Stream all 3 parts sequentially through gunzip → write tar directly.
  # Peak disk usage = just the 16 GB tar. No intermediate gz or part files stored.
  {
    curl -L --retry 3 --retry-delay 10 "$TILES_URL_AA"
    curl -L --retry 3 --retry-delay 10 "$TILES_URL_AB"
    curl -L --retry 3 --retry-delay 10 "$TILES_URL_AC"
  } | gunzip > "$TILES_TAR"

  echo "Tiles ready ✓ ($(du -sh $TILES_TAR | cut -f1))"
else
  echo "Tiles already present ✓"
fi

# Hand off to the GIS-OPS image entrypoint with correct env
export use_tiles_ignore_pbf=True
export force_rebuild=False
export build_admins=False
export build_time_zones=False
export server_threads=2

echo "Starting Valhalla service on port ${PORT:-8002}..."
export port=${PORT:-8002}
# Remove cached config so run.sh regenerates it with the correct port
rm -f /custom_files/valhalla.json
exec /valhalla/scripts/run.sh build_tiles
