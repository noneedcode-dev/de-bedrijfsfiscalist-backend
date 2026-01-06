-- Tax Risk Matrix Tables
-- Topics: categories for risk assessment (e.g., VAT, Corporate Tax, etc.)
CREATE TABLE IF NOT EXISTS tax_risk_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX idx_tax_risk_topics_client_id ON tax_risk_topics(client_id);

-- Dimensions: aspects to assess for each topic (e.g., Compliance, Reporting, etc.)
CREATE TABLE IF NOT EXISTS tax_risk_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX idx_tax_risk_dimensions_client_id ON tax_risk_dimensions(client_id);

-- Matrix Cells: intersection of topic and dimension with risk assessment
CREATE TABLE IF NOT EXISTS tax_risk_matrix_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES tax_risk_topics(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES tax_risk_dimensions(id) ON DELETE CASCADE,
  likelihood INTEGER NOT NULL DEFAULT 1 CHECK (likelihood >= 1 AND likelihood <= 5),
  impact INTEGER NOT NULL DEFAULT 1 CHECK (impact >= 1 AND impact <= 5),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  notes TEXT,
  owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, topic_id, dimension_id)
);

CREATE INDEX idx_tax_risk_matrix_cells_client_id ON tax_risk_matrix_cells(client_id);
CREATE INDEX idx_tax_risk_matrix_cells_status ON tax_risk_matrix_cells(status);
CREATE INDEX idx_tax_risk_matrix_cells_topic_id ON tax_risk_matrix_cells(topic_id);
CREATE INDEX idx_tax_risk_matrix_cells_dimension_id ON tax_risk_matrix_cells(dimension_id);

-- RLS Policies for tax_risk_topics
ALTER TABLE tax_risk_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view topics for their clients"
  ON tax_risk_topics FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert topics for their clients"
  ON tax_risk_topics FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update topics for their clients"
  ON tax_risk_topics FOR UPDATE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete topics for their clients"
  ON tax_risk_topics FOR DELETE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

-- RLS Policies for tax_risk_dimensions
ALTER TABLE tax_risk_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dimensions for their clients"
  ON tax_risk_dimensions FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert dimensions for their clients"
  ON tax_risk_dimensions FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update dimensions for their clients"
  ON tax_risk_dimensions FOR UPDATE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete dimensions for their clients"
  ON tax_risk_dimensions FOR DELETE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

-- RLS Policies for tax_risk_matrix_cells
ALTER TABLE tax_risk_matrix_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view matrix cells for their clients"
  ON tax_risk_matrix_cells FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert matrix cells for their clients"
  ON tax_risk_matrix_cells FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update matrix cells for their clients"
  ON tax_risk_matrix_cells FOR UPDATE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete matrix cells for their clients"
  ON tax_risk_matrix_cells FOR DELETE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );
