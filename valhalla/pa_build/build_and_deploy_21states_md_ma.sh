#!/bin/bash
set -euo pipefail

WORK_DIR="/Users/bthornley/Documents/alpr-nav/valhalla/pa_build"
PBF_DIR="/Users/bthornley/Documents/alpr-nav/valhalla/tier1_build/pbfs"
mkdir -p "$WORK_DIR/pa_tiles" "$WORK_DIR/merged_tiles" "$PBF_DIR"

echo "=================================================================="
echo " Fourth Route — Zero-Disruption MD + MA (+ DC/DE I-95 Bridge) Build"
echo " Expanding Live Privacy Routing: 19 -> 21 States (+DC/DE Corridor)"
echo " Started at: $(date)"
echo "=================================================================="

# 1. Download maryland, massachusetts, district-of-columbia, delaware PBFs across 8 parallel streams
python3 - "$PBF_DIR" << 'PYEOF'
import sys, os, time, urllib.request, concurrent.futures

pbf_dir = sys.argv[1]
targets = [
    ("maryland-latest.osm.pbf", "https://download.geofabrik.de/north-america/us/maryland-latest.osm.pbf"),
    ("massachusetts-latest.osm.pbf", "https://download.geofabrik.de/north-america/us/massachusetts-latest.osm.pbf"),
    ("district-of-columbia-latest.osm.pbf", "https://download.geofabrik.de/north-america/us/district-of-columbia-latest.osm.pbf"),
    ("delaware-latest.osm.pbf", "https://download.geofabrik.de/north-america/us/delaware-latest.osm.pbf"),
]

for fname, url in targets:
    dest = os.path.join(pbf_dir, fname)
    if os.path.exists(dest) and os.path.getsize(dest) > 10_000_000:
        print(f"Already present: {fname} ({os.path.getsize(dest)/1048576:.1f} MB) ✓", flush=True)
        continue
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=30) as resp:
                final_url = resp.geturl()
                total_size = int(resp.headers["Content-Length"])
            break
        except Exception as e:
            print(f"  [HEAD {fname}] retry {attempt+1}/6 after {e}", flush=True)
            time.sleep(3)
    print(f"Downloading {fname} from {final_url} ({total_size/1048576:.1f} MB)...", flush=True)
    num_parts = 8
    chunk = total_size // num_parts

    def fetch_part(i):
        start = i * chunk
        end = (total_size - 1) if i == num_parts - 1 else (start + chunk - 1)
        part_file = f"{dest}.part{i}"
        while True:
            cur_size = os.path.getsize(part_file) if os.path.exists(part_file) else 0
            if cur_size >= (end - start + 1):
                return part_file
            try:
                r = urllib.request.Request(final_url)
                r.add_header("Range", f"bytes={start + cur_size}-{end}")
                with urllib.request.urlopen(r, timeout=30) as resp, open(part_file, "ab") as f:
                    while True:
                        buf = resp.read(262144)
                        if not buf:
                            break
                        f.write(buf)
            except Exception as e:
                print(f"  [{fname} part {i}] retry after {e}", flush=True)
                time.sleep(2)

    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_parts) as ex:
        parts = list(ex.map(fetch_part, range(num_parts)))

    with open(dest + ".tmp", "wb") as out:
        for p in parts:
            with open(p, "rb") as pf:
                while True:
                    b = pf.read(1048576)
                    if not b:
                        break
                    out.write(b)
            os.remove(p)
    os.rename(dest + ".tmp", dest)
    print(f"Downloaded {fname} ({os.path.getsize(dest)/1048576:.1f} MB) in {time.time()-t0:.1f}s ✓", flush=True)
PYEOF

