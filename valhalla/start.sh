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

  if echo "$TILES_URL" | grep -q "partaa"; then
    # ── Multi-part download (4-state tiles, 3 x ~1.4GB parts) ──────────────
    TILES_URL_AA="$TILES_URL"
    TILES_URL_AB="${TILES_URL/partaa/partab}"
    TILES_URL_AC="${TILES_URL/partaa/partac}"

    echo "Streaming 3-part tile archive directly to disk..."
    echo "  Part 1: $TILES_URL_AA"
    echo "  Part 2: $TILES_URL_AB"
    echo "  Part 3: $TILES_URL_AC"

    {
      curl -L --retry 3 --retry-delay 10 "$TILES_URL_AA"
      curl -L --retry 3 --retry-delay 10 "$TILES_URL_AB"
      curl -L --retry 3 --retry-delay 10 "$TILES_URL_AC"
    } | gunzip > "$TILES_TAR"
  else
    # ── Single-file download (CA-only tiles or any single .tar.gz) ──────────
    echo "Downloading single-file tiles from $TILES_URL ..."
    curl -L --retry 3 --retry-delay 10 --progress-bar "$TILES_URL" \
      | gunzip > "$TILES_TAR"
  fi

  echo "Tiles ready ✓ ($(du -sh $TILES_TAR | cut -f1))"
else
  echo "Tiles already present ✓"
fi

# Start nginx reverse proxy on port 8002 → Valhalla on 8003
# Delete cached config as root (valhalla user can't remove root-owned file)
rm -f /custom_files/valhalla.json
echo "Starting nginx (port 8002 → Valhalla:8003)..."
nginx

echo "Starting Valhalla (port 8003, as valhalla user)..."
exec su -s /bin/bash valhalla -c "
  export use_tiles_ignore_pbf=True
  export force_rebuild=False
  export build_admins=False
  export build_time_zones=False
  export server_threads=2
  export port=8003
  export PORT=8003
  exec /valhalla/scripts/run.sh build_tiles
"
