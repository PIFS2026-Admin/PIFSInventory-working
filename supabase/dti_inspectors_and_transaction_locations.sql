alter table public.pipe_transactions
  add column if not exists yard_id uuid references public.yards(id),
  add column if not exists rack_id uuid references public.racks(id),
  add column if not exists workflow_zone_id uuid references public.workflow_zones(id);

create table if not exists public.inspectors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null default 'lead_inspector' check (role in ('lead_inspector', 'level_2_inspector', 'crew_lead', 'both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inspectors_full_name_role_key
  on public.inspectors (lower(full_name), role);

alter table public.inspectors enable row level security;

drop policy if exists "inspectors internal read" on public.inspectors;
drop policy if exists "inspectors internal write" on public.inspectors;

create policy "inspectors internal read"
on public.inspectors
for select
to authenticated
using (public.current_user_role()::text in ('admin', 'employee', 'dti_superintendent', 'dti_lead'));

create policy "inspectors internal write"
on public.inspectors
for all
to authenticated
using (public.current_user_role()::text in ('admin', 'employee', 'dti_superintendent'))
with check (public.current_user_role()::text in ('admin', 'employee', 'dti_superintendent'));

grant select, insert, update, delete on public.inspectors to authenticated;
