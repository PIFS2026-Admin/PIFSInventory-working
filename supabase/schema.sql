create extension if not exists pgcrypto;

create type public.user_role as enum (
  'admin',
  'employee',
  'customer',
  'operator',
  'sales',
  'inventory_specialist',
  'inventory_manager'
);

create type public.inventory_status as enum (
  'Received',
  'Available',
  'WIP',
  'Awaiting Inspection',
  'Awaiting Ship',
  'Shipped',
  'Rejected',
  'Scrap',
  'On Hold'
);

create type public.inspection_color as enum (
  'Green',
  'Yellow',
  'White/Yellow',
  'Blue',
  'Red',
  'Gray',
  'None'
);

create type public.transaction_type as enum (
  'receive',
  'transfer',
  'ship',
  'adjust',
  'checkpoint',
  'complete'
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  account_number text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id),
  full_name text not null,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.racks (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete cascade,
  rack_code text not null,
  capacity_joints integer not null default 500,
  sort_order integer not null default 0,
  layout_x integer,
  layout_y integer,
  layout_group text,
  rotation integer not null default 0,
  is_active boolean not null default true,
  unique (yard_id, rack_code)
);

create table if not exists public.workflow_zones (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (yard_id, code)
);

create table if not exists public.part_numbers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  part_number text not null,
  description text,
  size text,
  grade text,
  connection text,
  pipe_range text not null default 'Range 2' check (pipe_range in ('Range 2', 'Range 3')),
  unique (company_id, part_number)
);

create table if not exists public.pipe_inventory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  yard_id uuid not null references public.yards(id),
  rack_id uuid references public.racks(id),
  workflow_zone_id uuid references public.workflow_zones(id),
  afe text,
  operator text,
  rig text,
  part_number text not null,
  size text,
  grade text,
  connection text,
  pipe_range text not null default 'Range 2' check (pipe_range in ('Range 2', 'Range 3')),
  condition text not null default 'New',
  status public.inventory_status not null default 'Received',
  inspection_color public.inspection_color not null default 'None',
  inspection_due_date date,
  bulk_joints integer not null default 0 check (bulk_joints >= 0),
  bulk_footage numeric(12, 2) not null default 0 check (bulk_footage >= 0),
  tallied_joints integer not null default 0 check (tallied_joints >= 0),
  tallied_footage numeric(12, 2) not null default 0 check (tallied_footage >= 0),
  total_joints integer generated always as (bulk_joints + tallied_joints) stored,
  total_footage numeric(12, 2) generated always as (bulk_footage + tallied_footage) stored,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exactly_one_location check (
    (rack_id is not null and workflow_zone_id is null)
    or
    (rack_id is null and workflow_zone_id is not null)
  )
);

