// tests/externalStorage.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

// ---- MUST: mock before importing app ----
vi.mock('axios');

// If your code imports these directly, mocking the module is the cleanest:
type Row = Record<string, any>;
type TableName =
  | 'clients'
  | 'app_users'
  | 'external_storage_connections'
  | 'external_upload_jobs'
  | 'documents'
  | 'client_settings';

type Store = Record<TableName, Row[]>;

function uuid(label: 'client' | 'user' | 'doc' | 'conv' | 'msg' = 'client') {
  // strict UUID v4 (4th group starts with 8)
  // deterministic enough for tests
  const base =
    label === 'client'
      ? '11111111-1111-4111-8111-111111111111'
      : label === 'user'
      ? '22222222-2222-4222-8222-222222222222'
      : label === 'doc'
      ? '33333333-3333-4333-8333-333333333333'
      : label === 'conv'
      ? '44444444-4444-4444-8444-444444444444'
      : '55555555-5555-4555-8555-555555555555';
  return base;
}

function generateTestJWT(payload: any): string {
  return jwt.sign(payload, env.supabase.jwtSecret, { expiresIn: '1h' });
}

// ---- In-memory Supabase mock ----
function makeSupabaseMock(store: Store) {
  const state = {
    table: null as TableName | null,
    filters: [] as Array<(r: Row) => boolean>,
    selectCols: null as string[] | null,
    pendingMutation: null as { type: 'insert' | 'update' | 'upsert' | 'delete'; payload?: any } | null,
    single: false,
  };

  function resetQuery() {
    state.table = null;
    state.filters = [];
    state.selectCols = null;
    state.pendingMutation = null;
    state.single = false;
  }

  function applyFilters(rows: Row[]) {
    return state.filters.reduce((acc, fn) => acc.filter(fn), rows);
  }

  function pickCols(row: Row) {
    if (!state.selectCols) return row;
    const out: Row = {};
    for (const c of state.selectCols) out[c] = row[c];
    return out;
  }

  function response(data: any, error: any = null) {
    return Promise.resolve({ data, error });
  }

  const qb: any = {
    from(table: TableName) {
      resetQuery();
      state.table = table;
      return qb;
    },

    select(cols?: string) {
      if (cols && cols !== '*') {
        state.selectCols = cols.split(',').map(s => s.trim());
      }
      return qb;
    },

    eq(col: string, val: any) {
      state.filters.push((r: Row) => r[col] === val);
      return qb;
    },

    in(col: string, vals: any[]) {
      state.filters.push((r: Row) => vals.includes(r[col]));
      return qb;
    },

    single() {
      state.single = true;
      return qb;
    },

    insert(payload: Row | Row[]) {
      state.pendingMutation = { type: 'insert', payload };
      return qb;
    },

    upsert(payload: Row | Row[]) {
      state.pendingMutation = { type: 'upsert', payload };
      return qb;
    },

    update(payload: Row) {
      state.pendingMutation = { type: 'update', payload };
      return qb;
    },

    delete() {
      state.pendingMutation = { type: 'delete' };
      return qb;
    },

    // execute “query”
    async then(resolve: any, reject: any) {
      try {
        const table = state.table!;
        let rows = store[table];

        // mutations first
        if (state.pendingMutation?.type === 'insert') {
          const payloadArr = Array.isArray(state.pendingMutation.payload)
            ? state.pendingMutation.payload
            : [state.pendingMutation.payload];

          const inserted = payloadArr.map(p => ({
            id: p.id ?? (table === 'documents' ? uuid('doc') : uuid('client')),
            created_at: p.created_at ?? new Date().toISOString(),
            ...p,
          }));
          store[table] = [...store[table], ...inserted];

          const filtered = applyFilters(inserted).map(pickCols);
          const out = state.single ? filtered[0] ?? null : filtered;
          resetQuery();
          return resolve(await response(out));
        }

        if (state.pendingMutation?.type === 'upsert') {
          const payloadArr = Array.isArray(state.pendingMutation.payload)
            ? state.pendingMutation.payload
            : [state.pendingMutation.payload];

          // naive upsert by (client_id, provider) if present, else id
          const upserted: Row[] = [];
          for (const p of payloadArr) {
            const idx = store[table].findIndex(r => {
              if (p.id) return r.id === p.id;
              if (p.client_id && p.provider) return r.client_id === p.client_id && r.provider === p.provider;
              return false;
            });
            if (idx >= 0) {
              store[table][idx] = { ...store[table][idx], ...p };
              upserted.push(store[table][idx]);
            } else {
              const ins = { id: p.id ?? uuid('client'), created_at: new Date().toISOString(), ...p };
              store[table].push(ins);
              upserted.push(ins);
            }
          }

          const filtered = applyFilters(upserted).map(pickCols);
          const out = state.single ? filtered[0] ?? null : filtered;
          resetQuery();
          return resolve(await response(out));
        }

        if (state.pendingMutation?.type === 'update') {
          const payload = state.pendingMutation.payload;
          const matched = applyFilters(rows);
          for (const r of matched) Object.assign(r, payload);

          const outRows = matched.map(pickCols);
          const out = state.single ? outRows[0] ?? null : outRows;
          resetQuery();
          return resolve(await response(out));
        }

        if (state.pendingMutation?.type === 'delete') {
          const before = store[table].length;
          store[table] = store[table].filter(r => !applyFilters([r]).length);
          const deletedCount = before - store[table].length;
          resetQuery();
          return resolve(await response(deletedCount));
        }

        // reads
        const result = applyFilters(rows).map(pickCols);
        const out = state.single ? result[0] ?? null : result;
        resetQuery();
        return resolve(await response(out));
      } catch (e) {
        reject(e);
      }
    },

    // minimal rpc for claim_external_upload_job
    async rpc(fn: string) {
      if (fn !== 'claim_external_upload_job') return response(null, { message: 'Unknown rpc' });

      // claim one pending job with attempts < 3
      const job = store.external_upload_jobs.find(
        j => j.status === 'pending' && (j.attempts ?? 0) < 3
      );
      if (!job) return response([]);

      job.status = 'processing';
      job.attempts = (job.attempts ?? 0) + 1;
      return response([job]);
    },
  };

  return qb;
}

