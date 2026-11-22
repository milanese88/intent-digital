-- Migration: add_opportunity_map_and_redfin.sql
-- Description: Adds Redfin ZIP-level market velocity tracking and Opportunity Map materialized view.
-- Strictly non-PII, idempotent, zero test rows.

CREATE TABLE IF NOT EXISTS redfin_zip_market (
  id BIGSERIAL PRIMARY KEY,
  zip VARCHAR(5) NOT NULL,
  period_end DATE NOT NULL,
  property_type VARCHAR(64) NOT NULL DEFAULT 'All Residential',
  median_dom NUMERIC,
  median_sale_price NUMERIC,
  median_list_price NUMERIC,
  homes_sold INT,
  inventory INT,
  months_of_supply NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_redfin_zip_market UNIQUE (zip, period_end, property_type)
);

CREATE INDEX IF NOT EXISTS idx_redfin_zip_market_lookup
  ON redfin_zip_market (zip, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_redfin_zip_market_dom
  ON redfin_zip_market (zip, property_type, period_end DESC)
  WHERE median_dom IS NOT NULL;
