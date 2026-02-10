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
  upload_session_id?: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
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

export interface DbClientConversation {
  id: string;
  client_id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface DbMessage {
  id: string;
  client_id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_role: 'admin' | 'client';
  body: string;
  created_at: string;
}

export interface DbMessageAttachment {
  id: string;
  message_id: string;
  client_id: string;
  document_id: string;
  created_at: string;
}

/**
 * Plan code enum
 */
export type PlanCode = 'NONE' | 'BASIC' | 'PRO';

/**
 * Invoice status enum
 */
export type InvoiceStatus = 'OPEN' | 'REVIEW' | 'PAID' | 'CANCELLED';

/**
 * Plan configuration
 */
export interface DbPlanConfig {
  plan_code: PlanCode;
  display_name: string;
  free_minutes_monthly: number;
  hourly_rate_eur: string; // decimal as string
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Client plan assignment (temporal data)
 */
export interface DbClientPlan {
  id: string;
  client_id: string;
  plan_code: PlanCode;
  effective_from: string; // date
  effective_to: string | null;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Client monthly allowance ledger
 */
export interface DbClientMonthlyAllowance {
  id: string;
  client_id: string;
  period_start: string; // date (YYYY-MM-01)
  plan_code: PlanCode;
  free_minutes_total: number;
  free_minutes_used: number;
  created_at: string;
  updated_at: string;
}

/**
 * Invoice
 */
export interface DbInvoice {
  id: string;
  client_id: string;
  invoice_no: string;
  title: string;
  description: string | null;
  currency: string;
  amount_total: string; // decimal as string
  status: InvoiceStatus;
  due_date: string; // date
  period_start: string | null; // date
  period_end: string | null; // date
  billable_minutes_snapshot: number | null;
  hourly_rate_snapshot: string | null; // decimal as string
  invoice_document_id: string | null;
  proof_document_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  paid_at: string | null; // payment date
  payment_method: 'bank_transfer' | 'credit_card' | 'cash' | 'other' | null;
  payment_reference: string | null; // transaction reference
  payment_note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Time entry (updated with free/billable split)
 */
export interface DbTimeEntry {
  id: string;
  client_id: string;
  advisor_user_id: string;
  entry_date: string; // date (deprecated, use worked_at)
  worked_at: string; // date
  minutes: number;
  free_minutes_consumed: number;
  billable_minutes: number;
  task: string | null;
  is_billable: boolean;
  source: 'manual' | 'timer' | 'import';
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
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

