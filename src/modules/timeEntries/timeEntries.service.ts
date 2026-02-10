import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';

export interface TimeEntry {
  id: string;
  client_id: string;
  advisor_user_id: string;
  entry_date: string;
  worked_at: string;
  minutes: number;
  free_minutes_consumed: number;
  billable_minutes: number;
  task?: string;
  is_billable: boolean;
  source: 'manual' | 'timer' | 'import';
  created_at: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
  deleted_at?: string;
  deleted_by?: string;
}

export interface ActiveTimer {
  id: string;
  client_id: string;
  advisor_user_id: string;
  started_at: string;
  started_by?: string;
  task?: string;
  created_at: string;
}

export interface MonthlySummary {
  year_month: string;
  included_minutes_monthly: number;
  used_minutes: number;
  remaining_included_minutes: number;
  billable_minutes: number;
}

export interface ListTimeEntriesParams {
  clientId: string;
  from?: string;
  to?: string;
  advisorUserId?: string;
  limit: number;
  offset: number;
}

export interface CreateTimeEntryParams {
  clientId: string;
  advisorUserId: string;
  entryDate: string;
  minutes: number;
  task?: string;
  isBillable?: boolean;
  source?: 'manual' | 'timer' | 'import';
  createdBy?: string;
}

export interface UpdateTimeEntryParams {
  clientId: string;
  entryId: string;
  updates: {
    minutes?: number;
    task?: string;
    is_billable?: boolean;
    entry_date?: string;
  };
  updatedBy?: string;
}

