import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const MOCK_ADVISOR_ID = '223e4567-e89b-12d3-a456-426614174000';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

describe('Time Entries Timer API', () => {
  describe('POST /api/clients/:clientId/time-entries/timer/start', () => {
    it('should require API key', async () => {
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/start`);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/start`)
        .set('x-api-key', MOCK_API_KEY);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/start`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ advisor_user_id: MOCK_ADVISOR_ID });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate advisor_user_id format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/start`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ advisor_user_id: 'invalid-uuid' });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should require advisor_user_id in body', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/start`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/clients/:clientId/time-entries/timer/stop', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/stop`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ advisor_user_id: MOCK_ADVISOR_ID });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate advisor_user_id format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/stop`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ advisor_user_id: 'invalid-uuid' });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/clients/:clientId/time-entries/timer/active', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/active`)
        .query({ advisor_user_id: MOCK_ADVISOR_ID })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate advisor_user_id format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/active`)
        .query({ advisor_user_id: 'invalid-uuid' })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should require advisor_user_id query param', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/active`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Client Access Control', () => {
    it('should prevent client from starting timer', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/start`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ advisor_user_id: MOCK_ADVISOR_ID });
      
      expect(res.status).toBe(403);
    });

    it('should prevent client from stopping timer', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/stop`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ advisor_user_id: MOCK_ADVISOR_ID });
      
      expect(res.status).toBe(403);
    });

    it('should prevent client from viewing active timer', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/active`)
        .query({ advisor_user_id: MOCK_ADVISOR_ID })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
    });
  });

  describe('Validation', () => {
    it('should validate clientId format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post('/api/clients/invalid-uuid/time-entries/timer/start')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ advisor_user_id: MOCK_ADVISOR_ID });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should accept optional task parameter', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries/timer/start`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ 
          advisor_user_id: MOCK_ADVISOR_ID,
          task: 'Test task description'
        });
      
      // Will fail at DB level in test, but validation should pass
      expect([201, 500]).toContain(res.status);
    });
  });
});
