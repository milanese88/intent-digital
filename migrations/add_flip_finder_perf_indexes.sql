-- ==============================================================================
-- Migration: add_flip_finder_perf_indexes.sql
-- Description:
--   Adds covering indexes on county_sales and county_parcels to keep Flip & Build
--   Finder queries strictly under 1 second even as prior-year SDF / CAMA sales
--   history scales past 1M+ rows:
--     1. idx_county_sales_parcel_ym: (parcel_id, sale_year DESC, sale_month DESC)
--        — schema equivalent of (folio, sale_date) for folio-keyed sales lookups.
--     2. idx_county_sales_county_ym_sell: (county, sale_year DESC, sale_month DESC, parcel_id)
--        — accelerates recent resale / lookback scans and date-range aggregates.
--     3. idx_county_parcels_county_zip_parcel: (county, zip, parcel_id)
--        — enables Index-Only Scan for (county, zip) -> sales joins (zip lives on
--          county_parcels in this schema).
--   100% idempotent (CREATE INDEX IF NOT EXISTS), zero test rows, zero PII.
-- Target: Supabase PostgreSQL
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_county_sales_parcel_ym
  ON county_sales (parcel_id, sale_year DESC, sale_month DESC NULLS LAST)
  INCLUDE (county, sale_price, qual_code, vi_cd)
  WHERE sale_price >= 25000 AND sale_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_county_sales_county_ym_sell
  ON county_sales (county, sale_year DESC, sale_month DESC NULLS LAST, parcel_id)
  INCLUDE (sale_price, qual_code, vi_cd)
  WHERE sale_price >= 50000 AND sale_year IS NOT NULL AND qual_code IN ('01', '02', '03');

CREATE INDEX IF NOT EXISTS idx_county_parcels_county_zip_parcel
  ON county_parcels (county, zip, parcel_id);
