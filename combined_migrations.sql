-- De Bedrijfsfiscalist - Supabase Initial Schema

-- UUID üretimi için (genelde açık ama garantiye alalım)
create extension if not exists "pgcrypto";

------------------------------------------------------------------
-- 1. CORE TABLES
------------------------------------------------------------------

-- Clients (müşteriler)
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uygulama kullanıcıları (admin + client users)
create table public.app_users (
  id uuid primary key, -- JWT sub ile aynı
  email text not null unique,
  role text not null check (role in ('admin','client')),
  client_id uuid references public.clients(id),
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------
-- 2. DOCUMENTS
------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  uploaded_by uuid references public.app_users(id),
  source text not null check (source in ('s3','gdrive','sharepoint')),
  kind text check (kind in ('client_upload','firm_upload')),
  name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text,         -- S3 key / Drive fileId / SharePoint path
  preview_url text,          -- opsiyonel cache
  created_at timestamptz not null default now()
);

------------------------------------------------------------------
-- 3. TAX RETURN CALENDAR
------------------------------------------------------------------

create table public.tax_return_calendar_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  jurisdiction text not null,       -- NL, BE, vs.
  tax_type text not null,           -- Dutch VAT, Dutch CIT, vb.
  period_label text,                -- 2025-Q1, Jan 2025 vb.
  period_start date,
  period_end date,
  deadline date not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','done','not_applicable')),
  responsible_party text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------
-- 4. TAX RISK MATRIX
------------------------------------------------------------------

create table public.tax_risk_matrix_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  risk_code text,                -- matrix satırına referans
  likelihood integer,            -- olasılık
  impact integer,                -- etki
  score integer,                 -- likelihood * impact
  score_color text,              -- green / orange / red
  matrix_row integer,
  matrix_col integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------
-- 5. TAX RISK CONTROL SHEET
------------------------------------------------------------------

create table public.tax_risk_control_rows (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),

  risk_code text,
  risk_description text,

  inherent_likelihood integer,
  inherent_impact integer,
  inherent_score integer,
  inherent_color text,             -- green / orange / red

  control_required boolean,
  control_description text,
  monitoring_frequency text,       -- Monthly / Quarterly / Yearly vb.
  monitoring_months int[],         -- 1-12 aylar
  owner text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------
-- 6. TAX FUNCTION
------------------------------------------------------------------

create table public.tax_function_rows (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),

  process_name text not null,
  process_description text,
  stakeholders text[],            -- Finance, Tax, Operations...
  frequency text,                 -- Monthly, Yearly vb.
  notes text,
  order_index integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------
-- 7. AUDIT LOG
------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  user_id uuid references public.app_users(id),
  action text not null,           -- message_sent, file_downloaded vb.
  entity_type text,               -- document, tax_return_calendar_entry vb.
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) & POLICIES
------------------------------------------------------------------

-- RLS'i açalım
alter table public.app_users                    enable row level security;
alter table public.documents                    enable row level security;
alter table public.tax_return_calendar_entries  enable row level security;
alter table public.tax_risk_matrix_entries      enable row level security;
alter table public.tax_risk_control_rows        enable row level security;
alter table public.tax_function_rows            enable row level security;
alter table public.audit_log                    enable row level security;
alter table public.clients                      enable row level security;

---------------------------
-- app_users POLICIES
---------------------------

-- Kullanıcı kendi kaydını görebilsin
create policy "app_users_select_self"
on public.app_users
for select
using (
  id = (auth.jwt() ->> 'sub')::uuid
);

-- Kullanıcı kendi kaydını güncelleyebilsin
create policy "app_users_update_self"
on public.app_users
for update
using (
  id = (auth.jwt() ->> 'sub')::uuid
)
with check (
  id = (auth.jwt() ->> 'sub')::uuid
);

-- Admin tüm kullanıcıları yönetebilsin
create policy "app_users_admin_full_access"
on public.app_users
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

---------------------------
-- clients POLICIES
---------------------------

-- Client user kendi client kaydını görebilsin
create policy "clients_client_can_select_own"
on public.clients
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and id = (auth.jwt() ->> 'client_id')::uuid
);

-- Admin tüm client'ları yönetebilsin
create policy "clients_admin_full_access"
on public.clients
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

---------------------------
-- Client-scoped tablolar için genel pattern
---------------------------

-- DOCUMENTS
create policy "documents_client_can_select_own_client"
on public.documents
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "documents_client_modify_own_client"
on public.documents
for all
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
)
with check (
  client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "documents_admin_full_access"
on public.documents
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

-- TAX RETURN CALENDAR
create policy "tax_calendar_client_select_own"
on public.tax_return_calendar_entries
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "tax_calendar_client_modify_own"
on public.tax_return_calendar_entries
for all
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
)
with check (
  client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "tax_calendar_admin_full_access"
on public.tax_return_calendar_entries
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

-- TAX RISK MATRIX
create policy "tax_risk_matrix_client_select_own"
on public.tax_risk_matrix_entries
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "tax_risk_matrix_client_modify_own"
on public.tax_risk_matrix_entries
for all
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
)
with check (
  client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "tax_risk_matrix_admin_full_access"
on public.tax_risk_matrix_entries
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

-- TAX RISK CONTROL ROWS
create policy "tax_risk_control_client_select_own"
on public.tax_risk_control_rows
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "tax_risk_control_client_modify_own"
on public.tax_risk_control_rows
for all
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
)
with check (
  client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "tax_risk_control_admin_full_access"
on public.tax_risk_control_rows
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

-- TAX FUNCTION ROWS
create policy "tax_function_client_select_own"
on public.tax_function_rows
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "tax_function_client_modify_own"
on public.tax_function_rows
for all
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
)
with check (
  client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "tax_function_admin_full_access"
on public.tax_function_rows
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

-- AUDIT LOG
create policy "audit_log_client_select_own"
on public.audit_log
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
);

create policy "audit_log_admin_full_access"
on public.audit_log
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);
-- Password Reset Tokens Table
-- Created: 2025-01-06
-- Purpose: Store secure token hashes for password reset flow (no email sending from backend)

-- Create password_reset_tokens table if not exists
create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

-- Create indexes for faster lookups
create index if not exists password_reset_tokens_email_idx on public.password_reset_tokens(email);
create index if not exists password_reset_tokens_token_hash_idx on public.password_reset_tokens(token_hash);
create index if not exists password_reset_tokens_expires_at_idx on public.password_reset_tokens(expires_at);

-- Add comments for documentation
comment on table public.password_reset_tokens is 'Stores password reset token hashes (raw tokens never stored)';
comment on column public.password_reset_tokens.token_hash is 'SHA-256 hash of the raw token';
comment on column public.password_reset_tokens.expires_at is 'Token expiry timestamp (default 30 minutes from creation)';
comment on column public.password_reset_tokens.used_at is 'Timestamp when token was used (null = not yet used)';

-- Enable Row Level Security
alter table public.password_reset_tokens enable row level security;

