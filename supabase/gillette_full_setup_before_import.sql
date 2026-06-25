-- TITAN Gillette setup before importing Gillette Inventory.csv.
-- Run this one time in Supabase SQL Editor.
-- It upgrades Inventory/PO to multi-yard safely, adds Gillette yard/racks,
-- and preserves Pathfinder WTX inventory by assigning existing blank yard records to PIFS.

alter type public.user_role add value if not exists 'inventory_specialist';
alter type public.user_role add value if not exists 'inventory_manager';

insert into public.yards (name, code)
values
  ('Pathfinder Yard WTX', 'PIFS'),
  ('Gillette Yard', 'GILLETTE'),
  ('Casper Yard', 'CASPER'),
  ('Dickinson Yard', 'DICKINSON')
on conflict (code) do update
set name = excluded.name,
    is_active = true;

do $$
begin
  if to_regclass('public.inventory_vendors') is not null then
    alter table public.inventory_vendors add column if not exists yard_id uuid references public.yards(id);
    alter table public.inventory_vendors add column if not exists vendor_code text;
    alter table public.inventory_vendors add column if not exists vendor_type text;
    alter table public.inventory_vendors add column if not exists contact_name text;
    alter table public.inventory_vendors add column if not exists phone text;
    alter table public.inventory_vendors add column if not exists email text;
    alter table public.inventory_vendors add column if not exists terms text;
    alter table public.inventory_vendors add column if not exists active boolean not null default true;
  end if;

  if to_regclass('public.inventory_items') is not null then
    alter table public.inventory_items add column if not exists yard_id uuid references public.yards(id);
  end if;

  if to_regclass('public.inventory_transactions') is not null then
    alter table public.inventory_transactions add column if not exists yard_id uuid references public.yards(id);
  end if;

  if to_regclass('public.inventory_issue_tickets') is not null then
    alter table public.inventory_issue_tickets add column if not exists yard_id uuid references public.yards(id);
  end if;

  if to_regclass('public.inventory_issue_ticket_lines') is not null then
    alter table public.inventory_issue_ticket_lines add column if not exists yard_id uuid references public.yards(id);
  end if;

  if to_regclass('public.purchase_orders') is not null then
    alter table public.purchase_orders add column if not exists yard_id uuid references public.yards(id);
    alter table public.purchase_orders add column if not exists vendor_email text;
    alter table public.purchase_orders add column if not exists submitted_at timestamptz;
    alter table public.purchase_orders add column if not exists submitted_by text;
    alter table public.purchase_orders add column if not exists approved_at timestamptz;
    alter table public.purchase_orders add column if not exists approved_by text;
    alter table public.purchase_orders add column if not exists ordered_at timestamptz;
    alter table public.purchase_orders add column if not exists ordered_by text;
  end if;

  if to_regclass('public.purchase_order_lines') is not null then
    alter table public.purchase_order_lines add column if not exists yard_id uuid references public.yards(id);
  end if;

  if to_regclass('public.inventory_documents') is not null then
    alter table public.inventory_documents add column if not exists yard_id uuid references public.yards(id);
  end if;

  if to_regclass('public.racks') is not null then
    alter table public.racks add column if not exists layout_width integer;
    alter table public.racks add column if not exists layout_height integer;
  end if;
end $$;

update public.inventory_vendors
set yard_id = (select id from public.yards where code = 'PIFS' limit 1)
where yard_id is null;

update public.inventory_items
set yard_id = (select id from public.yards where code = 'PIFS' limit 1)
where yard_id is null;

update public.inventory_transactions
set yard_id = (select id from public.yards where code = 'PIFS' limit 1)
where yard_id is null;

update public.inventory_issue_tickets
set yard_id = (select id from public.yards where code = 'PIFS' limit 1)
where yard_id is null;

update public.inventory_issue_ticket_lines
set yard_id = (select id from public.yards where code = 'PIFS' limit 1)
where yard_id is null;

update public.purchase_orders
set yard_id = (select id from public.yards where code = 'PIFS' limit 1)
where yard_id is null;

update public.purchase_order_lines
set yard_id = (select id from public.yards where code = 'PIFS' limit 1)
where yard_id is null;

update public.inventory_documents
set yard_id = (select id from public.yards where code = 'PIFS' limit 1)
where yard_id is null;

alter table public.inventory_vendors drop constraint if exists inventory_vendors_vendor_name_key;
alter table public.inventory_items drop constraint if exists inventory_items_item_code_key;

create unique index if not exists inventory_vendors_yard_vendor_name_uidx
on public.inventory_vendors (yard_id, vendor_name)
where yard_id is not null;

create unique index if not exists inventory_items_yard_item_code_uidx
on public.inventory_items (yard_id, item_code)
where yard_id is not null;

create index if not exists inventory_vendors_yard_id_idx on public.inventory_vendors(yard_id);
create index if not exists inventory_items_yard_id_idx on public.inventory_items(yard_id);
create index if not exists inventory_transactions_yard_id_idx on public.inventory_transactions(yard_id);
create index if not exists inventory_issue_tickets_yard_id_idx on public.inventory_issue_tickets(yard_id);
create index if not exists inventory_issue_ticket_lines_yard_id_idx on public.inventory_issue_ticket_lines(yard_id);
create index if not exists purchase_orders_yard_id_idx on public.purchase_orders(yard_id);
create index if not exists purchase_order_lines_yard_id_idx on public.purchase_order_lines(yard_id);
create index if not exists inventory_documents_yard_id_idx on public.inventory_documents(yard_id);

create table if not exists public.inventory_user_yards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  yard_id uuid not null references public.yards(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, yard_id)
);

