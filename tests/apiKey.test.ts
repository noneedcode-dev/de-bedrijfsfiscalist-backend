import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';

// Helper to generate valid JWT tokens
function generateToken(payload: any): string {
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn: '1h' });
}

describe.skip('API Key Authentication Tests', () => {
  it('should return 401 AUTH_MISSING_API_KEY when x-api-key header is missing', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('Authorization', `Bearer ${token}`);
    // No x-api-key header

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_MISSING_API_KEY');
    expect(res.body.message).toBe('API key is required');
    expect(res.body.request_id).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should return 401 AUTH_INVALID_API_KEY when x-api-key is invalid', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', 'wrong-api-key')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_API_KEY');
    expect(res.body.message).toBe('Invalid API key');
    expect(res.body.request_id).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should proceed with valid x-api-key', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${token}`);

    // Should not be 401 AUTH_MISSING_API_KEY or AUTH_INVALID_API_KEY
    // (might be 401 for other auth reasons or fail for DB reasons)
    if (res.status === 401) {
      expect(res.body.code).not.toBe('AUTH_MISSING_API_KEY');
      expect(res.body.code).not.toBe('AUTH_INVALID_API_KEY');
    }
  });

  it('should return 401 AUTH_MISSING_API_KEY when x-api-key is empty string', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', '')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_MISSING_API_KEY');
    expect(res.body.message).toBe('API key is required');
    expect(res.body.request_id).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should bypass API key check for /api/auth/invitation/:token', async () => {
    const res = await request(app)
      .get('/api/auth/invitation/some-token');
    // No x-api-key header

    // Should not be 401 due to missing API key
    // Will be 404 or other error because token doesn't exist, but not 401 AUTH_MISSING_API_KEY
    expect(res.status).not.toBe(401);
    if (res.status === 404) {
      expect(res.body.code).not.toBe('AUTH_MISSING_API_KEY');
    }
  });

  it('should bypass API key check for /api/auth/accept-invite', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: 'test-token', password: 'Test1234' });
    // No x-api-key header

    // Should not be 401 due to missing API key
    // Will be 400 or 404 due to validation/token issues, but not 401 AUTH_MISSING_API_KEY
    expect(res.status).not.toBe(401);
    if (res.status === 400 || res.status === 404) {
      expect(res.body.code).not.toBe('AUTH_MISSING_API_KEY');
    }
  });

  it('should require API key for /api/admin routes', async () => {
    const adminToken = generateToken({ sub: 'admin123', role: 'admin' });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    // No x-api-key header

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_MISSING_API_KEY');
    expect(res.body.message).toBe('API key is required');
    expect(res.body.request_id).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

