-- ============================================================================
-- Migration: add_parcel_columns_to_investor.sql
-- Description: Add nullable parcel_id and parcel_county to investor_properties and investor_comps
-- Target: Neon PostgreSQL
-- Safe to execute repeatedly (Additive: ADD COLUMN IF NOT EXISTS)
-- ============================================================================

ALTER TABLE investor_properties 
    ADD COLUMN IF NOT EXISTS parcel_id text,
    ADD COLUMN IF NOT EXISTS parcel_county text;

ALTER TABLE investor_comps 
    ADD COLUMN IF NOT EXISTS parcel_id text,
    ADD COLUMN IF NOT EXISTS parcel_county text;
