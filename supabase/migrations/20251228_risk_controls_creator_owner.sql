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
