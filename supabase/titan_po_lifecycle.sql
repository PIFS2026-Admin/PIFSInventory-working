-- TITAN Purchase Order lifecycle upgrade.
-- Safe to run more than once in Supabase SQL Editor.
-- This extends the existing inventory PO tables; it does not drop or recreate live PO data.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create sequence if not exists public.purchase_order_number_seq start with 1 increment by 1;

create or replace function public.next_purchase_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  sequence_value bigint;
begin
  sequence_value := nextval('public.purchase_order_number_seq');
  return 'PO-' || to_char(now(), 'YYYY') || '-' || lpad(sequence_value::text, 5, '0');
end;
$$;

revoke all on function public.next_purchase_order_number() from public;
grant execute on function public.next_purchase_order_number() to authenticated, service_role;

do $$
begin
  if to_regclass('public.inventory_vendors') is not null then
    alter table public.inventory_vendors add column if not exists contact_info text;
    alter table public.inventory_vendors add column if not exists payment_terms text;
    alter table public.inventory_vendors add column if not exists tax_id text;
    alter table public.inventory_vendors add column if not exists active boolean not null default true;

    update public.inventory_vendors
    set payment_terms = coalesce(payment_terms, terms),
        contact_info = coalesce(contact_info, concat_ws(' / ', nullif(contact_name, ''), nullif(phone, ''), nullif(email, '')))
    where payment_terms is null or contact_info is null;
  end if;

  if to_regclass('public.purchase_orders') is not null then
    alter table public.purchase_orders add column if not exists requester_id uuid references auth.users(id) on delete set null;
    alter table public.purchase_orders add column if not exists department text;
    alter table public.purchase_orders add column if not exists budget_code text;
    alter table public.purchase_orders add column if not exists cost_center text;
    alter table public.purchase_orders add column if not exists total_amount numeric(12, 2) not null default 0;
    alter table public.purchase_orders add column if not exists submitted_at timestamptz;
    alter table public.purchase_orders add column if not exists approved_at timestamptz;
    alter table public.purchase_orders add column if not exists sent_at timestamptz;
    alter table public.purchase_orders add column if not exists invoiced_at timestamptz;
    alter table public.purchase_orders add column if not exists closed_at timestamptz;
    alter table public.purchase_orders add column if not exists cancelled_at timestamptz;
    alter table public.purchase_orders add column if not exists rejection_reason text;
    alter table public.purchase_orders add column if not exists cancelled_reason text;
    alter table public.purchase_orders add column if not exists payment_status text not null default 'unpaid';
    alter table public.purchase_orders add column if not exists lifecycle_notes text;

    alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;

    update public.purchase_orders
    set total_amount = coalesce(nullif(total_amount, 0), total_value, 0);

    update public.purchase_orders
    set status = case
      when status = 'Ordered' then 'Sent to Vendor'
      when status = 'Received' then 'Fully Received'
      else status
    end
    where status in ('Ordered', 'Received');

    alter table public.purchase_orders
      add constraint purchase_orders_status_check
      check (status in (
        'Draft',
        'Submitted',
        'Approved',
        'Sent to Vendor',
        'Partially Received',
        'Fully Received',
        'Invoiced',
        'Closed',
        'Rejected',
        'Cancelled'
      ));
  end if;

  if to_regclass('public.purchase_order_lines') is not null then
    alter table public.purchase_order_lines add column if not exists description text;
    alter table public.purchase_order_lines add column if not exists unit_price numeric(12, 2);
    alter table public.purchase_order_lines add column if not exists gl_code text;
    alter table public.purchase_order_lines add column if not exists quantity_invoiced numeric(12, 2) not null default 0;
    alter table public.purchase_order_lines add column if not exists active boolean not null default true;

    update public.purchase_order_lines
    set description = coalesce(description, item_name),
        unit_price = coalesce(unit_price, unit_cost, 0),
        line_total = coalesce(line_total, quantity_ordered * coalesce(unit_price, unit_cost, 0))
    where description is null or unit_price is null;
  end if;
end $$;

create table if not exists public.purchase_order_approvals (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  approver_id uuid references auth.users(id) on delete set null,
  approver_role text,
  tier integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'skipped')),
  comments text,
  timestamp timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (po_id, tier, approver_role)
);

create table if not exists public.purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  line_item_id uuid not null references public.purchase_order_lines(id) on delete cascade,
  quantity_received numeric(12, 2) not null default 0,
  received_by uuid references auth.users(id) on delete set null,
  received_by_name text,
  received_at timestamptz not null default now(),
  discrepancy_flag boolean not null default false,
  discrepancy_note text
);

create table if not exists public.purchase_order_invoices (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  vendor_invoice_number text not null,
  amount numeric(12, 2) not null default 0,
  match_status text not null default 'pending' check (match_status in ('matched', 'exception', 'pending')),
  exception_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (po_id, vendor_invoice_number)
);

