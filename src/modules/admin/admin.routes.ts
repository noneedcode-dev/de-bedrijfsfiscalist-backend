// src/modules/admin/admin.routes.ts
import { Router, Request, Response } from 'express';
import { query, param, body } from 'express-validator';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { requireRole } from '../auth/auth.middleware';
import { DbClient, DbAppUser, DbInvitation, DbAppUserListItem } from '../../types/database';
import { logger } from '../../config/logger';
import { invitationService } from '../../services/invitationService';

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
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
adminRouter.get(
  '/clients',
  [
    query('search').optional().isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('include_users').optional().isBoolean(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const includeUsers = req.query.include_users === 'true';

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

    // If include_users is true, fetch related users
    if (includeUsers && clients.length > 0) {
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

      // Attach users array and users_count to each client
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

    return res.json({
      data: clients,
      meta: {
        count: count ?? clients.length,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/admin/clients/:id
 * Tek bir client'ı detaylı göster
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

    // 3) Default TCF şablonlarını kopyala (şimdilik stub)
    // TODO: provisionDefaultTcfTemplates(clientId)
    // Şu an DB tarafında TCF tabloları hazır olduğunda buraya servis eklenecek.

    return res.status(201).json({
      data: {
        client: client as DbClient,
        firstUser: createdUser,
        invitation: createdInvitation,
      },
      meta: {
        message: createdUser 
          ? 'Client oluşturuldu ve ilk kullanıcıya davetiye emaili gönderildi.'
          : 'Client oluşturuldu.',
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
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
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
    const role = req.query.role as 'admin' | 'client' | undefined;
    const clientId = req.query.client_id as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

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
      throw new AppError(`Kullanıcılar getirilemedi: ${error.message}`, 500);
    }

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
