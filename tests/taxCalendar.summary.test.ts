import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

const createMockQueryBuilder = (mockData: any = { data: [], error: null }) => ({
  from: vi.fn(function(this: any) { return this; }),
  select: vi.fn(function(this: any) { return this; }),
  eq: vi.fn(function(this: any) { return this; }),
  gte: vi.fn(function(this: any) { return this; }),
  lte: vi.fn(function(this: any) { return this; }),
  neq: vi.fn(function(this: any) { return this; }),
  order: vi.fn(function(this: any) { return this; }),
  limit: vi.fn(function(this: any) { return this; }),
  then: vi.fn((resolve: any) => resolve(mockData)),
});

let mockSupabaseClient: any;

describe('Tax Calendar Summary Endpoint Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient = createMockQueryBuilder();
    vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
  });

  describe('GET /api/clients/:clientId/tax/calendar/summary - Authentication', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
    });

    it('should return 401 when Bearer token is invalid', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/clients/:clientId/tax/calendar/summary - Validation', () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    it('should return 400 when clientId is not a valid UUID', async () => {
      const invalidToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/clients/invalid-uuid/tax/calendar/summary')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Validation failed');
    });

    it('should return 400 when dueSoonDays is out of range (too low)', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .query({ dueSoonDays: 0 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('dueSoonDays must be between 1 and 365');
    });

    it('should return 400 when dueSoonDays is out of range (too high)', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .query({ dueSoonDays: 366 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('dueSoonDays must be between 1 and 365');
    });
  });

  describe('GET /api/clients/:clientId/tax/calendar/summary - Happy Path', () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    it('should return 200 with empty summary when no data', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('total', 0);
      expect(res.body.data).toHaveProperty('by_status');
      expect(res.body.data).toHaveProperty('overdue', 0);
      expect(res.body.data).toHaveProperty('due_soon', 0);
      expect(res.body.data).toHaveProperty('by_tax_type');
      expect(res.body.meta).toHaveProperty('today');
      expect(res.body.meta).toHaveProperty('due_soon_to');
      expect(res.body.meta).toHaveProperty('timestamp');
    });

    it('should return 200 with correct aggregation for single entry', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockData = [
        {
          status: 'pending',
          deadline: today,
          tax_type: 'Dutch VAT',
        },
      ];

      mockSupabaseClient = createMockQueryBuilder({ data: mockData, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.by_status.pending).toBe(1);
    });

    it('should calculate overdue entries correctly', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const mockData = [
        {
          status: 'pending',
          deadline: yesterdayStr,
          tax_type: 'Dutch VAT',
        },
      ];

      mockSupabaseClient = createMockQueryBuilder({ data: mockData, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.overdue).toBeGreaterThan(0);
    });

    it('should calculate due_soon entries correctly', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const mockData = [
        {
          status: 'pending',
          deadline: tomorrowStr,
          tax_type: 'Dutch VAT',
        },
      ];

      mockSupabaseClient = createMockQueryBuilder({ data: mockData, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.due_soon).toBeGreaterThan(0);
    });

    it('should exclude done entries from overdue and due_soon', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const mockData = [
        {
          status: 'done',
          deadline: yesterdayStr,
          tax_type: 'Dutch VAT',
        },
      ];

      mockSupabaseClient = createMockQueryBuilder({ data: mockData, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.overdue).toBe(0);
    });

    it('should include by_tax_type when breakdown=true', async () => {
      const mockData = [
        {
          status: 'pending',
          deadline: '2025-12-31',
          tax_type: 'Dutch VAT',
        },
      ];

      mockSupabaseClient = createMockQueryBuilder({ data: mockData, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .query({ breakdown: 'true' })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('by_tax_type');
      expect(res.body.data.by_tax_type).toHaveProperty('Dutch VAT');
    });

    it('should exclude by_tax_type when breakdown=false', async () => {
      const mockData = [
        {
          status: 'pending',
          deadline: '2025-12-31',
          tax_type: 'Dutch VAT',
        },
      ];

      mockSupabaseClient = createMockQueryBuilder({ data: mockData, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .query({ breakdown: 'false' })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('by_tax_type');
    });

    it('should apply filters correctly', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .query({ 
          status: 'pending',
          jurisdiction: 'NL',
          tax_type: 'Dutch VAT',
          from: '2025-01-01',
          to: '2025-12-31'
        })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'pending');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('jurisdiction', 'NL');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tax_type', 'Dutch VAT');
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('deadline', '2025-01-01');
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('deadline', '2025-12-31');
    });
  });

  describe('GET /api/clients/:clientId/tax/calendar/summary - Error Handling', () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    it('should return 500 when Supabase query fails', async () => {
      mockSupabaseClient = createMockQueryBuilder({ 
        data: null, 
        error: { message: 'Database connection failed' } 
      });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Failed to fetch tax calendar summary');
    });
  });
});
