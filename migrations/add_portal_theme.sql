-- ==============================================================================
-- Migration: Add Portal Theme and Presets tables
-- Created: 2026-11-11
-- Description: Customization of Owner Portal appearance (colors, typography,
--              presets, and optional sign-in screen styling).
-- ==============================================================================

-- 1. Table: portal_theme (Active theme per owner)
CREATE TABLE IF NOT EXISTS portal_theme (
  owner_email text PRIMARY KEY,
  colors jsonb NOT NULL,
  fonts jsonb NOT NULL,
  apply_to_login boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- 2. Table: portal_theme_presets (Saved theme presets per owner)
CREATE TABLE IF NOT EXISTS portal_theme_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  name text NOT NULL,
  colors jsonb NOT NULL,
  fonts jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_theme_presets_owner 
  ON portal_theme_presets (lower(owner_email), created_at DESC);
