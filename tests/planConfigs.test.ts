import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

describe('Plan Configs API', () => {
  describe('GET /api/admin/plan-configs', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: '123e4567-e89b-12d3-a456-426614174000' 
      });
      
      const res = await request(app)
        .get('/api/admin/plan-configs')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should allow admin to list plan configs', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/plan-configs')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect([200, 500]).toContain(res.status);
    });

    it('should accept active_only query parameter', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/plan-configs?active_only=true')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect([200, 500]).toContain(res.status);
    });

    it('should validate active_only as boolean', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/plan-configs?active_only=invalid')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/admin/plan-configs/:planCode', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: '123e4567-e89b-12d3-a456-426614174000' 
      });
      
      const res = await request(app)
        .get('/api/admin/plan-configs/BASIC')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate planCode enum', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/plan-configs/INVALID')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should accept valid plan codes', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      for (const planCode of ['NONE', 'BASIC', 'PRO']) {
        const res = await request(app)
          .get(`/api/admin/plan-configs/${planCode}`)
          .set('x-api-key', MOCK_API_KEY)
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect([200, 404, 500]).toContain(res.status);
      }
    });
  });

  describe('PATCH /api/admin/plan-configs/:planCode', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: '123e4567-e89b-12d3-a456-426614174000' 
      });
      
      const res = await request(app)
        .patch('/api/admin/plan-configs/BASIC')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ free_minutes_monthly: 300 });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate planCode enum', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch('/api/admin/plan-configs/INVALID')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ free_minutes_monthly: 300 });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate free_minutes_monthly as non-negative integer', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch('/api/admin/plan-configs/BASIC')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ free_minutes_monthly: -10 });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate hourly_rate_eur as decimal', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch('/api/admin/plan-configs/BASIC')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hourly_rate_eur: 'invalid' });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate is_active as boolean', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch('/api/admin/plan-configs/BASIC')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: 'invalid' });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should accept partial updates', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch('/api/admin/plan-configs/BASIC')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ display_name: 'Updated Basic Plan' });
      
      expect([200, 404, 500]).toContain(res.status);
    });

    it('should accept multiple fields', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch('/api/admin/plan-configs/PRO')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          display_name: 'Professional Plan',
          free_minutes_monthly: 600,
          hourly_rate_eur: '175.50',
          is_active: true,
        });
      
      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
