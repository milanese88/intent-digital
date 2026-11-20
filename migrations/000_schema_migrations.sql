-- ==============================================================================
-- Migration: 000_schema_migrations.sql
-- Description: Tracks applied migration filenames and timestamps so pending
--              migrations can be checked via scripts/db/check.mjs and applied
--              in deterministic order via scripts/db/migrate.mjs.
-- Strictly schema-only (NO test rows). 100% idempotent (IF NOT EXISTS).
-- Target: Supabase PostgreSQL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

