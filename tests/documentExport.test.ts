import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';

const app = createApp();

const createMockQueryBuilder = (mockData: any = { data: [], error: null }) => {
  const builder: any = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: vi.fn((resolve: any) => resolve(mockData)),
  };
  return builder;
};

let mockSupabaseClient: any;
let mockAdminSupabaseClient: any;

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

const CLIENT_A_ID = '11111111-1111-4111-a111-111111111111';
const CLIENT_B_ID = '22222222-2222-4222-a222-222222222222';
const DOC_1_ID = '33333333-3333-4333-a333-333333333333';
const DOC_2_ID = '44444444-4444-4444-a444-444444444444';
const EXPORT_ID = '55555555-5555-4555-a555-555555555555';

let adminToken: string;
let clientAToken: string;
let clientBToken: string;

describe('PR-9: Document Export with ZIP Download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSupabaseClient = createMockQueryBuilder();
    mockAdminSupabaseClient = createMockQueryBuilder();
    mockAdminSupabaseClient.storage = {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        download: vi.fn(() => Promise.resolve({ data: new Blob(['test']), error: null })),
        createSignedUrl: vi.fn(() => Promise.resolve({ 
          data: { signedUrl: 'https://storage.example.com/signed-url' }, 
          error: null 
        })),
      })),
    };
    
    vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);
  });

  beforeAll(() => {
    const jwtSecret = env.supabase.jwtSecret;

    adminToken = jwt.sign(
      {
        sub: 'admin-export-test',
        role: 'admin',
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    clientAToken = jwt.sign(
      {
        sub: 'client-a-export-test',
        role: 'client',
        client_id: CLIENT_A_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    clientBToken = jwt.sign(
      {
        sub: 'client-b-export-test',
        role: 'client',
        client_id: CLIENT_B_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/clients/:clientId/documents/export - Create export', () => {
    it('should return 202 and create export job for valid documents', async () => {
      const mockDocuments = [
        { id: DOC_1_ID, size_bytes: 1000 },
        { id: DOC_2_ID, size_bytes: 2000 },
      ];

      const mockExport = {
        id: EXPORT_ID,
        client_id: CLIENT_A_ID,
        created_by: 'client-a-export-test',
        status: 'pending',
        document_ids: [DOC_1_ID, DOC_2_ID],
        storage_key: null,
        error: null,
      };

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'documents') {
          return createMockQueryBuilder({ data: mockDocuments, error: null });
        }
        if (table === 'document_exports') {
          return createMockQueryBuilder({ data: mockExport, error: null });
        }
        return createMockQueryBuilder();
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/export`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          document_ids: [DOC_1_ID, DOC_2_ID],
        });

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('export_id');
      expect(res.body).toHaveProperty('status', 'pending');
    });

    it('should return 422 when document_ids is empty', async () => {
      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/export`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          document_ids: [],
        });

      expect(res.status).toBe(422);
    });

    it('should return 422 when document_ids exceeds max count', async () => {
      const tooManyDocs = Array.from({ length: 51 }, (_, i) => `doc-${i}`);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/export`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          document_ids: tooManyDocs,
        });

      expect(res.status).toBe(422);
    });

    it('should return 422 when total size exceeds limit', async () => {
      const mockLargeDocuments = [
        { id: DOC_1_ID, size_bytes: 600 * 1024 * 1024 }, // 600MB
      ];

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn(() => {
        return createMockQueryBuilder({ data: mockLargeDocuments, error: null });
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/export`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          document_ids: [DOC_1_ID],
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details.message).toContain('exceeds limit');
    });

    it('should return 422 when some documents do not belong to client', async () => {
      const mockDocuments = [
        { id: DOC_1_ID, size_bytes: 1000 },
      ];

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn(() => {
        return createMockQueryBuilder({ data: mockDocuments, error: null });
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/export`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          document_ids: [DOC_1_ID, DOC_2_ID],
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details.message).toContain('not found or do not belong');
    });

    it('should block cross-client export attempt', async () => {
      const mockDocuments = [
        { id: DOC_1_ID, size_bytes: 1000 },
      ];

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn(() => {
        return createMockQueryBuilder({ data: mockDocuments, error: null });
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_B_ID}/documents/export`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          document_ids: [DOC_1_ID],
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/clients/:clientId/documents/export/:exportId - Get export status', () => {
    it('should return pending status for new export', async () => {
      const mockExport = {
        id: EXPORT_ID,
        client_id: CLIENT_A_ID,
        status: 'pending',
        storage_key: null,
        error: null,
      };

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn(() => {
        return createMockQueryBuilder({ data: mockExport, error: null });
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/export/${EXPORT_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('export_id', EXPORT_ID);
      expect(res.body).toHaveProperty('status', 'pending');
      expect(res.body).not.toHaveProperty('url');
    });

    it('should return ready status with signed URL when export is complete', async () => {
      const mockExport = {
        id: EXPORT_ID,
        client_id: CLIENT_A_ID,
        status: 'ready',
        storage_key: `clients/${CLIENT_A_ID}/exports/${EXPORT_ID}/export.zip`,
        error: null,
      };

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn(() => {
        return createMockQueryBuilder({ data: mockExport, error: null });
      });
      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(() => Promise.resolve({ 
            data: { signedUrl: 'https://storage.example.com/export.zip' }, 
            error: null 
          })),
        })),
      };

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/export/${EXPORT_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('export_id', EXPORT_ID);
      expect(res.body).toHaveProperty('status', 'ready');
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('expires_in');
    });

    it('should return failed status with error message', async () => {
      const mockExport = {
        id: EXPORT_ID,
        client_id: CLIENT_A_ID,
        status: 'failed',
        storage_key: null,
        error: 'Failed to download documents',
      };

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn(() => {
        return createMockQueryBuilder({ data: mockExport, error: null });
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/export/${EXPORT_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('export_id', EXPORT_ID);
      expect(res.body).toHaveProperty('status', 'failed');
      expect(res.body).toHaveProperty('error', 'Failed to download documents');
    });

    it('should return 404 for non-existent export', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn(() => {
        return createMockQueryBuilder({ data: null, error: null });
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/export/${EXPORT_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(404);
    });

    it('should block cross-client export status check', async () => {
      const mockExport = {
        id: EXPORT_ID,
        client_id: CLIENT_A_ID,
        status: 'ready',
        storage_key: 'some-key',
        error: null,
      };

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.from = vi.fn(() => {
        return createMockQueryBuilder({ data: null, error: null });
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents/export/${EXPORT_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientBToken}`);

      expect(res.status).toBe(404);
    });
  });
});
