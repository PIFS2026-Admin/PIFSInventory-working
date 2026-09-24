begin;

alter table public.titan_financial_tubing_revenue
  add column if not exists category_code text;

update public.titan_financial_tubing_revenue
set category_code = 'standard'
where category_code is null or trim(category_code) = '';

alter table public.titan_financial_tubing_revenue
  alter column category_code set default 'standard',
  alter column category_code set not null;

drop index if exists public.titan_financial_tubing_revenue_uq;
create unique index titan_financial_tubing_revenue_uq
  on public.titan_financial_tubing_revenue(yard_id, revenue_month, coalesce(customer,'(total)'), category_code);

insert into public.titan_financial_pick_list_values(yard_id, service_line, list_key, list_value, sort_order)
select yard.id, 'tu', 'revenue_category', category.list_value, category.sort_order
from public.yards yard
cross join (values ('Standard', 0), ('Junk', 10)) category(list_value, sort_order)
where yard.is_active
on conflict (yard_id, service_line, list_key, list_value) do update
set is_active = true, sort_order = excluded.sort_order, updated_at = now();

comment on column public.titan_financial_tubing_revenue.category_code is
  'Configurable Tubing revenue classification. Junk is a breakout within total revenue, never an additional total.';

commit;
