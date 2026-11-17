-- ==============================================================================
-- Migration: add_newsletter_subscribers.sql
-- Description: Stores public homepage newsletter signups for Florencia Nuñez.
-- Strictly schema-only (NO test rows). 100% idempotent (IF NOT EXISTS).
-- Target: Neon PostgreSQL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  consent_text text NOT NULL,
  unsubscribed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_lower
  ON newsletter_subscribers (lower(email));
