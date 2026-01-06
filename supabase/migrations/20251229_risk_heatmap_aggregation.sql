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
