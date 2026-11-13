-- ==============================================================================
-- Migration: add_live_in_fha_strategy.sql
-- Description: Support "Live-in plan (FHA)" ('live_in') strategy in Investor Studio,
--              optional HOA fields on investor_properties for Live-in fit checks,
--              and editable FHA/financing overrides on investor_profile.
--              Strictly schema-only (NO test rows).
-- Target: Neon PostgreSQL (idempotent)
-- ==============================================================================

-- 1. Expand investor_properties.strategy CHECK constraint to include 'live_in'
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'investor_properties'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%strategy%'
  LOOP
    EXECUTE format('ALTER TABLE investor_properties DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE investor_properties
  ADD CONSTRAINT investor_properties_strategy_check
  CHECK (strategy IS NULL OR strategy IN ('rental', 'flip', 'brrrr', 'live_in'));

-- 2. Expand investor_analyses.strategy CHECK constraint to include 'live_in'
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'investor_analyses'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%strategy%'
  LOOP
    EXECUTE format('ALTER TABLE investor_analyses DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE investor_analyses
  ADD CONSTRAINT investor_analyses_strategy_check
  CHECK (strategy IN ('rental', 'flip', 'brrrr', 'live_in'));

-- 3. Add optional HOA columns on investor_properties for "Live-in fit" HOA rental checks
ALTER TABLE investor_properties
  ADD COLUMN IF NOT EXISTS has_hoa boolean,
  ADD COLUMN IF NOT EXISTS hoa_monthly numeric;

-- 4. Add financing_overrides JSONB column on investor_profile for user-editable FHA limits & rates
ALTER TABLE investor_profile
  ADD COLUMN IF NOT EXISTS financing_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

