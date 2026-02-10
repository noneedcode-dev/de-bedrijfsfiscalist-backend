-- Rollback Script: Manual Billing System
-- Created: 2026-02-10
-- Description: Reverts all changes from 20260210_manual_billing_system.sql

-- ============================================================================
-- 1. DROP RPC FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.consume_allowance_and_insert_time_entry(UUID, DATE, INT, TEXT, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.generate_invoice_number(UUID);

-- ============================================================================
-- 2. DROP TABLES (CASCADE to drop dependent objects)
-- ============================================================================

DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.client_invoice_counters CASCADE;
DROP TABLE IF EXISTS public.client_monthly_allowances CASCADE;
DROP TABLE IF EXISTS public.client_plans CASCADE;
DROP TABLE IF EXISTS public.plan_configs CASCADE;

-- ============================================================================
-- 3. REVERT TIME ENTRIES ALTERATIONS
-- ============================================================================

-- Drop constraint
ALTER TABLE public.time_entries 
  DROP CONSTRAINT IF EXISTS time_entries_minutes_split_valid;

-- Drop columns
ALTER TABLE public.time_entries 
  DROP COLUMN IF EXISTS worked_at,
  DROP COLUMN IF EXISTS free_minutes_consumed,
  DROP COLUMN IF EXISTS billable_minutes;

-- Drop index
DROP INDEX IF EXISTS public.idx_time_entries_client_worked_at;

-- ============================================================================
-- 4. RE-ENABLE OLD TABLE
-- ============================================================================

-- Re-enable RLS on old table
ALTER TABLE IF EXISTS public.client_time_allowances ENABLE ROW LEVEL SECURITY;

-- Remove deprecation comment
COMMENT ON TABLE public.client_time_allowances IS 'Monthly included minutes (free allowance) per client';

-- ============================================================================
-- ROLLBACK COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Manual Billing System Rollback Complete';
  RAISE NOTICE '   - All new tables dropped';
  RAISE NOTICE '   - RPC functions removed';
  RAISE NOTICE '   - Time entries reverted to original schema';
  RAISE NOTICE '   - Old client_time_allowances re-enabled';
END $$;
