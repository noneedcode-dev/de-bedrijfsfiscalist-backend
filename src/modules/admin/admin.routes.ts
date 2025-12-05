// src/modules/admin/admin.routes.ts
import { Router, Request, Response } from 'express';
import { query, param, body } from 'express-validator';
import crypto from 'node:crypto';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { requireRole } from '../auth/auth.middleware';
import { DbClient, DbAppUser, DbInvitation } from '../../types/database';
import { emailService } from '../../lib/emailService';
import { logger } from '../../config/logger';
import { env } from '../../config/env';

export const adminRouter = Router();

// Tüm admin rotalarında önce admin kontrolü
adminRouter.use(requireRole('admin'));

/**
 * GET /api/admin/clients
 * Tüm client'ları listele
 * Opsiyonel: search, limit, offset
 */
adminRouter.get(
  '/clients',
  [
    query('search').optional().isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

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

    return res.json({
      data: (data ?? []) as DbClient[],
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

    // 2) Opsiyonel: ilk kullanıcıyı oluştur (Supabase Auth ile)
    let createdUser: DbAppUser | null = null;
    if (firstUser?.email) {
      try {
        const userRole = firstUser.role ?? 'client';
        const userClientId = userRole === 'client' ? clientId : null;

        // Supabase Auth'da kullanıcı oluştur ve davet et
        const frontendUrl = env.nodeEnv === 'production' 
          ? process.env.FRONTEND_URL 
          : (process.env.FRONTEND_URL || 'http://localhost:3000');

        const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
          firstUser.email,
          {
            data: {
              role: userRole,
              client_id: userClientId,
              full_name: firstUser.full_name ?? null,
            },
            redirectTo: `${frontendUrl}/accept-invite`,
          }
        );

        if (authError || !authData.user) {
          throw new Error(`Supabase Auth error: ${authError?.message ?? 'User creation failed'}`);
        }

        // app_users tablosuna Supabase Auth ID ile kaydet
        const { data: userRow, error: userError } = await supabase
          .from('app_users')
          .insert({
            id: authData.user.id, // Gerçek Supabase Auth ID
            email: firstUser.email,
            role: userRole,
            client_id: userClientId,
            full_name: firstUser.full_name ?? null,
          })
          .select('*')
          .single();

        if (userError || !userRow) {
          // Rollback: Supabase Auth user'ı sil
          await supabase.auth.admin.deleteUser(authData.user.id);
          throw new Error(userError?.message ?? 'Kullanıcı oluşturulamadı');
        }

        createdUser = userRow as DbAppUser;

        logger.info('First user created via Supabase Auth and invited', {
          userId: createdUser.id,
          email: createdUser.email,
          clientId,
        });
      } catch (userCreationError: any) {
        // Rollback: client'ı geri sil
        await supabase.from('clients').delete().eq('id', clientId);
        throw new AppError(
          `Client oluşturuldu ama ilk kullanıcı oluşturulamadı: ${userCreationError.message}`,
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
 * GET /api/admin/users
 * Tüm kullanıcıları listele
 * Opsiyonel: clientId ile filtre
 */
adminRouter.get(
  '/users',
  [
    query('clientId')
      .optional()
      .isUUID()
      .withMessage('Geçerli bir client UUID gerekli'),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.query.clientId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const supabase = createSupabaseAdminClient();

    let queryBuilder = supabase
      .from('app_users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (clientId) {
      queryBuilder = queryBuilder.eq('client_id', clientId);
    }

    const { data, error, count } = await queryBuilder
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(`Kullanıcılar getirilemedi: ${error.message}`, 500);
    }

    return res.json({
      data: (data ?? []) as DbAppUser[],
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

    // 1. Email'in zaten kayıtlı olup olmadığını kontrol et
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw new AppError('Bu email adresi zaten kayıtlı', 400);
    }

    // 2. Client bilgisini al (client role için)
    let clientName: string | undefined;
    if (role === 'client' && client_id) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('name')
        .eq('id', client_id)
        .single();
      clientName = clientData?.name;
    }

    // 3. Davetiye token oluştur (72 saat geçerli)
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    // 4. Invitations tablosuna kaydet
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .insert({
        email,
        role,
        client_id: role === 'client' ? client_id : null,
        invited_by: req.user?.sub,
        token: inviteToken,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select('*')
      .single();

    if (inviteError || !invitation) {
      throw new AppError(
        `Davetiye oluşturulamadı: ${inviteError?.message ?? 'Bilinmeyen hata'}`,
        500
      );
    }

    // 5. Supabase Auth ile kullanıcı davet et
    const frontendUrl = env.nodeEnv === 'production' 
      ? process.env.FRONTEND_URL 
      : (process.env.FRONTEND_URL || 'http://localhost:3000');

    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          role,
          client_id: role === 'client' ? client_id : null,
          full_name: full_name ?? null,
          invitation_id: invitation.id,
        },
        redirectTo: `${frontendUrl}/accept-invite?token=${inviteToken}`,
      }
    );

    if (authError || !authData.user) {
      // Rollback: invitation kaydını sil
      await supabase.from('invitations').delete().eq('id', invitation.id);
      throw new AppError(
        `Supabase Auth davetiye gönderilemedi: ${authError?.message}`,
        500
      );
    }

    // 6. app_users tablosuna Supabase Auth ID ile kaydet
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .insert({
        id: authData.user.id, // Gerçek Supabase Auth ID
        email,
        role,
        client_id: role === 'client' ? client_id : null,
        full_name: full_name ?? null,
      })
      .select('*')
      .single();

    if (userError) {
      logger.error('User record creation failed after Auth invite', {
        error: userError,
        userId: authData.user.id,
      });
      // Don't rollback Auth user - they can still accept invite
    }

    // 7. Email gönder (console-only for development)
    try {
      const invitedByUser = req.user?.sub 
        ? (await supabase.from('app_users').select('full_name').eq('id', req.user.sub).single()).data?.full_name 
        : 'Admin';

      await emailService.sendInvitation({
        to: email,
        invitedBy: invitedByUser || 'Admin',
        clientName,
        acceptUrl: `${frontendUrl}/accept-invite?token=${inviteToken}`,
        expiresInHours: 72,
      });
    } catch (emailError) {
      logger.error('Failed to send invitation email', { error: emailError, email });
      // Don't fail the request if email fails
    }

    logger.info('User invited successfully', {
      userId: authData.user.id,
      email,
      role,
      invitationId: invitation.id,
    });

    return res.status(201).json({
      data: {
        user: userData as DbAppUser,
        invitation: invitation as DbInvitation,
      },
      meta: {
        message: 'Kullanıcı başarıyla davet edildi. Davetiye emaili gönderildi.',
        timestamp: new Date().toISOString(),
      },
    });
  })
);

