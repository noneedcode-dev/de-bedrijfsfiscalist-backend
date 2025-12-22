// src/modules/taxCalendar/taxCalendar.routes.ts
import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';

export const taxCalendarRouter = Router({ mergeParams: true });

const DEFAULT_TZ = process.env.APP_DEFAULT_TZ || 'Europe/Amsterdam';

// Admin bypass: use service-role client to query across tenants; clients remain restricted by RLS.
function getSupabase(req: any, accessToken: string) {
  return req.user?.role === 'admin'
    ? createSupabaseAdminClient()
    : createSupabaseUserClient(accessToken);
}

function isoDateInTZ(timeZone: string = DEFAULT_TZ, date?: Date): string {
  const d = date || new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * @openapi
 * /api/clients/{clientId}/tax/calendar:
 *   get:
 *     summary: Get tax calendar entries
 *     description: Retrieve tax calendar entries for a specific client with optional filters
 *     tags:
 *       - Tax Calendar
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
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
 *     responses:
 *       200:
 *         description: List of tax calendar entries
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
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 */
taxCalendarRouter.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('from').optional().isISO8601().withMessage('Invalid date format for from'),
    query('to').optional().isISO8601().withMessage('Invalid date format for to'),
    query('status').optional().isString().withMessage('Invalid status format'),
    query('jurisdiction').optional().isString().withMessage('Invalid jurisdiction format'),
    query('tax_type').optional().isString().withMessage('Invalid tax_type format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw new AppError('Missing Bearer token', 401);
    }

    const supabase = getSupabase(req, token);

    const { status, from, to, jurisdiction, tax_type } = req.query;

    let query = supabase
      .from('tax_return_calendar_entries')
      .select('*')
      .eq('client_id', clientId);

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    if (jurisdiction && typeof jurisdiction === 'string') {
      query = query.eq('jurisdiction', jurisdiction);
    }

    if (tax_type && typeof tax_type === 'string') {
      query = query.eq('tax_type', tax_type);
    }

    if (from && typeof from === 'string') {
      query = query.gte('deadline', from);
    }

    if (to && typeof to === 'string') {
      query = query.lte('deadline', to);
    }

    const { data, error } = await query.order('deadline', { ascending: true });

    if (error) {
      throw new AppError(
        `Failed to fetch tax calendar entries: ${error.message}`,
        500
      );
    }

    res.json({
      data,
      meta: {
        count: data?.length ?? 0,
        timestamp: new Date().toISOString(),
      },
    });
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
 *       - BearerAuth: []
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
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 */
taxCalendarRouter.get(
  '/summary',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('from').optional().isISO8601().withMessage('Invalid date format for from'),
    query('to').optional().isISO8601().withMessage('Invalid date format for to'),
    query('status').optional().isString().withMessage('Invalid status format'),
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
      throw new AppError('Missing Bearer token', 401);
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

    const dueSoonDaysNum = parseInt(dueSoonDays as string, 10);
    const breakdownStr = String(breakdown);
    const includeBreakdown = breakdownStr.toLowerCase() === 'true';

    let query = supabase
      .from('tax_return_calendar_entries')
      .select('status, deadline, tax_type')
      .eq('client_id', clientId);

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    if (jurisdiction && typeof jurisdiction === 'string') {
      query = query.eq('jurisdiction', jurisdiction);
    }

    if (tax_type && typeof tax_type === 'string') {
      query = query.eq('tax_type', tax_type);
    }

    if (period_label && typeof period_label === 'string') {
      query = query.eq('period_label', period_label);
    }

    if (from && typeof from === 'string') {
      query = query.gte('deadline', from);
    }

    if (to && typeof to === 'string') {
      query = query.lte('deadline', to);
    }

    const { data, error } = await query;

    if (error) {
      throw new AppError(
        `Failed to fetch tax calendar summary: ${error.message}`,
        500
      );
    }

    const today = isoDateInTZ(DEFAULT_TZ);
    const dueSoonTo = isoDateInTZ(DEFAULT_TZ, addDays(new Date(), dueSoonDaysNum));

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

      if (deadline < today && entryStatus !== 'done') {
        summary.overdue++;
      }

      if (deadline >= today && deadline <= dueSoonTo && entryStatus !== 'done') {
        summary.due_soon++;
      }

      if (includeBreakdown) {
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

        if (deadline < today && entryStatus !== 'done') {
          summary.by_tax_type[taxType].overdue++;
        }

        if (deadline >= today && deadline <= dueSoonTo && entryStatus !== 'done') {
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

    if (includeBreakdown) {
      responseData.by_tax_type = summary.by_tax_type;
    }

    res.json({
      data: responseData,
      meta: {
        today,
        due_soon_to: dueSoonTo,
        timestamp: new Date().toISOString(),
      },
    });
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
 *       - BearerAuth: []
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
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
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
    query('status').optional().isString().withMessage('Invalid status format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw new AppError('Missing Bearer token', 401);
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

    const monthsNum = parseInt(months as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const from = isoDateInTZ(DEFAULT_TZ);
    const to = isoDateInTZ(DEFAULT_TZ, addMonths(new Date(), monthsNum));

    let query = supabase
      .from('tax_return_calendar_entries')
      .select('*')
      .eq('client_id', clientId)
      .gte('deadline', from)
      .lte('deadline', to);

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    } else {
      query = query.neq('status', 'done');
    }

    if (jurisdiction && typeof jurisdiction === 'string') {
      query = query.eq('jurisdiction', jurisdiction);
    }

    if (tax_type && typeof tax_type === 'string') {
      query = query.eq('tax_type', tax_type);
    }

    if (period_label && typeof period_label === 'string') {
      query = query.eq('period_label', period_label);
    }

    query = query.order('deadline', { ascending: true }).limit(limitNum);

    const { data, error } = await query;

    if (error) {
      throw new AppError(
        `Failed to fetch upcoming tax calendar entries: ${error.message}`,
        500
      );
    }

    res.json({
      data,
      meta: {
        count: data?.length ?? 0,
        range: {
          from,
          to,
        },
        timestamp: new Date().toISOString(),
      },
    });
  })
);

