-- ==============================================================================
-- Migration: Add Pinterest boards and Room pins tables
-- Created: 2026-11-10
-- Updated: 2026-11-11 (Added board section support via 'kind' column)
-- Description: Supports Pinterest inspiration boards and sections in Designer Hub
--              and Room-level pin mood boards in Design Studio.
-- ==============================================================================

-- 1. Table: pinterest_boards (Designer Hub Inspiration tab)
CREATE TABLE IF NOT EXISTS pinterest_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  board_url text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'board' CHECK (kind IN ('board', 'section')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- For existing tables that were created without the kind column:
ALTER TABLE pinterest_boards ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'board' CHECK (kind IN ('board', 'section'));

CREATE INDEX IF NOT EXISTS idx_pinterest_boards_owner 
  ON pinterest_boards (lower(owner_email), sort_order ASC, created_at DESC);

-- 2. Table: room_pins (Design Studio room mood boards)
-- Deleting a room automatically cascades and deletes its pins.
CREATE TABLE IF NOT EXISTS room_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES design_rooms(id) ON DELETE CASCADE,
  owner_email text NOT NULL,
  pin_url text NOT NULL,
  pin_id text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_pins_room_owner 
  ON room_pins (room_id, lower(owner_email), created_at ASC);
