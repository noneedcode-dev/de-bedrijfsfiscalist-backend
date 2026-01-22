import { Router, Request, Response } from 'express';
import { param, body, query } from 'express-validator';
import crypto from 'crypto';
import axios from 'axios';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import { ErrorCodes } from '../../constants/errorCodes';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ExternalStorageProvider, ExternalStorageConnectionPublic } from '../../types/externalStorage';

export const externalStorageRouter = Router({ mergeParams: true });

const oauthStates = new Map<string, { clientId: string; provider: ExternalStorageProvider; expiresAt: number }>();

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [key, value] of oauthStates.entries()) {
    if (value.expiresAt < now) {
      oauthStates.delete(key);
    }
  }
}

setInterval(cleanupExpiredStates, 60000);

function sanitizeConnection(connection: any): ExternalStorageConnectionPublic {
  const { access_token, refresh_token, ...safe } = connection;
  return safe;
}

externalStorageRouter.get(
  '/:provider/auth-url',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('provider').isIn(['google_drive', 'microsoft_graph']).withMessage('Invalid provider'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const provider = req.params.provider as ExternalStorageProvider;

    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, {
      clientId,
      provider,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    let authUrl: string;

    if (provider === 'google_drive') {
      const params = new URLSearchParams({
        client_id: env.googleDrive.clientId,
        redirect_uri: env.googleDrive.redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        client_id: env.microsoft.clientId,
        redirect_uri: env.microsoft.redirectUri,
        response_type: 'code',
        scope: 'Files.ReadWrite.All offline_access',
        state,
      });
      authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    }

    return res.json({ url: authUrl });
  })
);

externalStorageRouter.get(
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

    const stateData = oauthStates.get(state);
    if (!stateData) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 400, {
        message: 'Invalid or expired state parameter',
      });
    }

    if (stateData.provider !== provider) {
      throw AppError.fromCode(ErrorCodes.VALIDATION_FAILED, 400, {
        message: 'Provider mismatch',
      });
    }

    oauthStates.delete(state);

    const clientId = stateData.clientId;
    let tokenResponse: any;

    try {
      if (provider === 'google_drive') {
        tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
          code,
          client_id: env.googleDrive.clientId,
          client_secret: env.googleDrive.clientSecret,
          redirect_uri: env.googleDrive.redirectUri,
          grant_type: 'authorization_code',
        });
      } else {
        tokenResponse = await axios.post(
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          new URLSearchParams({
            code,
            client_id: env.microsoft.clientId,
            client_secret: env.microsoft.clientSecret,
            redirect_uri: env.microsoft.redirectUri,
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
        data: error.response?.data,
      });
      throw new AppError(`OAuth token exchange failed: ${error.message}`, 500);
    }

    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;
    const expiresIn = tokenResponse.data.expires_in;
    const scope = tokenResponse.data.scope;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

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
          access_token: accessToken,
          refresh_token: refreshToken,
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
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
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

externalStorageRouter.get(
  '/',
  [param('clientId').isUUID().withMessage('Invalid clientId format')],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    const adminSupabase = createSupabaseAdminClient();
    const { data: connections, error } = await adminSupabase
      .from('external_storage_connections')
      .select('*')
      .eq('client_id', clientId);

    if (error) {
      throw new AppError(`Failed to fetch connections: ${error.message}`, 500);
    }

    const sanitized = (connections || []).map(sanitizeConnection);

    return res.json({ data: sanitized });
  })
);

externalStorageRouter.patch(
  '/:provider',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('provider').isIn(['google_drive', 'microsoft_graph']).withMessage('Invalid provider'),
    body('root_folder_id').optional().isString().withMessage('Invalid root_folder_id'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const provider = req.params.provider as ExternalStorageProvider;
    const { root_folder_id } = req.body;

    const adminSupabase = createSupabaseAdminClient();

    const { data: connection, error: updateError } = await adminSupabase
      .from('external_storage_connections')
      .update({
        root_folder_id: root_folder_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('client_id', clientId)
      .eq('provider', provider)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
          message: 'Connection not found',
        });
      }
      throw new AppError(`Failed to update connection: ${updateError.message}`, 500);
    }

    return res.json({ data: sanitizeConnection(connection) });
  })
);

externalStorageRouter.delete(
  '/:provider',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('provider').isIn(['google_drive', 'microsoft_graph']).withMessage('Invalid provider'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const provider = req.params.provider as ExternalStorageProvider;

    const adminSupabase = createSupabaseAdminClient();

    const { data: connection, error: fetchError } = await adminSupabase
      .from('external_storage_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('provider', provider)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(`Failed to fetch connection: ${fetchError.message}`, 500);
    }

    if (!connection) {
      throw AppError.fromCode(ErrorCodes.NOT_FOUND, 404, {
        message: 'Connection not found',
      });
    }

    const { error: updateError } = await adminSupabase
      .from('external_storage_connections')
      .update({
        status: 'revoked',
        access_token: '',
        refresh_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    if (updateError) {
      throw new AppError(`Failed to revoke connection: ${updateError.message}`, 500);
    }

    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.EXTERNAL_STORAGE_DISCONNECTED,
      entity_type: 'external_storage_connection',
      entity_id: connection.id,
      metadata: {
        provider,
      },
    });

    return res.status(204).send();
  })
);
