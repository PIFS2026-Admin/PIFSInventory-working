create extension if not exists pgcrypto;

create table if not exists public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  equipment_name text not null,
  equipment_number text not null,
  equipment_type text not null,
  department text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_assets_name_idx
  on public.equipment_assets (equipment_name);

create index if not exists equipment_assets_number_idx
  on public.equipment_assets (equipment_number);

create index if not exists equipment_assets_type_department_idx
  on public.equipment_assets (equipment_type, department);

create or replace function public.set_equipment_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_equipment_assets_updated_at on public.equipment_assets;
create trigger set_equipment_assets_updated_at
before update on public.equipment_assets
for each row execute function public.set_equipment_assets_updated_at();

alter table public.equipment_assets enable row level security;

grant select, insert, update on public.equipment_assets to authenticated;

drop policy if exists "equipment assets internal read" on public.equipment_assets;
create policy "equipment assets internal read"
on public.equipment_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(coalesce(p.role::text, '')) <> 'customer'
  )
);

drop policy if exists "equipment assets admin write" on public.equipment_assets;
create policy "equipment assets admin write"
on public.equipment_assets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(coalesce(p.role::text, '')) in ('admin', 'owner')
  )
);

drop policy if exists "equipment assets admin update" on public.equipment_assets;
create policy "equipment assets admin update"
on public.equipment_assets
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(coalesce(p.role::text, '')) in ('admin', 'owner')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(coalesce(p.role::text, '')) in ('admin', 'owner')
  )
);
