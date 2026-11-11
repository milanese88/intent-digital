-- Migration: Add investor_property_documents table for saved deal reports & property PDFs
CREATE TABLE IF NOT EXISTS investor_property_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  property_id uuid NOT NULL REFERENCES investor_properties(id) ON DELETE CASCADE,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'deal_report',
  blob_url text NOT NULL,
  file_size int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investor_property_documents_prop 
  ON investor_property_documents (property_id, created_at DESC);
