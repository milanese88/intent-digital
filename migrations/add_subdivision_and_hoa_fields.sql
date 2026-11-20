-- ==============================================================================
-- Migration: add_subdivision_and_hoa_fields.sql
-- Description:
--   1. county_parcels: s_legal (DOR NAL short legal description, max 30 chars),
--      subdivision_name (derived from S_LEGAL) and subdivision_code (plat code from
--      the folio/PCN for Palm Beach and Martin). nbrhd_cd / mkt_ar already exist.
--      Nullable, no default -> metadata-only ALTERs (no table rewrite). Values are
--      filled afterwards by scripts/county/backfill-subdivisions.mjs in batches.
--   2. Manual HOA / association name on the subject property, saved comps and the
--      reusable per-sale comp_details.
--   3. comp_details.county CHECK now allows 'Martin' (Martin parcels were imported
--      after this table was created; saving Martin comp details failed with 23514).
-- No owner names, mailing addresses or test rows. 100% idempotent. No new tables.
-- Target: Supabase PostgreSQL
-- ==============================================================================

ALTER TABLE county_parcels ADD COLUMN IF NOT EXISTS s_legal text;
ALTER TABLE county_parcels ADD COLUMN IF NOT EXISTS subdivision_name text;
ALTER TABLE county_parcels ADD COLUMN IF NOT EXISTS subdivision_code text;

ALTER TABLE investor_properties ADD COLUMN IF NOT EXISTS hoa_name text;
ALTER TABLE investor_comps ADD COLUMN IF NOT EXISTS hoa_name text;
ALTER TABLE comp_details ADD COLUMN IF NOT EXISTS hoa_name text;

ALTER TABLE comp_details DROP CONSTRAINT IF EXISTS comp_details_county_check;
ALTER TABLE comp_details ADD CONSTRAINT comp_details_county_check
  CHECK (county IN ('Broward', 'Palm Beach', 'Martin'));

