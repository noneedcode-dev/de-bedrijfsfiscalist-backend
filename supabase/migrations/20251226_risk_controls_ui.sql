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
