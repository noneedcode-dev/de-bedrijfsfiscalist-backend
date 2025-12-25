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
