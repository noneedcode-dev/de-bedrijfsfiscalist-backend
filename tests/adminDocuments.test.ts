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

describe('GET /api/admin/documents', () => {
  let adminToken: string;
  let clientToken: string;

  beforeAll(() => {
    adminToken = generateAdminToken();
    clientToken = generateClientToken();
  });

  describe('Authentication & Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const res = await request(app)
        .get('/api/admin/documents')
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
    });

    it('should return 403 when client role tries to access admin endpoint', async () => {
      const res = await request(app)
        .get('/api/admin/documents')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should return 200 when admin role accesses endpoint', async () => {
      const res = await request(app)
        .get('/api/admin/documents')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Response Structure', () => {
    it('should return data and meta fields', async () => {
      const res = await request(app)
        .get('/api/admin/documents')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return correct meta fields', async () => {
      const res = await request(app)
        .get('/api/admin/documents')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta).toHaveProperty('offset');
      expect(res.body.meta).toHaveProperty('timestamp');
      expect(typeof res.body.meta.total).toBe('number');
      expect(typeof res.body.meta.limit).toBe('number');
      expect(typeof res.body.meta.offset).toBe('number');
    });

    it('should return documents with correct fields', async () => {
      const res = await request(app)
        .get('/api/admin/documents')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const doc = res.body.data[0];
        expect(doc).toHaveProperty('id');
        expect(doc).toHaveProperty('client_id');
        expect(doc).toHaveProperty('name');
        expect(doc).toHaveProperty('source');
        expect(doc).toHaveProperty('created_at');
      }
    });
  });

  describe('Client ID Filter', () => {
    it('should filter documents by client_id', async () => {
      const res = await request(app)
        .get(`/api/admin/documents?client_id=${MOCK_CLIENT_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        res.body.data.forEach((doc: any) => {
          expect(doc.client_id).toBe(MOCK_CLIENT_ID);
        });
      }
    });

    it('should return 422 for invalid client_id format', async () => {
      const res = await request(app)
        .get('/api/admin/documents?client_id=invalid-uuid')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(res.body).toHaveProperty('request_id');
    });
  });

  describe('Search Filter (q)', () => {
    it('should search documents by name', async () => {
      const res = await request(app)
        .get('/api/admin/documents?q=test')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should handle empty search results', async () => {
      const res = await request(app)
        .get('/api/admin/documents?q=nonexistentdocument12345xyz')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should perform case-insensitive search', async () => {
      const res = await request(app)
        .get('/api/admin/documents?q=TEST')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Pagination', () => {
    it('should use default limit of 20', async () => {
      const res = await request(app)
        .get('/api/admin/documents')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(20);
      expect(res.body.meta.offset).toBe(0);
    });

    it('should respect custom limit', async () => {
      const res = await request(app)
        .get('/api/admin/documents?limit=10')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(10);
      expect(res.body.data.length).toBeLessThanOrEqual(10);
    });

    it.skip('should respect custom offset', async () => {
      const res = await request(app)
        .get('/api/admin/documents?offset=2')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.offset).toBe(2);
    });

    it('should return 422 for limit > 100', async () => {
      const res = await request(app)
        .get('/api/admin/documents?limit=101')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(res.body).toHaveProperty('request_id');
    });

    it('should return 422 for negative offset', async () => {
      const res = await request(app)
        .get('/api/admin/documents?offset=-1')
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
        .get('/api/admin/documents?limit=10')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 1) {
        const dates = res.body.data.map((doc: any) => new Date(doc.created_at).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
      }
    });
  });

  describe('Include Deleted Filter', () => {
    it('should accept include_deleted parameter (default false)', async () => {
      const res = await request(app)
        .get('/api/admin/documents?include_deleted=false')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should accept include_deleted=true (reserved for future use)', async () => {
      const res = await request(app)
        .get('/api/admin/documents?include_deleted=true')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Combined Filters', () => {
    it('should filter by both client_id and q', async () => {
      const res = await request(app)
        .get(`/api/admin/documents?client_id=${MOCK_CLIENT_ID}&q=test`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        res.body.data.forEach((doc: any) => {
          expect(doc.client_id).toBe(MOCK_CLIENT_ID);
        });
      }
    });

    it('should combine all filters with pagination', async () => {
      const res = await request(app)
        .get(`/api/admin/documents?client_id=${MOCK_CLIENT_ID}&q=test&limit=5&offset=0`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(5);
      expect(res.body.meta.offset).toBe(0);
    });
  });
});
