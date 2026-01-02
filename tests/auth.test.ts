import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';

// Helper to generate valid JWT tokens
function generateToken(payload: any, expiresIn: string = '1h'): string {
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

describe.skip('JWT Authentication Tests', () => {
  it('should return 401 when JWT is missing', async () => {
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_MISSING_HEADER');
    expect(res.body.message).toBe('Authorization header is missing');
  });

  it('should return 401 when JWT has invalid format (no Bearer)', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', token); // Missing "Bearer " prefix

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_FORMAT');
    expect(res.body.message).toContain('Invalid authorization header format');
  });

  it('should return 401 when JWT is expired', async () => {
    const token = generateToken(
      { sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID },
      '-1h' // Expired 1 hour ago
    );

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
    expect(res.body.message).toBe('Invalid or expired token');
  });

  it('should return 401 when JWT is invalid (wrong signature)', async () => {
    const invalidToken = jwt.sign(
      { sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID },
      'wrong-secret'
    );

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${invalidToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
    expect(res.body.message).toBe('Invalid or expired token');
  });

  it('should return 401 when JWT payload is missing required fields (sub)', async () => {
    const token = generateToken({ role: 'client', client_id: MOCK_CLIENT_ID }); // Missing sub

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(res.body.message).toContain('missing required fields');
  });

  it('should return 401 when JWT payload is missing required fields (role)', async () => {
    const token = generateToken({ sub: 'user123', client_id: MOCK_CLIENT_ID }); // Missing role

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_CLAIMS');
    expect(res.body.message).toContain('missing required claims');
  });

  it('should return 401 when client role is missing client_id', async () => {
    const token = generateToken({ sub: 'user123', role: 'client' }); // Missing client_id for client role

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_CLAIMS');
    expect(res.body.message).toContain('missing required claims');
  });

  it('should proceed with valid JWT token', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${token}`);

    // Should not be 401 (actual response depends on other middleware/db)
    expect(res.status).not.toBe(401);
  });
});