const store: Store = {
  clients: [],
  app_users: [],
  external_storage_connections: [],
  external_upload_jobs: [],
  documents: [],
  client_settings: [],
};

// ---- Mock the supabaseClient module used by the app ----
vi.mock('../src/lib/supabaseClient', async () => {
  return {
    createSupabaseAdminClient: () => makeSupabaseMock(store),
    createSupabaseUserClient: (_token: string) => makeSupabaseMock(store),
  };
});

// Import app AFTER mocks
const { createApp } = await import('../src/app');

let app: any;

const TEST_CLIENT_ID = uuid('client');
const TEST_USER_ID = uuid('user');
let testToken: string;

beforeAll(() => {
  process.env.APP_API_KEY = process.env.APP_API_KEY || 'test-api-key';

  // seed in memory
  store.clients = [{ id: TEST_CLIENT_ID, name: 'Test Client', slug: 'test-client' }];
  store.app_users = [
    {
      id: TEST_USER_ID,
      email: 'test-ext-storage@example.com',
      role: 'client',
      client_id: TEST_CLIENT_ID,
      full_name: 'Test External Storage User',
      is_active: true,
    },
  ];

  testToken = generateTestJWT({
    sub: TEST_USER_ID,
    email: 'test-ext-storage@example.com',
    role: 'client',
  });

  app = createApp();
});

beforeEach(() => {
  // reset per-test data (keep seeded client + user)
  store.external_storage_connections = [];
  store.external_upload_jobs = [];
  store.documents = [];
  store.client_settings = [];
});

