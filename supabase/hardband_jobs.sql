create table if not exists public.hardband_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  job_source text not null default 'inventory',
  company_id uuid not null references public.companies(id),
  yard_id uuid references public.yards(id),
  pipe_inventory_id uuid references public.pipe_inventory(id) on delete set null,
  machine_shop_work_order text,
  field_ticket_number text,
  rig_number text,
  afe text,
  part_number text,
  size text,
  grade text,
  connection text,
  pipe_range text,
  condition text,
  total_joints numeric not null default 0,
  total_footage numeric not null default 0,
  from_location text,
  to_location text,
  wire_type text,
  operator_name text,
  operator_signature text,
  status text not null default 'Open',
  notes text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hardband_job_line_items (
  id uuid primary key default gen_random_uuid(),
  hardband_job_id uuid not null references public.hardband_jobs(id) on delete cascade,
  line_number integer not null default 1,
  serial_number text not null,
  flush_grind_box boolean not null default false,
  flush_grind_pin boolean not null default false,
  grind_out_box boolean not null default false,
  grind_out_pin boolean not null default false,
  hardband_box boolean not null default false,
  hardband_pin boolean not null default false,
  wire_type text,
  operator_name text,
  operator_signature text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hardband_jobs_company_id_idx
on public.hardband_jobs(company_id);

create index if not exists hardband_jobs_yard_id_idx
on public.hardband_jobs(yard_id);

create index if not exists hardband_job_line_items_job_id_idx
on public.hardband_job_line_items(hardband_job_id);

alter table public.hardband_jobs enable row level security;
alter table public.hardband_job_line_items enable row level security;

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

drop policy if exists "hardband jobs customer read own" on public.hardband_jobs;
create policy "hardband jobs customer read own"
on public.hardband_jobs
for select
to authenticated
using (company_id = public.current_user_company_id());

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

drop policy if exists "hardband line items customer read own" on public.hardband_job_line_items;
create policy "hardband line items customer read own"
on public.hardband_job_line_items
for select
to authenticated
using (
  exists (
    select 1
    from public.hardband_jobs job
    where job.id = hardband_job_id
      and job.company_id = public.current_user_company_id()
  )
);

grant select, insert, update, delete on public.hardband_jobs to authenticated;
grant select, insert, update, delete on public.hardband_job_line_items to authenticated;

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