-- RLS Policy: Only service role can access (backend only, no direct user access)
-- This prevents users from querying or manipulating tokens directly
create policy "password_reset_tokens_service_only"
on public.password_reset_tokens
for all
using (false)
with check (false);

-- Create cleanup function for expired/used tokens (optional, for maintenance)
create or replace function cleanup_password_reset_tokens()
returns void
language plpgsql
security definer
as $$
begin
  -- Delete tokens that are either used or expired for more than 24 hours
  delete from public.password_reset_tokens
  where (used_at is not null and used_at < now() - interval '24 hours')
     or (used_at is null and expires_at < now() - interval '24 hours');
end;
$$;

comment on function cleanup_password_reset_tokens is 'Removes old used/expired password reset tokens (can be called by cron job)';
-- Bubble Password Reset Tokens Table
-- Created: 2025-01-06
-- Purpose: Store Bubble-generated reset tokens for mutual password reset verification flow

-- Create bubble_password_reset_tokens table
create table if not exists public.bubble_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reset_token text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

-- Create indexes for faster lookups
create index if not exists bubble_password_reset_tokens_email_idx on public.bubble_password_reset_tokens(email);
create index if not exists bubble_password_reset_tokens_reset_token_idx on public.bubble_password_reset_tokens(reset_token);
create index if not exists bubble_password_reset_tokens_expires_at_idx on public.bubble_password_reset_tokens(expires_at);

-- Add comments for documentation
comment on table public.bubble_password_reset_tokens is 'Stores Bubble-generated password reset tokens for mutual verification flow';
comment on column public.bubble_password_reset_tokens.reset_token is 'Raw token generated by Bubble (not hashed, trusted after DB validation)';
comment on column public.bubble_password_reset_tokens.expires_at is 'Token expiry timestamp (default 30 minutes from creation)';
comment on column public.bubble_password_reset_tokens.used_at is 'Timestamp when token was used (null = not yet used)';

-- Enable Row Level Security
alter table public.bubble_password_reset_tokens enable row level security;

-- RLS Policy: Only service role can access (backend only, no direct user access)
create policy "bubble_password_reset_tokens_service_only"
on public.bubble_password_reset_tokens
for all
using (false)
with check (false);

-- Create cleanup function for expired/used tokens
create or replace function cleanup_bubble_password_reset_tokens()
returns void
language plpgsql
security definer
as $$
begin
  -- Delete tokens that are either used or expired for more than 24 hours
  delete from public.bubble_password_reset_tokens
  where (used_at is not null and used_at < now() - interval '24 hours')
     or (used_at is null and expires_at < now() - interval '24 hours');
end;
$$;

comment on function cleanup_bubble_password_reset_tokens is 'Removes old used/expired Bubble password reset tokens (can be called by cron job)';
-- Invitations Table for User Invitation System
-- Created: 2025-12-02

-- Create invitations table
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('admin','client')),
  client_id uuid references public.clients(id) on delete cascade,
  invited_by uuid references public.app_users(id),
  token text unique not null,
  expires_at timestamptz not null,
  status text not null default 'pending' 
    check (status in ('pending','accepted','expired','cancelled')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create indexes for faster lookups
create index invitations_token_idx on public.invitations(token);
create index invitations_email_idx on public.invitations(email);
create index invitations_status_idx on public.invitations(status);
create index invitations_expires_at_idx on public.invitations(expires_at);

-- Add comment for documentation
comment on table public.invitations is 'Stores user invitation records for onboarding flow';
comment on column public.invitations.token is 'Unique token for invitation URL';
comment on column public.invitations.expires_at is 'Invitation expiry timestamp (typically 72 hours)';
comment on column public.invitations.status is 'Invitation status: pending, accepted, expired, cancelled';

-- Enable Row Level Security
alter table public.invitations enable row level security;

-- RLS Policy: Admin can see and manage all invitations
create policy "invitations_admin_full_access"
on public.invitations
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

-- RLS Policy: Users can see their own pending invitations by email
create policy "invitations_user_select_own"
on public.invitations
for select
using (
  email = auth.jwt() ->> 'email'
  or id = (auth.jwt() ->> 'sub')::uuid
);

-- Create function to automatically expire old invitations (optional, for cleanup job)
create or replace function expire_old_invitations()
returns void
language plpgsql
security definer
as $$
begin
  update public.invitations
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at < now();
end;
$$;

comment on function expire_old_invitations is 'Marks expired invitations as expired (can be called by cron job)';

-- Migration: Add companies table with RLS policies
-- Created: 2025-12-23
-- Description: Creates companies table with 1-to-1 relationship to clients and RLS policies

-- 1. Create companies table
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  name text not null,
  country text,
  kvk text, -- Dutch Chamber of Commerce number
  vat text, -- VAT/BTW number
  fiscal_year_end text, -- e.g., "12-31" for December 31
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Create indexes for performance
create index if not exists idx_companies_client_id on public.companies(client_id);

-- 3. Add comment for documentation
comment on table public.companies is 'Company information for each client (1-to-1 relationship)';
comment on column public.companies.client_id is 'Foreign key to clients table (unique constraint ensures 1-to-1)';
comment on column public.companies.kvk is 'Dutch Chamber of Commerce (KvK) number';
comment on column public.companies.vat is 'VAT/BTW identification number';
comment on column public.companies.fiscal_year_end is 'Fiscal year end date (MM-DD format)';

-- 4. Enable Row Level Security
alter table public.companies enable row level security;

-- 5. RLS Policy: Client users can view their own company
drop policy if exists "companies_client_select_own" on public.companies;
create policy "companies_client_select_own"
on public.companies
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- 6. RLS Policy: Client users can update their own company
drop policy if exists "companies_client_update_own" on public.companies;
create policy "companies_client_update_own"
on public.companies
for update
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
)
with check (
  client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- 7. RLS Policy: Admin has full access to all companies
drop policy if exists "companies_admin_full_access" on public.companies;
create policy "companies_admin_full_access"
on public.companies
for all
using (
  auth.jwt() ->> 'role' = 'admin'
)
with check (
  auth.jwt() ->> 'role' = 'admin'
);

-- 8. Create function to automatically update updated_at timestamp
create or replace function public.update_companies_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 9. Create trigger for updated_at
create trigger companies_updated_at_trigger
  before update on public.companies
  for each row
  execute function public.update_companies_updated_at();
-- Migration: Add missing indexes for performance optimization
-- Created: 2025-12-23
-- Description: Adds indexes on frequently queried columns across all tables

-- app_users indexes
create index if not exists idx_app_users_email on public.app_users(email);
create index if not exists idx_app_users_client_id on public.app_users(client_id);
create index if not exists idx_app_users_role on public.app_users(role);

-- documents indexes
create index if not exists idx_documents_client_id on public.documents(client_id);
create index if not exists idx_documents_uploaded_by on public.documents(uploaded_by);
create index if not exists idx_documents_source on public.documents(source);
create index if not exists idx_documents_created_at on public.documents(created_at desc);

-- tax_return_calendar_entries indexes
create index if not exists idx_tax_calendar_client_id on public.tax_return_calendar_entries(client_id);
create index if not exists idx_tax_calendar_deadline on public.tax_return_calendar_entries(deadline);
create index if not exists idx_tax_calendar_status on public.tax_return_calendar_entries(status);
create index if not exists idx_tax_calendar_jurisdiction on public.tax_return_calendar_entries(jurisdiction);
create index if not exists idx_tax_calendar_tax_type on public.tax_return_calendar_entries(tax_type);
create index if not exists idx_tax_calendar_client_deadline on public.tax_return_calendar_entries(client_id, deadline);

-- tax_risk_matrix_entries indexes
create index if not exists idx_tax_risk_matrix_client_id on public.tax_risk_matrix_entries(client_id);
create index if not exists idx_tax_risk_matrix_score on public.tax_risk_matrix_entries(score desc);
create index if not exists idx_tax_risk_matrix_color on public.tax_risk_matrix_entries(score_color);

-- tax_risk_control_rows indexes
create index if not exists idx_tax_risk_control_client_id on public.tax_risk_control_rows(client_id);
create index if not exists idx_tax_risk_control_score on public.tax_risk_control_rows(inherent_score desc);

-- tax_function_rows indexes
create index if not exists idx_tax_function_client_id on public.tax_function_rows(client_id);
create index if not exists idx_tax_function_order on public.tax_function_rows(order_index);

-- audit_log indexes
create index if not exists idx_audit_log_client_id on public.audit_log(client_id);
create index if not exists idx_audit_log_user_id on public.audit_log(user_id);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action);
create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id);

