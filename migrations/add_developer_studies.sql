-- ==============================================================================
-- Migration: add_developer_studies.sql
-- Description:
--   Developer studies: owner-scoped reports that group Flip & Build Finder deals
--   under one developer / builder (name + the companies they buy through).
--   1. developer_studies       – one row per study (developer name, companies, notes)
--   2. developer_study_deals   – deals added from the Finder (row snapshot + overrides)
--   RLS enabled, no access for anon/authenticated (API uses the service connection),
--   zero test rows.
-- Target: Supabase PostgreSQL (100% idempotent)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS developer_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  name text NOT NULL,
  companies text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_developer_studies_owner_updated
  ON developer_studies (lower(owner_email), updated_at DESC);

CREATE TABLE IF NOT EXISTS developer_study_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES developer_studies(id) ON DELETE CASCADE,
  owner_email text NOT NULL,
  county text NOT NULL,
  parcel_id text NOT NULL,
  buy_ym int,
  sell_ym int,
  deal_type text,
  address text,
  zip text,
  row_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_cost_override numeric(14, 2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_developer_study_deal UNIQUE (study_id, county, parcel_id, buy_ym, sell_ym)
);

CREATE INDEX IF NOT EXISTS idx_developer_study_deals_study
  ON developer_study_deals (study_id, sell_ym DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_developer_study_deals_owner
  ON developer_study_deals (lower(owner_email));

ALTER TABLE developer_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_study_deals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON developer_studies FROM anon, authenticated;
REVOKE ALL ON developer_study_deals FROM anon, authenticated;
