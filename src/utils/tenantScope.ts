import { SupabaseClient } from '@supabase/supabase-js';

export interface TenantScope {
  supabase: SupabaseClient;
  clientId: string;
  isAdminBypass?: boolean;
}

export function createTenantScope(
  supabase: SupabaseClient,
  clientId: string,
  isAdminBypass: boolean = false
): TenantScope {
  if (!clientId) {
    throw new Error('clientId is required for tenant scope');
  }
  
  return {
    supabase,
    clientId,
    isAdminBypass,
  };
}

export function createAdminBypassScope(
  supabase: SupabaseClient,
  clientId: string
): TenantScope {
  return createTenantScope(supabase, clientId, true);
}
