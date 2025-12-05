// src/modules/documents/documents.routes.ts
import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';

export const documentsRouter = Router({ mergeParams: true });

/**
 * @openapi
 * /api/clients/{clientId}/documents:
 *   get:
 *     summary: Get documents
 *     description: Retrieve documents for a specific client with optional filters
 *     tags:
 *       - Documents
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
 *         name: source
 *         schema:
 *           type: string
 *         description: Filter by document source
 *       - in: query
 *         name: kind
 *         schema:
 *           type: string
 *         description: Filter by document kind/type
 *     responses:
 *       200:
 *         description: List of documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
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
documentsRouter.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('source').optional().isString().withMessage('Invalid source format'),
    query('kind').optional().isString().withMessage('Invalid kind format'),
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

    const { source, kind } = req.query;

    let query = supabase.from('documents').select('*').eq('client_id', clientId);

    if (source && typeof source === 'string') {
      query = query.eq('source', source);
    }

    if (kind && typeof kind === 'string') {
      query = query.eq('kind', kind);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      throw new AppError(`Failed to fetch documents: ${error.message}`, 500);
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

