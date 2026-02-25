import { Router, Request, Response } from 'express';
import { param, query, body } from 'express-validator';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import { requireRole, requireAuth } from '../auth/auth.middleware';
import * as timeEntriesService from './timeEntries.service';

export const timeEntriesRouter = Router({ mergeParams: true });

function getSupabase(req: Request) {
  const token = req.headers.authorization?.split(' ')[1];
  return req.user?.role === 'admin'
    ? createSupabaseAdminClient()
    : createSupabaseUserClient(token!);
}

/**
 * GET /api/clients/:clientId/time-entries
 * List time entries (admin + client)
 */
timeEntriesRouter.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('from').optional().isDate().withMessage('Invalid from date format'),
    query('to').optional().isDate().withMessage('Invalid to date format'),
    query('advisor_user_id').optional().isUUID().withMessage('Invalid advisor_user_id format'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('Limit must be between 1 and 200')
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
      .toInt(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
    const offset = typeof req.query.offset === 'number' ? req.query.offset : 0;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const advisorUserId = req.query.advisor_user_id as string | undefined;

    const supabase = getSupabase(req);

    const { data, count } = await timeEntriesService.listTimeEntries(supabase, {
      clientId,
      from,
      to,
      advisorUserId,
      limit,
      offset,
    });

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TIME_ENTRIES_LIST_VIEWED,
      entity_type: 'time_entry',
      metadata: {
        query_params: { from, to, advisor_user_id: advisorUserId, limit, offset },
        result_count: data.length,
        total_count: count,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.json({
      data,
      meta: {
        total: count,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/clients/:clientId/time-entries/summary
 * Get monthly summary (admin + client)
 */
timeEntriesRouter.get(
  '/summary',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('year_month')
      .optional()
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('Invalid year_month format, expected YYYY-MM'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const yearMonth = req.query.year_month as string | undefined;

    const supabase = getSupabase(req);

    const summary = await timeEntriesService.getMonthlySummary(
      supabase,
      clientId,
      yearMonth
    );

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TIME_ENTRIES_SUMMARY_VIEWED,
      entity_type: 'time_entry',
      metadata: {
        year_month: summary.year_month,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.json({
      data: summary,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/clients/:clientId/time-entries
 * Create time entry (admin only)
 */
timeEntriesRouter.post(
  '/',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    body('advisor_user_id').isUUID().withMessage('Invalid advisor_user_id format'),
    body('entry_date').isDate().withMessage('Invalid entry_date format'),
    body('minutes').isInt({ min: 1 }).withMessage('Minutes must be a positive integer'),
    body('task').optional().isString().withMessage('Task must be a string'),
    body('is_billable').optional().isBoolean().withMessage('is_billable must be a boolean'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { advisor_user_id, entry_date, minutes, task, is_billable } = req.body;

    const supabase = createSupabaseAdminClient();

    const timeEntry = await timeEntriesService.createTimeEntry(supabase, {
      clientId,
      advisorUserId: advisor_user_id,
      entryDate: entry_date,
      minutes,
      task,
      isBillable: is_billable,
      source: 'manual',
      createdBy: req.user?.sub,
    });

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TIME_ENTRY_CREATED,
      entity_type: 'time_entry',
      entity_id: timeEntry.id,
      metadata: {
        advisor_user_id,
        entry_date,
        minutes,
        task,
        is_billable,
        source: 'manual',
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.status(201).json({
      data: timeEntry,
    });
  })
);

/**
 * PATCH /api/clients/:clientId/time-entries/:id
 * Update time entry (admin only)
 */
timeEntriesRouter.patch(
  '/:id',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
    body('minutes').optional().isInt({ min: 1 }).withMessage('Minutes must be a positive integer'),
    body('task').optional().isString().withMessage('Task must be a string'),
    body('is_billable').optional().isBoolean().withMessage('is_billable must be a boolean'),
    body('entry_date').optional().isDate().withMessage('Invalid entry_date format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const entryId = req.params.id;
    const { minutes, task, is_billable, entry_date } = req.body;

    const supabase = createSupabaseAdminClient();

    const timeEntry = await timeEntriesService.updateTimeEntry(supabase, {
      clientId,
      entryId,
      updates: {
        minutes,
        task,
        is_billable,
        entry_date,
      },
      updatedBy: req.user?.sub,
    });

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TIME_ENTRY_UPDATED,
      entity_type: 'time_entry',
      entity_id: entryId,
      metadata: {
        updates: { minutes, task, is_billable, entry_date },
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.json({
      data: timeEntry,
    });
  })
);

/**
 * DELETE /api/clients/:clientId/time-entries/:id
 * Soft delete time entry (admin only)
 */
timeEntriesRouter.delete(
  '/:id',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const entryId = req.params.id;

    const supabase = createSupabaseAdminClient();

    await timeEntriesService.softDeleteTimeEntry(
      supabase,
      clientId,
      entryId,
      req.user?.sub
    );

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TIME_ENTRY_DELETED,
      entity_type: 'time_entry',
      entity_id: entryId,
      metadata: {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.status(204).send();
  })
);

/**
 * POST /api/clients/:clientId/time-entries/timer/start
 * Start timer (admin only)
 */
timeEntriesRouter.post(
  '/timer/start',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    body('advisor_user_id').isUUID().withMessage('Invalid advisor_user_id format'),
    body('task').optional().isString().withMessage('Task must be a string'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { advisor_user_id, task } = req.body;

    const supabase = createSupabaseAdminClient();

    const timer = await timeEntriesService.startTimer(
      supabase,
      clientId,
      advisor_user_id,
      task,
      req.user?.sub
    );

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TIME_ENTRY_TIMER_STARTED,
      entity_type: 'active_timer',
      entity_id: timer.id,
      metadata: {
        advisor_user_id,
        task,
        started_at: timer.started_at,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.status(201).json({
      data: timer,
    });
  })
);

/**
 * POST /api/clients/:clientId/time-entries/timer/stop
 * Stop timer (admin only)
 */
timeEntriesRouter.post(
  '/timer/stop',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    body('advisor_user_id').isUUID().withMessage('Invalid advisor_user_id format'),
    body('task').optional().isString().withMessage('Task must be a string'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { advisor_user_id, task } = req.body;

    const supabase = createSupabaseAdminClient();

    const timeEntry = await timeEntriesService.stopTimer(
      supabase,
      clientId,
      advisor_user_id,
      task,
      req.user?.sub
    );

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TIME_ENTRY_TIMER_STOPPED,
      entity_type: 'time_entry',
      entity_id: timeEntry.id,
      metadata: {
        advisor_user_id,
        task,
        minutes: timeEntry.minutes,
        entry_date: timeEntry.entry_date,
        source: 'timer',
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    res.json({
      data: timeEntry,
    });
  })
);

/**
 * GET /api/clients/:clientId/time-entries/timer/active
 * Get active timer (admin + client)
 */
timeEntriesRouter.get(
  '/timer/active',
  requireAuth,
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('advisor_user_id').optional().isUUID().withMessage('Invalid advisor_user_id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const advisorUserId = req.query.advisor_user_id as string | undefined;

    const supabase = getSupabase(req);

    const activeTimer = await timeEntriesService.getActiveTimer(
      supabase,
      clientId,
      advisorUserId,
      req.user?.role
    );

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TIME_ENTRY_TIMER_ACTIVE_VIEWED,
      entity_type: 'active_timer',
      metadata: {
        advisor_user_id: advisorUserId,
        is_active: !!activeTimer,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });

    if (!activeTimer) {
      return res.json({
        data: null,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle();
    if (clientErr) throw clientErr;

    const { data: advisorRow, error: advErr } = await supabase
      .from('app_users')
      .select('full_name,email')
      .eq('id', activeTimer.advisor_user_id)
      .maybeSingle();
    if (advErr) throw advErr;

    const startedAt = new Date(activeTimer.started_at);
    const now = new Date();
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60000));

    const startedAtFormatted = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(startedAt).replace(',', '');

    return res.json({
      data: {
        ...activeTimer,
        client_name: clientRow?.name ?? null,
        advisor_name: advisorRow?.full_name ?? advisorRow?.email ?? null,
        started_at_formatted: startedAtFormatted,
        elapsed_minutes: elapsedMinutes,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);
