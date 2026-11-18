-- ==============================================================================
-- Migration: add_location_intelligence_tables.sql
-- Description:
--   1. location_snapshots: per-property server-side cache of real, coordinate-based
--      Location data (Getting around, Schools, People & housing, Safety) with
--      fetched_at and explicit per-field source provenance.
--   2. fl_highway_junctions: OpenStreetMap (Geofabrik Florida extract) motorway
--      junctions & interchanges for nearest on-ramp lookups (I-95, Turnpike, I-595,
--      I-75, I-4, etc.).
--   3. school_attendance_zones & fldoe_school_grades: official School District of
--      Palm Beach County and Broward County Public Schools attendance-boundary
--      polygons + FLDOE school accountability grades joined by school number.
--   4. fdle_agency_stats: official FDLE agency-level UCR/FIBRS annual crime stats.
--
-- Strictly additive & idempotent (IF NOT EXISTS). Zero DROP/DELETE/TRUNCATE/UPDATE.
-- Strictly schema-only (NO test rows).
-- Target: Neon PostgreSQL
-- ==============================================================================

-- 1. Cached per-property Location Snapshots with per-field source provenance
CREATE TABLE IF NOT EXISTS location_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES investor_properties(id) ON DELETE CASCADE,
  owner_email text NOT NULL,
  address_label text NOT NULL,
  county text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  field_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  getting_around jsonb NOT NULL DEFAULT '{}'::jsonb,
  schools jsonb NOT NULL DEFAULT '{}'::jsonb,
  people_housing jsonb NOT NULL DEFAULT '{}'::jsonb,
  safety jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT location_snapshots_property_unique UNIQUE (property_id)
);

CREATE INDEX IF NOT EXISTS idx_location_snapshots_owner_fetched
  ON location_snapshots (lower(owner_email), fetched_at DESC);

-- 2. OpenStreetMap Florida Motorway Junctions (imported once from Geofabrik Florida)
CREATE TABLE IF NOT EXISTS fl_highway_junctions (
  osm_id bigint PRIMARY KEY,
  route text NOT NULL,
  route_type text NOT NULL DEFAULT 'interstate',
  badge_number text NOT NULL,
  exit_ref text,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  source text NOT NULL DEFAULT 'OpenStreetMap (Geofabrik Florida extract)',
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_highway_junctions_route_coords
  ON fl_highway_junctions (route, lat, lng);

-- 3. Official School District Attendance Boundary Polygons (Palm Beach & Broward)
CREATE TABLE IF NOT EXISTS school_attendance_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county text NOT NULL CHECK (county IN ('Broward', 'Palm Beach')),
  level text NOT NULL CHECK (level IN ('elementary', 'middle', 'high')),
  district_number text NOT NULL,
  school_number text NOT NULL,
  school_name text NOT NULL,
  school_year text,
  min_lat double precision NOT NULL,
  max_lat double precision NOT NULL,
  min_lng double precision NOT NULL,
  max_lng double precision NOT NULL,
  geometry_geojson jsonb NOT NULL,
  source text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_attendance_zones_unique UNIQUE (county, level, school_number)
);

CREATE INDEX IF NOT EXISTS idx_school_attendance_zones_bbox
  ON school_attendance_zones (county, level, min_lat, max_lat, min_lng, max_lng);

-- 4. Official FLDOE School Grades (joined to attendance boundaries by school_number)
CREATE TABLE IF NOT EXISTS fldoe_school_grades (
  district_number text NOT NULL,
  school_number text NOT NULL,
  school_year text NOT NULL,
  county text NOT NULL,
  school_name text NOT NULL,
  grade text,
  pct_points numeric,
  school_type text,
  charter boolean NOT NULL DEFAULT false,
  lat double precision,
  lng double precision,
  source text NOT NULL DEFAULT 'Florida Department of Education (FLDOE) School Grades',
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (district_number, school_number, school_year)
);

CREATE INDEX IF NOT EXISTS idx_fldoe_school_grades_county_coords
  ON fldoe_school_grades (county, school_year, lat, lng);

-- 5. Official FDLE Reporting-Agency Annual Crime Statistics
CREATE TABLE IF NOT EXISTS fdle_agency_stats (
  agency_ori text NOT NULL,
  report_year int NOT NULL,
  agency_name text NOT NULL,
  county text NOT NULL,
  jurisdiction_key text NOT NULL,
  is_unincorporated_sheriff boolean NOT NULL DEFAULT false,
  population int,
  violent_count int,
  property_count int,
  violent_rate_per_100k numeric,
  property_rate_per_100k numeric,
  source text NOT NULL DEFAULT 'Florida Department of Law Enforcement (FDLE) UCR/FIBRS',
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_ori, report_year)
);

CREATE INDEX IF NOT EXISTS idx_fdle_agency_stats_lookup
  ON fdle_agency_stats (county, jurisdiction_key, report_year DESC);

