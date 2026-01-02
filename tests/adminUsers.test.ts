import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';

function generateAdminToken(): string {
  return jwt.sign(
    {
      sub: 'admin123',
      role: 'admin',
    },
    env.supabase.jwtSecret,
    { expiresIn: '1h' }
  );
}

function generateClientToken(): string {
  return jwt.sign(
    {
      sub: 'client123',
      role: 'client',
      client_id: MOCK_CLIENT_ID,
    },
    env.supabase.jwtSecret,
    { expiresIn: '1h' }
  );
}

describe.skip('GET /api/admin/users', () => {
  let adminToken: string;
  let clientToken: string;

  beforeAll(() => {
    adminToken = generateAdminToken();
    clientToken = generateClientToken();
  });

  describe('Authentication & Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
    });

    it('should return 403 when client role tries to access admin endpoint', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should return 200 when admin role accesses endpoint', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Response Structure', () => {
    it('should return data and meta fields', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return correct meta fields', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta).toHaveProperty('count');
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta).toHaveProperty('offset');
      expect(res.body.meta).toHaveProperty('timestamp');
      expect(typeof res.body.meta.count).toBe('number');
      expect(typeof res.body.meta.limit).toBe('number');
      expect(typeof res.body.meta.offset).toBe('number');
    });

    it('should return users with correct fields', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const user = res.body.data[0];
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('full_name');
        expect(user).toHaveProperty('role');
        expect(user).toHaveProperty('is_active');
        expect(user).toHaveProperty('created_at');
        expect(user).toHaveProperty('client_id');
      }
    });
  });

  describe('Role Filter', () => {
    it('should filter users by role=admin', async () => {
      const res = await request(app)
        .get('/api/admin/users?role=admin')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        res.body.data.forEach((user: any) => {
          expect(user.role).toBe('admin');
        });
      }
    });

    it('should filter users by role=client', async () => {
      const res = await request(app)
        .get('/api/admin/users?role=client')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        res.body.data.forEach((user: any) => {
          expect(user.role).toBe('client');
        });
      }
    });

    it('should return 422 for invalid role with standard error format', async () => {
      const res = await request(app)
        .get('/api/admin/users?role=invalid')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('details');
    });
  });

  describe('Client ID Filter', () => {
    it('should filter users by client_id', async () => {
      const res = await request(app)
        .get(`/api/admin/users?client_id=${MOCK_CLIENT_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        res.body.data.forEach((user: any) => {
          expect(user.client_id).toBe(MOCK_CLIENT_ID);
        });
      }
    });

    it('should return 422 for invalid client_id format with standard error format', async () => {
      const res = await request(app)
        .get('/api/admin/users?client_id=invalid-uuid')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(res.body).toHaveProperty('request_id');
    });
  });

  describe('Combined Filters', () => {
    it('should filter by both role and client_id', async () => {
      const res = await request(app)
        .get(`/api/admin/users?role=admin&client_id=${MOCK_CLIENT_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        res.body.data.forEach((user: any) => {
          expect(user.role).toBe('admin');
          expect(user.client_id).toBe(MOCK_CLIENT_ID);
        });
      }
    });
  });

  describe('Search Filter', () => {
    it('should search users by email or full_name', async () => {
      const res = await request(app)
        .get('/api/admin/users?search=test')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should handle empty search results', async () => {
      const res = await request(app)
        .get('/api/admin/users?search=nonexistentuser12345')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Pagination', () => {
    it('should use default limit of 50', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(50);
      expect(res.body.meta.offset).toBe(0);
    });

    it('should respect custom limit', async () => {
      const res = await request(app)
        .get('/api/admin/users?limit=10')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(10);
      expect(res.body.data.length).toBeLessThanOrEqual(10);
    });

    it('should respect custom offset', async () => {
      const res = await request(app)
        .get('/api/admin/users?offset=5')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.offset).toBe(5);
    });

    it('should return 422 for limit > 100 with standard error format', async () => {
      const res = await request(app)
        .get('/api/admin/users?limit=101')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(res.body).toHaveProperty('request_id');
    });

    it('should return 422 for negative offset with standard error format', async () => {
      const res = await request(app)
        .get('/api/admin/users?offset=-1')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(res.body).toHaveProperty('request_id');
    });
  });

  describe('Sorting', () => {
    it('should order results by created_at desc', async () => {
      const res = await request(app)
        .get('/api/admin/users?limit=10')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 1) {
        const dates = res.body.data.map((user: any) => new Date(user.created_at).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
      }
    });
  });
});
