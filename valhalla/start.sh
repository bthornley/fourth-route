#!/bin/bash
set -euo pipefail

TILES_TAR="/custom_files/valhalla_tiles.tar"
VERSION_FILE="/custom_files/.tiles_version"
TARGET_VERSION="v10-tiles-50states"
TILES_PARTS="${TILES_PARTS:-partaa partab partac partad partae partaf partag}"

echo "=== Fourth Route — Valhalla 50-State + D.C. tiles startup ($TARGET_VERSION) ==="
mkdir -p /custom_files

TILES_URL="${TILES_URL_V10:-https://github.com/bthornley/fourth-route/releases/download/v10-tiles-50states/valhalla_tiles.tar.gz.partaa}"
CURRENT_VERSION="$(cat "$VERSION_FILE" 2>/dev/null || true)"

# Download or upgrade tiles cleanly when missing or version changes
if [ ! -f "$TILES_TAR" ] || [ "$CURRENT_VERSION" != "$TARGET_VERSION" ]; then
  if [ -z "$TILES_URL" ]; then
    echo "ERROR: TILES_URL environment variable is not set"
    exit 1
  fi

  TMP_TAR="${TILES_TAR}.tmp"
  rm -f "$TMP_TAR"

  if echo "$TILES_URL" | grep -q "partaa"; then
    echo "Streaming multi-part tile archive ($TILES_PARTS)..."
    {
      for part in $TILES_PARTS; do
        curl -fL --retry 5 --retry-delay 10 "${TILES_URL/partaa/$part}"
      done
    } | gunzip > "$TMP_TAR"
  else
    echo "Downloading single-file tiles from $TILES_URL ..."
    curl -fL --retry 5 --retry-delay 10 --progress-bar "$TILES_URL" \
      | gunzip > "$TMP_TAR"
  fi

  mv "$TMP_TAR" "$TILES_TAR"
  echo "$TARGET_VERSION" > "$VERSION_FILE"
  echo "Tiles ready ✓ ($(du -sh "$TILES_TAR" | cut -f1))"
else
  echo "Tiles already present ($TARGET_VERSION) ✓"
fi

# Delete root-owned valhalla.json so run.sh regenerates it cleanly with port 8002
rm -f /custom_files/valhalla.json

# Start nginx on 8080 -> proxies to Valhalla on 8002
echo "Starting nginx (port 8080 -> Valhalla:8002)..."
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
