-- Replace Tax Risk Matrix with Excel-based cell range model
-- Drop the topic×dimension model and replace with section-based cell storage

-- Drop existing tables from 20260106 migration
DROP TABLE IF EXISTS tax_risk_matrix_cells CASCADE;
DROP TABLE IF EXISTS tax_risk_dimensions CASCADE;
DROP TABLE IF EXISTS tax_risk_topics CASCADE;

-- Drop old tax_risk_matrix_entries table if it exists (from 20250101_init.sql)
DROP TABLE IF EXISTS tax_risk_matrix_entries CASCADE;

-- Create new tax_risk_matrix_entries table for Excel-based cell ranges
CREATE TABLE public.tax_risk_matrix_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('B3:E8', 'J14:N14')),
  row_index INTEGER NOT NULL CHECK (row_index >= 0),
  col_index INTEGER NOT NULL CHECK (col_index >= 0),
  value_text TEXT,
  value_number NUMERIC,
  color TEXT NOT NULL DEFAULT 'green' CHECK (color IN ('green', 'orange', 'red', 'none')),
  updated_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, section, row_index, col_index)
);

-- Create indexes for efficient querying
CREATE INDEX idx_tax_risk_matrix_entries_client_section ON public.tax_risk_matrix_entries(client_id, section);
CREATE INDEX idx_tax_risk_matrix_entries_client_id ON public.tax_risk_matrix_entries(client_id);

-- Enable RLS
ALTER TABLE public.tax_risk_matrix_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Client users can view their own matrix entries
CREATE POLICY "tax_risk_matrix_entries_client_select_own"
ON public.tax_risk_matrix_entries
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- RLS Policies: Only admins can modify matrix entries
CREATE POLICY "tax_risk_matrix_entries_admin_full_access"
ON public.tax_risk_matrix_entries
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'admin'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);
