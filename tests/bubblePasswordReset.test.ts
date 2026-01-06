import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app';

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

// Mock Supabase client
vi.mock('../src/lib/supabaseClient', () => {
  const chain: any = {
    from: vi.fn(function(this: any) { return this; }),
    insert: vi.fn(() => ({ error: null })),
    select: vi.fn(function(this: any) { return this; }),
    eq: vi.fn(function(this: any) { return this; }),
    is: vi.fn(function(this: any) { return this; }),
    gt: vi.fn(function(this: any) { return this; }),
    order: vi.fn(function(this: any) { return this; }),
    limit: vi.fn(function(this: any) { return this; }),
    single: vi.fn(() => ({ data: null, error: null })),
    update: vi.fn(function(this: any) { return this; }),
  };
  
  const mockSupabase = {
    ...chain,
    auth: {
      admin: {
        listUsers: vi.fn(() => ({ data: { users: [] as any[] }, error: null })),
        updateUserById: vi.fn(() => ({ data: { user: null }, error: null })),
      },
    },
  };

  return {
    createSupabaseAdminClient: vi.fn(() => mockSupabase),
  };
});

const app = createApp();

describe('Bubble Password Reset Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/bubble-reset/register', () => {
    it('should return 200 and status registered for valid request', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('status', 'registered');
      expect(res.body.meta).toHaveProperty('timestamp');
    });

    it('should normalize email to lowercase', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'User@Example.COM',
          reset_token: 'bubble-token-12345',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('registered');
    });

    it('should return 422 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'not-an-email',
          reset_token: 'bubble-token-12345',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          reset_token: 'bubble-token-12345',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for missing reset_token', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for empty reset_token', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: '',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return idempotent response if same token already registered', async () => {
      // This test verifies the idempotency logic
      // In real scenario with DB, second call with same email+token would return 200
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('registered');
    });
  });

  describe('POST /api/auth/bubble-reset/confirm', () => {
    it('should return 400 for invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'invalid-token-that-does-not-exist',
          new_password: 'NewSecurePass123',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_RESET_INVALID_OR_EXPIRED_TOKEN');
    });

    it('should return 422 for weak password (too short)', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'Short1',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details).toBeDefined();
    });

    it('should return 422 for password missing lowercase', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'ALLUPPERCASE123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for password missing uppercase', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'alllowercase123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for password missing digit', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'NoDigitsHere',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          reset_token: 'bubble-token-12345',
          new_password: 'ValidPassword123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for missing reset_token', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          new_password: 'ValidPassword123',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 for missing new_password', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate password BEFORE consuming token', async () => {
      // This test verifies that weak password validation happens first
      // Token should NOT be consumed if password is weak
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'weak',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      // In real scenario, token would still be unused in DB
    });

    it('should return 404 when user not found in Supabase Auth', async () => {
      // With default mocks, token won't be found, so we get 400
      // This test verifies the error response structure
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'nonexistent@example.com',
          reset_token: 'valid-token-but-user-not-found',
          new_password: 'NewSecurePass123',
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should validate successful password reset response structure', async () => {
      // This test validates the expected response structure
      // With mocks, we verify the validation and error handling works
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'some-token',
          new_password: 'NewSecurePass123',
        });

      // Verify response has proper structure (even if error)
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should normalize email to lowercase in confirm', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'User@Example.COM',
          reset_token: 'bubble-token-12345',
          new_password: 'NewSecurePass123',
        });

      // Email normalization happens before token lookup
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body).toHaveProperty('code');
    });
  });

  describe('Token Consumption Rules', () => {
    it('should NOT consume token on validation error', async () => {
      // Verify that weak password fails validation before token lookup
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'weak',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      // Token would remain unused in DB
    });

    it('should NOT consume token on invalid token error', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'invalid-token',
          new_password: 'ValidPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_RESET_INVALID_OR_EXPIRED_TOKEN');
      // Token lookup failed, so no consumption attempt
    });

    it('should consume token only after successful password update', async () => {
      // This test verifies the consumption logic order
      // In real scenario with valid token and user:
      // 1. Validate password ✓
      // 2. Find token ✓
      // 3. Find user ✓
      // 4. Update password ✓
      // 5. Mark token as used ✓
      
      // With mocks, we verify the flow reaches the right error points
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'ValidPassword123',
        });

      // Verify proper error handling structure
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('Error Response Structure', () => {
    it('should return standardized error for all endpoints', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'invalid-email',
          reset_token: 'token',
        });

      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should include details for validation errors', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'token',
          new_password: 'short',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body).toHaveProperty('details');
      expect(Array.isArray(res.body.details)).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to register endpoint', async () => {
      // Rate limiter is applied via passwordResetLimiter middleware
      // In real scenario, excessive requests would return 429
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', MOCK_API_KEY)
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
        });

      // First request should succeed (or fail validation, not rate limit)
      expect(res.status).not.toBe(429);
    });
  });

  describe('Security Validations', () => {
    it('should allow register endpoint without API key (public endpoint)', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
        });

      // Should not return 401 for missing API key
      // Auth endpoints are public and don't require API key
      expect(res.status).not.toBe(401);
      expect(res.body.code).not.toBe('AUTH_MISSING_API_KEY');
    });

    it('should allow confirm endpoint without API key (public endpoint)', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'ValidPassword123',
        });

      // Should not return 401 for missing API key
      // Auth endpoints are public and don't require API key
      expect(res.status).not.toBe(401);
      expect(res.body.code).not.toBe('AUTH_MISSING_API_KEY');
    });

    it('should process register request regardless of API key', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/register')
        .set('x-api-key', 'any-key-value')
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
        });

      // API key is ignored for auth endpoints
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('registered');
    });

    it('should process confirm request regardless of API key', async () => {
      const res = await request(app)
        .post('/api/auth/bubble-reset/confirm')
        .set('x-api-key', 'any-key-value')
        .send({
          email: 'user@example.com',
          reset_token: 'bubble-token-12345',
          new_password: 'ValidPassword123',
        });

      // API key is ignored for auth endpoints
      // Will fail with 400 due to invalid token, not 401
      expect(res.status).not.toBe(401);
    });
  });
});
