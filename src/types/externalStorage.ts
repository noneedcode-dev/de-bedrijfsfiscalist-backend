export type ExternalStorageProvider = 'google_drive' | 'microsoft_graph';
export type ConnectionStatus = 'connected' | 'revoked' | 'error';
export type ExternalSyncStatus = 'pending' | 'synced' | 'failed';
export type ExternalUploadJobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface ExternalStorageConnection {
  id: string;
  client_id: string;
  provider: ExternalStorageProvider;
  status: ConnectionStatus;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  provider_account_id?: string | null;
  root_folder_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalStorageConnectionPublic {
  id: string;
  client_id: string;
  provider: ExternalStorageProvider;
  status: ConnectionStatus;
  expires_at?: string | null;
  scope?: string | null;
  provider_account_id?: string | null;
  root_folder_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalUploadJob {
  id: string;
  client_id: string;
  document_id: string;
  provider: ExternalStorageProvider;
  status: ExternalUploadJobStatus;
  attempts: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadResult {
  fileId: string;
  webUrl?: string;
  driveId?: string;
}

export interface TokenRefreshResult {
  access_token: string;
  expires_at: string;
  refresh_token?: string;
}

export interface IExternalStorageProvider {
  uploadFile(
    connection: ExternalStorageConnection,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<UploadResult>;
  
  refreshToken(connection: ExternalStorageConnection): Promise<TokenRefreshResult>;
}
