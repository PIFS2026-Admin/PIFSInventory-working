create table if not exists public.inventory_user_yards (
  user_id uuid not null references auth.users(id) on delete cascade,
  yard_id uuid not null references public.yards(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (user_id, yard_id)
);

alter table public.inventory_user_yards enable row level security;

grant select, insert, update, delete on public.inventory_user_yards to authenticated;

create or replace function public.can_access_inventory_yard(p_yard_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.current_user_role(), '') in (
      'admin',
      'inventory_manager',
      'inventory_specialist'
    )
    or exists (
      select 1
      from public.inventory_user_yards iuy
      where iuy.user_id = auth.uid()
        and iuy.yard_id = p_yard_id
    );
$$;

drop policy if exists "inventory user yards internal read" on public.inventory_user_yards;
create policy "inventory user yards internal read"
on public.inventory_user_yards
for select
to authenticated
using (
  coalesce(public.current_user_role(), '') = 'admin'
  or user_id = auth.uid()
);

drop policy if exists "inventory user yards admin write" on public.inventory_user_yards;
create policy "inventory user yards admin write"
on public.inventory_user_yards
for all
to authenticated
using (coalesce(public.current_user_role(), '') = 'admin')
with check (coalesce(public.current_user_role(), '') = 'admin');

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_items'
      and column_name = 'yard_id'
  ) then
    execute 'drop policy if exists "inventory items yard read" on public.inventory_items';
    execute '
      create policy "inventory items yard read"
      on public.inventory_items
      for select
      to authenticated
      using (public.can_access_inventory_yard(yard_id))
    ';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'inventory_vendors'
  ) then
    execute 'drop policy if exists "inventory vendors internal read" on public.inventory_vendors';
    execute '
      create policy "inventory vendors internal read"
      on public.inventory_vendors
      for select
      to authenticated
      using (
        coalesce(public.current_user_role(), '''') in (
          ''admin'',
          ''employee'',
          ''inventory_manager'',
          ''inventory_specialist'',
          ''service_line_manager'',
          ''dti_superintendent'',
          ''dti_lead'',
          ''level_2_inspector'',
          ''hardband_lead'',
          ''cdt_lead''
        )
      )
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_orders'
      and column_name = 'yard_id'
  ) then
    execute 'drop policy if exists "inventory orders yard read" on public.inventory_orders';
    execute '
      create policy "inventory orders yard read"
      on public.inventory_orders
      for select
      to authenticated
      using (public.can_access_inventory_yard(yard_id))
    ';

    execute 'drop policy if exists "inventory orders yard insert" on public.inventory_orders';
    execute '
      create policy "inventory orders yard insert"
      on public.inventory_orders
      for insert
      to authenticated
      with check (public.can_access_inventory_yard(yard_id))
    ';

    execute 'drop policy if exists "inventory orders manager update" on public.inventory_orders';
    execute '
      create policy "inventory orders manager update"
      on public.inventory_orders
      for update
      to authenticated
      using (
        coalesce(public.current_user_role(), '''') in (
          ''admin'',
          ''inventory_manager'',
          ''inventory_specialist''
        )
      )
      with check (
        coalesce(public.current_user_role(), '''') in (
          ''admin'',
          ''inventory_manager'',
          ''inventory_specialist''
        )
      )
    ';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'inventory_order_lines'
  ) then
    execute 'drop policy if exists "inventory order lines yard read" on public.inventory_order_lines';
    execute '
      create policy "inventory order lines yard read"
      on public.inventory_order_lines
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.inventory_orders io
          where io.id = inventory_order_lines.order_id
            and public.can_access_inventory_yard(io.yard_id)
        )
      )
    ';

    execute 'drop policy if exists "inventory order lines yard insert" on public.inventory_order_lines';
    execute '
      create policy "inventory order lines yard insert"
      on public.inventory_order_lines
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.inventory_orders io
          where io.id = inventory_order_lines.order_id
            and public.can_access_inventory_yard(io.yard_id)
        )
      )
    ';
  end if;
end $$;
