#!/bin/bash
set -euo pipefail

VALHALLA_ROOT="/Users/bthornley/Documents/alpr-nav/valhalla"
WORK_DIR="$VALHALLA_ROOT/pa_build"
PBF_DIR="$VALHALLA_ROOT/tier1_build/pbfs"
mkdir -p "$WORK_DIR/pa_tiles" "$WORK_DIR/merged_tiles" "$PBF_DIR"

echo "=================================================================="
echo " Fourth Route — All 50 States + D.C. Valhalla Tile Builder"
echo " Started at: $(date)"
echo "=================================================================="

# Step 1: Unpack production v9-tiles-21states base (CA, NV, TX, GA, IL, IN, MI, FL, OH, NY, PA, NJ, MD, MA, DC, DE, VA, NC, AZ, CO, WA, OR, ID)
if [ ! -d "$WORK_DIR/merged_tiles/0" ]; then
  rm -rf "$WORK_DIR/pa_tiles"/* "$WORK_DIR/merged_tiles"/*
  echo "--- Step 1: Unpacking production v9-tiles-21states base archive ---"
  BASE_REL="https://github.com/bthornley/fourth-route/releases/download/v9-tiles-21states/valhalla_tiles.tar.gz"
  {
    curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partaa"
    curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partab"
    curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partac"
    curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partad"
    curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partae"
  } | gunzip | tar -xf - -C "$WORK_DIR/merged_tiles"
  rm -f "$WORK_DIR/merged_tiles/index.bin"
  echo "Unpacked v9-tiles-21states base ✓"
else
  echo "--- Step 1: Reusing existing $WORK_DIR/merged_tiles base ✓ ---"
fi

# Helper function: merge PBFs with osmium, build driving tiles, splice largest border tiles into merged_tiles
build_cluster() {
  local NAME="$1"
  shift
  local STATES=("$@")
  local STAMP_FILE="$WORK_DIR/merged_tiles/.done_${NAME}"

  if [ -f "$STAMP_FILE" ]; then
    echo "--- Skipping already-completed cluster: $NAME ✓ ---"
    return 0
  fi

  echo "=================================================================="
  echo " Building Cluster: $NAME (${#STATES[@]} extracts)"
  echo " States: ${STATES[*]}"
  echo "=================================================================="

  rm -rf "$WORK_DIR/pa_tiles"/* "$WORK_DIR/cluster_merged.osm.pbf"
  local PBF_ARGS=""
  for st in "${STATES[@]}"; do
    local p="$PBF_DIR/${st}-latest.osm.pbf"
    if [ ! -e "$p" ]; then
      echo "ERROR: Missing PBF $p"
      exit 1
    fi
    PBF_ARGS="$PBF_ARGS $p"
  done

  local T0=$(date +%s)
  if [ "${#STATES[@]}" -eq 1 ]; then
    docker run --rm \
      --platform linux/arm64 \
      --entrypoint /bin/bash \
      -v "$WORK_DIR:/data" \
      -v "$VALHALLA_ROOT:$VALHALLA_ROOT:ro" \
      ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c "
        valhalla_build_tiles -c /data/valhalla_pa.json -j 4 ${PBF_ARGS}
      "
  else
    docker run --rm -u root \
      --platform linux/arm64 \
      --entrypoint /bin/bash \
      -v "$WORK_DIR:/data" \
      -v "$VALHALLA_ROOT:$VALHALLA_ROOT:ro" \
      ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c "
        if ! command -v osmium >/dev/null 2>&1; then
          apt-get update -qq && apt-get install -y -qq osmium-tool >/dev/null
        fi
        osmium merge ${PBF_ARGS} -o /data/cluster_merged.osm.pbf --overwrite && \
        valhalla_build_tiles -c /data/valhalla_pa.json -j 4 /data/cluster_merged.osm.pbf
      "
    rm -f "$WORK_DIR/cluster_merged.osm.pbf"
  fi

  python3 - "$NAME" << 'PYSPLICE'
import sys, os, glob, shutil
name = sys.argv[1]
pa_dir = "/Users/bthornley/Documents/alpr-nav/valhalla/pa_build/pa_tiles"
m_dir = "/Users/bthornley/Documents/alpr-nav/valhalla/pa_build/merged_tiles"
added, upgraded, kept = 0, 0, 0
for lvl in ["0", "1", "2"]:
    for pf in sorted(glob.glob(f"{pa_dir}/{lvl}/**/*.gph", recursive=True)):
        rel = os.path.relpath(pf, pa_dir)
        mf = os.path.join(m_dir, rel)
        if not os.path.exists(mf):
            os.makedirs(os.path.dirname(mf), exist_ok=True)
            shutil.copy2(pf, mf)
            added += 1
        elif os.path.getsize(pf) > os.path.getsize(mf):
            shutil.copy2(pf, mf)
            upgraded += 1
        else:
            kept += 1
