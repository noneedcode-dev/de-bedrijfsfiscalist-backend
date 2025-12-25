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
