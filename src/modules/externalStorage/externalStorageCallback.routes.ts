import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import { ErrorCodes } from '../../constants/errorCodes';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ExternalStorageProvider } from '../../types/externalStorage';
import { encryptToken } from '../../lib/tokenEncryption';

export const externalStorageCallbackRouter = Router();

externalStorageCallbackRouter.get(
  '/callback/:provider',
  [
    param('provider').isIn(['google_drive', 'microsoft_graph']).withMessage('Invalid provider'),
    query('code').notEmpty().withMessage('Authorization code is required'),
    query('state').notEmpty().withMessage('State parameter is required'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const provider = req.params.provider as ExternalStorageProvider;
    const code = req.query.code as string;
    const state = req.query.state as string;

    let decoded: any;
    try {
      decoded = jwt.verify(state, env.supabase.jwtSecret);
    } catch (error) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 400, {
        message: 'Invalid or expired state',
      });
    }

    if (decoded.provider !== provider) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 400, {
        message: 'Provider mismatch',
      });
    }

    const clientId = decoded.clientId;
    let tokenResponse: any;

    try {
      if (provider === 'google_drive') {
        tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
          code,
          client_id: env.externalStorage.googleDrive.clientId,
          client_secret: env.externalStorage.googleDrive.clientSecret,
          redirect_uri: env.externalStorage.googleDrive.redirectUri,
          grant_type: 'authorization_code',
        });
      } else {
        tokenResponse = await axios.post(
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          new URLSearchParams({
            code,
            client_id: env.externalStorage.microsoft.clientId,
            client_secret: env.externalStorage.microsoft.clientSecret,
            redirect_uri: env.externalStorage.microsoft.redirectUri,
            grant_type: 'authorization_code',
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );
      }
    } catch (error: any) {
      logger.error('OAuth token exchange failed', {
        error: error.message,
        provider,
        status: error.response?.status,
      });
      throw new AppError(`OAuth token exchange failed: ${error.message}`, 500);
    }

    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;
    const expiresIn = tokenResponse.data.expires_in;
    const scope = tokenResponse.data.scope;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const encryptedAccessToken = encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

    let providerAccountId: string | null = null;
    if (provider === 'google_drive') {
      try {
        const userInfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        providerAccountId = userInfo.data.id;
      } catch (error) {
        logger.warn('Failed to fetch Google user info', { error });
      }
    } else {
      try {
        const userInfo = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        providerAccountId = userInfo.data.id;
      } catch (error) {
        logger.warn('Failed to fetch Microsoft user info', { error });
      }
    }

    const adminSupabase = createSupabaseAdminClient();

    const { data: connection, error: upsertError } = await adminSupabase
      .from('external_storage_connections')
      .upsert(
        {
          client_id: clientId,
          provider,
          status: 'connected',
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          expires_at: expiresAt,
          scope,
          provider_account_id: providerAccountId,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'client_id,provider',
        }
      )
      .select()
      .single();

    if (upsertError) {
      logger.error('Failed to save external storage connection', { error: upsertError, clientId, provider });
      throw new AppError(`Failed to save connection: ${upsertError.message}`, 500);
    }

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: undefined,
      actor_role: 'system',
      action: AuditActions.EXTERNAL_STORAGE_CONNECTED,
      entity_type: 'external_storage_connection',
      entity_id: connection.id,
      metadata: {
        provider,
        provider_account_id: providerAccountId,
        scope,
      },
    });

    return res.redirect(`${env.frontendUrl}/clients/${clientId}/settings?external_storage_connected=${provider}`);
  })
);
