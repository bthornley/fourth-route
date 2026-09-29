#!/bin/bash
set -e

TILES_TAR="/custom_files/valhalla_tiles.tar"
TILES_GZ="/custom_files/valhalla_tiles.tar.gz"
PART_AA="/custom_files/valhalla_tiles.tar.gz.partaa"

echo "=== Fourth Route — Valhalla multi-state tiles startup (CA/WA/OR/TX) ==="
mkdir -p /custom_files

# Download pre-built tiles if not already present
if [ ! -f "$TILES_TAR" ]; then
  if [ -z "$TILES_URL" ]; then
    echo "ERROR: TILES_URL environment variable is not set"
    exit 1
  fi

  # TILES_URL points to part aa — derive ab and ac by replacing suffix
  TILES_URL_AA="$TILES_URL"
  TILES_URL_AB="${TILES_URL/partaa/partab}"
  TILES_URL_AC="${TILES_URL/partaa/partac}"

  echo "Downloading tiles part 1/3..."
  curl -L --retry 3 --retry-delay 10 --progress-bar -o "$PART_AA" "$TILES_URL_AA"

  echo "Downloading tiles part 2/3..."
  curl -L --retry 3 --retry-delay 10 --progress-bar \
    -o "/custom_files/valhalla_tiles.tar.gz.partab" "$TILES_URL_AB"

  echo "Downloading tiles part 3/3..."
  curl -L --retry 3 --retry-delay 10 --progress-bar \
    -o "/custom_files/valhalla_tiles.tar.gz.partac" "$TILES_URL_AC"

  echo "Recombining parts..."
  cat /custom_files/valhalla_tiles.tar.gz.part* > "$TILES_GZ"
  rm -f /custom_files/valhalla_tiles.tar.gz.part*

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

echo "Starting Valhalla service on port ${PORT:-8002}..."
export port=${PORT:-8002}
# Remove cached config so run.sh regenerates it with the correct port
rm -f /custom_files/valhalla.json
exec /valhalla/scripts/run.sh build_tiles
