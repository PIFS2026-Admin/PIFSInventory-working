begin;

alter table public.titan_financial_reviews add column if not exists range_start date;
alter table public.titan_financial_reviews add column if not exists range_end date;
alter table public.titan_financial_reviews add column if not exists compare_mode text not null default 'prior';
alter table public.titan_financial_reviews alter column quarter drop not null;

update public.titan_financial_reviews
set
  range_start = make_date(split_part(quarter, '-Q', 1)::integer, (split_part(quarter, '-Q', 2)::integer - 1) * 3 + 1, 1),
  range_end = (make_date(split_part(quarter, '-Q', 1)::integer, (split_part(quarter, '-Q', 2)::integer - 1) * 3 + 1, 1) + interval '3 months' - interval '1 day')::date
where quarter is not null and (range_start is null or range_end is null);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'titan_financial_reviews_compare_mode_chk') then
    alter table public.titan_financial_reviews add constraint titan_financial_reviews_compare_mode_chk
      check (compare_mode in ('prior', 'year'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'titan_financial_reviews_range_chk') then
    alter table public.titan_financial_reviews add constraint titan_financial_reviews_range_chk
      check (range_start is not null and range_end is not null and range_end >= range_start);
  end if;
end $$;

create unique index if not exists titan_financial_reviews_custom_range_uq
  on public.titan_financial_reviews(yard_id, service_line, range_start, range_end)
  where quarter is null;

comment on column public.titan_financial_reviews.compare_mode is
  'Comparison used by the frozen review snapshot: prior equal-length period or the same dates last year.';

commit;
