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
    is: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    then: vi.fn((resolve: any) => resolve(mockData)),
  };
  return builder;
};

let mockAdminSupabaseClient: any;

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

// Test UUIDs for different clients (RFC4122 v4 compliant)
const CLIENT_A_ID = '11111111-1111-4111-a111-111111111111';
const CLIENT_B_ID = '22222222-2222-4222-a222-222222222222';
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const DOC_ID_2 = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

// Test user tokens (generated via JWT)
let adminToken: string;
let clientAToken: string;
let clientBToken: string;

describe('PR-6: Document Soft-Delete (Archive) and Purge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock client setup
    mockAdminSupabaseClient = createMockQueryBuilder();
    mockAdminSupabaseClient.storage = {
      from: vi.fn(() => ({
        remove: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      })),
    };
    
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);
  });

  beforeAll(() => {
    // Generate JWT tokens for test users
    const jwtSecret = env.supabase.jwtSecret;

    // Admin token
    adminToken = jwt.sign(
      {
        sub: 'admin-test-user',
        role: 'admin',
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Client A token
    clientAToken = jwt.sign(
      {
        sub: 'client-a-test-user',
        role: 'client',
        client_id: CLIENT_A_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Client B token
    clientBToken = jwt.sign(
      {
        sub: 'client-b-test-user',
        role: 'client',
        client_id: CLIENT_B_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('DELETE /api/clients/:clientId/documents/:id - Soft Delete', () => {
    it('should soft-delete a document successfully', async () => {
      const mockDocument = {
        id: DOC_ID,
        client_id: CLIENT_A_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_A_ID}/documents/${DOC_ID}/test-doc.pdf`,
        deleted_at: null,
      };

      // Mock document fetch
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      // Mock update
      mockAdminSupabaseClient.update = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }));

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(204);
      expect(mockAdminSupabaseClient.update).toHaveBeenCalledWith({
        deleted_at: expect.any(String),
        deleted_by: 'client-a-test-user',
      });
    });

    it('should return 204 when deleting an already deleted document (idempotent)', async () => {
      const mockDocument = {
        id: DOC_ID,
        client_id: CLIENT_A_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_A_ID}/documents/${DOC_ID}/test-doc.pdf`,
        deleted_at: '2026-01-20T10:00:00Z',
      };

      // Mock document fetch - already deleted
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(204);
      // Update should not be called since document is already deleted
      expect(mockAdminSupabaseClient.update).not.toHaveBeenCalled();
    });

    it('should return 404 when document does not exist', async () => {
      // Mock document not found
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.details.message).toBe('Document not found');
    });

    it('should return 403 when client tries to delete another client\'s document', async () => {
      // Client A trying to delete Client B's document
      const res = await request(app)
        .delete(`/api/clients/${CLIENT_B_ID}/documents/${DOC_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('should allow admin to soft-delete any client\'s document', async () => {
      const mockDocument = {
        id: DOC_ID,
        client_id: CLIENT_B_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_B_ID}/documents/${DOC_ID}/test-doc.pdf`,
        deleted_at: null,
      };

      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      mockAdminSupabaseClient.update = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }));

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_B_ID}/documents/${DOC_ID}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(mockAdminSupabaseClient.update).toHaveBeenCalledWith({
        deleted_at: expect.any(String),
        deleted_by: 'admin-test-user',
      });
    });

    it('should return 422 when document ID is not a valid UUID', async () => {
      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/documents/invalid-uuid`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/clients/:clientId/documents/:id/purge - Hard Delete', () => {
    it('should purge a document successfully (admin only)', async () => {
      const mockDocument = {
        id: DOC_ID,
        client_id: CLIENT_A_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_A_ID}/documents/${DOC_ID}/test-doc.pdf`,
        preview_url: null,
      };

      // Mock document fetch
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      // Mock storage delete
      const mockStorageRemove = vi.fn(() => Promise.resolve({ data: {}, error: null }));
      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          remove: mockStorageRemove,
        })),
      };

      // Mock DB delete
      mockAdminSupabaseClient.delete = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }));

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/purge`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(mockStorageRemove).toHaveBeenCalledWith([mockDocument.storage_path]);
      expect(mockAdminSupabaseClient.delete).toHaveBeenCalled();
    });

    it('should return 403 when non-admin tries to purge', async () => {
      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/purge`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
      expect(res.body.details.message).toBe('Only admins can purge documents');
    });

    it('should return 404 when document does not exist', async () => {
      // Mock document not found
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/purge`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.details.message).toBe('Document not found');
    });

    it('should return 500 when DB delete fails after storage deletion', async () => {
      const mockDocument = {
        id: DOC_ID,
        client_id: CLIENT_A_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_A_ID}/documents/${DOC_ID}/test-doc.pdf`,
        preview_url: null,
      };

      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          remove: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      };

      // Mock DB delete failure
      mockAdminSupabaseClient.delete = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: { message: 'DB error' } })),
      }));

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/purge`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Failed to delete document from database');
    });

    it('should succeed even when storage deletion fails', async () => {
      const mockDocument = {
        id: DOC_ID,
        client_id: CLIENT_A_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_A_ID}/documents/${DOC_ID}/test-doc.pdf`,
        preview_url: null,
      };

      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      // Mock storage delete failure
      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          remove: vi.fn(() => Promise.resolve({ 
            data: null, 
            error: { message: 'Storage service unavailable' } 
          })),
        })),
      };

      // Mock DB delete success
      mockAdminSupabaseClient.delete = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }));

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/purge`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it('should return 422 when document ID is not a valid UUID', async () => {
      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/invalid-uuid/purge`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/clients/:clientId/documents - List excludes deleted', () => {
    it('should not return soft-deleted documents in list', async () => {
      const mockDocuments = [
        { 
          id: DOC_ID, 
          client_id: CLIENT_A_ID, 
          name: 'active-doc.pdf', 
          deleted_at: null,
          created_at: '2025-01-21T10:00:00Z' 
        },
      ];

      mockAdminSupabaseClient.select = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.eq = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.is = vi.fn((field: string, value: any) => {
        expect(field).toBe('deleted_at');
        expect(value).toBe(null);
        return mockAdminSupabaseClient;
      });
      mockAdminSupabaseClient.order = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.range = vi.fn(() =>
        Promise.resolve({
          data: mockDocuments,
          error: null,
          count: 1,
        })
      );

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('active-doc.pdf');
      expect(mockAdminSupabaseClient.is).toHaveBeenCalledWith('deleted_at', null);
    });
  });

  describe('GET /api/clients/:clientId/documents/:id/download - Excludes deleted', () => {
    it('should return 404 when trying to download a soft-deleted document', async () => {
      // Mock: document not found because it's deleted
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/download`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('should successfully download an active (non-deleted) document', async () => {
      const mockDocument = {
        id: DOC_ID,
        client_id: CLIENT_A_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_A_ID}/documents/${DOC_ID}/test-doc.pdf`,
        deleted_at: null,
        created_at: '2025-01-21T10:00:00Z',
      };

      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(() =>
            Promise.resolve({
              data: { signedUrl: 'https://storage.example.com/signed-url' },
              error: null,
            })
          ),
        })),
      };

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${DOC_ID}/download`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://storage.example.com/signed-url');
    });
  });
});
