-- ==============================================================================
-- Migration: add_appraisal_v2_columns.sql
-- Description:
--   Adds nullable columns for Appraisal Grid v2:
--   1. county_parcels.land_value (FDOR NAL LND_VAL) to compute county improvement
--      value (just_value - land_value) and land-share % for waterfront/land-heavy GLA.
--   2. quality (UAD Q1–Q6) and boat_lift (boolean) on investor_properties,
--      investor_comps, and reusable comp_details, plus optional land_value override
--      on investor_properties.
--   Nullable, no default -> metadata-only ALTERs (no table rewrite).
--   No owner names, mailing addresses, new tables, or test rows. 100% idempotent.
-- Target: Supabase PostgreSQL
-- ==============================================================================

ALTER TABLE county_parcels
  ADD COLUMN IF NOT EXISTS land_value numeric;

ALTER TABLE investor_properties
  ADD COLUMN IF NOT EXISTS quality text,
  ADD COLUMN IF NOT EXISTS boat_lift boolean,
  ADD COLUMN IF NOT EXISTS land_value numeric;

ALTER TABLE investor_comps
  ADD COLUMN IF NOT EXISTS quality text,
  ADD COLUMN IF NOT EXISTS boat_lift boolean;

ALTER TABLE comp_details
  ADD COLUMN IF NOT EXISTS quality text,
  ADD COLUMN IF NOT EXISTS boat_lift boolean;

