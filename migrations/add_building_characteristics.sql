-- ==============================================================================
-- Migration: add_building_characteristics.sql
-- Description:
--   Stores county CAMA building characteristics keyed by (county, folio), with
--   source and roll_year, strictly excluding owner names and mailing addresses.
--   Includes raw county quality/condition codes plus condition_is_default so
--   uninspected county defaults (e.g., Palm Beach 'AV' on 99% of parcels) never
--   create automatic appraisal condition adjustments unless manually confirmed.
--   Zero test rows. 100% idempotent. RLS enabled.
-- Target: Supabase PostgreSQL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS building_characteristics (
  county text NOT NULL,
  folio text NOT NULL,
  source text NOT NULL,
  roll_year smallint NOT NULL,
  property_class text,
  building_count smallint DEFAULT 1,
  beds numeric,
  full_baths smallint,
  half_baths smallint,
  stories numeric,
  year_built smallint,
  effective_year_built smallint,
  living_area_sqft integer,
  total_area_sqft integer,
  non_living_area_sqft integer,
  construction_type text,
  exterior_wall_code text,
  exterior_wall_desc text,
  roof_type text,
  roof_cover_code text,
  roof_cover_desc text,
  roof_structure_desc text,
  quality_uad text,
  raw_quality_code text,
  raw_quality_desc text,
  condition_uad text,
  raw_condition_code text,
  raw_condition_desc text,
  condition_is_default boolean NOT NULL DEFAULT false,
  pool_type text,
  pool_year smallint,
  screen_enclosure boolean,
  screen_enclosure_sqft integer,
  boat_dock boolean,
  boat_dock_sqft integer,
  boat_dock_year smallint,
  boat_lift boolean,
  boat_lift_year smallint,
  fireplaces smallint,
  garage_type text,
  garage_bays smallint,
  garage_sqft integer,
  porch_sqft integer,
  patio_sqft integer,
  waterfront_view text,
  land_class_code text,
  land_class_desc text,
  condo_model_desc text,
  sub_areas_json jsonb,
  extra_features_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (county, folio)
);

CREATE INDEX IF NOT EXISTS idx_building_characteristics_folio
  ON building_characteristics (folio);

ALTER TABLE building_characteristics ENABLE ROW LEVEL SECURITY;

