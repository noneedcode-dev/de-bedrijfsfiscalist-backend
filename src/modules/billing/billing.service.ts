import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';

export interface CurrentAllowanceSummary {
  period_start: string; // date (YYYY-MM-01)
  free_minutes_total: number;
  free_minutes_used: number;
  free_minutes_remaining: number;
  billable_minutes_to_date: number;
}

export async function getCurrentAllowance(
  supabase: SupabaseClient,
  clientId: string
): Promise<CurrentAllowanceSummary> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  // Get allowance for current period
  const { data: allowance, error: allowanceError } = await supabase
    .from('client_monthly_allowances')
    .select('free_minutes_total, free_minutes_used')
    .eq('client_id', clientId)
    .eq('period_start', periodStart)
    .maybeSingle();

  if (allowanceError) {
    throw new AppError(
      `Failed to fetch monthly allowance: ${allowanceError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  let freeMinutesTotal = 0;
  let freeMinutesUsed = 0;

  if (allowance) {
    freeMinutesTotal = allowance.free_minutes_total;
    freeMinutesUsed = allowance.free_minutes_used;
  } else {
    // No entries yet this month - get current plan
    const { data: currentPlan } = await supabase
      .from('client_plans')
      .select('plan_code')
      .eq('client_id', clientId)
      .lte('effective_from', periodStart)
      .or(`effective_to.is.null,effective_to.gte.${periodStart}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentPlan) {
      const { data: planConfig } = await supabase
        .from('plan_configs')
        .select('free_minutes_monthly')
        .eq('plan_code', currentPlan.plan_code)
        .single();

      if (planConfig) {
        freeMinutesTotal = planConfig.free_minutes_monthly;
      }
    }
  }

  // Calculate billable minutes for current period
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  const { data: entries, error: entriesError } = await supabase
    .from('time_entries')
    .select('billable_minutes')
    .eq('client_id', clientId)
    .gte('worked_at', periodStart)
    .lte('worked_at', endDate)
    .is('deleted_at', null);

  if (entriesError) {
    throw new AppError(
      `Failed to fetch time entries: ${entriesError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  const billableMinutesToDate = (entries || []).reduce(
    (sum, entry) => sum + entry.billable_minutes,
    0
  );

  return {
    period_start: periodStart,
    free_minutes_total: freeMinutesTotal,
    free_minutes_used: freeMinutesUsed,
    free_minutes_remaining: Math.max(0, freeMinutesTotal - freeMinutesUsed),
    billable_minutes_to_date: billableMinutesToDate,
  };
}
