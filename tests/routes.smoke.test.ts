import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';
import { createScriptedSupabaseClient } from './utils/scriptedSupabaseMock';

const app = createApp();
const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';
const TEST_CLIENT_ID = '11111111-1111-4111-a111-111111111111';

let adminToken: string;

describe('Routes Smoke Test - Verify all expected routes exist', () => {
  beforeAll(() => {
    adminToken = jwt.sign(
      { sub: 'admin-smoke-test', role: 'admin' },
      env.supabase.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('Document Folders Routes', () => {
    it('GET /api/clients/:clientId/documents/document-folders should exist', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [{ data: [], error: null }],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .get(`/api/clients/${TEST_CLIENT_ID}/documents/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(404);
      console.log('GET /documents/document-folders status:', res.status);
    });

    it('POST /api/clients/:clientId/documents/document-folders should exist', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [{ data: { id: 'test', name: 'Test Folder' }, error: null }],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .post(`/api/clients/${TEST_CLIENT_ID}/documents/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Folder' });

      expect(res.status).not.toBe(404);
      console.log('POST /documents/document-folders status:', res.status);
    });

    it('PATCH /api/clients/:clientId/documents/document-folders/:id should exist', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', name: 'Old' }, error: null },
          { data: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', name: 'Updated' }, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .patch(`/api/clients/${TEST_CLIENT_ID}/documents/document-folders/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Folder' });

      expect(res.status).not.toBe(404);
      console.log('PATCH /documents/document-folders/:id status:', res.status);
    });

    it('DELETE /api/clients/:clientId/documents/document-folders/:id should exist', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }, error: null },
          { data: null, error: null },
        ],
        documents: [{ data: [], error: null, count: 0 }],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .delete(`/api/clients/${TEST_CLIENT_ID}/documents/document-folders/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(404);
      console.log('DELETE /documents/document-folders/:id status:', res.status);
    });
  });

  describe('Document Tags Routes', () => {
    it('GET /api/clients/:clientId/documents/document-tags should exist', async () => {
      const res = await request(app)
        .get(`/api/clients/${TEST_CLIENT_ID}/documents/document-tags`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(404);
      console.log('GET /documents/document-tags status:', res.status);
    });

    it('POST /api/clients/:clientId/documents/document-tags should exist', async () => {
      const res = await request(app)
        .post(`/api/clients/${TEST_CLIENT_ID}/documents/document-tags`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Tag' });

      expect(res.status).not.toBe(404);
      console.log('POST /documents/document-tags status:', res.status);
    });

    it('DELETE /api/clients/:clientId/documents/document-tags/:id should exist', async () => {
      const res = await request(app)
        .delete(`/api/clients/${TEST_CLIENT_ID}/documents/document-tags/cccccccc-cccc-4ccc-cccc-cccccccccccc`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(404);
      console.log('DELETE /documents/document-tags/:id status:', res.status);
    });
  });

  describe('Messages Routes', () => {
    it('GET /api/clients/:clientId/messages should exist', async () => {
      const res = await request(app)
        .get(`/api/clients/${TEST_CLIENT_ID}/messages`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(404);
      console.log('GET /messages status:', res.status);
    });

    it('POST /api/clients/:clientId/messages should exist', async () => {
      const res = await request(app)
        .post(`/api/clients/${TEST_CLIENT_ID}/messages`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Test message' });

      expect(res.status).not.toBe(404);
      console.log('POST /messages status:', res.status);
    });

    it('GET /api/admin/messages/export should exist', async () => {
      const res = await request(app)
        .get('/api/admin/messages/export')
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).not.toBe(404);
      console.log('GET /admin/messages/export status:', res.status);
    });
  });
});