print(f"Cluster {name} spliced in cleanly: +{added} new tiles, {upgraded} border tiles upgraded, {kept} existing kept ✓", flush=True)
PYSPLICE

  rm -rf "$WORK_DIR/pa_tiles"/*
  touch "$STAMP_FILE"
  echo "Cluster $NAME completed in $(( $(date +%s) - T0 ))s ✓"
}

# Step 2: Border-overlapped <=1.6GB clusters covering ALL 28 missing states cleanly inside 7.75 GB Docker RAM
build_cluster "c1_new_england" connecticut rhode-island vermont new-hampshire maine massachusetts new-york
build_cluster "c2a_appalachia_upper" west-virginia kentucky ohio pennsylvania maryland virginia
build_cluster "c2b_ky_indiana" kentucky indiana ohio illinois missouri tennessee
build_cluster "c3a_carolinas_tn" south-carolina tennessee north-carolina georgia virginia kentucky
build_cluster "c3b_deep_south" alabama mississippi tennessee georgia florida louisiana arkansas
build_cluster "c4_gulf_ozarks" louisiana arkansas mississippi tennessee texas oklahoma missouri
build_cluster "c5a_upper_midwest" wisconsin minnesota iowa michigan illinois south-dakota north-dakota
build_cluster "c5b_mid_plains_east" missouri kansas iowa illinois kentucky tennessee arkansas oklahoma nebraska
build_cluster "c6a_south_plains" new-mexico oklahoma texas colorado kansas
build_cluster "c6b_northern_plains" north-dakota south-dakota nebraska montana wyoming iowa minnesota idaho utah colorado
build_cluster "c7_mountain_west" utah new-mexico colorado arizona nevada wyoming idaho
build_cluster "c8_alaska" alaska
build_cluster "c9_hawaii" hawaii

# Clean up cluster stamps before packing valhalla_tiles.tar
rm -f "$WORK_DIR"/merged_tiles/.done_* "$WORK_DIR/merged_tiles/index.bin"

echo "--- Step 3: Packing 50-state valhalla_tiles.tar ---"
rm -f "$WORK_DIR/valhalla_tiles.tar"
docker run --rm \
  --platform linux/arm64 \
  --entrypoint /bin/bash \
  -v "$WORK_DIR:/data" \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c '
    valhalla_build_extract -c /data/valhalla_merged.json -v
  '
echo "Extracted 50-state valhalla_tiles.tar ($(ls -lh "$WORK_DIR/valhalla_tiles.tar" | awk '{print $5}')) ✓"

echo "--- Step 4: Running 51-Jurisdiction Routing Verification (All 50 States + D.C.) ---"
docker run --rm \
  --platform linux/arm64 \
  -v "$WORK_DIR:/data:ro" \
  --entrypoint /bin/bash \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c '
    valhalla_service /data/valhalla_merged.json 1 >/dev/null 2>&1 &
    PID=$!
    sleep 4
    python3 - << '\''PYTEST'\''
import urllib.request, json, sys

tests = [
    ("AL (Birmingham)", 33.5186, -86.8104, 33.5437, -86.7796),
    ("AK (Anchorage)", 61.2181, -149.9003, 61.1869, -149.8828),
    ("AZ (Phoenix)", 33.4484, -112.0740, 33.4942, -111.9261),
    ("AR (Little Rock)", 34.7465, -92.2896, 34.7780, -92.3570),
    ("CA (Oakland)", 37.8044, -122.2712, 37.8272, -122.2516),
    ("CO (Denver)", 39.7392, -104.9903, 39.7400, -104.8650),
    ("CT (Hartford)", 41.7658, -72.6734, 41.7718, -72.7420),
    ("DE (Wilmington)", 39.7447, -75.5484, 39.6837, -75.7497),
    ("DC (Washington)", 38.9072, -77.0369, 38.8977, -77.0365),
    ("FL (Miami)", 25.7617, -80.1918, 25.7907, -80.1300),
    ("GA (Atlanta)", 33.7490, -84.3880, 33.7756, -84.3963),
    ("HI (Honolulu)", 21.3069, -157.8583, 21.2793, -157.8292),
    ("ID (Boise)", 43.6150, -116.2023, 43.6121, -116.3915),
    ("IL (Chicago)", 41.8781, -87.6298, 41.9200, -87.6500),
    ("IN (Indianapolis)", 39.7684, -86.1581, 39.8100, -86.1400),
    ("IA (Des Moines)", 41.5868, -93.6250, 41.6005, -93.6091),
    ("KS (Wichita)", 37.6872, -97.3301, 37.6979, -97.2910),
    ("KY (Louisville)", 38.2527, -85.7585, 38.2100, -85.7000),
    ("LA (New Orleans)", 29.9511, -90.0715, 29.9792, -90.0950),
    ("ME (Portland)", 43.6591, -70.2568, 43.6710, -70.2850),
    ("MD (Baltimore)", 39.2904, -76.6122, 39.3299, -76.6205),
    ("MA (Boston)", 42.3601, -71.0589, 42.3736, -71.1097),
    ("MI (Detroit)", 42.3314, -83.0458, 42.3223, -83.1763),
    ("MN (Minneapolis)", 44.9778, -93.2650, 44.9537, -93.0900),
    ("MS (Jackson)", 32.2988, -90.1848, 32.3320, -90.1510),
    ("MO (Kansas City)", 39.0997, -94.5786, 39.0473, -94.5910),
    ("MT (Billings)", 45.7833, -108.5007, 45.7920, -108.5450),
    ("NE (Omaha)", 41.2565, -95.9345, 41.2619, -96.0120),
    ("NV (Las Vegas)", 36.1699, -115.1398, 36.1147, -115.1728),
    ("NH (Manchester)", 42.9956, -71.4548, 43.0087, -71.4640),
    ("NJ (New Brunswick)", 40.4750, -74.4850, 40.4950, -74.4450),
    ("NM (Albuquerque)", 35.0844, -106.6504, 35.1068, -106.6292),
    ("NY (Manhattan)", 40.7128, -74.0060, 40.7580, -73.9855),
    ("NC (Charlotte)", 35.2271, -80.8431, 35.2500, -80.8100),
    ("ND (Fargo)", 46.8772, -96.7898, 46.8650, -96.8350),
    ("OH (Columbus)", 39.9612, -82.9988, 39.9980, -83.0080),
    ("OK (Oklahoma City)", 35.4676, -97.5164, 35.4950, -97.5420),
    ("OR (Portland)", 45.5152, -122.6784, 45.5231, -122.6365),
    ("PA (Pittsburgh)", 40.4414, -79.9972, 40.4444, -79.9532),
    ("RI (Providence)", 41.8240, -71.4128, 41.8390, -71.4020),
    ("SC (Charleston)", 32.7765, -79.9311, 32.8010, -79.9500),
    ("SD (Sioux Falls)", 43.5460, -96.7313, 43.5250, -96.7700),
    ("TN (Nashville)", 36.1627, -86.7816, 36.1447, -86.8027),
    ("TX (Austin)", 30.2672, -97.7431, 30.2980, -97.7400),
    ("UT (Salt Lake City)", 40.7608, -111.8910, 40.7350, -111.8600),
    ("VT (Burlington)", 44.4759, -73.2121, 44.4600, -73.1800),
    ("VA (Richmond)", 37.5407, -77.4360, 37.5600, -77.4700),
    ("WA (Seattle)", 47.6062, -122.3321, 47.6205, -122.3493),
    ("WV (Charleston)", 38.3498, -81.6326, 38.3650, -81.6000),
    ("WI (Milwaukee)", 43.0389, -87.9065, 43.0600, -87.9200),
    ("WY (Cheyenne)", 41.1400, -104.8202, 41.1600, -104.8000),
    ("CROSS (Kansas City KS -> MO)", 39.1141, -94.6275, 39.0997, -94.5786),
    ("CROSS (Omaha NE -> Council Bluffs IA)", 41.2565, -95.9345, 41.2619, -95.8608),
    ("CROSS (Louisville KY -> Jeffersonville IN)", 38.2527, -85.7585, 38.2776, -85.7372),
    ("CROSS (Memphis TN -> West Memphis AR)", 35.1495, -90.0490, 35.1465, -90.1846),
    ("CROSS (Boston MA -> Providence RI)", 42.3601, -71.0589, 41.8240, -71.4128),
]

failed = 0
for name, lat1, lon1, lat2, lon2 in tests:
    payload = json.dumps({
        "locations": [{"lat": lat1, "lon": lon1}, {"lat": lat2, "lon": lon2}],
        "costing": "auto"
    }).encode()
    req = urllib.request.Request("http://127.0.0.1:8002/route", data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            s = data["trip"]["summary"]
            print("  [PASS] %-46s: %6.2f km, %5.1f min" % (name, s["length"], s["time"] / 60.0))
    except Exception as e:
        print(f"  [FAIL] {name:46s}: {e}")
        failed += 1

print(f"\nSUMMARY: {len(tests)-failed}/{len(tests)} PASSED")
if failed > 0:
    sys.exit(1)
PYTEST
    kill $PID 2>/dev/null || true
'
echo "=== 50-STATE BUILD & VERIFICATION COMPLETE AT $(date) ==="
