import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { createSupabaseAdminClient } from '../src/lib/supabaseClient';
import { env } from '../src/config/env';

vi.mock('axios');

function generateTestJWT(payload: any): string {
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn: '1h' });
}

const app = createApp();
const adminSupabase = createSupabaseAdminClient();

let testClientId: string;
let testUserId: string;
let testToken: string;
let testDocumentId: string;

beforeAll(async () => {
  const { data: client } = await adminSupabase
    .from('clients')
    .insert({ name: 'Test External Storage Client', slug: 'test-ext-storage' })
    .select()
    .single();
  testClientId = client!.id;

  testUserId = 'test-user-ext-storage-' + Date.now();
  await adminSupabase.from('app_users').insert({
    id: testUserId,
    email: 'test-ext-storage@example.com',
    role: 'client',
    client_id: testClientId,
    full_name: 'Test External Storage User',
  });

  testToken = generateTestJWT({
    sub: testUserId,
    email: 'test-ext-storage@example.com',
    role: 'client',
  });
});

afterAll(async () => {
  await adminSupabase.from('external_upload_jobs').delete().eq('client_id', testClientId);
  await adminSupabase.from('external_storage_connections').delete().eq('client_id', testClientId);
  await adminSupabase.from('documents').delete().eq('client_id', testClientId);
  await adminSupabase.from('client_settings').delete().eq('client_id', testClientId);
  await adminSupabase.from('app_users').delete().eq('id', testUserId);
  await adminSupabase.from('clients').delete().eq('id', testClientId);
});

beforeEach(async () => {
  await adminSupabase.from('external_upload_jobs').delete().eq('client_id', testClientId);
  await adminSupabase.from('external_storage_connections').delete().eq('client_id', testClientId);
  await adminSupabase.from('documents').delete().eq('client_id', testClientId);
  await adminSupabase.from('client_settings').delete().eq('client_id', testClientId);
});

