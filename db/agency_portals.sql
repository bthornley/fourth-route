-- agency_portals: transparency portal data from Eyes on Flock (CC BY-SA 4.0)
-- Stores verified Flock Safety transparency portal statistics for law enforcement agencies.

CREATE TABLE IF NOT EXISTS agency_portals (
    slug text PRIMARY KEY,
    portal_url text NOT NULL,
    agency_name text NOT NULL,
    city text,
    county text,
    state text NOT NULL,
    agency_type text NOT NULL, -- 'PD' (police department) or 'SD' (sheriff's department)
    population integer,
    total_cameras integer,
    total_searches integer,
    data_retention integer, -- days retained
    vehicles_captured bigint,
    hotlist_hits integer,
    hotlist_hit_rate float,
    organization_count integer,
    organizations_shared_with jsonb,
    receiving_organization_count integer,
    organizations_received_from jsonb,
    prohibited_uses text,
    public_search_audit boolean,
    data_last_updated timestamptz,
    snapshot_date timestamptz DEFAULT now(),
    attribution text DEFAULT 'Eyes on Flock (CC BY-SA 4.0)',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_portals_state_city ON agency_portals (state, lower(city));
CREATE INDEX IF NOT EXISTS idx_agency_portals_state_county ON agency_portals (state, lower(county));
CREATE INDEX IF NOT EXISTS idx_agency_portals_type ON agency_portals (agency_type);

COMMENT ON TABLE agency_portals IS
  'Verified Flock Safety transparency portal records aggregated by Eyes on Flock under CC BY-SA 4.0.';

-- camera_agency: links cameras to verified agency transparency portals
CREATE OR REPLACE VIEW camera_agency AS
SELECT
  cj.camera_id,
  cj.statefp,
  cj.place_geoid,
  cj.place_name,
  cj.county_geoid,
  cj.county_name,
  cj.jurisdiction_level,
  cj.jurisdiction_name,
  cj.operator,
  cj.owner_name,
  cj.owner_type,
  -- Matched portal metadata
  ap.slug AS agency_slug,
  COALESCE(ap.agency_name, cj.owner_name, cj.jurisdiction_name) AS display_agency_name,
  ap.agency_type,
  ap.portal_url,
  ap.total_cameras AS portal_cameras,
  ap.total_searches AS portal_searches_30d,
  ap.data_retention AS portal_retention_days,
  ap.vehicles_captured AS portal_vehicles_captured_30d,
  ap.hotlist_hits AS portal_hotlist_hits_30d,
  ap.hotlist_hit_rate AS portal_hotlist_hit_rate,
  ap.organization_count AS portal_sharing_partners_count,
  ap.organizations_shared_with AS portal_sharing_partners,
  ap.prohibited_uses AS portal_prohibited_uses,
  ap.public_search_audit AS portal_public_search_audit,
  ap.data_last_updated AS portal_last_updated,
  (ap.slug IS NOT NULL) AS has_verified_portal,
  'Eyes on Flock (CC BY-SA 4.0)' AS data_attribution
FROM camera_jurisdiction cj
LEFT JOIN LATERAL (
  SELECT
    CASE cj.statefp
      WHEN '06' THEN 'CA'
      WHEN '32' THEN 'NV'
      WHEN '48' THEN 'TX'
      WHEN '04' THEN 'AZ'
      WHEN '53' THEN 'WA'
      WHEN '41' THEN 'OR'
      ELSE NULL
    END AS state_code
) st ON true
LEFT JOIN LATERAL (
  SELECT *
  FROM agency_portals p
  WHERE p.state = st.state_code
    AND (
      -- Direct operator tag match
      (cj.owner_name IS NOT NULL AND (
        lower(cj.owner_name) = lower(p.agency_name)
        OR lower(cj.owner_name) LIKE '%' || lower(p.city) || '%pd%'
        OR lower(cj.owner_name) LIKE '%' || lower(p.city) || '%police%'
      ))
      OR
      -- City PD match
      (cj.jurisdiction_level = 'city' AND p.agency_type = 'PD' AND (
        lower(p.city) = lower(cj.place_name)
        OR lower(cj.place_name) LIKE lower(p.city) || '%'
        OR lower(p.city) LIKE lower(cj.place_name) || '%'
      ))
      OR
      -- County SD match (for unincorporated county cameras)
      (cj.jurisdiction_level = 'county' AND p.agency_type = 'SD' AND (
        lower(replace(p.county, ' County', '')) = lower(replace(cj.county_name, ' County', ''))
      ))
    )
  ORDER BY
    CASE
      WHEN cj.owner_name IS NOT NULL AND lower(cj.owner_name) = lower(p.agency_name) THEN 1
      WHEN cj.jurisdiction_level = 'city' AND lower(p.city) = lower(cj.place_name) THEN 2
      WHEN cj.jurisdiction_level = 'city' THEN 3
      ELSE 4
    END
  LIMIT 1
) ap ON true;

COMMENT ON VIEW camera_agency IS
  'Camera -> verified agency transparency portal (retention, searches, sharing reach). Data from Eyes on Flock (CC BY-SA 4.0).';
