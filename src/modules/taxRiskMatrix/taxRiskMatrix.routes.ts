import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import * as taxRiskMatrixService from './taxRiskMatrix.service';
import { ErrorCodes } from '../../constants/errorCodes';
import { UpdateMatrixRequestSchema } from './taxRiskMatrix.schema';

export const taxRiskMatrixRouter = Router({ mergeParams: true });

function getSupabase(req: any, accessToken: string) {
  return req.user?.role === 'admin'
    ? createSupabaseAdminClient()
    : createSupabaseUserClient(accessToken);
}

function requireAdmin(req: any) {
  if (req.user?.role !== 'admin') {
    throw AppError.fromCode(ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403);
  }
}

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-matrix:
 *   get:
 *     summary: Get tax risk matrix
 *     description: Retrieve the tax risk matrix for a client with Excel-based cell ranges (B3:E8 and J14:N14). Returns matrix cells with colors for risk classification.
 *     tags:
 *       - Tax Risk Matrix
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
 *     responses:
 *       200:
 *         description: Tax risk matrix data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     client_id:
 *                       type: string
 *                       format: uuid
 *                     sections:
 *                       type: object
 *                       properties:
 *                         B3:E8:
 *                           type: object
 *                           properties:
 *                             rows:
 *                               type: integer
 *                               example: 6
 *                             cols:
 *                               type: integer
 *                               example: 4
 *                             cells:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   row:
 *                                     type: integer
 *                                   col:
 *                                     type: integer
 *                                   value_text:
 *                                     type: string
 *                                   value_number:
 *                                     type: number
 *                                   color:
 *                                     type: string
 *                                     enum: [green, orange, red, none]
 *                         J14:N14:
 *                           type: object
 *                           properties:
 *                             rows:
 *                               type: integer
 *                               example: 1
 *                             cols:
 *                               type: integer
 *                               example: 5
 *                             cells:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   row:
 *                                     type: integer
 *                                   col:
 *                                     type: integer
 *                                   value_text:
 *                                     type: string
 *                                   value_number:
 *                                     type: number
 *                                   color:
 *                                     type: string
 *                                     enum: [green, orange, red, none]
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxRiskMatrixRouter.get(
  '/',
  [param('clientId').isUUID().withMessage('Invalid clientId format')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);

    const data = await taxRiskMatrixService.getMatrixForClient(supabase, clientId);

    res.json({ data });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-matrix:
 *   put:
 *     summary: Update tax risk matrix
 *     description: Update the tax risk matrix for a client. Admin-only endpoint. Upserts cells by (client_id, section, row_index, col_index).
 *     tags:
 *       - Tax Risk Matrix
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sections
 *             properties:
 *               sections:
 *                 type: object
 *                 properties:
 *                   B3:E8:
 *                     type: object
 *                     required:
 *                       - rows
 *                       - cols
 *                       - cells
 *                     properties:
 *                       rows:
 *                         type: integer
 *                         example: 6
 *                       cols:
 *                         type: integer
 *                         example: 4
 *                       cells:
 *                         type: array
 *                         items:
 *                           type: object
 *                           required:
 *                             - row
 *                             - col
 *                             - color
 *                           properties:
 *                             row:
 *                               type: integer
 *                               minimum: 0
 *                             col:
 *                               type: integer
 *                               minimum: 0
 *                             value_text:
 *                               type: string
 *                             value_number:
 *                               type: number
 *                             color:
 *                               type: string
 *                               enum: [green, orange, red, none]
 *                   J14:N14:
 *                     type: object
 *                     required:
 *                       - rows
 *                       - cols
 *                       - cells
 *                     properties:
 *                       rows:
 *                         type: integer
 *                         example: 1
 *                       cols:
 *                         type: integer
 *                         example: 5
 *                       cells:
 *                         type: array
 *                         items:
 *                           type: object
 *                           required:
 *                             - row
 *                             - col
 *                             - color
 *                           properties:
 *                             row:
 *                               type: integer
 *                               minimum: 0
 *                             col:
 *                               type: integer
 *                               minimum: 0
 *                             value_text:
 *                               type: string
 *                             value_number:
 *                               type: number
 *                             color:
 *                               type: string
 *                               enum: [green, orange, red, none]
 *     responses:
 *       200:
 *         description: Matrix updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     client_id:
 *                       type: string
 *                       format: uuid
 *                     sections:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxRiskMatrixRouter.put(
  '/',
  [param('clientId').isUUID().withMessage('Invalid clientId format')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    if (!req.user) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    requireAdmin(req);

    const supabase = createSupabaseAdminClient();

    const parseResult = UpdateMatrixRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(
        `Invalid request body: ${parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        400
      );
    }

    const data = await taxRiskMatrixService.updateMatrixForClient(
      supabase,
      clientId,
      parseResult.data,
      req.user.sub
    );

    res.json({ data });
  })
);

