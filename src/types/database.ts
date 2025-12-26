// src/types/database.ts

/**
 * Database row types
 * These match the actual structure of rows in Supabase tables
 */

export interface DbClient {
  id: string;
  name: string;
  slug: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAppUser {
  id: string; // JWT sub ile aynı
  email: string;
  role: 'admin' | 'client';
  client_id: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbDocument {
  id: string;
  client_id: string;
  uploaded_by: string | null;
  source: 's3' | 'gdrive' | 'sharepoint';
  kind: 'client_upload' | 'firm_upload' | null;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  preview_url: string | null;
  created_at: string;
}

export interface DbTaxCalendarEntry {
  id: string;
  client_id: string;
  jurisdiction: string;
  tax_type: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  deadline: string;
  status: 'pending' | 'in_progress' | 'done' | 'not_applicable';
  responsible_party: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbInvitation {
  id: string;
  email: string;
  role: 'admin' | 'client';
  client_id: string | null;
  invited_by: string | null;
  token: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DbCompany {
  id: string;
  client_id: string;
  name: string;
  country: string | null;
  kvk: string | null;
  vat: string | null;
  fiscal_year_end: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Extended client type with related users
 * Used when include_users=true in GET /api/admin/clients
 */
export interface DbClientWithUsers extends DbClient {
  users: Pick<DbAppUser, 'id' | 'email' | 'full_name' | 'role' | 'is_active' | 'created_at' | 'client_id'>[];
  users_count: number;
}

/**
 * User list item type
 * Used in GET /api/admin/users response
 */
export type DbAppUserListItem = Pick<DbAppUser, 'id' | 'email' | 'full_name' | 'role' | 'is_active' | 'created_at' | 'client_id'>;