-- clients indexes (for search and lookups)
create index if not exists idx_clients_slug on public.clients(slug);
create index if not exists idx_clients_created_at on public.clients(created_at desc);

-- Composite indexes for common query patterns
create index if not exists idx_documents_client_source on public.documents(client_id, source);
create index if not exists idx_tax_calendar_client_status on public.tax_return_calendar_entries(client_id, status);
create index if not exists idx_audit_log_client_created on public.audit_log(client_id, created_at desc);

-- Add comments for documentation
comment on index idx_app_users_email is 'Fast lookup for user authentication and invitation checks';
comment on index idx_app_users_client_id is 'Filter users by client for admin operations';
comment on index idx_documents_client_id is 'Primary filter for client-scoped document queries';
comment on index idx_tax_calendar_client_deadline is 'Composite index for upcoming deadlines query';
comment on index idx_audit_log_client_created is 'Composite index for recent activity queries';
-- Migration: Fix RLS policies to use join-based authentication
-- Created: 2025-12-25
-- Description: Replace JWT claim-based RLS with app_users table joins using SECURITY DEFINER helper functions

------------------------------------------------------------------
-- 1. CREATE SECURITY DEFINER HELPER FUNCTIONS
------------------------------------------------------------------

-- Helper: Check if current user is an active admin
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1
    from public.app_users
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
end;
$$;

-- Helper: Check if current user is an active client
create or replace function public.is_client()
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1
    from public.app_users
    where id = auth.uid()
      and role = 'client'
      and is_active = true
  );
end;
$$;

-- Helper: Get current user's client_id
create or replace function public.current_client_id()
returns uuid
language plpgsql
security definer
stable
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id
  from public.app_users
  where id = auth.uid()
    and is_active = true;
  
  return v_client_id;
end;
$$;

-- Helper: Get current user's role
create or replace function public.current_user_role()
returns text
language plpgsql
security definer
stable
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.app_users
  where id = auth.uid()
    and is_active = true;
  
  return v_role;
end;
$$;

-- Grant execute permissions to authenticated users
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_client() to authenticated;
grant execute on function public.current_client_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

-- Add comments for documentation
comment on function public.is_admin() is 'Returns true if current user is an active admin';
comment on function public.is_client() is 'Returns true if current user is an active client';
comment on function public.current_client_id() is 'Returns client_id of current user if active';
comment on function public.current_user_role() is 'Returns role of current user if active';

------------------------------------------------------------------
-- 2. DROP OLD POLICIES
------------------------------------------------------------------

-- app_users policies
drop policy if exists "app_users_select_self" on public.app_users;
drop policy if exists "app_users_update_self" on public.app_users;
drop policy if exists "app_users_admin_full_access" on public.app_users;

-- clients policies
drop policy if exists "clients_client_can_select_own" on public.clients;
drop policy if exists "clients_admin_full_access" on public.clients;

-- documents policies
drop policy if exists "documents_client_can_select_own_client" on public.documents;
drop policy if exists "documents_client_modify_own_client" on public.documents;
drop policy if exists "documents_admin_full_access" on public.documents;

-- tax_return_calendar_entries policies
drop policy if exists "tax_calendar_client_select_own" on public.tax_return_calendar_entries;
drop policy if exists "tax_calendar_client_modify_own" on public.tax_return_calendar_entries;
drop policy if exists "tax_calendar_admin_full_access" on public.tax_return_calendar_entries;

-- tax_risk_matrix_entries policies
drop policy if exists "tax_risk_matrix_client_select_own" on public.tax_risk_matrix_entries;
drop policy if exists "tax_risk_matrix_client_modify_own" on public.tax_risk_matrix_entries;
drop policy if exists "tax_risk_matrix_admin_full_access" on public.tax_risk_matrix_entries;

-- tax_risk_control_rows policies
drop policy if exists "tax_risk_control_client_select_own" on public.tax_risk_control_rows;
drop policy if exists "tax_risk_control_client_modify_own" on public.tax_risk_control_rows;
drop policy if exists "tax_risk_control_admin_full_access" on public.tax_risk_control_rows;

-- tax_function_rows policies
drop policy if exists "tax_function_client_select_own" on public.tax_function_rows;
drop policy if exists "tax_function_client_modify_own" on public.tax_function_rows;
drop policy if exists "tax_function_admin_full_access" on public.tax_function_rows;

-- audit_log policies
drop policy if exists "audit_log_client_select_own" on public.audit_log;
drop policy if exists "audit_log_admin_full_access" on public.audit_log;

-- companies policies
drop policy if exists "companies_client_select_own" on public.companies;
drop policy if exists "companies_client_update_own" on public.companies;
drop policy if exists "companies_admin_full_access" on public.companies;

-- invitations policies
drop policy if exists "invitations_admin_full_access" on public.invitations;
drop policy if exists "invitations_user_select_own" on public.invitations;

------------------------------------------------------------------
-- 3. CREATE NEW JOIN-BASED POLICIES
------------------------------------------------------------------

---------------------------
-- app_users POLICIES
---------------------------

-- Users can view their own record
create policy "app_users_select_self"
on public.app_users
for select
using (
  id = auth.uid()
);

-- Users can update their own record
create policy "app_users_update_self"
on public.app_users
for update
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);

-- Admins have full access to all users
create policy "app_users_admin_full_access"
on public.app_users
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- clients POLICIES
---------------------------

-- Client users can view their own client record
create policy "clients_client_can_select_own"
on public.clients
for select
using (
  public.is_client() and id = public.current_client_id()
);

-- Admins have full access to all clients
create policy "clients_admin_full_access"
on public.clients
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- documents POLICIES
---------------------------

