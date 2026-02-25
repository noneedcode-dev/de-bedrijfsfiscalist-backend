import { Request, Response } from 'express';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { AppError } from '../../middleware/errorHandler';
import { ErrorCodes } from '../../constants/errorCodes';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';

export interface GlobalTimeEntriesFilters {
  client_id?: string;
  advisor_id?: string;
  billable?: boolean;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export async function listAllTimeEntries(req: Request, res: Response): Promise<void> {
  const filters: GlobalTimeEntriesFilters = {
    client_id: req.query.client_id as string | undefined,
    advisor_id: req.query.advisor_id as string | undefined,
    billable: req.query.billable === 'true' ? true : req.query.billable === 'false' ? false : undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
  };

  const offset = (filters.page - 1) * filters.limit;
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from('time_entries')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (filters.client_id) {
    query = query.eq('client_id', filters.client_id);
  }

  if (filters.advisor_id) {
    query = query.eq('advisor_user_id', filters.advisor_id);
  }

  if (filters.billable !== undefined) {
    query = query.eq('is_billable', filters.billable);
  }

  if (filters.from) {
    query = query.gte('entry_date', filters.from);
  }

  if (filters.to) {
    query = query.lte('entry_date', filters.to);
  }

  const { data, error, count } = await query
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + filters.limit - 1);

  if (error) {
    throw new AppError(
      `Failed to fetch global time entries: ${error.message}`,
      500,
      ErrorCodes.INTERNAL_ERROR
    );
  }

  // Enrich time entries with client_name, advisor_name, started_at_formatted, elapsed_minutes
  const entries = data ?? [];

  // 1. Fetch client names (batch lookup)
  const clientIds = Array.from(
    new Set(entries.map(e => e.client_id).filter(Boolean))
  );

  const clientNameById = new Map<string, string | null>();
  if (clientIds.length) {
    const { data: clients, error: clientErr } = await supabase
      .from('clients')
      .select('id,name')
      .in('id', clientIds);
    if (clientErr) throw clientErr;

    for (const c of clients ?? []) {
      clientNameById.set(c.id, c.name ?? null);
    }
  }

  // 2. Fetch advisor names (batch lookup)
  const advisorIds = Array.from(
    new Set(entries.map(e => e.advisor_user_id).filter(Boolean))
  );

  const advisorNameById = new Map<string, string | null>();
  if (advisorIds.length) {
    const { data: advisors, error: advErr } = await supabase
      .from('app_users')
      .select('id,full_name,email')
      .in('id', advisorIds);
    if (advErr) throw advErr;

    for (const a of advisors ?? []) {
      advisorNameById.set(a.id, a.full_name ?? a.email ?? null);
    }
  }

  // 3. Format helper for MM/DD/YYYY HH:mm
  const formatMMDDYYYYHHmm = (d: Date) =>
    new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d).replace(',', '');

  // 4. Enrich each entry
  const enriched = entries.map(e => {
    // worked_at is a DATE field, so we use it as the start time (at midnight UTC)
    const workedAt = e.worked_at ? new Date(e.worked_at + 'T00:00:00Z') : null;

    return {
      ...e,
      client_name: e.client_id ? (clientNameById.get(e.client_id) ?? null) : null,
      advisor_name: e.advisor_user_id
        ? (advisorNameById.get(e.advisor_user_id) ?? null)
        : null,
      started_at_formatted: workedAt ? formatMMDDYYYYHHmm(workedAt) : null,
      elapsed_minutes: typeof e.minutes === 'number' ? Math.max(0, Math.floor(e.minutes)) : null
    };
  });

  auditLogService.logAsync({
    client_id: filters.client_id,
    actor_user_id: req.user?.sub,
    actor_role: req.user?.role,
    action: AuditActions.TIME_ENTRIES_LIST_VIEWED,
    entity_type: 'time_entry',
    metadata: {
      scope: 'global_admin',
      filters: {
        client_id: filters.client_id,
        advisor_id: filters.advisor_id,
        billable: filters.billable,
        from: filters.from,
        to: filters.to,
      },
      pagination: {
        page: filters.page,
        limit: filters.limit,
      },
      result_count: data?.length || 0,
      total_count: count || 0,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
    },
  });

  res.json({
    data: enriched,
    pagination: {
      total: count || 0,
      page: filters.page,
      limit: filters.limit,
    },
  });
}