alter table public.inventory_user_yards enable row level security;
grant select, insert, update, delete on public.inventory_user_yards to authenticated;

create or replace function public.current_inventory_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role::text
  from public.profiles
  where id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.current_inventory_role() from public;
grant execute on function public.current_inventory_role() to authenticated;

create or replace function public.is_inventory_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    public.current_inventory_role() in ('admin', 'inventory_specialist', 'inventory_manager'),
    false
  );
$$;

revoke all on function public.is_inventory_user() from public;
grant execute on function public.is_inventory_user() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'inventory_vendors',
    'inventory_items',
    'inventory_transactions',
    'inventory_issue_tickets',
    'inventory_issue_ticket_lines',
    'purchase_orders',
    'purchase_order_lines',
    'inventory_documents',
    'inventory_user_yards'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);

      execute format('drop policy if exists "inventory module full access" on public.%I', table_name);
      execute format(
        'create policy "inventory module full access" on public.%I for all to authenticated using (public.is_inventory_user()) with check (public.is_inventory_user())',
        table_name
      );
    end if;
  end loop;
end $$;

with yard as (
  select id from public.yards where code = 'GILLETTE' limit 1
)
insert into public.workflow_zones (yard_id, name, code, sort_order, is_active)
select yard.id, zone.name, zone.code, zone.sort_order, true
from yard
cross join (
  values
    ('Shipping', 'shipping', 10),
    ('Receiving', 'receiving', 20),
    ('Water Blaster', 'water_blaster', 30),
    ('Inspection', 'inspection', 40),
    ('Hardband', 'hardband', 50),
    ('Machine Shop', 'machine_shop', 60)
) as zone(name, code, sort_order)
on conflict (yard_id, code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

with yard as (
  select id from public.yards where code = 'GILLETTE' limit 1
),
rack_layout as (
  select *
  from (
    values
      ('Rack 1', 900, 130, 1),
      ('Rack 2', 800, 130, 2),
      ('Rack 3', 190, 285, 3),
      ('Rack 4', 300, 285, 4),
      ('Rack 5', 410, 285, 5),
      ('Rack 6', 630, 285, 6),
      ('Rack 7', 740, 285, 7),
      ('Rack 8', 520, 285, 8),
      ('Rack 9', 850, 285, 9),
      ('Rack 10', 190, 210, 10),
      ('Rack 11', 300, 210, 11),
      ('Rack 12', 410, 210, 12),
      ('Rack 13', 70, 210, 13),
      ('Rack 14', 70, 520, 14),
      ('Rack 15', 190, 520, 15),
      ('Rack 16', 70, 80, 16),
      ('Rack 17', 70, 360, 17),
      ('Rack 18', 300, 430, 18),
      ('Rack 19', 410, 430, 19),
      ('Rack 20', 70, 285, 20),
      ('DBR Rack', 960, 285, 21),
      ('Tower DBR Rack', 520, 210, 22),
      ('Board Bunks', 630, 430, 23),
      ('Waist High Racks', 760, 430, 24),
      ('North Gate', 960, 80, 25)
  ) as rack(rack_code, layout_x, layout_y, sort_order)
)
insert into public.racks (
  yard_id,
  rack_code,
  capacity_joints,
  sort_order,
  layout_x,
  layout_y,
  layout_width,
  layout_height,
  layout_group,
  rotation,
  is_active
)
select
  yard.id,
  rack_layout.rack_code,
  500,
  rack_layout.sort_order,
  rack_layout.layout_x,
  rack_layout.layout_y,
  96,
  40,
  'Gillette',
  0,
  true
from yard
cross join rack_layout
on conflict (yard_id, rack_code) do update
set sort_order = excluded.sort_order,
    layout_x = excluded.layout_x,
    layout_y = excluded.layout_y,
    layout_width = excluded.layout_width,
    layout_height = excluded.layout_height,
    layout_group = excluded.layout_group,
    is_active = true;

with codes as (
  select *
  from (
    values
      ('DP4XT39', 'DRILL PIPE 4" XT-39', '4"', 'XT-39'),
      ('DP4XT39YB', 'DRILL PIPE 4" XT-39 YELLOW BAND', '4"', 'XT-39'),
      ('DP4DS38', 'DRILL PIPE 4" DS-38', '4"', 'DS-38'),
      ('DP4DS38B', 'DRILL PIPE 4" DS-38 BAOSHAN', '4"', 'DS-38'),
      ('DP45DS42', 'DRILL PIPE 4.5" DS-42', '4.5"', 'DS-42'),
      ('HW4DS38', 'HEAVY WEIGHT 4" DS-38', '4"', 'DS-38'),
      ('HW4XT39', 'HEAVY WEIGHT 4" XT-39', '4"', 'XT-39'),
      ('HW5NC50', 'HEAVY WEIGHT 5" NC-50 CONVENTIONAL', '5"', 'NC-50'),
      ('HW5NC50S', 'HEAVY WEIGHT 5" NC-50 SPIRAL', '5"', 'NC-50'),
      ('TU2875PH6', 'TUBING 2.875" PH6 CONNECTIONS', '2.875"', 'PH6'),
      ('TU2375PH6', 'TUBING 2.375" PH6 CONNECTIONS', '2.375"', 'PH6')
  ) as code(part_number, description, size, connection)
)
insert into public.part_numbers (company_id, part_number, description, size, grade, connection, pipe_range)
select
  null,
  codes.part_number,
  codes.description,
  codes.size,
  null,
  codes.connection,
  'Range 2'
from codes
where not exists (
  select 1
  from public.part_numbers existing
  where existing.company_id is null
    and existing.part_number = codes.part_number
);
