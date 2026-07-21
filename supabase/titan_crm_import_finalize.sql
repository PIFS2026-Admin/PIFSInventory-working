create extension if not exists pgcrypto;

create table if not exists public.crm_import_exceptions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.crm_import_batches(id) on delete cascade,
  source_system text not null default 'monday',
  entity_type text not null,
  monday_board_id text,
  monday_item_id text,
  monday_item_name text,
  action text not null default 'Needs Review',
  reason text not null,
  matched_record_id uuid,
  matched_by text,
  field_values jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'Open' check (status in ('Open', 'Resolved', 'Ignored')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_crm_import_exceptions_updated_at on public.crm_import_exceptions;
create trigger set_crm_import_exceptions_updated_at
before update on public.crm_import_exceptions
for each row execute function public.set_crm_updated_at();

create index if not exists crm_import_exceptions_batch_idx
  on public.crm_import_exceptions(batch_id, status);

create index if not exists crm_import_exceptions_entity_idx
  on public.crm_import_exceptions(entity_type, monday_board_id, monday_item_id);

alter table public.crm_import_exceptions enable row level security;

grant select, insert, update on public.crm_import_exceptions to authenticated;

drop policy if exists "crm_import_exceptions crm admin select" on public.crm_import_exceptions;
create policy "crm_import_exceptions crm admin select"
on public.crm_import_exceptions
for select
to authenticated
using (public.crm_is_admin());

drop policy if exists "crm_import_exceptions crm admin insert" on public.crm_import_exceptions;
create policy "crm_import_exceptions crm admin insert"
on public.crm_import_exceptions
for insert
to authenticated
with check (public.crm_is_admin());

drop policy if exists "crm_import_exceptions crm admin update" on public.crm_import_exceptions;
create policy "crm_import_exceptions crm admin update"
on public.crm_import_exceptions
for update
to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());