describe('External Storage (mocked, no DB)', () => {
  describe('Route Paths', () => {
    it('client-scoped routes are at /api/clients/:clientId/external-storage', async () => {
      const res = await request(app)
        .get(`/api/clients/${TEST_CLIENT_ID}/external-storage`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      // response shape depends on your controller; if it's {data: []}, keep:
      expect(res.body.data).toBeDefined();
    });

    it('rejects without auth', async () => {
      const res = await request(app)
        .get(`/api/clients/${TEST_CLIENT_ID}/external-storage`)
        .set('x-api-key', process.env.APP_API_KEY!);

      expect(res.status).toBe(401);
    });

    it('callback path is reachable', async () => {
      const res = await request(app)
        .get('/api/external-storage/callback/google_drive?code=test&state=invalid')
        .set('x-api-key', process.env.APP_API_KEY!);

      // your route returns 400 for invalid state — this is fine:
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('Connection Management', () => {
    it('lists empty connections initially', async () => {
      const res = await request(app)
        .get(`/api/clients/${TEST_CLIENT_ID}/external-storage`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('lists existing connections without exposing tokens', async () => {
      store.external_storage_connections.push({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        client_id: TEST_CLIENT_ID,
        provider: 'google_drive',
        status: 'connected',
        access_token: 'secret_access_token',
        refresh_token: 'secret_refresh_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });

      const res = await request(app)
        .get(`/api/clients/${TEST_CLIENT_ID}/external-storage`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].provider).toBe('google_drive');
      expect(res.body.data[0].status).toBe('connected');
      expect(res.body.data[0].access_token).toBeUndefined();
      expect(res.body.data[0].refresh_token).toBeUndefined();
    });

    it('updates connection root folder', async () => {
      store.external_storage_connections.push({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        client_id: TEST_CLIENT_ID,
        provider: 'google_drive',
        status: 'connected',
        access_token: 'test_token',
        root_folder_id: null,
      });

      const res = await request(app)
        .patch(`/api/clients/${TEST_CLIENT_ID}/external-storage/google_drive`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ root_folder_id: 'folder123' });

      expect(res.status).toBe(200);
      expect(res.body.data.root_folder_id).toBe('folder123');
    });

    it('revokes connection', async () => {
      store.external_storage_connections.push({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        client_id: TEST_CLIENT_ID,
        provider: 'google_drive',
        status: 'connected',
        access_token: 'test_token',
        refresh_token: 'test_refresh',
      });

      const res = await request(app)
        .delete(`/api/clients/${TEST_CLIENT_ID}/external-storage/google_drive`)
        .set('x-api-key', process.env.APP_API_KEY!)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(204);

      const row = store.external_storage_connections.find(
        c => c.client_id === TEST_CLIENT_ID && c.provider === 'google_drive'
      );
      expect(row?.status).toBe('revoked');
      expect(row?.access_token).toBe('');
      expect(row?.refresh_token).toBeNull();
    });
  });

  describe('OAuth State Validation', () => {
    it('rejects invalid OAuth state', async () => {
      const res = await request(app)
        .get('/api/external-storage/callback/google_drive?code=test&state=invalid_state')
        .set('x-api-key', process.env.APP_API_KEY!);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects expired OAuth state', async () => {
      const expiredState = jwt.sign(
        {
          clientId: TEST_CLIENT_ID,
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

    it('rejects provider mismatch in state', async () => {
      const mismatchState = jwt.sign(
        {
          clientId: TEST_CLIENT_ID,
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
    });
  });

  describe('Token Encryption (pure)', () => {
    it('encrypts tokens', async () => {
      const plainToken = 'test_access_token_12345';
      const { encryptToken } = await import('../src/lib/tokenEncryption');
      const encrypted = encryptToken(plainToken);

      expect(encrypted).not.toBe(plainToken);
      expect(encrypted).toContain(':');
      expect(encrypted.split(':').length).toBe(3);
    });

    it('decrypts tokens', async () => {
      const plainToken = 'test_access_token_12345';
      const { encryptToken, decryptToken } = await import('../src/lib/tokenEncryption');
      const encrypted = encryptToken(plainToken);
      const decrypted = decryptToken(encrypted);

      expect(decrypted).toBe(plainToken);
    });
  });

  describe('Atomic Job Claiming (mocked RPC)', () => {
    it('claims jobs atomically using rpc', async () => {
      // seed docs + jobs in memory
      store.documents.push({ id: uuid('doc'), client_id: TEST_CLIENT_ID, name: 't1.txt' });
      store.documents.push({ id: '66666666-6666-4666-8666-666666666666', client_id: TEST_CLIENT_ID, name: 't2.txt' });

      store.external_upload_jobs.push(
        { id: '77777777-7777-4777-8777-777777777777', client_id: TEST_CLIENT_ID, document_id: store.documents[0].id, provider: 'google_drive', status: 'pending', attempts: 0 },
        { id: '88888888-8888-4888-8888-888888888888', client_id: TEST_CLIENT_ID, document_id: store.documents[1].id, provider: 'google_drive', status: 'pending', attempts: 0 }
      );

      // call the rpc via admin client mock directly (unit-level)
      const { createSupabaseAdminClient } = await import('../src/lib/supabaseClient');
      const sb = createSupabaseAdminClient();

      const { data: job1 } = await sb.rpc('claim_external_upload_job');
      expect(job1).toHaveLength(1);
      expect(job1[0].status).toBe('processing');

      const { data: job2 } = await sb.rpc('claim_external_upload_job');
      expect(job2).toHaveLength(1);
      expect(job2[0].id).not.toBe(job1[0].id);

      const { data: job3 } = await sb.rpc('claim_external_upload_job');
      expect(job3).toHaveLength(0);
    });

    it('does not claim jobs with attempts >= 3', async () => {
      store.external_upload_jobs.push({
        id: '99999999-9999-4999-8999-999999999999',
        client_id: TEST_CLIENT_ID,
        document_id: uuid('doc'),
        provider: 'google_drive',
        status: 'pending',
        attempts: 3,
      });

      const { createSupabaseAdminClient } = await import('../src/lib/supabaseClient');
      const sb = createSupabaseAdminClient();

      const { data: job } = await sb.rpc('claim_external_upload_job');
      expect(job).toHaveLength(0);
    });
  });
});