-- Client users can view documents for their client
create policy "documents_client_can_select_own_client"
on public.documents
for select
using (
  public.is_client() and client_id = public.current_client_id()
);

-- Client users can modify documents for their client
create policy "documents_client_modify_own_client"
on public.documents
for all
using (
  public.is_client() and client_id = public.current_client_id()
)
with check (
  client_id = public.current_client_id()
);

-- Admins have full access to all documents
create policy "documents_admin_full_access"
on public.documents
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- tax_return_calendar_entries POLICIES
---------------------------

-- Client users can view their own calendar entries
create policy "tax_calendar_client_select_own"
on public.tax_return_calendar_entries
for select
using (
  public.is_client() and client_id = public.current_client_id()
);

-- Client users can modify their own calendar entries
create policy "tax_calendar_client_modify_own"
on public.tax_return_calendar_entries
for all
using (
  public.is_client() and client_id = public.current_client_id()
)
with check (
  client_id = public.current_client_id()
);

-- Admins have full access to all calendar entries
create policy "tax_calendar_admin_full_access"
on public.tax_return_calendar_entries
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- tax_risk_matrix_entries POLICIES
---------------------------

-- Client users can view their own risk matrix entries
create policy "tax_risk_matrix_client_select_own"
on public.tax_risk_matrix_entries
for select
using (
  public.is_client() and client_id = public.current_client_id()
);

-- Client users can modify their own risk matrix entries
create policy "tax_risk_matrix_client_modify_own"
on public.tax_risk_matrix_entries
for all
using (
  public.is_client() and client_id = public.current_client_id()
)
with check (
  client_id = public.current_client_id()
);

-- Admins have full access to all risk matrix entries
create policy "tax_risk_matrix_admin_full_access"
on public.tax_risk_matrix_entries
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- tax_risk_control_rows POLICIES
---------------------------

-- Client users can view their own risk control rows
create policy "tax_risk_control_client_select_own"
on public.tax_risk_control_rows
for select
using (
  public.is_client() and client_id = public.current_client_id()
);

-- Client users can modify their own risk control rows
create policy "tax_risk_control_client_modify_own"
on public.tax_risk_control_rows
for all
using (
  public.is_client() and client_id = public.current_client_id()
)
with check (
  client_id = public.current_client_id()
);

-- Admins have full access to all risk control rows
create policy "tax_risk_control_admin_full_access"
on public.tax_risk_control_rows
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- tax_function_rows POLICIES
---------------------------

-- Client users can view their own tax function rows
create policy "tax_function_client_select_own"
on public.tax_function_rows
for select
using (
  public.is_client() and client_id = public.current_client_id()
);

-- Client users can modify their own tax function rows
create policy "tax_function_client_modify_own"
on public.tax_function_rows
for all
using (
  public.is_client() and client_id = public.current_client_id()
)
with check (
  client_id = public.current_client_id()
);

-- Admins have full access to all tax function rows
create policy "tax_function_admin_full_access"
on public.tax_function_rows
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- audit_log POLICIES
---------------------------

-- Client users can view their own audit logs
create policy "audit_log_client_select_own"
on public.audit_log
for select
using (
  public.is_client() and client_id = public.current_client_id()
);

-- Admins have full access to all audit logs
create policy "audit_log_admin_full_access"
on public.audit_log
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- companies POLICIES
---------------------------

-- Client users can view their own company
create policy "companies_client_select_own"
on public.companies
for select
using (
  public.is_client() and client_id = public.current_client_id()
);

-- Client users can update their own company
create policy "companies_client_update_own"
on public.companies
for update
using (
  public.is_client() and client_id = public.current_client_id()
)
with check (
  client_id = public.current_client_id()
);

-- Admins have full access to all companies
create policy "companies_admin_full_access"
on public.companies
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

---------------------------
-- invitations POLICIES
---------------------------

-- Admins have full access to all invitations
create policy "invitations_admin_full_access"
on public.invitations
for all
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- Users can view invitations by their email (keep JWT email claim for this case)
create policy "invitations_user_select_own"
on public.invitations
for select
using (
  email = (auth.jwt()->>'email')
  or id = auth.uid()
);
-- Add owner_user_id + owner_display to risk rows
alter table public.tax_risk_control_rows
  add column if not exists owner_user_id uuid null,
  add column if not exists owner_display text null;

-- FK owner_user_id -> app_users(id)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tax_risk_control_rows_owner_user_id_fkey'
  ) then
    alter table public.tax_risk_control_rows
      add constraint tax_risk_control_rows_owner_user_id_fkey
      foreign key (owner_user_id) references public.app_users(id)
      on delete set null;
  end if;
end $$;

-- Backfill: if older rows have owner text, copy it into owner_display
update public.tax_risk_control_rows
set owner_display = owner
where owner_display is null
  and owner is not null;

-- (Optional but recommended) index for filtering/analytics
create index if not exists idx_trcr_client_owner_user
  on public.tax_risk_control_rows (client_id, owner_user_id);
-- 1) tax_risk_control_rows: add process_id + response
alter table public.tax_risk_control_rows
  add column if not exists process_id uuid null,
  add column if not exists response text not null default 'Monitor';

-- FK: process_id -> tax_function_rows(id)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tax_risk_control_rows_process_id_fkey'
  ) then
    alter table public.tax_risk_control_rows
      add constraint tax_risk_control_rows_process_id_fkey
      foreign key (process_id) references public.tax_function_rows(id)
      on delete set null;
  end if;
end $$;

-- Response allowed values
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tax_risk_control_rows_response_check'
  ) then
    alter table public.tax_risk_control_rows
      add constraint tax_risk_control_rows_response_check
      check (response in ('Mitigate','Monitor','Accept'));
  end if;
end $$;

-- 2) Chance/Impact/Score checks (NULL-friendly)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trcr_likelihood_1_5') then
    alter table public.tax_risk_control_rows
      add constraint trcr_likelihood_1_5
      check (inherent_likelihood is null or inherent_likelihood between 1 and 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trcr_impact_1_5') then
    alter table public.tax_risk_control_rows
      add constraint trcr_impact_1_5
      check (inherent_impact is null or inherent_impact between 1 and 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trcr_score_1_25') then
    alter table public.tax_risk_control_rows
      add constraint trcr_score_1_25
      check (inherent_score is null or inherent_score between 1 and 25);
  end if;
end $$;

-- 3) Indexes for list/filter/sort
create index if not exists idx_trcr_client_process
  on public.tax_risk_control_rows (client_id, process_id);

create index if not exists idx_trcr_client_created_desc
  on public.tax_risk_control_rows (client_id, created_at desc);

create index if not exists idx_trcr_client_score_desc
  on public.tax_risk_control_rows (client_id, inherent_score desc);

-- 4) tax_function_rows unique (client_id, process_name) for process upsert
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tax_function_rows_client_process_unique'
  ) then
    alter table public.tax_function_rows
      add constraint tax_function_rows_client_process_unique
      unique (client_id, process_name);
  end if;
