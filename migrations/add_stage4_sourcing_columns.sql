-- Migration: Add Stage 4 Sourcing Library columns
-- 1. design_items: add trade_id referencing design_trades(id)
ALTER TABLE design_items
  ADD COLUMN IF NOT EXISTS trade_id uuid NULL REFERENCES design_trades(id) ON DELETE SET NULL;

-- 2. design_products: add favorite (boolean) and room_types (text[])
ALTER TABLE design_products
  ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS room_types text[] NOT NULL DEFAULT '{}';

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_design_items_trade_id ON design_items(trade_id);
CREATE INDEX IF NOT EXISTS idx_design_products_favorite ON design_products(favorite);
