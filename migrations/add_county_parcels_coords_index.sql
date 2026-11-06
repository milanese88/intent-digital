-- ============================================================================
-- Migration: add_county_parcels_coords_index.sql
-- Description: Composite index on county_parcels (county, lat, lng) for fast bounding-box radius queries
-- Target: Neon PostgreSQL
-- Safe to execute repeatedly (CREATE INDEX IF NOT EXISTS)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_county_parcels_coords
  ON county_parcels (county, lat, lng);
