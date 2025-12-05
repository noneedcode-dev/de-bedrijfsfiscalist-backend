import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';

const app = createApp();

// Test için mock token ve IDs
const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const MOCK_JWT_TOKEN = 'mock-jwt-token'; // Gerçek test'te Supabase'den alınmalı

describe('Tax Calendar API', () => {
  it('GET /api/clients/:clientId/tax/calendar should require API key', async () => {
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`);
    
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('GET /api/clients/:clientId/tax/calendar should require JWT', async () => {
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
      .set('x-api-key', MOCK_API_KEY);
    
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('GET /api/clients/:clientId/tax/calendar should validate clientId format', async () => {
    const res = await request(app)
      .get('/api/clients/invalid-uuid/tax/calendar')
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${MOCK_JWT_TOKEN}`);
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

