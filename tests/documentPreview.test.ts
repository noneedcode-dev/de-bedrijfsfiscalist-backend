import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';
import * as previewGenerator from '../src/lib/previewGenerator';

const app = createApp();

const createMockQueryBuilder = (mockData: any = { data: [], error: null }) => {
  const builder: any = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    rpc: vi.fn(() => Promise.resolve(mockData)),
    then: vi.fn((resolve: any) => resolve(mockData)),
  };
  return builder;
};

let mockSupabaseClient: any;
let mockAdminSupabaseClient: any;

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

const CLIENT_A_ID = '11111111-1111-4111-a111-111111111111';
const DOC_ID = '33333333-3333-4333-a333-333333333333';

let clientAToken: string;

describe('PR-8: Document Preview Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSupabaseClient = createMockQueryBuilder();
    mockAdminSupabaseClient = createMockQueryBuilder();
    mockAdminSupabaseClient.storage = {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        download: vi.fn(() => Promise.resolve({ 
          data: new Blob([Buffer.from('fake file content')]), 
          error: null 
        })),
        createSignedUrl: vi.fn(() => Promise.resolve({ 
          data: { signedUrl: 'https://storage.example.com/preview.webp?token=abc' }, 
          error: null 
        })),
      })),
    };
    
    vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);
  });

  beforeAll(() => {
    const jwtSecret = env.supabase.jwtSecret;

    clientAToken = jwt.sign(
      {
        sub: 'client-a-preview-test',
        role: 'client',
        client_id: CLIENT_A_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/clients/:clientId/documents/:id/preview', () => {
    it('should return 404 when preview is not ready', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({
        data: {
          id: DOC_ID,
          client_id: CLIENT_A_ID,
          preview_status: 'pending',
          preview_storage_key: null,
        },
        error: null,
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/preview`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 when preview_status is null', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({
        data: {
          id: DOC_ID,
          client_id: CLIENT_A_ID,
          preview_status: null,
          preview_storage_key: null,
        },
        error: null,
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/preview`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 when document not found', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({
        data: null,
        error: null,
      });

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/preview`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 200 with signed URL when preview is ready', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({
        data: {
          id: DOC_ID,
          client_id: CLIENT_A_ID,
          preview_status: 'ready',
          preview_storage_key: `clients/${CLIENT_A_ID}/documents/${DOC_ID}/preview.webp`,
        },
        error: null,
      });

      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(() => Promise.resolve({ 
            data: { signedUrl: 'https://storage.example.com/preview.webp?token=abc123' }, 
            error: null 
          })),
        })),
      };

      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/preview`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('expires_in');
      expect(res.body.url).toContain('storage.example.com');
      expect(res.body.expires_in).toBe(300);
    });

    it('should return 422 when document ID is invalid UUID', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/invalid-uuid/preview`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(422);
    });
  });

  describe('Preview Job Enqueuing on Upload', () => {
    it('should enqueue preview job after successful upload', async () => {
      const rpcSpy = vi.fn(() => Promise.resolve({ data: DOC_ID, error: null }));
      
      mockSupabaseClient = createMockQueryBuilder({
        data: null,
        error: null,
      });

      mockAdminSupabaseClient = createMockQueryBuilder({
        data: {
          id: DOC_ID,
          client_id: CLIENT_A_ID,
          name: 'test.jpg',
          mime_type: 'image/jpeg',
          size_bytes: 1024,
          storage_path: `clients/${CLIENT_A_ID}/documents/${DOC_ID}/test.jpg`,
        },
        error: null,
      });

      mockAdminSupabaseClient.rpc = rpcSpy;
      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      };

      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', 'test-upload-key-new-456')
        .attach('file', Buffer.from('fake image data'), 'test.jpg');

      expect(res.status).toBe(201);
      expect(rpcSpy).toHaveBeenCalled();
      expect(rpcSpy).toHaveBeenCalledWith(
        'enqueue_document_preview_job',
        expect.objectContaining({
          p_client_id: CLIENT_A_ID,
          p_document_id: expect.any(String),
        })
      );
    });
  });

  describe('Preview Generation Utilities', () => {
    it('should identify supported file types for preview', () => {
      expect(previewGenerator.isSupportedForPreview('image/jpeg')).toBe(true);
      expect(previewGenerator.isSupportedForPreview('image/png')).toBe(true);
      expect(previewGenerator.isSupportedForPreview('image/webp')).toBe(true);
      expect(previewGenerator.isSupportedForPreview('application/pdf')).toBe(true);
      expect(previewGenerator.isSupportedForPreview('text/plain')).toBe(false);
      expect(previewGenerator.isSupportedForPreview('application/zip')).toBe(false);
    });
  });
});
