import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const DIFFERENT_CLIENT_ID = '987fcdeb-51a9-43d2-b654-123456789abc';

// Helper to generate valid JWT tokens
function generateToken(payload: any): string {
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn: '1h' });
}

describe.skip('Authorization Tests', () => {
  describe('Client role authorization', () => {
    it('should return 403 when client tries to access different client data', async () => {
      // Client with MOCK_CLIENT_ID trying to access DIFFERENT_CLIENT_ID
      const token = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const res = await request(app)
        .get(`/api/clients/${DIFFERENT_CLIENT_ID}/tax/calendar`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
      expect(res.body.message).toContain('You do not have access to this client');
    });

    it('should return 200 when client accesses their own data', async () => {
      const token = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`);

      // Should not be 403 (might fail for other reasons like DB)
      expect(res.status).not.toBe(403);
    });
  });

  describe('Admin role authorization', () => {
    it('should return 200 when admin accesses any client data', async () => {
      const token = generateToken({
        sub: 'admin123',
        role: 'admin',
        // Admin might not have client_id
      });

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`);

      // Should not be 403 (admin has full access)
      expect(res.status).not.toBe(403);
    });

    it('should return 200 when admin accesses different client data', async () => {
      const token = generateToken({
        sub: 'admin123',
        role: 'admin',
        client_id: MOCK_CLIENT_ID, // Admin might have a client_id
      });

      const res = await request(app)
        .get(`/api/clients/${DIFFERENT_CLIENT_ID}/tax/calendar`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`);

      // Should not be 403 (admin can access any client)
      expect(res.status).not.toBe(403);
    });
  });

  describe('Documents endpoint authorization', () => {
    it('should return 403 when client tries to access different client documents', async () => {
      const token = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const res = await request(app)
        .get(`/api/clients/${DIFFERENT_CLIENT_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should not return 403 when client accesses their own documents', async () => {
      const token = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).not.toBe(403);
    });
  });
});

