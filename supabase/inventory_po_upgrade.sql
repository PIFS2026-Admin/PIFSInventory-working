-- TITAN Inventory / PO upgrade.
-- Safe to run more than once in Supabase SQL Editor.

alter type public.user_role add value if not exists 'inventory_specialist';
alter type public.user_role add value if not exists 'inventory_manager';

insert into public.yards (name, code)
values
  ('Pathfinder Yard WTX', 'PIFS'),
  ('Gillette Yard', 'GILLETTE'),
  ('Casper Yard', 'CASPER'),
  ('Dickinson Yard', 'DICKINSON')
on conflict (code) do update set name = excluded.name;

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
