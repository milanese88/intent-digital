-- Migration: Add learning_progress table for tracking Learning Lab activity
CREATE TABLE IF NOT EXISTS learning_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  activity text NOT NULL CHECK (activity IN ('deal', 'term', 'principle', 'guess')),
  item_key text NOT NULL,
  answer text,
  correct boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast streak calculation and monthly activity aggregates
CREATE INDEX IF NOT EXISTS idx_learning_progress_owner_date 
  ON learning_progress (lower(owner_email), created_at DESC);
