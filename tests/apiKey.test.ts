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

describe('API Key Authentication Tests', () => {
  it('should return 401 when x-api-key header is missing', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('Authorization', `Bearer ${token}`);
    // No x-api-key header

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(res.body.message).toBe('Invalid or missing API key');
  });

  it('should return 401 when x-api-key is invalid', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', 'wrong-api-key')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(res.body.message).toBe('Invalid or missing API key');
  });

  it('should proceed with valid x-api-key', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${token}`);

    // Should not be 401 due to API key (might fail for other reasons like JWT or DB)
    expect(res.status).not.toBe(401);
  });

  it('should return 401 when x-api-key is empty string', async () => {
    const token = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', '')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(res.body.message).toBe('Invalid or missing API key');
  });
});

