import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_USER_ID = '123e4567-e89b-12d3-a456-426614174000';

// Helper to generate valid JWT tokens
function generateToken(payload: any, expiresIn: string = '1h'): string {
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn } as jwt.SignOptions);
}

// Create mock chain for Supabase queries
const createMockChain = () => {
  const chain: any = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => ({ data: null, error: null })),
  };
  return chain;
};

// Mock Supabase client
vi.mock('../src/lib/supabaseClient', () => {
  const mockChain = createMockChain();
  
  const mockSupabase = {
    ...mockChain,
    auth: {
      signInWithPassword: vi.fn(() => ({
        data: {
          user: { id: MOCK_USER_ID, email: 'user@example.com' },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
          },
        },
        error: null,
      })),
      admin: {
        updateUserById: vi.fn(() => ({ data: { user: null }, error: null })),
      },
      getUser: vi.fn(() => ({
        data: { user: { id: MOCK_USER_ID, email: 'user@example.com' } },
        error: null,
      })),
    },
  };

  return {
    createSupabaseAdminClient: vi.fn(() => mockSupabase),
    createSupabaseUserClient: vi.fn(() => mockSupabase),
  };
});

describe('Login and Change Password Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 and access token for valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          password: 'SecurePass123',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('access_token');
      expect(res.body.data).toHaveProperty('refresh_token');
      expect(res.body.data).toHaveProperty('expires_in');
      expect(res.body.data).toHaveProperty('token_type');
      expect(res.body.data.access_token).toBe('mock-access-token');
      expect(res.body.data.token_type).toBe('bearer');
      expect(res.body.meta).toHaveProperty('timestamp');
    });

    it('should return 401 for invalid credentials', async () => {
      const { createSupabaseAdminClient } = await import('../src/lib/supabaseClient');
      const mockSupabase = createSupabaseAdminClient();
      
      vi.mocked(mockSupabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials', name: 'AuthError', status: 400 },
      } as any);

      const res = await request(app)
        .post('/api/auth/login')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          password: 'WrongPassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should return 422 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'not-an-email',
          password: 'SecurePass123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for missing password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          password: 'SecurePass123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should normalize email to lowercase', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'User@Example.COM',
          password: 'SecurePass123',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('access_token');
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should return 401 without authentication token', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          new_password: 'NewSecurePass123',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_MISSING_HEADER');
    });

    it('should return 200 for successful password change', async () => {
      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'client',
        client_id: '123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'NewSecurePass123',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('success');
      expect(res.body.meta).toHaveProperty('timestamp');
    });

    it('should return 422 for weak password (too short)', async () => {
      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'client',
        client_id: '123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'Short1',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details).toBeDefined();
    });

    it('should return 422 for password missing lowercase', async () => {
      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'client',
        client_id: '123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'ALLUPPERCASE123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for password missing uppercase', async () => {
      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'client',
        client_id: '123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'alllowercase123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for password missing digit', async () => {
      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'client',
        client_id: '123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'NoDigitsHere',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for password less than 10 characters', async () => {
      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'client',
        client_id: '123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'Short1Aa',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 500 when Supabase update fails', async () => {
      const { createSupabaseAdminClient } = await import('../src/lib/supabaseClient');
      const mockSupabase = createSupabaseAdminClient();
      
      vi.mocked(mockSupabase.auth.admin.updateUserById).mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Database connection failed', name: 'DatabaseError', status: 500 },
      } as any);

      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'client',
        client_id: '123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'NewSecurePass123',
        });

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('AUTH_CHANGE_PASSWORD_FAILED');
    });

    it('should return 422 when Supabase rejects weak password', async () => {
      const { createSupabaseAdminClient } = await import('../src/lib/supabaseClient');
      const mockSupabase = createSupabaseAdminClient();
      
      vi.mocked(mockSupabase.auth.admin.updateUserById).mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Password is too weak', name: 'WeakPasswordError', status: 422 },
      } as any);

      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'client',
        client_id: '123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'NewSecurePass123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('AUTH_CHANGE_PASSWORD_WEAK');
    });

    it('should work for admin users without client_id', async () => {
      const token = generateToken({
        sub: MOCK_USER_ID,
        role: 'admin',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`)
        .send({
          new_password: 'NewSecurePass123',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('success');
    });
  });

  describe('Integration: Login then Change Password', () => {
    it('should allow password change after successful login', async () => {
      // Step 1: Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          password: 'OldPassword123',
        });

      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.data.access_token;

      // Step 2: Change password using the access token
      const changePasswordRes = await request(app)
        .post('/api/auth/change-password')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          new_password: 'NewSecurePass123',
        });

      expect(changePasswordRes.status).toBe(200);
      expect(changePasswordRes.body.data.status).toBe('success');
    });
  });
});
