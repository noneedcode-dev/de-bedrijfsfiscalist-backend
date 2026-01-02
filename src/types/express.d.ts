// src/types/express.d.ts
export interface AuthUser {
  sub: string;
  role: 'admin' | 'client';
  client_id: string;
  permissions?: string[];
  scopes?: string[];
  accessToken?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      id?: string; // Request ID for tracking/debugging
    }
  }
}

