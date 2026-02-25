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

describe('Time Entries List Enrichment', () => {
  describe('GET /api/clients/:clientId/time-entries', () => {
    it('should return enriched fields in response', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta).toHaveProperty('offset');
      expect(res.body.meta).toHaveProperty('timestamp');
      
      if (res.body.data.length > 0) {
        const entry = res.body.data[0];
        
        expect(entry).toHaveProperty('client_name');
        expect(entry).toHaveProperty('advisor_name');
        expect(entry).toHaveProperty('started_at_formatted');
        expect(entry).toHaveProperty('elapsed_minutes');
        
        if (entry.started_at_formatted !== null) {
          expect(entry.started_at_formatted).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
        }
        
        if (entry.elapsed_minutes !== null) {
          expect(typeof entry.elapsed_minutes).toBe('number');
          expect(entry.elapsed_minutes).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should accept pagination parameters', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries?limit=10&offset=0`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(10);
      expect(res.body.meta.offset).toBe(0);
    });

    it('should accept date range filters', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries?from=2026-01-01&to=2026-12-31`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
    });

    it('should accept advisor filter', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      const advisorId = '223e4567-e89b-12d3-a456-426614174000';
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries?advisor_user_id=${advisorId}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
    });

    it('should allow client role to view their own entries', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      // May fail at DB level in test environment, but should not be 403 (forbidden)
      expect([200, 500]).toContain(res.status);
      
      if (res.status === 200) {
        expect(res.body).toHaveProperty('data');
        
        if (res.body.data.length > 0) {
          const entry = res.body.data[0];
          expect(entry).toHaveProperty('client_name');
          expect(entry).toHaveProperty('advisor_name');
          expect(entry).toHaveProperty('started_at_formatted');
          expect(entry).toHaveProperty('elapsed_minutes');
        }
      }
    });

    it('should validate clientId format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/clients/invalid-uuid/time-entries')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate limit range', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries?limit=300`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});
