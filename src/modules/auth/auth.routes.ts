// src/modules/auth/auth.routes.ts
import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { logger } from '../../config/logger';

export const authRouter = Router();

/**
 * GET /api/auth/invitation/:token
 * Davetiye bilgilerini getir (token doğrulama)
 * Public endpoint - Bubble.io'nun davetiye bilgilerini göstermesi için
 */
authRouter.get(
  '/invitation/:token',
  [param('token').isString().notEmpty().withMessage('Token gerekli')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const supabase = createSupabaseAdminClient();

    // Davetiyeyi token ile bul
    const { data: invitation, error } = await supabase
      .from('invitations')
      .select(`
        *,
        clients (
          name
        )
      `)
      .eq('token', token)
      .single();

    if (error || !invitation) {
      throw new AppError('Geçersiz veya bulunamayan davetiye linki', 404);
    }

    // Expired check
    if (new Date(invitation.expires_at) < new Date()) {
      // Mark as expired if not already
      if (invitation.status === 'pending') {
        await supabase
          .from('invitations')
          .update({ 
            status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', invitation.id);
      }
      
      throw new AppError('Davetiye süresi dolmuş', 410);
    }

    // Already accepted check
    if (invitation.status === 'accepted') {
      throw new AppError('Bu davetiye zaten kabul edilmiş. Giriş yapabilirsiniz.', 400);
    }

    // Cancelled check
    if (invitation.status === 'cancelled') {
      throw new AppError('Bu davetiye iptal edilmiş', 400);
    }

    // Return safe invitation data for UI
    return res.json({
      data: {
        email: invitation.email,
        role: invitation.role,
        clientName: invitation.clients?.name,
        expiresAt: invitation.expires_at,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * POST /api/auth/accept-invite
 * Davetiyeyi kabul et ve şifre belirle
 * Public endpoint - Kullanıcı davetiye linkinden şifre belirler
 * 
 * NOT: Bu endpoint Supabase Auth'ın email confirm flow'u ile birlikte çalışır
 */
authRouter.post(
  '/accept-invite',
  [
    body('token').isString().notEmpty().withMessage('Token gerekli'),
    body('password')
      .isString()
      .isLength({ min: 8 })
      .withMessage('Şifre en az 8 karakter olmalı')
      .matches(/[A-Z]/)
      .withMessage('Şifre en az bir büyük harf içermelidir')
      .matches(/[a-z]/)
      .withMessage('Şifre en az bir küçük harf içermelidir')
      .matches(/[0-9]/)
      .withMessage('Şifre en az bir rakam içermelidir'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body;
    const supabase = createSupabaseAdminClient();

    // 1. Davetiyeyi getir ve doğrula
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (inviteError || !invitation) {
      throw new AppError('Geçersiz davetiye', 404);
    }

    // 2. Validasyonlar
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('invitations')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', invitation.id);
      throw new AppError('Davetiye süresi dolmuş', 410);
    }

    if (invitation.status === 'accepted') {
      throw new AppError('Bu davetiye zaten kabul edilmiş. Giriş yapabilirsiniz.', 400);
    }

    if (invitation.status !== 'pending') {
      throw new AppError('Bu davetiye artık geçerli değil', 400);
    }

    // 3. app_users'dan user'ı bul
    const { data: appUser } = await supabase
      .from('app_users')
      .select('id, email')
      .eq('email', invitation.email)
      .single();

    if (!appUser) {
      throw new AppError('Kullanıcı kaydı bulunamadı. Lütfen destek ekibiyle iletişime geçin.', 404);
    }

    // 4. Supabase Auth'da şifre belirle ve email'i onayla
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      appUser.id,
      {
        password,
        email_confirm: true, // Email'i otomatik onayla
      }
    );

    if (updateError) {
      logger.error('Failed to set user password', {
        error: updateError,
        userId: appUser.id,
        email: invitation.email,
      });
      throw new AppError(`Şifre belirlenemedi: ${updateError.message}`, 500);
    }

    // 5. Davetiyeyi accepted yap
    await supabase
      .from('invitations')
      .update({ 
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    logger.info('User accepted invitation and set password', {
      userId: appUser.id,
      email: invitation.email,
      invitationId: invitation.id,
    });

    return res.json({
      data: {
        message: 'Davetiye kabul edildi. Artık giriş yapabilirsiniz.',
        email: invitation.email,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/auth/invitations
 * Tüm pending davetleri listele (admin için - future endpoint)
 * TODO: Implement when admin needs to see pending invitations
 */
// authRouter.get('/invitations', requireRole('admin'), asyncHandler(async (req, res) => { ... }));

/**
 * DELETE /api/auth/invitation/:id
 * Davetiyeyi iptal et (admin için - future endpoint)
 * TODO: Implement when admin needs to cancel invitations
 */
// authRouter.delete('/invitation/:id', requireRole('admin'), asyncHandler(async (req, res) => { ... }));

