import axios from 'axios';
import { 
  IExternalStorageProvider, 
  ExternalStorageConnection, 
  UploadResult, 
  TokenRefreshResult 
} from '../../../types/externalStorage';
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';

export class MicrosoftGraphProvider implements IExternalStorageProvider {
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private readonly TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  
  async uploadFile(
    connection: ExternalStorageConnection,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<UploadResult> {
    try {
      const rootPath = connection.root_folder_id 
        ? `/me/drive/items/${connection.root_folder_id}` 
        : '/me/drive/root';
      
      const fileSize = fileBuffer.length;
      
      if (fileSize < 4 * 1024 * 1024) {
        return await this.simpleUpload(connection, fileBuffer, fileName, mimeType, rootPath);
      } else {
        return await this.uploadSession(connection, fileBuffer, fileName, mimeType, rootPath);
      }
    } catch (error: any) {
      logger.error('Microsoft Graph upload failed', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Microsoft Graph upload failed: ${error.message}`);
    }
  }

  private async simpleUpload(
    connection: ExternalStorageConnection,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    rootPath: string
  ): Promise<UploadResult> {
    const uploadUrl = `${this.GRAPH_API_BASE}${rootPath}:/${encodeURIComponent(fileName)}:/content`;
    
    const response = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Authorization': `Bearer ${connection.access_token}`,
        'Content-Type': mimeType,
      },
    });

    return {
      fileId: response.data.id,
      webUrl: response.data.webUrl,
      driveId: response.data.parentReference?.driveId,
    };
  }

  private async uploadSession(
    connection: ExternalStorageConnection,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    rootPath: string
  ): Promise<UploadResult> {
    const sessionUrl = `${this.GRAPH_API_BASE}${rootPath}:/${encodeURIComponent(fileName)}:/createUploadSession`;
    
    const sessionResponse = await axios.post(
      sessionUrl,
      {
        item: {
          '@microsoft.graph.conflictBehavior': 'rename',
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${connection.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const uploadUrl = sessionResponse.data.uploadUrl;
    const chunkSize = 320 * 1024 * 10;
    let offset = 0;

    while (offset < fileBuffer.length) {
      const chunk = fileBuffer.slice(offset, Math.min(offset + chunkSize, fileBuffer.length));
      const contentRange = `bytes ${offset}-${offset + chunk.length - 1}/${fileBuffer.length}`;

      const chunkResponse = await axios.put(uploadUrl, chunk, {
        headers: {
          'Content-Length': chunk.length.toString(),
          'Content-Range': contentRange,
        },
      });

      if (chunkResponse.status === 200 || chunkResponse.status === 201) {
        return {
          fileId: chunkResponse.data.id,
          webUrl: chunkResponse.data.webUrl,
          driveId: chunkResponse.data.parentReference?.driveId,
        };
      }

      offset += chunk.length;
    }

    throw new Error('Upload session completed but no file data returned');
  }

  async refreshToken(connection: ExternalStorageConnection): Promise<TokenRefreshResult> {
    if (!connection.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(
        this.TOKEN_URL,
        new URLSearchParams({
          client_id: env.externalStorage.microsoft.clientId,
          client_secret: env.externalStorage.microsoft.clientSecret,
          refresh_token: connection.refresh_token,
          grant_type: 'refresh_token',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const expiresAt = new Date(Date.now() + response.data.expires_in * 1000).toISOString();

      return {
        access_token: response.data.access_token,
        expires_at: expiresAt,
        refresh_token: response.data.refresh_token || connection.refresh_token,
      };
    } catch (error: any) {
      logger.error('Microsoft Graph token refresh failed', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }
}
