-- camera_jurisdiction: which city/county each camera sits in, and who owns it
-- as far as the OSM `operator` tag tells us.
--
-- Depends on: cameras, jurisdiction_place, jurisdiction_county (etl/load_jurisdictions.py)
-- Read-only view; touches no existing tables. Re-run this file any time to update the logic.
--
-- Columns
--   owner_name    operator with any trailing "(Vendor)" removed, e.g.
--                 "San Mateo Police Department (Flock Safety)" -> "San Mateo Police Department"
--   owner_type    police | federal | state | public_other | local_government | private | unspecified
--                 "unspecified" means the tag names only a vendor ("Flock Safety", "Motorola
--                 Solutions", ...) or nothing at all; the camera's owner is unknown.
--   jurisdiction_level / jurisdiction_name
--                 the incorporated city the camera is in; otherwise its county
--                 (unincorporated areas are policed by the sheriff).
--
-- Caveat: the jurisdiction is where the camera *is*, not proof of who runs it. Many cities
-- contract policing to the county sheriff (e.g. much of LA, Riverside and San Diego counties),
-- and private cameras (HOAs, retailers) may share with several agencies. Treat any agency
-- derived from this view as "likely", and show the method to users.

CREATE OR REPLACE VIEW camera_jurisdiction AS
WITH base AS (
  SELECT
    c.id AS camera_id,
    c.operator,
    NULLIF(btrim(regexp_replace(coalesce(c.operator, ''), '\s*\([^()]*\)\s*$', '')), '') AS owner_name,
    p.geoid AS place_geoid, p.name AS place_name,
    k.geoid AS county_geoid, k.name AS county_name,
    coalesce(p.statefp, k.statefp) AS statefp
  FROM cameras c
  LEFT JOIN LATERAL (
    SELECT geoid, name, statefp FROM jurisdiction_place jp
    WHERE ST_Intersects(jp.geom, c.geom::geometry) LIMIT 1
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT geoid, name, statefp FROM jurisdiction_county jc
    WHERE ST_Intersects(jc.geom, c.geom::geometry) LIMIT 1
  ) k ON true
)
SELECT
  camera_id,
  statefp,
  place_geoid, place_name,
  county_geoid, county_name,
  CASE WHEN place_geoid IS NOT NULL THEN 'city'
       WHEN county_geoid IS NOT NULL THEN 'county' END AS jurisdiction_level,
  CASE WHEN place_geoid IS NOT NULL THEN place_name
       WHEN county_geoid IS NOT NULL THEN county_name || ' County' END AS jurisdiction_name,
  operator,
  owner_name,
  CASE
    WHEN owner_name IS NULL
      OR owner_name ~* '^(flock|motorola|axis( communications)?|genetec|verkada|bosch|ubicquia|rekor|avigilon|kapsch|transcore|axon|neology|epic io|liveview|reconyx|leonardo|vigilant|elsag|hikvision|uniview|icamera|other\M|unknown)'
      THEN 'unspecified'
    WHEN owner_name ~* '(drug enforcement|\mDEA\M|\mFBI\M|border patrol|customs and border|homeland security|\mICE\M|\mCBP\M|U\.?S\.? Marshal)'
      THEN 'federal'
    WHEN owner_name ~* '(highway patrol|\mCHP\M|\mNHP\M|caltrans|department of transportation|state parks|cal fire|state university police)'
      THEN 'state'
    WHEN owner_name ~* '(police|sheriff|\mPD\M|\mSO\M|public safety|\mLASD\M|marshal|district attorney)'
      OR owner_name ~ '^[A-Z]{1,5}(PD|SO)$'  -- abbreviations like "TOPD" (Thousand Oaks PD)
      THEN 'police'
    WHEN owner_name ~* '(toll authority|transportation authority|transportation district|transit|\mport of|airport|bridge)'
      THEN 'public_other'
    WHEN owner_name ~* '^(city|town|county) of '
      OR lower(owner_name) = lower(place_name)
      OR lower(owner_name) IN (lower(county_name) || ' county', 'county of ' || lower(county_name))
      THEN 'local_government'
    ELSE 'private'
  END AS owner_type
FROM base;

COMMENT ON VIEW camera_jurisdiction IS
  'Camera -> city/county (Census boundaries) + owner type parsed from OSM operator tag. Jurisdiction is location, not proof of operator.';
