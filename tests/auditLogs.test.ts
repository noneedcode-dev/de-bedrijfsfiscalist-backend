// tests/auditLogs.test.ts
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import { createSupabaseAdminClient } from '../src/lib/supabaseClient';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

// Helper to generate valid JWT tokens
function generateToken(userId: string, role: string, clientId?: string): string {
  const payload: any = {
    sub: userId,
    role,
    email: `${role}-audit@test.com`,
  };
  if (clientId) {
    payload.client_id = clientId;
  }
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn: '1h' });
}

describe.skip('GET /api/admin/audit-logs', () => {
  let adminToken: string;
  let clientToken: string;
  let testClientId: string;
  let testUserId: string;
  let adminUserId: string;

  beforeAll(async () => {
    const supabase = createSupabaseAdminClient();

    // Create test client
    const { data: client } = await supabase
      .from('clients')
      .insert({ name: 'Test Audit Client', slug: 'test-audit-client' })
      .select()
      .single();
    testClientId = client!.id;

    // Create admin user
    const { data: adminAuthUser } = await supabase.auth.admin.createUser({
      email: 'admin-audit@test.com',
      password: 'password123',
      email_confirm: true,
    });
    adminUserId = adminAuthUser.user!.id;

    await supabase.from('app_users').insert({
      user_id: adminUserId,
      email: 'admin-audit@test.com',
      role: 'admin',
      is_active: true,
    });

    // Create client user
    const { data: clientAuthUser } = await supabase.auth.admin.createUser({
      email: 'client-audit@test.com',
      password: 'password123',
      email_confirm: true,
    });
    testUserId = clientAuthUser.user!.id;

    await supabase.from('app_users').insert({
      user_id: testUserId,
      email: 'client-audit@test.com',
      role: 'client',
      client_id: testClientId,
      is_active: true,
    });

    // Create test audit logs
    await supabase.from('audit_logs').insert([
      {
        client_id: testClientId,
        actor_user_id: testUserId,
        actor_role: 'client',
        action: 'DOCUMENTS_LIST_VIEWED',
        entity_type: 'document',
        metadata: { test: true },
      },
      {
        client_id: testClientId,
        actor_user_id: adminUserId,
        actor_role: 'admin',
        action: 'CLIENT_CREATED',
        entity_type: 'client',
        entity_id: testClientId,
        metadata: { client_name: 'Test Audit Client' },
      },
      {
        client_id: testClientId,
        actor_user_id: testUserId,
        actor_role: 'client',
        action: 'DOCUMENT_DOWNLOADED',
        entity_type: 'document',
        metadata: { test: true },
      },
    ]);

    adminToken = generateToken(adminUserId, 'admin');
    clientToken = generateToken(testUserId, 'client', testClientId);
  });

  afterAll(async () => {
    const supabase = createSupabaseAdminClient();
    
    // Cleanup
    await supabase.from('audit_logs').delete().eq('client_id', testClientId);
    await supabase.from('app_users').delete().eq('email', 'admin-audit@test.com');
    await supabase.from('app_users').delete().eq('email', 'client-audit@test.com');
    await supabase.auth.admin.deleteUser(testUserId);
    await supabase.from('clients').delete().eq('id', testClientId);
  });

  describe('Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/api/admin/audit-logs');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTH_MISSING_HEADER');
    });

    it('should return 403 when non-admin token is provided', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should return 200 when valid admin token is provided', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
    });
  });

  describe('Pagination', () => {
    it('should return paginated results with default limit and offset', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(50);
      expect(response.body.offset).toBe(0);
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(typeof response.body.count).toBe('number');
    });

    it('should respect custom limit and offset', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?limit=2&offset=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(2);
      expect(response.body.offset).toBe(1);
      expect(response.body.results.length).toBeLessThanOrEqual(2);
    });

    it('should reject invalid limit values', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?limit=0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(422);
      expect(response.body.message).toContain('limit');
    });

    it('should reject invalid offset values', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?offset=-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(422);
      expect(response.body.message).toContain('offset');
    });
  });

  describe('Filters', () => {
    it('should filter by client_id', async () => {
      const response = await request(app)
        .get(`/api/admin/audit-logs?client_id=${testClientId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBeGreaterThan(0);
      response.body.results.forEach((log: any) => {
        expect(log.client_id).toBe(testClientId);
      });
    });

    it('should filter by action', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?action=CLIENT_CREATED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      response.body.results.forEach((log: any) => {
        expect(log.action).toBe('CLIENT_CREATED');
      });
    });

    it('should filter by date range (from)', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const response = await request(app)
        .get(`/api/admin/audit-logs?from=${yesterday.toISOString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      response.body.results.forEach((log: any) => {
        expect(new Date(log.created_at).getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
      });
    });

    it('should filter by date range (to)', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const response = await request(app)
        .get(`/api/admin/audit-logs?to=${tomorrow.toISOString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      response.body.results.forEach((log: any) => {
        expect(new Date(log.created_at).getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      });
    });

    it('should filter by date range (from and to)', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const response = await request(app)
        .get(`/api/admin/audit-logs?from=${yesterday.toISOString()}&to=${tomorrow.toISOString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      response.body.results.forEach((log: any) => {
        const logDate = new Date(log.created_at).getTime();
        expect(logDate).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(logDate).toBeLessThanOrEqual(tomorrow.getTime());
      });
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get(`/api/admin/audit-logs?client_id=${testClientId}&action=DOCUMENTS_LIST_VIEWED&limit=10`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(10);
      response.body.results.forEach((log: any) => {
        expect(log.client_id).toBe(testClientId);
        expect(log.action).toBe('DOCUMENTS_LIST_VIEWED');
      });
    });

    it('should reject invalid client_id format', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?client_id=invalid-uuid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(422);
      expect(response.body.message).toContain('UUID');
    });

    it('should reject invalid date format', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?from=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(422);
      expect(response.body.message).toContain('ISO 8601');
    });
  });

  describe('Response Structure', () => {
    it('should return correct response structure', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should return audit log entries with correct fields', async () => {
      const response = await request(app)
        .get(`/api/admin/audit-logs?client_id=${testClientId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBeGreaterThan(0);
      
      const log = response.body.results[0];
      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('created_at');
      expect(log).toHaveProperty('action');
      expect(log).toHaveProperty('client_id');
      expect(log).toHaveProperty('actor_user_id');
      expect(log).toHaveProperty('actor_role');
      expect(log).toHaveProperty('metadata');
    });
  });
});