# 2. Unpack production v8-tiles-19states archive (all 4 parts: partaa..partad) into merged_tiles
rm -rf "$WORK_DIR/pa_tiles"/* "$WORK_DIR/merged_tiles"/*
echo "--- Step 1B: Unpacking production v8-tiles-19states archive ---"
BASE_REL="https://github.com/bthornley/fourth-route/releases/download/v8-tiles-19states/valhalla_tiles.tar.gz"
{
  curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partaa"
  curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partab"
  curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partac"
  curl -L --retry 5 --retry-delay 5 -sS "${BASE_REL}.partad"
} | gunzip | tar -xf - -C "$WORK_DIR/merged_tiles"
rm -f "$WORK_DIR/merged_tiles/index.bin"
echo "Unpacked production 19-state tiles ✓"

# 3. Build standalone Massachusetts driving tiles & splice into merged_tiles
echo "--- Step 2A: Building standalone Massachusetts (MA) driving tiles ---"
rm -rf "$WORK_DIR/pa_tiles"/*
T0=$(date +%s)
docker run --rm \
  --platform linux/arm64 \
  --entrypoint /bin/bash \
  -v "$WORK_DIR:/data" \
  -v "$PBF_DIR:/pbfs:ro" \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c '
    valhalla_build_tiles -c /data/valhalla_pa.json -j 6 /pbfs/massachusetts-latest.osm.pbf
'
echo "Massachusetts tiles built in $(( $(date +%s) - T0 ))s ✓"

python3 - << 'PYMERGE_MA'
import os, glob, shutil
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
print(f"Massachusetts splice complete: +{added} new MA tiles added, {upgraded} border tiles upgraded, {kept} existing tiles kept ✓", flush=True)
PYMERGE_MA

# 4. Deduplicate MD + DC + DE + VA + PA with osmium merge for continuous I-95 Mid-Atlantic routing
echo "--- Step 2B: Merging MD + DC + DE + VA + PA PBFs with osmium merge ---"
rm -rf "$WORK_DIR/pa_tiles"/* "$WORK_DIR/midatlantic_merged.osm.pbf"
docker run --rm -u root \
  --platform linux/arm64 \
  --entrypoint /bin/bash \
  -v "$WORK_DIR:/data" \
  -v "$PBF_DIR:/pbfs:ro" \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c '
    apt-get update -qq && apt-get install -y -qq osmium-tool >/dev/null
    osmium merge \
      /pbfs/maryland-latest.osm.pbf \
      /pbfs/district-of-columbia-latest.osm.pbf \
      /pbfs/delaware-latest.osm.pbf \
      /pbfs/virginia-latest.osm.pbf \
      /pbfs/pennsylvania-latest.osm.pbf \
      -o /data/midatlantic_merged.osm.pbf --overwrite
'
echo "Created deduplicated midatlantic_merged.osm.pbf ($(ls -lh "$WORK_DIR/midatlantic_merged.osm.pbf" | awk '{print $5}')) ✓"

echo "--- Step 2C: Building MD + DC + DE + VA + PA I-95 Corridor driving tiles ---"
T0=$(date +%s)
docker run --rm \
  --platform linux/arm64 \
  --entrypoint /bin/bash \
  -v "$WORK_DIR:/data" \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c '
    valhalla_build_tiles -c /data/valhalla_pa.json -j 6 /data/midatlantic_merged.osm.pbf
'
echo "MD + DC + DE + VA + PA tiles built cleanly in $(( $(date +%s) - T0 ))s ✓"

python3 - << 'PYMERGE_MD'
import os, glob, shutil
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
print(f"Mid-Atlantic splice complete: +{added} new MD/DC/DE tiles added, {upgraded} border tiles upgraded, {kept} neighbor tiles kept ✓", flush=True)
PYMERGE_MD

# 5. Extract 21-state valhalla_tiles.tar
echo "--- Step 3: Extracting 21-state valhalla_tiles.tar ---"
rm -f "$WORK_DIR/valhalla_tiles.tar" "$WORK_DIR/merged_tiles/index.bin"
docker run --rm \
  --platform linux/arm64 \
  --entrypoint /bin/bash \
  -v "$WORK_DIR:/data" \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c '
    valhalla_build_extract -c /data/valhalla_merged.json -v
'
echo "Extracted 21-state valhalla_tiles.tar ($(ls -lh "$WORK_DIR/valhalla_tiles.tar" | awk '{print $5}')) ✓"

# 6. Run 24-route verification across MD, DC, DE, MA, VA, PA, NJ, NY, IN, MI, IL, OH, CO, CA
echo "--- Step 4: Running 24-route verification on 21-state valhalla_tiles.tar ---"
docker run --rm \
  --platform linux/arm64 \
  -v "$WORK_DIR:/data:ro" \
  --entrypoint /bin/bash \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c '
    valhalla_service /data/valhalla_merged.json 1 >/dev/null 2>&1 &
    PID=$!
    sleep 3
    python3 - << '\''PYTEST'\''
import urllib.request, json, sys

tests = [
    ("Baltimore, MD (Inner Harbor -> Towson)", 39.2858, -76.6131, 39.4015, -76.6019),
    ("Silver Spring -> Bethesda, MD", 38.9907, -77.0261, 38.9847, -77.0947),
    ("Annapolis -> Columbia, MD", 38.9784, -76.4922, 39.2037, -76.8610),
    ("Washington, DC -> Arlington, VA (Potomac Bridge)", 38.9072, -77.0369, 38.8816, -77.0910),
    ("Cross-Border I-95 (Arlington VA -> DC -> Baltimore MD)", 38.8816, -77.0910, 39.2904, -76.6122),
    ("Cross-Border I-95 (Baltimore MD -> Wilmington DE -> Philly PA)", 39.2904, -76.6122, 39.9526, -75.1652),
    ("Cross-Border I-83 (Baltimore MD -> York/Harrisburg PA)", 39.2904, -76.6122, 40.2732, -76.8867),
    ("Boston -> Cambridge, MA", 42.3601, -71.0589, 42.3736, -71.1097),
    ("Boston -> Brookline/Newton, MA", 42.3505, -71.0765, 42.3370, -71.2092),
    ("Worcester -> Framingham, MA (I-90 Mass Pike)", 42.2626, -71.8023, 42.2793, -71.4162),
    ("Springfield -> Northampton, MA (I-91)", 42.1015, -72.5898, 42.3251, -72.6412),
    ("Lowell -> Lawrence, MA (I-495 Merrimack Valley)", 42.6334, -71.3162, 42.7070, -71.1631),
    ("Chicago IL -> Hammond IN (I-90)", 41.8781, -87.6298, 41.5934, -87.4800),
    ("Detroit -> Dearborn, MI", 42.3314, -83.0458, 42.3223, -83.1763),
    ("Aurora -> Denver, CO", 39.7400, -104.8650, 39.7400, -104.9600),
    ("Franklin Twp -> New Brunswick, NJ", 40.4750, -74.4850, 40.4950, -74.4450),
    ("Boise, ID (Downtown -> Meridian)", 43.6150, -116.2023, 43.6121, -116.3915),
    ("Seattle, WA", 47.6062, -122.3321, 47.6205, -122.3493),
    ("Portland, OR", 45.5152, -122.6784, 45.5231, -122.6365),
    ("Pittsburgh, PA", 40.4414, -79.9972, 40.4444, -79.9532),
    ("Columbus, OH", 39.9612, -82.9988, 39.9980, -83.0080),
    ("New York, NY", 40.7128, -74.0060, 40.7580, -73.9855),
    ("Atlanta, GA", 33.7490, -84.3880, 33.7756, -84.3963),
    ("Oakland, CA", 37.8044, -122.2712, 37.8272, -122.2516),
]

failed = 0
for name, lat1, lon1, lat2, lon2 in tests:
    payload = json.dumps({
        "locations": [{"lat": lat1, "lon": lon1}, {"lat": lat2, "lon": lon2}],
        "costing": "auto"
    }).encode()
    req = urllib.request.Request("http://127.0.0.1:8002/route", data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            s = data["trip"]["summary"]
            l_km = s["length"]
            t_min = s["time"] / 60.0
            print(f"  [PASS] {name:60s}: {l_km:6.2f} km, {t_min:5.1f} min")
    except Exception as e:
        print(f"  [FAIL] {name:60s}: {e}")
        failed += 1

if failed > 0:
    sys.exit(1)
PYTEST
    kill $PID 2>/dev/null || true
'

# 7. Compress & split into 4 parts (<850 MB each) and upload to GitHub Release v9-tiles-21states
echo "--- Step 5: Compressing & uploading v9-tiles-21states to GitHub Releases ---"
rm -f "$WORK_DIR/valhalla_tiles.tar.gz"*
gzip -c "$WORK_DIR/valhalla_tiles.tar" > "$WORK_DIR/valhalla_tiles.tar.gz"
GZ_BYTES=$(stat -f%z "$WORK_DIR/valhalla_tiles.tar.gz")
CHUNK_BYTES=$(( (GZ_BYTES / 4) + 1048576 ))
split -b "$CHUNK_BYTES" "$WORK_DIR/valhalla_tiles.tar.gz" "$WORK_DIR/valhalla_tiles.tar.gz.part"
ls -lh "$WORK_DIR"/valhalla_tiles.tar.gz.part*

RELEASE_TAG="v9-tiles-21states"
if ! gh release view "$RELEASE_TAG" --repo bthornley/fourth-route > /dev/null 2>&1; then
  gh release create "$RELEASE_TAG" \
    --repo bthornley/fourth-route \
    --title "Valhalla 21-State Driving Tiles (+MD, MA, DC & DE I-95 Bridge)" \
    --notes "Driving-only Valhalla routing graph covering 21 states plus Washington DC & Delaware I-95 bridge (CA, NV, TX, GA, IL, IN, MI, FL, OH, NY, PA, NJ, MD, MA, VA, NC, AZ, CO, WA, OR, ID + DC/DE)."
fi

for part in partaa partab partac partad; do
  FILE="$WORK_DIR/valhalla_tiles.tar.gz.$part"
  echo "Uploading $part ($(ls -lh "$FILE" | awk '{print $5}'))..."
  gh release upload "$RELEASE_TAG" "$FILE" --repo bthornley/fourth-route --clobber
  echo "$part uploaded ✓"
done

# Cleanup temporary gigabyte files immediately after upload
rm -rf "$WORK_DIR/pa_tiles"/* "$WORK_DIR/merged_tiles"/* "$WORK_DIR/valhalla_tiles.tar"* "$WORK_DIR/midatlantic_merged.osm.pbf"
echo "=== v9-tiles-21states UPLOADED & READY AT $(date) ==="
