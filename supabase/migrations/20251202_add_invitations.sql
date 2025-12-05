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

