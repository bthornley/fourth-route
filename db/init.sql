-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Camera table: one row per known ALPR camera
CREATE TABLE IF NOT EXISTS cameras (
    id           SERIAL PRIMARY KEY,
    osm_id       BIGINT UNIQUE,          -- OSM node ID (null for user reports)
    geom         GEOGRAPHY(Point, 4326) NOT NULL,
    source       TEXT NOT NULL DEFAULT 'osm', -- 'osm' | 'user' | 'foia'
    operator     TEXT,                   -- 'Flock Safety', 'Vigilant', etc.
    direction    INT,                    -- camera facing degrees (0-360), null = unknown
    confidence   FLOAT NOT NULL DEFAULT 1.0,
    notes        TEXT,
    verified_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spatial index for fast bounding-box queries
CREATE INDEX IF NOT EXISTS cameras_geom_idx ON cameras USING GIST (geom);

-- Index on source for ETL upserts
CREATE INDEX IF NOT EXISTS cameras_source_idx ON cameras (source);
CREATE INDEX IF NOT EXISTS cameras_osm_id_idx ON cameras (osm_id);

-- User-submitted reports queue (awaiting moderation)
CREATE TABLE IF NOT EXISTS camera_reports (
    id          SERIAL PRIMARY KEY,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    operator    TEXT,
    notes       TEXT,
    image_url   TEXT,
    status      TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ETL sync log
CREATE TABLE IF NOT EXISTS sync_log (
    id          SERIAL PRIMARY KEY,
    source      TEXT NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    inserted    INT DEFAULT 0,
    updated     INT DEFAULT 0,
    deleted     INT DEFAULT 0,
    error       TEXT
);
