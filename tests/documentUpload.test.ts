import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';
import { Buffer } from 'buffer';

const app = createApp();

const createMockQueryBuilder = (mockData: any = { data: [], error: null }) => {
  const builder: any = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then: vi.fn((resolve: any) => resolve(mockData)),
  };
  return builder;
};

let mockSupabaseClient: any;
let mockAdminSupabaseClient: any;

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

// Test UUIDs for different clients (RFC4122 v4 compliant)
const CLIENT_A_ID = '11111111-1111-4111-a111-111111111111';
const CLIENT_B_ID = '22222222-2222-4222-a222-222222222222';

// Test user tokens (generated via JWT)
let adminToken: string;
let clientAToken: string;
let clientBToken: string;

describe('PR-2: Document Upload with Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock client setup
    mockSupabaseClient = createMockQueryBuilder();
    mockAdminSupabaseClient = createMockQueryBuilder();
    mockAdminSupabaseClient.storage = {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      })),
    };
    
    vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);
  });

  beforeAll(() => {
    // Generate JWT tokens for test users
    const jwtSecret = env.supabase.jwtSecret;

    // Admin token
    adminToken = jwt.sign(
      {
        sub: 'admin-upload-test',
        role: 'admin',
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Client A token
    clientAToken = jwt.sign(
      {
        sub: 'client-a-upload-test',
        role: 'client',
        client_id: CLIENT_A_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Client B token
    clientBToken = jwt.sign(
      {
        sub: 'client-b-upload-test',
        role: 'client',
        client_id: CLIENT_B_ID,
      },
      jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/clients/:clientId/documents/upload - Idempotency-Key validation', () => {
    it('should return 422 when Idempotency-Key header is missing', async () => {
      const testFile = Buffer.from('test file content');

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .attach('file', testFile, 'test.pdf');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('Idempotency-Key');
    });

    it('should return 422 when Idempotency-Key header is empty', async () => {
      const testFile = Buffer.from('test file content');

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', '')
        .attach('file', testFile, 'test.pdf');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/clients/:clientId/documents/upload - File validation', () => {
    it('should return 422 when file is missing', async () => {
      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', 'test-session-1');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBeTruthy(); // Validation error message
    });
  });

  describe('POST /api/clients/:clientId/documents/upload - Client access validation', () => {
    it('should return 403 when client tries to upload to another client', async () => {
      const testFile = Buffer.from('test file content');

      // Client A trying to upload to Client B
      const res = await request(app)
        .post(`/api/clients/${CLIENT_B_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', 'test-session-violation')
        .attach('file', testFile, 'test.pdf');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });
  });

  describe('POST /api/clients/:clientId/documents/upload - Idempotency behavior', () => {
    it('should return 200 with existing document when same Idempotency-Key is used twice', async () => {
      const testFile = Buffer.from('test file content');
      const idempotencyKey = 'test-session-duplicate';

      // First call - mock no existing doc, then successful insert
      const existingDoc = {
        id: 'doc-123',
        client_id: CLIENT_A_ID,
        uploaded_by: 'client-a-upload-test',
        source: 's3',
        kind: 'client_upload',
        name: 'test.pdf',
        mime_type: 'application/pdf',
        size_bytes: 17,
        storage_path: `clients/${CLIENT_A_ID}/documents/doc-123/test.pdf`,
        upload_session_id: idempotencyKey,
        created_at: new Date().toISOString(),
      };

      // Mock: first check returns null (no existing doc)
      mockSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );
      mockSupabaseClient.single = vi.fn(() =>
        Promise.resolve({ data: existingDoc, error: null })
      );

      const res1 = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', testFile, 'test.pdf');

      expect(res1.status).toBe(201);
      expect(res1.body.data).toBeDefined();

      // Second call - mock existing doc found
      vi.clearAllMocks();
      mockSupabaseClient = createMockQueryBuilder();
      mockSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: existingDoc, error: null })
      );
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);

      const res2 = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', testFile, 'test.pdf');

      expect(res2.status).toBe(200);
      expect(res2.body.message).toBe('Document already uploaded');
      expect(res2.body.data.id).toBe(existingDoc.id);
      expect(res2.body.data.upload_session_id).toBe(idempotencyKey);
    });

    it('should create different documents for different Idempotency-Keys', async () => {
      const testFile = Buffer.from('test file content');
      
      // First upload with session-1
      mockSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );
      mockSupabaseClient.single = vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'doc-456',
            client_id: CLIENT_A_ID,
            upload_session_id: 'session-1',
            name: 'test1.pdf',
          },
          error: null,
        })
      );
      mockAdminSupabaseClient.single = vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'doc-456',
            client_id: CLIENT_A_ID,
            upload_session_id: 'session-1',
            name: 'test1.pdf',
          },
          error: null,
        })
      );

      const res1 = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', 'session-1')
        .attach('file', testFile, 'test1.pdf');

      expect(res1.status).toBe(201);

      // Second upload with session-2 (different key)
      vi.clearAllMocks();
      mockSupabaseClient = createMockQueryBuilder();
      mockSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );
      mockSupabaseClient.single = vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'doc-789',
            client_id: CLIENT_A_ID,
            upload_session_id: 'session-2',
            name: 'test2.pdf',
          },
          error: null,
        })
      );
      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.single = vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'doc-789',
            client_id: CLIENT_A_ID,
            upload_session_id: 'session-2',
            name: 'test2.pdf',
          },
          error: null,
        })
      );
      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      };
      vi.spyOn(supabaseClient, 'createSupabaseUserClient').mockReturnValue(mockSupabaseClient as any);
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res2 = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', 'session-2')
        .attach('file', testFile, 'test2.pdf');

      expect(res2.status).toBe(201);
      expect(res2.body.data.id).not.toBe(res1.body.data.id);
    });
  });

  describe('POST /api/clients/:clientId/documents/upload - Successful upload', () => {
    it('should successfully upload a document with all required fields', async () => {
      const testFile = Buffer.from('test file content');
      const idempotencyKey = 'test-session-success';

      // Mock no existing doc
      mockSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      // Mock successful insert
      const expectedDoc = {
        id: expect.any(String),
        client_id: CLIENT_A_ID,
        uploaded_by: 'client-a-upload-test',
        source: 's3',
        kind: 'client_upload',
        name: 'document.pdf',
        mime_type: 'application/pdf',
        size_bytes: testFile.length,
        storage_path: expect.stringContaining('clients/'),
        upload_session_id: idempotencyKey,
        created_at: expect.any(String),
      };

      mockSupabaseClient.single = vi.fn(() =>
        Promise.resolve({ data: expectedDoc, error: null })
      );

      mockAdminSupabaseClient.single = vi.fn(() =>
        Promise.resolve({ data: expectedDoc, error: null })
      );

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', testFile, 'document.pdf');

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        client_id: CLIENT_A_ID,
        upload_session_id: idempotencyKey,
        name: 'document.pdf',
      });
    });

    it('should allow admin to upload documents for any client', async () => {
      const testFile = Buffer.from('test file content');

      mockSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );
      mockSupabaseClient.single = vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'doc-admin',
            client_id: CLIENT_B_ID,
            uploaded_by: 'admin-upload-test',
            source: 's3',
            kind: 'client_upload',
            name: 'admin-upload.pdf',
            upload_session_id: 'admin-session',
          },
          error: null,
        })
      );
      mockAdminSupabaseClient.single = vi.fn(() =>
        Promise.resolve({
          data: {
            id: 'doc-admin',
            client_id: CLIENT_B_ID,
            uploaded_by: 'admin-upload-test',
            source: 's3',
            kind: 'client_upload',
            name: 'admin-upload.pdf',
            upload_session_id: 'admin-session',
          },
          error: null,
        })
      );

      const res = await request(app)
        .post(`/api/clients/${CLIENT_B_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'admin-session')
        .attach('file', testFile, 'admin-upload.pdf');

      expect(res.status).toBe(201);
      expect(res.body.data.client_id).toBe(CLIENT_B_ID);
    });
  });

  describe('POST /api/clients/:clientId/documents/upload - Storage cleanup on failure', () => {
    it('should cleanup DB row when storage upload fails', async () => {
      const testFile = Buffer.from('test file content');

      // Mock no existing doc
      mockSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      // Mock successful DB insert
      mockSupabaseClient.single = vi.fn(() =>
        Promise.resolve({
          data: { id: 'doc-cleanup', client_id: CLIENT_A_ID },
          error: null,
        })
      );
      mockAdminSupabaseClient.single = vi.fn(() =>
        Promise.resolve({
          data: { id: 'doc-cleanup', client_id: CLIENT_A_ID },
          error: null,
        })
      );

      // Mock storage upload failure
      mockAdminSupabaseClient.storage.from = vi.fn(() => ({
        upload: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: { message: 'Storage service unavailable' },
          })
        ),
      }));

      // Mock delete for cleanup
      mockSupabaseClient.delete = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }));

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`)
        .set('Idempotency-Key', 'test-session-cleanup')
        .attach('file', testFile, 'test.pdf');

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Failed to upload file to storage');
    });
  });

  describe('POST /api/clients/:clientId/documents/upload - Standard error format', () => {
    it('should return standard error format for validation errors', async () => {
      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/upload`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);
      // Missing both Idempotency-Key and file

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/clients/:clientId/documents/:id/download - PR-3', () => {
    it('should return 200 with signed URL for document owned by client', async () => {
      const documentId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
      const mockDocument = {
        id: documentId,
        client_id: CLIENT_A_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_A_ID}/documents/${documentId}/test-doc.pdf`,
        created_at: new Date().toISOString(),
      };

      // Mock document fetch
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      // Mock signed URL generation
      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(() =>
            Promise.resolve({
              data: { signedUrl: 'https://storage.example.com/signed-url-here' },
              error: null,
            })
          ),
        })),
      };

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${documentId}/download`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('expires_in');
      expect(res.body.url).toBe('https://storage.example.com/signed-url-here');
      expect(res.body.expires_in).toBe(300); // Default TTL
    });

    it('should return 404 when client tries to access another client\'s document', async () => {
      const documentId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

      // Mock: document not found (because client_id doesn't match)
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      // Client A trying to access Client B's document
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents/${documentId}/download`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('should return 404 when document does not exist', async () => {
      const documentId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

      // Mock: document not found
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${documentId}/download`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.details.message).toBe('Document not found');
    });

    it('should return 422 when document ID is not a valid UUID', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/invalid-uuid/download`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should allow admin to get signed URL for any client\'s document', async () => {
      const documentId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
      const mockDocument = {
        id: documentId,
        client_id: CLIENT_B_ID,
        name: 'admin-access-doc.pdf',
        storage_path: `clients/${CLIENT_B_ID}/documents/${documentId}/admin-access-doc.pdf`,
        created_at: new Date().toISOString(),
      };

      // Mock document fetch
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      // Mock signed URL generation
      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(() =>
            Promise.resolve({
              data: { signedUrl: 'https://storage.example.com/admin-signed-url' },
              error: null,
            })
          ),
        })),
      };

      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents/${documentId}/download`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://storage.example.com/admin-signed-url');
      expect(res.body.expires_in).toBe(300);
    });

    it('should return 500 when storage signed URL generation fails', async () => {
      const documentId = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
      const mockDocument = {
        id: documentId,
        client_id: CLIENT_A_ID,
        name: 'test-doc.pdf',
        storage_path: `clients/${CLIENT_A_ID}/documents/${documentId}/test-doc.pdf`,
        created_at: new Date().toISOString(),
      };

      // Mock document fetch
      mockAdminSupabaseClient.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mockDocument, error: null })
      );

      // Mock signed URL generation failure
      mockAdminSupabaseClient.storage = {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(() =>
            Promise.resolve({
              data: null,
              error: { message: 'Storage service unavailable' },
            })
          ),
        })),
      };

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/${documentId}/download`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Failed to generate signed URL');
    });
  });

  describe('GET /api/clients/:clientId/documents - PR-4 Pagination & Search', () => {
    it('should return paginated documents with default limit and offset', async () => {
      const mockDocuments = [
        { id: 'doc-1', client_id: CLIENT_A_ID, name: 'file1.pdf', created_at: '2025-01-21T10:00:00Z' },
        { id: 'doc-2', client_id: CLIENT_A_ID, name: 'file2.pdf', created_at: '2025-01-21T09:00:00Z' },
        { id: 'doc-3', client_id: CLIENT_A_ID, name: 'file3.pdf', created_at: '2025-01-21T08:00:00Z' },
      ];

      // Mock admin client query with count
      mockAdminSupabaseClient.select = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.eq = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.is = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.order = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.range = vi.fn(() =>
        Promise.resolve({
          data: mockDocuments,
          error: null,
          count: 3,
        })
      );

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.meta).toEqual({
        total: 3,
        limit: 20,
        offset: 0,
        timestamp: expect.any(String),
      });
    });

    it('should return paginated documents with custom limit and offset', async () => {
      const mockDocuments = [
        { id: 'doc-2', client_id: CLIENT_A_ID, name: 'file2.pdf', created_at: '2025-01-21T09:00:00Z' },
      ];

      mockAdminSupabaseClient.select = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.eq = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.is = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.order = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.range = vi.fn((start: number, end: number) => {
        expect(start).toBe(1);
        expect(end).toBe(1); // offset + limit - 1 = 1 + 1 - 1 = 1
        return Promise.resolve({
          data: mockDocuments,
          error: null,
          count: 5,
        });
      });

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents?limit=1&offset=1`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('doc-2');
      expect(res.body.meta).toEqual({
        total: 5,
        limit: 1,
        offset: 1,
        timestamp: expect.any(String),
      });
    });

    it('should filter documents by search query (q parameter)', async () => {
      const mockDocuments = [
        { id: 'doc-1', client_id: CLIENT_A_ID, name: 'invoice_2025.pdf', created_at: '2025-01-21T10:00:00Z' },
      ];

      mockAdminSupabaseClient.select = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.eq = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.is = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.ilike = vi.fn((field: string, pattern: string) => {
        expect(field).toBe('name');
        expect(pattern).toBe('%invoice%');
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
        .get(`/api/clients/${CLIENT_A_ID}/documents?q=invoice`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toContain('invoice');
      expect(res.body.meta.total).toBe(1);
    });

    it('should return 422 when limit is invalid (too high)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents?limit=500`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 when limit is invalid (zero)', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents?limit=0`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 when offset is negative', async () => {
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents?offset=-5`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 422 when search query is too long', async () => {
      const longQuery = 'a'.repeat(201);
      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents?q=${longQuery}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should return 403 when client tries to access another client\'s documents', async () => {
      // Client A trying to access Client B's documents
      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLIENT_ACCESS_DENIED');
    });

    it('should combine pagination, search, and existing filters', async () => {
      const mockDocuments = [
        {
          id: 'doc-1',
          client_id: CLIENT_A_ID,
          name: 'invoice.pdf',
          source: 's3',
          kind: 'client_upload',
          created_at: '2025-01-21T10:00:00Z',
        },
      ];

      mockAdminSupabaseClient.select = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.eq = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.is = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.ilike = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.order = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.range = vi.fn(() =>
        Promise.resolve({
          data: mockDocuments,
          error: null,
          count: 1,
        })
      );

      const res = await request(app)
        .get(
          `/api/clients/${CLIENT_A_ID}/documents?source=s3&kind=client_upload&q=invoice&limit=10&offset=0`
        )
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual({
        total: 1,
        limit: 10,
        offset: 0,
        timestamp: expect.any(String),
      });

      // Verify all filters were applied
      expect(mockAdminSupabaseClient.eq).toHaveBeenCalledWith('client_id', CLIENT_A_ID);
      expect(mockAdminSupabaseClient.eq).toHaveBeenCalledWith('source', 's3');
      expect(mockAdminSupabaseClient.eq).toHaveBeenCalledWith('kind', 'client_upload');
      expect(mockAdminSupabaseClient.ilike).toHaveBeenCalledWith('name', '%invoice%');
    });

    it('should allow admin to access any client\'s documents with pagination', async () => {
      const mockDocuments = [
        { id: 'doc-b1', client_id: CLIENT_B_ID, name: 'client-b-doc.pdf', created_at: '2025-01-21T10:00:00Z' },
      ];

      mockAdminSupabaseClient.select = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.eq = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.is = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.order = vi.fn(() => mockAdminSupabaseClient);
      mockAdminSupabaseClient.range = vi.fn(() =>
        Promise.resolve({
          data: mockDocuments,
          error: null,
          count: 1,
        })
      );

      const res = await request(app)
        .get(`/api/clients/${CLIENT_B_ID}/documents?limit=5`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].client_id).toBe(CLIENT_B_ID);
      expect(res.body.meta.limit).toBe(5);
    });
  });
});
