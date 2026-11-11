-- ==============================================================================
-- Migration: Add normalized address columns and btree index to county_parcels
-- Created: 2026-11-11
-- Description: Instant (<10ms) exact and prefix lookup for county parcels
--              supporting Investor Studio "Find county record".
-- ==============================================================================

-- 1. Add normalized columns for house number and street
ALTER TABLE county_parcels ADD COLUMN IF NOT EXISTS situs_number text;
ALTER TABLE county_parcels ADD COLUMN IF NOT EXISTS situs_street_norm text;

-- 2. B-Tree lookup index on (county, situs_number, situs_street_norm)
CREATE INDEX IF NOT EXISTS idx_county_parcels_norm_lookup 
  ON county_parcels (county, situs_number, situs_street_norm);
