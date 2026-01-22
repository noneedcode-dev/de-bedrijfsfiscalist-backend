import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export function encryptToken(plainToken: string): string {
  try {
    const key = Buffer.from(env.externalStorage.tokenEncryptionKey, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plainToken, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error: any) {
    logger.error('Token encryption failed', { error: error.message });
    throw new Error('Failed to encrypt token');
  }
}

export function decryptToken(encryptedToken: string): string {
  try {
    const key = Buffer.from(env.externalStorage.tokenEncryptionKey, 'hex');
    const parts = encryptedToken.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }
    
    const [ivHex, authTagHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error: any) {
    logger.error('Token decryption failed', { error: error.message });
    throw new Error('Failed to decrypt token');
  }
}
