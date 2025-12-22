// src/types/express.d.ts
export interface AuthUser {
  sub: string;
  role: 'admin' | 'client';
  client_id?: string;
  accessToken?: string; // JWT token for user-scoped Supabase client
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      id?: string; // Request ID for tracking/debugging
    }
  }
}

