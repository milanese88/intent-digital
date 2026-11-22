-- ==============================================================================
-- Migration: drop_redundant_sales_indexes.sql
-- Description:
--   Reclaims ~355 MB of disk space by dropping redundant and 0-scan indexes on
--   county_sales:
--     1. idx_county_sales_parcel_ym (219 MB): 0 scans; covered by idx_county_sales_flip_finder.
--     2. idx_county_sales_county_ym_sell (59 MB): 0 scans.
--     3. idx_county_sales_parcel (77 MB): redundant with uq_county_sales (leading columns county, parcel_id).
--   100% idempotent, zero test rows, zero PII.
-- Target: Supabase PostgreSQL
-- ==============================================================================

DROP INDEX IF EXISTS idx_county_sales_parcel_ym;
DROP INDEX IF EXISTS idx_county_sales_county_ym_sell;
DROP INDEX IF EXISTS idx_county_sales_parcel;

-- Recreate idx_county_sales_flip_finder to include or_book, or_page for zero-sort same-month recording tie breaking
CREATE INDEX IF NOT EXISTS idx_county_sales_flip_finder
  ON county_sales (county, parcel_id, sale_year, sale_month, or_book, or_page, qual_code)
  INCLUDE (sale_price, vi_cd)
  WHERE sale_price >= 1000 AND sale_year IS NOT NULL;
