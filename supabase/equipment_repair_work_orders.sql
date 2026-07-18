create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.user_module_permissions') is not null then
    alter table public.user_module_permissions
      drop constraint if exists user_module_permissions_module_key_check;

    alter table public.user_module_permissions
      add constraint user_module_permissions_module_key_check check (
        module_key in (
          'yard_view',
          'inventory',
          'purchase_orders',
          'work_orders',
          'dti',
          'dti_summary',
          'hardband',
          'communications',
          'admin',
          'reports',
          'dashboard'
        )
      );
  end if;
end $$;

create table if not exists public.equipment_repair_work_orders (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid references public.yards(id) on delete set null,
  work_order_number text not null unique,
  status text not null default 'Open' check (
    status in ('Draft', 'Open', 'In Repair', 'Awaiting Parts', 'Ready for Review', 'Closed', 'Cancelled')
  ),
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Critical')),
  equipment_number text,
  equipment_name text not null,
  equipment_type text,
  department text,
  assigned_to text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  problem_description text,
  repair_notes text,
  downtime_start timestamptz,
  downtime_end timestamptz,
  labor_hours numeric(12, 2) not null default 0,
  total_labor_cost numeric(12, 2) not null default 0,
  total_parts_cost numeric(12, 2) not null default 0,
  total_cost numeric(12, 2) not null default 0,
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_repair_work_order_parts (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.equipment_repair_work_orders(id) on delete cascade,
  yard_id uuid references public.yards(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  item_code text,
  item_name text not null,
  category text,
  uom text,
  quantity_used numeric(12, 2) not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  posted_to_inventory boolean not null default false,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  notes text,
  issued_by uuid references auth.users(id) on delete set null,
  issued_by_name text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_repair_labor_entries (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.equipment_repair_work_orders(id) on delete cascade,
  technician_name text not null,
  work_date date not null default current_date,
  hours numeric(12, 2) not null default 0,
  labor_rate numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_repair_audit_log (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references public.equipment_repair_work_orders(id) on delete cascade,
  action text not null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_equipment_repair_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.recalculate_equipment_repair_totals(target_work_order_id uuid)
returns void
language plpgsql
as $$
begin
  update public.equipment_repair_work_orders wo
  set
    total_parts_cost = coalesce(parts.total_parts_cost, 0),
    labor_hours = coalesce(labor.labor_hours, 0),
    total_labor_cost = coalesce(labor.total_labor_cost, 0),
    total_cost = coalesce(parts.total_parts_cost, 0) + coalesce(labor.total_labor_cost, 0),
    updated_at = now()
  from
    (
      select coalesce(sum(line_total), 0) as total_parts_cost
      from public.equipment_repair_work_order_parts
      where work_order_id = target_work_order_id
    ) parts,
    (
      select coalesce(sum(hours), 0) as labor_hours, coalesce(sum(line_total), 0) as total_labor_cost
      from public.equipment_repair_labor_entries
      where work_order_id = target_work_order_id
    ) labor
  where wo.id = target_work_order_id;
end;
$$;

create or replace function public.recalculate_equipment_repair_totals_trigger()
returns trigger
language plpgsql
as $$
declare
  target_id uuid;
begin
  if tg_op = 'DELETE' then
    target_id = old.work_order_id;
  else
    target_id = new.work_order_id;
  end if;

  perform public.recalculate_equipment_repair_totals(target_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists set_equipment_repair_work_orders_updated_at on public.equipment_repair_work_orders;
create trigger set_equipment_repair_work_orders_updated_at
before update on public.equipment_repair_work_orders
for each row execute function public.set_equipment_repair_updated_at();

drop trigger if exists set_equipment_repair_parts_updated_at on public.equipment_repair_work_order_parts;
create trigger set_equipment_repair_parts_updated_at
before update on public.equipment_repair_work_order_parts
for each row execute function public.set_equipment_repair_updated_at();

drop trigger if exists set_equipment_repair_labor_updated_at on public.equipment_repair_labor_entries;
create trigger set_equipment_repair_labor_updated_at
before update on public.equipment_repair_labor_entries
for each row execute function public.set_equipment_repair_updated_at();

drop trigger if exists recalculate_equipment_repair_parts_totals on public.equipment_repair_work_order_parts;
create trigger recalculate_equipment_repair_parts_totals
after insert or update or delete on public.equipment_repair_work_order_parts
for each row execute function public.recalculate_equipment_repair_totals_trigger();

drop trigger if exists recalculate_equipment_repair_labor_totals on public.equipment_repair_labor_entries;
create trigger recalculate_equipment_repair_labor_totals
after insert or update or delete on public.equipment_repair_labor_entries
for each row execute function public.recalculate_equipment_repair_totals_trigger();

create index if not exists equipment_repair_work_orders_yard_idx on public.equipment_repair_work_orders(yard_id);
create index if not exists equipment_repair_work_orders_status_idx on public.equipment_repair_work_orders(status);
create index if not exists equipment_repair_work_orders_equipment_idx on public.equipment_repair_work_orders(equipment_number, equipment_name);
create index if not exists equipment_repair_parts_work_order_idx on public.equipment_repair_work_order_parts(work_order_id);
create index if not exists equipment_repair_labor_work_order_idx on public.equipment_repair_labor_entries(work_order_id);

alter table public.equipment_repair_work_orders enable row level security;
alter table public.equipment_repair_work_order_parts enable row level security;
alter table public.equipment_repair_labor_entries enable row level security;
alter table public.equipment_repair_audit_log enable row level security;

grant select, insert, update, delete on public.equipment_repair_work_orders to authenticated;
grant select, insert, update, delete on public.equipment_repair_work_order_parts to authenticated;
grant select, insert, update, delete on public.equipment_repair_labor_entries to authenticated;
grant select, insert on public.equipment_repair_audit_log to authenticated;

drop policy if exists "equipment repair internal full" on public.equipment_repair_work_orders;
create policy "equipment repair internal full"
on public.equipment_repair_work_orders
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') <> 'customer'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') <> 'customer'
  )
);

drop policy if exists "equipment repair parts internal full" on public.equipment_repair_work_order_parts;
create policy "equipment repair parts internal full"
on public.equipment_repair_work_order_parts
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') <> 'customer'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') <> 'customer'
  )
);

drop policy if exists "equipment repair labor internal full" on public.equipment_repair_labor_entries;
create policy "equipment repair labor internal full"
on public.equipment_repair_labor_entries
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') <> 'customer'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') <> 'customer'
  )
);

drop policy if exists "equipment repair audit internal read" on public.equipment_repair_audit_log;
create policy "equipment repair audit internal read"
on public.equipment_repair_audit_log
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') <> 'customer'
  )
);

drop policy if exists "equipment repair audit internal insert" on public.equipment_repair_audit_log;
create policy "equipment repair audit internal insert"
on public.equipment_repair_audit_log
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') <> 'customer'
  )
);
