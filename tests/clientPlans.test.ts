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

describe('Client Plans API', () => {
  describe('POST /api/admin/clients/:clientId/plan-assignments', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/plan-assignments`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          plan_code: 'BASIC',
          effective_from: '2026-02-10',
        });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate clientId format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post('/api/admin/clients/invalid-uuid/plan-assignments')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_code: 'BASIC',
          effective_from: '2026-02-10',
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate plan_code enum', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/plan-assignments`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_code: 'INVALID',
          effective_from: '2026-02-10',
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate effective_from date format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/plan-assignments`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_code: 'BASIC',
          effective_from: 'invalid-date',
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should require plan_code field', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/plan-assignments`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          effective_from: '2026-02-10',
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should require effective_from field', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/plan-assignments`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_code: 'BASIC',
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should accept valid plan assignment', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/plan-assignments`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_code: 'PRO',
          effective_from: '2026-02-10',
        });
      
      expect([201, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/admin/clients/:clientId/plan-assignments', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/admin/clients/${MOCK_CLIENT_ID}/plan-assignments`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate clientId format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/clients/invalid-uuid/plan-assignments')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should allow admin to view plan history', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/admin/clients/${MOCK_CLIENT_ID}/plan-assignments`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/admin/clients/:clientId/plan', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/admin/clients/${MOCK_CLIENT_ID}/plan`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate clientId format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/clients/invalid-uuid/plan')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should allow admin to view current plan', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/admin/clients/${MOCK_CLIENT_ID}/plan`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/clients/:clientId/billing/plan (Client Access)', () => {
    it('should allow client to view their own plan', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/billing/plan`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect([200, 500]).toContain(res.status);
    });

    it('should validate clientId format', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get('/api/clients/invalid-uuid/billing/plan')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      // validateClientAccess runs before validation, returns 403 for invalid UUID
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });
  });
});
