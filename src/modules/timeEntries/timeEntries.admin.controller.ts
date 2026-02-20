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
    data: data || [],
    pagination: {
      total: count || 0,
      page: filters.page,
      limit: filters.limit,
    },
  });
}
