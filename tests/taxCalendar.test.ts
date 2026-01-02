import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

describe('Tax Calendar API', () => {
  it('GET /api/clients/:clientId/tax/calendar should require API key', async () => {
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`);
    
    expect(res.status).toBe(401);
    expect(res.body.code).toBeTruthy();
  });

  it('GET /api/clients/:clientId/tax/calendar should require JWT', async () => {
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY);
    
    expect(res.status).toBe(401);
    expect(res.body.code).toBeTruthy();
  });

  it('GET /api/clients/:clientId/tax/calendar should validate clientId format', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .get('/api/clients/invalid-uuid/tax/calendar')
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(422);
    expect(res.body.code).toBeTruthy();
  });

  it('GET /api/clients/:clientId/tax/calendar should validate limit range (too low)', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });
    
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .query({ limit: 0 })
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('limit must be between 1 and 200');
  });

  it('GET /api/clients/:clientId/tax/calendar should validate limit range (too high)', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });
    
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .query({ limit: 201 })
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('limit must be between 1 and 200');
  });

  it('GET /api/clients/:clientId/tax/calendar should validate offset (negative)', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });
    
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .query({ offset: -1 })
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('offset must be a non-negative integer');
  });
});

