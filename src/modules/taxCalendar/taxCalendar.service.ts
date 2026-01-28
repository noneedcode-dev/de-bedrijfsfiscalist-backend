import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { TAX_CALENDAR_STATUSES } from './taxCalendar.constants';

const DEFAULT_TZ = process.env.APP_DEFAULT_TZ || 'Europe/Amsterdam';

export function isoDateInTZ(timeZone: string = DEFAULT_TZ, date?: Date): string {
  const d = date || new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export interface TaxCalendarFilters {
  status?: string;
  from?: string;
  to?: string;
  jurisdiction?: string;
  tax_type?: string;
  period_label?: string;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export interface SummaryOptions {
  dueSoonDays: number;
  includeBreakdown: boolean;
}

export interface UpcomingOptions {
  months: number;
  limit: number;
}

export async function listEntries(
  supabase: SupabaseClient,
  clientId: string,
  filters: TaxCalendarFilters,
  pagination: PaginationOptions
) {
  let countQuery = supabase
    .from('tax_calendar_entries_v2')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);

  let query = supabase
    .from('tax_calendar_entries_v2')
    .select('*')
    .eq('client_id', clientId);

  if (filters.status) {
    query = query.eq('status', filters.status);
    countQuery = countQuery.eq('status', filters.status);
  }

  if (filters.jurisdiction) {
    query = query.eq('jurisdiction', filters.jurisdiction);
    countQuery = countQuery.eq('jurisdiction', filters.jurisdiction);
  }

  if (filters.tax_type) {
    query = query.eq('tax_type', filters.tax_type);
    countQuery = countQuery.eq('tax_type', filters.tax_type);
  }

  if (filters.from) {
    query = query.gte('deadline', filters.from);
    countQuery = countQuery.gte('deadline', filters.from);
  }

  if (filters.to) {
    query = query.lte('deadline', filters.to);
    countQuery = countQuery.lte('deadline', filters.to);
  }

  const { count } = await countQuery;

  query = query
    .order('deadline', { ascending: true })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error } = await query;

  if (error) {
    throw new AppError(
      `Failed to fetch tax calendar entries: ${error.message}`,
      500
    );
  }

  const total = count ?? 0;
  const hasMore = pagination.offset + pagination.limit < total;

  return {
    data,
    meta: {
      count: data?.length ?? 0,
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function getSummary(
  supabase: SupabaseClient,
  clientId: string,
  filters: TaxCalendarFilters,
  options: SummaryOptions
) {
  let query = supabase
    .from('tax_calendar_entries_v2')
    .select('status, deadline, tax_type')
    .eq('client_id', clientId);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.jurisdiction) {
    query = query.eq('jurisdiction', filters.jurisdiction);
  }

  if (filters.tax_type) {
    query = query.eq('tax_type', filters.tax_type);
  }

  if (filters.period_label) {
    query = query.eq('period_label', filters.period_label);
  }

  if (filters.from) {
    query = query.gte('deadline', filters.from);
  }

  if (filters.to) {
    query = query.lte('deadline', filters.to);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError(
      `Failed to fetch tax calendar summary: ${error.message}`,
      500
    );
  }

  const today = isoDateInTZ(DEFAULT_TZ);
  const dueSoonTo = isoDateInTZ(DEFAULT_TZ, addDays(new Date(), options.dueSoonDays));

  const summary = {
    total: 0,
    by_status: {
      pending: 0,
      in_progress: 0,
      done: 0,
      not_applicable: 0,
    } as Record<string, number>,
    overdue: 0,
    due_soon: 0,
    by_tax_type: {} as Record<string, any>,
  };

  (data || []).forEach((entry: any) => {
    const entryStatus = entry.status?.toLowerCase() || '';
    const deadline = entry.deadline;
    const taxType = entry.tax_type || 'Unknown';

    summary.total++;

    if (summary.by_status[entryStatus] !== undefined) {
      summary.by_status[entryStatus]++;
    } else {
      summary.by_status[entryStatus] = 1;
    }

    if (deadline < today && entryStatus !== TAX_CALENDAR_STATUSES.DONE) {
      summary.overdue++;
    }

    if (deadline >= today && deadline <= dueSoonTo && entryStatus !== TAX_CALENDAR_STATUSES.DONE) {
      summary.due_soon++;
    }

    if (options.includeBreakdown) {
      if (!summary.by_tax_type[taxType]) {
        summary.by_tax_type[taxType] = {
          total: 0,
          by_status: {
            pending: 0,
            in_progress: 0,
            done: 0,
            not_applicable: 0,
          } as Record<string, number>,
          overdue: 0,
          due_soon: 0,
        };
      }

      summary.by_tax_type[taxType].total++;

      if (summary.by_tax_type[taxType].by_status[entryStatus] !== undefined) {
        summary.by_tax_type[taxType].by_status[entryStatus]++;
      } else {
        summary.by_tax_type[taxType].by_status[entryStatus] = 1;
      }

      if (deadline < today && entryStatus !== TAX_CALENDAR_STATUSES.DONE) {
        summary.by_tax_type[taxType].overdue++;
      }

      if (deadline >= today && deadline <= dueSoonTo && entryStatus !== TAX_CALENDAR_STATUSES.DONE) {
        summary.by_tax_type[taxType].due_soon++;
      }
    }
  });

  const responseData: any = {
    total: summary.total,
    by_status: summary.by_status,
    overdue: summary.overdue,
    due_soon: summary.due_soon,
  };

  if (options.includeBreakdown) {
    responseData.by_tax_type = summary.by_tax_type;
  }

  return {
    data: responseData,
    meta: {
      today,
      due_soon_to: dueSoonTo,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function getUpcoming(
  supabase: SupabaseClient,
  clientId: string,
  filters: TaxCalendarFilters,
  options: UpcomingOptions
) {
  const from = isoDateInTZ(DEFAULT_TZ);
  const to = isoDateInTZ(DEFAULT_TZ, addMonths(new Date(), options.months));

  let query = supabase
    .from('tax_calendar_entries_v2')
    .select('*')
    .eq('client_id', clientId)
    .gte('deadline', from)
    .lte('deadline', to);

  if (filters.status) {
    query = query.eq('status', filters.status);
  } else {
    query = query.neq('status', TAX_CALENDAR_STATUSES.DONE);
  }

  if (filters.jurisdiction) {
    query = query.eq('jurisdiction', filters.jurisdiction);
  }

  if (filters.tax_type) {
    query = query.eq('tax_type', filters.tax_type);
  }

  if (filters.period_label) {
    query = query.eq('period_label', filters.period_label);
  }

  query = query.order('deadline', { ascending: true }).limit(options.limit);

  const { data, error } = await query;

  if (error) {
    throw new AppError(
      `Failed to fetch upcoming tax calendar entries: ${error.message}`,
      500
    );
  }

  return {
    data,
    meta: {
      count: data?.length ?? 0,
      range: {
        from,
        to,
      },
      timestamp: new Date().toISOString(),
    },
  };
}

export async function getTables(
  supabase: SupabaseClient,
  clientId: string
) {
  const { data: tables, error: tablesError } = await supabase
    .from('tax_calendar_tables')
    .select('*')
    .eq('client_id', clientId)
    .order('table_order', { ascending: true });

  if (tablesError) {
    throw new AppError(
      `Failed to fetch tax calendar tables: ${tablesError.message}`,
      500
    );
  }

  const tablesWithRows = await Promise.all(
    (tables || []).map(async (table: any) => {
      const { data: rows, error: rowsError } = await supabase
        .from('tax_calendar_rows')
        .select('*')
        .eq('table_id', table.id)
        .order('row_order', { ascending: true })
        .order('deadline', { ascending: true });

      if (rowsError) {
        throw new AppError(
          `Failed to fetch rows for table ${table.id}: ${rowsError.message}`,
          500
        );
      }

      return {
        ...table,
        rows: rows || [],
      };
    })
  );

  return {
    data: tablesWithRows,
    meta: {
      count: tablesWithRows.length,
      total_rows: tablesWithRows.reduce((sum, t) => sum + t.rows.length, 0),
      timestamp: new Date().toISOString(),
    },
  };
}

export interface ImportPayload {
  tables: Array<{
    jurisdiction: string;
    tax_type: string;
    title: string;
    table_order?: number;
    columns: Array<{
      key: string;
      label: string;
      type: string;
      order: number;
    }>;
    rows: Array<{
      entity_name: string;
      period_label: string;
      deadline: string;
      status?: string;
      row_order?: number;
      fields: Record<string, any>;
    }>;
  }>;
}

export async function replaceImport(
  supabase: SupabaseClient,
  clientId: string,
  payload: ImportPayload
) {
  const { data, error } = await supabase.rpc('tax_calendar_replace_import', {
    p_client_id: clientId,
    p_payload: payload as any,
  });

  if (error) {
    throw new AppError(
      `Failed to import tax calendar: ${error.message}`,
      500
    );
  }

  return data;
}
