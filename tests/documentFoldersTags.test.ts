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
    in: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then: vi.fn((resolve: any) => resolve(mockData)),
  };
  return builder;
};

let mockAdminSupabaseClient: any;

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

const CLIENT_A_ID = '11111111-1111-4111-a111-111111111111';
const FOLDER_ID_1 = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const FOLDER_ID_2 = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const TAG_ID_1 = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const TAG_ID_2 = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const DOCUMENT_ID_1 = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';

let adminToken: string;

describe('PR-7: Document Folders and Tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAdminSupabaseClient = createMockQueryBuilder();
    vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);
  });

  beforeAll(() => {
    const jwtSecret = env.supabase.jwtSecret;

    adminToken = jwt.sign(
      {
        sub: 'admin-folders-test',
        role: 'admin',
      },
      jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/clients/:clientId/document-folders', () => {
    it('should list all folders for a client', async () => {
      const mockFolders = [
        { id: FOLDER_ID_1, client_id: CLIENT_A_ID, name: 'Folder A', created_at: new Date().toISOString() },
        { id: FOLDER_ID_2, client_id: CLIENT_A_ID, name: 'Folder B', created_at: new Date().toISOString() },
      ];

      mockAdminSupabaseClient = createMockQueryBuilder({ data: mockFolders, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(mockAdminSupabaseClient.from).toHaveBeenCalledWith('document_folders');
      expect(mockAdminSupabaseClient.eq).toHaveBeenCalledWith('client_id', CLIENT_A_ID);
      expect(mockAdminSupabaseClient.order).toHaveBeenCalledWith('name', { ascending: true });
    });

    it('should return empty array when no folders exist', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({ data: [], error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /api/clients/:clientId/document-folders', () => {
    it('should create a new folder', async () => {
      const newFolder = {
        id: FOLDER_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Tax Documents',
        created_at: new Date().toISOString(),
        created_by: 'admin-folders-test',
      };

      mockAdminSupabaseClient = createMockQueryBuilder({ data: newFolder, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Tax Documents' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'Tax Documents' });
      expect(mockAdminSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should return 422 when folder name already exists', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({ 
        data: null, 
        error: { code: '23505', message: 'duplicate key value' } 
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Duplicate Folder' });

      expect(res.status).toBe(422);
    });
  });

  describe('PATCH /api/clients/:clientId/document-folders/:id', () => {
    it('should rename a folder', async () => {
      const existingFolder = {
        id: FOLDER_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Old Name',
        created_at: new Date().toISOString(),
      };

      const updatedFolder = { ...existingFolder, name: 'New Name' };

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.maybeSingle = vi.fn()
        .mockResolvedValueOnce({ data: existingFolder, error: null })
        .mockResolvedValueOnce({ data: updatedFolder, error: null });
      mockAdminSupabaseClient.single = vi.fn().mockResolvedValue({ data: updatedFolder, error: null });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/document-folders/${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(mockAdminSupabaseClient.update).toHaveBeenCalled();
    });

    it('should return 404 when folder does not exist', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({ data: null, error: null });
      mockAdminSupabaseClient.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/document-folders/${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/clients/:clientId/document-folders/:id', () => {
    it('should delete an empty folder', async () => {
      const folder = {
        id: FOLDER_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Empty Folder',
      };

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.maybeSingle = vi.fn().mockResolvedValue({ data: folder, error: null });
      mockAdminSupabaseClient.then = vi.fn((resolve: any) => {
        resolve({ count: 0, error: null });
        return Promise.resolve({ count: 0, error: null });
      });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/document-folders/${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it('should return 409 when folder contains documents', async () => {
      const folder = {
        id: FOLDER_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Non-Empty Folder',
      };

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.maybeSingle = vi.fn().mockResolvedValue({ data: folder, error: null });
      mockAdminSupabaseClient.then = vi.fn((resolve: any) => {
        resolve({ count: 5, error: null });
        return Promise.resolve({ count: 5, error: null });
      });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/document-folders/${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/clients/:clientId/document-tags', () => {
    it('should list all tags for a client', async () => {
      const mockTags = [
        { id: TAG_ID_1, client_id: CLIENT_A_ID, name: 'Important', created_at: new Date().toISOString() },
        { id: TAG_ID_2, client_id: CLIENT_A_ID, name: 'Urgent', created_at: new Date().toISOString() },
      ];

      mockAdminSupabaseClient = createMockQueryBuilder({ data: mockTags, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/document-tags`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(mockAdminSupabaseClient.from).toHaveBeenCalledWith('document_tags');
    });
  });

  describe('POST /api/clients/:clientId/document-tags', () => {
    it('should create a new tag', async () => {
      const newTag = {
        id: TAG_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Confidential',
        created_at: new Date().toISOString(),
      };

      mockAdminSupabaseClient = createMockQueryBuilder({ data: newTag, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/document-tags`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Confidential' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'Confidential' });
    });

    it('should return 422 when tag name already exists', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({ 
        data: null, 
        error: { code: '23505', message: 'duplicate key value' } 
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/document-tags`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Duplicate Tag' });

      expect(res.status).toBe(422);
    });
  });

  describe('DELETE /api/clients/:clientId/document-tags/:id', () => {
    it('should delete a tag', async () => {
      const tag = {
        id: TAG_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Old Tag',
      };

      let callCount = 0;
      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.then = vi.fn((resolve: any) => {
        callCount++;
        if (callCount === 1) {
          // First call: fetch tag
          resolve({ data: tag, error: null });
        } else {
          // Second call: delete tag
          resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/document-tags/${TAG_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(mockAdminSupabaseClient.delete).toHaveBeenCalled();
    });

    it('should return 404 when tag does not exist', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder({ data: null, error: null });
      mockAdminSupabaseClient.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/document-tags/${TAG_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/clients/:clientId/documents/:id - Folder and Tag Assignment', () => {
    it('should assign a folder to a document', async () => {
      const document = {
        id: DOCUMENT_ID_1,
        client_id: CLIENT_A_ID,
        folder_id: null,
      };

      const folder = {
        id: FOLDER_ID_1,
      };

      let callCount = 0;
      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.then = vi.fn((resolve: any) => {
        callCount++;
        if (callCount === 1) {
          // First call: fetch document
          resolve({ data: document, error: null });
        } else if (callCount === 2) {
          // Second call: verify folder exists
          resolve({ data: folder, error: null });
        } else {
          // Third call: update document
          resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/${DOCUMENT_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ folder_id: FOLDER_ID_1 });

      expect(res.status).toBe(200);
      expect(mockAdminSupabaseClient.update).toHaveBeenCalled();
    });

    it('should assign tags to a document', async () => {
      const document = {
        id: DOCUMENT_ID_1,
        client_id: CLIENT_A_ID,
        folder_id: null,
      };

      const tags = [
        { id: TAG_ID_1 },
        { id: TAG_ID_2 },
      ];

      let callCount = 0;
      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.then = vi.fn((resolve: any) => {
        callCount++;
        if (callCount === 1) {
          // First call: fetch document
          resolve({ data: document, error: null });
        } else if (callCount === 2) {
          // Second call: verify tags exist
          resolve({ data: tags, error: null });
        } else if (callCount === 3) {
          // Third call: delete existing tag links
          resolve({ data: null, error: null });
        } else {
          // Fourth call: insert new tag links
          resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/${DOCUMENT_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tag_ids: [TAG_ID_1, TAG_ID_2] });

      expect(res.status).toBe(200);
      expect(mockAdminSupabaseClient.delete).toHaveBeenCalled();
      expect(mockAdminSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should return 404 when document does not exist', async () => {
      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.then = vi.fn((resolve: any) => {
        resolve({ data: null, error: null });
        return Promise.resolve({ data: null, error: null });
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/${DOCUMENT_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ folder_id: FOLDER_ID_1 });

      expect(res.status).toBe(404);
    });

    it('should return 422 when folder does not exist', async () => {
      const document = {
        id: DOCUMENT_ID_1,
        client_id: CLIENT_A_ID,
        folder_id: null,
      };

      mockAdminSupabaseClient = createMockQueryBuilder({ data: null, error: null });
      mockAdminSupabaseClient.maybeSingle = vi.fn()
        .mockResolvedValueOnce({ data: document, error: null })
        .mockResolvedValueOnce({ data: null, error: null });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/${DOCUMENT_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ folder_id: FOLDER_ID_1 });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/clients/:clientId/documents - Filtering', () => {
    it('should filter documents by folder_id', async () => {
      const mockDocuments = [
        { id: DOCUMENT_ID_1, client_id: CLIENT_A_ID, folder_id: FOLDER_ID_1, name: 'Doc1.pdf' },
      ];

      mockAdminSupabaseClient = createMockQueryBuilder({ data: mockDocuments, error: null, count: 1 });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents?folder_id=${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(mockAdminSupabaseClient.eq).toHaveBeenCalledWith('folder_id', FOLDER_ID_1);
    });

    it('should filter documents by tag_id', async () => {
      const mockTagLinks = [
        { document_id: DOCUMENT_ID_1 },
      ];

      const mockDocuments = [
        { id: DOCUMENT_ID_1, client_id: CLIENT_A_ID, name: 'Tagged Doc.pdf' },
      ];

      mockAdminSupabaseClient = createMockQueryBuilder();
      mockAdminSupabaseClient.then = vi.fn((resolve: any) => {
        const callStack = mockAdminSupabaseClient.from.mock.calls;
        const lastCall = callStack[callStack.length - 1];
        
        if (lastCall && lastCall[0] === 'document_tag_links') {
          resolve({ data: mockTagLinks, error: null });
        } else {
          resolve({ data: mockDocuments, error: null, count: 1 });
        }
        return Promise.resolve({ data: mockDocuments, error: null, count: 1 });
      });
      
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockAdminSupabaseClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents?tag_id=${TAG_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });
});
