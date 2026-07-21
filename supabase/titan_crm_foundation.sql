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
          'crm',
          'communications',
          'admin',
          'reports',
          'dashboard'
        )
      );
  end if;
end $$;

create or replace function public.crm_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role::text
      from public.profiles p
      where p.id = (select auth.uid())
      limit 1
    ),
    ''
  );
$$;

create or replace function public.crm_is_wade()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (
        lower(trim(coalesce(p.full_name, ''))) = 'wade wisenor'
        or lower(trim(coalesce(p.email, ''))) = 'wade@pathfinderinspections.com'
      )
  );
$$;

create or replace function public.crm_can_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.crm_is_wade()
    and (
      public.crm_current_role() in ('admin', 'owner', 'sales')
      or exists (
        select 1
        from public.user_module_permissions ump
        where ump.user_id = (select auth.uid())
          and ump.module_key = 'crm'
          and ump.can_access = true
      )
      or exists (
        select 1
        from public.user_permission_overrides upo
        where upo.user_id = (select auth.uid())
          and upo.module_key = 'crm'
          and upo.action_key = 'view'
          and upo.is_allowed = true
      )
    );
$$;

create or replace function public.crm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.crm_is_wade()
    and (
      public.crm_current_role() in ('admin', 'owner')
      or exists (
        select 1
        from public.user_permission_overrides upo
        where upo.user_id = (select auth.uid())
          and upo.module_key = 'crm'
          and upo.action_key = 'manage_settings'
          and upo.is_allowed = true
      )
    );
$$;

revoke all on function public.crm_current_role() from public;
revoke all on function public.crm_is_wade() from public;
revoke all on function public.crm_can_access() from public;
revoke all on function public.crm_is_admin() from public;
grant execute on function public.crm_current_role() to authenticated;
grant execute on function public.crm_is_wade() to authenticated;
grant execute on function public.crm_can_access() to authenticated;
grant execute on function public.crm_is_admin() to authenticated;

create table if not exists public.crm_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'monday',
  status text not null default 'Discovery' check (status in ('Discovery', 'Mapped', 'Dry Run', 'Imported', 'Archived', 'Failed')),
  name text not null default 'Monday CRM Discovery',
  monday_account_id text,
  monday_workspace_id text,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_import_board_snapshots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.crm_import_batches(id) on delete cascade,
  monday_board_id text not null,
  board_name text not null,
  item_count integer not null default 0,
  group_count integer not null default 0,
  column_count integer not null default 0,
  raw_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, monday_board_id)
);

create table if not exists public.crm_import_column_mappings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.crm_import_batches(id) on delete cascade,
  monday_board_id text not null,
  monday_column_id text not null,
  monday_column_title text not null,
  monday_column_type text not null,
  titan_entity_type text not null default 'custom_field' check (titan_entity_type in ('account', 'contact', 'opportunity', 'activity', 'task', 'custom_field', 'ignored')),
  titan_field_key text,
  is_custom_field boolean not null default true,
  mapping_status text not null default 'Needs Review' check (mapping_status in ('Needs Review', 'Mapped', 'Ignored')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, monday_board_id, monday_column_id)
);

create table if not exists public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  account_name text not null,
  account_number text,
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Prospect', 'Do Not Use')),
  owner_id uuid references auth.users(id) on delete set null,
  source_system text,
  external_id text,
  industry text,
  phone text,
  website text,
  billing_address text,
  shipping_address text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, external_id)
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.crm_accounts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  full_name text not null,
  title text,
  email text,
  phone text,
  mobile text,
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Do Not Contact')),
  source_system text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, external_id)
);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.crm_accounts(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  opportunity_name text not null,
  pipeline_name text not null default 'Sales Pipeline',
  stage text not null default 'New',
  status text not null default 'Open' check (status in ('Open', 'Won', 'Lost', 'Cancelled', 'Archived')),
  estimated_value numeric(14, 2) not null default 0,
  probability integer not null default 0 check (probability >= 0 and probability <= 100),
  expected_close_date date,
  owner_id uuid references auth.users(id) on delete set null,
  source_system text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, external_id)
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.crm_accounts(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  opportunity_id uuid references public.crm_opportunities(id) on delete cascade,
  activity_type text not null default 'Note' check (activity_type in ('Note', 'Call', 'Email', 'Meeting', 'Task', 'Status Change', 'Import')),
  subject text not null,
  body text,
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  source_system text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, external_id)
);

