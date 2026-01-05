// src/modules/auth/auth.routes.ts
import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { logger } from '../../config/logger';
import { ErrorCodes } from '../../constants/errorCodes';
import { createHash, randomBytes } from 'crypto';
import { env } from '../../config/env';
import { passwordResetLimiter } from '../../config/rateLimiter';

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
      throw AppError.fromCode(ErrorCodes.INVITE_INVALID_TOKEN, 404);
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
      
      throw AppError.fromCode(ErrorCodes.INVITE_EXPIRED, 410);
    }

    // Already accepted check
    if (invitation.status === 'accepted') {
      throw AppError.fromCode(ErrorCodes.INVITE_ALREADY_ACCEPTED, 400);
    }

    // Cancelled check
    if (invitation.status === 'cancelled') {
      throw AppError.fromCode(ErrorCodes.INVITE_CANCELLED, 400);
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
 * @swagger
 * /api/auth/accept-invite:
 *   post:
 *     summary: Accept invitation and set password
 *     description: Public endpoint for users to accept invitation, set password, and optionally provide full name. Returns comprehensive user data for Bubble integration.
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *                 description: Invitation token from email link
 *                 example: "a1b2c3d4e5f6..."
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: Password must contain at least 8 characters, one uppercase, one lowercase, and one number
 *                 example: "SecurePass123"
 *               full_name:
 *                 type: string
 *                 description: Optional full name of the user
 *                 example: "John Doe"
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Davetiye kabul edildi. Artık giriş yapabilirsiniz."
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: "user@example.com"
 *                     client_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     full_name:
 *                       type: string
 *                       nullable: true
 *                       example: "John Doe"
 *                     role:
 *                       type: string
 *                       enum: [admin, client]
 *                       example: "client"
 *                     clientName:
 *                       type: string
 *                       nullable: true
 *                       example: "Acme Corporation"
 *                     invitation_id:
 *                       type: string
 *                       format: uuid
 *                       example: "987e6543-e21b-12d3-a456-426614174999"
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12b-34d5-a678-901234567890"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - invitation already accepted or invalid status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Invalid invitation token or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       410:
 *         description: Invitation expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error - missing client_id or password update failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
    body('full_name').optional().isString().withMessage('full_name bir string olmalı'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { token, password, full_name } = req.body;
    const supabase = createSupabaseAdminClient();

    // 1. Davetiyeyi getir ve doğrula (client bilgisiyle birlikte)
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select(`
        *,
        clients (
          name
        )
      `)
      .eq('token', token)
      .single();

    if (inviteError || !invitation) {
      throw AppError.fromCode(ErrorCodes.INVITE_INVALID_TOKEN, 404);
    }

    // client_id kontrolü - invitation'da olmalı
    if (!invitation.client_id && invitation.role === 'client') {
      logger.error('Invitation missing client_id for client role', {
        invitationId: invitation.id,
        email: invitation.email,
      });
      throw AppError.fromCode(ErrorCodes.INVITE_CREATE_FAILED, 500, {
        reason: 'Missing client_id for client role invitation',
      });
    }

    // 2. Validasyonlar
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('invitations')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', invitation.id);
      throw AppError.fromCode(ErrorCodes.INVITE_EXPIRED, 410);
    }

    if (invitation.status === 'accepted') {
      throw AppError.fromCode(ErrorCodes.INVITE_ALREADY_ACCEPTED, 400);
    }

    if (invitation.status !== 'pending') {
      throw AppError.fromCode(ErrorCodes.INVITE_CANCELLED, 400);
    }

    // 3. app_users'dan user'ı bul
    const { data: appUser } = await supabase
      .from('app_users')
      .select('id, email, role, client_id, full_name')
      .eq('email', invitation.email)
      .single();

    if (!appUser) {
      throw AppError.fromCode(ErrorCodes.AUTH_USER_NOT_FOUND, 404);
    }

    // 3b. app_users'ı güncelle - full_name varsa set et
    if (full_name) {
      const { error: updateAppUserError } = await supabase
        .from('app_users')
        .update({ full_name })
        .eq('id', appUser.id);

      if (updateAppUserError) {
        logger.error('Failed to update app_users full_name', {
          error: updateAppUserError,
          userId: appUser.id,
        });
      }
    }

    // 4. Supabase Auth'da şifre belirle, email'i onayla ve user_metadata'yı güncelle
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      appUser.id,
      {
        password,
        email_confirm: true,
        user_metadata: {
          role: invitation.role,
          client_id: invitation.client_id || null,
          full_name: full_name || null,
          invitation_id: invitation.id,
        },
      }
    );

    if (updateError) {
      logger.error('Failed to set user password', {
        error: updateError,
        userId: appUser.id,
        email: invitation.email,
      });
      throw AppError.fromCode(ErrorCodes.USER_UPDATE_FAILED, 500, {
        reason: 'Failed to set password',
        error: updateError.message,
      });
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
      fullName: full_name,
    });

    // 6. Bubble için kapsamlı response döndür
    return res.json({
      data: {
        message: 'Davetiye kabul edildi. Artık giriş yapabilirsiniz.',
        email: invitation.email,
        client_id: invitation.client_id || null,
        full_name: full_name || appUser.full_name || null,
        role: invitation.role,
        clientName: invitation.clients?.name || null,
        invitation_id: invitation.id,
        user_id: appUser.id,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * @swagger
 * /api/auth/password-reset/request:
 *   post:
 *     summary: Request password reset token
 *     description: Generate a secure password reset token and return it (no email sent from backend). Bubble will send the email with the token.
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the user requesting password reset
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Password reset token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: Raw password reset token (only returned once, never stored)
 *                       example: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *                       description: Token expiration timestamp
 *                       example: "2025-01-06T12:30:00.000Z"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid email format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       422:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post(
  '/password-reset/request',
  passwordResetLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail(),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    const supabase = createSupabaseAdminClient();

    // Generate secure random token (32 bytes = 256 bits)
    const rawToken = randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Hash the token for storage (SHA-256)
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // Calculate expiration time
    const expiresAt = new Date(
      Date.now() + env.auth.passwordResetTokenTtlMinutes * 60 * 1000
    );

    // Store token hash in database
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert({
        email: email.toLowerCase(),
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      logger.error('Failed to create password reset token', {
        error: insertError,
        email,
      });
      throw AppError.fromCode(ErrorCodes.INTERNAL_ERROR, 500);
    }

    logger.info('Password reset token generated', {
      email,
      expires_at: expiresAt.toISOString(),
    });

    // Return raw token and expiration (token is NOT logged)
    return res.json({
      data: {
        token: rawToken,
        expires_at: expiresAt.toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * @swagger
 * /api/auth/password-reset/confirm:
 *   post:
 *     summary: Confirm password reset with token
 *     description: Validate token and update user password in Supabase Auth
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - new_password
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token from email link
 *                 example: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
 *               new_password:
 *                 type: string
 *                 format: password
 *                 minLength: 10
 *                 description: New password (min 10 chars, must include lowercase, uppercase, and digit)
 *                 example: "NewSecurePass123"
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "success"
 *                     message:
 *                       type: string
 *                       example: "Password has been reset successfully"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       422:
 *         description: Weak password or validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post(
  '/password-reset/confirm',
  [
    body('token').isString().notEmpty().withMessage('Token is required'),
    body('new_password')
      .isString()
      .isLength({ min: 10 })
      .withMessage('Password must be at least 10 characters')
      .matches(/[a-z]/)
      .withMessage('Password must contain at least one lowercase letter')
      .matches(/[A-Z]/)
      .withMessage('Password must contain at least one uppercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain at least one digit'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    // Step 1: Parse body and validate (already done by middleware)
    const { token, new_password } = req.body;
    const supabase = createSupabaseAdminClient();

    // Step 2: Compute token hash and query token record
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Step 3: Find valid token: matching hash, not used, not expired
    const { data: tokenRecord, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (tokenError || !tokenRecord) {
      logger.warn('Invalid or expired password reset token attempt', {
        error: tokenError?.message,
      });
      throw AppError.fromCode(
        ErrorCodes.PASSWORD_RESET_INVALID_OR_EXPIRED_TOKEN,
        400
      );
    }

    // Find user by email in Supabase Auth
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      logger.error('Failed to list users for password reset', {
        error: listError,
      });
      throw AppError.fromCode(ErrorCodes.INTERNAL_ERROR, 500);
    }

    const user = authUsers.users.find(
      (u) => u.email?.toLowerCase() === tokenRecord.email.toLowerCase()
    );

    if (!user) {
      logger.warn('User not found for password reset', {
        email: tokenRecord.email,
      });
      throw AppError.fromCode(ErrorCodes.PASSWORD_RESET_USER_NOT_FOUND, 404);
    }

    // Step 4: Update password in Supabase Auth using admin client
    // IMPORTANT: If this fails, token remains unused (not marked as used)
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        password: new_password,
      }
    );

    if (updateError) {
      logger.error('Failed to update user password - token NOT consumed', {
        error: updateError,
        userId: user.id,
        email: tokenRecord.email,
        supabaseErrorMessage: updateError.message,
      });
      
      // Check if it's a password policy error from Supabase Auth
      const errorMessage = updateError.message?.toLowerCase() || '';
      if (errorMessage.includes('password') || 
          errorMessage.includes('weak') || 
          errorMessage.includes('strong') ||
          errorMessage.includes('policy')) {
        // Return 422 with Supabase's actual error message
        throw AppError.fromCode(ErrorCodes.PASSWORD_RESET_WEAK_PASSWORD, 422, {
          reason: updateError.message,
          supabase_error: updateError,
        });
      }
      
      // Other errors (network, auth, etc.)
      throw AppError.fromCode(ErrorCodes.PASSWORD_RESET_FAILED, 500, {
        reason: 'Failed to update password',
        error: updateError.message,
      });
    }

    // Step 5: Mark token as used ONLY after successful password update
    // Use WHERE clause with used_at IS NULL to prevent race conditions
    const { error: markUsedError } = await supabase
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRecord.id)
      .is('used_at', null);

    if (markUsedError) {
      logger.error('Failed to mark password reset token as used', {
        error: markUsedError,
        tokenId: tokenRecord.id,
      });
      // Don't fail the request - password was already updated successfully
    }

    logger.info('Password reset successful', {
      userId: user.id,
      email: tokenRecord.email,
    });

    return res.json({
      data: {
        status: 'success',
        message: 'Password has been reset successfully',
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

