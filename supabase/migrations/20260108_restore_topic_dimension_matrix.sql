-- Restore Topic×Dimension Tax Risk Matrix Model
-- Replace Excel-based cell range model with proper topic×dimension structure

-- Drop existing Excel-based table
DROP TABLE IF EXISTS tax_risk_matrix_entries CASCADE;

-- Create tax_risk_topics table
CREATE TABLE public.tax_risk_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX idx_tax_risk_topics_client_id ON public.tax_risk_topics(client_id);

-- Create tax_risk_dimensions table
CREATE TABLE public.tax_risk_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX idx_tax_risk_dimensions_client_id ON public.tax_risk_dimensions(client_id);

-- Create tax_risk_matrix_cells table
CREATE TABLE public.tax_risk_matrix_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.tax_risk_topics(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES public.tax_risk_dimensions(id) ON DELETE CASCADE,
  likelihood INTEGER NOT NULL DEFAULT 1 CHECK (likelihood >= 1 AND likelihood <= 5),
  impact INTEGER NOT NULL DEFAULT 1 CHECK (impact >= 1 AND impact <= 5),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  notes TEXT,
  owner_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, topic_id, dimension_id)
);

CREATE INDEX idx_tax_risk_matrix_cells_client_id ON public.tax_risk_matrix_cells(client_id);
CREATE INDEX idx_tax_risk_matrix_cells_client_status ON public.tax_risk_matrix_cells(client_id, status);
CREATE INDEX idx_tax_risk_matrix_cells_topic_id ON public.tax_risk_matrix_cells(topic_id);
CREATE INDEX idx_tax_risk_matrix_cells_dimension_id ON public.tax_risk_matrix_cells(dimension_id);

-- Enable RLS on tax_risk_topics
ALTER TABLE public.tax_risk_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_risk_topics_client_select_own"
ON public.tax_risk_topics
FOR SELECT
USING (
  public.is_client() AND client_id = public.current_client_id()
);

CREATE POLICY "tax_risk_topics_admin_full_access"
ON public.tax_risk_topics
FOR ALL
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

-- Enable RLS on tax_risk_dimensions
ALTER TABLE public.tax_risk_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_risk_dimensions_client_select_own"
ON public.tax_risk_dimensions
FOR SELECT
USING (
  public.is_client() AND client_id = public.current_client_id()
);

CREATE POLICY "tax_risk_dimensions_admin_full_access"
ON public.tax_risk_dimensions
FOR ALL
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

-- Enable RLS on tax_risk_matrix_cells
ALTER TABLE public.tax_risk_matrix_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_risk_matrix_cells_client_select_own"
ON public.tax_risk_matrix_cells
FOR SELECT
USING (
  public.is_client() AND client_id = public.current_client_id()
);

CREATE POLICY "tax_risk_matrix_cells_admin_full_access"
ON public.tax_risk_matrix_cells
FOR ALL
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);
