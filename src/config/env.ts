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
};

// Validate environment on module load
export function validateEnv(): void {
  console.log('✓ Environment variables validated successfully');
  console.log(`✓ Running in ${env.nodeEnv} mode`);
  console.log(`✓ Server will listen on port ${env.port}`);
}

