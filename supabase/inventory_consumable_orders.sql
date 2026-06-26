do $$
begin
  alter type public.user_role add value if not exists 'service_line_manager';
  alter type public.user_role add value if not exists 'dti_lead';
  alter type public.user_role add value if not exists 'level_2_inspector';
  alter type public.user_role add value if not exists 'hardband_lead';
  alter type public.user_role add value if not exists 'cdt_lead';
  alter type public.user_role add value if not exists 'inventory_specialist';
  alter type public.user_role add value if not exists 'inventory_manager';
  alter type public.user_role add value if not exists 'dti_superintendent';
exception
  when undefined_object then null;
end $$;

create table if not exists public.inventory_orders (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid null references public.yards(id) on delete set null,
  order_number text unique not null,
  order_date date default current_date,
  requested_by text,
  requested_by_user_id uuid null references auth.users(id) on delete set null,
  department text,
  unit_truck text,
  job_number text,
  status text not null default 'Submitted',
  notes text,
  total_value numeric not null default 0,
  fulfilled_by text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_order_lines (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid null references public.yards(id) on delete set null,
  order_id uuid not null references public.inventory_orders(id) on delete cascade,
  order_number text,
  item_id uuid null references public.inventory_items(id) on delete set null,
  item_code text,
  item_name text,
  qty_requested numeric not null default 0,
  qty_fulfilled numeric not null default 0,
  unit_cost numeric not null default 0,
  line_value numeric not null default 0,
  fulfilled_by text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.inventory_orders
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

alter table public.inventory_order_lines
  add column if not exists qty_fulfilled numeric not null default 0,
  add column if not exists fulfilled_by text,
  add column if not exists fulfilled_at timestamptz;

create index if not exists inventory_orders_yard_id_idx on public.inventory_orders(yard_id);
create index if not exists inventory_orders_status_idx on public.inventory_orders(status);
create index if not exists inventory_order_lines_order_id_idx on public.inventory_order_lines(order_id);
create index if not exists inventory_order_lines_yard_id_idx on public.inventory_order_lines(yard_id);
create index if not exists inventory_order_lines_item_id_idx on public.inventory_order_lines(item_id);

alter table public.inventory_orders enable row level security;
alter table public.inventory_order_lines enable row level security;

grant select, insert, update, delete on public.inventory_orders to authenticated;
grant select, insert, update, delete on public.inventory_order_lines to authenticated;

drop policy if exists "inventory orders read allowed roles" on public.inventory_orders;
create policy "inventory orders read allowed roles"
on public.inventory_orders
for select
to authenticated
using (
  public.current_user_role()::text in (
    'admin',
    'employee',
    'service_line_manager',
    'dti_superintendent',
    'dti_lead',
    'level_2_inspector',
    'hardband_lead',
    'cdt_lead',
    'inventory_specialist',
    'inventory_manager'
  )
);

drop policy if exists "inventory orders insert allowed roles" on public.inventory_orders;
create policy "inventory orders insert allowed roles"
on public.inventory_orders
for insert
to authenticated
with check (
  public.current_user_role()::text in (
    'admin',
    'employee',
    'service_line_manager',
    'dti_superintendent',
    'dti_lead',
    'level_2_inspector',
    'hardband_lead',
    'cdt_lead',
    'inventory_specialist',
    'inventory_manager'
  )
);

drop policy if exists "inventory orders update managers" on public.inventory_orders;
create policy "inventory orders update managers"
on public.inventory_orders
for update
to authenticated
using (public.current_user_role()::text in ('admin', 'inventory_specialist', 'inventory_manager'))
with check (public.current_user_role()::text in ('admin', 'inventory_specialist', 'inventory_manager'));

drop policy if exists "inventory orders delete admins" on public.inventory_orders;
create policy "inventory orders delete admins"
on public.inventory_orders
for delete
to authenticated
using (public.current_user_role()::text = 'admin');

drop policy if exists "inventory order lines read allowed roles" on public.inventory_order_lines;
create policy "inventory order lines read allowed roles"
on public.inventory_order_lines
for select
to authenticated
using (
  public.current_user_role()::text in (
    'admin',
    'employee',
    'service_line_manager',
    'dti_superintendent',
    'dti_lead',
    'level_2_inspector',
    'hardband_lead',
    'cdt_lead',
    'inventory_specialist',
    'inventory_manager'
  )
);

drop policy if exists "inventory order lines insert allowed roles" on public.inventory_order_lines;
create policy "inventory order lines insert allowed roles"
on public.inventory_order_lines
for insert
to authenticated
with check (
  public.current_user_role()::text in (
    'admin',
    'employee',
    'service_line_manager',
    'dti_superintendent',
    'dti_lead',
    'level_2_inspector',
    'hardband_lead',
    'cdt_lead',
    'inventory_specialist',
    'inventory_manager'
  )
);

drop policy if exists "inventory order lines update managers" on public.inventory_order_lines;
create policy "inventory order lines update managers"
on public.inventory_order_lines
for update
to authenticated
using (public.current_user_role()::text in ('admin', 'inventory_specialist', 'inventory_manager'))
with check (public.current_user_role()::text in ('admin', 'inventory_specialist', 'inventory_manager'));

drop policy if exists "inventory order lines delete admins" on public.inventory_order_lines;
create policy "inventory order lines delete admins"
on public.inventory_order_lines
for delete
to authenticated
using (public.current_user_role()::text = 'admin');
