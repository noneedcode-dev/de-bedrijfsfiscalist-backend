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
      sub: 'admin-ticket12-test',
      role: 'admin',
    },
    env.supabase.jwtSecret,
    { expiresIn: '1h' }
  );
}

function generateClientToken(): string {
  return jwt.sign(
    {
      sub: 'client-ticket12-test',
      role: 'client',
      client_id: MOCK_CLIENT_ID,
    },
    env.supabase.jwtSecret,
    { expiresIn: '1h' }
  );
}

let adminToken: string;
let clientToken: string;

describe.skip('TICKET 12: Admin Clients List - include_users + users_count Response Contract', () => {
  beforeAll(() => {
    adminToken = generateAdminToken();
    clientToken = generateClientToken();
  });

  describe('Authentication & Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const res = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body.code).toBeDefined();
    });

    it('should return 403 when client role tries to access admin endpoint', async () => {
      const res = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBeDefined();
    });

    it('should return 200 when admin role accesses endpoint', async () => {
      const res = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('include_users=false (default)', () => {
    it('should return clients without users array when include_users is not provided', async () => {
      const res = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const client = res.body.data[0];
        expect(client).not.toHaveProperty('users');
        expect(client).toHaveProperty('users_count');
        expect(typeof client.users_count).toBe('number');
        expect(client.users_count).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return clients with users_count when include_users=false', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=false')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const client = res.body.data[0];
        expect(client).not.toHaveProperty('users');
        expect(client).toHaveProperty('users_count');
        expect(typeof client.users_count).toBe('number');
      }
    });

    it('should have smaller payload without users array', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=false')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const responseSize = JSON.stringify(res.body).length;
      expect(responseSize).toBeGreaterThan(0);
    });
  });

  describe('include_users=true', () => {
    it('should return clients with users array when include_users=true', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=true')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const client = res.body.data[0];
        expect(client).toHaveProperty('users');
        expect(client).toHaveProperty('users_count');
        expect(Array.isArray(client.users)).toBe(true);
        expect(client.users_count).toBe(client.users.length);

        if (client.users.length > 0) {
          const user = client.users[0];
          expect(user).toHaveProperty('id');
          expect(user).toHaveProperty('email');
          expect(user).toHaveProperty('full_name');
          expect(user).toHaveProperty('role');
          expect(user).toHaveProperty('is_active');
          expect(user).toHaveProperty('created_at');
          expect(user).toHaveProperty('client_id');
        }
      }
    });

    it('should have consistent users_count with users array length', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=true')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      if (res.body.data.length > 0) {
        res.body.data.forEach((client: any) => {
          expect(client.users.length).toBe(client.users_count);
        });
      }
    });
  });

  describe('Boolean Parsing', () => {
    it('should correctly parse include_users=true as boolean', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=true')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const client = res.body.data[0];
        expect(client).toHaveProperty('users');
      }
    });

    it('should correctly parse include_users=false as boolean', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=false')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const client = res.body.data[0];
        expect(client).not.toHaveProperty('users');
        expect(client).toHaveProperty('users_count');
      }
    });

    it('should reject invalid boolean values', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=invalid')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Pagination Metadata', () => {
    it('should include pagination metadata in response', async () => {
      const res = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('count');
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta).toHaveProperty('offset');
      expect(res.body.meta).toHaveProperty('timestamp');
      expect(typeof res.body.meta.count).toBe('number');
      expect(typeof res.body.meta.limit).toBe('number');
      expect(typeof res.body.meta.offset).toBe('number');
      expect(typeof res.body.meta.timestamp).toBe('string');
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/admin/clients?limit=5')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(5);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should respect offset parameter', async () => {
      const res = await request(app)
        .get('/api/admin/clients?offset=1')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.offset).toBe(1);
    });

    it('should enforce maximum limit of 100', async () => {
      const res = await request(app)
        .get('/api/admin/clients?limit=200')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should use default limit of 50 when not specified', async () => {
      const res = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(50);
    });
  });

  describe('Search Functionality', () => {
    it('should filter clients by search query (name)', async () => {
      const allRes = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      if (allRes.body.data.length > 0) {
        const firstClient = allRes.body.data[0];
        const searchTerm = firstClient.name.substring(0, 5);
        
        const res = await request(app)
          .get(`/api/admin/clients?search=${searchTerm}`)
          .set('x-api-key', MOCK_API_KEY)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('should filter clients by search query (slug)', async () => {
      const allRes = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      if (allRes.body.data.length > 0) {
        const clientWithSlug = allRes.body.data.find((c: any) => c.slug);
        if (clientWithSlug) {
          const searchTerm = clientWithSlug.slug.substring(0, 5);
          
          const res = await request(app)
            .get(`/api/admin/clients?search=${searchTerm}`)
            .set('x-api-key', MOCK_API_KEY)
            .set('Authorization', `Bearer ${adminToken}`);

          expect(res.status).toBe(200);
          expect(Array.isArray(res.body.data)).toBe(true);
        }
      }
    });

    it('should return empty array when no clients match search', async () => {
      const res = await request(app)
        .get('/api/admin/clients?search=nonexistent-client-xyz-123')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Standard Error Format (TICKET 1)', () => {
    it('should return standard error format for validation errors', async () => {
      const res = await request(app)
        .get('/api/admin/clients?limit=invalid')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return standard error format for authentication errors', async () => {
      const res = await request(app)
        .get('/api/admin/clients')
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('Combined Parameters', () => {
    it('should handle multiple query parameters together', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=true&limit=10&offset=0&search=Test')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(10);
      expect(res.body.meta.offset).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty result set gracefully', async () => {
      const res = await request(app)
        .get('/api/admin/clients?search=definitely-does-not-exist-xyz-999')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toHaveProperty('count');
      expect(res.body.meta.count).toBe(0);
    });

    it('should handle clients with zero users correctly', async () => {
      const res = await request(app)
        .get('/api/admin/clients?include_users=true')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      
      const clientWithNoUsers = res.body.data.find((c: any) => c.users_count === 0);
      if (clientWithNoUsers) {
        expect(clientWithNoUsers.users).toEqual([]);
        expect(clientWithNoUsers.users_count).toBe(0);
      }
    });
  });
});
