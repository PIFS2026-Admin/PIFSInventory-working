-- TITAN Purchase Order approval matrix.
-- Safe to run more than once. Adds configurable approval routing without deleting existing data.

create extension if not exists pgcrypto;

create or replace function public.titan_po_is_internal_user()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  role_text text;
begin
  if to_regclass('public.profiles') is null then
    return true;
  end if;

  begin
    execute 'select role::text from public.profiles where id = auth.uid() limit 1'
      into role_text;
  exception
    when undefined_column then
      return true;
    when undefined_table then
      return true;
  end;

  return coalesce(role_text <> 'customer', true);
end;
$$;

revoke all on function public.titan_po_is_internal_user() from public;
grant execute on function public.titan_po_is_internal_user() to authenticated, service_role;

create table if not exists public.purchase_order_approval_matrix (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid references public.yards(id) on delete set null,
  department text,
  cost_center text,
  min_amount numeric(12, 2) not null default 0,
  max_amount numeric(12, 2),
  tier integer not null default 1,
  approver_role text,
  approver_id uuid references auth.users(id) on delete set null,
  approver_name text,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_order_approval_matrix enable row level security;

grant select, insert, update on public.purchase_order_approval_matrix to authenticated, service_role;

drop policy if exists "po approval matrix internal read" on public.purchase_order_approval_matrix;
create policy "po approval matrix internal read"
on public.purchase_order_approval_matrix
for select
to authenticated
using (public.titan_po_is_internal_user());

drop policy if exists "po approval matrix internal write" on public.purchase_order_approval_matrix;
create policy "po approval matrix internal write"
on public.purchase_order_approval_matrix
for all
to authenticated
using (public.titan_po_is_internal_user())
with check (public.titan_po_is_internal_user());

drop trigger if exists set_purchase_order_approval_matrix_updated_at on public.purchase_order_approval_matrix;
create trigger set_purchase_order_approval_matrix_updated_at
before update on public.purchase_order_approval_matrix
for each row execute function public.set_updated_at();

create index if not exists purchase_order_approval_matrix_active_idx
on public.purchase_order_approval_matrix(active);

create index if not exists purchase_order_approval_matrix_scope_idx
on public.purchase_order_approval_matrix(yard_id, department, cost_center, min_amount, max_amount, tier)
where active = true;

create unique index if not exists purchase_order_approval_matrix_rule_uidx
on public.purchase_order_approval_matrix (
  coalesce(yard_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(lower(nullif(department, '')), ''),
  coalesce(lower(nullif(cost_center, '')), ''),
  min_amount,
  coalesce(max_amount, 999999999.99),
  tier,
  coalesce(approver_role, ''),
  coalesce(approver_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
where active = true;