end $$;
-- Creator fields
alter table public.tax_risk_control_rows
  add column if not exists created_by_user_id uuid null,
  add column if not exists created_by_display text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tax_risk_control_rows_created_by_user_id_fkey'
  ) then
    alter table public.tax_risk_control_rows
      add constraint tax_risk_control_rows_created_by_user_id_fkey
      foreign key (created_by_user_id) references public.app_users(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_trcr_client_created_by
  on public.tax_risk_control_rows (client_id, created_by_user_id);

-- Backfill creator display (best effort using legacy owner column if exists)
update public.tax_risk_control_rows
set created_by_display = coalesce(created_by_display, owner_display, owner)
where created_by_display is null;

-- If owner_display is still null but legacy owner exists, fill it too
update public.tax_risk_control_rows
set owner_display = coalesce(owner_display, owner)
where owner_display is null
  and owner is not null;
-- Risk Heatmap Aggregation Function
-- Aggregates risks by likelihood and impact using SQL GROUP BY

create or replace function public.get_risk_heatmap_aggregation(p_client_id uuid)
returns table(
  likelihood integer,
  impact integer,
  count_total bigint
)
language sql
stable
as $$
  select
    inherent_likelihood as likelihood,
    inherent_impact as impact,
    count(*) as count_total
  from public.tax_risk_control_rows
  where client_id = p_client_id
    and inherent_likelihood is not null
    and inherent_impact is not null
  group by inherent_likelihood, inherent_impact
  having count(*) > 0
  order by inherent_likelihood, inherent_impact;
$$;
-- Migration: Add audit_logs table for tracking system actions
-- Created: 2025-12-31

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Actor information
  client_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  
  -- Action details
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  
  -- Additional context (JSONB for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for common queries
CREATE INDEX idx_audit_logs_client_id ON audit_logs(client_id);
CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id) WHERE entity_type IS NOT NULL;

-- RLS policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (backend only)
CREATE POLICY "Service role can insert audit logs"
  ON audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Users can view their own company's audit logs
CREATE POLICY "Users can view their company audit logs"
  ON audit_logs
  FOR SELECT
  USING (
    client_id IN (
      SELECT client_id 
      FROM app_users 
      WHERE id = (auth.jwt() ->> 'sub')::uuid
    )
  );

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
  ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM app_users 
      WHERE id = (auth.jwt() ->> 'sub')::uuid
      AND role = 'admin'
    )
  );

COMMENT ON TABLE audit_logs IS 'System-wide audit trail for tracking user actions and system events';
COMMENT ON COLUMN audit_logs.client_id IS 'Company/client associated with the action';
COMMENT ON COLUMN audit_logs.actor_user_id IS 'User who performed the action';
COMMENT ON COLUMN audit_logs.actor_role IS 'Role of the actor at the time of action';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (e.g., user.login, document.create)';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity affected (e.g., document, user, company)';
COMMENT ON COLUMN audit_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context data (must not contain sensitive information)';
-- Tax Risk Matrix Tables
-- Topics: categories for risk assessment (e.g., VAT, Corporate Tax, etc.)
CREATE TABLE IF NOT EXISTS tax_risk_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX idx_tax_risk_topics_client_id ON tax_risk_topics(client_id);

-- Dimensions: aspects to assess for each topic (e.g., Compliance, Reporting, etc.)
CREATE TABLE IF NOT EXISTS tax_risk_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX idx_tax_risk_dimensions_client_id ON tax_risk_dimensions(client_id);

-- Matrix Cells: intersection of topic and dimension with risk assessment
CREATE TABLE IF NOT EXISTS tax_risk_matrix_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES tax_risk_topics(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES tax_risk_dimensions(id) ON DELETE CASCADE,
  likelihood INTEGER NOT NULL DEFAULT 1 CHECK (likelihood >= 1 AND likelihood <= 5),
  impact INTEGER NOT NULL DEFAULT 1 CHECK (impact >= 1 AND impact <= 5),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  notes TEXT,
  owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, topic_id, dimension_id)
);

CREATE INDEX idx_tax_risk_matrix_cells_client_id ON tax_risk_matrix_cells(client_id);
CREATE INDEX idx_tax_risk_matrix_cells_status ON tax_risk_matrix_cells(status);
CREATE INDEX idx_tax_risk_matrix_cells_topic_id ON tax_risk_matrix_cells(topic_id);
CREATE INDEX idx_tax_risk_matrix_cells_dimension_id ON tax_risk_matrix_cells(dimension_id);

-- RLS Policies for tax_risk_topics
ALTER TABLE tax_risk_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view topics for their clients"
  ON tax_risk_topics FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert topics for their clients"
  ON tax_risk_topics FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update topics for their clients"
  ON tax_risk_topics FOR UPDATE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete topics for their clients"
  ON tax_risk_topics FOR DELETE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

-- RLS Policies for tax_risk_dimensions
ALTER TABLE tax_risk_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dimensions for their clients"
  ON tax_risk_dimensions FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert dimensions for their clients"
  ON tax_risk_dimensions FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update dimensions for their clients"
  ON tax_risk_dimensions FOR UPDATE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete dimensions for their clients"
  ON tax_risk_dimensions FOR DELETE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

-- RLS Policies for tax_risk_matrix_cells
ALTER TABLE tax_risk_matrix_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view matrix cells for their clients"
  ON tax_risk_matrix_cells FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert matrix cells for their clients"
  ON tax_risk_matrix_cells FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update matrix cells for their clients"
  ON tax_risk_matrix_cells FOR UPDATE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete matrix cells for their clients"
  ON tax_risk_matrix_cells FOR DELETE
  USING (
    client_id IN (
      SELECT client_id FROM app_users WHERE id = auth.uid()
    )
  );
-- Replace Tax Risk Matrix with Excel-based cell range model
-- Drop the topic×dimension model and replace with section-based cell storage

-- Drop existing tables from 20260106 migration
DROP TABLE IF EXISTS tax_risk_matrix_cells CASCADE;
DROP TABLE IF EXISTS tax_risk_dimensions CASCADE;
DROP TABLE IF EXISTS tax_risk_topics CASCADE;

-- Drop old tax_risk_matrix_entries table if it exists (from 20250101_init.sql)
DROP TABLE IF EXISTS tax_risk_matrix_entries CASCADE;

-- Create new tax_risk_matrix_entries table for Excel-based cell ranges
CREATE TABLE public.tax_risk_matrix_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('B3:E8', 'J14:N14')),
  row_index INTEGER NOT NULL CHECK (row_index >= 0),
  col_index INTEGER NOT NULL CHECK (col_index >= 0),
  value_text TEXT,
  value_number NUMERIC,
  color TEXT NOT NULL DEFAULT 'green' CHECK (color IN ('green', 'orange', 'red', 'none')),
  updated_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, section, row_index, col_index)
);

-- Create indexes for efficient querying
CREATE INDEX idx_tax_risk_matrix_entries_client_section ON public.tax_risk_matrix_entries(client_id, section);
CREATE INDEX idx_tax_risk_matrix_entries_client_id ON public.tax_risk_matrix_entries(client_id);

