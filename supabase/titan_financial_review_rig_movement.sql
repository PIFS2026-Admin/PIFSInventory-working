-- Enables dated rig gains and losses as a controlled Financial Review section.

begin;

do $$ begin
  if to_regclass('public.titan_financial_review_sections') is null then
    raise exception 'Run titan_financial_review_sections.sql first.';
  end if;
  if to_regclass('public.titan_financial_market_cells') is null
     or to_regclass('public.titan_financial_market_rigs') is null then
    raise exception 'Run titan_financial_market.sql first.';
  end if;
end $$;

alter table public.titan_financial_review_sections
  drop constraint if exists titan_financial_review_sections_kind_check;
alter table public.titan_financial_review_sections
  add constraint titan_financial_review_sections_kind_check
  check (kind in ('metric', 'chart', 'narrative', 'manual_metric', 'photo', 'rig_movement'));

create table if not exists public.titan_financial_features (
  feature_key text primary key,
  enabled_at timestamptz not null default now()
);

insert into public.titan_financial_features(feature_key)
values ('review_rig_movement')
on conflict (feature_key) do nothing;

alter table public.titan_financial_features enable row level security;
grant select on public.titan_financial_features to service_role;

comment on table public.titan_financial_features is
  'Installed Financials schema capabilities used to keep optional controlled features fail-closed.';

commit;
