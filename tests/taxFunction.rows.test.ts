import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const MOCK_ROW_ID = '987fcdeb-51a9-43d2-b654-123456789abc';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

function createMockQueryBuilder(selectResult: { data: any; error: any }) {
  let insertedData: any[] = [];
  let updatedData: any = null;
  let isAfterInsert = false;
  let isAfterUpdate = false;
  let isAfterDelete = false;

  const mockBuilder = {
    from: vi.fn(() => mockBuilder),
    select: vi.fn((columns = '*') => {
      if (isAfterInsert) {
        if (columns === '*') {
          return {
            ...mockBuilder,
            single: vi.fn(() => ({
              then: vi.fn((resolve) => resolve({ data: insertedData[0] || null, error: null })),
            })),
            then: vi.fn((resolve) => resolve({ data: insertedData, error: null })),
          };
        }
      }
      if (isAfterUpdate) {
        return {
          ...mockBuilder,
          single: vi.fn(() => ({
            then: vi.fn((resolve) => resolve({ data: updatedData, error: null })),
          })),
        };
      }
      if (isAfterDelete) {
        return {
          ...mockBuilder,
          single: vi.fn(() => ({
            then: vi.fn((resolve) => resolve({ data: { id: MOCK_ROW_ID }, error: null })),
          })),
        };
      }
      return mockBuilder;
    }),
    insert: vi.fn((data) => {
      isAfterInsert = true;
      insertedData = Array.isArray(data)
        ? data.map((item, idx) => ({
            id: `mock-id-${idx}`,
            ...item,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }))
        : [
            {
              id: MOCK_ROW_ID,
              ...data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
      return mockBuilder;
    }),
    update: vi.fn((data) => {
      isAfterUpdate = true;
      updatedData = {
        id: MOCK_ROW_ID,
        ...data,
        updated_at: new Date().toISOString(),
      };
      return mockBuilder;
    }),
    delete: vi.fn(() => {
      isAfterDelete = true;
      return mockBuilder;
    }),
    eq: vi.fn(() => mockBuilder),
    order: vi.fn(() => mockBuilder),
    single: vi.fn(() => ({
      then: vi.fn((resolve) => {
        if (isAfterInsert) {
          return resolve({ data: insertedData[0] || null, error: null });
        }
        if (isAfterUpdate) {
          return resolve({ data: updatedData, error: null });
        }
        if (isAfterDelete) {
          return resolve({ data: { id: MOCK_ROW_ID }, error: null });
        }
        return resolve(selectResult);
      }),
    })),
    then: vi.fn((resolve) => resolve(selectResult)),
  };
  return mockBuilder;
}

describe('Tax Function Rows CRUD API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/clients/:clientId/tax/function/rows', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .send({ order_index: 0, process_name: 'Test Process' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_MISSING_HEADER');
    });

    it('should return 422 when process_name is missing', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ order_index: 0 });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return 422 when order_index is missing', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ process_name: 'Test Process' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return 422 when order_index is negative', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ order_index: -1, process_name: 'Test Process' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return 422 when process_name is empty string', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ order_index: 0, process_name: '' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should create a row with valid required fields', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          order_index: 0,
          process_name: 'Test Process',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.order_index).toBe(0);
      expect(res.body.data.process_name).toBe('Test Process');
    });

    it('should create a row with all optional fields', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          order_index: 1,
          process_name: 'Test Process',
          process_description: 'Description',
          stakeholders: ['John Doe', 'Jane Smith'],
          frequency: 'Monthly',
          notes: 'Some notes',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.process_description).toBe('Description');
      expect(res.body.data.frequency).toBe('Monthly');
      expect(res.body.data.notes).toBe('Some notes');
    });

    it('should normalize stakeholders from comma-separated string', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          order_index: 0,
          process_name: 'Test Process',
          stakeholders: 'John Doe, Jane Smith, Bob',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.stakeholders).toEqual(['John Doe', 'Jane Smith', 'Bob']);
    });

    it('should return 403 when client accesses another client_id', async () => {
      const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
      const validToken = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const res = await request(app)
        .post(`/api/clients/${otherClientId}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ order_index: 0, process_name: 'Test' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });
  });

  describe('PATCH /api/clients/:clientId/tax/function/rows/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .send({ process_name: 'Updated' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_MISSING_HEADER');
    });

    it('should return 422 when id is not a valid UUID', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/invalid-uuid`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ process_name: 'Updated' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return 422 when order_index is negative', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ order_index: -5 });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should update a row with valid patch data', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          process_name: 'Updated Process',
          frequency: 'Quarterly',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(MOCK_ROW_ID);
    });

    it('should normalize stakeholders from comma-separated string on update', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          stakeholders: 'Alice, Bob',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should return 403 when client accesses another client_id', async () => {
      const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
      const validToken = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const res = await request(app)
        .patch(`/api/clients/${otherClientId}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ process_name: 'Updated' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });
  });

  describe('DELETE /api/clients/:clientId/tax/function/rows/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const res = await request(app)
        .delete(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_MISSING_HEADER');
    });

    it('should return 422 when id is not a valid UUID', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .delete(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/invalid-uuid`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should delete a row successfully', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .delete(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });

    it('should return 403 when client accesses another client_id', async () => {
      const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
      const validToken = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const res = await request(app)
        .delete(`/api/clients/${otherClientId}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });
  });

  describe('PATCH /api/clients/:clientId/tax/function/rows/reorder', () => {
    it('should return 401 without Authorization header', async () => {
      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/reorder`)
        .set('x-api-key', MOCK_API_KEY)
        .send({ updates: [{ id: MOCK_ROW_ID, order_index: 0 }] });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_MISSING_HEADER');
    });

    it('should return 422 when updates is missing', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/reorder`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return 422 when updates is empty array', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/reorder`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ updates: [] });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return 422 when update has invalid UUID', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/reorder`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          updates: [{ id: 'invalid-uuid', order_index: 0 }],
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return 422 when order_index is negative', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/reorder`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          updates: [{ id: MOCK_ROW_ID, order_index: -1 }],
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should reorder rows successfully', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/reorder`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          updates: [
            { id: MOCK_ROW_ID, order_index: 0 },
            { id: '123e4567-e89b-12d3-a456-426614174001', order_index: 1 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.updated).toBe(2);
    });

    it('should return 403 when client accesses another client_id', async () => {
      const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
      const validToken = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const res = await request(app)
        .patch(`/api/clients/${otherClientId}/tax/function/rows/reorder`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          updates: [{ id: MOCK_ROW_ID, order_index: 0 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });
  });

  describe('Tenant Isolation', () => {
    it('POST - Client can create row in own client_id', async () => {
      const validToken = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ order_index: 0, process_name: 'Test' });

      expect(res.status).toBe(201);
    });

    it('PATCH - Client can update row in own client_id', async () => {
      const validToken = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ process_name: 'Updated' });

      expect(res.status).toBe(200);
    });

    it('DELETE - Client can delete row in own client_id', async () => {
      const validToken = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .delete(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/${MOCK_ROW_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(204);
    });

    it('REORDER - Client can reorder rows in own client_id', async () => {
      const validToken = generateToken({
        sub: 'user123',
        role: 'client',
        client_id: MOCK_CLIENT_ID,
      });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/function/rows/reorder`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          updates: [{ id: MOCK_ROW_ID, order_index: 0 }],
        });

      expect(res.status).toBe(200);
    });

    it('Admin can access any client_id', async () => {
      const anyClientId = '987e6543-e21b-12d3-a456-426614174999';
      const adminToken = generateToken({
        sub: 'admin123',
        role: 'admin',
      });

      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .post(`/api/clients/${anyClientId}/tax/function/rows`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ order_index: 0, process_name: 'Admin Test' });

      expect(res.status).toBe(201);
    });
  });
});
