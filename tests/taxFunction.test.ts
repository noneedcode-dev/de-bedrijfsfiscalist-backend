import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

function createMockQueryBuilder(selectResult: { data: any; error: any }) {
  let insertedData: any[] = [];
  let isAfterInsert = false;
  
  const mockBuilder = {
    from: vi.fn(() => mockBuilder),
    select: vi.fn(() => {
      if (isAfterInsert) {
        return {
          ...mockBuilder,
          then: vi.fn((resolve) => resolve({ data: insertedData, error: null })),
        };
      }
      return mockBuilder;
    }),
    insert: vi.fn((data) => {
      isAfterInsert = true;
      insertedData = Array.isArray(data) ? data.map((item, idx) => ({
        id: `mock-id-${idx}`,
        ...item,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })) : [];
      return mockBuilder;
    }),
    update: vi.fn(() => mockBuilder),
    delete: vi.fn(() => mockBuilder),
    eq: vi.fn(() => mockBuilder),
    order: vi.fn(() => mockBuilder),
    then: vi.fn((resolve) => resolve(selectResult)),
  };
  return mockBuilder;
}

describe('Tax Function API', () => {
  it('GET /api/clients/:clientId/tax/function should require API key', async () => {
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`);
    
    expect(res.status).toBe(401);
    expect(res.body.code).toBeTruthy();
  });

  it('GET /api/clients/:clientId/tax/function should require JWT', async () => {
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
      .set('x-api-key', MOCK_API_KEY);
    
    expect(res.status).toBe(401);
    expect(res.body.code).toBeTruthy();
  });

  it('GET /api/clients/:clientId/tax/function should validate clientId format', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .get('/api/clients/invalid-uuid/tax/function')
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(422);
    expect(res.body.code).toBeTruthy();
  });

  it('GET /api/clients/:clientId/tax/function should return correct response structure', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('columns');
    expect(res.body.data).toHaveProperty('rows');
    expect(res.body).toHaveProperty('meta');
    expect(res.body.meta).toHaveProperty('updated_at');
    
    expect(Array.isArray(res.body.data.columns)).toBe(true);
    expect(Array.isArray(res.body.data.rows)).toBe(true);
    
    if (res.body.data.columns.length > 0) {
      expect(res.body.data.columns[0]).toHaveProperty('key');
      expect(res.body.data.columns[0]).toHaveProperty('label');
    }
    
    if (res.body.data.rows.length > 0) {
      expect(res.body.data.rows[0]).toHaveProperty('row_index');
      expect(res.body.data.rows[0]).toHaveProperty('cells');
      expect(typeof res.body.data.rows[0].row_index).toBe('number');
    }
  });

  it('GET /api/clients/:clientId/tax/function should return columns from config', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data.columns).toEqual([
      { key: 'process', label: 'Process' },
      { key: 'description', label: 'Description' },
      { key: 'responsible_party', label: 'Responsible Party' },
      { key: 'frequency', label: 'Frequency' },
      { key: 'deadline', label: 'Deadline' },
      { key: 'status', label: 'Status' },
      { key: 'notes', label: 'Notes' },
    ]);
  });

  it('GET /api/clients/:clientId/tax/function should return rows sorted by row_index', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(200);
    
    const rows = res.body.data.rows;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].row_index).toBeGreaterThanOrEqual(rows[i - 1].row_index);
    }
  });

  it('POST /api/clients/:clientId/tax/function/import should require API key', async () => {
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .send({ rows: [], mode: 'replace' });
    
    expect(res.status).toBe(401);
    expect(res.body.code).toBeTruthy();
  });

  it('POST /api/clients/:clientId/tax/function/import should require JWT', async () => {
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .send({ rows: [], mode: 'replace' });
    
    expect(res.status).toBe(401);
    expect(res.body.code).toBeTruthy();
  });

  it('POST /api/clients/:clientId/tax/function/import should validate clientId format', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .post('/api/clients/invalid-uuid/tax/function/import')
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ rows: [], mode: 'replace' });
    
    expect(res.status).toBe(422);
    expect(res.body.code).toBeTruthy();
  });

  it('POST /api/clients/:clientId/tax/function/import should require rows to be an array', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ rows: 'not-an-array', mode: 'replace' });
    
    expect(res.status).toBe(422);
    expect(res.body.code).toBeTruthy();
  });

  it('POST /api/clients/:clientId/tax/function/import should only accept "replace" mode', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ rows: [], mode: 'append' });
    
    expect(res.status).toBe(422);
    expect(res.body.code).toBeTruthy();
  });

  it('POST /api/clients/:clientId/tax/function/import should ignore columns field', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        columns: [{ key: 'fake', label: 'Fake Column' }],
        rows: [],
        mode: 'replace'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('inserted');
    expect(res.body.data).toHaveProperty('updated');
    expect(res.body.data).toHaveProperty('deleted');
    expect(res.body.data).toHaveProperty('errors');
  });

  it('POST /api/clients/:clientId/tax/function/import should return correct response structure', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const mockSupabase = createMockQueryBuilder({ data: [], error: null });
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
    
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        rows: [
          {
            row_index: 0,
            cells: {
              process: 'Test Process',
              description: 'Test Description',
              responsible_party: 'John Doe',
              frequency: 'Monthly',
              notes: 'Test notes'
            }
          }
        ],
        mode: 'replace'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('inserted');
    expect(res.body.data).toHaveProperty('updated');
    expect(res.body.data).toHaveProperty('deleted');
    expect(res.body.data).toHaveProperty('errors');
    expect(res.body.data.updated).toBe(0);
    expect(Array.isArray(res.body.data.errors)).toBe(true);
  });

  it('POST /api/clients/:clientId/tax/function/import should validate row_index is a number', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        rows: [
          {
            row_index: 'not-a-number',
            cells: { process: 'Test' }
          }
        ],
        mode: 'replace'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.data.errors.length).toBe(1);
    expect(res.body.data.errors[0].reason).toContain('row_index must be a number');
    expect(res.body.data.inserted).toBe(0);
  });

  it('POST /api/clients/:clientId/tax/function/import should validate cells is an object', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        rows: [
          {
            row_index: 0,
            cells: 'not-an-object'
          }
        ],
        mode: 'replace'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.data.errors.length).toBe(1);
    expect(res.body.data.errors[0].reason).toContain('cells must be an object');
    expect(res.body.data.inserted).toBe(0);
  });

  it('POST /api/clients/:clientId/tax/function/import should allow partial success', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const mockSupabase = createMockQueryBuilder({ data: [], error: null });
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
    
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        rows: [
          {
            row_index: 0,
            cells: { process: 'Valid Row' }
          },
          {
            row_index: 'invalid',
            cells: { process: 'Invalid Row' }
          },
          {
            row_index: 1,
            cells: { process: 'Another Valid Row' }
          }
        ],
        mode: 'replace'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.data.inserted).toBe(2);
    expect(res.body.data.errors.length).toBe(1);
    expect(res.body.data.errors[0].row_index).toBe(-1);
  });

  it('POST /api/clients/:clientId/tax/function/import should not validate cell keys or values', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    const mockSupabase = createMockQueryBuilder({ data: [], error: null });
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
    
    const res = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        rows: [
          {
            row_index: 0,
            cells: {
              random_key: 'random value',
              another_key: 123,
              nested: { object: 'allowed' }
            }
          }
        ],
        mode: 'replace'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.data.inserted).toBe(1);
    expect(res.body.data.errors.length).toBe(0);
  });

  it('POST /api/clients/:clientId/tax/function/import should replace all existing rows', async () => {
    const validToken = generateToken({ sub: 'user123', role: 'admin' });
    
    let mockSupabase = createMockQueryBuilder({ data: [], error: null });
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
    
    const importRes1 = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        rows: [
          { row_index: 0, cells: { process: 'Row 1' } },
          { row_index: 1, cells: { process: 'Row 2' } }
        ],
        mode: 'replace'
      });
    
    expect(importRes1.status).toBe(200);
    expect(importRes1.body.data.inserted).toBe(2);
    
    mockSupabase = createMockQueryBuilder({ 
      data: [
        { id: '1', order_index: 0, process_name: 'Row 1', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: '2', order_index: 1, process_name: 'Row 2', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      ], 
      error: null 
    });
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
    
    const importRes2 = await request(app)
      .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        rows: [
          { row_index: 0, cells: { process: 'New Row 1' } }
        ],
        mode: 'replace'
      });
    
    expect(importRes2.status).toBe(200);
    expect(importRes2.body.data.deleted).toBe(2);
    expect(importRes2.body.data.inserted).toBe(1);
    
    mockSupabase = createMockQueryBuilder({ 
      data: [
        { id: '3', order_index: 0, process_name: 'New Row 1', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      ], 
      error: null 
    });
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
    
    const getRes = await request(app)
      .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.rows.length).toBe(1);
    expect(getRes.body.data.rows[0].cells.process).toBe('New Row 1');
  });

  it('GET /api/clients/:clientId/tax/function should return 403 when client accesses another client_id', async () => {
    const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
    const validToken = generateToken({ 
      sub: 'user123', 
      role: 'client',
      client_id: MOCK_CLIENT_ID
    });
    
    const res = await request(app)
      .get(`/api/clients/${otherClientId}/tax/function`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    expect(res.body.message).toBeTruthy();
    expect(res.body.request_id).toBeTruthy();
    expect(res.body.timestamp).toBeTruthy();
  });

  it('POST /api/clients/:clientId/tax/function/import should return 403 when client accesses another client_id', async () => {
    const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
    const validToken = generateToken({ 
      sub: 'user123', 
      role: 'client',
      client_id: MOCK_CLIENT_ID
    });
    
    const res = await request(app)
      .post(`/api/clients/${otherClientId}/tax/function/import`)
      .set('x-api-key', MOCK_API_KEY)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ rows: [], mode: 'replace' });
    
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    expect(res.body.message).toBeTruthy();
    expect(res.body.request_id).toBeTruthy();
    expect(res.body.timestamp).toBeTruthy();
  });

  describe('Tenant Isolation', () => {
    it('GET - Client can access own tax function data', async () => {
      const validToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID
      });
      
      const mockSupabase = createMockQueryBuilder({ 
        data: [
          { 
            id: '1', 
            order_index: 0, 
            process_name: 'Client Process', 
            client_id: MOCK_CLIENT_ID, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString() 
          }
        ], 
        error: null 
      });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toHaveLength(1);
      expect(res.body.data.rows[0].cells.process).toBe('Client Process');
    });

    it('GET - Client cannot access another client_id (403)', async () => {
      const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
      const validToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID
      });
      
      const res = await request(app)
        .get(`/api/clients/${otherClientId}/tax/function`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('GET - Admin can access any client_id', async () => {
      const anyClientId = '987e6543-e21b-12d3-a456-426614174999';
      const adminToken = generateToken({ 
        sub: 'admin123', 
        role: 'admin'
      });
      
      const mockSupabase = createMockQueryBuilder({ 
        data: [
          { 
            id: '1', 
            order_index: 0, 
            process_name: 'Other Client Process', 
            client_id: anyClientId, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString() 
          }
        ], 
        error: null 
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${anyClientId}/tax/function`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toHaveLength(1);
    });

    it('POST - Client can import to own client_id', async () => {
      const validToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID
      });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ 
          rows: [{ row_index: 0, cells: { process: 'Test' } }], 
          mode: 'replace' 
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.inserted).toBe(1);
    });

    it('POST - Client cannot import to another client_id (403)', async () => {
      const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
      const validToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID
      });
      
      const res = await request(app)
        .post(`/api/clients/${otherClientId}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ rows: [], mode: 'replace' });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('POST - Admin can import to any client_id', async () => {
      const anyClientId = '987e6543-e21b-12d3-a456-426614174999';
      const adminToken = generateToken({ 
        sub: 'admin123', 
        role: 'admin'
      });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .post(`/api/clients/${anyClientId}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ 
          rows: [{ row_index: 0, cells: { process: 'Admin Import' } }], 
          mode: 'replace' 
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.inserted).toBe(1);
    });
  });

  describe('GET Endpoint Behavior', () => {
    it('Returns columns from config', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.columns).toEqual([
        { key: 'process', label: 'Process' },
        { key: 'description', label: 'Description' },
        { key: 'responsible_party', label: 'Responsible Party' },
        { key: 'frequency', label: 'Frequency' },
        { key: 'deadline', label: 'Deadline' },
        { key: 'status', label: 'Status' },
        { key: 'notes', label: 'Notes' },
      ]);
    });

    it('Returns rows ordered by row_index (order_index)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ 
        data: [
          { id: '3', order_index: 2, process_name: 'Third', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { id: '1', order_index: 0, process_name: 'First', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { id: '2', order_index: 1, process_name: 'Second', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ], 
        error: null 
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toHaveLength(3);
      expect(res.body.data.rows[0].row_index).toBe(0);
      expect(res.body.data.rows[0].cells.process).toBe('First');
      expect(res.body.data.rows[1].row_index).toBe(1);
      expect(res.body.data.rows[1].cells.process).toBe('Second');
      expect(res.body.data.rows[2].row_index).toBe(2);
      expect(res.body.data.rows[2].cells.process).toBe('Third');
    });

    it('Returns empty rows when no data exists', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toEqual([]);
      expect(res.body.data.columns).toHaveLength(7);
      expect(res.body.meta.updated_at).toBeNull();
    });
  });

  describe('Import Replace Behavior', () => {
    it('Existing rows are fully replaced', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      let mockSupabase = createMockQueryBuilder({ 
        data: [
          { id: '1', order_index: 0, process_name: 'Old Row 1', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { id: '2', order_index: 1, process_name: 'Old Row 2', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { id: '3', order_index: 2, process_name: 'Old Row 3', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ], 
        error: null 
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          rows: [
            { row_index: 0, cells: { process: 'New Row 1' } },
            { row_index: 1, cells: { process: 'New Row 2' } },
          ],
          mode: 'replace'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(3);
      expect(res.body.data.inserted).toBe(2);
      expect(res.body.data.updated).toBe(0);
    });

    it('Inserted count matches input (valid rows only)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          rows: [
            { row_index: 0, cells: { process: 'Row 1' } },
            { row_index: 1, cells: { process: 'Row 2' } },
            { row_index: 2, cells: { process: 'Row 3' } },
            { row_index: 3, cells: { process: 'Row 4' } },
            { row_index: 4, cells: { process: 'Row 5' } },
          ],
          mode: 'replace'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.inserted).toBe(5);
      expect(res.body.data.errors).toHaveLength(0);
    });

    it('Invalid rows are skipped and reported in errors[]', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          rows: [
            { row_index: 0, cells: { process: 'Valid Row 1' } },
            { row_index: 'invalid', cells: { process: 'Invalid Row' } },
            { row_index: 1, cells: 'not-an-object' },
            { row_index: 2, cells: { process: 'Valid Row 2' } },
            { row_index: 3, cells: null },
          ],
          mode: 'replace'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.inserted).toBe(2);
      expect(res.body.data.errors).toHaveLength(3);
      expect(res.body.data.errors[0].reason).toContain('row_index must be a number');
      expect(res.body.data.errors[1].reason).toContain('cells must be an object');
      expect(res.body.data.errors[2].reason).toContain('cells must be an object');
    });

    it('No partial delete occurs on failure (transaction works)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ 
        data: [
          { id: '1', order_index: 0, process_name: 'Existing Row', client_id: MOCK_CLIENT_ID, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ], 
        error: null 
      });
      
      const deleteCallCount = { count: 0 };
      const insertCallCount = { count: 0 };
      
      const originalDelete = mockSupabase.delete;
      mockSupabase.delete = vi.fn(() => {
        deleteCallCount.count++;
        return originalDelete();
      });
      
      const originalInsert = mockSupabase.insert;
      mockSupabase.insert = vi.fn((data) => {
        insertCallCount.count++;
        return originalInsert(data);
      });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          rows: [
            { row_index: 0, cells: { process: 'New Row' } },
          ],
          mode: 'replace'
        });
      
      expect(res.status).toBe(200);
      expect(deleteCallCount.count).toBe(1);
      expect(insertCallCount.count).toBe(1);
      expect(res.body.data.deleted).toBe(1);
      expect(res.body.data.inserted).toBe(1);
    });
  });

  describe('Contract Tests', () => {
    it('GET - Success response matches schema', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ 
        data: [
          { 
            id: '1', 
            order_index: 0, 
            process_name: 'Test Process',
            process_description: 'Test Description',
            stakeholders: ['John Doe', 'Jane Smith'],
            frequency: 'Monthly',
            notes: 'Test notes',
            client_id: MOCK_CLIENT_ID, 
            created_at: new Date().toISOString(), 
            updated_at: new Date().toISOString() 
          }
        ], 
        error: null 
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/function`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        data: {
          columns: expect.arrayContaining([
            expect.objectContaining({ key: expect.any(String), label: expect.any(String) })
          ]),
          rows: expect.arrayContaining([
            expect.objectContaining({
              row_index: expect.any(Number),
              cells: expect.any(Object)
            })
          ])
        },
        meta: {
          updated_at: expect.any(String)
        }
      });
      
      expect(res.body.data.columns).toHaveLength(7);
      res.body.data.columns.forEach((col: any) => {
        expect(col).toHaveProperty('key');
        expect(col).toHaveProperty('label');
        expect(typeof col.key).toBe('string');
        expect(typeof col.label).toBe('string');
      });
      
      res.body.data.rows.forEach((row: any) => {
        expect(row).toHaveProperty('row_index');
        expect(row).toHaveProperty('cells');
        expect(typeof row.row_index).toBe('number');
        expect(typeof row.cells).toBe('object');
      });
    });

    it('POST - Success response matches schema', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          rows: [
            { row_index: 0, cells: { process: 'Test' } },
          ],
          mode: 'replace'
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        data: {
          inserted: expect.any(Number),
          updated: expect.any(Number),
          deleted: expect.any(Number),
          errors: expect.any(Array)
        }
      });
      
      expect(res.body.data.updated).toBe(0);
      res.body.data.errors.forEach((error: any) => {
        expect(error).toHaveProperty('row_index');
        expect(error).toHaveProperty('reason');
        expect(typeof error.row_index).toBe('number');
        expect(typeof error.reason).toBe('string');
      });
    });

    it('GET - Error response matches schema (403)', async () => {
      const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
      const validToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID
      });
      
      const res = await request(app)
        .get(`/api/clients/${otherClientId}/tax/function`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        request_id: expect.any(String),
        timestamp: expect.any(String)
      });
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('GET - Error response matches schema (422)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/clients/invalid-uuid/tax/function')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        request_id: expect.any(String),
        timestamp: expect.any(String)
      });
      expect(res.body).toHaveProperty('details');
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    it('POST - Error response matches schema (403)', async () => {
      const otherClientId = '987e6543-e21b-12d3-a456-426614174999';
      const validToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID
      });
      
      const res = await request(app)
        .post(`/api/clients/${otherClientId}/tax/function/import`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ rows: [], mode: 'replace' });
      
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        request_id: expect.any(String),
        timestamp: expect.any(String)
      });
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('POST - Error response matches schema (422)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const res = await request(app)
        .post('/api/clients/invalid-uuid/tax/function/import')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ rows: [], mode: 'replace' });
      
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        request_id: expect.any(String),
        timestamp: expect.any(String)
      });
      expect(res.body).toHaveProperty('details');
      expect(Array.isArray(res.body.details)).toBe(true);
    });
  });
});
