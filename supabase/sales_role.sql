alter type public.user_role add value if not exists 'sales';

create or replace function public.is_staff_reader()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role()::text in ('admin', 'employee', 'sales'), false)
$$;

drop policy if exists "staff read companies" on public.companies;
create policy "staff read companies"
on public.companies
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "inventory staff read" on public.pipe_inventory;
create policy "inventory staff read"
on public.pipe_inventory
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "part numbers staff read" on public.part_numbers;
create policy "part numbers staff read"
on public.part_numbers
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "transactions staff read" on public.pipe_transactions;
create policy "transactions staff read"
on public.pipe_transactions
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "receiving tickets staff read" on public.receiving_tickets;
create policy "receiving tickets staff read"
on public.receiving_tickets
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "shipping tickets staff read" on public.shipping_tickets;
create policy "shipping tickets staff read"
on public.shipping_tickets
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "ticket line items staff read" on public.ticket_line_items;
create policy "ticket line items staff read"
on public.ticket_line_items
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "documents staff read" on public.documents;
create policy "documents staff read"
on public.documents
for select
to authenticated
using (public.is_staff_reader());

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
