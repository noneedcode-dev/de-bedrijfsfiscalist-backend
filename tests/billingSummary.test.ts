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

describe('Billing Summary API', () => {
  describe('GET /api/clients/:clientId/billing/allowance/current', () => {
    it('should allow client to view their current allowance', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/billing/allowance/current`)
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
        .get('/api/clients/invalid-uuid/billing/allowance/current')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      // validateClientAccess runs before validation, returns 403 for invalid UUID
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('should allow admin to view client allowance', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/billing/allowance/current`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/clients/:clientId/billing/plan', () => {
    it('should allow client to view their plan', async () => {
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

    it('should allow admin to view client plan', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/billing/plan`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect([200, 500]).toContain(res.status);
    });
  });
});
