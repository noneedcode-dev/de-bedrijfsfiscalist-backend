import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';

const app = createApp();

const createMockQueryBuilder = (mockData: any = { data: [], error: null }) => {
  const builder: any = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    single: vi.fn(() => builder),
    then: vi.fn((resolve: any) => resolve(mockData)),
  };
  return builder;
};

let mockSupabaseClient: any;

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

// Test UUIDs for different clients (RFC4122 v4 compliant)
const CLIENT_A_ID = '11111111-1111-4111-a111-111111111111';
const CLIENT_B_ID = '22222222-2222-4222-a222-222222222222';

// Test user tokens (generated via JWT)
let adminToken: string;
let clientAToken: string;
let clientBToken: string;

describe('TICKET 4: Tenant Isolation via validateClientAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient = createMockQueryBuilder();
    vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);
  });

  beforeAll(() => {
    // Generate JWT tokens for test users
    const jwtSecret = env.supabase.jwtSecret;

    // Admin token
    adminToken = jwt.sign(
      {
        sub: 'admin-tenant-test',
        role: 'admin',
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Client A token
    clientAToken = jwt.sign(
      {
        sub: 'client-a-tenant-test',
        role: 'client',
        client_id: CLIENT_A_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Client B token
    clientBToken = jwt.sign(
      {
        sub: 'client-b-tenant-test',
        role: 'client',
        client_id: CLIENT_B_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('Missing Authentication', () => {
    it('should return 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_MISSING_HEADER');
      expect(res.body.message).toBe('Authorization header is missing');
    });

    it('should return 401 when token is invalid', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', 'Bearer invalid-token-12345');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
    });
  });

  describe('Client Role - Tenant Isolation', () => {
    it('should allow client to access their own resources (documents)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      // Should succeed (200) or return empty data, but NOT 403
      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });

    it('should allow client to access their own resources (tax calendar)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/tax/calendar`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });

    it('should allow client to access their own resources (tax risk controls)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/tax/risk-controls`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });

    it('should return 403 CLIENT_ACCESS_DENIED when client tries to access another client (documents)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
      expect(res.body.message).toBe('Access denied to this client');
    });

    it('should return 403 CLIENT_ACCESS_DENIED when client tries to access another client (tax calendar)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/tax/calendar`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
      expect(res.body.message).toBe('Access denied to this client');
    });

    it('should return 403 CLIENT_ACCESS_DENIED when client tries to access another client (tax risk controls)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/tax/risk-controls`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
      expect(res.body.message).toBe('Access denied to this client');
    });

    it('should return 403 when client B tries to access client A resources', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
      expect(res.body.message).toBe('Access denied to this client');
    });
  });

  describe('Admin Role - Cross-Tenant Access', () => {
    it('should allow admin to access client A resources (documents)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });

    it('should allow admin to access client B resources (documents)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });

    it('should allow admin to access client A resources (tax calendar)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/tax/calendar`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });

    it('should allow admin to access client B resources (tax calendar)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/tax/calendar`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });

    it('should allow admin to access client A resources (tax risk controls)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/tax/risk-controls`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });

    it('should allow admin to access client B resources (tax risk controls)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/tax/risk-controls`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('Standard Error Response Format (TICKET 1)', () => {
    it('should return standard error format for 403 CLIENT_ACCESS_DENIED', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('should return standard error format for 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
      expect(['AUTH_MISSING_HEADER', 'UNAUTHORIZED']).toContain(res.body.code);
    });
  });

  describe('Path Parameter Validation', () => {
    it('should enforce tenant isolation based on path parameter only (not query)', async () => {
      // Attempt to access Client B with Client A token, even with query param
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents?client_id=${CLIENT_A_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('should enforce tenant isolation based on path parameter only (not body)', async () => {
      // POST request with body containing different client_id
      const res = await request(app)
        .post(`/api/clients/${CLIENT_B_ID}/tax/risk-controls`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          client_id: CLIENT_A_ID, // Body param should be ignored
          process_name: 'Test Process',
          risk_description: 'Test risk',
          chance: 3,
          impact: 4,
          control_measure: 'Test control',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });
  });

  describe('All Client Routes Protected', () => {
    const protectedRoutes = [
      { method: 'get', path: '/documents' },
      { method: 'get', path: '/tax/calendar' },
      { method: 'get', path: '/tax/calendar/summary' },
      { method: 'get', path: '/tax/calendar/upcoming' },
      { method: 'get', path: '/tax/risk-controls' },
    ];

    protectedRoutes.forEach(({ method, path }) => {
      it(`should protect ${method.toUpperCase()} /api/clients/:clientId${path}`, async () => {
        const res = await request(app)
          [method as 'get'](`/api/clients/${CLIENT_B_ID}${path}`)
          .set('x-api-key', MOCK_API_KEY)
          .set('Authorization', `Bearer ${clientAToken}`);

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
      });
    });
  });
});
