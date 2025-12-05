// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Admin client - RLS bypass (dikkatli kullan!)
 * Use case: Admin işlemleri, background jobs, system operations
 */
export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * User-scoped client - RLS enabled
 * Use case: User-specific işlemler, normal API operations
 */
export function createSupabaseUserClient(accessToken: string): SupabaseClient {
  return createClient(env.supabase.url, env.supabase.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

