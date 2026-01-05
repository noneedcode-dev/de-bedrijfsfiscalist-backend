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
