-- Migration: Add indexes for admin time entries global listing
-- Created: 2026-02-20
-- Purpose: Optimize performance for /api/admin/time-entries endpoint

-- Index for filtering by client_id and sorting by entry_date
create index if not exists idx_time_entries_client_date
on public.time_entries (client_id, entry_date desc)
where deleted_at is null;

-- Index for filtering by advisor_user_id
create index if not exists idx_time_entries_advisor
on public.time_entries (advisor_user_id)
where deleted_at is null;

-- Index for sorting by entry_date (global queries)
create index if not exists idx_time_entries_entry_date
on public.time_entries (entry_date desc, created_at desc)
where deleted_at is null;

-- Index for filtering by billable status
create index if not exists idx_time_entries_billable
on public.time_entries (is_billable)
where deleted_at is null;

-- Composite index for common filter combinations
create index if not exists idx_time_entries_client_advisor_date
on public.time_entries (client_id, advisor_user_id, entry_date desc)
where deleted_at is null;
