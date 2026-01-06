import { Router, Request, Response } from 'express';
import { param, body } from 'express-validator';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import * as taxFunctionService from './taxFunction.service';
import { ErrorCodes } from '../../constants/errorCodes';

export const taxFunctionRouter = Router({ mergeParams: true });

function getSupabase(req: any, accessToken: string) {
  return req.user?.role === 'admin'
    ? createSupabaseAdminClient()
    : createSupabaseUserClient(accessToken);
}

/**
 * @openapi
 * /api/clients/{clientId}/tax/function:
 *   get:
 *     summary: Get tax function data
 *     description: Retrieve tax function rows and columns for a specific client
 *     tags:
 *       - Tax Function
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
 *         description: Tax function data with columns and rows
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     columns:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:
 *                             type: string
 *                           label:
 *                             type: string
 *                     rows:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           row_index:
 *                             type: number
 *                           cells:
 *                             type: object
 *                 meta:
 *                   type: object
 *                   properties:
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
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
taxFunctionRouter.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
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
    const isAdminBypass = req.user?.role === 'admin';

    const result = await taxFunctionService.getTaxFunction(supabase, clientId, isAdminBypass);

    res.json(result);
  })
);

taxFunctionRouter.post(
  '/import',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    body('rows').isArray().withMessage('rows must be an array'),
    body('mode').equals('replace').withMessage('Only "replace" mode is supported'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { rows } = req.body;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);
    const isAdminBypass = req.user?.role === 'admin';

    const result = await taxFunctionService.importTaxFunction(
      supabase,
      clientId,
      rows,
      isAdminBypass
    );

    res.json(result);
  })
);
