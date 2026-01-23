import { vi, beforeAll } from 'vitest';

// Set test environment variables before any imports
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  // Don't default TEST_BYPASS_AUTH to 'true' - let tests use deterministic JWT verification
  process.env.PORT = process.env.PORT || '3000';
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret-min-32-chars-long-for-hs256';
  process.env.APP_API_KEY = process.env.APP_API_KEY || 'test-api-key';
});

// TRIPWIRE: Prevent real Supabase client creation in tests
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    throw new Error(
      'TEST MUST NOT CREATE REAL SUPABASE CLIENT. ' +
      'All production code must use src/lib/supabaseClient exports (createSupabaseAdminClient/createSupabaseUserClient). ' +
      'Tests must mock these exports, not bypass them.'
    );
  },
}));

// Mock Supabase client to prevent network calls
vi.mock('../src/lib/supabaseClient', () => {
  const mockSupabaseClient = {
    from: vi.fn(() => mockSupabaseClient),
    select: vi.fn(() => mockSupabaseClient),
    insert: vi.fn(() => mockSupabaseClient),
    update: vi.fn(() => mockSupabaseClient),
    delete: vi.fn(() => mockSupabaseClient),
    eq: vi.fn(() => mockSupabaseClient),
    neq: vi.fn(() => mockSupabaseClient),
    gt: vi.fn(() => mockSupabaseClient),
    gte: vi.fn(() => mockSupabaseClient),
    lt: vi.fn(() => mockSupabaseClient),
    lte: vi.fn(() => mockSupabaseClient),
    like: vi.fn(() => mockSupabaseClient),
    ilike: vi.fn(() => mockSupabaseClient),
    is: vi.fn(() => mockSupabaseClient),
    in: vi.fn(() => mockSupabaseClient),
    contains: vi.fn(() => mockSupabaseClient),
    containedBy: vi.fn(() => mockSupabaseClient),
    range: vi.fn(() => mockSupabaseClient),
    match: vi.fn(() => mockSupabaseClient),
    not: vi.fn(() => mockSupabaseClient),
    or: vi.fn(() => mockSupabaseClient),
    filter: vi.fn(() => mockSupabaseClient),
    order: vi.fn(() => mockSupabaseClient),
    limit: vi.fn(() => mockSupabaseClient),
    single: vi.fn(() => Promise.resolve({ 
      data: { 
        id: 'test-admin-user', 
        role: 'admin', 
        client_id: null,
        email: 'test@example.com'
      }, 
      error: null 
    })),
    maybeSingle: vi.fn(() => Promise.resolve({ 
      data: { 
        id: 'test-admin-user', 
        role: 'admin', 
        client_id: null,
        email: 'test@example.com'
      }, 
      error: null 
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: {
          user: {
            id: 'test-admin-user',
            email: 'test@example.com',
            role: 'authenticated',
          }
        },
        error: null
      })),
      signInWithPassword: vi.fn(() => Promise.resolve({
        data: {
          user: {
            id: 'test-admin-user',
            email: 'test@example.com',
          },
          session: {
            access_token: 'test-token',
            refresh_token: 'test-refresh-token',
          }
        },
        error: null
      })),
    },
  };

  return {
    createSupabaseAdminClient: vi.fn(() => mockSupabaseClient),
    createSupabaseUserClient: vi.fn(() => mockSupabaseClient),
  };
});
