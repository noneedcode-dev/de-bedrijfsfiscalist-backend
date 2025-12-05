// src/modules/taxCalendar/taxCalendar.routes.ts
import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';

export const taxCalendarRouter = Router({ mergeParams: true });

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

    const supabase = createSupabaseUserClient(token);

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

