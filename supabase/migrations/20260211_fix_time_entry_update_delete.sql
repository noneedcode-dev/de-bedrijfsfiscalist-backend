-- Migration: Fix Time Entry UPDATE/DELETE + Invoice Payment Tracking
-- Created: 2026-02-10
-- Description: Adds RPC functions for safe time entry updates/deletes with allowance sync + invoice payment tracking

-- ============================================================================
-- 1. RPC FUNCTION: Update Time Entry with Allowance Sync
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_time_entry_with_allowance_sync(
  p_entry_id UUID,
  p_client_id UUID,
  p_new_minutes INT,
  p_task TEXT,
  p_is_billable BOOLEAN,
  p_entry_date DATE,
  p_updated_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_old_entry public.time_entries%ROWTYPE;
  v_period_start DATE;
  v_allowance_row public.client_monthly_allowances%ROWTYPE;
  v_new_free INT;
  v_new_billable INT;
  v_updated_entry public.time_entries%ROWTYPE;
BEGIN
  -- 1. Lock and fetch existing entry
  SELECT * INTO v_old_entry
  FROM public.time_entries
  WHERE id = p_entry_id AND client_id = p_client_id AND deleted_at IS NULL
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Time entry not found or already deleted';
  END IF;
  
  -- 2. If minutes didn't change, do simple update
  IF p_new_minutes IS NULL OR p_new_minutes = v_old_entry.minutes THEN
    UPDATE public.time_entries
    SET task = COALESCE(p_task, task),
        is_billable = COALESCE(p_is_billable, is_billable),
        entry_date = COALESCE(p_entry_date, entry_date),
        worked_at = COALESCE(p_entry_date, worked_at),
        updated_at = NOW(),
        updated_by = p_updated_by
    WHERE id = p_entry_id
    RETURNING * INTO v_updated_entry;
    
    RETURN jsonb_build_object(
      'time_entry', row_to_json(v_updated_entry),
      'allowance_changed', false
    );
  END IF;
  
  -- 3. Minutes changed - need allowance sync
  v_period_start := DATE_TRUNC('month', v_old_entry.worked_at)::DATE;
  
  -- 4. Lock allowance row
  SELECT * INTO v_allowance_row
  FROM public.client_monthly_allowances
  WHERE client_id = p_client_id AND period_start = v_period_start
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allowance record not found for period %', v_period_start;
  END IF;
  
  -- 5. Refund old free minutes
  UPDATE public.client_monthly_allowances
  SET free_minutes_used = free_minutes_used - v_old_entry.free_minutes_consumed,
      updated_at = NOW()
  WHERE id = v_allowance_row.id;
  
  -- Refresh allowance row after refund
  v_allowance_row.free_minutes_used := v_allowance_row.free_minutes_used - v_old_entry.free_minutes_consumed;
  
  -- 6. Calculate new split
  v_new_free := LEAST(
    p_new_minutes,
    v_allowance_row.free_minutes_total - v_allowance_row.free_minutes_used
  );
  v_new_free := GREATEST(v_new_free, 0);
  v_new_billable := p_new_minutes - v_new_free;
  
  -- 7. Consume new free minutes
  UPDATE public.client_monthly_allowances
  SET free_minutes_used = free_minutes_used + v_new_free,
      updated_at = NOW()
  WHERE id = v_allowance_row.id;
  
  -- 8. Update time entry with new split
  UPDATE public.time_entries
  SET minutes = p_new_minutes,
      free_minutes_consumed = v_new_free,
      billable_minutes = v_new_billable,
      is_billable = (v_new_billable > 0),
      task = COALESCE(p_task, task),
      entry_date = COALESCE(p_entry_date, entry_date),
      worked_at = COALESCE(p_entry_date, worked_at),
      updated_at = NOW(),
      updated_by = p_updated_by
  WHERE id = p_entry_id
  RETURNING * INTO v_updated_entry;
  
  RETURN jsonb_build_object(
    'time_entry', row_to_json(v_updated_entry),
    'allowance_changed', true,
    'old_free_minutes', v_old_entry.free_minutes_consumed,
    'new_free_minutes', v_new_free,
    'old_billable_minutes', v_old_entry.billable_minutes,
    'new_billable_minutes', v_new_billable
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_time_entry_with_allowance_sync IS 
  'Updates time entry and syncs allowance ledger when minutes change';

-- ============================================================================
-- 2. RPC FUNCTION: Soft Delete Time Entry with Allowance Refund
-- ============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_time_entry_with_allowance_refund(
  p_entry_id UUID,
  p_client_id UUID,
  p_deleted_by UUID
) RETURNS JSONB AS $$
DECLARE
  v_entry public.time_entries%ROWTYPE;
  v_period_start DATE;
BEGIN
  -- 1. Lock and fetch entry
  SELECT * INTO v_entry
  FROM public.time_entries
  WHERE id = p_entry_id AND client_id = p_client_id AND deleted_at IS NULL
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Time entry not found or already deleted';
  END IF;
  
  -- 2. Calculate period
  v_period_start := DATE_TRUNC('month', v_entry.worked_at)::DATE;
  
  -- 3. Refund free minutes to allowance (if any were consumed)
  IF v_entry.free_minutes_consumed > 0 THEN
    UPDATE public.client_monthly_allowances
    SET free_minutes_used = free_minutes_used - v_entry.free_minutes_consumed,
        updated_at = NOW()
    WHERE client_id = p_client_id AND period_start = v_period_start;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Allowance record not found for period %, skipping refund', v_period_start;
    END IF;
  END IF;
  
  -- 4. Soft delete the entry
  UPDATE public.time_entries
  SET deleted_at = NOW(),
      deleted_by = p_deleted_by
  WHERE id = p_entry_id;
  
  RETURN jsonb_build_object(
    'entry_id', p_entry_id,
    'refunded_free_minutes', v_entry.free_minutes_consumed,
    'period_start', v_period_start,
    'deleted_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.soft_delete_time_entry_with_allowance_refund IS 
  'Soft deletes time entry and refunds consumed free minutes to allowance ledger';

-- ============================================================================
-- 3. INVOICE PAYMENT TRACKING COLUMNS
-- ============================================================================

-- Add payment tracking columns to invoices table
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'credit_card', 'cash', 'other')),
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_note TEXT;

COMMENT ON COLUMN public.invoices.paid_at IS 'Actual payment date/time';
COMMENT ON COLUMN public.invoices.payment_method IS 'Payment method: bank_transfer, credit_card, cash, or other';
COMMENT ON COLUMN public.invoices.payment_reference IS 'Transaction reference/ID from payment system';
COMMENT ON COLUMN public.invoices.payment_note IS 'Additional notes about the payment';

-- Add index for payment queries
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at 
  ON public.invoices(client_id, paid_at DESC) 
  WHERE paid_at IS NOT NULL;

-- ============================================================================
-- 4. DEPRECATE entry_date COLUMN (Use worked_at instead)
-- ============================================================================

-- Make entry_date nullable (deprecation step)
ALTER TABLE public.time_entries 
  ALTER COLUMN entry_date DROP NOT NULL;

COMMENT ON COLUMN public.time_entries.entry_date IS 
  'DEPRECATED: Use worked_at instead. Kept for backward compatibility only.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Time Entry UPDATE/DELETE Fix Migration Complete';
  RAISE NOTICE '   - update_time_entry_with_allowance_sync() RPC created';
  RAISE NOTICE '   - soft_delete_time_entry_with_allowance_refund() RPC created';
  RAISE NOTICE '   - Invoice payment tracking columns added';
  RAISE NOTICE '   - entry_date column deprecated (use worked_at)';
END $$;
