alter type public.user_role add value if not exists 'operator';

alter table public.hardband_jobs
add column if not exists job_source text not null default 'inventory',
add column if not exists machine_shop_work_order text,
add column if not exists field_ticket_number text,
add column if not exists rig_number text,
add column if not exists closed_at timestamptz,
add column if not exists closed_by uuid references auth.users(id);

create or replace function public.is_hardband_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'employee', 'operator'), false)
$$;

drop policy if exists "hardband jobs internal full" on public.hardband_jobs;
create policy "hardband jobs internal full"
on public.hardband_jobs
for all
to authenticated
using (public.is_hardband_user())
with check (public.is_hardband_user());

drop policy if exists "hardband line items internal full" on public.hardband_job_line_items;
create policy "hardband line items internal full"
on public.hardband_job_line_items
for all
to authenticated
using (
  exists (
    select 1
    from public.hardband_jobs job
    where job.id = hardband_job_id
      and public.is_hardband_user()
  )
)
with check (
  exists (
    select 1
    from public.hardband_jobs job
    where job.id = hardband_job_id
      and public.is_hardband_user()
  )
);

drop policy if exists "hardband jobs staff read" on public.hardband_jobs;
create policy "hardband jobs staff read"
on public.hardband_jobs
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "hardband line items staff read" on public.hardband_job_line_items;
create policy "hardband line items staff read"
on public.hardband_job_line_items
for select
to authenticated
using (
  exists (
    select 1
    from public.hardband_jobs job
    where job.id = hardband_job_id
      and public.is_staff_reader()
  )
);

drop policy if exists "hardband users read companies" on public.companies;
create policy "hardband users read companies"
on public.companies
for select
to authenticated
using (public.is_hardband_user());

drop policy if exists "hardband users insert companies" on public.companies;
create policy "hardband users insert companies"
on public.companies
for insert
to authenticated
with check (public.is_hardband_user());
