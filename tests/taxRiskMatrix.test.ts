import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const MOCK_CLIENT_ID_2 = '223e4567-e89b-12d3-a456-426614174001';
const MOCK_USER_ID = '456e4567-e89b-12d3-a456-426614174001';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn } as jwt.SignOptions);
}

function createMockSupabase(selectResult: { data: any; error: any } = { data: [], error: null }) {
  const mockBuilder: any = {
    from: vi.fn(() => mockBuilder),
    select: vi.fn(() => mockBuilder),
    eq: vi.fn(() => mockBuilder),
    upsert: vi.fn(() => mockBuilder),
    then: vi.fn((resolve) => resolve(selectResult)),
  };
  return mockBuilder;
}

describe('Tax Risk Matrix API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/clients/:clientId/tax/risk-matrix', () => {
    it('should require API key', async () => {
      const res = await request(app).get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should validate clientId format', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .get('/api/clients/invalid-uuid/tax/risk-matrix')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return default shaped payload when no rows exist', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockSupabase({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('client_id');
      expect(res.body.data).toHaveProperty('sections');
      expect(res.body.data.sections).toHaveProperty('B3:E8');
      expect(res.body.data.sections).toHaveProperty('J14:N14');
      
      expect(res.body.data.sections['B3:E8'].rows).toBe(6);
      expect(res.body.data.sections['B3:E8'].cols).toBe(4);
      expect(res.body.data.sections['B3:E8'].cells.length).toBe(24);
      
      expect(res.body.data.sections['J14:N14'].rows).toBe(1);
      expect(res.body.data.sections['J14:N14'].cols).toBe(5);
      expect(res.body.data.sections['J14:N14'].cells.length).toBe(5);
      
      const firstCell = res.body.data.sections['B3:E8'].cells[0];
      expect(firstCell).toHaveProperty('row');
      expect(firstCell).toHaveProperty('col');
      expect(firstCell).toHaveProperty('color');
      expect(firstCell.color).toBe('none');
    });
  });

  describe('PUT /api/clients/:clientId/tax/risk-matrix', () => {
    it('should require API key', async () => {
      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .send({
          sections: {
            'B3:E8': { rows: 6, cols: 4, cells: [] },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .send({
          sections: {
            'B3:E8': { rows: 6, cols: 4, cells: [] },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require admin role', async () => {
      const clientToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          sections: {
            'B3:E8': { rows: 6, cols: 4, cells: [] },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(403);
    });

    it('should validate clientId format', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });

      const res = await request(app)
        .put('/api/clients/invalid-uuid/tax/risk-matrix')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          sections: {
            'B3:E8': { rows: 6, cols: 4, cells: [] },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should upsert cells and return them in GET', async () => {
      const adminToken = generateToken({ sub: MOCK_USER_ID, role: 'admin' });
      
      const mockSupabase = createMockSupabase({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const putRes = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sections: {
            'B3:E8': {
              rows: 6,
              cols: 4,
              cells: [
                { row: 0, col: 0, value_text: 'Test', color: 'green' },
                { row: 0, col: 1, value_number: 5, color: 'green' },
              ],
            },
            'J14:N14': {
              rows: 1,
              cols: 5,
              cells: [{ row: 0, col: 0, value_number: 15, color: 'red' }],
            },
          },
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body).toHaveProperty('data');
    });

    it('should validate section bounds for B3:E8', async () => {
      const adminToken = generateToken({ sub: MOCK_USER_ID, role: 'admin' });
      
      const mockSupabase = createMockSupabase({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sections: {
            'B3:E8': {
              rows: 6,
              cols: 4,
              cells: [{ row: 6, col: 0, value_text: 'Out of bounds', color: 'green' }],
            },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(400);
    });

    it('should validate section bounds for J14:N14', async () => {
      const adminToken = generateToken({ sub: MOCK_USER_ID, role: 'admin' });
      
      const mockSupabase = createMockSupabase({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sections: {
            'B3:E8': { rows: 6, cols: 4, cells: [] },
            'J14:N14': {
              rows: 1,
              cols: 5,
              cells: [{ row: 0, col: 5, value_text: 'Out of bounds', color: 'green' }],
            },
          },
        });

      expect(res.status).toBe(400);
    });

    it('should validate color enum', async () => {
      const adminToken = generateToken({ sub: MOCK_USER_ID, role: 'admin' });

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sections: {
            'B3:E8': {
              rows: 6,
              cols: 4,
              cells: [{ row: 0, col: 0, value_text: 'Test', color: 'invalid_color' }],
            },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Color Logic', () => {
    it('should derive green color from value_number 1-5', async () => {
      const adminToken = generateToken({ sub: MOCK_USER_ID, role: 'admin' });
      
      const mockSupabase = createMockSupabase({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sections: {
            'B3:E8': {
              rows: 6,
              cols: 4,
              cells: [{ row: 0, col: 0, value_number: 3, color: 'none' }],
            },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(200);
    });

    it('should derive orange color from value_number 6-12', async () => {
      const adminToken = generateToken({ sub: MOCK_USER_ID, role: 'admin' });
      
      const mockSupabase = createMockSupabase({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sections: {
            'B3:E8': {
              rows: 6,
              cols: 4,
              cells: [{ row: 0, col: 0, value_number: 10, color: 'none' }],
            },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(200);
    });

    it('should derive red color from value_number 13-25', async () => {
      const adminToken = generateToken({ sub: MOCK_USER_ID, role: 'admin' });
      
      const mockSupabase = createMockSupabase({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sections: {
            'B3:E8': {
              rows: 6,
              cols: 4,
              cells: [{ row: 0, col: 0, value_number: 20, color: 'none' }],
            },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(200);
    });

    it('should use explicit color when provided', async () => {
      const adminToken = generateToken({ sub: MOCK_USER_ID, role: 'admin' });
      
      const mockSupabase = createMockSupabase({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sections: {
            'B3:E8': {
              rows: 6,
              cols: 4,
              cells: [{ row: 0, col: 0, value_number: 20, color: 'green' }],
            },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(200);
    });
  });

  describe('Client Isolation', () => {
    it('should not allow client user to write matrix data', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      const res = await request(app)
        .put(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          sections: {
            'B3:E8': { rows: 6, cols: 4, cells: [] },
            'J14:N14': { rows: 1, cols: 5, cells: [] },
          },
        });

      expect(res.status).toBe(403);
    });

    it('should allow client user to read their own matrix data', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });
      
      const mockSupabase = createMockSupabase({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
    });

    it('should not allow access to another client\'s matrix data', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID_2}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect([403, 404]).toContain(res.status);
    });
  });
});