export async function listTimeEntries(
  supabase: SupabaseClient,
  params: ListTimeEntriesParams
): Promise<{ data: TimeEntry[]; count: number }> {
  let query = supabase
    .from('time_entries')
    .select('*', { count: 'exact' })
    .eq('client_id', params.clientId)
    .is('deleted_at', null);

  if (params.from) {
    query = query.gte('entry_date', params.from);
  }

  if (params.to) {
    query = query.lte('entry_date', params.to);
  }

  if (params.advisorUserId) {
    query = query.eq('advisor_user_id', params.advisorUserId);
  }

  const { data, error, count } = await query
    .order('entry_date', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (error) {
    throw new AppError(
      `Failed to fetch time entries: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return { data: data || [], count: count || 0 };
}

export async function getMonthlySummary(
  supabase: SupabaseClient,
  clientId: string,
  yearMonth?: string
): Promise<MonthlySummary> {
  const targetYearMonth = yearMonth || getCurrentYearMonth();
  const [year, month] = targetYearMonth.split('-');
  const periodStart = `${year}-${month}-01`;
  const endDate = getMonthEndDate(parseInt(year), parseInt(month));

  // Get allowance from new ledger table
  const { data: allowanceData, error: allowanceError } = await supabase
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

  // If no allowance record exists yet, get current plan to determine total
  let includedMinutes = 0;
  let usedFreeMinutes = 0;

  if (allowanceData) {
    includedMinutes = allowanceData.free_minutes_total;
    usedFreeMinutes = allowanceData.free_minutes_used;
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
        includedMinutes = planConfig.free_minutes_monthly;
      }
    }
  }

  // Calculate billable minutes from time_entries
  const { data: entriesData, error: entriesError } = await supabase
    .from('time_entries')
    .select('minutes, billable_minutes')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .gte('worked_at', periodStart)
    .lte('worked_at', endDate);

  if (entriesError) {
    throw new AppError(
      `Failed to fetch time entries: ${entriesError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  const totalMinutes = (entriesData || []).reduce((sum, entry) => sum + entry.minutes, 0);
  const billableMinutes = (entriesData || []).reduce((sum, entry) => sum + entry.billable_minutes, 0);
  const remainingMinutes = Math.max(0, includedMinutes - usedFreeMinutes);

  return {
    year_month: targetYearMonth,
    included_minutes_monthly: includedMinutes,
    used_minutes: totalMinutes,
    remaining_included_minutes: remainingMinutes,
    billable_minutes: billableMinutes,
  };
}

export async function createTimeEntry(
  supabase: SupabaseClient,
  params: CreateTimeEntryParams
): Promise<TimeEntry> {
  if (params.minutes <= 0) {
    throw new AppError(
      'Minutes must be greater than 0',
      422,
      ErrorCodes.VALIDATION_FAILED
    );
  }

  // Use RPC function for concurrency-safe allowance consumption
  const { data, error } = await supabase.rpc(
    'consume_allowance_and_insert_time_entry',
    {
      p_client_id: params.clientId,
      p_worked_at: params.entryDate,
      p_minutes: params.minutes,
      p_task: params.task || null,
      p_advisor_user_id: params.advisorUserId,
      p_source: params.source || 'manual',
      p_created_by: params.createdBy || null,
    }
  );

  if (error) {
    throw new AppError(
      `Failed to create time entry: ${error.message}`,
      500,
      ErrorCodes.TIME_ENTRY_CREATE_FAILED
    );
  }

  // RPC returns JSONB with structure: { time_entry, allowance_consumed, billable_minutes, period_start, plan_code }
  const result = data as {
    time_entry: TimeEntry;
    allowance_consumed: number;
    billable_minutes: number;
    period_start: string;
    plan_code: string;
  };

  return result.time_entry;
}

export async function updateTimeEntry(
  supabase: SupabaseClient,
  params: UpdateTimeEntryParams
): Promise<TimeEntry> {
  const { data: existingEntry, error: fetchError } = await supabase
    .from('time_entries')
    .select('*')
    .eq('id', params.entryId)
    .eq('client_id', params.clientId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchError) {
    throw new AppError(
      `Failed to fetch time entry: ${fetchError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  if (!existingEntry) {
    throw new AppError(
      'Time entry not found',
      404,
      ErrorCodes.TIME_ENTRY_NOT_FOUND
    );
  }

  if (params.updates.minutes !== undefined && params.updates.minutes <= 0) {
    throw new AppError(
      'Minutes must be greater than 0',
      422,
      ErrorCodes.VALIDATION_FAILED
    );
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
    updated_by: params.updatedBy || null,
  };

  if (params.updates.minutes !== undefined) {
    updateData.minutes = params.updates.minutes;
  }
  if (params.updates.task !== undefined) {
    updateData.task = params.updates.task;
  }
  if (params.updates.is_billable !== undefined) {
    updateData.is_billable = params.updates.is_billable;
  }
  if (params.updates.entry_date !== undefined) {
    updateData.entry_date = params.updates.entry_date;
  }

  const { data, error } = await supabase
    .from('time_entries')
    .update(updateData)
    .eq('id', params.entryId)
    .select()
    .single();

  if (error) {
    throw new AppError(
      `Failed to update time entry: ${error.message}`,
      500,
      ErrorCodes.TIME_ENTRY_UPDATE_FAILED
    );
  }

  return data;
}

export async function softDeleteTimeEntry(
  supabase: SupabaseClient,
  clientId: string,
  entryId: string,
  deletedBy?: string
): Promise<void> {
  const { data: existingEntry, error: fetchError } = await supabase
    .from('time_entries')
    .select('id')
    .eq('id', entryId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchError) {
    throw new AppError(
      `Failed to fetch time entry: ${fetchError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  if (!existingEntry) {
    throw new AppError(
      'Time entry not found',
      404,
      ErrorCodes.TIME_ENTRY_NOT_FOUND
    );
  }

  const { error } = await supabase
    .from('time_entries')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy || null,
    })
    .eq('id', entryId);

  if (error) {
    throw new AppError(
      `Failed to delete time entry: ${error.message}`,
      500,
      ErrorCodes.TIME_ENTRY_DELETE_FAILED
    );
  }
}

export async function startTimer(
  supabase: SupabaseClient,
  clientId: string,
  advisorUserId: string,
  task?: string,
  startedBy?: string
): Promise<ActiveTimer> {
  const insertData = {
    client_id: clientId,
    advisor_user_id: advisorUserId,
    task: task || null,
    started_by: startedBy || null,
  };

  const { data, error } = await supabase
    .from('active_timers')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new AppError(
        'Timer is already running for this advisor',
        409,
        ErrorCodes.TIME_TIMER_ALREADY_RUNNING
      );
    }
    throw new AppError(
      `Failed to start timer: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return data;
}

export async function stopTimer(
  supabase: SupabaseClient,
  clientId: string,
  advisorUserId: string,
  task?: string,
  stoppedBy?: string
): Promise<TimeEntry> {
  const { data: activeTimer, error: fetchError } = await supabase
    .from('active_timers')
    .select('*')
    .eq('client_id', clientId)
    .eq('advisor_user_id', advisorUserId)
    .maybeSingle();

  if (fetchError) {
    throw new AppError(
      `Failed to fetch active timer: ${fetchError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  if (!activeTimer) {
    throw new AppError(
      'No active timer found for this advisor',
      404,
      ErrorCodes.TIME_TIMER_NOT_RUNNING
    );
  }

  const startedAt = new Date(activeTimer.started_at);
  const now = new Date();
  const durationMs = now.getTime() - startedAt.getTime();
  const minutes = Math.max(1, Math.ceil(durationMs / 60000));

  const entryDate = now.toISOString().split('T')[0];

  const timeEntry = await createTimeEntry(supabase, {
    clientId,
    advisorUserId,
    entryDate,
    minutes,
    task: task || activeTimer.task || undefined,
    isBillable: true,
    source: 'timer',
    createdBy: stoppedBy,
  });

  const { error: deleteError } = await supabase
    .from('active_timers')
    .delete()
    .eq('id', activeTimer.id);

  if (deleteError) {
    throw new AppError(
      `Failed to delete active timer: ${deleteError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return timeEntry;
}

export async function getActiveTimer(
  supabase: SupabaseClient,
  clientId: string,
  advisorUserId: string
): Promise<{ started_at: string; task?: string } | null> {
  const { data, error } = await supabase
    .from('active_timers')
    .select('started_at, task')
    .eq('client_id', clientId)
    .eq('advisor_user_id', advisorUserId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      `Failed to fetch active timer: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  return data;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthEndDate(year: number, month: number): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const lastDay = new Date(nextYear, nextMonth - 1, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}
