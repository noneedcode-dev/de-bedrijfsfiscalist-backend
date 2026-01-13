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

    it('should return correct response structure with all 25 cells by default', async () => {
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
      expect(res.body.data.cells).toHaveLength(25);
      
      // Check that each cell has the required properties
      res.body.data.cells.forEach((cell: any) => {
        expect(cell).toHaveProperty('likelihood');
        expect(cell).toHaveProperty('impact');
        expect(cell).toHaveProperty('score');
        expect(cell).toHaveProperty('level');
        expect(cell).toHaveProperty('count_total');
        expect(cell.count_total).toBe(0); // All zeros when no data
      });
      
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

    it('should merge RPC data into all 25 cells with correct counts', async () => {
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
      expect(res.body.data.cells).toHaveLength(25); // All 25 cells returned
      
      // Check cells with data
      const cell_3_3 = res.body.data.cells.find((c: any) => c.likelihood === 3 && c.impact === 3);
      expect(cell_3_3).toBeDefined();
      expect(cell_3_3.count_total).toBe(2);
      expect(cell_3_3.score).toBe(9);
      expect(cell_3_3.level).toBe('orange');
      
      const cell_4_5 = res.body.data.cells.find((c: any) => c.likelihood === 4 && c.impact === 5);
      expect(cell_4_5).toBeDefined();
      expect(cell_4_5.count_total).toBe(1);
      expect(cell_4_5.score).toBe(20);
      expect(cell_4_5.level).toBe('red');
      
      const cell_1_2 = res.body.data.cells.find((c: any) => c.likelihood === 1 && c.impact === 2);
      expect(cell_1_2).toBeDefined();
      expect(cell_1_2.count_total).toBe(1);
      expect(cell_1_2.score).toBe(2);
      expect(cell_1_2.level).toBe('green');
      
      // Check a cell with no data
      const cell_5_1 = res.body.data.cells.find((c: any) => c.likelihood === 5 && c.impact === 1);
      expect(cell_5_1).toBeDefined();
      expect(cell_5_1.count_total).toBe(0);
      expect(cell_5_1.score).toBe(5);
      expect(cell_5_1.level).toBe('green');
    });

    it('should correctly compute score and level for each cell', async () => {
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
      expect(cell_2_2.score).toBe(4);
      expect(cell_2_2.level).toBe('green');
      
      const cell_3_3 = res.body.data.cells.find((c: any) => c.likelihood === 3 && c.impact === 3);
      expect(cell_3_3.score).toBe(9);
      expect(cell_3_3.level).toBe('orange');
      
      const cell_5_5 = res.body.data.cells.find((c: any) => c.likelihood === 5 && c.impact === 5);
      expect(cell_5_5.score).toBe(25);
      expect(cell_5_5.level).toBe('red');
    });

    it('should return only non-zero cells when compact=true', async () => {
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
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap?compact=true`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.cells).toHaveLength(2);
      expect(res.body.data.cells.every((c: any) => c.count_total > 0)).toBe(true);
      
      const cell_1_1 = res.body.data.cells.find((c: any) => c.likelihood === 1 && c.impact === 1);
      expect(cell_1_1).toBeDefined();
      expect(cell_1_1.count_total).toBe(1);
      
      const cell_5_5 = res.body.data.cells.find((c: any) => c.likelihood === 5 && c.impact === 5);
      expect(cell_5_5).toBeDefined();
      expect(cell_5_5.count_total).toBe(1);
    });

    it('should order cells by impact DESC, likelihood ASC', async () => {
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
      expect(res.body.data.cells).toHaveLength(25);
      
      // First 5 cells should be impact=5, likelihood=1,2,3,4,5
      expect(res.body.data.cells[0]).toMatchObject({ likelihood: 1, impact: 5 });
      expect(res.body.data.cells[1]).toMatchObject({ likelihood: 2, impact: 5 });
      expect(res.body.data.cells[2]).toMatchObject({ likelihood: 3, impact: 5 });
      expect(res.body.data.cells[3]).toMatchObject({ likelihood: 4, impact: 5 });
      expect(res.body.data.cells[4]).toMatchObject({ likelihood: 5, impact: 5 });
      
      // Next 5 cells should be impact=4, likelihood=1,2,3,4,5
      expect(res.body.data.cells[5]).toMatchObject({ likelihood: 1, impact: 4 });
      expect(res.body.data.cells[6]).toMatchObject({ likelihood: 2, impact: 4 });
      
      // Last 5 cells should be impact=1, likelihood=1,2,3,4,5
      expect(res.body.data.cells[20]).toMatchObject({ likelihood: 1, impact: 1 });
      expect(res.body.data.cells[24]).toMatchObject({ likelihood: 5, impact: 1 });
    });

    it('should correctly compute level for boundary scores', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            { likelihood: 1, impact: 5, count_total: 1 }, // score=5 (green)
            { likelihood: 2, impact: 3, count_total: 1 }, // score=6 (orange)
            { likelihood: 3, impact: 4, count_total: 1 }, // score=12 (orange)
            { likelihood: 4, impact: 4, count_total: 1 }, // score=16 (red)
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
      
      // Score 5 should be green (boundary)
      const cell_1_5 = res.body.data.cells.find((c: any) => c.likelihood === 1 && c.impact === 5);
      expect(cell_1_5.score).toBe(5);
      expect(cell_1_5.level).toBe('green');
      
      // Score 6 should be orange (just above green)
      const cell_2_3 = res.body.data.cells.find((c: any) => c.likelihood === 2 && c.impact === 3);
      expect(cell_2_3.score).toBe(6);
      expect(cell_2_3.level).toBe('orange');
      
      // Score 12 should be orange (boundary)
      const cell_3_4 = res.body.data.cells.find((c: any) => c.likelihood === 3 && c.impact === 4);
      expect(cell_3_4.score).toBe(12);
      expect(cell_3_4.level).toBe('orange');
      
      // Score 13 should be red (just above orange)
      const cell_4_4 = res.body.data.cells.find((c: any) => c.likelihood === 4 && c.impact === 4);
      expect(cell_4_4.score).toBe(16);
      expect(cell_4_4.level).toBe('red');
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

    it('should return array format when format=array is specified', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap?format=array`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      
      // CRITICAL: Verify response is a pure JSON array at root level
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(25);
      
      // Verify it's NOT wrapped in any object
      expect(res.body).not.toHaveProperty('data');
      expect(res.body).not.toHaveProperty('body');
      expect(res.body).not.toHaveProperty('cells');
      expect(res.body).not.toHaveProperty('result');
      
      // Check that each cell has the required properties
      res.body.forEach((cell: any) => {
        expect(cell).toHaveProperty('likelihood');
        expect(cell).toHaveProperty('impact');
        expect(cell).toHaveProperty('score');
        expect(cell).toHaveProperty('level');
        expect(cell).toHaveProperty('count_total');
      });
      
      // Verify first element is directly accessible (not nested)
      expect(res.body[0]).toBeDefined();
      expect(res.body[0].likelihood).toBeDefined();
      expect(res.body[0]).not.toHaveProperty('data');
      expect(res.body[0]).not.toHaveProperty('body');
    });

    it('should return array format with compact when format=array&compact=true', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            { likelihood: 2, impact: 3, count_total: 5 },
            { likelihood: 4, impact: 5, count_total: 2 },
          ],
          error: null
        })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap?format=array&compact=true`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((c: any) => c.count_total > 0)).toBe(true);
      
      const cell_2_3 = res.body.find((c: any) => c.likelihood === 2 && c.impact === 3);
      expect(cell_2_3).toBeDefined();
      expect(cell_2_3.count_total).toBe(5);
      expect(cell_2_3.score).toBe(6);
      expect(cell_2_3.level).toBe('orange');
      
      const cell_4_5 = res.body.find((c: any) => c.likelihood === 4 && c.impact === 5);
      expect(cell_4_5).toBeDefined();
      expect(cell_4_5.count_total).toBe(2);
      expect(cell_4_5.score).toBe(20);
      expect(cell_4_5.level).toBe('red');
    });

    it('should return default object format when format is not specified', async () => {
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
    });

    it('should return default object format when format=object', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap?format=object`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('cells');
      expect(res.body.data).toHaveProperty('axes');
      expect(res.body.data).toHaveProperty('thresholds');
    });

    it('should handle format parameter case-insensitively', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap?format=ARRAY`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(25);
    });

    it('should return pure array that Bubble API Connector can access directly (body:first item:likelihood)', async () => {
      const validToken = generateToken({ sub: 'user123', role: 'admin' });
      
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            { likelihood: 3, impact: 4, count_total: 5 },
            { likelihood: 2, impact: 2, count_total: 3 },
          ],
          error: null
        })
      };
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockSupabase as any);
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/tax/risk-controls/heatmap?format=array`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(res.status).toBe(200);
      
      // Simulate Bubble API Connector access pattern
      // In Bubble: body:first item:likelihood should directly access res.body[0].likelihood
      const body = res.body;
      expect(Array.isArray(body)).toBe(true);
      
      // Bubble's "first item" = body[0]
      const firstItem = body[0];
      expect(firstItem).toBeDefined();
      
      // Bubble's "first item:likelihood" = body[0].likelihood
      const likelihood = firstItem.likelihood;
      expect(likelihood).toBeDefined();
      expect(typeof likelihood).toBe('number');
      expect(likelihood).toBeGreaterThanOrEqual(1);
      expect(likelihood).toBeLessThanOrEqual(5);
      
      // Verify this is NOT body.body[0].likelihood (double nested)
      expect((body as any).body).toBeUndefined();
      
      // Verify this is NOT body.data.cells[0].likelihood (wrapped in object)
      expect((body as any).data).toBeUndefined();
      expect((body as any).cells).toBeUndefined();
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
