create extension if not exists pgcrypto;

create table if not exists public.custom_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_key text not null check (
    source_key in (
      'pipe_inventory',
      'consumables',
      'issue_tickets',
      'issue_ticket_lines',
      'purchase_orders',
      'work_orders'
    )
  ),
  selected_columns text[] not null default '{}',
  filters jsonb not null default '{}'::jsonb,
  group_by text not null default '',
  active boolean not null default true,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_reports_owner_active_idx
  on public.custom_reports(owner_id, active, updated_at desc);

create index if not exists custom_reports_source_key_idx
  on public.custom_reports(source_key);

create or replace function public.set_custom_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_custom_reports_updated_at on public.custom_reports;
create trigger set_custom_reports_updated_at
before update on public.custom_reports
for each row execute function public.set_custom_reports_updated_at();

alter table public.custom_reports enable row level security;

grant select, insert, update on public.custom_reports to authenticated;

drop policy if exists "custom reports owner read" on public.custom_reports;
create policy "custom reports owner read"
on public.custom_reports
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (
    is_shared = true
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and coalesce(p.role::text, '') <> 'customer'
    )
  )
);

drop policy if exists "custom reports owner insert" on public.custom_reports;
create policy "custom reports owner insert"
on public.custom_reports
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') <> 'customer'
  )
);

drop policy if exists "custom reports owner update" on public.custom_reports;
create policy "custom reports owner update"
on public.custom_reports
for update
to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(coalesce(p.role::text, '')) in ('admin', 'owner', 'owners')
  )
)
with check (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(coalesce(p.role::text, '')) in ('admin', 'owner', 'owners')
  )
);
