-- Migration: Tax Calendar V2
-- Description: Add dynamic table structure for tax calendar with JSONB columns
-- Author: System
-- Date: 2026-01-28

-- ============================================================================
-- 1. Create tax_calendar_tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_calendar_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  jurisdiction TEXT NOT NULL,
  tax_type TEXT NOT NULL,
  title TEXT NOT NULL,
  table_order INTEGER NOT NULL DEFAULT 0,
  columns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. Create tax_calendar_rows
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_calendar_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES tax_calendar_tables(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  period_label TEXT NOT NULL,
  deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  row_order INTEGER NOT NULL DEFAULT 0,
  fields_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT tax_calendar_rows_status_check CHECK (status IN ('open', 'pending', 'in_progress', 'done', 'overdue', 'not_applicable'))
);

-- ============================================================================
-- 3. Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tax_calendar_tables_client_jurisdiction_type 
  ON tax_calendar_tables(client_id, jurisdiction, tax_type);

CREATE INDEX IF NOT EXISTS idx_tax_calendar_tables_client_order 
  ON tax_calendar_tables(client_id, table_order);

CREATE INDEX IF NOT EXISTS idx_tax_calendar_rows_client_table_deadline 
  ON tax_calendar_rows(client_id, table_id, deadline);

CREATE INDEX IF NOT EXISTS idx_tax_calendar_rows_client_status 
  ON tax_calendar_rows(client_id, status);

CREATE INDEX IF NOT EXISTS idx_tax_calendar_rows_client_deadline 
  ON tax_calendar_rows(client_id, deadline);

CREATE INDEX IF NOT EXISTS idx_tax_calendar_rows_table_id 
  ON tax_calendar_rows(table_id);

-- Optional unique constraint for preventing duplicates
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_calendar_rows_unique_entry 
--   ON tax_calendar_rows(client_id, table_id, entity_name, period_label, deadline);

-- ============================================================================
-- 4. Create VIEW: tax_calendar_entries_v2
-- ============================================================================
CREATE OR REPLACE VIEW tax_calendar_entries_v2 AS
SELECT 
  r.id AS row_id,
  r.client_id,
  r.table_id,
  t.jurisdiction,
  t.tax_type,
  t.title,
  t.table_order,
  t.columns_json,
  r.entity_name,
  r.period_label,
  r.deadline,
  r.status,
  r.row_order,
  r.fields_json,
  r.created_at AS row_created_at,
  r.updated_at AS row_updated_at,
  t.created_at AS table_created_at,
  t.updated_at AS table_updated_at
FROM tax_calendar_rows r
INNER JOIN tax_calendar_tables t ON r.table_id = t.id;

-- ============================================================================
-- 5. Enable RLS
-- ============================================================================
ALTER TABLE tax_calendar_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_calendar_rows ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. RLS Policies for tax_calendar_tables
-- ============================================================================

-- Client users can only SELECT their own client's data
CREATE POLICY tax_calendar_tables_client_select ON tax_calendar_tables
  FOR SELECT
  TO authenticated
  USING (
    client_id::text = COALESCE(
      auth.jwt() ->> 'client_id',
      (SELECT client_id::text FROM app_users WHERE id = auth.uid())
    )
  );

-- Service role (admin) has full access
CREATE POLICY tax_calendar_tables_admin_all ON tax_calendar_tables
  FOR ALL
  TO authenticated
  USING (
    COALESCE(auth.jwt() ->> 'role', '') = 'admin'
  )
  WITH CHECK (
    COALESCE(auth.jwt() ->> 'role', '') = 'admin'
  );

-- ============================================================================
-- 7. RLS Policies for tax_calendar_rows
-- ============================================================================

-- Client users can only SELECT their own client's data
CREATE POLICY tax_calendar_rows_client_select ON tax_calendar_rows
  FOR SELECT
  TO authenticated
  USING (
    client_id::text = COALESCE(
      auth.jwt() ->> 'client_id',
      (SELECT client_id::text FROM app_users WHERE id = auth.uid())
    )
  );

