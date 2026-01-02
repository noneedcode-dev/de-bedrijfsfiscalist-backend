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
    then: vi.fn((resolve: any) => resolve(mockData)),
  };
  return builder;
};

let mockSupabaseClient: any;

describe('Tax Calendar Upcoming Endpoint Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient = createMockQueryBuilder();
    vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);
  });

  describe('GET /api/clients/:clientId/tax/calendar/upcoming - Authentication', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .set('x-api-key', MOCK_API_KEY);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/clients/:clientId/tax/calendar/upcoming - Validation', () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    it('should return 422 when clientId is not a valid UUID', async () => {
      const invalidToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/clients/invalid-uuid/tax/calendar/upcoming')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Validation failed');
    });

    it('should return 422 when months is out of range (too low)', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .query({ months: 0 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('months must be between 1 and 24');
    });

    it('should return 422 when months is out of range (too high)', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .query({ months: 25 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('months must be between 1 and 24');
    });

    it('should return 422 when limit is out of range (too low)', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .query({ limit: 0 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('limit must be between 1 and 50');
    });

    it('should return 422 when limit is out of range (too high)', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .query({ limit: 51 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('limit must be between 1 and 50');
    });
  });

  describe('GET /api/clients/:clientId/tax/calendar/upcoming - Happy Path', () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    it('should return 200 with empty list when no data', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toHaveProperty('count', 0);
      expect(res.body.meta).toHaveProperty('range');
      expect(res.body.meta.range).toHaveProperty('from');
      expect(res.body.meta.range).toHaveProperty('to');
      expect(res.body.meta).toHaveProperty('timestamp');
    });

    it('should return 200 with upcoming entries', async () => {
      const mockData = [
        {
          id: '1',
          client_id: MOCK_CLIENT_ID,
          jurisdiction: 'NL',
          tax_type: 'Dutch VAT',
          deadline: '2025-01-31',
          status: 'pending',
        },
        {
          id: '2',
          client_id: MOCK_CLIENT_ID,
          jurisdiction: 'NL',
          tax_type: 'Dutch CIT',
          deadline: '2025-02-28',
          status: 'in_progress',
        },
      ];

      mockSupabaseClient = createMockQueryBuilder({ data: mockData, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.count).toBe(2);
    });

    it('should exclude done entries by default when status param is not provided', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.neq).toHaveBeenCalledWith('status', 'done');
    });

    it('should apply exact status filter when status param is provided', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .query({ status: 'pending' })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'pending');
      expect(mockSupabaseClient.neq).not.toHaveBeenCalled();
    });

    it('should apply date range filter correctly', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .query({ months: 6 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('deadline', expect.any(String));
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('deadline', expect.any(String));
    });

    it('should apply limit correctly', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .query({ limit: 5 })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(5);
    });

    it('should order by deadline ascending', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('deadline', { ascending: true });
    });

    it('should apply optional filters correctly', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .query({ 
          jurisdiction: 'NL',
          tax_type: 'Dutch VAT',
          period_label: '2025-Q1'
        })
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('jurisdiction', 'NL');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tax_type', 'Dutch VAT');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('period_label', '2025-Q1');
    });

    it('should use default values for months and limit', async () => {
      mockSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('GET /api/clients/:clientId/tax/calendar/upcoming - Error Handling', () => {
    const validToken = generateToken({ sub: 'user123', role: 'client', client_id: MOCK_CLIENT_ID });

    it('should return 500 when Supabase query fails', async () => {
      mockSupabaseClient = createMockQueryBuilder({ 
        data: null, 
        error: { message: 'Database connection failed' } 
      });
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/calendar/upcoming`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Failed to fetch upcoming tax calendar entries');
    });
  });
});
