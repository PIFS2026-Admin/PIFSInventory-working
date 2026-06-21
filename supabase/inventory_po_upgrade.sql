-- TITAN Inventory / PO upgrade.
-- Safe to run more than once in Supabase SQL Editor.

do $$
begin
  if to_regclass('public.inventory_vendors') is not null then
    alter table public.inventory_vendors add column if not exists vendor_code text;
    alter table public.inventory_vendors add column if not exists vendor_type text;
    alter table public.inventory_vendors add column if not exists contact_name text;
    alter table public.inventory_vendors add column if not exists phone text;
    alter table public.inventory_vendors add column if not exists email text;
    alter table public.inventory_vendors add column if not exists terms text;
    alter table public.inventory_vendors add column if not exists active boolean not null default true;
  end if;

  if to_regclass('public.purchase_orders') is not null then
    alter table public.purchase_orders add column if not exists vendor_email text;
    alter table public.purchase_orders add column if not exists submitted_at timestamptz;
    alter table public.purchase_orders add column if not exists submitted_by text;
    alter table public.purchase_orders add column if not exists approved_at timestamptz;
    alter table public.purchase_orders add column if not exists approved_by text;
    alter table public.purchase_orders add column if not exists ordered_at timestamptz;
    alter table public.purchase_orders add column if not exists ordered_by text;
  end if;
end $$;

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
    'inventory_documents'
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
