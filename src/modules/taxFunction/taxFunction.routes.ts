import { Router, Request, Response } from 'express';
import { param, body } from 'express-validator';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import * as taxFunctionService from './taxFunction.service';
import { ErrorCodes } from '../../constants/errorCodes';
import { requireRole } from '../auth/auth.middleware';

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
  requireRole('admin'),
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

/**
 * @openapi
 * /api/clients/{clientId}/tax/function/rows:
 *   post:
 *     summary: Create a new tax function row
 *     description: Create a new tax function row for inline editing
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_index
 *               - process_name
 *             properties:
 *               order_index:
 *                 type: integer
 *                 minimum: 0
 *               process_name:
 *                 type: string
 *                 minLength: 1
 *               process_description:
 *                 type: string
 *               stakeholders:
 *                 oneOf:
 *                   - type: array
 *                     items:
 *                       type: string
 *                   - type: string
 *               frequency:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tax function row created successfully
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxFunctionRouter.post(
  '/rows',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    body('order_index')
      .notEmpty()
      .isInt({ min: 0 })
      .withMessage('order_index is required and must be an integer >= 0'),
    body('process_name')
      .notEmpty()
      .isString()
      .isLength({ min: 1 })
      .withMessage('process_name is required and must be a non-empty string'),
    body('process_description').optional().isString().withMessage('process_description must be a string'),
    body('frequency').optional().isString().withMessage('frequency must be a string'),
    body('notes').optional().isString().withMessage('notes must be a string'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { order_index, process_name, process_description, stakeholders, frequency, notes, accountable, consulted, informed } = req.body;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);
    const isAdminBypass = req.user?.role === 'admin';

    // Normalize stakeholders: accept array or comma-separated string
    let normalizedStakeholders: string[] | undefined = undefined;
    if (stakeholders !== undefined) {
      if (Array.isArray(stakeholders)) {
        normalizedStakeholders = stakeholders.filter((s: any) => typeof s === 'string');
      } else if (typeof stakeholders === 'string') {
        normalizedStakeholders = stakeholders.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      }
    }

    // Normalize accountable, consulted, informed
    const normalizeField = (value: any): string[] | undefined => {
      if (value === undefined) return undefined;
      if (Array.isArray(value)) {
        return value.filter((s: any) => typeof s === 'string');
      } else if (typeof value === 'string') {
        return value.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      }
      return undefined;
    };

    const payload: taxFunctionService.CreateRowInput = {
      order_index,
      process_name,
      process_description,
      stakeholders: normalizedStakeholders,
      frequency,
      notes,
      accountable: normalizeField(accountable),
      consulted: normalizeField(consulted),
      informed: normalizeField(informed),
    };

    const result = await taxFunctionService.createRow(supabase, clientId, payload, isAdminBypass);

    res.status(201).json({ data: result });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/function/rows/reorder:
 *   patch:
 *     summary: Reorder tax function rows
 *     description: Bulk update order_index for multiple rows
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - order_index
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     order_index:
 *                       type: integer
 *                       minimum: 0
 *     responses:
 *       200:
 *         description: Rows reordered successfully
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxFunctionRouter.patch(
  '/rows/reorder',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    body('updates')
      .isArray({ min: 1 })
      .withMessage('updates is required and must be a non-empty array')
      .custom((updates) => {
        if (!Array.isArray(updates)) {
          throw new Error('updates must be an array');
        }
        for (const update of updates) {
          if (!update.id || typeof update.id !== 'string') {
            throw new Error('Each update must have an id field');
          }
          // UUID regex validation
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(update.id)) {
            throw new Error('Each update must have a valid UUID id');
          }
          if (typeof update.order_index !== 'number' || update.order_index < 0) {
            throw new Error('Each update must have an order_index >= 0');
          }
        }
        return true;
      }),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const { updates } = req.body;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);
    const isAdminBypass = req.user?.role === 'admin';

    await taxFunctionService.reorderRows(supabase, clientId, updates, isAdminBypass);

    res.json({ data: { success: true, updated: updates.length } });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/function/rows/{id}:
 *   patch:
 *     summary: Update a tax function row
 *     description: Update an existing tax function row (partial update)
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
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Row ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               order_index:
 *                 type: integer
 *                 minimum: 0
 *               process_name:
 *                 type: string
 *                 minLength: 1
 *               process_description:
 *                 type: string
 *               stakeholders:
 *                 oneOf:
 *                   - type: array
 *                     items:
 *                       type: string
 *                   - type: string
 *               frequency:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tax function row updated successfully
 *       404:
 *         description: Row not found
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxFunctionRouter.patch(
  '/rows/:id',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
    body('order_index')
      .optional()
      .isInt({ min: 0 })
      .withMessage('order_index must be an integer >= 0'),
    body('process_name')
      .optional()
      .isString()
      .isLength({ min: 1 })
      .withMessage('process_name must be a non-empty string'),
    body('process_description').optional().isString().withMessage('process_description must be a string'),
    body('frequency').optional().isString().withMessage('frequency must be a string'),
    body('notes').optional().isString().withMessage('notes must be a string'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const id = req.params.id;
    const { order_index, process_name, process_description, stakeholders, frequency, notes, accountable, consulted, informed } = req.body;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);
    const isAdminBypass = req.user?.role === 'admin';

    // Normalize stakeholders: accept array or comma-separated string
    let normalizedStakeholders: string[] | undefined = undefined;
    if (stakeholders !== undefined) {
      if (Array.isArray(stakeholders)) {
        normalizedStakeholders = stakeholders.filter((s: any) => typeof s === 'string');
      } else if (typeof stakeholders === 'string') {
        normalizedStakeholders = stakeholders.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      }
    }

    // Normalize accountable, consulted, informed
    const normalizeField = (value: any): string[] | undefined => {
      if (value === undefined) return undefined;
      if (Array.isArray(value)) {
        return value.filter((s: any) => typeof s === 'string');
      } else if (typeof value === 'string') {
        return value.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      }
      return undefined;
    };

    const patch: taxFunctionService.UpdateRowInput = {};
    if (order_index !== undefined) patch.order_index = order_index;
    if (process_name !== undefined) patch.process_name = process_name;
    if (process_description !== undefined) patch.process_description = process_description;
    if (normalizedStakeholders !== undefined) patch.stakeholders = normalizedStakeholders;
    if (frequency !== undefined) patch.frequency = frequency;
    if (notes !== undefined) patch.notes = notes;
    if (accountable !== undefined) patch.accountable = normalizeField(accountable);
    if (consulted !== undefined) patch.consulted = normalizeField(consulted);
    if (informed !== undefined) patch.informed = normalizeField(informed);

    const result = await taxFunctionService.updateRow(supabase, clientId, id, patch, isAdminBypass);

    res.json({ data: result });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/function/rows/{id}:
 *   delete:
 *     summary: Delete a tax function row
 *     description: Delete an existing tax function row
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
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Row ID
 *     responses:
 *       204:
 *         description: Tax function row deleted successfully
 *       404:
 *         description: Row not found
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxFunctionRouter.delete(
  '/rows/:id',
  requireRole('admin'),
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const id = req.params.id;

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const supabase = getSupabase(req, token);
    const isAdminBypass = req.user?.role === 'admin';

    await taxFunctionService.deleteRow(supabase, clientId, id, isAdminBypass);

    res.status(204).send();
  })
);
