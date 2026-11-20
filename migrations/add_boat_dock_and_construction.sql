-- ==============================================================================
-- Migration: add_boat_dock_and_construction.sql
-- Description:
--   Adds Boat dock (Y/N + square footage) and Construction type
--   (cbs / wood_frame / other / unknown) columns to investor_properties,
--   investor_comps, and reusable per-sale comp_details.
--   Nullable, no default -> metadata-only ALTERs (no table rewrite).
--   No owner names, mailing addresses, new tables, or test rows. 100% idempotent.
-- Target: Supabase PostgreSQL
-- ==============================================================================

ALTER TABLE investor_properties
  ADD COLUMN IF NOT EXISTS boat_dock boolean,
  ADD COLUMN IF NOT EXISTS boat_dock_sqft int,
  ADD COLUMN IF NOT EXISTS construction_type text;

ALTER TABLE investor_comps
  ADD COLUMN IF NOT EXISTS boat_dock boolean,
  ADD COLUMN IF NOT EXISTS boat_dock_sqft int,
  ADD COLUMN IF NOT EXISTS construction_type text;

ALTER TABLE comp_details
  ADD COLUMN IF NOT EXISTS boat_dock boolean,
  ADD COLUMN IF NOT EXISTS boat_dock_sqft int,
  ADD COLUMN IF NOT EXISTS construction_type text;

