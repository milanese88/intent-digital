-- Migration: Add Stage 3 Budget & Costs columns
-- 1. design_items: paid, due_date, invoice_url
ALTER TABLE design_items
  ADD COLUMN IF NOT EXISTS paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS invoice_url text;

-- 2. investor_properties: rehab_budget, rehab_budget_source, rehab_budget_updated_at
ALTER TABLE investor_properties
  ADD COLUMN IF NOT EXISTS rehab_budget numeric,
  ADD COLUMN IF NOT EXISTS rehab_budget_source text,
  ADD COLUMN IF NOT EXISTS rehab_budget_updated_at timestamptz;
