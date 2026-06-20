-- TITAN standalone Inventory / Purchase Order module.
-- Run this in Supabase SQL Editor before importing the CSV data.

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

create table if not exists public.inventory_vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_name text not null unique,
  contact_name text,
  phone text,
  email text,
  terms text,
  vendor_code text,
  vendor_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  item_name text not null,
  category text,
  location text,
  vendor_id uuid references public.inventory_vendors(id) on delete set null,
  vendor_name_raw text,
  qty_on_hand numeric(12, 2) not null default 0,
  min_quantity numeric(12, 2) not null default 0,
  max_quantity numeric(12, 2) not null default 0,
  unit_price numeric(12, 2) not null default 0,
  barcode text,
  uom text,
  active boolean not null default true,
  low_stock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete set null,
  item_code text,
  transaction_date timestamptz not null default now(),
  transaction_type text not null,
  quantity numeric(12, 2) not null default 0,
  reference_type text,
  reference_number text,
  entered_by text,
  notes text,
  transaction_source text,
  quantity_direction text check (quantity_direction is null or quantity_direction in ('In', 'Out', 'Adjustment')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_issue_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  issue_date date not null default current_date,
  issued_to text,
  department text,
  picked_by text,
  unit_truck text,
  job_number text,
  total_value numeric(12, 2) not null default 0,
  status text not null default 'Issued' check (status in ('Draft', 'Issued', 'Closed', 'Cancelled')),
  notes text,
  pdf_link text,
  pdf_generated boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_issue_ticket_lines (
  id uuid primary key default gen_random_uuid(),
  issue_ticket_id uuid references public.inventory_issue_tickets(id) on delete cascade,
  ticket_number text,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_code text,
  item_name text not null,
  department text,
  qty_issued numeric(12, 2) not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  line_value numeric(12, 2) not null default 0,
  unit_truck text,
  picked_by text,
  line_processed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  vendor_id uuid references public.inventory_vendors(id) on delete set null,
  vendor_name text,
  order_date date not null default current_date,
  requested_by text,
  status text not null default 'Draft' check (
    status in ('Draft', 'Submitted', 'Ordered', 'Partially Received', 'Received', 'Closed', 'Cancelled')
  ),
  notes text,
  total_value numeric(12, 2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_code text,
  item_name text not null,
  quantity_ordered numeric(12, 2) not null default 0,
  quantity_received numeric(12, 2) not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_documents (
  id uuid primary key default gen_random_uuid(),
  linked_record_type text not null check (
    linked_record_type in ('vendor', 'item', 'transaction', 'issue_ticket', 'purchase_order')
  ),
  linked_record_id uuid not null,
  file_name text not null,
  file_url text not null,
  file_path text,
  mime_type text,
  file_size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

drop trigger if exists set_inventory_vendors_updated_at on public.inventory_vendors;
create trigger set_inventory_vendors_updated_at
before update on public.inventory_vendors
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_issue_tickets_updated_at on public.inventory_issue_tickets;
create trigger set_inventory_issue_tickets_updated_at
before update on public.inventory_issue_tickets
for each row execute function public.set_updated_at();

drop trigger if exists set_purchase_orders_updated_at on public.purchase_orders;
create trigger set_purchase_orders_updated_at
before update on public.purchase_orders
for each row execute function public.set_updated_at();

drop trigger if exists set_purchase_order_lines_updated_at on public.purchase_order_lines;
create trigger set_purchase_order_lines_updated_at
before update on public.purchase_order_lines
for each row execute function public.set_updated_at();

alter table public.inventory_vendors enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_issue_tickets enable row level security;
alter table public.inventory_issue_ticket_lines enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.inventory_documents enable row level security;

grant select, insert, update, delete on public.inventory_vendors to authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, update, delete on public.inventory_transactions to authenticated;
grant select, insert, update, delete on public.inventory_issue_tickets to authenticated;
grant select, insert, update, delete on public.inventory_issue_ticket_lines to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_lines to authenticated;
grant select, insert, update, delete on public.inventory_documents to authenticated;

drop policy if exists "inventory vendors internal full" on public.inventory_vendors;
create policy "inventory vendors internal full"
on public.inventory_vendors
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "inventory items internal full" on public.inventory_items;
create policy "inventory items internal full"
on public.inventory_items
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "inventory transactions internal full" on public.inventory_transactions;
create policy "inventory transactions internal full"
on public.inventory_transactions
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "inventory issue tickets internal full" on public.inventory_issue_tickets;
create policy "inventory issue tickets internal full"
on public.inventory_issue_tickets
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "inventory issue lines internal full" on public.inventory_issue_ticket_lines;
create policy "inventory issue lines internal full"
on public.inventory_issue_ticket_lines
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "purchase orders internal full" on public.purchase_orders;
create policy "purchase orders internal full"
on public.purchase_orders
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "purchase order lines internal full" on public.purchase_order_lines;
create policy "purchase order lines internal full"
on public.purchase_order_lines
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "inventory documents internal full" on public.inventory_documents;
create policy "inventory documents internal full"
on public.inventory_documents
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

create index if not exists inventory_items_item_name_idx on public.inventory_items using gin (to_tsvector('english', item_name));
create index if not exists inventory_items_category_idx on public.inventory_items(category);
create index if not exists inventory_items_location_idx on public.inventory_items(location);
create index if not exists inventory_transactions_item_id_idx on public.inventory_transactions(item_id);
create index if not exists inventory_issue_ticket_lines_ticket_idx on public.inventory_issue_ticket_lines(issue_ticket_id);
create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines(purchase_order_id);
