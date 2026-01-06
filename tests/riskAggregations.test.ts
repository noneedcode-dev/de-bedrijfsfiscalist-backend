import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_CLIENT_ID = '987e6543-e21b-12d3-a456-426614174999';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

function createMockQueryBuilder(selectResult: { data: any; error: any }) {
  const mockBuilder = {
    from: vi.fn(() => mockBuilder),
    select: vi.fn(() => mockBuilder),
    eq: vi.fn(() => mockBuilder),
    not: vi.fn(() => mockBuilder),
    then: vi.fn((resolve) => resolve(selectResult)),
  };
  return mockBuilder;
}

describe('Risk Aggregations API', () => {
  describe('GET /api/clients/:clientId/tax/risk-controls/summary', () => {
    it('should require API key', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should validate clientId format', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/clients/invalid-uuid/tax/risk-controls/summary')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return correct response structure for empty data', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('total_risks');
      expect(res.body.data).toHaveProperty('by_level');
      expect(res.body.data).toHaveProperty('by_status');
      expect(res.body.data).toHaveProperty('top_risks');
      
      expect(res.body.data.total_risks).toBe(0);
      expect(res.body.data.by_level).toEqual({ green: 0, orange: 0, red: 0 });
      expect(res.body.data.by_status).toEqual({ open: 0, closed: 0 });
      expect(res.body.data.top_risks).toEqual([]);
    });

    it('should correctly classify risks by level (green: 1-5)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({
        data: [
          { id: '1', risk_description: 'Risk 1', inherent_likelihood: 1, inherent_impact: 1, inherent_score: 1, inherent_color: 'green', response: 'Monitor' },
          { id: '2', risk_description: 'Risk 2', inherent_likelihood: 1, inherent_impact: 5, inherent_score: 5, inherent_color: 'green', response: 'Monitor' },
        ],
        error: null
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.total_risks).toBe(2);
      expect(res.body.data.by_level.green).toBe(2);
      expect(res.body.data.by_level.orange).toBe(0);
      expect(res.body.data.by_level.red).toBe(0);
    });

    it('should correctly classify risks by level (orange: 6-12)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({
        data: [
          { id: '1', risk_description: 'Risk 1', inherent_likelihood: 2, inherent_impact: 3, inherent_score: 6, inherent_color: 'orange', response: 'Monitor' },
          { id: '2', risk_description: 'Risk 2', inherent_likelihood: 3, inherent_impact: 4, inherent_score: 12, inherent_color: 'orange', response: 'Mitigate' },
        ],
        error: null
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.total_risks).toBe(2);
      expect(res.body.data.by_level.green).toBe(0);
      expect(res.body.data.by_level.orange).toBe(2);
      expect(res.body.data.by_level.red).toBe(0);
    });

    it('should correctly classify risks by level (red: 13-25)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({
        data: [
          { id: '1', risk_description: 'Risk 1', inherent_likelihood: 4, inherent_impact: 4, inherent_score: 16, inherent_color: 'red', response: 'Mitigate' },
          { id: '2', risk_description: 'Risk 2', inherent_likelihood: 5, inherent_impact: 5, inherent_score: 25, inherent_color: 'red', response: 'Mitigate' },
        ],
        error: null
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.total_risks).toBe(2);
      expect(res.body.data.by_level.green).toBe(0);
      expect(res.body.data.by_level.orange).toBe(0);
      expect(res.body.data.by_level.red).toBe(2);
    });

    it('should correctly classify risks by status (open vs closed)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({
        data: [
          { id: '1', risk_description: 'Risk 1', inherent_likelihood: 3, inherent_impact: 3, inherent_score: 9, inherent_color: 'orange', response: 'Monitor' },
          { id: '2', risk_description: 'Risk 2', inherent_likelihood: 4, inherent_impact: 4, inherent_score: 16, inherent_color: 'red', response: 'Mitigate' },
          { id: '3', risk_description: 'Risk 3', inherent_likelihood: 2, inherent_impact: 2, inherent_score: 4, inherent_color: 'green', response: 'Accept' },
        ],
        error: null
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.total_risks).toBe(3);
      expect(res.body.data.by_status.open).toBe(2);
      expect(res.body.data.by_status.closed).toBe(1);
    });

    it('should return top 5 open risks sorted by score desc', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({
        data: [
          { id: '1', risk_description: 'Risk 1', inherent_likelihood: 5, inherent_impact: 5, inherent_score: 25, inherent_color: 'red', response: 'Mitigate' },
          { id: '2', risk_description: 'Risk 2', inherent_likelihood: 4, inherent_impact: 5, inherent_score: 20, inherent_color: 'red', response: 'Monitor' },
          { id: '3', risk_description: 'Risk 3', inherent_likelihood: 4, inherent_impact: 4, inherent_score: 16, inherent_color: 'red', response: 'Mitigate' },
          { id: '4', risk_description: 'Risk 4', inherent_likelihood: 3, inherent_impact: 4, inherent_score: 12, inherent_color: 'orange', response: 'Monitor' },
          { id: '5', risk_description: 'Risk 5', inherent_likelihood: 2, inherent_impact: 4, inherent_score: 8, inherent_color: 'orange', response: 'Mitigate' },
          { id: '6', risk_description: 'Risk 6', inherent_likelihood: 2, inherent_impact: 2, inherent_score: 4, inherent_color: 'green', response: 'Monitor' },
          { id: '7', risk_description: 'Risk 7', inherent_likelihood: 1, inherent_impact: 1, inherent_score: 1, inherent_color: 'green', response: 'Monitor' },
        ],
        error: null
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.top_risks).toHaveLength(5);
      expect(res.body.data.top_risks[0].score).toBe(25);
      expect(res.body.data.top_risks[1].score).toBe(20);
      expect(res.body.data.top_risks[2].score).toBe(16);
      expect(res.body.data.top_risks[3].score).toBe(12);
      expect(res.body.data.top_risks[4].score).toBe(8);
      
      res.body.data.top_risks.forEach((risk: any) => {
        expect(risk).toHaveProperty('id');
        expect(risk).toHaveProperty('title');
        expect(risk).toHaveProperty('likelihood');
        expect(risk).toHaveProperty('impact');
        expect(risk).toHaveProperty('score');
        expect(risk).toHaveProperty('level');
        expect(risk).toHaveProperty('status');
        expect(risk.status).toBe('open');
      });
    });

    it('should exclude closed risks from top_risks', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({
        data: [
          { id: '1', risk_description: 'Risk 1', inherent_likelihood: 5, inherent_impact: 5, inherent_score: 25, inherent_color: 'red', response: 'Accept' },
          { id: '2', risk_description: 'Risk 2', inherent_likelihood: 4, inherent_impact: 4, inherent_score: 16, inherent_color: 'red', response: 'Mitigate' },
          { id: '3', risk_description: 'Risk 3', inherent_likelihood: 3, inherent_impact: 3, inherent_score: 9, inherent_color: 'orange', response: 'Monitor' },
        ],
        error: null
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.top_risks).toHaveLength(2);
      expect(res.body.data.top_risks[0].score).toBe(16);
      expect(res.body.data.top_risks[1].score).toBe(9);
      expect(res.body.data.top_risks.every((r: any) => r.status === 'open')).toBe(true);
    });

    it('should enforce client isolation - client cannot access another client', async () => {
      const validToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID
      });
      
      const res = await request(app)
        .get(`/api/clients/${OTHER_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('should allow admin to access any client', async () => {
      const adminToken = generateToken({ 
        sub: 'admin123', 
        role: 'admin'
      });
      
      const mockSupabase = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${OTHER_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/clients/:clientId/tax/risk-controls/heatmap', () => {
    it('should require API key', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap`);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should require JWT', async () => {
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap`)
        .set('x-api-key', MOCK_API_KEY);
      
      expect(res.status).toBe(401);
      expect(res.body.code).toBeTruthy();
    });

    it('should validate clientId format', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/clients/invalid-uuid/tax/risk-controls/heatmap')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBeTruthy();
    });

    it('should return correct response structure', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('cells');
      expect(res.body.data).toHaveProperty('axes');
      expect(res.body.data).toHaveProperty('thresholds');
      
      expect(Array.isArray(res.body.data.cells)).toBe(true);
      expect(res.body.data.axes).toEqual({
        likelihood: [1, 2, 3, 4, 5],
        impact: [1, 2, 3, 4, 5]
      });
      expect(res.body.data.thresholds).toEqual({
        green_max: 5,
        orange_max: 12,
        red_max: 25
      });
    });

    it('should aggregate risks by likelihood and impact', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            { likelihood: 3, impact: 3, count_total: 2 },
            { likelihood: 4, impact: 5, count_total: 1 },
            { likelihood: 1, impact: 2, count_total: 1 },
          ],
          error: null
        })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.cells).toHaveLength(3);
      
      const cell_3_3 = res.body.data.cells.find((c: any) => c.likelihood === 3 && c.impact === 3);
      expect(cell_3_3).toBeDefined();
      expect(cell_3_3.count_total).toBe(2);
      
      const cell_4_5 = res.body.data.cells.find((c: any) => c.likelihood === 4 && c.impact === 5);
      expect(cell_4_5).toBeDefined();
      expect(cell_4_5.count_total).toBe(1);
      
      const cell_1_2 = res.body.data.cells.find((c: any) => c.likelihood === 1 && c.impact === 2);
      expect(cell_1_2).toBeDefined();
      expect(cell_1_2.count_total).toBe(1);
    });

    it('should correctly classify cell counts by level', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            { likelihood: 2, impact: 2, count_total: 2 },
            { likelihood: 3, impact: 3, count_total: 3 },
            { likelihood: 5, impact: 5, count_total: 1 },
          ],
          error: null
        })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      
      const cell_2_2 = res.body.data.cells.find((c: any) => c.likelihood === 2 && c.impact === 2);
      expect(cell_2_2.by_level.green).toBe(2);
      expect(cell_2_2.by_level.orange).toBe(0);
      expect(cell_2_2.by_level.red).toBe(0);
      
      const cell_3_3 = res.body.data.cells.find((c: any) => c.likelihood === 3 && c.impact === 3);
      expect(cell_3_3.by_level.green).toBe(0);
      expect(cell_3_3.by_level.orange).toBe(3);
      expect(cell_3_3.by_level.red).toBe(0);
      
      const cell_5_5 = res.body.data.cells.find((c: any) => c.likelihood === 5 && c.impact === 5);
      expect(cell_5_5.by_level.green).toBe(0);
      expect(cell_5_5.by_level.orange).toBe(0);
      expect(cell_5_5.by_level.red).toBe(1);
    });

    it('should only return cells with count_total > 0', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            { likelihood: 1, impact: 1, count_total: 1 },
            { likelihood: 5, impact: 5, count_total: 1 },
          ],
          error: null
        })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.cells).toHaveLength(2);
      expect(res.body.data.cells.every((c: any) => c.count_total > 0)).toBe(true);
    });

    it('should enforce client isolation - client cannot access another client', async () => {
      const validToken = generateToken({ 
        sub: 'user123', 
        role: 'client',
        client_id: MOCK_CLIENT_ID
      });
      
      const res = await request(app)
        .get(`/api/clients/${OTHER_CLIENT_ID}/tax/risk-controls/heatmap`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('should allow admin to access any client', async () => {
      const adminToken = generateToken({ 
        sub: 'admin123', 
        role: 'admin'
      });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${OTHER_CLIENT_ID}/tax/risk-controls/heatmap`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
    });
  });

  describe('Risk Scoring Consistency', () => {
    it('should use consistent scoring logic across all endpoints', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({
        data: [
          { id: '1', risk_description: 'Risk 1', inherent_likelihood: 2, inherent_impact: 3, inherent_score: 6, inherent_color: 'orange', response: 'Monitor' },
          { id: '2', risk_description: 'Risk 2', inherent_likelihood: 4, inherent_impact: 4, inherent_score: 16, inherent_color: 'red', response: 'Mitigate' },
          { id: '3', risk_description: 'Risk 3', inherent_likelihood: 1, inherent_impact: 3, inherent_score: 3, inherent_color: 'green', response: 'Monitor' },
        ],
        error: null
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const summaryRes = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.by_level.green).toBe(1);
      expect(summaryRes.body.data.by_level.orange).toBe(1);
      expect(summaryRes.body.data.by_level.red).toBe(1);
      
      expect(summaryRes.body.data.top_risks[0].level).toBe('red');
      expect(summaryRes.body.data.top_risks[0].score).toBe(16);
      expect(summaryRes.body.data.top_risks[1].level).toBe('orange');
      expect(summaryRes.body.data.top_risks[1].score).toBe(6);
      expect(summaryRes.body.data.top_risks[2].level).toBe('green');
      expect(summaryRes.body.data.top_risks[2].score).toBe(3);
    });

    it('should correctly classify (1,5)=green, (3,4)=orange, (5,5)=red', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = createMockQueryBuilder({
        data: [
          { id: '1', risk_description: 'Risk 1', inherent_likelihood: 1, inherent_impact: 5, inherent_score: 5, inherent_color: 'green', response: 'Monitor' },
          { id: '2', risk_description: 'Risk 2', inherent_likelihood: 3, inherent_impact: 4, inherent_score: 12, inherent_color: 'orange', response: 'Monitor' },
          { id: '3', risk_description: 'Risk 3', inherent_likelihood: 5, inherent_impact: 5, inherent_score: 25, inherent_color: 'red', response: 'Mitigate' },
        ],
        error: null
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/summary`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.by_level.green).toBe(1);
      expect(res.body.data.by_level.orange).toBe(1);
      expect(res.body.data.by_level.red).toBe(1);
      
      const risk1 = res.body.data.top_risks.find((r: any) => r.id === '1');
      expect(risk1.score).toBe(5);
      expect(risk1.level).toBe('green');
      
      const risk2 = res.body.data.top_risks.find((r: any) => r.id === '2');
      expect(risk2.score).toBe(12);
      expect(risk2.level).toBe('orange');
      
      const risk3 = res.body.data.top_risks.find((r: any) => r.id === '3');
      expect(risk3.score).toBe(25);
      expect(risk3.level).toBe('red');
    });
  });
});
