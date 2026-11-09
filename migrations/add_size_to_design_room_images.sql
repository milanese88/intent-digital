-- ============================================================================
-- Migration: add_size_to_design_room_images.sql
-- Description: Add size column to design_room_images ('small' default, 'wide', 'large')
-- Target: Neon PostgreSQL
-- Safe to execute repeatedly (Additive: ADD COLUMN IF NOT EXISTS)
-- ============================================================================

ALTER TABLE design_room_images 
  ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT 'small';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'design_room_images_size_check'
  ) THEN
    ALTER TABLE design_room_images
      ADD CONSTRAINT design_room_images_size_check CHECK (size IN ('small', 'wide', 'large'));
  END IF;
END $$;
