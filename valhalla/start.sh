#!/bin/bash
set -e

TILES_TAR="/custom_files/valhalla_tiles.tar"
TILES_GZ="/custom_files/valhalla_tiles.tar.gz"

echo "=== Fourth Route — Valhalla California tiles startup ==="
mkdir -p /custom_files

# Download pre-built tiles if not already present
if [ ! -f "$TILES_TAR" ]; then
  if [ -z "$TILES_URL" ]; then
    echo "ERROR: TILES_URL environment variable is not set"
    exit 1
  fi
  echo "Downloading tiles from ${TILES_URL} ..."
  curl -L --retry 3 --retry-delay 10 --progress-bar \
    -o "$TILES_GZ" "$TILES_URL"
  echo "Decompressing tiles..."
  gunzip "$TILES_GZ"
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

echo "Starting Valhalla service..."
exec /valhalla/scripts/run.sh build_tiles
