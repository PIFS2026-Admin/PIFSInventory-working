create table if not exists public.sales_customer_assignments (
  sales_user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (sales_user_id, company_id)
);

alter table public.sales_customer_assignments enable row level security;

grant select, insert, update, delete on public.sales_customer_assignments to authenticated;

create or replace function public.sales_user_can_access_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.current_user_role(), '') in (
      'admin',
      'employee',
      'inventory_manager',
      'inventory_specialist',
      'service_line_manager'
    )
    or exists (
      select 1
      from public.sales_customer_assignments sca
      where sca.sales_user_id = auth.uid()
        and sca.company_id = p_company_id
    );
$$;

drop policy if exists "sales customer assignments read" on public.sales_customer_assignments;
create policy "sales customer assignments read"
on public.sales_customer_assignments
for select
to authenticated
using (
  coalesce(public.current_user_role(), '') in ('admin', 'service_line_manager')
  or sales_user_id = auth.uid()
);

drop policy if exists "sales customer assignments admin write" on public.sales_customer_assignments;
create policy "sales customer assignments admin write"
on public.sales_customer_assignments
for all
to authenticated
using (coalesce(public.current_user_role(), '') in ('admin', 'service_line_manager'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'service_line_manager'));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'companies'
      and column_name = 'id'
  ) then
    execute 'drop policy if exists "companies assigned sales read" on public.companies';
    execute '
      create policy "companies assigned sales read"
      on public.companies
      for select
      to authenticated
      using (public.sales_user_can_access_company(id))
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pipe_inventory'
      and column_name = 'company_id'
  ) then
    execute 'drop policy if exists "pipe inventory assigned sales read" on public.pipe_inventory';
    execute '
      create policy "pipe inventory assigned sales read"
      on public.pipe_inventory
      for select
      to authenticated
      using (public.sales_user_can_access_company(company_id))
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pipe_transactions'
      and column_name = 'company_id'
  ) then
    execute 'drop policy if exists "pipe transactions assigned sales read" on public.pipe_transactions';
    execute '
      create policy "pipe transactions assigned sales read"
      on public.pipe_transactions
      for select
      to authenticated
      using (public.sales_user_can_access_company(company_id))
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tubular_release_requests'
      and column_name = 'company_id'
  ) then
    execute 'drop policy if exists "release requests assigned sales read" on public.tubular_release_requests';
    execute '
      create policy "release requests assigned sales read"
      on public.tubular_release_requests
      for select
      to authenticated
      using (public.sales_user_can_access_company(company_id))
    ';
  end if;
end $$;
