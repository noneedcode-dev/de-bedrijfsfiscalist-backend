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

describe('Time Entries Summary API', () => {
  describe('GET /api/clients/:clientId/time-entries/summary', () => {
    it('should require API key', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/summary`);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/summary`)
        .set('x-api-key', MOCK_API_KEY);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should allow client to view their own summary', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      // Will fail at DB level in test, but auth should pass
      expect([200, 500]).toContain(res.status);
    });

    it('should allow admin to view any client summary', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      // Will fail at DB level in test, but auth should pass
      expect([200, 500]).toContain(res.status);
    });

    it('should validate year_month format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/summary`)
        .query({ year_month: 'invalid-format' })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('year_month');
    });

    it('should accept valid year_month format YYYY-MM', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/summary`)
        .query({ year_month: '2026-02' })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      // Will fail at DB level in test, but validation should pass
      expect([200, 500]).toContain(res.status);
    });

    it('should validate clientId format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/clients/invalid-uuid/time-entries/summary')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/clients/:clientId/time-entries', () => {
    it('should require API key', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should allow client to view their own entries', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      // Will fail at DB level in test, but auth should pass
      expect([200, 500]).toContain(res.status);
    });

    it('should allow admin to view any client entries', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      // Will fail at DB level in test, but auth should pass
      expect([200, 500]).toContain(res.status);
    });

    it('should validate limit range (too low)', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .query({ limit: 0 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Limit must be between 1 and 200');
    });

    it('should validate limit range (too high)', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .query({ limit: 201 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Limit must be between 1 and 200');
    });

    it('should validate offset (negative)', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .query({ offset: -1 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Offset must be a non-negative integer');
    });

    it('should accept valid date filters', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .query({ from: '2026-01-01', to: '2026-12-31' })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      // Will fail at DB level in test, but validation should pass
      expect([200, 500]).toContain(res.status);
    });

    it('should validate advisor_user_id format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .query({ advisor_user_id: 'invalid-uuid' })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Client Access Control', () => {
    it('should prevent client from accessing other client data', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: '999e4567-e89b-12d3-a456-426614174000' // Different client
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });
  });
});
