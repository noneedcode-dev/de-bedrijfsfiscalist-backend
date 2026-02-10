// src/modules/admin/admin.routes.ts
import { Router, Request, Response } from 'express';
import { query, param, body } from 'express-validator';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { requireRole } from '../auth/auth.middleware';
import { DbClient, DbAppUser, DbInvitation, DbAppUserListItem, DbDocument } from '../../types/database';
import { logger } from '../../config/logger';
import { invitationService } from '../../services/invitationService';
import { auditLogService } from '../../services/auditLogService';
import { provisioningService } from '../../services/provisioningService';
import { AuditActions } from '../../constants/auditActions';
import { ErrorCodes } from '../../constants/errorCodes';
import * as planConfigsService from '../planConfigs/planConfigs.service';
import * as clientPlansService from '../clientPlans/clientPlans.service';
import * as invoicesService from '../invoices/invoices.service';

export const adminRouter = Router();

// Tüm admin rotalarında önce admin kontrolü
adminRouter.use(requireRole('admin'));

/**
 * @openapi
 * /api/admin/clients:
 *   get:
 *     summary: List all clients
 *     description: Retrieve a paginated list of all clients. Optionally include related users.
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search clients by name or slug
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of clients to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of clients to skip
 *       - in: query
 *         name: include_users
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include related users for each client
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - $ref: '#/components/schemas/Client'
 *                       - $ref: '#/components/schemas/ClientWithUsers'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
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
adminRouter.get(
  '/clients',
  [
    query('search').optional().isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('include_users').optional().isBoolean().toBoolean(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const includeUsers = (req.query.include_users as unknown as boolean) === true;

    const supabase = createSupabaseAdminClient();

    let queryBuilder = supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) {
      queryBuilder = queryBuilder.or(
        `name.ilike.%${search}%,slug.ilike.%${search}%`
      );
    }

    const { data, error, count } = await queryBuilder
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(`Client'lar getirilemedi: ${error.message}`, 500);
    }

    const clients = (data ?? []) as DbClient[];

    // Always fetch user counts for all clients
    if (clients.length > 0) {
      const clientIds = clients.map(c => c.id);

      // Fetch all users for these clients
      const { data: usersData, error: usersError } = await supabase
        .from('app_users')
        .select('id, email, full_name, role, is_active, created_at, client_id')
        .in('client_id', clientIds);

      if (usersError) {
        throw new AppError(`Kullanıcılar getirilemedi: ${usersError.message}`, 500);
      }

      // Group users by client_id
      const usersByClientId = new Map<string, DbAppUser[]>();
      (usersData ?? []).forEach((user: any) => {
        if (user.client_id) {
          if (!usersByClientId.has(user.client_id)) {
            usersByClientId.set(user.client_id, []);
          }
          usersByClientId.get(user.client_id)!.push(user as DbAppUser);
        }
      });

      // If include_users is true, attach users array and users_count
      if (includeUsers) {
        const clientsWithUsers = clients.map(client => ({
          ...client,
          users: usersByClientId.get(client.id) ?? [],
          users_count: usersByClientId.get(client.id)?.length ?? 0,
        }));

        return res.json({
          data: clientsWithUsers,
          meta: {
            count: count ?? clients.length,
            limit,
            offset,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // If include_users is false, only attach users_count
      const clientsWithCount = clients.map(client => ({
        ...client,
        users_count: usersByClientId.get(client.id)?.length ?? 0,
      }));

      return res.json({
        data: clientsWithCount,
        meta: {
          count: count ?? clients.length,
          limit,
          offset,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // No clients found
    return res.json({
      data: [],
      meta: {
        count: count ?? 0,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * @openapi
 * /api/admin/clients/{id}:
 *   get:
 *     summary: Get a single client by ID
 *     description: Retrieve detailed information for a specific client
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Client'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
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
adminRouter.get(
  '/clients/:id',
  [param('id').isUUID().withMessage('Geçerli bir UUID gerekli')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new AppError('Client bulunamadı', 404);
      }
      throw new AppError(`Client getirilemedi: ${error.message}`, 500);
    }

    return res.json({
      data: data as DbClient,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/admin/clients
 * Yeni client oluştur + (opsiyonel) ilk user + TCF provision stub
 */
