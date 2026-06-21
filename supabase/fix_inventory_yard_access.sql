-- TITAN Inventory / PO yard access setup
-- Run this once in Supabase SQL Editor.

insert into public.yards (name, code)
values
  ('Pathfinder Yard WTX', 'PIFS'),
  ('Gillette Yard', 'GILLETTE'),
  ('Casper Yard', 'CASPER'),
  ('Dickinson Yard', 'DICKINSON')
on conflict (code) do update
set name = excluded.name;

create table if not exists public.inventory_user_yards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  yard_id uuid not null references public.yards(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, yard_id)
);

create index if not exists inventory_user_yards_user_id_idx
  on public.inventory_user_yards (user_id);

create index if not exists inventory_user_yards_yard_id_idx
  on public.inventory_user_yards (yard_id);

alter table public.inventory_user_yards enable row level security;

grant select, insert, update, delete on public.inventory_user_yards to authenticated;

drop policy if exists "inventory user yards self read" on public.inventory_user_yards;
create policy "inventory user yards self read"
on public.inventory_user_yards
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "inventory user yards internal full" on public.inventory_user_yards;
create policy "inventory user yards internal full"
on public.inventory_user_yards
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'employee', 'inventory_specialist', 'inventory_manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'employee', 'inventory_specialist', 'inventory_manager')
  )
);

insert into public.inventory_user_yards (user_id, yard_id)
select u.id, y.id
from auth.users u
cross join public.yards y
where lower(u.email) = 'wade@pathfinderinspections.com'
  and y.code in ('PIFS', 'GILLETTE', 'CASPER', 'DICKINSON')
on conflict (user_id, yard_id) do nothing;
