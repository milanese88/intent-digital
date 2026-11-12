-- ==============================================================================
-- Migration: add_valuation_and_backtest.sql
-- Description: Rigorous valuation attributes, profile adjustment defaults,
--              per-property Before-You-Offer checklist, and back-test results table.
--              Does NOT modify county_sales or county_parcels.
-- Target: Neon PostgreSQL (idempotent)
-- ==============================================================================

-- 1. Comp condition, physical attributes, notes & per-comp adjustment overrides
ALTER TABLE investor_comps
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'unknown'
    CHECK (condition IN ('as_is', 'updated', 'fully_renovated', 'unknown')),
  ADD COLUMN IF NOT EXISTS beds numeric,
  ADD COLUMN IF NOT EXISTS baths numeric,
  ADD COLUMN IF NOT EXISTS pool boolean,
  ADD COLUMN IF NOT EXISTS garage boolean,
  ADD COLUMN IF NOT EXISTS waterfront boolean,
  ADD COLUMN IF NOT EXISTS lot_sqft int,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS adjustments jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_investor_comps_prop_cond
  ON investor_comps (property_id, condition, included);

-- 2. Subject property attributes (for adjustment grid parity) & Before-You-Offer checklist
ALTER TABLE investor_properties
  ADD COLUMN IF NOT EXISTS pool boolean,
  ADD COLUMN IF NOT EXISTS garage boolean,
  ADD COLUMN IF NOT EXISTS waterfront boolean,
  ADD COLUMN IF NOT EXISTS before_offer_checklist jsonb NOT NULL DEFAULT '{
    "walkthrough_done": false,
    "agent_cma_received": false,
    "renovated_comps_verified": false,
    "contractor_bid_received": false,
    "lender_appraisal_ordered": false
  }'::jsonb;

-- 3. Investor profile valuation adjustment defaults
CREATE TABLE IF NOT EXISTS investor_profile (
  owner_email text PRIMARY KEY,
  credit_tier text NOT NULL CHECK (credit_tier IN ('760+','740-759','720-739','700-719','680-699','660-679','640-659','below 640')),
  liquid_cash numeric NOT NULL DEFAULT 0,
  reserve_months int NOT NULL DEFAULT 6,
  rate_sheet jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE investor_profile
  ADD COLUMN IF NOT EXISTS valuation_defaults jsonb NOT NULL DEFAULT '{
    "sizeFactor": 0.5,
    "bedAdjustment": 10000,
    "bathAdjustment": 7500,
    "poolAdjustment": 25000,
    "garageAdjustment": 10000,
    "waterfrontAdjustment": 50000,
    "lotSqftAdjustment": 5,
    "ageAdjustmentPerYear": 1000
  }'::jsonb;

-- 4. Small read-only back-test summary table (no writes to county_sales / county_parcels)
CREATE TABLE IF NOT EXISTS valuation_backtest_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_size int NOT NULL,
  evaluated_count int NOT NULL,
  window_months int NOT NULL DEFAULT 12,
  median_ape numeric NOT NULL,
  pct_within_5 numeric NOT NULL,
  pct_within_10 numeric NOT NULL,
  by_zip jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_price_band jsonb NOT NULL DEFAULT '{}'::jsonb,
  roll_freshness jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by text NOT NULL DEFAULT 'manual',
  run_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_valuation_backtest_run_at
  ON valuation_backtest_results (run_at DESC);