-- Enable RLS
ALTER TABLE public.tax_risk_matrix_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Client users can view their own matrix entries
CREATE POLICY "tax_risk_matrix_entries_client_select_own"
ON public.tax_risk_matrix_entries
FOR SELECT
USING (
  public.is_client() AND client_id = public.current_client_id()
);

-- RLS Policies: Only admins can modify matrix entries
CREATE POLICY "tax_risk_matrix_entries_admin_full_access"
ON public.tax_risk_matrix_entries
FOR ALL
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);
-- Restore Topic×Dimension Tax Risk Matrix Model
-- Replace Excel-based cell range model with proper topic×dimension structure

-- Drop existing Excel-based table
DROP TABLE IF EXISTS tax_risk_matrix_entries CASCADE;

-- Create tax_risk_topics table
CREATE TABLE public.tax_risk_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX idx_tax_risk_topics_client_id ON public.tax_risk_topics(client_id);

-- Create tax_risk_dimensions table
CREATE TABLE public.tax_risk_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX idx_tax_risk_dimensions_client_id ON public.tax_risk_dimensions(client_id);

-- Create tax_risk_matrix_cells table
CREATE TABLE public.tax_risk_matrix_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.tax_risk_topics(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES public.tax_risk_dimensions(id) ON DELETE CASCADE,
  likelihood INTEGER NOT NULL DEFAULT 1 CHECK (likelihood >= 1 AND likelihood <= 5),
  impact INTEGER NOT NULL DEFAULT 1 CHECK (impact >= 1 AND impact <= 5),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  notes TEXT,
  owner_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, topic_id, dimension_id)
);

CREATE INDEX idx_tax_risk_matrix_cells_client_id ON public.tax_risk_matrix_cells(client_id);
CREATE INDEX idx_tax_risk_matrix_cells_client_status ON public.tax_risk_matrix_cells(client_id, status);
CREATE INDEX idx_tax_risk_matrix_cells_topic_id ON public.tax_risk_matrix_cells(topic_id);
CREATE INDEX idx_tax_risk_matrix_cells_dimension_id ON public.tax_risk_matrix_cells(dimension_id);

-- Enable RLS on tax_risk_topics
ALTER TABLE public.tax_risk_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_risk_topics_client_select_own"
ON public.tax_risk_topics
FOR SELECT
USING (
  public.is_client() AND client_id = public.current_client_id()
);

CREATE POLICY "tax_risk_topics_admin_full_access"
ON public.tax_risk_topics
FOR ALL
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

-- Enable RLS on tax_risk_dimensions
ALTER TABLE public.tax_risk_dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_risk_dimensions_client_select_own"
ON public.tax_risk_dimensions
FOR SELECT
USING (
  public.is_client() AND client_id = public.current_client_id()
);

CREATE POLICY "tax_risk_dimensions_admin_full_access"
ON public.tax_risk_dimensions
FOR ALL
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);

-- Enable RLS on tax_risk_matrix_cells
ALTER TABLE public.tax_risk_matrix_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_risk_matrix_cells_client_select_own"
ON public.tax_risk_matrix_cells
FOR SELECT
USING (
  public.is_client() AND client_id = public.current_client_id()
);

CREATE POLICY "tax_risk_matrix_cells_admin_full_access"
ON public.tax_risk_matrix_cells
FOR ALL
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);
-- Migration: Add document_exports table for ZIP export functionality
-- Created: 2026-01-22

-- Create document_exports table
CREATE TABLE IF NOT EXISTS document_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  document_ids JSONB NOT NULL,
  storage_key TEXT NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_document_exports_client_id ON document_exports(client_id);
CREATE INDEX idx_document_exports_status ON document_exports(status);
CREATE INDEX idx_document_exports_created_at ON document_exports(created_at DESC);

-- Add RLS policies
ALTER TABLE document_exports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view exports for their client
CREATE POLICY "Users can view exports for their client"
  ON document_exports
  FOR SELECT
  USING (
    client_id IN (
      SELECT client_id 
      FROM app_users 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create exports for their client
CREATE POLICY "Users can create exports for their client"
  ON document_exports
  FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id 
      FROM app_users 
      WHERE user_id = auth.uid()
    )
  );

-- Add comment
COMMENT ON TABLE document_exports IS 'Tracks document export requests for ZIP downloads';
-- Migration: Add document folders and tags
-- PR-7: Document organization with folders and tags

-- 1) Create document_folders table
CREATE TABLE IF NOT EXISTS public.document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NULL,
  UNIQUE(client_id, name)
);

-- 2) Create document_tags table
CREATE TABLE IF NOT EXISTS public.document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, name)
);

