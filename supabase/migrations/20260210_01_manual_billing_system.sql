-- Migration: Manual Billing System (Plans + Invoices + Free→Billable)
-- Created: 2026-02-10
-- Description: Implements dynamic plan management, invoice lifecycle, and free→billable time tracking

-- ============================================================================
-- 1. PLAN CONFIGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plan_configs (
  plan_code TEXT PRIMARY KEY CHECK (plan_code IN ('NONE', 'BASIC', 'PRO')),
  display_name TEXT NOT NULL,
  free_minutes_monthly INT NOT NULL CHECK (free_minutes_monthly >= 0),
  hourly_rate_eur DECIMAL(10,2) NOT NULL CHECK (hourly_rate_eur >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.plan_configs IS 'Dynamic plan configuration (no hardcoded limits)';
COMMENT ON COLUMN public.plan_configs.plan_code IS 'Plan identifier: NONE, BASIC, or PRO';
COMMENT ON COLUMN public.plan_configs.free_minutes_monthly IS 'Included free minutes per month';
COMMENT ON COLUMN public.plan_configs.hourly_rate_eur IS 'Hourly rate in EUR for billable time';

-- Initial plan data
INSERT INTO public.plan_configs (plan_code, display_name, free_minutes_monthly, hourly_rate_eur) VALUES
  ('NONE', 'No Plan', 0, 150.00),
  ('BASIC', 'Basic Plan', 240, 150.00),  -- 4 hours
  ('PRO', 'Professional Plan', 540, 150.00) -- 9 hours
ON CONFLICT (plan_code) DO NOTHING;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_plan_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_configs_updated_at_trigger ON public.plan_configs;
CREATE TRIGGER plan_configs_updated_at_trigger
  BEFORE UPDATE ON public.plan_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_plan_configs_updated_at();

-- ============================================================================
-- 2. CLIENT PLANS TABLE (Temporal Data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES public.plan_configs(plan_code),
  effective_from DATE NOT NULL,
  effective_to DATE,
  assigned_by UUID REFERENCES public.app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (effective_from >= CURRENT_DATE - INTERVAL '7 days') -- Max 7 days retroactive
);

COMMENT ON TABLE public.client_plans IS 'Temporal plan assignments with history';
COMMENT ON COLUMN public.client_plans.effective_from IS 'Plan start date';
COMMENT ON COLUMN public.client_plans.effective_to IS 'Plan end date (NULL = active)';

-- Unique constraint: Only one active plan per client
CREATE UNIQUE INDEX idx_client_plans_active_unique 
  ON public.client_plans(client_id) 
  WHERE effective_to IS NULL;

-- Performance indexes
CREATE INDEX idx_client_plans_client_effective 
  ON public.client_plans(client_id, effective_from DESC);

CREATE INDEX idx_client_plans_effective_range 
  ON public.client_plans(client_id, effective_from, effective_to);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_client_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_plans_updated_at_trigger ON public.client_plans;
CREATE TRIGGER client_plans_updated_at_trigger
  BEFORE UPDATE ON public.client_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_plans_updated_at();

-- ============================================================================
-- 3. CLIENT MONTHLY ALLOWANCES TABLE (Ledger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_monthly_allowances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_start DATE NOT NULL, -- First day of month (e.g., 2026-02-01)
  plan_code TEXT NOT NULL REFERENCES public.plan_configs(plan_code),
  free_minutes_total INT NOT NULL CHECK (free_minutes_total >= 0),
  free_minutes_used INT NOT NULL DEFAULT 0 CHECK (free_minutes_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(client_id, period_start),
  CHECK (free_minutes_used <= free_minutes_total)
);

COMMENT ON TABLE public.client_monthly_allowances IS 'Monthly free minutes ledger per client';
COMMENT ON COLUMN public.client_monthly_allowances.period_start IS 'First day of month (YYYY-MM-01)';
COMMENT ON COLUMN public.client_monthly_allowances.free_minutes_used IS 'Consumed free minutes this period';

-- Performance index
CREATE INDEX idx_allowances_client_period 
  ON public.client_monthly_allowances(client_id, period_start DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_allowances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS allowances_updated_at_trigger ON public.client_monthly_allowances;
CREATE TRIGGER allowances_updated_at_trigger
  BEFORE UPDATE ON public.client_monthly_allowances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_allowances_updated_at();

-- ============================================================================
-- 4. INVOICE COUNTERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_invoice_counters (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  last_invoice_number INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.client_invoice_counters IS 'Per-client invoice number sequence';

-- ============================================================================
-- 5. INVOICES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  amount_total DECIMAL(10,2) NOT NULL CHECK (amount_total > 0),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'REVIEW', 'PAID', 'CANCELLED')),
  due_date DATE NOT NULL,
  
  -- Period-based invoice fields (optional)
  period_start DATE,
  period_end DATE,
  billable_minutes_snapshot INT,
  hourly_rate_snapshot DECIMAL(10,2),
  
  -- Document references
  invoice_document_id UUID REFERENCES public.documents(id),
  proof_document_id UUID REFERENCES public.documents(id),
  
  -- Workflow tracking
  created_by UUID REFERENCES public.app_users(id),
  reviewed_by UUID REFERENCES public.app_users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(client_id, invoice_no),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

COMMENT ON TABLE public.invoices IS 'Invoice management with lifecycle tracking';
COMMENT ON COLUMN public.invoices.status IS 'OPEN → REVIEW → PAID/CANCELLED';
COMMENT ON COLUMN public.invoices.invoice_no IS 'Client-scoped invoice number (e.g., INV-2026-0001)';

-- Performance indexes
CREATE INDEX idx_invoices_client_status_created 
  ON public.invoices(client_id, status, created_at DESC);

CREATE INDEX idx_invoices_client_period 
  ON public.invoices(client_id, period_start DESC);

CREATE INDEX idx_invoices_status 
  ON public.invoices(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_updated_at_trigger ON public.invoices;
CREATE TRIGGER invoices_updated_at_trigger
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoices_updated_at();

-- ============================================================================
-- 6. TIME ENTRIES ALTERATIONS
-- ============================================================================

-- Add new columns for free/billable split
ALTER TABLE public.time_entries 
  ADD COLUMN IF NOT EXISTS worked_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS free_minutes_consumed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billable_minutes INT NOT NULL DEFAULT 0;

-- Add constraint: free + billable = total
ALTER TABLE public.time_entries 
  DROP CONSTRAINT IF EXISTS time_entries_minutes_split_valid;

ALTER TABLE public.time_entries 
  ADD CONSTRAINT time_entries_minutes_split_valid 
  CHECK (free_minutes_consumed + billable_minutes = minutes);

-- Backfill worked_at from entry_date (for existing data)
UPDATE public.time_entries 
SET worked_at = entry_date 
WHERE worked_at = CURRENT_DATE AND entry_date != CURRENT_DATE;

-- Performance index
CREATE INDEX IF NOT EXISTS idx_time_entries_client_worked_at 
  ON public.time_entries(client_id, worked_at DESC);

COMMENT ON COLUMN public.time_entries.worked_at IS 'Date work was performed';
COMMENT ON COLUMN public.time_entries.free_minutes_consumed IS 'Minutes consumed from free allowance';
COMMENT ON COLUMN public.time_entries.billable_minutes IS 'Minutes that are billable';

-- ============================================================================
-- 7. RPC FUNCTION: Generate Invoice Number
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_client_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_next_num INT;
  v_year INT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW());
  
  -- Atomic increment
  INSERT INTO public.client_invoice_counters (client_id, last_invoice_number)
  VALUES (p_client_id, 1)
  ON CONFLICT (client_id) DO UPDATE
  SET last_invoice_number = public.client_invoice_counters.last_invoice_number + 1,
      updated_at = NOW()
  RETURNING last_invoice_number INTO v_next_num;
  
  -- Format: INV-2026-0001
  RETURN 'INV-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.generate_invoice_number IS 'Generates unique invoice number per client';

-- ============================================================================
-- 8. RPC FUNCTION: Consume Allowance and Insert Time Entry
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_allowance_and_insert_time_entry(
  p_client_id UUID,
  p_worked_at DATE,
  p_minutes INT,
  p_task TEXT,
  p_advisor_user_id UUID,
  p_source TEXT,
  p_created_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_period_start DATE;
  v_plan_code TEXT;
  v_free_total INT;
  v_allowance_row public.client_monthly_allowances%ROWTYPE;
  v_free_to_consume INT;
  v_billable INT;
  v_time_entry public.time_entries%ROWTYPE;
BEGIN
  -- 1. Compute period start (first day of month)
  v_period_start := DATE_TRUNC('month', p_worked_at)::DATE;
  
  -- 2. Find active plan for worked_at
  SELECT plan_code INTO v_plan_code
  FROM public.client_plans
  WHERE client_id = p_client_id
    AND effective_from <= p_worked_at
    AND (effective_to IS NULL OR effective_to >= p_worked_at)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  -- Default to NONE if no plan found
  v_plan_code := COALESCE(v_plan_code, 'NONE');
  
  -- 3. Get plan config
  SELECT free_minutes_monthly INTO v_free_total
  FROM public.plan_configs
  WHERE plan_code = v_plan_code;
  
  -- 4. Lock allowance row (or create if not exists)
  SELECT * INTO v_allowance_row
  FROM public.client_monthly_allowances
  WHERE client_id = p_client_id AND period_start = v_period_start
  FOR UPDATE; -- CRITICAL: Row-level lock for concurrency safety
  
  IF NOT FOUND THEN
    -- Create new allowance row
    INSERT INTO public.client_monthly_allowances (
      client_id, period_start, plan_code, free_minutes_total, free_minutes_used
    ) VALUES (
      p_client_id, v_period_start, v_plan_code, v_free_total, 0
    )
    RETURNING * INTO v_allowance_row;
  END IF;
  
  -- 5. Compute free vs billable split
  v_free_to_consume := LEAST(
    p_minutes,
    v_allowance_row.free_minutes_total - v_allowance_row.free_minutes_used
  );
  v_free_to_consume := GREATEST(v_free_to_consume, 0);
  v_billable := p_minutes - v_free_to_consume;
  
  -- 6. Update allowance
  UPDATE public.client_monthly_allowances
  SET free_minutes_used = free_minutes_used + v_free_to_consume,
      updated_at = NOW()
  WHERE id = v_allowance_row.id;
  
  -- 7. Insert time entry
  INSERT INTO public.time_entries (
    client_id, advisor_user_id, worked_at, entry_date, minutes,
    free_minutes_consumed, billable_minutes,
    task, is_billable, source, created_by, created_at
  ) VALUES (
    p_client_id, p_advisor_user_id, p_worked_at, p_worked_at, p_minutes,
    v_free_to_consume, v_billable,
    p_task, (v_billable > 0), p_source, p_created_by, NOW()
  )
  RETURNING * INTO v_time_entry;
  
  -- 8. Return result as JSONB
  RETURN jsonb_build_object(
    'time_entry', row_to_json(v_time_entry),
    'allowance_consumed', v_free_to_consume,
    'billable_minutes', v_billable,
    'period_start', v_period_start,
    'plan_code', v_plan_code
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.consume_allowance_and_insert_time_entry IS 'Concurrency-safe time entry creation with free→billable split';

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_monthly_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- plan_configs: Admin full, Client read
DROP POLICY IF EXISTS "plan_configs_admin_all" ON public.plan_configs;
CREATE POLICY "plan_configs_admin_all"
ON public.plan_configs
FOR ALL
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

DROP POLICY IF EXISTS "plan_configs_client_select" ON public.plan_configs;
CREATE POLICY "plan_configs_client_select"
ON public.plan_configs
FOR SELECT
USING (auth.jwt() ->> 'role' = 'client');

-- client_plans: Admin full, Client read own
DROP POLICY IF EXISTS "client_plans_admin_all" ON public.client_plans;
CREATE POLICY "client_plans_admin_all"
ON public.client_plans
FOR ALL
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

DROP POLICY IF EXISTS "client_plans_client_select" ON public.client_plans;
CREATE POLICY "client_plans_client_select"
ON public.client_plans
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::UUID
);

-- client_monthly_allowances: Admin full, Client read own
DROP POLICY IF EXISTS "allowances_admin_all" ON public.client_monthly_allowances;
CREATE POLICY "allowances_admin_all"
ON public.client_monthly_allowances
FOR ALL
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

DROP POLICY IF EXISTS "allowances_client_select" ON public.client_monthly_allowances;
CREATE POLICY "allowances_client_select"
ON public.client_monthly_allowances
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::UUID
);

-- invoices: Admin full, Client read own (update via backend only)
DROP POLICY IF EXISTS "invoices_admin_all" ON public.invoices;
CREATE POLICY "invoices_admin_all"
ON public.invoices
FOR ALL
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

DROP POLICY IF EXISTS "invoices_client_select" ON public.invoices;
CREATE POLICY "invoices_client_select"
ON public.invoices
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::UUID
);

-- ============================================================================
-- 10. DEPRECATE OLD TABLE (Soft)
-- ============================================================================

-- Disable RLS on old table (no longer used)
ALTER TABLE IF EXISTS public.client_time_allowances DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.client_time_allowances IS 'DEPRECATED: Use client_monthly_allowances instead';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Manual Billing System Migration Complete';
  RAISE NOTICE '   - Plan configs table created with initial data';
  RAISE NOTICE '   - Client plans table created (temporal data)';
  RAISE NOTICE '   - Monthly allowances ledger created';
  RAISE NOTICE '   - Invoices table created with lifecycle tracking';
  RAISE NOTICE '   - Time entries altered (free/billable split)';
  RAISE NOTICE '   - RPC functions created (concurrency-safe)';
  RAISE NOTICE '   - RLS policies enabled';
  RAISE NOTICE '   - Old client_time_allowances deprecated';
END $$;
