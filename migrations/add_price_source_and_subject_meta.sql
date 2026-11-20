-- ==============================================================================
-- Migration: add_price_source_and_subject_meta.sql
-- Description:
--   Adds nullable price_source, offer_price ("My offer"), and construction_detail
--   (e.g. "Wood frame / Hardi-plank") columns to investor_properties.
--   Nullable, no default -> metadata-only ALTER (no table rewrite).
--   No owner names, mailing addresses, new tables, or test rows. 100% idempotent.
-- Target: Supabase PostgreSQL
-- ==============================================================================

ALTER TABLE investor_properties
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS offer_price numeric,
  ADD COLUMN IF NOT EXISTS construction_detail text;