-- 3) Create document_tag_links table
CREATE TABLE IF NOT EXISTS public.document_tag_links (
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.document_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

-- 4) Add folder_id to documents table
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS folder_id UUID NULL REFERENCES public.document_folders(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_folders_client_id ON public.document_folders(client_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_client_id ON public.document_tags(client_id);
CREATE INDEX IF NOT EXISTS idx_document_tag_links_document_id ON public.document_tag_links(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tag_links_tag_id ON public.document_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON public.documents(folder_id);

-- Enable RLS
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tag_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_folders
CREATE POLICY "Users can view folders for their clients"
  ON public.document_folders FOR SELECT
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create folders for their clients"
  ON public.document_folders FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update folders for their clients"
  ON public.document_folders FOR UPDATE
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete folders for their clients"
  ON public.document_folders FOR DELETE
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for document_tags
CREATE POLICY "Users can view tags for their clients"
  ON public.document_tags FOR SELECT
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tags for their clients"
  ON public.document_tags FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tags for their clients"
  ON public.document_tags FOR DELETE
  USING (
    client_id IN (
      SELECT ca.client_id 
      FROM public.client_access ca
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for document_tag_links
CREATE POLICY "Users can view tag links for their documents"
  ON public.document_tag_links FOR SELECT
  USING (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tag links for their documents"
  ON public.document_tag_links FOR INSERT
  WITH CHECK (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tag links for their documents"
  ON public.document_tag_links FOR DELETE
  USING (
    document_id IN (
      SELECT d.id 
      FROM public.documents d
      JOIN public.client_access ca ON d.client_id = ca.client_id
      JOIN public.app_users au ON ca.user_id = au.id
      WHERE au.auth_user_id = auth.uid()
    )
  );
-- Migration: Add document preview support (PR-8)
-- Description: Adds preview metadata fields to documents table and creates job queue table

-- ============================================================================
-- 1. Add preview fields to documents table
-- ============================================================================

ALTER TABLE public.documents
ADD COLUMN preview_status text NULL CHECK (preview_status IN ('pending', 'ready', 'failed')),
ADD COLUMN preview_storage_key text NULL,
ADD COLUMN preview_mime_type text NULL,
ADD COLUMN preview_size bigint NULL,
ADD COLUMN preview_updated_at timestamptz NULL,
ADD COLUMN preview_error text NULL;

COMMENT ON COLUMN public.documents.preview_status IS 'Status of preview generation: pending, ready, or failed';
COMMENT ON COLUMN public.documents.preview_storage_key IS 'Storage path for preview thumbnail (webp format)';
COMMENT ON COLUMN public.documents.preview_mime_type IS 'MIME type of preview (typically image/webp)';
COMMENT ON COLUMN public.documents.preview_size IS 'Size of preview file in bytes';
COMMENT ON COLUMN public.documents.preview_updated_at IS 'Timestamp when preview was last updated';
COMMENT ON COLUMN public.documents.preview_error IS 'Last error message if preview generation failed (truncated to 500 chars)';

-- Add index for querying documents by preview status
CREATE INDEX idx_documents_preview_status ON public.documents(preview_status) WHERE preview_status IS NOT NULL;

-- ============================================================================
-- 2. Create document_preview_jobs table for job queue
-- ============================================================================

CREATE TABLE public.document_preview_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  locked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

COMMENT ON TABLE public.document_preview_jobs IS 'Queue for document preview generation jobs';
COMMENT ON COLUMN public.document_preview_jobs.status IS 'Job status: pending, processing, done, or failed';
COMMENT ON COLUMN public.document_preview_jobs.attempts IS 'Number of processing attempts';
COMMENT ON COLUMN public.document_preview_jobs.last_error IS 'Last error message if job failed';
COMMENT ON COLUMN public.document_preview_jobs.locked_at IS 'Timestamp when job was locked for processing';

-- Indexes for efficient job processing
CREATE INDEX idx_preview_jobs_status ON public.document_preview_jobs(status);
CREATE INDEX idx_preview_jobs_pending ON public.document_preview_jobs(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_preview_jobs_document_id ON public.document_preview_jobs(document_id);

-- ============================================================================
-- 3. RLS Policies for document_preview_jobs
-- ============================================================================

-- Enable RLS
ALTER TABLE public.document_preview_jobs ENABLE ROW LEVEL SECURITY;

-- Admin users can do everything
CREATE POLICY "Admin users can manage all preview jobs"
  ON public.document_preview_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- Client users can view their own client's preview jobs
CREATE POLICY "Client users can view their preview jobs"
  ON public.document_preview_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.client_id = document_preview_jobs.client_id
    )
  );

-- ============================================================================
-- 4. Function to automatically update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_preview_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_preview_jobs_updated_at
  BEFORE UPDATE ON public.document_preview_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_preview_jobs_updated_at();

-- ============================================================================
-- 5. Helper function to enqueue preview job (idempotent)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_document_preview_job(
  p_client_id uuid,
  p_document_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- Insert or get existing job (idempotent)
  INSERT INTO public.document_preview_jobs (client_id, document_id, status)
  VALUES (p_client_id, p_document_id, 'pending')
  ON CONFLICT (document_id) DO NOTHING
  RETURNING id INTO v_job_id;
  
  -- If job already existed, get its ID
  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id
    FROM public.document_preview_jobs
    WHERE document_id = p_document_id;
  END IF;
  
  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.enqueue_document_preview_job IS 'Idempotently enqueue a preview generation job for a document';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.enqueue_document_preview_job TO authenticated;
-- Migration: Add soft-delete support for documents
-- PR-6: Document soft-delete (archive) with safe storage cleanup
-- Created: 2026-01-22

-- Add soft-delete columns to documents table
alter table public.documents
  add column deleted_at timestamptz null,
  add column deleted_by text null;

-- Add index for efficient filtering of deleted documents
create index if not exists idx_documents_client_deleted 
  on public.documents(client_id, deleted_at);

-- Add comment for documentation
comment on column public.documents.deleted_at is 'Timestamp when document was soft-deleted (archived)';
comment on column public.documents.deleted_by is 'User ID (sub) who deleted the document';
comment on index idx_documents_client_deleted is 'Composite index for filtering active/deleted documents by client';
-- Add external storage integration support
-- Migration: 20260122_add_external_storage.sql

-- 1. Create external_storage_connections table
CREATE TABLE IF NOT EXISTS public.external_storage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'revoked', 'error')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  provider_account_id TEXT,
  root_folder_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, provider)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_external_storage_connections_client_provider 
  ON public.external_storage_connections(client_id, provider);

-- 2. Add external storage fields to documents table
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS external_provider TEXT CHECK (external_provider IN ('google_drive', 'microsoft_graph')),
  ADD COLUMN IF NOT EXISTS external_file_id TEXT,
  ADD COLUMN IF NOT EXISTS external_drive_id TEXT,
  ADD COLUMN IF NOT EXISTS external_web_url TEXT,
  ADD COLUMN IF NOT EXISTS external_sync_status TEXT CHECK (external_sync_status IN ('pending', 'synced', 'failed')),
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_error TEXT;

-- Index for external sync status queries
CREATE INDEX IF NOT EXISTS idx_documents_external_sync_status 
  ON public.documents(external_sync_status) 
  WHERE external_sync_status IS NOT NULL;

-- 3. Create external_upload_jobs table
CREATE TABLE IF NOT EXISTS public.external_upload_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

-- Indexes for job processing
CREATE INDEX IF NOT EXISTS idx_external_upload_jobs_status 
  ON public.external_upload_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_external_upload_jobs_client 
  ON public.external_upload_jobs(client_id);

-- 4. Add client settings for external storage (if client_settings doesn't exist, create it)
CREATE TABLE IF NOT EXISTS public.client_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
  documents_mirror_provider TEXT CHECK (documents_mirror_provider IN ('google_drive', 'microsoft_graph')),
  documents_mirror_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- If client_settings already exists, add columns conditionally
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_settings') THEN
    ALTER TABLE public.client_settings
      ADD COLUMN IF NOT EXISTS documents_mirror_provider TEXT CHECK (documents_mirror_provider IN ('google_drive', 'microsoft_graph')),
      ADD COLUMN IF NOT EXISTS documents_mirror_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 5. RLS Policies for external_storage_connections
ALTER TABLE public.external_storage_connections ENABLE ROW LEVEL SECURITY;

-- Admin can see all connections
CREATE POLICY "Admin can view all external storage connections"
  ON public.external_storage_connections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- Client users can only see their own client's connections
CREATE POLICY "Client users can view their client's external storage connections"
  ON public.external_storage_connections
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'client'
    )
  );

-- Admin can manage all connections
CREATE POLICY "Admin can manage all external storage connections"
  ON public.external_storage_connections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- 6. RLS Policies for external_upload_jobs
ALTER TABLE public.external_upload_jobs ENABLE ROW LEVEL SECURITY;

-- Admin can see all jobs
CREATE POLICY "Admin can view all external upload jobs"
  ON public.external_upload_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- Client users can see their own client's jobs
CREATE POLICY "Client users can view their client's external upload jobs"
  ON public.external_upload_jobs
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'client'
    )
  );

-- 7. RLS Policies for client_settings
ALTER TABLE public.client_settings ENABLE ROW LEVEL SECURITY;

-- Admin can see all settings
CREATE POLICY "Admin can view all client settings"
  ON public.client_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- Client users can see their own settings
CREATE POLICY "Client users can view their client settings"
  ON public.client_settings
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'client'
    )
  );

