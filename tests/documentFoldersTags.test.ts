import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import * as supabaseClient from '../src/lib/supabaseClient';
import { createScriptedSupabaseClient } from './utils/scriptedSupabaseMock';

const app = createApp();

const MOCK_API_KEY = process.env.APP_API_KEY || 'test-api-key';

const CLIENT_A_ID = '11111111-1111-4111-a111-111111111111';
const FOLDER_ID_1 = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const FOLDER_ID_2 = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const TAG_ID_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TAG_ID_2 = 'dddddddd-dddd-4ddd-9ddd-dddddddddddd';
const DOCUMENT_ID_1 = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';

let adminToken: string;

describe('PR-7: Document Folders and Tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('GET /api/clients/:clientId/documents/document-folders', () => {
    it('should list all folders for a client', async () => {
      const mockFolders = [
        { id: FOLDER_ID_1, client_id: CLIENT_A_ID, name: 'Folder A', created_at: new Date().toISOString() },
        { id: FOLDER_ID_2, client_id: CLIENT_A_ID, name: 'Folder B', created_at: new Date().toISOString() },
      ];

      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: mockFolders, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return empty array when no folders exist', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: [], error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /api/clients/:clientId/documents/document-folders', () => {
    it('should create a new folder', async () => {
      const newFolder = {
        id: FOLDER_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Tax Documents',
        created_at: new Date().toISOString(),
        created_by: 'admin-folders-test',
      };

      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: newFolder, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Tax Documents' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'Tax Documents' });
    });

    it('should return 422 when folder name already exists', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: null, error: { code: '23505', message: 'duplicate key value' } },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/document-folders`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Duplicate Folder' });

      expect(res.status).toBe(422);
    });
  });

  describe('PATCH /api/clients/:clientId/documents/document-folders/:id', () => {
    it('should rename a folder', async () => {
      const existingFolder = {
        id: FOLDER_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Old Name',
        created_at: new Date().toISOString(),
      };

      const updatedFolder = { ...existingFolder, name: 'New Name' };

      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: existingFolder, error: null },
          { data: updatedFolder, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/document-folders/${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New Name');
    });

    it('should return 404 when folder does not exist', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: null, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/document-folders/${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/clients/:clientId/documents/document-folders/:id', () => {
    it('should delete an empty folder', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: { id: FOLDER_ID_1, client_id: CLIENT_A_ID }, error: null }, // Check folder exists
          { data: null, error: null }, // Delete folder
        ],
        documents: [
          { data: [], error: null, count: 0 }, // Count documents in folder
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/documents/document-folders/${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it('should return 409 when folder contains documents', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_folders: [
          { data: { id: FOLDER_ID_1, client_id: CLIENT_A_ID }, error: null }, // Check folder exists
        ],
        documents: [
          { data: [], error: null, count: 1 }, // Count documents in folder (has 1 doc)
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/documents/document-folders/${FOLDER_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/clients/:clientId/documents/document-tags', () => {
    it('should list all tags for a client', async () => {
      const mockTags = [
        { id: TAG_ID_1, client_id: CLIENT_A_ID, name: 'Important', created_at: new Date().toISOString() },
        { id: TAG_ID_2, client_id: CLIENT_A_ID, name: 'Urgent', created_at: new Date().toISOString() },
      ];

      const mockClient = createScriptedSupabaseClient({
        document_tags: [
          { data: mockTags, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents/document-tags`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/clients/:clientId/documents/document-tags', () => {
    it('should create a new tag', async () => {
      const newTag = {
        id: TAG_ID_1,
        client_id: CLIENT_A_ID,
        name: 'Important',
        created_at: new Date().toISOString(),
        created_by: 'admin-folders-test',
      };

      const mockClient = createScriptedSupabaseClient({
        document_tags: [
          { data: newTag, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/document-tags`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Important' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'Important' });
    });

    it('should return 422 when tag name already exists', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_tags: [
          { data: null, error: { code: '23505', message: 'duplicate key value' } },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .post(`/api/clients/${CLIENT_A_ID}/documents/document-tags`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Duplicate Tag' });

      expect(res.status).toBe(422);
    });
  });

  describe('DELETE /api/clients/:clientId/documents/document-tags/:id', () => {
    it('should delete a tag', async () => {
      const mockClient = createScriptedSupabaseClient({
        document_tags: [
          { data: { id: TAG_ID_1, client_id: CLIENT_A_ID }, error: null }, // Check tag exists
          { data: null, error: null }, // Delete tag
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .delete(`/api/clients/${CLIENT_A_ID}/documents/document-tags/${TAG_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });
  });

  describe('PATCH /api/clients/:clientId/documents/:id - Folder and Tag Assignment', () => {
    it('should assign a folder to a document', async () => {
      const mockClient = createScriptedSupabaseClient({
        documents: [
          { data: { id: DOCUMENT_ID_1, client_id: CLIENT_A_ID }, error: null },
          { data: { id: DOCUMENT_ID_1, folder_id: FOLDER_ID_1 }, error: null },
        ],
        document_folders: [
          { data: { id: FOLDER_ID_1, client_id: CLIENT_A_ID }, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/${DOCUMENT_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ folder_id: FOLDER_ID_1 });

      expect(res.status).toBe(200);
    });

    it('should assign tags to a document', async () => {
      const mockClient = createScriptedSupabaseClient({
        documents: [
          { data: { id: DOCUMENT_ID_1, client_id: CLIENT_A_ID }, error: null },
        ],
        document_tags: [
          { data: [{ id: TAG_ID_1 }, { id: TAG_ID_2 }], error: null },
        ],
        document_tag_links: [
          { data: null, error: null },
          { data: [{ document_id: DOCUMENT_ID_1, tag_id: TAG_ID_1 }], error: null },
        ],
        documents: [
          { data: { id: DOCUMENT_ID_1, tags: [TAG_ID_1, TAG_ID_2] }, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/${DOCUMENT_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tag_ids: [TAG_ID_1, TAG_ID_2] });

      expect(res.status).toBe(200);
    });

    it('should return 404 when document does not exist', async () => {
      const mockClient = createScriptedSupabaseClient({
        documents: [
          { data: null, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .patch(`/api/clients/${CLIENT_A_ID}/documents/${DOCUMENT_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ folder_id: FOLDER_ID_1 });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/clients/:clientId/documents - Filtering', () => {
    it('should filter documents by tag_id', async () => {
      const mockDocs = [
        { id: DOCUMENT_ID_1, name: 'Doc with tag', client_id: CLIENT_A_ID },
      ];

      const mockClient = createScriptedSupabaseClient({
        documents: [
          { data: mockDocs, error: null },
        ],
      });
      vi.spyOn(supabaseClient, 'createSupabaseAdminClient').mockReturnValue(mockClient as any);

      const res = await request(app)
        .get(`/api/clients/${CLIENT_A_ID}/documents?tag_id=${TAG_ID_1}`)
        .set('x-api-key', MOCK_API_KEY)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });
});
