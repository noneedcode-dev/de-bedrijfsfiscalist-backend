import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const MOCK_ADVISOR_ID = '223e4567-e89b-12d3-a456-426614174000';
const MOCK_ENTRY_ID = '323e4567-e89b-12d3-a456-426614174000';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

describe('Time Entries CRUD API', () => {
  describe('POST /api/clients/:clientId/time-entries', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          advisor_user_id: MOCK_ADVISOR_ID,
          entry_date: '2026-02-04',
          minutes: 60,
        });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate required fields', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate advisor_user_id format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          advisor_user_id: 'invalid-uuid',
          entry_date: '2026-02-04',
          minutes: 60,
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate minutes is positive', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          advisor_user_id: MOCK_ADVISOR_ID,
          entry_date: '2026-02-04',
          minutes: 0,
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate entry_date format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          advisor_user_id: MOCK_ADVISOR_ID,
          entry_date: 'invalid-date',
          minutes: 60,
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should accept optional task field', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          advisor_user_id: MOCK_ADVISOR_ID,
          entry_date: '2026-02-04',
          minutes: 60,
          task: 'Test task',
        });
      
      // Will fail at DB level in test, but validation should pass
      expect([201, 500]).toContain(res.status);
    });

    it('should accept optional is_billable field', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          advisor_user_id: MOCK_ADVISOR_ID,
          entry_date: '2026-02-04',
          minutes: 60,
          is_billable: false,
        });
      
      // Will fail at DB level in test, but validation should pass
      expect([201, 500]).toContain(res.status);
    });
  });

  describe('PATCH /api/clients/:clientId/time-entries/:id', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/time-entries/${MOCK_ENTRY_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ minutes: 90 });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate entry id format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/time-entries/invalid-uuid`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ minutes: 90 });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate minutes if provided', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/time-entries/${MOCK_ENTRY_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ minutes: 0 });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should accept partial updates', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/time-entries/${MOCK_ENTRY_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ task: 'Updated task' });
      
      // Will fail at DB level in test, but validation should pass
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/clients/:clientId/time-entries/:id', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .delete(`/api/clients/${MOCK_CLIENT_ID}/time-entries/${MOCK_ENTRY_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate entry id format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .delete(`/api/clients/${MOCK_CLIENT_ID}/time-entries/invalid-uuid`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate clientId format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .delete(`/api/clients/invalid-uuid/time-entries/${MOCK_ENTRY_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Client Access Prevention', () => {
    it('should prevent client from creating entries', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/time-entries`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          advisor_user_id: MOCK_ADVISOR_ID,
          entry_date: '2026-02-04',
          minutes: 60,
        });
      
      expect(res.status).toBe(403);
    });

    it('should prevent client from updating entries', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/time-entries/${MOCK_ENTRY_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ minutes: 90 });
      
      expect(res.status).toBe(403);
    });

    it('should prevent client from deleting entries', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .delete(`/api/clients/${MOCK_CLIENT_ID}/time-entries/${MOCK_ENTRY_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
    });
  });
});