create table if not exists public.pipe_transactions (
  id uuid primary key default gen_random_uuid(),
  pipe_inventory_id uuid not null references public.pipe_inventory(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  transaction_type public.transaction_type not null,
  from_rack_id uuid references public.racks(id),
  to_rack_id uuid references public.racks(id),
  from_workflow_zone_id uuid references public.workflow_zones(id),
  to_workflow_zone_id uuid references public.workflow_zones(id),
  joints integer not null default 0,
  footage numeric(12, 2) not null default 0,
  comment text,
  back_date date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.receiving_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  yard_id uuid not null references public.yards(id),
  ticket_number text not null unique,
  received_at timestamptz not null default now(),
  received_by uuid references auth.users(id),
  carrier text,
  po_number text,
  truck_number text,
  destination text,
  missing_box_protectors integer not null default 0 check (missing_box_protectors >= 0),
  missing_pin_protectors integer not null default 0 check (missing_pin_protectors >= 0),
  pathfinder_name text,
  pathfinder_signature text,
  carrier_name text,
  carrier_signature text,
  customer_signature text,
  notes text,
  afe text,
  part_number text,
  size text,
  grade text,
  connection text,
  pipe_range text,
  condition text,
  joints integer not null default 0,
  footage numeric(12, 2) not null default 0,
  pdf_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.shipping_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  yard_id uuid not null references public.yards(id),
  ticket_number text not null unique,
  shipped_at timestamptz not null default now(),
  shipped_by uuid references auth.users(id),
  bill_of_lading_url text,
  pdf_url text,
  pathfinder_name text,
  pathfinder_signature text,
  carrier_name text,
  carrier_signature text,
  customer_signature text,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_line_items (
  id uuid primary key default gen_random_uuid(),
  receiving_ticket_id uuid references public.receiving_tickets(id) on delete cascade,
  shipping_ticket_id uuid references public.shipping_tickets(id) on delete cascade,
  pipe_inventory_id uuid references public.pipe_inventory(id),
  company_id uuid references public.companies(id),
  ticket_id uuid,
  afe text,
  size text,
  grade text,
  connection text,
  pipe_range text,
  condition text,
  part_number text not null,
  joints integer not null default 0,
  footage numeric(12, 2) not null default 0,
  notes text
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pipe_inventory_id uuid references public.pipe_inventory(id),
  receiving_ticket_id uuid references public.receiving_tickets(id),
  shipping_ticket_id uuid references public.shipping_tickets(id),
  document_type text not null,
  file_url text not null,
  file_name text,
  file_path text,
  mime_type text,
  file_size bigint,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_records (
  id uuid primary key default gen_random_uuid(),
  pipe_inventory_id uuid not null references public.pipe_inventory(id) on delete cascade,
  inspection_date date not null,
  next_due_date date,
  inspection_color public.inspection_color not null default 'None',
  result text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.status_history (
  id uuid primary key default gen_random_uuid(),
  pipe_inventory_id uuid not null references public.pipe_inventory(id) on delete cascade,
  old_status public.inventory_status,
  new_status public.inventory_status not null,
  comment text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_company_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_internal_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() in ('admin', 'employee'), false)
$$;

create or replace function public.is_staff_reader()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role()::text in ('admin', 'employee', 'sales'), false)
$$;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.yards enable row level security;
alter table public.racks enable row level security;
alter table public.workflow_zones enable row level security;
alter table public.part_numbers enable row level security;
alter table public.pipe_inventory enable row level security;
alter table public.pipe_transactions enable row level security;
alter table public.receiving_tickets enable row level security;
alter table public.shipping_tickets enable row level security;
alter table public.ticket_line_items enable row level security;
alter table public.documents enable row level security;
alter table public.inspection_records enable row level security;
alter table public.status_history enable row level security;

create policy "internal full companies"
on public.companies
for all
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "customers read own company"
on public.companies
for select
using (id = public.current_user_company_id());

create policy "staff read companies"
on public.companies
for select
to authenticated
using (public.is_staff_reader());

create policy "profiles read self or internal"
on public.profiles
for select
using (id = auth.uid() or public.is_internal_user());

create policy "profiles internal write"
on public.profiles
for all
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "yards visible to authenticated"
on public.yards
for select
to authenticated
using (true);

create policy "racks visible to authenticated"
on public.racks
for select
to authenticated
using (true);

create policy "zones visible to authenticated"
on public.workflow_zones
for select
to authenticated
using (true);

create policy "yard setup internal write"
on public.yards
for all
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "rack setup internal write"
on public.racks
for all
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "zone setup internal write"
on public.workflow_zones
for all
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "part numbers internal full"
on public.part_numbers
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "part numbers customer read own"
on public.part_numbers
for select
to authenticated
using (
  company_id is null
  or company_id = public.current_user_company_id()
  or public.is_staff_reader()
);

create policy "part numbers staff read"
on public.part_numbers
for select
to authenticated
using (public.is_staff_reader());

create policy "inventory internal full"
on public.pipe_inventory
for all
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "inventory staff read"
on public.pipe_inventory
for select
to authenticated
using (public.is_staff_reader());

create policy "inventory customer read own"
on public.pipe_inventory
for select
using (company_id = public.current_user_company_id());

create policy "transactions internal full"
on public.pipe_transactions
for all
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "transactions staff read"
on public.pipe_transactions
for select
to authenticated
using (public.is_staff_reader());

create policy "transactions customer read own"
on public.pipe_transactions
for select
using (company_id = public.current_user_company_id());

create policy "receiving tickets staff read"
on public.receiving_tickets
for select
to authenticated
using (public.is_staff_reader());

create policy "receiving tickets customer read own"
on public.receiving_tickets
for select
to authenticated
using (company_id = public.current_user_company_id());

create policy "shipping tickets staff read"
on public.shipping_tickets
for select
to authenticated
using (public.is_staff_reader());

create policy "shipping tickets customer read own"
on public.shipping_tickets
for select
to authenticated
using (company_id = public.current_user_company_id());

create policy "ticket line items staff read"
on public.ticket_line_items
for select
to authenticated
using (public.is_staff_reader());

create policy "ticket line items customer read own"
on public.ticket_line_items
for select
to authenticated
using (company_id = public.current_user_company_id());

create policy "documents internal full"
on public.documents
for all
using (public.is_internal_user())
with check (public.is_internal_user());

create policy "documents staff read"
on public.documents
for select
to authenticated
using (public.is_staff_reader());

create policy "documents customer read own"
on public.documents
for select
using (company_id = public.current_user_company_id());
