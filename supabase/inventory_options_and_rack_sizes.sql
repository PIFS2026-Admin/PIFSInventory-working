-- Editable inventory statuses/conditions and saved rack tile sizes.
-- Run this once in the Supabase SQL editor before using the new admin options.

alter table public.racks
  add column if not exists layout_width integer,
  add column if not exists layout_height integer;

-- Status must be plain text if the app is going to allow new status labels on the fly.
alter table public.pipe_inventory
  alter column status type text using status::text,
  alter column status set default 'Received';

alter table public.status_history
  alter column old_status type text using old_status::text,
  alter column new_status type text using new_status::text;

create table if not exists public.inventory_options (
  id uuid primary key default gen_random_uuid(),
  option_type text not null check (option_type in ('status', 'condition')),
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_type, label)
);

insert into public.inventory_options (option_type, label, sort_order)
values
  ('status', 'Received', 10),
  ('status', 'Available', 20),
  ('status', 'WIP', 30),
  ('status', 'Awaiting Inspection', 40),
  ('status', 'Awaiting Ship', 50),
  ('status', 'Shipped', 60),
  ('status', 'Rejected', 70),
  ('status', 'Scrap', 80),
  ('status', 'On Hold', 90),
  ('condition', 'New', 10),
  ('condition', 'Used', 20),
  ('condition', 'Premium', 30),
  ('condition', 'Inspected', 40),
  ('condition', 'Repair', 50),
  ('condition', 'Rejected', 60),
  ('condition', 'Scrap', 70),
  ('condition', 'On Hold', 80)
on conflict (option_type, label) do nothing;

alter table public.inventory_options enable row level security;

drop policy if exists "inventory options authenticated read" on public.inventory_options;
create policy "inventory options authenticated read"
on public.inventory_options
for select
to authenticated
using (true);

drop policy if exists "inventory options internal write" on public.inventory_options;
create policy "inventory options internal write"
on public.inventory_options
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

grant select, insert, update, delete on public.inventory_options to authenticated;
