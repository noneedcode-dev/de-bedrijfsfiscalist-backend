import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Check if running in test mode
const isTestMode = process.env.NODE_ENV === 'test';

// Helper function to get required env variable
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // In test mode, return safe dummy values instead of throwing
    if (isTestMode) {
      const testDefaults: Record<string, string> = {
        PORT: '3000',
        NODE_ENV: 'test',
        FRONTEND_URL: 'http://localhost:3000',
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_JWT_SECRET: 'test-jwt-secret-min-32-chars-long-for-hs256',
        APP_API_KEY: 'test-api-key',
      };
      return testDefaults[key] || `test-${key.toLowerCase()}`;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Helper function to get optional env variable
function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}

// Validate and export environment variables
export const env = {
  // Server
  port: parseInt(getRequiredEnv('PORT'), 10),
  nodeEnv: getRequiredEnv('NODE_ENV'),
  
  // Frontend
  frontendUrl: getRequiredEnv('FRONTEND_URL'),
  allowedOrigins: getOptionalEnv('ALLOWED_ORIGINS')?.split(',').map(o => o.trim()) || [],
  
  // Supabase
  supabase: {
    url: getRequiredEnv('SUPABASE_URL'),
    anonKey: getRequiredEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    jwtSecret: getRequiredEnv('SUPABASE_JWT_SECRET'),
  },
  
  // Backend Auth
  // Note: We use SUPABASE_JWT_SECRET for verifying tokens from Supabase Auth
  // APP_JWT_SECRET is only needed if backend generates its own JWT tokens
  auth: {
    jwtSecret: getOptionalEnv('APP_JWT_SECRET'), // Optional: only if backend signs its own tokens
    apiKey: getRequiredEnv('APP_API_KEY'),
    passwordResetTokenTtlMinutes: parseInt(getOptionalEnv('PASSWORD_RESET_TOKEN_TTL_MINUTES') || '30', 10),
  },
  
  // S3 (optional)
  s3: {
    bucketName: getOptionalEnv('S3_BUCKET_NAME'),
    accessKeyId: getOptionalEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: getOptionalEnv('S3_SECRET_ACCESS_KEY'),
    region: getOptionalEnv('S3_REGION') || 'eu-central-1',
  },
  
  // Google Drive (optional)
  google: {
    GOOGLE_APPLICATION_CREDENTIALS: getOptionalEnv('GOOGLE_APPLICATION_CREDENTIALS'),
  },
  
  // External Storage Integration
  externalStorage: {
    tokenEncryptionKey: isTestMode 
      ? '0'.repeat(64) // 32 bytes in hex for test mode
      : getRequiredEnv('EXTERNAL_STORAGE_TOKEN_ENCRYPTION_KEY'),
    googleDrive: {
      clientId: getOptionalEnv('GOOGLE_DRIVE_CLIENT_ID') || '',
      clientSecret: getOptionalEnv('GOOGLE_DRIVE_CLIENT_SECRET') || '',
      redirectUri: getOptionalEnv('GOOGLE_DRIVE_REDIRECT_URI') || '',
    },
    microsoft: {
      clientId: getOptionalEnv('MICROSOFT_CLIENT_ID') || '',
      clientSecret: getOptionalEnv('MICROSOFT_CLIENT_SECRET') || '',
      redirectUri: getOptionalEnv('MICROSOFT_REDIRECT_URI') || '',
    },
  },
  
  // Documents
  documents: {
    maxSizeMB: parseInt(getOptionalEnv('DOCUMENTS_MAX_SIZE_MB') || '10', 10),
    signedUrlTtlSeconds: parseInt(getOptionalEnv('DOCUMENTS_SIGNED_URL_TTL_SECONDS') || '300', 10),
    previewSignedUrlTtlSeconds: parseInt(getOptionalEnv('DOCUMENTS_PREVIEW_SIGNED_URL_TTL_SECONDS') || '300', 10),
  },
};

// Validate environment on module load
export function validateEnv(): void {
  // Validate encryption key format (must be 64 hex chars = 32 bytes)
  const encryptionKey = env.externalStorage.tokenEncryptionKey;
  if (encryptionKey.length !== 64) {
    throw new Error(
      `EXTERNAL_STORAGE_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ` +
      `Current length: ${encryptionKey.length}. ` +
      `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error(
      `EXTERNAL_STORAGE_TOKEN_ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f, A-F). ` +
      `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  
  console.log('✓ Environment variables validated successfully');
  console.log(`✓ Running in ${env.nodeEnv} mode`);
  console.log(`✓ Server will listen on port ${env.port}`);
  console.log('✓ External storage encryption key validated');
}

