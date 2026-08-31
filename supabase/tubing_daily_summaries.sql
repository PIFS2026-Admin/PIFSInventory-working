-- Tubing daily summaries mirror the proven DTI summary workflow while keeping
-- Tubing records, numbering, attachments, and permissions separate.

create table if not exists public.tubing_daily_summaries
  (like public.dti_daily_summaries including all);

create or replace function public.can_access_tubing_daily_summaries()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and lower(coalesce(role::text, '')) in (
        'admin',
        'employee',
        'service_line_manager',
        'tubing_lead',
        'tubing_hand'
      )
  );
$$;

alter table public.tubing_daily_summaries enable row level security;

drop policy if exists "tubing daily summaries authorized access"
  on public.tubing_daily_summaries;
create policy "tubing daily summaries authorized access"
on public.tubing_daily_summaries
for all
to authenticated
using (public.can_access_tubing_daily_summaries())
with check (public.can_access_tubing_daily_summaries());

grant execute on function public.can_access_tubing_daily_summaries() to authenticated;
grant select, insert, update, delete on public.tubing_daily_summaries to authenticated;
