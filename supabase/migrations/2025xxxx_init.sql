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
  score_color text,              -- green / amber / red
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
  inherent_color text,             -- green / amber / red

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
