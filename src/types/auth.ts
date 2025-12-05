// src/types/auth.ts
/**
 * JWT Payload structure for application tokens
 * Used when decoding JWT tokens from Supabase
 */
export interface AppJwtPayload {
  sub: string; // User ID
  role: 'admin' | 'client';
  client_id?: string; // Required for client role, optional for admin
  iat?: number; // Issued at timestamp
  exp?: number; // Expiration timestamp
}