-- Admin can manage all settings
CREATE POLICY "Admin can manage all client settings"
  ON public.client_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );

-- 8. Function to enqueue external upload job
CREATE OR REPLACE FUNCTION enqueue_external_upload_job(
  p_client_id UUID,
  p_document_id UUID,
  p_provider TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Check if job already exists for this document
  SELECT id INTO v_job_id
  FROM public.external_upload_jobs
  WHERE document_id = p_document_id;
  
  IF v_job_id IS NOT NULL THEN
    RETURN v_job_id;
  END IF;
  
  -- Create new job
  INSERT INTO public.external_upload_jobs (client_id, document_id, provider)
  VALUES (p_client_id, p_document_id, p_provider)
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

-- 9. Atomic job claim function with SKIP LOCKED to prevent race conditions
CREATE OR REPLACE FUNCTION claim_external_upload_job()
RETURNS TABLE (
  id UUID,
  client_id UUID,
  document_id UUID,
  provider TEXT,
  status TEXT,
  attempts INT,
  last_error TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.external_upload_jobs
  SET 
    status = 'processing',
    updated_at = NOW()
  WHERE id = (
    SELECT external_upload_jobs.id
    FROM public.external_upload_jobs
    WHERE status IN ('pending', 'failed')
      AND attempts < 3
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    external_upload_jobs.id,
    external_upload_jobs.client_id,
    external_upload_jobs.document_id,
    external_upload_jobs.provider,
    external_upload_jobs.status,
    external_upload_jobs.attempts,
    external_upload_jobs.last_error,
    external_upload_jobs.created_at,
    external_upload_jobs.updated_at;
END;
$$;
-- Migration: Add messaging tables for client-admin communication
-- Created: 2026-01-22
-- Description: Creates client_conversations, messages, and message_attachments tables with RLS policies

-- 1. Create client_conversations table (single thread per client)
CREATE TABLE IF NOT EXISTS public.client_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- 2. Create indexes for client_conversations
CREATE INDEX IF NOT EXISTS idx_client_conversations_client_id ON public.client_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_conversations_last_message_at_desc ON public.client_conversations(last_message_at DESC);

-- 3. Add comments for documentation
COMMENT ON TABLE public.client_conversations IS 'Conversation threads between clients and admins (one per client)';
COMMENT ON COLUMN public.client_conversations.client_id IS 'Foreign key to clients table (unique constraint ensures single thread per client)';
COMMENT ON COLUMN public.client_conversations.last_message_at IS 'Timestamp of the most recent message in this conversation';

-- 4. Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_client_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for updated_at
CREATE TRIGGER client_conversations_updated_at_trigger
  BEFORE UPDATE ON public.client_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_conversations_updated_at();

-- 6. Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.client_conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.app_users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'client')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Create indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_client_id_created_at_desc ON public.messages(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at_asc ON public.messages(conversation_id, created_at ASC);

-- 8. Add comments for messages table
COMMENT ON TABLE public.messages IS 'Messages exchanged between clients and admins';
COMMENT ON COLUMN public.messages.client_id IS 'Denormalized client_id for efficient filtering and export';
COMMENT ON COLUMN public.messages.sender_user_id IS 'User who sent the message';
COMMENT ON COLUMN public.messages.sender_role IS 'Role of the sender at the time of sending (admin or client)';
COMMENT ON COLUMN public.messages.body IS 'Plain text message content (max 10000 chars enforced at API layer)';

-- 9. Create message_attachments table
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, document_id)
);

-- 10. Create indexes for message_attachments
CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_client_id ON public.message_attachments(client_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_document_id ON public.message_attachments(document_id);

-- 11. Add comments for message_attachments table
COMMENT ON TABLE public.message_attachments IS 'Links messages to document attachments';
COMMENT ON COLUMN public.message_attachments.client_id IS 'Denormalized client_id for ownership validation';
COMMENT ON COLUMN public.message_attachments.document_id IS 'Reference to document in documents table';

-- 12. Enable Row Level Security on all tables
ALTER TABLE public.client_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- 13. RLS Policies for client_conversations

-- Client users can view their own conversation
DROP POLICY IF EXISTS "client_conversations_client_select_own" ON public.client_conversations;
CREATE POLICY "client_conversations_client_select_own"
ON public.client_conversations
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Client users can insert their own conversation
DROP POLICY IF EXISTS "client_conversations_client_insert_own" ON public.client_conversations;
CREATE POLICY "client_conversations_client_insert_own"
ON public.client_conversations
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Client users can update their own conversation
DROP POLICY IF EXISTS "client_conversations_client_update_own" ON public.client_conversations;
CREATE POLICY "client_conversations_client_update_own"
ON public.client_conversations
FOR UPDATE
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
)
WITH CHECK (
  client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Admin has full access to all conversations
DROP POLICY IF EXISTS "client_conversations_admin_full_access" ON public.client_conversations;
CREATE POLICY "client_conversations_admin_full_access"
ON public.client_conversations
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'admin'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);

-- Service role can do everything (for backend operations)
DROP POLICY IF EXISTS "client_conversations_service_role_full_access" ON public.client_conversations;
CREATE POLICY "client_conversations_service_role_full_access"
ON public.client_conversations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 14. RLS Policies for messages

-- Client users can view messages in their conversation
DROP POLICY IF EXISTS "messages_client_select_own" ON public.messages;
CREATE POLICY "messages_client_select_own"
ON public.messages
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Client users can insert messages in their conversation
DROP POLICY IF EXISTS "messages_client_insert_own" ON public.messages;
CREATE POLICY "messages_client_insert_own"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Admin has full access to all messages
DROP POLICY IF EXISTS "messages_admin_full_access" ON public.messages;
CREATE POLICY "messages_admin_full_access"
ON public.messages
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'admin'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);

-- Service role can do everything (for backend operations)
DROP POLICY IF EXISTS "messages_service_role_full_access" ON public.messages;
CREATE POLICY "messages_service_role_full_access"
ON public.messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 15. RLS Policies for message_attachments

-- Client users can view attachments in their messages
DROP POLICY IF EXISTS "message_attachments_client_select_own" ON public.message_attachments;
CREATE POLICY "message_attachments_client_select_own"
ON public.message_attachments
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Client users can insert attachments in their messages
DROP POLICY IF EXISTS "message_attachments_client_insert_own" ON public.message_attachments;
CREATE POLICY "message_attachments_client_insert_own"
ON public.message_attachments
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'role' = 'client'
  AND client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- Admin has full access to all message attachments
DROP POLICY IF EXISTS "message_attachments_admin_full_access" ON public.message_attachments;
CREATE POLICY "message_attachments_admin_full_access"
ON public.message_attachments
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'admin'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);

-- Service role can do everything (for backend operations)
DROP POLICY IF EXISTS "message_attachments_service_role_full_access" ON public.message_attachments;
CREATE POLICY "message_attachments_service_role_full_access"
ON public.message_attachments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
