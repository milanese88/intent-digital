-- ==============================================================================
-- Migration: add_deal_breakdowns.sql
-- Description:
--   1. Creates owner-scoped deal_breakdowns table for saving Flip and
--      Demo -> New Build reverse-engineering analyses (RLS enabled, zero PII,
--      zero test rows).
--   2. Adds a partial covering index on county_sales to accelerate same-folio
--      Flip & Build Finder pair queries under 2 seconds (read-only on county data).
-- Target: Supabase PostgreSQL (100% idempotent)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS deal_breakdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  property_id uuid REFERENCES investor_properties(id) ON DELETE SET NULL,
  county text NOT NULL,
  parcel_id text,
  address text NOT NULL,
  city text,
  zip text,
  deal_type text NOT NULL CHECK (deal_type IN ('flip', 'demo_new_build')),
  title text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_breakdowns_owner_updated
  ON deal_breakdowns (lower(owner_email), updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_deal_breakdowns_owner_property
  ON deal_breakdowns (lower(owner_email), property_id)
  WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deal_breakdowns_owner_parcel
  ON deal_breakdowns (lower(owner_email), county, parcel_id)
  WHERE parcel_id IS NOT NULL;

ALTER TABLE deal_breakdowns ENABLE ROW LEVEL SECURITY;

-- Partial covering index for Flip & Build Finder (<2s same-folio sales pair scans)
CREATE INDEX IF NOT EXISTS idx_county_sales_flip_finder
  ON county_sales (county, parcel_id, sale_year, sale_month, qual_code)
  INCLUDE (sale_price, vi_cd)
  WHERE sale_price >= 25000 AND sale_year IS NOT NULL;

