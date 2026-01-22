-- Migration: Add document_exports table for ZIP export functionality
-- Created: 2026-01-22

-- Create document_exports table
CREATE TABLE IF NOT EXISTS document_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  document_ids JSONB NOT NULL,
  storage_key TEXT NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_document_exports_client_id ON document_exports(client_id);
CREATE INDEX idx_document_exports_status ON document_exports(status);
CREATE INDEX idx_document_exports_created_at ON document_exports(created_at DESC);

-- Add RLS policies
ALTER TABLE document_exports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view exports for their client
CREATE POLICY "Users can view exports for their client"
  ON document_exports
  FOR SELECT
  USING (
    client_id IN (
      SELECT client_id 
      FROM app_users 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create exports for their client
CREATE POLICY "Users can create exports for their client"
  ON document_exports
  FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id 
      FROM app_users 
      WHERE user_id = auth.uid()
    )
  );

-- Add comment
COMMENT ON TABLE document_exports IS 'Tracks document export requests for ZIP downloads';