-- Service role (admin) has full access
CREATE POLICY tax_calendar_rows_admin_all ON tax_calendar_rows
  FOR ALL
  TO authenticated
  USING (
    COALESCE(auth.jwt() ->> 'role', '') = 'admin'
  )
  WITH CHECK (
    COALESCE(auth.jwt() ->> 'role', '') = 'admin'
  );

-- ============================================================================
-- 8. RPC Function: tax_calendar_replace_import
-- ============================================================================
CREATE OR REPLACE FUNCTION tax_calendar_replace_import(
  p_client_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table JSONB;
  v_row JSONB;
  v_table_id UUID;
  v_tables_count INTEGER := 0;
  v_rows_count INTEGER := 0;
BEGIN
  -- Validate client exists
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Client not found: %', p_client_id;
  END IF;

  -- Validate payload structure
  IF p_payload IS NULL OR p_payload -> 'tables' IS NULL THEN
    RAISE EXCEPTION 'Invalid payload: missing tables array';
  END IF;

  -- Start transaction (implicit in function)
  -- Step 1: Delete existing rows (cascade will handle this, but explicit for clarity)
  DELETE FROM tax_calendar_rows WHERE client_id = p_client_id;
  
  -- Step 2: Delete existing tables
  DELETE FROM tax_calendar_tables WHERE client_id = p_client_id;

  -- Step 3: Insert new tables and rows
  FOR v_table IN SELECT * FROM jsonb_array_elements(p_payload -> 'tables')
  LOOP
    -- Insert table
    INSERT INTO tax_calendar_tables (
      client_id,
      jurisdiction,
      tax_type,
      title,
      table_order,
      columns_json
    ) VALUES (
      p_client_id,
      v_table ->> 'jurisdiction',
      v_table ->> 'tax_type',
      v_table ->> 'title',
      COALESCE((v_table ->> 'table_order')::integer, 0),
      COALESCE(v_table -> 'columns', '[]'::jsonb)
    )
    RETURNING id INTO v_table_id;
    
    v_tables_count := v_tables_count + 1;

    -- Insert rows for this table
    IF v_table -> 'rows' IS NOT NULL THEN
      FOR v_row IN SELECT * FROM jsonb_array_elements(v_table -> 'rows')
      LOOP
        INSERT INTO tax_calendar_rows (
          client_id,
          table_id,
          entity_name,
          period_label,
          deadline,
          status,
          row_order,
          fields_json
        ) VALUES (
          p_client_id,
          v_table_id,
          v_row ->> 'entity_name',
          v_row ->> 'period_label',
          (v_row ->> 'deadline')::date,
          COALESCE(v_row ->> 'status', 'pending'),
          COALESCE((v_row ->> 'row_order')::integer, 0),
          COALESCE(v_row -> 'fields', '{}'::jsonb)
        );
        
        v_rows_count := v_rows_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  -- Return summary
  RETURN jsonb_build_object(
    'success', true,
    'tables_count', v_tables_count,
    'rows_count', v_rows_count,
    'client_id', p_client_id
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION tax_calendar_replace_import(UUID, JSONB) TO authenticated;

-- ============================================================================
-- 9. Add updated_at trigger for tax_calendar_tables
-- ============================================================================
CREATE OR REPLACE FUNCTION update_tax_calendar_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_calendar_tables_updated_at
  BEFORE UPDATE ON tax_calendar_tables
  FOR EACH ROW
  EXECUTE FUNCTION update_tax_calendar_tables_updated_at();

-- ============================================================================
-- 10. Add updated_at trigger for tax_calendar_rows
-- ============================================================================
CREATE OR REPLACE FUNCTION update_tax_calendar_rows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_calendar_rows_updated_at
  BEFORE UPDATE ON tax_calendar_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_tax_calendar_rows_updated_at();

-- ============================================================================
-- Migration complete
-- ============================================================================
