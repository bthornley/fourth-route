-- Civic Accountability Moats (Phase 5):
-- 1) agency_actions: Verified AG enforcement, lawsuits, council terminations & state statutory caps
-- 2) agency_contracts: Verified municipal ALPR vendor contract spend & termination status
-- 3) camera_reports / cameras structured crowdsource columns (placement_type, facing_direction)

CREATE TABLE IF NOT EXISTS agency_actions (
    id                 SERIAL PRIMARY KEY,
    action_key         TEXT UNIQUE NOT NULL,
    agency_slug        TEXT,
    jurisdiction_name  TEXT NOT NULL,
    state              CHAR(2) NOT NULL,
    action_type        TEXT NOT NULL, -- 'contract_terminated' | 'lawsuit' | 'statute_cap' | 'vendor_switched' | 'contract_approved'
    action_date        DATE NOT NULL,
    headline           TEXT NOT NULL,
    summary            TEXT NOT NULL,
    statute_or_vote    TEXT,
    retention_cap_days INTEGER,
    source_label       TEXT NOT NULL,
    source_url         TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_actions_state ON agency_actions (state, action_date DESC);
CREATE INDEX IF NOT EXISTS idx_agency_actions_slug ON agency_actions (agency_slug);

CREATE TABLE IF NOT EXISTS agency_contracts (
    id                 SERIAL PRIMARY KEY,
    contract_key       TEXT UNIQUE NOT NULL,
    agency_slug        TEXT,
    city               TEXT NOT NULL,
    state              CHAR(2) NOT NULL,
    vendor             TEXT NOT NULL,
    status             TEXT NOT NULL, -- 'terminated' | 'switched' | 'expired' | 'active'
    contract_value_usd BIGINT,
    annual_cost_usd    BIGINT,
    camera_count       INTEGER,
    end_or_vote_date   DATE,
    notes              TEXT NOT NULL,
    source_label       TEXT NOT NULL,
    source_url         TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_contracts_state ON agency_contracts (state);
CREATE INDEX IF NOT EXISTS idx_agency_contracts_slug ON agency_contracts (agency_slug);

-- Structured crowdsource fields for camera_reports & cameras
ALTER TABLE camera_reports ADD COLUMN IF NOT EXISTS placement_type TEXT;
ALTER TABLE camera_reports ADD COLUMN IF NOT EXISTS facing_direction TEXT;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS placement_type TEXT;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS facing_direction TEXT;

-- Lock down direct PostgREST access (served exclusively through API server role)
ALTER TABLE agency_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_contracts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE agency_actions FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE agency_contracts FROM anon, authenticated, PUBLIC;

-- Seed verified public actions & statutory frameworks
INSERT INTO agency_actions (
    action_key, agency_slug, jurisdiction_name, state, action_type, action_date,
    headline, summary, statute_or_vote, retention_cap_days, source_label, source_url
) VALUES
(
    'ca-san-diego-termination-2026-11-16',
    'san-diego-ca-pd',
    'San Diego Police Department',
    'CA',
    'contract_terminated',
    '2026-11-16',
    'City Council Votes 7–0 to End ALPR Program & Halt Flock Contract',
    'San Diego City Council voted unanimously (7–0) to terminate SDPD''s automated license plate reader program and suspend authorization for its Flock Safety contract, disabling officer access within 24 hours.',
    '7–0 Council Vote',
    NULL,
    'KPBS / Times of San Diego',
    'https://www.kpbs.org/'
),
(
    'ca-el-cajon-ag-sb34-lawsuit-2025-10',
    '-el-cajon-pd-ca',
    'El Cajon Police Department',
    'CA',
    'lawsuit',
    '2025-10-15',
    'CA Attorney General Sues El Cajon PD Over SB 34 Out-of-State Sharing',
    'California Attorney General Rob Bonta filed suit in San Diego County Superior Court alleging El Cajon PD violated Civil Code § 1798.90.55 (SB 34) by sharing ALPR plate data across 600+ out-of-state agencies.',
    'CA SB 34 (Civ. Code § 1798.90.55)',
    NULL,
    'CA Attorney General',
    'https://oag.ca.gov/'
),
(
    'wa-sb6002-driver-privacy-2026-03-30',
    NULL,
    'Washington State (Statewide Law)',
    'WA',
    'statute_cap',
    '2026-03-30',
    'SB 6002: 21-Day Retention Cap & Warrant Required for Vendor Data',
    'Washington''s Driver Privacy Act caps ALPR retention at 21 days (with limited evidentiary exceptions), requires a probable-cause warrant for private-vendor data access, requires 5-year query audit retention, and bans immigration or reproductive healthcare tracking.',
    'WA SB 6002',
    21,
    'Washington State Legislature',
    'https://leg.wa.gov/'
),
(
    'or-sb1516-30day-law-2026-03-31',
    NULL,
    'Oregon (Statewide Law)',
    'OR',
    'statute_cap',
    '2026-03-31',
    'SB 1516: 30-Day Retention Cap & Direct Private Right of Action',
    'Oregon capped ALPR data retention at 30 days max outside active criminal proceedings, prohibited sanctuary-law violations and political monitoring, and created a direct right for residents to sue vendors for misuse.',
    'OR SB 1516',
    30,
    'Oregon State Legislature',
    'https://www.oregonlegislature.gov/'
),
(
    'co-denver-flock-expired-2026-03-31',
    'denver-co-pd',
    'Denver Police Department',
    'CO',
    'vendor_switched',
    '2026-03-31',
    'Denver Removes All 110 Flock Cameras & Rejects Contract Renewal',
    'Following legal liability warnings from the City Auditor and City Council opposition over out-of-state data sharing, Denver removed all 110 Flock Safety cameras when its contract expired on March 31, 2026, later approving a narrower 50-camera 1-year Axon pilot.',
    'Council Non-Renewal',
    NULL,
    '9NEWS / ACLU of Colorado',
    'https://www.9news.com/'
),
(
    'tx-austin-contract-ended',
    'austin-tx-pd',
    'Austin Police Department',
    'TX',
    'contract_terminated',
    '2025-07-01',
    'Austin Allows Flock Safety Contract to Expire Amid Public Pushback',
    'Austin declined to renew its automated license plate reader contract with Flock Safety after sustained civil liberties opposition; multiple neighboring Central Texas cities including Taylor, Manor, Hutto, and Bastrop also dropped contracts.',
    'Contract Non-Renewal',
    NULL,
    'EFF / KVUE',
    'https://www.eff.org/'
),
(
    'il-evanston-contract-terminated',
    'evanston-il-pd',
    'Evanston Police Department',
    'IL',
    'contract_terminated',
    '2025-09-01',
    'Evanston Deactivates 19 Flock Cameras & Moves to Terminate Contract',
    'After public scrutiny over third-party data-sharing disclosures and federal access risks, the City of Evanston deactivated its 19-camera Flock deployment and moved to terminate the agreement and remove hardware.',
    'Municipal Termination & Cease-and-Desist',
    NULL,
    'NPR Illinois / Daily Northwestern',
    'https://www.nprillinois.org/'
),
(
    'ut-alpr-part20-statute',
    NULL,
    'Utah (Statewide Law)',
    'UT',
    'statute_cap',
    '2024-05-01',
    'Utah Code § 41-6a-2001: 9-Month Retention Ceiling & Published Policies',
    'Utah''s ALPR System Act limits government retention to 9 months absent court order/warrant, mandates public-facing department use policies and UDOT highway permits, and makes violations a Class B misdemeanor.',
    'Utah Code § 41-6a-2001 et seq.',
    270,
    'Utah State Legislature',
    'https://le.utah.gov/'
)
ON CONFLICT (action_key) DO UPDATE SET
    agency_slug = EXCLUDED.agency_slug,
    jurisdiction_name = EXCLUDED.jurisdiction_name,
    state = EXCLUDED.state,
    action_type = EXCLUDED.action_type,
    action_date = EXCLUDED.action_date,
    headline = EXCLUDED.headline,
    summary = EXCLUDED.summary,
    statute_or_vote = EXCLUDED.statute_or_vote,
    retention_cap_days = EXCLUDED.retention_cap_days,
    source_label = EXCLUDED.source_label,
    source_url = EXCLUDED.source_url;

-- Seed verified municipal contract spend & status records
INSERT INTO agency_contracts (
    contract_key, agency_slug, city, state, vendor, status,
    contract_value_usd, annual_cost_usd, camera_count, end_or_vote_date,
    notes, source_label, source_url
) VALUES
(
    'san-diego-ca-alpr',
    'san-diego-ca-pd',
    'San Diego',
    'CA',
    'Flock Safety / Ubicquia',
    'terminated',
    3512500,
    2000000,
    500,
    '2026-11-16',
    'Initial payment of $3,512,500 covered 500 units and Year 1 operation under Smart Streetlights; San Diego Independent Budget Analyst estimated ~$2M/yr ongoing savings following the 7–0 November 16, 2026 termination vote.',
    'City of San Diego / KPBS',
    'https://www.sandiego.gov/'
),
(
    'oakland-ca-flock',
    'oakland-ca-pd',
    'Oakland',
    'CA',
    'Flock Safety',
    'active',
    2252500,
    1126250,
    300,
    NULL,
    'Two-year $2,252,500 agreement (~$1.126M/yr annualized) covering ~300 fixed ALPR and pan-tilt-zoom cameras.',
    'Oakland City Council Records',
    'https://www.oaklandca.gov/'
),
(
    'denver-co-flock-to-axon',
    'denver-co-pd',
    'Denver',
    'CO',
    'Flock Safety → Axon',
    'switched',
    150000,
    150000,
    50,
    '2026-03-31',
    'Removed all 110 Flock cameras upon March 31, 2026 expiration; replaced with a narrower 1-year $150,000 Axon 50-camera agreement with stricter retention limits.',
    '9NEWS Denver',
    'https://www.9news.com/'
),
(
    'austin-tx-flock',
    'austin-tx-pd',
    'Austin',
    'TX',
    'Flock Safety',
    'terminated',
    114000,
    NULL,
    NULL,
    '2025-07-01',
    'Initial $114,000 cooperative-purchasing allocation for hardware, software, and setup; contract was not renewed following community privacy pushback.',
    'City of Austin / EFF',
    'https://www.austintexas.gov/'
),
(
    'evanston-il-flock',
    'evanston-il-pd',
    'Evanston',
    'IL',
    'Flock Safety',
    'terminated',
    NULL,
    NULL,
    19,
    '2025-09-01',
    'Deployed 19 stationary/mobile Flock units at ~$2,850/camera baseline pricing before city deactivated the cameras and moved to terminate the contract.',
    'Daily Northwestern / NPR Illinois',
    'https://www.nprillinois.org/'
)
ON CONFLICT (contract_key) DO UPDATE SET
    agency_slug = EXCLUDED.agency_slug,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    vendor = EXCLUDED.vendor,
    status = EXCLUDED.status,
    contract_value_usd = EXCLUDED.contract_value_usd,
    annual_cost_usd = EXCLUDED.annual_cost_usd,
    camera_count = EXCLUDED.camera_count,
    end_or_vote_date = EXCLUDED.end_or_vote_date,
    notes = EXCLUDED.notes,
    source_label = EXCLUDED.source_label,
    source_url = EXCLUDED.source_url;