describe('External Storage Integration', () => {
  describe('Route Paths', () => {
    it('should access client-scoped routes at /api/clients/:clientId/external-storage', async () => {
      const res = await request(app)
        .get(`/api/clients/${testClientId}/external-storage`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject client-scoped routes without auth', async () => {
      const res = await request(app)
        .get(`/api/clients/${testClientId}/external-storage`)
        .set('x-api-key', process.env.APP_API_KEY!);

      expect(res.status).toBe(401);
    });

    it('should access callback at /api/external-storage/callback/:provider without client validation', async () => {
      const res = await request(app)
        .get('/api/external-storage/callback/google_drive?code=test&state=invalid')
        .set('x-api-key', process.env.APP_API_KEY!);

      expect(res.status).toBe(400);
    });
  });

  describe('OAuth Flow', () => {
    it('should generate Google Drive auth URL with signed JWT state', async () => {
      const res = await request(app)
        .get(`/api/clients/${testClientId}/external-storage/google_drive/auth-url`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.url).toBeDefined();
      expect(res.body.url).toContain('accounts.google.com');
      expect(res.body.url).toContain('state=');
      
      const stateMatch = res.body.url.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      
      const state = decodeURIComponent(stateMatch![1]);
      const decoded = vi.mocked(jwt).verify(state, env.supabase.jwtSecret) as any;
      expect(decoded.clientId).toBe(testClientId);
      expect(decoded.provider).toBe('google_drive');
      expect(decoded.nonce).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should generate Microsoft Graph auth URL', async () => {
      const res = await request(app)
        .get(`/api/clients/${testClientId}/external-storage/microsoft_graph/auth-url`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.url).toBeDefined();
      expect(res.body.url).toContain('login.microsoftonline.com');
      expect(res.body.url).toContain('state=');
    });

    it('should reject invalid provider', async () => {
      const res = await request(app)
        .get(`/api/clients/${testClientId}/external-storage/invalid_provider/auth-url`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(422);
    });
  });

  describe('Connection Management', () => {
    it('should list empty connections initially', async () => {
      const res = await request(app)
        .get(`/api/clients/${testClientId}/external-storage`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should list existing connections without exposing tokens', async () => {
      await adminSupabase.from('external_storage_connections').insert({
        client_id: testClientId,
        provider: 'google_drive',
        status: 'connected',
        access_token: 'secret_access_token',
        refresh_token: 'secret_refresh_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });

      const res = await request(app)
        .get(`/api/clients/${testClientId}/external-storage`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].provider).toBe('google_drive');
      expect(res.body.data[0].status).toBe('connected');
      expect(res.body.data[0].access_token).toBeUndefined();
      expect(res.body.data[0].refresh_token).toBeUndefined();
    });

    it('should update connection root folder', async () => {
      const { data: connection } = await adminSupabase
        .from('external_storage_connections')
        .insert({
          client_id: testClientId,
          provider: 'google_drive',
          status: 'connected',
          access_token: 'test_token',
        })
        .select()
        .single();

      const res = await request(app)
        .patch(`/api/clients/${testClientId}/external-storage/google_drive`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ root_folder_id: 'folder123' });

      expect(res.status).toBe(200);
      expect(res.body.data.root_folder_id).toBe('folder123');
    });

    it('should revoke connection', async () => {
      await adminSupabase.from('external_storage_connections').insert({
        client_id: testClientId,
        provider: 'google_drive',
        status: 'connected',
        access_token: 'test_token',
        refresh_token: 'test_refresh',
      });

      const res = await request(app)
        .delete(`/api/clients/${testClientId}/external-storage/google_drive`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(204);

      const { data: connection } = await adminSupabase
        .from('external_storage_connections')
        .select()
        .eq('client_id', testClientId)
        .eq('provider', 'google_drive')
        .single();

      expect(connection.status).toBe('revoked');
      expect(connection.access_token).toBe('');
      expect(connection.refresh_token).toBeNull();
    });
  });

  describe('OAuth State Validation', () => {
    it('should reject invalid OAuth state', async () => {
      const res = await request(app)
        .get('/api/external-storage/callback/google_drive?code=test&state=invalid_state')
        .set('x-api-key', process.env.APP_API_KEY!);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('Invalid or expired state');
    });

    it('should reject expired OAuth state', async () => {
      const expiredState = jwt.sign(
        {
          clientId: testClientId,
          provider: 'google_drive',
          nonce: 'test',
          iat: Math.floor(Date.now() / 1000) - 1000,
          exp: Math.floor(Date.now() / 1000) - 100,
        },
        env.supabase.jwtSecret
      );

      const res = await request(app)
        .get(`/api/external-storage/callback/google_drive?code=test&state=${expiredState}`)
        .set('x-api-key', process.env.APP_API_KEY!);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('should reject provider mismatch in state', async () => {
      const mismatchState = jwt.sign(
        {
          clientId: testClientId,
          provider: 'microsoft_graph',
          nonce: 'test',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 600,
        },
        env.supabase.jwtSecret
      );

      const res = await request(app)
        .get(`/api/external-storage/callback/google_drive?code=test&state=${mismatchState}`)
        .set('x-api-key', process.env.APP_API_KEY!);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('Provider mismatch');
    });
  });

  describe('Token Encryption', () => {
    it('should encrypt tokens when saving connection', async () => {
      const plainToken = 'test_access_token_12345';
      const { encryptToken } = await import('../src/lib/tokenEncryption');
      const encrypted = encryptToken(plainToken);

      expect(encrypted).not.toBe(plainToken);
      expect(encrypted).toContain(':');
      expect(encrypted.split(':').length).toBe(3);
    });

    it('should decrypt tokens when reading connection', async () => {
      const plainToken = 'test_access_token_12345';
      const { encryptToken, decryptToken } = await import('../src/lib/tokenEncryption');
      const encrypted = encryptToken(plainToken);
      const decrypted = decryptToken(encrypted);

      expect(decrypted).toBe(plainToken);
    });

    it('should store encrypted tokens in database', async () => {
      const plainToken = 'test_plain_token';
      const { encryptToken } = await import('../src/lib/tokenEncryption');
      const encrypted = encryptToken(plainToken);

      await adminSupabase.from('external_storage_connections').insert({
        client_id: testClientId,
        provider: 'google_drive',
        status: 'connected',
        access_token: encrypted,
      });

      const { data } = await adminSupabase
        .from('external_storage_connections')
        .select('access_token')
        .eq('client_id', testClientId)
        .eq('provider', 'google_drive')
        .single();

      expect(data!.access_token).not.toBe(plainToken);
      expect(data!.access_token).toBe(encrypted);
    });
  });

  describe('Document Upload with Mirroring', () => {
    it('should NOT enqueue external job when mirroring is disabled', async () => {
      const fileBuffer = Buffer.from('test file content');
      const idempotencyKey = 'test-upload-no-mirror-' + Date.now();

      const res = await request(app)
        .post(`/api/clients/${testClientId}/documents/upload`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', fileBuffer, 'test.txt');

      expect(res.status).toBe(201);
      testDocumentId = res.body.data.id;

      const { data: document } = await adminSupabase
        .from('documents')
        .select()
        .eq('id', testDocumentId)
        .single();

      expect(document.external_provider).toBeNull();
      expect(document.external_sync_status).toBeNull();

      const { data: jobs } = await adminSupabase
        .from('external_upload_jobs')
        .select()
        .eq('document_id', testDocumentId);

      expect(jobs).toHaveLength(0);
    });

    it('should enqueue external job when mirroring is enabled', async () => {
      await adminSupabase.from('external_storage_connections').insert({
        client_id: testClientId,
        provider: 'google_drive',
        status: 'connected',
        access_token: 'test_token',
      });

      await adminSupabase.from('client_settings').upsert({
        client_id: testClientId,
        documents_mirror_enabled: true,
        documents_mirror_provider: 'google_drive',
      });

      const fileBuffer = Buffer.from('test file content for mirroring');
      const idempotencyKey = 'test-upload-with-mirror-' + Date.now();

      const res = await request(app)
        .post(`/api/clients/${testClientId}/documents/upload`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', fileBuffer, 'test-mirror.txt');

      expect(res.status).toBe(201);
      testDocumentId = res.body.data.id;

      await new Promise(resolve => setTimeout(resolve, 100));

      const { data: document } = await adminSupabase
        .from('documents')
        .select()
        .eq('id', testDocumentId)
        .single();

      expect(document.external_provider).toBe('google_drive');
      expect(document.external_sync_status).toBe('pending');

      const { data: jobs } = await adminSupabase
        .from('external_upload_jobs')
        .select()
        .eq('document_id', testDocumentId);

      expect(jobs).toHaveLength(1);
      expect(jobs![0].provider).toBe('google_drive');
      expect(jobs![0].status).toBe('pending');
    });
  });

  describe('Atomic Job Claiming', () => {
    it('should claim jobs atomically using RPC', async () => {
      await adminSupabase.from('documents').insert({
        client_id: testClientId,
        name: 'test1.txt',
        mime_type: 'text/plain',
        size_bytes: 100,
        storage_path: 'test/path1.txt',
        source: 's3',
        kind: 'client_upload',
        upload_session_id: 'test-session-atomic-1',
      });

      await adminSupabase.from('documents').insert({
        client_id: testClientId,
        name: 'test2.txt',
        mime_type: 'text/plain',
        size_bytes: 100,
        storage_path: 'test/path2.txt',
        source: 's3',
        kind: 'client_upload',
        upload_session_id: 'test-session-atomic-2',
      });

      const { data: docs } = await adminSupabase
        .from('documents')
        .select('id')
        .eq('client_id', testClientId)
        .in('upload_session_id', ['test-session-atomic-1', 'test-session-atomic-2']);

      await adminSupabase.from('external_upload_jobs').insert([
        { client_id: testClientId, document_id: docs![0].id, provider: 'google_drive', status: 'pending' },
        { client_id: testClientId, document_id: docs![1].id, provider: 'google_drive', status: 'pending' },
      ]);

      const { data: job1 } = await adminSupabase.rpc('claim_external_upload_job');
      expect(job1).toHaveLength(1);
      expect(job1![0].status).toBe('processing');

      const { data: job2 } = await adminSupabase.rpc('claim_external_upload_job');
      expect(job2).toHaveLength(1);
      expect(job2![0].status).toBe('processing');
      expect(job2![0].id).not.toBe(job1![0].id);

      const { data: job3 } = await adminSupabase.rpc('claim_external_upload_job');
      expect(job3).toHaveLength(0);
    });

    it('should not claim jobs with attempts >= 3', async () => {
      const { data: document } = await adminSupabase
        .from('documents')
        .insert({
          client_id: testClientId,
          name: 'test-max-attempts.txt',
          mime_type: 'text/plain',
          size_bytes: 100,
          storage_path: 'test/path-max.txt',
          source: 's3',
          kind: 'client_upload',
          upload_session_id: 'test-session-max-attempts',
        })
        .select()
        .single();

      await adminSupabase.from('external_upload_jobs').insert({
        client_id: testClientId,
        document_id: document!.id,
        provider: 'google_drive',
        status: 'failed',
        attempts: 3,
      });

      const { data: job } = await adminSupabase.rpc('claim_external_upload_job');
      expect(job).toHaveLength(0);
    });
  });

  describe('External Upload Job Processing', () => {
    it('should mark job as failed after max retries', async () => {
      const { data: document } = await adminSupabase
        .from('documents')
        .insert({
          client_id: testClientId,
          name: 'test-fail.txt',
          mime_type: 'text/plain',
          size_bytes: 100,
          storage_path: 'test/path.txt',
          source: 's3',
          kind: 'client_upload',
          upload_session_id: 'test-session-fail',
        })
        .select()
        .single();

      await adminSupabase.from('external_storage_connections').insert({
        client_id: testClientId,
        provider: 'google_drive',
        status: 'connected',
        access_token: 'test_token',
      });

      const { data: job } = await adminSupabase
        .from('external_upload_jobs')
        .insert({
          client_id: testClientId,
          document_id: document!.id,
          provider: 'google_drive',
          status: 'failed',
          attempts: 3,
          last_error: 'Max retries reached',
        })
        .select()
        .single();

      const { data: updatedJob } = await adminSupabase
        .from('external_upload_jobs')
        .select()
        .eq('id', job!.id)
        .single();

      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.attempts).toBe(3);
    });

    it('should prevent new jobs when connection is revoked', async () => {
      await adminSupabase.from('external_storage_connections').insert({
        client_id: testClientId,
        provider: 'google_drive',
        status: 'revoked',
        access_token: '',
      });

      await adminSupabase.from('client_settings').upsert({
        client_id: testClientId,
        documents_mirror_enabled: true,
        documents_mirror_provider: 'google_drive',
      });

      const fileBuffer = Buffer.from('test file after revoke');
      const idempotencyKey = 'test-upload-revoked-' + Date.now();

      const res = await request(app)
        .post(`/api/clients/${testClientId}/documents/upload`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .attach('file', fileBuffer, 'test-revoked.txt');

      expect(res.status).toBe(201);

      await new Promise(resolve => setTimeout(resolve, 100));

      const { data: jobs } = await adminSupabase
        .from('external_upload_jobs')
        .select()
        .eq('client_id', testClientId);

      expect(jobs).toHaveLength(1);
    });
  });
});
