-- Migration: Add time tracking (time entries + monthly allowance)
-- Created: 2026-02-04
-- Description: Creates client_time_allowances + time_entries with RLS policies

-- 1) Client monthly included minutes (free allowance)
CREATE TABLE IF NOT EXISTS public.client_time_allowances (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  included_minutes_monthly INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.client_time_allowances IS 'Monthly included minutes (free allowance) per client';
COMMENT ON COLUMN public.client_time_allowances.included_minutes_monthly IS 'Included minutes per month (e.g., 240 for 4h)';

CREATE OR REPLACE FUNCTION public.update_client_time_allowances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_time_allowances_updated_at_trigger ON public.client_time_allowances;
CREATE TRIGGER client_time_allowances_updated_at_trigger
  BEFORE UPDATE ON public.client_time_allowances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_time_allowances_updated_at();

-- 2) Time entries
CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  advisor_user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  entry_date DATE NOT NULL,
  minutes INT NOT NULL CHECK (minutes > 0),
  task TEXT,
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'timer', 'import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.app_users(id),
  updated_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.app_users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.app_users(id)
);

COMMENT ON TABLE public.time_entries IS 'Time tracking entries per client';
COMMENT ON COLUMN public.time_entries.minutes IS 'Duration in minutes';
COMMENT ON COLUMN public.time_entries.task IS 'Optional task/label';
COMMENT ON COLUMN public.time_entries.deleted_at IS 'Soft delete timestamp';

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_client_date_desc
  ON public.time_entries(client_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_time_entries_client_advisor_date_desc
  ON public.time_entries(client_id, advisor_user_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_time_entries_client_deleted_at
  ON public.time_entries(client_id, deleted_at);

-- 4) Enable RLS
ALTER TABLE public.client_time_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- 5) RLS: client_time_allowances

DROP POLICY IF EXISTS "client_time_allowances_client_select_own" ON public.client_time_allowances;
CREATE POLICY "client_time_allowances_client_select_own"
ON public.client_time_allowances
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

DROP POLICY IF EXISTS "client_time_allowances_admin_all" ON public.client_time_allowances;
CREATE POLICY "client_time_allowances_admin_all"
ON public.client_time_allowances
FOR ALL
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- 6) RLS: time_entries

DROP POLICY IF EXISTS "time_entries_client_select_own" ON public.time_entries;
CREATE POLICY "time_entries_client_select_own"
ON public.time_entries
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
  AND deleted_at IS NULL
);

DROP POLICY IF EXISTS "time_entries_admin_all" ON public.time_entries;
CREATE POLICY "time_entries_admin_all"
ON public.time_entries
FOR ALL
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- 7) Active timers table (for timer state)
CREATE TABLE IF NOT EXISTS public.active_timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  advisor_user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_by UUID REFERENCES public.app_users(id),
  task TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT active_timers_unique_per_advisor UNIQUE (client_id, advisor_user_id)
);

COMMENT ON TABLE public.active_timers IS 'Active timer state per client and advisor';
COMMENT ON COLUMN public.active_timers.started_at IS 'When the timer was started';
COMMENT ON COLUMN public.active_timers.task IS 'Optional task description';

-- Index for active_timers
CREATE INDEX IF NOT EXISTS idx_active_timers_client_advisor
  ON public.active_timers(client_id, advisor_user_id);

-- 8) RLS: active_timers (admin only, no client access)
ALTER TABLE public.active_timers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active_timers_admin_all" ON public.active_timers;
CREATE POLICY "active_timers_admin_all"
ON public.active_timers
FOR ALL
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');
