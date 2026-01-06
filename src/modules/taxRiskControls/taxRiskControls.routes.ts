import { Router, Request, Response } from 'express';
import { param, query, body } from 'express-validator';
import { createSupabaseAdminClient, createSupabaseUserClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import * as taxRiskControlsService from './taxRiskControls.service';
import { ErrorCodes } from '../../constants/errorCodes';

export const taxRiskControlsRouter = Router({ mergeParams: true });

function getSupabase(req: any, accessToken: string) {
  return req.user?.role === 'admin'
    ? createSupabaseAdminClient()
    : createSupabaseUserClient(accessToken);
}

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-controls:
 *   post:
 *     summary: Create a new risk control
 *     description: Create a new tax risk control entry for a client
 *     tags:
 *       - Tax Risk Controls
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
 *               - risk_description
 *               - chance
 *               - impact
 *               - control_measure
 *             properties:
 *               process_name:
 *                 type: string
 *                 description: Process name (will be upserted if process_id not provided)
 *               process_id:
 *                 type: string
 *                 format: uuid
 *                 description: Process ID (optional if process_name provided)
 *               risk_description:
 *                 type: string
 *               response:
 *                 type: string
 *                 enum: [Mitigate, Monitor, Accept]
 *                 default: Monitor
 *               chance:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               impact:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               control_measure:
 *                 type: string
 *               owner_user_id:
 *                 type: string
 *                 format: uuid
 *                 description: Owner user ID (admin only, defaults to creator)
 *     responses:
 *       200:
 *         description: Risk control created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     process_name:
 *                       type: string
 *                       nullable: true
 *                       description: Process name from tax_function_rows
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
taxRiskControlsRouter.post(
  '/',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    body('process_name').optional().isString().withMessage('process_name must be a string'),
    body('process_id').optional().isUUID().withMessage('Invalid process_id format'),
    body('risk_description').notEmpty().isString().withMessage('risk_description is required'),
    body('owner_user_id').optional().isUUID().withMessage('Invalid owner_user_id format'),
    body('response')
      .optional()
      .isIn(['Mitigate', 'Monitor', 'Accept'])
      .withMessage('response must be one of: Mitigate, Monitor, Accept'),
    body('chance')
      .notEmpty()
      .isInt({ min: 1, max: 5 })
      .withMessage('chance must be an integer between 1 and 5'),
    body('impact')
      .notEmpty()
      .isInt({ min: 1, max: 5 })
      .withMessage('impact must be an integer between 1 and 5'),
    body('control_measure').notEmpty().isString().withMessage('control_measure is required'),
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

    if (!req.user) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const input: taxRiskControlsService.CreateRiskControlInput = {
      process_name: req.body.process_name,
      process_id: req.body.process_id,
      risk_description: req.body.risk_description,
      response: req.body.response,
      chance: parseInt(req.body.chance, 10),
      impact: parseInt(req.body.impact, 10),
      control_measure: req.body.control_measure,
      owner_user_id: req.body.owner_user_id,
    };

    const data = await taxRiskControlsService.createRiskControl(supabase, clientId, input, req.user);

    res.json({ data });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-controls:
 *   get:
 *     summary: List risk controls
 *     description: Retrieve tax risk control entries with optional filters and pagination
 *     tags:
 *       - Tax Risk Controls
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
 *         name: process_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by process ID
 *       - in: query
 *         name: response
 *         schema:
 *           type: string
 *           enum: [Mitigate, Monitor, Accept]
 *         description: Filter by response type
 *       - in: query
 *         name: min_score
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 25
 *         description: Filter by minimum inherent score
 *       - in: query
 *         name: max_score
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 25
 *         description: Filter by maximum inherent score
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [created_desc, score_desc]
 *           default: created_desc
 *         description: Sort order
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
 *         description: List of risk controls with pagination metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       process_name:
 *                         type: string
 *                         nullable: true
 *                         description: Process name from tax_function_rows
 *                 meta:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     count:
 *                       type: integer
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
taxRiskControlsRouter.get(
  '/',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    query('process_id').optional().isUUID().withMessage('Invalid process_id format'),
    query('response')
      .optional()
      .isIn(['Mitigate', 'Monitor', 'Accept'])
      .withMessage('response must be one of: Mitigate, Monitor, Accept'),
    query('min_score')
      .optional()
      .isInt({ min: 1, max: 25 })
      .withMessage('min_score must be an integer between 1 and 25'),
    query('max_score')
      .optional()
      .isInt({ min: 1, max: 25 })
      .withMessage('max_score must be an integer between 1 and 25'),
    query('sort')
      .optional()
      .isIn(['created_desc', 'score_desc'])
      .withMessage('sort must be one of: created_desc, score_desc'),
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

    const { process_id, response, min_score, max_score, sort, limit = '50', offset = '0' } = req.query;

    const filters: taxRiskControlsService.RiskControlFilters = {
      process_id: process_id as string | undefined,
      response: response as string | undefined,
      min_score: min_score ? parseInt(min_score as string, 10) : undefined,
      max_score: max_score ? parseInt(max_score as string, 10) : undefined,
      sort: sort as string | undefined,
    };

    const pagination: taxRiskControlsService.PaginationOptions = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    };

    const result = await taxRiskControlsService.listRiskControls(supabase, clientId, filters, pagination);

    res.json(result);
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-controls/summary:
 *   get:
 *     summary: Get risk summary
 *     description: Retrieve aggregated risk summary including total risks, counts by level and status, and top 5 open risks
 *     tags:
 *       - Tax Risk Controls
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
 *         description: Risk summary data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_risks:
 *                       type: integer
 *                       description: Total number of risks
 *                     by_level:
 *                       type: object
 *                       properties:
 *                         green:
 *                           type: integer
 *                         amber:
 *                           type: integer
 *                         red:
 *                           type: integer
 *                     by_status:
 *                       type: object
 *                       properties:
 *                         open:
 *                           type: integer
 *                         closed:
 *                           type: integer
 *                     top_risks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           title:
 *                             type: string
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
 *                             minimum: 1
 *                             maximum: 25
 *                           level:
 *                             type: string
 *                             enum: [green, amber, red]
 *                           status:
 *                             type: string
 *                             enum: [open, closed]
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
taxRiskControlsRouter.get(
  '/summary',
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

    const data = await taxRiskControlsService.getRiskSummary(supabase, clientId);

    res.json({ data });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-controls/heatmap:
 *   get:
 *     summary: Get risk heatmap
 *     description: Retrieve 5x5 risk heatmap aggregation by likelihood and impact with counts per cell
 *     tags:
 *       - Tax Risk Controls
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
 *         description: Risk heatmap data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     cells:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           likelihood:
 *                             type: integer
 *                             minimum: 1
 *                             maximum: 5
 *                           impact:
 *                             type: integer
 *                             minimum: 1
 *                             maximum: 5
 *                           count_total:
 *                             type: integer
 *                           by_level:
 *                             type: object
 *                             properties:
 *                               green:
 *                                 type: integer
 *                               amber:
 *                                 type: integer
 *                               red:
 *                                 type: integer
 *                     axes:
 *                       type: object
 *                       properties:
 *                         likelihood:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           example: [1, 2, 3, 4, 5]
 *                         impact:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           example: [1, 2, 3, 4, 5]
 *                     thresholds:
 *                       type: object
 *                       properties:
 *                         green_max:
 *                           type: integer
 *                           example: 5
 *                         amber_max:
 *                           type: integer
 *                           example: 12
 *                         red_max:
 *                           type: integer
 *                           example: 25
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
taxRiskControlsRouter.get(
  '/heatmap',
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

    const data = await taxRiskControlsService.getRiskHeatmap(supabase, clientId);

    res.json({ data });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-controls/{id}:
 *   get:
 *     summary: Get risk control by ID
 *     description: Retrieve a single tax risk control entry by ID
 *     tags:
 *       - Tax Risk Controls
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
 *         description: Risk control ID
 *     responses:
 *       200:
 *         description: Risk control details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     process_name:
 *                       type: string
 *                       nullable: true
 *                       description: Process name from tax_function_rows
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxRiskControlsRouter.get(
  '/:id',
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

    const data = await taxRiskControlsService.getRiskControlById(supabase, clientId, id);

    res.json({ data });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-controls/{id}:
 *   patch:
 *     summary: Update risk control
 *     description: Update a tax risk control entry (partial update)
 *     tags:
 *       - Tax Risk Controls
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
 *         description: Risk control ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               process_name:
 *                 type: string
 *               process_id:
 *                 type: string
 *                 format: uuid
 *               risk_description:
 *                 type: string
 *               response:
 *                 type: string
 *                 enum: [Mitigate, Monitor, Accept]
 *               chance:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               impact:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               control_measure:
 *                 type: string
 *               owner_user_id:
 *                 type: string
 *                 format: uuid
 *                 description: Owner user ID (admin only)
 *     responses:
 *       200:
 *         description: Risk control updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     process_name:
 *                       type: string
 *                       nullable: true
 *                       description: Process name from tax_function_rows
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxRiskControlsRouter.patch(
  '/:id',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('id').isUUID().withMessage('Invalid id format'),
    body('process_name').optional().isString().withMessage('process_name must be a string'),
    body('process_id').optional().isUUID().withMessage('Invalid process_id format'),
    body('risk_description').optional().isString().withMessage('risk_description must be a string'),
    body('owner_user_id').optional().isUUID().withMessage('Invalid owner_user_id format'),
    body('response')
      .optional()
      .isIn(['Mitigate', 'Monitor', 'Accept'])
      .withMessage('response must be one of: Mitigate, Monitor, Accept'),
    body('chance')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('chance must be an integer between 1 and 5'),
    body('impact')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('impact must be an integer between 1 and 5'),
    body('control_measure').optional().isString().withMessage('control_measure must be a string'),
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

    if (!req.user) {
      throw AppError.fromCode(ErrorCodes.AUTH_MISSING_HEADER, 401);
    }

    const input: taxRiskControlsService.UpdateRiskControlInput = {
      process_name: req.body.process_name,
      process_id: req.body.process_id,
      risk_description: req.body.risk_description,
      response: req.body.response,
      chance: req.body.chance !== undefined ? parseInt(req.body.chance, 10) : undefined,
      impact: req.body.impact !== undefined ? parseInt(req.body.impact, 10) : undefined,
      control_measure: req.body.control_measure,
      owner_user_id: req.body.owner_user_id,
    };

    const data = await taxRiskControlsService.updateRiskControl(supabase, clientId, id, input, req.user);

    res.json({ data });
  })
);

/**
 * @openapi
 * /api/clients/{clientId}/tax/risk-controls/{id}:
 *   delete:
 *     summary: Delete risk control
 *     description: Delete a tax risk control entry
 *     tags:
 *       - Tax Risk Controls
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
 *         description: Risk control ID
 *     responses:
 *       204:
 *         description: Risk control deleted successfully
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
taxRiskControlsRouter.delete(
  '/:id',
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

    await taxRiskControlsService.deleteRiskControl(supabase, clientId, id);

    res.status(204).send();
  })
);
