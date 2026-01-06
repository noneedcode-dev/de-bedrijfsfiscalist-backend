import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import * as taxRiskMatrixService from './taxRiskMatrix.service';
import { ErrorCodes } from '../../constants/errorCodes';
import { UpdateCellRequestSchema } from './taxRiskMatrix.schema';

export const taxRiskMatrixRouter = Router({ mergeParams: true });

function getSupabase(req: any, accessToken: string) {
  return req.user?.role === 'admin'
    ? createSupabaseAdminClient()
    : createSupabaseUserClient(accessToken);
}

/**
 * @openapi
 * /api/tax-risk-matrix/initialize:
 *   post:
 *     summary: Initialize tax risk matrix
 *     description: Create default topics, dimensions, and matrix cells for a client. Idempotent operation.
 *     tags:
 *       - Tax Risk Matrix
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     responses:
 *       200:
 *         description: Matrix initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     topics_created:
 *                       type: integer
 *                       example: 8
 *                     dimensions_created:
 *                       type: integer
 *                       example: 5
 *                     cells_created:
 *                       type: integer
 *                       example: 40
 *                     total_topics:
 *                       type: integer
 *                       example: 8
 *                     total_dimensions:
 *                       type: integer
 *                       example: 5
 *                     total_cells:
 *                       type: integer
 *                       example: 40
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxRiskMatrixRouter.post(
  '/initialize',
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    if (!req.user?.client_id) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);
    const data = await taxRiskMatrixService.initializeMatrix(supabase, req.user.client_id);

    res.json({ data });
  })
);

/**
 * @openapi
 * /api/tax-risk-matrix:
 *   get:
 *     summary: Get tax risk matrix grid
 *     description: Retrieve the complete tax risk matrix with topics, dimensions, and cells with computed scores and levels.
 *     tags:
 *       - Tax Risk Matrix
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     responses:
 *       200:
 *         description: Tax risk matrix grid data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     topics:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           sort_order:
 *                             type: integer
 *                           is_active:
 *                             type: boolean
 *                     dimensions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           sort_order:
 *                             type: integer
 *                           is_active:
 *                             type: boolean
 *                     cells:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           topic_id:
 *                             type: string
 *                             format: uuid
 *                           dimension_id:
 *                             type: string
 *                             format: uuid
 *                           likelihood:
 *                             type: integer
 *                             minimum: 1
 *                             maximum: 5
 *                           impact:
 *                             type: integer
 *                             minimum: 1
 *                             maximum: 5
 *                           score:
 *                             type: integer
 *                             description: Computed as likelihood * impact
 *                           level:
 *                             type: string
 *                             enum: [green, orange, red]
 *                             description: Risk level based on score thresholds
 *                           status:
 *                             type: string
 *                             enum: [open, in_progress, closed]
 *                           notes:
 *                             type: string
 *                             nullable: true
 *                           owner_user_id:
 *                             type: string
 *                             format: uuid
 *                             nullable: true
 *                           last_reviewed_at:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxRiskMatrixRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    if (!req.user?.client_id) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);
    const data = await taxRiskMatrixService.getMatrixGrid(supabase, req.user.client_id);

    res.json({ data });
  })
);

/**
 * @openapi
 * /api/tax-risk-matrix/cells/{cellId}:
 *   patch:
 *     summary: Update a tax risk matrix cell
 *     description: Update specific fields of a matrix cell. Score and level are automatically recalculated.
 *     tags:
 *       - Tax Risk Matrix
 *     security:
 *       - ApiKeyAuth: []
 *         BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cellId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Cell ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               likelihood:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               impact:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, closed]
 *               notes:
 *                 type: string
 *               owner_user_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               last_reviewed_at:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Cell updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     topic_id:
 *                       type: string
 *                       format: uuid
 *                     dimension_id:
 *                       type: string
 *                       format: uuid
 *                     likelihood:
 *                       type: integer
 *                     impact:
 *                       type: integer
 *                     score:
 *                       type: integer
 *                     level:
 *                       type: string
 *                       enum: [green, orange, red]
 *                     status:
 *                       type: string
 *                     notes:
 *                       type: string
 *                       nullable: true
 *                     owner_user_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     last_reviewed_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxRiskMatrixRouter.patch(
  '/cells/:cellId',
  [param('cellId').isUUID().withMessage('Invalid cellId format')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const cellId = req.params.cellId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    if (!req.user?.client_id) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const parseResult = UpdateCellRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(
        `Invalid request body: ${parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        422
      );
    }

    const supabase = getSupabase(req, token);
    const data = await taxRiskMatrixService.updateCell(
      supabase,
      req.user.client_id,
      cellId,
      parseResult.data
    );

    res.json({ data });
  })
);

