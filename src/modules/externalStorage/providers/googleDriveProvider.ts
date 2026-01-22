import axios from 'axios';
import { 
  IExternalStorageProvider, 
  ExternalStorageConnection, 
  UploadResult, 
  TokenRefreshResult 
} from '../../../types/externalStorage';
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';

export class GoogleDriveProvider implements IExternalStorageProvider {
  private readonly UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
  private readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  
  async uploadFile(
    connection: ExternalStorageConnection,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<UploadResult> {
    try {
      const metadata = {
        name: fileName,
        parents: connection.root_folder_id ? [connection.root_folder_id] : undefined,
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n` +
        fileBuffer.toString('binary') +
        closeDelimiter;

      const response = await axios.post(
        `${this.UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink`,
        Buffer.from(multipartRequestBody, 'binary'),
        {
          headers: {
            'Authorization': `Bearer ${connection.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
        }
      );

      return {
        fileId: response.data.id,
        webUrl: response.data.webViewLink,
      };
    } catch (error: any) {
      logger.error('Google Drive upload failed', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Google Drive upload failed: ${error.message}`);
    }
  }

  async refreshToken(connection: ExternalStorageConnection): Promise<TokenRefreshResult> {
    if (!connection.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(this.TOKEN_URL, {
        client_id: env.externalStorage.googleDrive.clientId,
        client_secret: env.externalStorage.googleDrive.clientSecret,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
      });

      const expiresAt = new Date(Date.now() + response.data.expires_in * 1000).toISOString();

      return {
        access_token: response.data.access_token,
        expires_at: expiresAt,
        refresh_token: response.data.refresh_token || connection.refresh_token,
      };
    } catch (error: any) {
      logger.error('Google Drive token refresh failed', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }
}
