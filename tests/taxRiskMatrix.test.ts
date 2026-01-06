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
const MOCK_TOPIC_ID = '789e4567-e89b-12d3-a456-426614174002';
const MOCK_DIMENSION_ID = '890e4567-e89b-12d3-a456-426614174003';
const MOCK_CELL_ID = '901e4567-e89b-12d3-a456-426614174004';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn } as jwt.SignOptions);
}

function createMockSupabase(overrides: any = {}) {
  const mockBuilder: any = {
    from: vi.fn(() => mockBuilder),
    select: vi.fn(() => mockBuilder),
    insert: vi.fn(() => mockBuilder),
    update: vi.fn(() => mockBuilder),
    eq: vi.fn(() => mockBuilder),
    order: vi.fn(() => mockBuilder),
    single: vi.fn(() => mockBuilder),
    maybeSingle: vi.fn(() => mockBuilder),
    then: vi.fn((resolve) => resolve(overrides.result || { data: [], error: null })),
    ...overrides,
  };
  return mockBuilder;
}

describe('Tax Risk Matrix API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/clients/:clientId/tax/risk-matrix/initialize', () => {
    it('should require API key', async () => {
      const res = await request(app).post(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/initialize`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/initialize`)
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should validate clientId access', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      const res = await request(app)
        .post('/api/clients/invalid-uuid/tax/risk-matrix/initialize')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it.skip('should initialize matrix with default topics and dimensions (requires real DB)', async () => {
      // This test requires a real database connection to properly test the complex
      // initialization logic with multiple sequential inserts and queries.
      // Run integration tests with a test database to verify this functionality.
    });

    it.skip('should be idempotent - calling twice should not create duplicates (requires real DB)', async () => {
      // This test requires a real database connection to properly test idempotency
      // with unique constraints and upsert logic.
      // Run integration tests with a test database to verify this functionality.
    });
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

    it('should return UI-ready grid with topics, dimensions, and cells', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      let callCount = 0;
      const mockSupabase = createMockSupabase();
      mockSupabase.then = vi.fn((resolve) => {
        callCount++;
        if (callCount === 1) {
          return resolve({ 
            data: [
              { id: MOCK_TOPIC_ID, name: 'VAT', sort_order: 0, is_active: true }
            ], 
            error: null 
          });
        } else if (callCount === 2) {
          return resolve({ 
            data: [
              { id: MOCK_DIMENSION_ID, name: 'Compliance', sort_order: 0, is_active: true }
            ], 
            error: null 
          });
        } else {
          return resolve({ 
            data: [
              {
                id: MOCK_CELL_ID,
                topic_id: MOCK_TOPIC_ID,
                dimension_id: MOCK_DIMENSION_ID,
                likelihood: 3,
                impact: 4,
                status: 'open',
                notes: null,
                owner_user_id: null,
                last_reviewed_at: null,
                updated_at: '2026-01-06T00:00:00Z'
              }
            ], 
            error: null 
          });
        }
      });

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('topics');
      expect(res.body.data).toHaveProperty('dimensions');
      expect(res.body.data).toHaveProperty('cells');
      expect(res.body.data.topics).toHaveLength(1);
      expect(res.body.data.dimensions).toHaveLength(1);
      expect(res.body.data.cells).toHaveLength(1);
      
      const cell = res.body.data.cells[0];
      expect(cell).toHaveProperty('id');
      expect(cell).toHaveProperty('topic_id');
      expect(cell).toHaveProperty('dimension_id');
      expect(cell).toHaveProperty('likelihood');
      expect(cell).toHaveProperty('impact');
      expect(cell).toHaveProperty('score');
      expect(cell).toHaveProperty('color');
      expect(cell.score).toBe(12);
      expect(cell.color).toBe('orange');
    });

    it('should ensure no amber in responses - only green/orange/red', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      let callCount = 0;
      const mockSupabase = createMockSupabase();
      mockSupabase.then = vi.fn((resolve) => {
        callCount++;
        if (callCount === 1) {
          return resolve({ data: [], error: null });
        } else if (callCount === 2) {
          return resolve({ data: [], error: null });
        } else {
          return resolve({ 
            data: [
              {
                id: MOCK_CELL_ID,
                topic_id: MOCK_TOPIC_ID,
                dimension_id: MOCK_DIMENSION_ID,
                likelihood: 2,
                impact: 3,
                status: 'open',
                notes: null,
                owner_user_id: null,
                last_reviewed_at: null,
                updated_at: '2026-01-06T00:00:00Z'
              }
            ], 
            error: null 
          });
        }
      });

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      const responseStr = JSON.stringify(res.body);
      expect(responseStr).not.toContain('amber');
      
      if (res.body.data.cells.length > 0) {
        res.body.data.cells.forEach((cell: any) => {
          expect(['green', 'orange', 'red']).toContain(cell.color);
        });
      }
    });

    it('should return stable sorting by sort_order then name', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      let callCount = 0;
      const mockSupabase = createMockSupabase();
      mockSupabase.then = vi.fn((resolve) => {
        callCount++;
        if (callCount === 1) {
          return resolve({ 
            data: [
              { id: '1', name: 'VAT', sort_order: 0, is_active: true },
              { id: '2', name: 'Corporate Income Tax', sort_order: 1, is_active: true }
            ], 
            error: null 
          });
        } else if (callCount === 2) {
          return resolve({ 
            data: [
              { id: '3', name: 'Compliance', sort_order: 0, is_active: true },
              { id: '4', name: 'Reporting', sort_order: 1, is_active: true }
            ], 
            error: null 
          });
        } else {
          return resolve({ data: [], error: null });
        }
      });

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.topics[0].name).toBe('VAT');
      expect(res.body.data.topics[1].name).toBe('Corporate Income Tax');
      expect(res.body.data.dimensions[0].name).toBe('Compliance');
      expect(res.body.data.dimensions[1].name).toBe('Reporting');
    });
  });

  describe('PATCH /api/clients/:clientId/tax/risk-matrix/cells/:cellId', () => {
    it('should require API key', async () => {
      const res = await request(app).patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should validate cellId format', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/invalid-uuid`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ likelihood: 3 });

      expect(res.status).toBe(422);
    });

    it('should update cell and recalculate score/level - green boundary (score 5)', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      let callCount = 0;
      const mockSupabase = createMockSupabase();
      mockSupabase.then = vi.fn((resolve) => {
        callCount++;
        if (callCount === 1) {
          return resolve({ 
            data: {
              id: MOCK_CELL_ID,
              client_id: MOCK_CLIENT_ID,
              topic_id: MOCK_TOPIC_ID,
              dimension_id: MOCK_DIMENSION_ID,
              likelihood: 1,
              impact: 1,
              status: 'open',
              notes: null,
              owner_user_id: null,
              last_reviewed_at: null,
              updated_at: '2026-01-06T00:00:00Z'
            }, 
            error: null 
          });
        } else {
          return resolve({ 
            data: {
              id: MOCK_CELL_ID,
              client_id: MOCK_CLIENT_ID,
              topic_id: MOCK_TOPIC_ID,
              dimension_id: MOCK_DIMENSION_ID,
              likelihood: 1,
              impact: 5,
              status: 'open',
              notes: null,
              owner_user_id: null,
              last_reviewed_at: null,
              updated_at: '2026-01-06T00:00:00Z'
            }, 
            error: null 
          });
        }
      });

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ impact: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(5);
      expect(res.body.data.color).toBe('green');
    });

    it('should update cell and recalculate score/level - orange boundary (score 12)', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      let callCount = 0;
      const mockSupabase = createMockSupabase();
      mockSupabase.then = vi.fn((resolve) => {
        callCount++;
        if (callCount === 1) {
          return resolve({ 
            data: {
              id: MOCK_CELL_ID,
              client_id: MOCK_CLIENT_ID,
              topic_id: MOCK_TOPIC_ID,
              dimension_id: MOCK_DIMENSION_ID,
              likelihood: 3,
              impact: 3,
              status: 'open',
              notes: null,
              owner_user_id: null,
              last_reviewed_at: null,
              updated_at: '2026-01-06T00:00:00Z'
            }, 
            error: null 
          });
        } else {
          return resolve({ 
            data: {
              id: MOCK_CELL_ID,
              client_id: MOCK_CLIENT_ID,
              topic_id: MOCK_TOPIC_ID,
              dimension_id: MOCK_DIMENSION_ID,
              likelihood: 3,
              impact: 4,
              status: 'open',
              notes: null,
              owner_user_id: null,
              last_reviewed_at: null,
              updated_at: '2026-01-06T00:00:00Z'
            }, 
            error: null 
          });
        }
      });

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ impact: 4 });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(12);
      expect(res.body.data.color).toBe('orange');
    });

    it('should update cell and recalculate score/level - red boundary (score 25)', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      let callCount = 0;
      const mockSupabase = createMockSupabase();
      mockSupabase.then = vi.fn((resolve) => {
        callCount++;
        if (callCount === 1) {
          return resolve({ 
            data: {
              id: MOCK_CELL_ID,
              client_id: MOCK_CLIENT_ID,
              topic_id: MOCK_TOPIC_ID,
              dimension_id: MOCK_DIMENSION_ID,
              likelihood: 5,
              impact: 4,
              status: 'open',
              notes: null,
              owner_user_id: null,
              last_reviewed_at: null,
              updated_at: '2026-01-06T00:00:00Z'
            }, 
            error: null 
          });
        } else {
          return resolve({ 
            data: {
              id: MOCK_CELL_ID,
              client_id: MOCK_CLIENT_ID,
              topic_id: MOCK_TOPIC_ID,
              dimension_id: MOCK_DIMENSION_ID,
              likelihood: 5,
              impact: 5,
              status: 'open',
              notes: null,
              owner_user_id: null,
              last_reviewed_at: null,
              updated_at: '2026-01-06T00:00:00Z'
            }, 
            error: null 
          });
        }
      });

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ impact: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(25);
      expect(res.body.data.color).toBe('red');
    });

    it('should validate likelihood range 1-5', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ likelihood: 6 });

      expect(res.status).toBe(422);
    });

    it('should validate impact range 1-5', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ impact: 0 });

      expect(res.status).toBe(422);
    });

    it('should validate status enum', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(422);
    });

    it('should update multiple fields at once', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      let callCount = 0;
      const mockSupabase = createMockSupabase();
      mockSupabase.then = vi.fn((resolve) => {
        callCount++;
        if (callCount === 1) {
          return resolve({ 
            data: {
              id: MOCK_CELL_ID,
              client_id: MOCK_CLIENT_ID,
              topic_id: MOCK_TOPIC_ID,
              dimension_id: MOCK_DIMENSION_ID,
              likelihood: 1,
              impact: 1,
              status: 'open',
              notes: null,
              owner_user_id: null,
              last_reviewed_at: null,
              updated_at: '2026-01-06T00:00:00Z'
            }, 
            error: null 
          });
        } else {
          return resolve({ 
            data: {
              id: MOCK_CELL_ID,
              client_id: MOCK_CLIENT_ID,
              topic_id: MOCK_TOPIC_ID,
              dimension_id: MOCK_DIMENSION_ID,
              likelihood: 4,
              impact: 3,
              status: 'in_progress',
              notes: 'Test notes',
              owner_user_id: MOCK_USER_ID,
              last_reviewed_at: '2026-01-06T12:00:00Z',
              updated_at: '2026-01-06T12:00:00Z'
            }, 
            error: null 
          });
        }
      });

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          likelihood: 4,
          impact: 3,
          status: 'in_progress',
          notes: 'Test notes',
          owner_user_id: MOCK_USER_ID,
          last_reviewed_at: '2026-01-06T12:00:00Z'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.likelihood).toBe(4);
      expect(res.body.data.impact).toBe(3);
      expect(res.body.data.score).toBe(12);
      expect(res.body.data.color).toBe('orange');
      expect(res.body.data.status).toBe('in_progress');
      expect(res.body.data.notes).toBe('Test notes');
    });
  });

  describe('Client Isolation', () => {
    it('should not allow access to another client\'s cell', async () => {
      const clientToken = generateToken({ 
        sub: MOCK_USER_ID, 
        role: 'client',
        client_id: MOCK_CLIENT_ID 
      });

      const mockSupabase = createMockSupabase();
      mockSupabase.then = vi.fn((resolve) => {
        return resolve({ data: null, error: { message: 'Not found' } });
      });

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabase as any);

      const res = await request(app)
        .patch(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-matrix/cells/${MOCK_CELL_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ likelihood: 3 });

      expect(res.status).toBe(404);
    });
  });
});

