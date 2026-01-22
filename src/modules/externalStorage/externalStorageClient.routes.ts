import { Router, Request, Response } from 'express';
import { param, body } from 'express-validator';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { handleValidationErrors } from '../../utils/validation';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
import { ErrorCodes } from '../../constants/errorCodes';
import { env } from '../../config/env';
import { ExternalStorageProvider, ExternalStorageConnectionPublic } from '../../types/externalStorage';

export const externalStorageClientRouter = Router({ mergeParams: true });

function sanitizeConnection(connection: any): ExternalStorageConnectionPublic {
  const { access_token, refresh_token, ...safe } = connection;
  return safe;
}

externalStorageClientRouter.get(
  '/:provider/auth-url',
  [
    param('clientId').isUUID().withMessage('Invalid clientId format'),
    param('provider').isIn(['google_drive', 'microsoft_graph']).withMessage('Invalid provider'),
  ],
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params.clientId;
    const provider = req.params.provider as ExternalStorageProvider;

    const statePayload = {
      clientId,
      provider,
      nonce: crypto.randomBytes(16).toString('hex'),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    };

    const state = jwt.sign(statePayload, env.supabase.jwtSecret);

    let authUrl: string;

    if (provider === 'google_drive') {
      const params = new URLSearchParams({
        client_id: env.externalStorage.googleDrive.clientId,
        redirect_uri: env.externalStorage.googleDrive.redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        client_id: env.externalStorage.microsoft.clientId,
        redirect_uri: env.externalStorage.microsoft.redirectUri,
        response_type: 'code',
        scope: 'Files.ReadWrite.All offline_access',
        state,
      });
      authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    }

    return res.json({ url: authUrl });
  })
);

externalStorageClientRouter.get(
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

externalStorageClientRouter.patch(
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

externalStorageClientRouter.delete(
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