create table if not exists public.crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default false,
  trigger_key text not null,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.crm_automation_rules(id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending', 'Completed', 'Failed', 'Skipped')),
  trigger_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  user_id uuid references auth.users(id) on delete set null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_crm_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'crm_import_batches',
    'crm_import_column_mappings',
    'crm_accounts',
    'crm_contacts',
    'crm_opportunities',
    'crm_activities',
    'crm_automation_rules'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'set_' || table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_crm_updated_at()',
      'set_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end $$;

create index if not exists crm_accounts_company_idx on public.crm_accounts(company_id);
create index if not exists crm_accounts_owner_idx on public.crm_accounts(owner_id);
create index if not exists crm_contacts_account_idx on public.crm_contacts(account_id);
create index if not exists crm_contacts_email_idx on public.crm_contacts(email);
create index if not exists crm_opportunities_account_idx on public.crm_opportunities(account_id);
create index if not exists crm_opportunities_stage_idx on public.crm_opportunities(stage, status);
create index if not exists crm_activities_account_idx on public.crm_activities(account_id);
create index if not exists crm_activities_opportunity_idx on public.crm_activities(opportunity_id);
create index if not exists crm_audit_log_entity_idx on public.crm_audit_log(entity_type, entity_id);

alter table public.crm_import_batches enable row level security;
alter table public.crm_import_board_snapshots enable row level security;
alter table public.crm_import_column_mappings enable row level security;
alter table public.crm_accounts enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_opportunities enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_automation_rules enable row level security;
alter table public.crm_automation_runs enable row level security;
alter table public.crm_audit_log enable row level security;

grant select, insert, update on public.crm_accounts to authenticated;
grant select, insert, update on public.crm_contacts to authenticated;
grant select, insert, update on public.crm_opportunities to authenticated;
grant select, insert, update on public.crm_activities to authenticated;
grant select, insert, update on public.crm_automation_rules to authenticated;
grant select, insert on public.crm_automation_runs to authenticated;
grant select, insert on public.crm_audit_log to authenticated;
grant select, insert, update on public.crm_import_batches to authenticated;
grant select, insert, update on public.crm_import_board_snapshots to authenticated;
grant select, insert, update on public.crm_import_column_mappings to authenticated;

do $$
declare
  crm_table text;
begin
  foreach crm_table in array array[
    'crm_accounts',
    'crm_contacts',
    'crm_opportunities',
    'crm_activities'
  ]
  loop
    execute format('drop policy if exists "%s crm select" on public.%I', crm_table, crm_table);
    execute format('create policy "%s crm select" on public.%I for select to authenticated using (public.crm_can_access())', crm_table, crm_table);

    execute format('drop policy if exists "%s crm insert" on public.%I', crm_table, crm_table);
    execute format('create policy "%s crm insert" on public.%I for insert to authenticated with check (public.crm_can_access())', crm_table, crm_table);

    execute format('drop policy if exists "%s crm update" on public.%I', crm_table, crm_table);
    execute format('create policy "%s crm update" on public.%I for update to authenticated using (public.crm_can_access()) with check (public.crm_can_access())', crm_table, crm_table);
  end loop;
end $$;

do $$
declare
  admin_table text;
begin
  foreach admin_table in array array[
    'crm_import_batches',
    'crm_import_board_snapshots',
    'crm_import_column_mappings',
    'crm_automation_rules',
    'crm_automation_runs'
  ]
  loop
    execute format('drop policy if exists "%s crm admin select" on public.%I', admin_table, admin_table);
    execute format('create policy "%s crm admin select" on public.%I for select to authenticated using (public.crm_is_admin())', admin_table, admin_table);

    execute format('drop policy if exists "%s crm admin insert" on public.%I', admin_table, admin_table);
    execute format('create policy "%s crm admin insert" on public.%I for insert to authenticated with check (public.crm_is_admin())', admin_table, admin_table);

    execute format('drop policy if exists "%s crm admin update" on public.%I', admin_table, admin_table);
    execute format('create policy "%s crm admin update" on public.%I for update to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin())', admin_table, admin_table);
  end loop;
end $$;

drop policy if exists "crm audit select" on public.crm_audit_log;
create policy "crm audit select"
on public.crm_audit_log
for select
to authenticated
using (public.crm_can_access());

drop policy if exists "crm audit insert" on public.crm_audit_log;
create policy "crm audit insert"
on public.crm_audit_log
for insert
to authenticated
with check (public.crm_can_access());

do $$
begin
  if to_regclass('public.role_permission_defaults') is not null then
    delete from public.role_permission_defaults
    where module_key = 'crm';
  end if;
end $$;

do $$
begin
  if to_regclass('public.user_module_permissions') is not null and to_regclass('public.profiles') is not null then
    delete from public.user_module_permissions ump
    where ump.module_key = 'crm'
      and not exists (
        select 1
        from public.profiles p
        where p.id = ump.user_id
          and (
            lower(trim(coalesce(p.full_name, ''))) = 'wade wisenor'
            or lower(trim(coalesce(p.email, ''))) = 'wade@pathfinderinspections.com'
          )
      );

    insert into public.user_module_permissions (user_id, module_key, can_access)
    select p.id, 'crm', true
    from public.profiles p
    where
      lower(trim(coalesce(p.full_name, ''))) = 'wade wisenor'
      or lower(trim(coalesce(p.email, ''))) = 'wade@pathfinderinspections.com'
    on conflict (user_id, module_key) do update
      set can_access = excluded.can_access,
          updated_at = now();
  end if;
end $$;
