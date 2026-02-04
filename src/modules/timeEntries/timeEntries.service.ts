import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';

export interface TimeEntry {
  id: string;
  client_id: string;
  advisor_user_id: string;
  entry_date: string;
  minutes: number;
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
  const startDate = `${year}-${month}-01`;
  const endDate = getMonthEndDate(parseInt(year), parseInt(month));

  const { data: allowanceData, error: allowanceError } = await supabase
    .from('client_time_allowances')
    .select('included_minutes_monthly')
    .eq('client_id', clientId)
    .maybeSingle();

  if (allowanceError) {
    throw new AppError(
      `Failed to fetch time allowance: ${allowanceError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  const includedMinutes = allowanceData?.included_minutes_monthly || 0;

  const { data: entriesData, error: entriesError } = await supabase
    .from('time_entries')
    .select('minutes')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .gte('entry_date', startDate)
    .lte('entry_date', endDate);

  if (entriesError) {
    throw new AppError(
      `Failed to fetch time entries: ${entriesError.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  const usedMinutes = (entriesData || []).reduce((sum, entry) => sum + entry.minutes, 0);
  const remainingMinutes = Math.max(0, includedMinutes - usedMinutes);
  const billableMinutes = Math.max(0, usedMinutes - includedMinutes);

  return {
    year_month: targetYearMonth,
    included_minutes_monthly: includedMinutes,
    used_minutes: usedMinutes,
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

  const insertData = {
    client_id: params.clientId,
    advisor_user_id: params.advisorUserId,
    entry_date: params.entryDate,
    minutes: params.minutes,
    task: params.task || null,
    is_billable: params.isBillable !== undefined ? params.isBillable : true,
    source: params.source || 'manual',
    created_by: params.createdBy || null,
  };

  const { data, error } = await supabase
    .from('time_entries')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new AppError(
      `Failed to create time entry: ${error.message}`,
      500,
      ErrorCodes.TIME_ENTRY_CREATE_FAILED
    );
  }

  return data;
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
