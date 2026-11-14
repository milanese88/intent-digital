-- ==============================================================================
-- Migration: add_comp_details_and_nal_clues.sql
-- Description:
--   1. County clues on county_parcels: ensures eff_year_built (EFF_YR_BLT) & units
--      (NO_RES_UNTS) exist, and adds imp_qual (IMP_QUAL), const_class (CONST_CLASS),
--      spec_feat_val (SPEC_FEAT_VAL), plus optional beds / full_baths / half_baths
--      for public-records building-characteristics imports.
--   2. Reusable per-county-sale comp_details table keyed by
--      (owner_email, county, parcel_id, sale_month_key) so details entered once
--      pre-fill across every property and appraisal that uses that sale.
--   3. Expands investor_comps with UAD C1–C6 condition support, comp_details_json,
--      and is_outlier flag.
--   4. Adds subject_details JSONB (as_is & after_rehab) on investor_properties.
--
-- Strictly schema-only (NO test rows). 100% idempotent (IF NOT EXISTS).
-- Target: Neon PostgreSQL
-- ==============================================================================

-- 1. DOR NAL clue columns + optional public-records building columns on county_parcels
ALTER TABLE county_parcels
  ADD COLUMN IF NOT EXISTS eff_year_built int,
  ADD COLUMN IF NOT EXISTS units int,
  ADD COLUMN IF NOT EXISTS imp_qual text,
  ADD COLUMN IF NOT EXISTS const_class text,
  ADD COLUMN IF NOT EXISTS spec_feat_val bigint,
  ADD COLUMN IF NOT EXISTS beds numeric,
  ADD COLUMN IF NOT EXISTS full_baths smallint,
  ADD COLUMN IF NOT EXISTS half_baths smallint;

-- 2. Reusable per-county-sale comp_details table (owned per user)
CREATE TABLE IF NOT EXISTS comp_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  county text NOT NULL CHECK (county IN ('Broward', 'Palm Beach')),
  parcel_id text NOT NULL,
  sale_month_key text NOT NULL DEFAULT '',
  sale_date date,
  beds numeric,
  full_baths smallint,
  half_baths smallint,
  condition text NOT NULL DEFAULT 'unknown'
    CHECK (condition IN ('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'as_is', 'original', 'updated', 'fully_renovated', 'unknown')),
  kitchen_baths_updated boolean,
  roof_type text
    CHECK (roof_type IS NULL OR roof_type IN ('shingle', 'barrel_tile', 'metal', 'flat', 'unknown')),
  roof_year int,
  windows text
    CHECK (windows IS NULL OR windows IN ('impact', 'shutters', 'none', 'unknown')),
  pool_type text
    CHECK (pool_type IS NULL OR pool_type IN ('none', 'standard', 'resort', 'unknown')),
  screen_enclosure boolean,
  garage_type text
    CHECK (garage_type IS NULL OR garage_type IN ('none', 'garage', 'carport', 'converted', 'unknown')),
  garage_bays smallint,
  waterfront_view text
    CHECK (waterfront_view IS NULL OR waterfront_view IN ('dry_lot', 'lake', 'golf', 'canal_fixed_bridge', 'ocean_access', 'unknown')),
  notes text,
  source text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comp_details_owner_sale_unique UNIQUE (owner_email, county, parcel_id, sale_month_key)
);

CREATE INDEX IF NOT EXISTS idx_comp_details_owner_parcel
  ON comp_details (lower(owner_email), county, parcel_id);

-- 3. Expand investor_comps columns and UAD C1–C6 condition CHECK constraint
ALTER TABLE investor_comps
  ADD COLUMN IF NOT EXISTS parcel_id text,
  ADD COLUMN IF NOT EXISTS parcel_county text,
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS pool boolean,
  ADD COLUMN IF NOT EXISTS garage boolean,
  ADD COLUMN IF NOT EXISTS waterfront boolean,
  ADD COLUMN IF NOT EXISTS lot_sqft int,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS adjustments jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS comp_details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_outlier boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'investor_comps'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%condition%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%c1%'
  LOOP
    EXECUTE format('ALTER TABLE investor_comps DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'investor_comps'
      AND c.conname = 'investor_comps_condition_check'
  ) THEN
    ALTER TABLE investor_comps
      ADD CONSTRAINT investor_comps_condition_check
      CHECK (condition IN ('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'as_is', 'original', 'updated', 'fully_renovated', 'unknown'));
  END IF;
END $$;

-- 4. Subject property structured details (as_is & after_rehab) on investor_properties
ALTER TABLE investor_properties
  ADD COLUMN IF NOT EXISTS pool boolean,
  ADD COLUMN IF NOT EXISTS garage boolean,
  ADD COLUMN IF NOT EXISTS waterfront boolean,
  ADD COLUMN IF NOT EXISTS subject_details jsonb NOT NULL DEFAULT '{}'::jsonb;

