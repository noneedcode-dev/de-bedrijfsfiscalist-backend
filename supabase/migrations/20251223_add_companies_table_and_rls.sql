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
create policy "companies_client_select_own"
on public.companies
for select
using (
  auth.jwt() ->> 'role' = 'client'
  and client_id = (auth.jwt() ->> 'client_id')::uuid
);

-- 6. RLS Policy: Client users can update their own company
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