create table if not exists public.purchase_order_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  timestamp timestamptz not null default now(),
  before_value jsonb,
  after_value jsonb
);

alter table public.purchase_order_approvals enable row level security;
alter table public.purchase_order_receipts enable row level security;
alter table public.purchase_order_invoices enable row level security;
alter table public.purchase_order_audit_logs enable row level security;

grant select, insert, update on public.purchase_order_approvals to authenticated, service_role;
grant select, insert, update on public.purchase_order_receipts to authenticated, service_role;
grant select, insert, update on public.purchase_order_invoices to authenticated, service_role;
grant select, insert on public.purchase_order_audit_logs to authenticated, service_role;

drop policy if exists "po approvals internal access" on public.purchase_order_approvals;
create policy "po approvals internal access"
on public.purchase_order_approvals
for all
to authenticated
using (public.current_user_role_text() <> 'customer')
with check (public.current_user_role_text() <> 'customer');

drop policy if exists "po receipts internal access" on public.purchase_order_receipts;
create policy "po receipts internal access"
on public.purchase_order_receipts
for all
to authenticated
using (public.current_user_role_text() <> 'customer')
with check (public.current_user_role_text() <> 'customer');

drop policy if exists "po invoices internal access" on public.purchase_order_invoices;
create policy "po invoices internal access"
on public.purchase_order_invoices
for all
to authenticated
using (public.current_user_role_text() <> 'customer')
with check (public.current_user_role_text() <> 'customer');

drop policy if exists "po audit internal read" on public.purchase_order_audit_logs;
create policy "po audit internal read"
on public.purchase_order_audit_logs
for select
to authenticated
using (public.current_user_role_text() <> 'customer');

drop policy if exists "po audit internal insert" on public.purchase_order_audit_logs;
create policy "po audit internal insert"
on public.purchase_order_audit_logs
for insert
to authenticated
with check (public.current_user_role_text() <> 'customer');

drop trigger if exists set_purchase_order_approvals_updated_at on public.purchase_order_approvals;
create trigger set_purchase_order_approvals_updated_at
before update on public.purchase_order_approvals
for each row execute function public.set_updated_at();

drop trigger if exists set_purchase_order_invoices_updated_at on public.purchase_order_invoices;
create trigger set_purchase_order_invoices_updated_at
before update on public.purchase_order_invoices
for each row execute function public.set_updated_at();

create or replace function public.recalculate_purchase_order_total(target_po_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  next_total numeric(12, 2);
begin
  select coalesce(sum(coalesce(line_total, quantity_ordered * coalesce(unit_price, unit_cost, 0))), 0)
  into next_total
  from public.purchase_order_lines
  where purchase_order_id = target_po_id
    and coalesce(active, true) = true;

  update public.purchase_orders
  set total_value = next_total,
      total_amount = next_total,
      updated_at = now()
  where id = target_po_id;

  return next_total;
end;
$$;

revoke all on function public.recalculate_purchase_order_total(uuid) from public;
grant execute on function public.recalculate_purchase_order_total(uuid) to authenticated, service_role;

create or replace function public.recalculate_purchase_order_total_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_po uuid;
begin
  target_po := coalesce(new.purchase_order_id, old.purchase_order_id);
  perform public.recalculate_purchase_order_total(target_po);
  return coalesce(new, old);
end;
$$;

drop trigger if exists recalculate_purchase_order_total_on_line_change on public.purchase_order_lines;
create trigger recalculate_purchase_order_total_on_line_change
after insert or update on public.purchase_order_lines
for each row execute function public.recalculate_purchase_order_total_trigger();

create index if not exists purchase_orders_status_idx on public.purchase_orders(status);
create index if not exists purchase_orders_department_idx on public.purchase_orders(department);
create index if not exists purchase_orders_cost_center_idx on public.purchase_orders(cost_center);
create index if not exists purchase_order_approvals_po_tier_idx on public.purchase_order_approvals(po_id, tier, status);
create index if not exists purchase_order_receipts_po_idx on public.purchase_order_receipts(po_id);
create index if not exists purchase_order_receipts_line_idx on public.purchase_order_receipts(line_item_id);
create index if not exists purchase_order_invoices_po_idx on public.purchase_order_invoices(po_id);
create index if not exists purchase_order_audit_entity_idx on public.purchase_order_audit_logs(entity_type, entity_id);
create index if not exists purchase_order_audit_timestamp_idx on public.purchase_order_audit_logs(timestamp desc);

insert into public.purchase_order_audit_logs (entity_type, entity_id, action, before_value, after_value)
select
  'purchase_order',
  id,
  'migration_lifecycle_status_normalized',
  jsonb_build_object('status', case when status = 'Sent to Vendor' then 'Ordered' when status = 'Fully Received' then 'Received' else status end),
  jsonb_build_object('status', status)
from public.purchase_orders
where status in ('Sent to Vendor', 'Fully Received')
on conflict do nothing;
