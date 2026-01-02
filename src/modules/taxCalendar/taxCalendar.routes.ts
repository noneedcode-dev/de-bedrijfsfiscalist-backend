// src/modules/taxCalendar/taxCalendar.routes.ts
import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import * as taxCalendarService from './taxCalendar.service';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import { TAX_CALENDAR_STATUS_VALUES } from './taxCalendar.constants';
import { ErrorCodes } from '../../constants/errorCodes';

export const taxCalendarRouter = Router({ mergeParams: true });

// Admin bypass: use service-role client to query across tenants; clients remain restricted by RLS.
function getSupabase(req: any, accessToken: string) {
  return req.user?.role === 'admin'
    ? createSupabaseAdminClient()
    : createSupabaseUserClient(accessToken);
}

/**
 * @openapi
 * /api/clients/{clientId}/tax/calendar:
 *   get:
 *     summary: Get tax calendar entries
 *     description: Retrieve tax calendar entries for a specific client with optional filters and pagination
 *     tags:
 *       - Tax Calendar
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter entries from this date (ISO 8601)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter entries up to this date (ISO 8601)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: jurisdiction
 *         schema:
 *           type: string
 *         description: Filter by jurisdiction
 *       - in: query
 *         name: tax_type
 *         schema:
 *           type: string
 *         description: Filter by tax type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *         description: Maximum number of entries to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of entries to skip for pagination
 *     responses:
 *       200:
 *         description: List of tax calendar entries with pagination metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TaxCalendarEntry'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                       description: Number of entries in current response
 *                     total:
 *                       type: number
 *                       description: Total number of entries matching filters
 *                     limit:
 *                       type: number
 *                       description: Limit used for this request
 *                     offset:
 *                       type: number
 *                       description: Offset used for this request
 *                     hasMore:
 *                       type: boolean
 *                       description: Whether there are more entries available
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxCalendarRouter.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('from').optional().isISO8601().withMessage('Invalid date format for from'),
    query('to').optional().isISO8601().withMessage('Invalid date format for to'),
    query('status').optional().isIn(TAX_CALENDAR_STATUS_VALUES).withMessage('Invalid status value'),
    query('jurisdiction').optional().isString().withMessage('Invalid jurisdiction format'),
    query('tax_type').optional().isString().withMessage('Invalid tax_type format'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('limit must be between 1 and 200'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('offset must be a non-negative integer'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);

    const { status, from, to, jurisdiction, tax_type, limit = '50', offset = '0' } = req.query;

    const filters: taxCalendarService.TaxCalendarFilters = {
      status: status as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      jurisdiction: jurisdiction as string | undefined,
      tax_type: tax_type as string | undefined,
    };

    const pagination: taxCalendarService.PaginationOptions = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    };

    const result = await taxCalendarService.listEntries(supabase, clientId, filters, pagination);

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TAX_CALENDAR_VIEWED,
      entity_type: 'tax_calendar',
      entity_id: clientId,
      metadata: {
        from: filters.from,
        to: filters.to,
        status: filters.status,
        jurisdiction: filters.jurisdiction,
        tax_type: filters.tax_type,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    });

    res.json(result);
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/calendar/summary:
 *   get:
 *     summary: Get tax calendar summary statistics
 *     description: Retrieve aggregated counts and statistics for tax calendar entries (status cards for homepage)
 *     tags:
 *       - Tax Calendar
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter entries from this date (ISO 8601)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter entries up to this date (ISO 8601)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: jurisdiction
 *         schema:
 *           type: string
 *         description: Filter by jurisdiction
 *       - in: query
 *         name: tax_type
 *         schema:
 *           type: string
 *         description: Filter by tax type
 *       - in: query
 *         name: period_label
 *         schema:
 *           type: string
 *         description: Filter by period label
 *       - in: query
 *         name: dueSoonDays
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days to consider for due soon calculation
 *       - in: query
 *         name: breakdown
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include breakdown by tax type
 *     responses:
 *       200:
 *         description: Summary statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     by_status:
 *                       type: object
 *                     overdue:
 *                       type: number
 *                     due_soon:
 *                       type: number
 *                     by_tax_type:
 *                       type: object
 *                 meta:
 *                   type: object
 *                   properties:
 *                     today:
 *                       type: string
 *                       format: date
 *                     due_soon_to:
 *                       type: string
 *                       format: date
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxCalendarRouter.get(
  '/summary',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('from').optional().isISO8601().withMessage('Invalid date format for from'),
    query('to').optional().isISO8601().withMessage('Invalid date format for to'),
    query('status').optional().isIn(TAX_CALENDAR_STATUS_VALUES).withMessage('Invalid status value'),
    query('jurisdiction').optional().isString().withMessage('Invalid jurisdiction format'),
    query('tax_type').optional().isString().withMessage('Invalid tax_type format'),
    query('period_label').optional().isString().withMessage('Invalid period_label format'),
    query('dueSoonDays')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('dueSoonDays must be between 1 and 365'),
    query('breakdown')
      .optional()
      .isBoolean()
      .withMessage('breakdown must be a boolean'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);

    const {
      status,
      from,
      to,
      jurisdiction,
      tax_type,
      period_label,
      dueSoonDays = '30',
      breakdown = 'true',
    } = req.query;

    const filters: taxCalendarService.TaxCalendarFilters = {
      status: status as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      jurisdiction: jurisdiction as string | undefined,
      tax_type: tax_type as string | undefined,
      period_label: period_label as string | undefined,
    };

    const options: taxCalendarService.SummaryOptions = {
      dueSoonDays: parseInt(dueSoonDays as string, 10),
      includeBreakdown: String(breakdown).toLowerCase() === 'true',
    };

    const result = await taxCalendarService.getSummary(supabase, clientId, filters, options);

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TAX_CALENDAR_SUMMARY_VIEWED,
      entity_type: 'tax_calendar',
      entity_id: clientId,
      metadata: {
        from: filters.from,
        to: filters.to,
        status: filters.status,
        jurisdiction: filters.jurisdiction,
        tax_type: filters.tax_type,
        period_label: filters.period_label,
        dueSoonDays: options.dueSoonDays,
        includeBreakdown: options.includeBreakdown,
      },
    });

    res.json(result);
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/calendar/upcoming:
 *   get:
 *     summary: Get upcoming tax calendar deadlines
 *     description: Retrieve upcoming tax calendar entries for homepage widget
 *     tags:
 *       - Tax Calendar
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 24
 *           default: 3
 *         description: Number of months to look ahead
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Maximum number of entries to return
 *       - in: query
 *         name: jurisdiction
 *         schema:
 *           type: string
 *         description: Filter by jurisdiction
 *       - in: query
 *         name: tax_type
 *         schema:
 *           type: string
 *         description: Filter by tax type
 *       - in: query
 *         name: period_label
 *         schema:
 *           type: string
 *         description: Filter by period label
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (if omitted, excludes done entries by default)
 *     responses:
 *       200:
 *         description: List of upcoming tax calendar entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TaxCalendarEntry'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                     range:
 *                       type: object
 *                       properties:
 *                         from:
 *                           type: string
 *                           format: date
 *                         to:
 *                           type: string
 *                           format: date
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxCalendarRouter.get(
  '/upcoming',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('months')
      .optional()
      .isInt({ min: 1, max: 24 })
      .withMessage('months must be between 1 and 24'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('limit must be between 1 and 50'),
    query('jurisdiction').optional().isString().withMessage('Invalid jurisdiction format'),
    query('tax_type').optional().isString().withMessage('Invalid tax_type format'),
    query('period_label').optional().isString().withMessage('Invalid period_label format'),
    query('status').optional().isIn(TAX_CALENDAR_STATUS_VALUES).withMessage('Invalid status value'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);

    const {
      months = '3',
      limit = '10',
      jurisdiction,
      tax_type,
      period_label,
      status,
    } = req.query;

    const filters: taxCalendarService.TaxCalendarFilters = {
      status: status as string | undefined,
      jurisdiction: jurisdiction as string | undefined,
      tax_type: tax_type as string | undefined,
      period_label: period_label as string | undefined,
    };

    const options: taxCalendarService.UpcomingOptions = {
      months: parseInt(months as string, 10),
      limit: parseInt(limit as string, 10),
    };

    const result = await taxCalendarService.getUpcoming(supabase, clientId, filters, options);

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.TAX_CALENDAR_UPCOMING_VIEWED,
      entity_type: 'tax_calendar',
      entity_id: clientId,
      metadata: {
        status: filters.status,
        jurisdiction: filters.jurisdiction,
        tax_type: filters.tax_type,
        period_label: filters.period_label,
        months: options.months,
        limit: options.limit,
      },
    });

    res.json(result);
  })
);