adminRouter.post(
  '/clients',
  [
    body('name').isString().trim().notEmpty().withMessage('Client adı gerekli'),
    body('slug')
      .optional()
      .isString()
      .trim()
      .toLowerCase()
      .matches(/^[a-z0-9-]+$/)
      .withMessage('Slug sadece küçük harf, sayı ve tire içerebilir'),
    body('country').optional().isString().trim(),
    body('firstUser').optional().isObject(),
    body('firstUser.email')
      .if(body('firstUser').exists())
      .isEmail()
      .withMessage('Geçerli bir email gerekli'),
    body('firstUser.full_name').optional().isString().trim(),
    body('firstUser.role')
      .optional()
      .isIn(['admin', 'client'])
      .withMessage('Role admin veya client olmalı'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, slug, country, firstUser } = req.body;
    const supabase = createSupabaseAdminClient();

    // 1) Client kaydını oluştur
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        name,
        slug: slug ?? null,
        country: country ?? null,
      })
      .select('*')
      .single();

    if (clientError || !client) {
      throw new AppError(
        `Client oluşturulamadı: ${clientError?.message ?? 'Bilinmeyen hata'}`,
        500
      );
    }

    const clientId = client.id as string;

    // 2) Opsiyonel: ilk kullanıcıyı oluştur (standardized invitation flow)
    let createdUser: DbAppUser | null = null;
    let createdInvitation: DbInvitation | null = null;
    if (firstUser?.email) {
      try {
        const userRole = firstUser.role ?? 'client';
        const userClientId = userRole === 'client' ? clientId : null;

        // Use shared invitation service
        const result = await invitationService.inviteUser(supabase, {
          email: firstUser.email,
          role: userRole,
          client_id: userClientId,
          full_name: firstUser.full_name ?? null,
          invited_by: req.user?.sub,
          clientName: client.name,
        });

        createdUser = result.user;
        createdInvitation = result.invitation;

        logger.info('First user invited via standardized flow', {
          userId: createdUser.id,
          email: createdUser.email,
          clientId,
          invitationId: createdInvitation.id,
        });
      } catch (userCreationError: any) {
        // Rollback: client'ı geri sil
        await supabase.from('clients').delete().eq('id', clientId);
        throw new AppError(
          `Client oluşturuldu ama ilk kullanıcı davet edilemedi: ${userCreationError.message}`,
          500
        );
      }
    }

    // 3) Provision default templates for the new client
    let provisioningResult;
    try {
      provisioningResult = await provisioningService.provisionDefaultTemplates(
        supabase,
        clientId
      );
      logger.info('Default templates provisioned for new client', {
        clientId,
        provisioningResult,
      });
    } catch (provisioningError: any) {
      // Rollback: delete the client and any created user/invitation
      logger.error('Provisioning failed, rolling back client creation', {
        clientId,
        error: provisioningError.message,
      });

      if (createdInvitation) {
        await supabase.from('invitations').delete().eq('id', createdInvitation.id);
      }
      if (createdUser) {
        await supabase.from('app_users').delete().eq('id', createdUser.id);
      }
      await supabase.from('clients').delete().eq('id', clientId);

      throw new AppError(
        `Client oluşturuldu ancak şablon verileri yüklenemedi. İşlem geri alındı: ${provisioningError.message}`,
        500
      );
    }

    // 4) Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.CLIENT_CREATED,
      entity_type: 'client',
      entity_id: clientId,
      metadata: {
        client_name: client.name,
        client_slug: client.slug,
        first_user_invited: !!createdUser,
        first_user_email: createdUser?.email,
        provisioning: {
          tax_calendar_count: provisioningResult.taxCalendarCount,
          risk_matrix_count: provisioningResult.riskMatrixCount,
          risk_control_count: provisioningResult.riskControlCount,
          tax_function_count: provisioningResult.taxFunctionCount,
        },
      },
    });

    return res.status(201).json({
      data: {
        client: client as DbClient,
        firstUser: createdUser,
        invitation: createdInvitation,
        provisioning: {
          tax_calendar_count: provisioningResult.taxCalendarCount,
          risk_matrix_count: provisioningResult.riskMatrixCount,
          risk_control_count: provisioningResult.riskControlCount,
          tax_function_count: provisioningResult.taxFunctionCount,
        },
      },
      meta: {
        message: createdUser 
          ? 'Client oluşturuldu, şablon verileri yüklendi ve ilk kullanıcıya davetiye emaili gönderildi.'
          : 'Client oluşturuldu ve şablon verileri yüklendi.',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     summary: List all users
 *     description: Retrieve a paginated list of all users with optional filters for role, client_id, and search.
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, client]
 *         description: Filter users by role
 *       - in: query
 *         name: client_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter users by client ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search users by email or full name (case-insensitive)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of users to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of users to skip
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AppUser'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
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
adminRouter.get(
  '/users',
  [
    query('role')
      .optional()
      .isIn(['admin', 'client'])
      .withMessage('Role must be either admin or client'),
    query('client_id')
      .optional()
      .isUUID()
      .withMessage('Geçerli bir client UUID gerekli'),
    query('search')
      .optional()
      .isString()
      .trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.id || 'unknown';
    const role = req.query.role as 'admin' | 'client' | undefined;
    const clientId = req.query.client_id as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    logger.info('GET /api/admin/users - Request received', {
      request_id: requestId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      filters: { role, client_id: clientId, search: search ? '[redacted]' : undefined },
      pagination: { limit, offset },
    });

    const supabase = createSupabaseAdminClient();

    let queryBuilder = supabase
      .from('app_users')
      .select('id, email, full_name, role, is_active, created_at, client_id', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (role) {
      queryBuilder = queryBuilder.eq('role', role);
    }

    if (clientId) {
      queryBuilder = queryBuilder.eq('client_id', clientId);
    }

    if (search) {
      queryBuilder = queryBuilder.or(
        `email.ilike.%${search}%,full_name.ilike.%${search}%`
      );
    }

    const { data, error, count } = await queryBuilder
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('GET /api/admin/users - Supabase query failed', {
        request_id: requestId,
        error: error.message,
        error_code: error.code,
        filters: { role, client_id: clientId },
      });
      throw new AppError(`Kullanıcılar getirilemedi: ${error.message}`, 500);
    }

    logger.info('GET /api/admin/users - Success', {
      request_id: requestId,
      results_count: data?.length ?? 0,
      total_count: count ?? 0,
      filters: { role, client_id: clientId },
    });

    return res.json({
      data: (data ?? []) as DbAppUserListItem[],
      meta: {
        count: count ?? data?.length ?? 0,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/admin/users/invite
 * Yeni kullanıcı davet et
 * Production: Supabase Auth ile gerçek invite akışı + email gönderimi
 */
adminRouter.post(
  '/users/invite',
  [
    body('email').isEmail().withMessage('Geçerli bir email gerekli'),
    body('role')
      .isIn(['admin', 'client'])
      .withMessage('Role admin veya client olmalı'),
    body('client_id')
      .if(body('role').equals('client'))
      .isUUID()
      .withMessage('Client rolü için client_id gerekli'),
    body('full_name').optional().isString().trim(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, role, client_id, full_name } = req.body;
    const supabase = createSupabaseAdminClient();

    // Get client name for email (if client role)
    let clientName: string | undefined;
    if (role === 'client' && client_id) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('name')
        .eq('id', client_id)
        .single();
      clientName = clientData?.name;
    }

    // Use shared invitation service
    const result = await invitationService.inviteUser(supabase, {
      email,
      role,
      client_id: role === 'client' ? client_id : null,
      full_name: full_name ?? null,
      invited_by: req.user?.sub,
      clientName,
    });

    // Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: role === 'client' ? client_id : undefined,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.USER_INVITED,
      entity_type: 'user',
      entity_id: result.user.id,
      metadata: {
        invited_email: email,
        invited_role: role,
        invitation_id: result.invitation.id,
      },
    });

    return res.status(201).json({
      data: {
        user: result.user,
        invitation: result.invitation,
      },
      meta: {
        message: 'Kullanıcı başarıyla davet edildi. Davetiye emaili gönderildi.',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/admin/clients/:clientId/companies
 * Admin belirli bir client altında company oluşturur veya günceller (UPSERT)
 * 1-to-1 ilişki: Her client'ın sadece 1 company'si olabilir
 */
adminRouter.post(
  '/clients/:clientId/companies',
  [
    param('clientId').isUUID().withMessage('Geçerli bir client UUID gerekli'),
    body('name').isString().trim().notEmpty().withMessage('Company adı gerekli'),
    body('country').optional().isString().trim(),
    body('kvk').optional().isString().trim(),
    body('vat').optional().isString().trim(),
    body('fiscal_year_end').optional().isString().trim(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const { name, country, kvk, vat, fiscal_year_end } = req.body;
    const supabase = createSupabaseAdminClient();

    // 1) Client'ın var olduğunu kontrol et
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      if (clientError?.code === 'PGRST116') {
        throw new AppError('Client bulunamadı', 404);
      }
      throw new AppError(`Client kontrol edilemedi: ${clientError?.message}`, 500);
    }

    // 2) Company upsert (client_id unique constraint ile)
    const payload = {
      client_id: clientId,
      name,
      country: country ?? null,
      kvk: kvk ?? null,
      vat: vat ?? null,
      fiscal_year_end: fiscal_year_end ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .upsert(payload, { onConflict: 'client_id' })
      .select('*')
      .single();

    if (companyError || !company) {
      throw new AppError(
        `Company upsert edilemedi: ${companyError?.message ?? 'Bilinmeyen hata'}`,
        500
      );
    }

    logger.info('Company upserted by admin', {
      companyId: company.id,
      clientId,
      adminId: req.user?.sub,
    });

    // Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.COMPANY_UPSERTED,
      entity_type: 'company',
      entity_id: company.id,
      metadata: {
        company_name: company.name,
        company_kvk: company.kvk,
        company_vat: company.vat,
      },
    });

    return res.json({
      data: {
        company,
      },
      meta: {
        message: 'Company başarıyla kaydedildi.',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/admin/clients/:clientId/companies
 * Admin belirli bir client'ın company'sini getirir (1-to-1 ilişki)
 */
adminRouter.get(
  '/clients/:clientId/companies',
  [
    param('clientId').isUUID().withMessage('Geçerli bir client UUID gerekli'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const supabase = createSupabaseAdminClient();

    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      throw new AppError(`Company getirilemedi: ${error.message}`, 500);
    }

    return res.json({
      data: {
        company: company ?? null,
      },
      meta: {
        message: 'Company getirildi.',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * @openapi
 * /api/admin/audit-logs:
 *   get:
 *     summary: List audit logs with filters
 *     description: Retrieve a paginated list of audit logs with optional filters for client_id, action, and date range. Admin only.
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: client_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by client ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type (e.g., DOCUMENTS_LIST_VIEWED, CLIENT_CREATED)
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date (ISO 8601 format)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs until this date (ISO 8601 format)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of logs to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of logs to skip
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       client_id:
 *                         type: string
 *                         format: uuid
 *                       actor_user_id:
 *                         type: string
 *                         format: uuid
 *                       actor_role:
 *                         type: string
 *                       action:
 *                         type: string
 *                       entity_type:
 *                         type: string
 *                       entity_id:
 *                         type: string
 *                         format: uuid
 *                       metadata:
 *                         type: object
 *                 count:
 *                   type: integer
 *                   description: Total number of matching records
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
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
adminRouter.get(
  '/audit-logs',
  [
    query('client_id')
      .optional()
      .isUUID()
      .withMessage('client_id must be a valid UUID'),
    query('action')
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage('action must be a non-empty string'),
    query('from')
      .optional()
      .isISO8601()
      .withMessage('from must be a valid ISO 8601 date'),
    query('to')
      .optional()
      .isISO8601()
      .withMessage('to must be a valid ISO 8601 date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('offset must be a non-negative integer'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.query.client_id as string | undefined;
    const action = req.query.action as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const supabase = createSupabaseAdminClient();

    let queryBuilder = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (clientId) {
      queryBuilder = queryBuilder.eq('client_id', clientId);
    }

    if (action) {
      queryBuilder = queryBuilder.eq('action', action);
    }

    if (from) {
      queryBuilder = queryBuilder.gte('created_at', from);
    }

    if (to) {
      queryBuilder = queryBuilder.lte('created_at', to);
    }

    const { data, error, count } = await queryBuilder
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Failed to fetch audit logs', {
        error: error.message,
        filters: { clientId, action, from, to },
      });
      throw new AppError(`Audit logs getirilemedi: ${error.message}`, 500);
    }

    return res.json({
      results: data ?? [],
      count: count ?? 0,
      limit,
      offset,
    });
  })
);

/**
 * @openapi
 * /api/admin/documents:
 *   get:
 *     summary: List documents across all clients
 *     description: Retrieve a paginated list of documents with optional filters for client_id and search. Admin only.
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: client_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by client ID
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search documents by name (case-insensitive)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of documents to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of documents to skip
 *       - in: query
 *         name: include_deleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include soft-deleted documents (reserved for future use)
 *     responses:
 *       200:
 *         description: Successful response
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
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
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
adminRouter.get(
  '/documents',
  [
    query('client_id')
      .optional()
      .isUUID()
      .withMessage('client_id must be a valid UUID'),
    query('q')
      .optional()
      .isString()
      .trim(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('offset must be a non-negative integer'),
    query('include_deleted')
      .optional()
      .isBoolean()
      .toBoolean(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.query.client_id as string | undefined;
    const searchQuery = req.query.q as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const includeDeleted = (req.query.include_deleted as unknown as boolean) === true;

    const supabase = createSupabaseAdminClient();

    let queryBuilder = supabase
      .from('documents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (clientId) {
      queryBuilder = queryBuilder.eq('client_id', clientId);
    }

    if (searchQuery) {
      queryBuilder = queryBuilder.ilike('name', `%${searchQuery}%`);
    }

    const { data, error, count } = await queryBuilder
      .range(offset, offset + limit - 1);

    if (error) {
      const errorMsg = error.message || error.code || 'Unknown error';
      logger.error('Failed to fetch documents for admin', {
        error: errorMsg,
        error_code: error.code,
        filters: { clientId, searchQuery, includeDeleted },
      });
      throw new AppError(`Documents getirilemedi: ${errorMsg}`, 500);
    }

    const total = count ?? 0;

    // Audit log (non-blocking)
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.ADMIN_DOCUMENTS_LISTED,
      entity_type: 'document',
      metadata: {
        filters: {
          client_id: clientId || null,
          q: searchQuery || null,
          include_deleted: includeDeleted,
        },
        result_count: data?.length ?? 0,
        total_count: total,
        pagination: {
          limit,
          offset,
        },
      },
    });

    return res.json({
      data: (data ?? []) as DbDocument[],
      meta: {
        total,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * @openapi
 * /api/admin/messages/export:
 *   get:
 *     summary: Export messages as CSV
 *     description: Export messages within a date range with streaming CSV output
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date (ISO 8601)
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date (ISO 8601)
 *       - in: query
 *         name: client_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional client filter
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv]
 *           default: csv
 *         description: Export format (only CSV supported)
 *     responses:
 *       200:
 *         description: CSV file stream
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       422:
 *         description: Validation error (date range > 31 days or row count > 100k)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
adminRouter.get(
  '/messages/export',
  [
    query('from')
      .isISO8601()
      .withMessage('from must be a valid ISO 8601 date'),
    query('to')
      .isISO8601()
      .withMessage('to must be a valid ISO 8601 date'),
    query('client_id')
      .optional()
      .isUUID()
      .withMessage('client_id must be a valid UUID'),
    query('format')
      .optional()
      .isIn(['csv'])
      .withMessage('format must be csv'),
    handleValidationErrors,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { from, to, client_id, format = 'csv' } = req.query;
    const actorUserId = req.user?.sub;

    if (!actorUserId) {
      throw AppError.fromCode(ErrorCodes.UNAUTHORIZED, 401);
    }

    // Validate date range (max 31 days)
    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);
    const daysDiff = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 31) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
        message: 'Date range cannot exceed 31 days',
        max_days: 31,
        requested_days: daysDiff,
      });
    }

    if (fromDate > toDate) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
        message: 'from date must be before to date',
      });
    }

    const supabase = createSupabaseAdminClient();

    // Count total rows first
    let countQuery = supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', from as string)
      .lte('created_at', to as string);

    if (client_id) {
      countQuery = countQuery.eq('client_id', client_id as string);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      throw new AppError('Failed to count messages', 500, ErrorCodes.INTERNAL_ERROR, countError);
    }

    if (count && count > 100000) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 422, {
        message: 'Result set too large',
        max_rows: 100000,
        actual_rows: count,
      });
    }

    // Set response headers for CSV download
    const filename = `messages_export_${fromDate.toISOString().split('T')[0]}_${toDate.toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Dynamic import csv-stringify
    const { stringify } = await import('csv-stringify');

    const stringifier = stringify({
      header: true,
      columns: [
        { key: 'message_id', header: 'message_id' },
        { key: 'created_at', header: 'created_at' },
        { key: 'client_id', header: 'client_id' },
        { key: 'conversation_id', header: 'conversation_id' },
        { key: 'sender_user_id', header: 'sender_user_id' },
        { key: 'sender_role', header: 'sender_role' },
        { key: 'body', header: 'body' },
        { key: 'attachment_count', header: 'attachment_count' },
      ],
    });

    stringifier.pipe(res);

    // Stream messages in batches
    const BATCH_SIZE = 2000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let batchQuery = supabase
        .from('messages')
        .select('id, created_at, client_id, conversation_id, sender_user_id, sender_role, body')
        .gte('created_at', from as string)
        .lte('created_at', to as string)
        .order('created_at', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (client_id) {
        batchQuery = batchQuery.eq('client_id', client_id as string);
      }

      const { data: messages, error: batchError } = await batchQuery;

      if (batchError) {
        stringifier.end();
        throw new AppError('Failed to fetch messages batch', 500, ErrorCodes.INTERNAL_ERROR, batchError);
      }

      if (!messages || messages.length === 0) {
        hasMore = false;
        break;
      }

      // Fetch attachment counts for this batch
      const messageIds = messages.map((m: any) => m.id);
      const { data: attachmentCounts } = await supabase
        .from('message_attachments')
        .select('message_id')
        .in('message_id', messageIds);

      const attachmentCountMap = new Map<string, number>();
      if (attachmentCounts) {
        for (const att of attachmentCounts as any[]) {
          attachmentCountMap.set(
            att.message_id,
            (attachmentCountMap.get(att.message_id) || 0) + 1
          );
        }
      }

      // Write batch to CSV
      for (const msg of messages as any[]) {
        stringifier.write({
          message_id: msg.id,
          created_at: msg.created_at,
          client_id: msg.client_id,
          conversation_id: msg.conversation_id,
          sender_user_id: msg.sender_user_id,
          sender_role: msg.sender_role,
          body: msg.body,
          attachment_count: attachmentCountMap.get(msg.id) || 0,
        });
      }

      offset += BATCH_SIZE;
      hasMore = messages.length === BATCH_SIZE;
    }

    stringifier.end();

    // Audit log
    auditLogService.logAsync({
      client_id: (client_id as string) || undefined,
      actor_user_id: actorUserId,
      actor_role: 'admin',
      action: AuditActions.EXPORT_MESSAGES,
      entity_type: 'message',
      entity_id: undefined,
      metadata: {
        from: from as string,
        to: to as string,
        client_id: (client_id as string) || undefined,
        row_count: count || 0,
        format,
      },
    });
  })
);

/**
 * GET /api/admin/plan-configs
 * List all plan configurations
 */
adminRouter.get(
  '/plan-configs',
  [
    query('active_only')
      .optional()
      .isBoolean()
      .toBoolean()
      .withMessage('active_only must be a boolean'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const activeOnly = (req.query.active_only as unknown as boolean) === true;
    const supabase = createSupabaseAdminClient();

    const planConfigs = await planConfigsService.listPlanConfigs(supabase, {
      activeOnly,
    });

    return res.json({
      data: planConfigs,
      meta: {
        count: planConfigs.length,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/admin/plan-configs/:planCode
 * Get a specific plan configuration
 */
adminRouter.get(
  '/plan-configs/:planCode',
  [
    param('planCode')
      .isIn(['NONE', 'BASIC', 'PRO'])
      .withMessage('planCode must be NONE, BASIC, or PRO'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { planCode } = req.params;
    const supabase = createSupabaseAdminClient();

    const planConfig = await planConfigsService.getPlanConfig(
      supabase,
      planCode as 'NONE' | 'BASIC' | 'PRO'
    );

    return res.json({
      data: planConfig,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * PATCH /api/admin/plan-configs/:planCode
 * Update a plan configuration
 */
adminRouter.patch(
  '/plan-configs/:planCode',
  [
    param('planCode')
      .isIn(['NONE', 'BASIC', 'PRO'])
      .withMessage('planCode must be NONE, BASIC, or PRO'),
    body('display_name')
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage('display_name must be a non-empty string'),
    body('free_minutes_monthly')
      .optional()
      .isInt({ min: 0 })
      .withMessage('free_minutes_monthly must be a non-negative integer'),
    body('hourly_rate_eur')
      .optional()
      .isDecimal()
      .withMessage('hourly_rate_eur must be a decimal number'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { planCode } = req.params;
    const { display_name, free_minutes_monthly, hourly_rate_eur, is_active } = req.body;
    const supabase = createSupabaseAdminClient();

    const updatedConfig = await planConfigsService.updatePlanConfig(supabase, {
      planCode: planCode as 'NONE' | 'BASIC' | 'PRO',
      updates: {
        display_name,
        free_minutes_monthly,
        hourly_rate_eur,
        is_active,
      },
    });

    // Audit log
    auditLogService.logAsync({
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.PLAN_CONFIG_UPDATED,
      entity_type: 'plan_config',
      entity_id: planCode,
      metadata: {
        plan_code: planCode,
        updates: {
          display_name,
          free_minutes_monthly,
          hourly_rate_eur,
          is_active,
        },
      },
    });

    return res.json({
      data: updatedConfig,
      meta: {
        message: 'Plan configuration updated successfully',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/admin/clients/:clientId/plan-assignments
 * Assign a plan to a client
 */
adminRouter.post(
  '/clients/:clientId/plan-assignments',
  [
    param('clientId').isUUID().withMessage('clientId must be a valid UUID'),
    body('plan_code')
      .isIn(['NONE', 'BASIC', 'PRO'])
      .withMessage('plan_code must be NONE, BASIC, or PRO'),
    body('effective_from')
      .isDate()
      .withMessage('effective_from must be a valid date (YYYY-MM-DD)'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const { plan_code, effective_from } = req.body;
    const supabase = createSupabaseAdminClient();

    // Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      throw new AppError('Client not found', 404, ErrorCodes.CLIENT_NOT_FOUND);
    }

    const result = await clientPlansService.assignPlan(supabase, {
      clientId,
      planCode: plan_code,
      effectiveFrom: effective_from,
      assignedBy: req.user?.sub,
    });

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: result.previousPlan
        ? AuditActions.CLIENT_PLAN_CHANGED
        : AuditActions.CLIENT_PLAN_ASSIGNED,
      entity_type: 'client_plan',
      entity_id: result.newPlan.id,
      metadata: {
        client_name: client.name,
        previous_plan: result.previousPlan
          ? {
              plan_code: result.previousPlan.plan_code,
              effective_to: result.previousPlan.effective_to,
            }
          : null,
        new_plan: {
          plan_code: result.newPlan.plan_code,
          effective_from: result.newPlan.effective_from,
        },
      },
    });

    return res.status(201).json({
      data: {
        previous_plan: result.previousPlan,
        new_plan: result.newPlan,
      },
      meta: {
        message: 'Plan assigned successfully',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/admin/clients/:clientId/plan-assignments
 * Get plan assignment history for a client
 */
adminRouter.get(
  '/clients/:clientId/plan-assignments',
  [param('clientId').isUUID().withMessage('clientId must be a valid UUID')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const supabase = createSupabaseAdminClient();

    const planHistory = await clientPlansService.listPlanHistory(supabase, clientId);

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.CLIENT_PLAN_HISTORY_VIEWED,
      entity_type: 'client_plan',
      metadata: {
        history_count: planHistory.length,
      },
    });

    return res.json({
      data: planHistory,
      meta: {
        count: planHistory.length,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/admin/clients/:clientId/plan
 * Get current plan for a client
 */
adminRouter.get(
  '/clients/:clientId/plan',
  [param('clientId').isUUID().withMessage('clientId must be a valid UUID')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const supabase = createSupabaseAdminClient();

    const currentPlan = await clientPlansService.getCurrentPlan(supabase, clientId);

    return res.json({
      data: currentPlan,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/admin/clients/:clientId/invoices
 * Create an invoice for a client
 */
adminRouter.post(
  '/clients/:clientId/invoices',
  [
    param('clientId').isUUID().withMessage('clientId must be a valid UUID'),
    body('title').isString().trim().notEmpty().withMessage('title is required'),
    body('description').optional().isString().trim(),
    body('currency').optional().isString().trim(),
    body('amount_total').isDecimal().withMessage('amount_total must be a decimal number'),
    body('due_date').isDate().withMessage('due_date must be a valid date'),
    body('period_start').optional().isDate().withMessage('period_start must be a valid date'),
    body('period_end').optional().isDate().withMessage('period_end must be a valid date'),
    body('auto_calculate').optional().isBoolean().withMessage('auto_calculate must be a boolean'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const {
      title,
      description,
      currency,
      amount_total,
      due_date,
      period_start,
      period_end,
      auto_calculate,
    } = req.body;
    const supabase = createSupabaseAdminClient();

    const invoice = await invoicesService.createInvoice(supabase, {
      clientId,
      title,
      description,
      currency,
      amountTotal: amount_total,
      dueDate: due_date,
      periodStart: period_start,
      periodEnd: period_end,
      autoCalculate: auto_calculate,
      createdBy: req.user?.sub,
    });

    // Audit log
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.INVOICE_CREATED,
      entity_type: 'invoice',
      entity_id: invoice.id,
      metadata: {
        invoice_no: invoice.invoice_no,
        title: invoice.title,
        amount_total: invoice.amount_total,
        due_date: invoice.due_date,
        period_start: invoice.period_start,
        period_end: invoice.period_end,
        auto_calculated: auto_calculate,
        billable_minutes_snapshot: invoice.billable_minutes_snapshot,
      },
    });

    return res.status(201).json({
      data: invoice,
      meta: {
        message: 'Invoice created successfully',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/admin/invoices
 * List all invoices (admin-wide view)
 */
adminRouter.get(
  '/invoices',
  [
    query('client_id').optional().isUUID().withMessage('client_id must be a valid UUID'),
    query('status')
      .optional()
      .isIn(['OPEN', 'REVIEW', 'PAID', 'CANCELLED'])
      .withMessage('status must be OPEN, REVIEW, PAID, or CANCELLED'),
    query('from').optional().isISO8601().withMessage('from must be a valid ISO 8601 date'),
    query('to').optional().isISO8601().withMessage('to must be a valid ISO 8601 date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100')
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('offset must be a non-negative integer')
      .toInt(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.query.client_id as string | undefined;
    const status = req.query.status as 'OPEN' | 'REVIEW' | 'PAID' | 'CANCELLED' | undefined;
    const fromDate = req.query.from as string | undefined;
    const toDate = req.query.to as string | undefined;
    const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
    const offset = typeof req.query.offset === 'number' ? req.query.offset : 0;

    const supabase = createSupabaseAdminClient();

    const { data, count } = await invoicesService.listInvoices(supabase, {
      clientId,
      status,
      fromDate,
      toDate,
      limit,
      offset,
    });

    return res.json({
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
 * GET /api/admin/invoices/:invoiceId
 * Get a specific invoice (admin view)
 */
adminRouter.get(
  '/invoices/:invoiceId',
  [param('invoiceId').isUUID().withMessage('invoiceId must be a valid UUID')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { invoiceId } = req.params;
    const supabase = createSupabaseAdminClient();

    const invoice = await invoicesService.getInvoice(supabase, invoiceId);

    return res.json({
      data: invoice,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/admin/invoices/:invoiceId/decision
 * Approve or cancel an invoice
 */
adminRouter.post(
  '/invoices/:invoiceId/decision',
  [
    param('invoiceId').isUUID().withMessage('invoiceId must be a valid UUID'),
    body('decision')
      .isIn(['approve', 'cancel'])
      .withMessage('decision must be approve or cancel'),
    body('review_note').optional().isString().trim(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { invoiceId } = req.params;
    const { decision, review_note } = req.body;
    const supabase = createSupabaseAdminClient();

    const updatedInvoice = await invoicesService.reviewInvoice(supabase, {
      invoiceId,
      decision,
      reviewNote: review_note,
      reviewedBy: req.user?.sub,
    });

    // Audit log
    auditLogService.logAsync({
      client_id: updatedInvoice.client_id,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: decision === 'approve' ? AuditActions.INVOICE_APPROVED : AuditActions.INVOICE_CANCELLED,
      entity_type: 'invoice',
      entity_id: invoiceId,
      metadata: {
        invoice_no: updatedInvoice.invoice_no,
        decision,
        review_note,
        previous_status: 'REVIEW',
        new_status: updatedInvoice.status,
      },
    });

    return res.json({
      data: updatedInvoice,
      meta: {
        message: `Invoice ${decision === 'approve' ? 'approved' : 'cancelled'} successfully`,
        timestamp: new Date().toISOString(),
      },
    });
  })
);
