-- ==============================================================================
-- Migration: add_property_permits.sql
-- Description:
--   Creates owner-scoped property_permits table for storing building permits
--   (manual entries and open data from City of Fort Lauderdale, etc.).
--   RLS enabled, zero PII (strictly no owner/applicant names or mailing addresses),
--   zero test rows.
-- Target: Supabase PostgreSQL (100% idempotent)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS property_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  property_id uuid REFERENCES investor_properties(id) ON DELETE SET NULL,
  county text NOT NULL DEFAULT 'Broward',
  folio text,
  permit_number text,
  permit_type text NOT NULL CHECK (permit_type IN ('demolition', 'new_build', 'addition', 'remodel', 'pool', 'roof', 'mep', 'other')),
  issue_date date NOT NULL,
  final_date date,
  job_value numeric(14, 2),
  status text NOT NULL DEFAULT 'completed',
  description text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_permits_owner_property
  ON property_permits (lower(owner_email), property_id)
  WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_permits_owner_folio
  ON property_permits (lower(owner_email), folio)
  WHERE folio IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_permits_issue_date
  ON property_permits (issue_date DESC NULLS LAST);

ALTER TABLE property_permits ENABLE ROW LEVEL SECURITY;

