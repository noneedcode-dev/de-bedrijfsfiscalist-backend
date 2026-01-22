import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { GoogleDriveProvider } from './providers/googleDriveProvider';
import { MicrosoftGraphProvider } from './providers/microsoftGraphProvider';
import { 
  ExternalStorageConnection, 
  ExternalStorageProvider as ProviderType,
  IExternalStorageProvider,
  UploadResult 
} from '../../types/externalStorage';
import { logger } from '../../config/logger';
import { decryptToken, encryptToken } from '../../lib/tokenEncryption';

export class ExternalStorageService {
  private providers: Map<ProviderType, IExternalStorageProvider>;

  constructor() {
    this.providers = new Map();
    this.providers.set('google_drive', new GoogleDriveProvider());
    this.providers.set('microsoft_graph', new MicrosoftGraphProvider());
  }

  async getConnection(clientId: string, provider: ProviderType): Promise<ExternalStorageConnection | null> {
    const adminSupabase = createSupabaseAdminClient();
    
    const { data, error } = await adminSupabase
      .from('external_storage_connections')
      .select('*')
      .eq('client_id', clientId)
      .eq('provider', provider)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch external storage connection', { error, clientId, provider });
      throw new Error(`Failed to fetch connection: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    try {
      data.access_token = decryptToken(data.access_token);
      if (data.refresh_token) {
        data.refresh_token = decryptToken(data.refresh_token);
      }
      return data;
    } catch (decryptError) {
      logger.error('Failed to decrypt connection tokens', { 
        connectionId: data.id, 
        clientId, 
        provider 
      });
      
      await adminSupabase
        .from('external_storage_connections')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', data.id);
      
      throw new Error('Failed to decrypt connection tokens');
    }
  }

  async uploadFile(
    connection: ExternalStorageConnection,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<UploadResult> {
    const provider = this.providers.get(connection.provider);
    if (!provider) {
      throw new Error(`Unknown provider: ${connection.provider}`);
    }

    if (this.isTokenExpired(connection)) {
      connection = await this.refreshConnectionToken(connection);
    }

    try {
      return await provider.uploadFile(connection, fileBuffer, fileName, mimeType);
    } catch (error: any) {
      if (this.isAuthError(error)) {
        connection = await this.refreshConnectionToken(connection);
        return await provider.uploadFile(connection, fileBuffer, fileName, mimeType);
      }
      throw error;
    }
  }

  private isTokenExpired(connection: ExternalStorageConnection): boolean {
    if (!connection.expires_at) {
      return false;
    }
    const expiresAt = new Date(connection.expires_at);
    const now = new Date();
    const bufferMinutes = 5;
    return expiresAt.getTime() - now.getTime() < bufferMinutes * 60 * 1000;
  }

  private isAuthError(error: any): boolean {
    return error.response?.status === 401 || error.message?.includes('401');
  }

  private async refreshConnectionToken(connection: ExternalStorageConnection): Promise<ExternalStorageConnection> {
    const provider = this.providers.get(connection.provider);
    if (!provider) {
      throw new Error(`Unknown provider: ${connection.provider}`);
    }

    try {
      const refreshResult = await provider.refreshToken(connection);
      
      const encryptedAccessToken = encryptToken(refreshResult.access_token);
      const encryptedRefreshToken = refreshResult.refresh_token 
        ? encryptToken(refreshResult.refresh_token)
        : connection.refresh_token;
      
      const adminSupabase = createSupabaseAdminClient();
      const { data, error } = await adminSupabase
        .from('external_storage_connections')
        .update({
          access_token: encryptedAccessToken,
          expires_at: refreshResult.expires_at,
          refresh_token: encryptedRefreshToken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update connection after token refresh', { error, connectionId: connection.id });
        throw new Error(`Failed to update connection: ${error.message}`);
      }

      data.access_token = refreshResult.access_token;
      data.refresh_token = refreshResult.refresh_token || connection.refresh_token;
      return data;
    } catch (error: any) {
      logger.error('Token refresh failed', { error, connectionId: connection.id, provider: connection.provider });
      
      const adminSupabase = createSupabaseAdminClient();
      await adminSupabase
        .from('external_storage_connections')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  async getMirrorSettings(clientId: string): Promise<{ enabled: boolean; provider: ProviderType | null }> {
    const adminSupabase = createSupabaseAdminClient();
    
    const { data, error } = await adminSupabase
      .from('client_settings')
      .select('documents_mirror_enabled, documents_mirror_provider')
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch mirror settings', { error, clientId });
      return { enabled: false, provider: null };
    }

    if (!data) {
      return { enabled: false, provider: null };
    }

    return {
      enabled: data.documents_mirror_enabled || false,
      provider: data.documents_mirror_provider || null,
    };
  }

  async enqueueUploadJob(clientId: string, documentId: string, provider: ProviderType): Promise<void> {
    const adminSupabase = createSupabaseAdminClient();
    
    const { error: rpcError } = await adminSupabase.rpc('enqueue_external_upload_job', {
      p_client_id: clientId,
      p_document_id: documentId,
      p_provider: provider,
    });

    if (rpcError) {
      logger.error('Failed to enqueue external upload job', { error: rpcError, clientId, documentId, provider });
      throw new Error(`Failed to enqueue job: ${rpcError.message}`);
    }

    await adminSupabase
      .from('documents')
      .update({
        external_provider: provider,
        external_sync_status: 'pending',
      })
      .eq('id', documentId);
  }
}

export const externalStorageService = new ExternalStorageService();
