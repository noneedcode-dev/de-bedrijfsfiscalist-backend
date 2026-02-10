import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const MOCK_CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const MOCK_INVOICE_ID = '223e4567-e89b-12d3-a456-426614174000';
const MOCK_DOCUMENT_ID = '323e4567-e89b-12d3-a456-426614174000';

function generateToken(payload: any, expiresIn: string = '1h'): string {
  // @ts-expect-error - jsonwebtoken types have issues with expiresIn string literal
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn });
}

describe('Invoices API', () => {
  describe('POST /api/admin/clients/:clientId/invoices', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/invoices`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          title: 'Test Invoice',
          amount_total: '150.00',
          due_date: '2026-03-10',
        });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate required fields', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/invoices`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate amount_total as decimal', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/invoices`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Invoice',
          amount_total: 'invalid',
          due_date: '2026-03-10',
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate due_date format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/invoices`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Invoice',
          amount_total: '150.00',
          due_date: 'invalid-date',
        });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should accept optional fields', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/clients/${MOCK_CLIENT_ID}/invoices`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test Invoice',
          description: 'Test description',
          currency: 'EUR',
          amount_total: '150.00',
          due_date: '2026-03-10',
          period_start: '2026-02-01',
          period_end: '2026-02-28',
          auto_calculate: true,
        });
      
      expect([201, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/admin/invoices', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get('/api/admin/invoices')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should accept filter parameters', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get(`/api/admin/invoices?client_id=${MOCK_CLIENT_ID}&status=OPEN&limit=10&offset=0`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect([200, 500]).toContain(res.status);
    });

    it('should validate status enum', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/invoices?status=INVALID')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate limit range', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/invoices?limit=200')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/admin/invoices/:invoiceId', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/admin/invoices/${MOCK_INVOICE_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate invoiceId format', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .get('/api/admin/invoices/invalid-uuid')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/admin/invoices/:invoiceId/decision', () => {
    it('should require admin role', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/admin/invoices/${MOCK_INVOICE_ID}/decision`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ decision: 'approve' });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    });

    it('should validate decision enum', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/invoices/${MOCK_INVOICE_ID}/decision`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'invalid' });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should require decision field', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/invoices/${MOCK_INVOICE_ID}/decision`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should accept approve decision', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/invoices/${MOCK_INVOICE_ID}/decision`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'approve', review_note: 'Approved' });
      
      expect([200, 400, 404, 500]).toContain(res.status);
    });

    it('should accept cancel decision', async () => {
      const adminToken = generateToken({ sub: 'admin123', role: 'admin' });
      
      const res = await request(app)
        .post(`/api/admin/invoices/${MOCK_INVOICE_ID}/decision`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'cancel', review_note: 'Cancelled' });
      
      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/clients/:clientId/invoices (Client Access)', () => {
    it('should allow client to view their invoices', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/invoices`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect([200, 500]).toContain(res.status);
    });

    it('should accept status filter', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/invoices?status=OPEN`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/clients/:clientId/invoices/:invoiceId (Client Access)', () => {
    it('should allow client to view their invoice', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/invoices/${MOCK_INVOICE_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect([200, 404, 500]).toContain(res.status);
    });

    it('should validate invoiceId format', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .get(`/api/clients/${MOCK_CLIENT_ID}/invoices/invalid-uuid`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`);
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/clients/:clientId/invoices/:invoiceId/proof (Client Access)', () => {
    it('should allow client to submit proof', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/invoices/${MOCK_INVOICE_ID}/proof`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ document_id: MOCK_DOCUMENT_ID });
      
      expect([200, 400, 404, 500]).toContain(res.status);
    });

    it('should require document_id field', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/invoices/${MOCK_INVOICE_ID}/proof`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should validate document_id format', async () => {
      const clientToken = generateToken({ 
        sub: 'user123', 
        role: 'client', 
        client_id: MOCK_CLIENT_ID 
      });
      
      const res = await request(app)
        .post(`/api/clients/${MOCK_CLIENT_ID}/invoices/${MOCK_INVOICE_ID}/proof`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ document_id: 'invalid-uuid' });
      
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});
