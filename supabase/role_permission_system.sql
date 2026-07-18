-- TITAN role-based permission foundation
-- Run once in Supabase SQL Editor, then refresh TITAN.

create extension if not exists pgcrypto;

do $$
declare
  role_name text;
begin
  if exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'user_role') then
    foreach role_name in array array[
      'admin',
      'owner',
      'service_line_manager',
      'dti_superintendent',
      'dti_lead',
      'level_2_inspector',
      'yard_manager',
      'yard_hand',
      'inventory_manager',
      'warehouse_employee',
      'sales',
      'office_admin',
      'cdt_lead',
      'cdt_hand',
      'hardband_lead',
      'hardband_hand',
      'tubing_lead',
      'tubing_hand',
      'maintenance_lead',
      'maintenance_hand',
      'maintenance_manager',
      'mechanic_manager',
      'mechanic',
      'repair_tech',
      'customer',
      'employee',
      'operator',
      'inventory_specialist',
      'dti_inspector',
      'lead_inspector'
    ] loop
      execute format('alter type public.user_role add value if not exists %L', role_name);
    end loop;
  end if;
end $$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists email text;
    alter table public.profiles add column if not exists department text;
    alter table public.profiles add column if not exists customer_id uuid;
    alter table public.profiles add column if not exists is_disabled boolean not null default false;
    alter table public.profiles add column if not exists last_login_at timestamptz;

    update public.profiles p
    set email = u.email
    from auth.users u
    where p.id = u.id
      and coalesce(p.email, '') = ''
      and u.email is not null;
  end if;
end $$;

create or replace function public.current_user_role_text()
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
      where p.id = auth.uid()
      limit 1
    ),
    ''
  );
$$;

create or replace function public.is_permission_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role_text() in ('admin', 'owner');
$$;

create or replace function public.current_user_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(p.customer_id, p.company_id)
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    null
  );
$$;

revoke all on function public.current_user_role_text() from public;
revoke all on function public.is_permission_admin() from public;
revoke all on function public.current_user_customer_id() from public;
grant execute on function public.current_user_role_text() to authenticated;
grant execute on function public.is_permission_admin() to authenticated;
grant execute on function public.current_user_customer_id() to authenticated;

create table if not exists public.user_module_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_key)
);

create table if not exists public.user_permission_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  action_key text not null,
  is_allowed boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key, action_key)
);

create table if not exists public.role_permission_defaults (
  role_key text not null,
  module_key text not null,
  action_key text not null,
  is_allowed boolean not null default true,
  primary key (role_key, module_key, action_key)
);

create table if not exists public.role_notification_preferences (
  role_key text not null,
  module_key text not null,
  notification_key text not null,
  is_enabled boolean not null default true,
  primary key (role_key, module_key, notification_key)
);

create table if not exists public.user_notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  notification_key text not null,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key, notification_key)
);

create table if not exists public.inventory_user_yards (
  user_id uuid not null references auth.users(id) on delete cascade,
  yard_id uuid not null references public.yards(id) on delete cascade,
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, yard_id)
);

alter table public.inventory_user_yards
  add column if not exists user_id uuid;

alter table public.inventory_user_yards
  add column if not exists yard_id uuid;

alter table public.inventory_user_yards
  add column if not exists can_access boolean;

alter table public.inventory_user_yards
  add column if not exists created_at timestamptz not null default now();

alter table public.inventory_user_yards
  add column if not exists updated_at timestamptz not null default now();

update public.inventory_user_yards
set can_access = true
where can_access is null;

alter table public.inventory_user_yards
  alter column can_access set default true;

alter table public.inventory_user_yards
  alter column can_access set not null;

create unique index if not exists inventory_user_yards_user_yard_key
on public.inventory_user_yards (user_id, yard_id);

alter table public.user_module_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.role_permission_defaults enable row level security;
alter table public.role_notification_preferences enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.inventory_user_yards enable row level security;

drop policy if exists "permission admins manage user modules" on public.user_module_permissions;
create policy "permission admins manage user modules"
on public.user_module_permissions
for all
to authenticated
using (public.is_permission_admin())
with check (public.is_permission_admin());

drop policy if exists "users read own user modules" on public.user_module_permissions;
create policy "users read own user modules"
on public.user_module_permissions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "permission admins manage user overrides" on public.user_permission_overrides;
create policy "permission admins manage user overrides"
on public.user_permission_overrides
for all
to authenticated
using (public.is_permission_admin())
with check (public.is_permission_admin());

drop policy if exists "users read own permission overrides" on public.user_permission_overrides;
create policy "users read own permission overrides"
on public.user_permission_overrides
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "authenticated read role permission defaults" on public.role_permission_defaults;
create policy "authenticated read role permission defaults"
on public.role_permission_defaults
for select
to authenticated
using (true);

drop policy if exists "permission admins manage role permission defaults" on public.role_permission_defaults;
create policy "permission admins manage role permission defaults"
on public.role_permission_defaults
for all
to authenticated
using (public.is_permission_admin())
with check (public.is_permission_admin());

drop policy if exists "authenticated read role notifications" on public.role_notification_preferences;
create policy "authenticated read role notifications"
on public.role_notification_preferences
for select
to authenticated
using (true);

drop policy if exists "permission admins manage role notifications" on public.role_notification_preferences;
create policy "permission admins manage role notifications"
on public.role_notification_preferences
for all
to authenticated
using (public.is_permission_admin())
with check (public.is_permission_admin());

drop policy if exists "permission admins manage user notifications" on public.user_notification_preferences;
create policy "permission admins manage user notifications"
on public.user_notification_preferences
for all
to authenticated
using (public.is_permission_admin())
with check (public.is_permission_admin());

drop policy if exists "users read own notification preferences" on public.user_notification_preferences;
create policy "users read own notification preferences"
on public.user_notification_preferences
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "permission admins manage yard access" on public.inventory_user_yards;
create policy "permission admins manage yard access"
on public.inventory_user_yards
for all
to authenticated
using (public.is_permission_admin())
with check (public.is_permission_admin());

drop policy if exists "users read own yard access" on public.inventory_user_yards;
create policy "users read own yard access"
on public.inventory_user_yards
for select
to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.user_module_permissions to authenticated;
grant select, insert, update, delete on public.user_permission_overrides to authenticated;
grant select, insert, update, delete on public.role_permission_defaults to authenticated;
grant select, insert, update, delete on public.role_notification_preferences to authenticated;
grant select, insert, update, delete on public.user_notification_preferences to authenticated;
grant select, insert, update, delete on public.inventory_user_yards to authenticated;

with
modules(module_key) as (
  values
    ('dashboard'),
    ('tubular_inventory'),
    ('customer_portal'),
    ('release_requests'),
    ('receiving'),
    ('shipping'),
    ('pipe_moves'),
    ('consumable_inventory'),
    ('purchase_orders'),
    ('issue_tickets'),
    ('work_orders'),
    ('daily_summaries'),
    ('dti'),
    ('cdt'),
    ('hardbanding'),
    ('tubing'),
    ('lead_scorecards'),
    ('reports'),
    ('exports'),
    ('user_management'),
    ('system_settings'),
    ('email_notification_settings')
),
actions(action_key) as (
  values
    ('view'),
    ('create'),
    ('edit'),
    ('delete'),
    ('approve'),
    ('close'),
    ('export'),
    ('manage_settings'),
    ('receive_notifications')
),
full_roles(role_key) as (values ('admin'), ('owner'))
insert into public.role_permission_defaults (role_key, module_key, action_key, is_allowed)
select role_key, module_key, action_key, true
from full_roles
cross join modules
cross join actions
on conflict (role_key, module_key, action_key)
do update set is_allowed = excluded.is_allowed;

with defaults(role_key, module_key, action_key) as (
  values
    ('service_line_manager','dashboard','view'),
    ('service_line_manager','reports','view'),
    ('service_line_manager','reports','export'),
    ('service_line_manager','exports','view'),
    ('service_line_manager','exports','export'),
    ('service_line_manager','lead_scorecards','view'),
    ('service_line_manager','dti','view'),
    ('service_line_manager','dti','approve'),
    ('service_line_manager','dti','close'),
    ('service_line_manager','daily_summaries','view'),
    ('service_line_manager','daily_summaries','approve'),
    ('service_line_manager','daily_summaries','close'),
    ('service_line_manager','cdt','view'),
    ('service_line_manager','hardbanding','view'),
    ('service_line_manager','tubing','view'),
    ('service_line_manager','consumable_inventory','view'),
    ('service_line_manager','purchase_orders','view'),
    ('service_line_manager','purchase_orders','approve'),
    ('dti_superintendent','dashboard','view'),
    ('dti_superintendent','dti','view'),
    ('dti_superintendent','dti','create'),
    ('dti_superintendent','dti','edit'),
    ('dti_superintendent','dti','approve'),
    ('dti_superintendent','dti','close'),
    ('dti_superintendent','dti','export'),
    ('dti_superintendent','daily_summaries','view'),
    ('dti_superintendent','daily_summaries','create'),
    ('dti_superintendent','daily_summaries','edit'),
    ('dti_superintendent','daily_summaries','approve'),
    ('dti_superintendent','daily_summaries','export'),
    ('dti_superintendent','lead_scorecards','view'),
    ('dti_superintendent','reports','view'),
    ('dti_superintendent','reports','export'),
    ('dti_superintendent','consumable_inventory','view'),
    ('dti_superintendent','issue_tickets','create'),
    ('dti_lead','dti','view'),
    ('dti_lead','dti','create'),
    ('dti_lead','dti','edit'),
    ('dti_lead','dti','close'),
    ('dti_lead','daily_summaries','view'),
    ('dti_lead','daily_summaries','create'),
    ('dti_lead','daily_summaries','edit'),
    ('dti_lead','consumable_inventory','view'),
    ('dti_lead','issue_tickets','create'),
    ('level_2_inspector','dti','view'),
    ('level_2_inspector','dti','create'),
    ('level_2_inspector','dti','edit'),
    ('level_2_inspector','daily_summaries','view'),
    ('level_2_inspector','daily_summaries','create'),
    ('yard_manager','dashboard','view'),
    ('yard_manager','tubular_inventory','view'),
    ('yard_manager','tubular_inventory','create'),
    ('yard_manager','tubular_inventory','edit'),
    ('yard_manager','tubular_inventory','delete'),
    ('yard_manager','release_requests','view'),
    ('yard_manager','release_requests','approve'),
    ('yard_manager','receiving','view'),
    ('yard_manager','receiving','create'),
    ('yard_manager','receiving','edit'),
    ('yard_manager','shipping','view'),
    ('yard_manager','shipping','create'),
    ('yard_manager','shipping','edit'),
    ('yard_manager','pipe_moves','view'),
    ('yard_manager','pipe_moves','create'),
    ('yard_manager','pipe_moves','edit'),
    ('yard_manager','reports','view'),
    ('yard_manager','reports','export'),
    ('yard_hand','tubular_inventory','view'),
    ('yard_hand','receiving','view'),
    ('yard_hand','receiving','create'),
    ('yard_hand','shipping','view'),
    ('yard_hand','shipping','create'),
    ('yard_hand','pipe_moves','view'),
    ('yard_hand','pipe_moves','create'),
    ('inventory_manager','dashboard','view'),
    ('inventory_manager','consumable_inventory','view'),
    ('inventory_manager','consumable_inventory','create'),
    ('inventory_manager','consumable_inventory','edit'),
    ('inventory_manager','consumable_inventory','delete'),
    ('inventory_manager','consumable_inventory','manage_settings'),
    ('inventory_manager','purchase_orders','view'),
    ('inventory_manager','purchase_orders','create'),
    ('inventory_manager','purchase_orders','edit'),
    ('inventory_manager','purchase_orders','delete'),
    ('inventory_manager','purchase_orders','approve'),
    ('inventory_manager','issue_tickets','view'),
    ('inventory_manager','issue_tickets','create'),
    ('inventory_manager','issue_tickets','edit'),
    ('inventory_manager','reports','view'),
    ('inventory_manager','reports','export'),
    ('inventory_specialist','dashboard','view'),
    ('inventory_specialist','consumable_inventory','view'),
    ('inventory_specialist','consumable_inventory','create'),
    ('inventory_specialist','consumable_inventory','edit'),
    ('inventory_specialist','purchase_orders','view'),
    ('inventory_specialist','purchase_orders','create'),
    ('inventory_specialist','purchase_orders','edit'),
    ('inventory_specialist','issue_tickets','view'),
    ('inventory_specialist','issue_tickets','create'),
    ('warehouse_employee','consumable_inventory','view'),
    ('warehouse_employee','consumable_inventory','create'),
    ('warehouse_employee','issue_tickets','view'),
    ('warehouse_employee','issue_tickets','create'),
    ('sales','dashboard','view'),
    ('sales','tubular_inventory','view'),
    ('sales','release_requests','view'),
    ('sales','customer_portal','view'),
    ('sales','reports','view'),
    ('sales','reports','export'),
    ('office_admin','dashboard','view'),
    ('office_admin','customer_portal','view'),
    ('office_admin','daily_summaries','view'),
    ('office_admin','daily_summaries','edit'),
    ('office_admin','reports','view'),
    ('office_admin','reports','export'),
    ('office_admin','purchase_orders','view'),
    ('office_admin','purchase_orders','create'),
    ('office_admin','user_management','view'),
    ('office_admin','user_management','create'),
    ('office_admin','user_management','edit'),
    ('cdt_lead','cdt','view'),
    ('cdt_lead','cdt','create'),
    ('cdt_lead','cdt','edit'),
    ('cdt_lead','cdt','close'),
    ('cdt_lead','consumable_inventory','view'),
    ('cdt_lead','issue_tickets','create'),
    ('cdt_hand','cdt','view'),
    ('cdt_hand','cdt','create'),
    ('hardband_lead','hardbanding','view'),
    ('hardband_lead','hardbanding','create'),
    ('hardband_lead','hardbanding','edit'),
    ('hardband_lead','hardbanding','close'),
    ('hardband_lead','consumable_inventory','view'),
    ('hardband_lead','issue_tickets','create'),
    ('hardband_hand','hardbanding','view'),
    ('hardband_hand','hardbanding','create'),
    ('tubing_lead','tubing','view'),
    ('tubing_lead','tubing','create'),
    ('tubing_lead','tubing','edit'),
    ('tubing_lead','tubing','close'),
    ('tubing_lead','consumable_inventory','view'),
    ('tubing_lead','issue_tickets','create'),
    ('tubing_hand','tubing','view'),
    ('tubing_hand','tubing','create'),
    ('maintenance_lead','dashboard','view'),
    ('maintenance_lead','work_orders','view'),
    ('maintenance_lead','work_orders','create'),
    ('maintenance_lead','work_orders','edit'),
    ('maintenance_lead','work_orders','approve'),
    ('maintenance_lead','work_orders','close'),
    ('maintenance_lead','work_orders','export'),
    ('maintenance_lead','consumable_inventory','view'),
    ('maintenance_lead','issue_tickets','create'),
    ('maintenance_hand','work_orders','view'),
    ('maintenance_hand','work_orders','create'),
    ('maintenance_hand','work_orders','edit'),
    ('maintenance_manager','dashboard','view'),
    ('maintenance_manager','work_orders','view'),
    ('maintenance_manager','work_orders','create'),
    ('maintenance_manager','work_orders','edit'),
    ('maintenance_manager','work_orders','approve'),
    ('maintenance_manager','work_orders','close'),
    ('maintenance_manager','work_orders','export'),
    ('maintenance_manager','consumable_inventory','view'),
    ('maintenance_manager','issue_tickets','create'),
    ('maintenance_manager','reports','view'),
    ('mechanic_manager','dashboard','view'),
    ('mechanic_manager','work_orders','view'),
    ('mechanic_manager','work_orders','create'),
    ('mechanic_manager','work_orders','edit'),
    ('mechanic_manager','work_orders','approve'),
    ('mechanic_manager','work_orders','close'),
    ('mechanic_manager','work_orders','export'),
    ('mechanic_manager','consumable_inventory','view'),
    ('mechanic_manager','issue_tickets','create'),
    ('mechanic_manager','reports','view'),
    ('mechanic','work_orders','view'),
    ('mechanic','work_orders','create'),
    ('mechanic','work_orders','edit'),
    ('mechanic','consumable_inventory','view'),
    ('mechanic','issue_tickets','create'),
    ('repair_tech','work_orders','view'),
    ('repair_tech','work_orders','create'),
    ('repair_tech','work_orders','edit'),
    ('repair_tech','consumable_inventory','view'),
    ('repair_tech','issue_tickets','create'),
    ('customer','customer_portal','view'),
    ('customer','release_requests','view'),
    ('customer','release_requests','create'),
    ('customer','reports','view'),
    ('customer','exports','export')
)
insert into public.role_permission_defaults (role_key, module_key, action_key, is_allowed)
select role_key, module_key, action_key, true
from defaults
on conflict (role_key, module_key, action_key)
do update set is_allowed = excluded.is_allowed;

insert into public.role_notification_preferences (role_key, module_key, notification_key, is_enabled)
select role_key, module_key, notification_key, true
from (
  values
    ('admin','release_requests','submitted'),
    ('admin','purchase_orders','submitted'),
    ('admin','purchase_orders','ordered'),
    ('owner','release_requests','submitted'),
    ('owner','purchase_orders','submitted'),
    ('yard_manager','release_requests','submitted'),
    ('yard_manager','receiving','created'),
    ('yard_manager','shipping','created'),
    ('inventory_manager','purchase_orders','submitted'),
    ('inventory_manager','purchase_orders','ordered'),
    ('inventory_manager','consumable_inventory','low_stock'),
    ('inventory_specialist','issue_tickets','created'),
    ('dti_superintendent','daily_summaries','submitted'),
    ('service_line_manager','lead_scorecards','weekly_summary')
) as notifications(role_key, module_key, notification_key)
on conflict (role_key, module_key, notification_key)
do update set is_enabled = excluded.is_enabled;

do $$
begin
  if to_regclass('public.yards') is not null then
    if exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = 'yards' and column_name = 'code'
    ) and exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = 'yards' and column_name = 'name'
    ) then
      insert into public.yards (name, code)
      values
        ('Pathfinder Yard WTX', 'PIFS'),
        ('Gillette Yard', 'GILLETTE'),
        ('Casper Yard', 'CASPER'),
        ('Dickinson Yard', 'DICKINSON')
      on conflict (code) do nothing;

      insert into public.inventory_user_yards (user_id, yard_id, can_access)
      select p.id, y.id, true
      from public.profiles p
      cross join public.yards y
      where p.role::text in ('admin', 'owner')
      on conflict (user_id, yard_id)
      do update set can_access = true, updated_at = now();
    end if;
  end if;
end $$;

do $$
declare
  profile_record record;
  module_name text;
  modules text[];
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  for profile_record in
    select id, role::text as role_key
    from public.profiles
  loop
    modules := case profile_record.role_key
      when 'admin' then array['dashboard','yard_view','inventory','purchase_orders','dti','dti_summary','hardband','admin','reports']
      when 'owner' then array['dashboard','yard_view','inventory','purchase_orders','dti','dti_summary','hardband','admin','reports']
      when 'service_line_manager' then array['dashboard','inventory','purchase_orders','dti','dti_summary','hardband','reports']
      when 'dti_superintendent' then array['dashboard','dti','dti_summary','inventory','reports']
      when 'dti_lead' then array['dti','dti_summary','inventory']
      when 'level_2_inspector' then array['dti_summary','inventory']
      when 'yard_manager' then array['dashboard','yard_view','reports']
      when 'yard_hand' then array['yard_view']
      when 'inventory_manager' then array['dashboard','inventory','purchase_orders','reports']
      when 'inventory_specialist' then array['dashboard','inventory','purchase_orders','reports']
      when 'warehouse_employee' then array['inventory']
      when 'sales' then array['dashboard','yard_view','reports']
      when 'office_admin' then array['dashboard','inventory','purchase_orders','dti_summary','admin','reports']
      when 'cdt_lead' then array['dashboard','inventory','reports']
      when 'cdt_hand' then array['inventory']
      when 'hardband_lead' then array['dashboard','hardband','inventory','reports']
      when 'hardband_hand' then array['hardband','inventory']
      when 'tubing_lead' then array['dashboard','inventory','reports']
      when 'tubing_hand' then array['inventory']
      when 'maintenance_manager' then array['dashboard','work_orders','inventory','reports']
      when 'mechanic_manager' then array['dashboard','work_orders','inventory','reports']
      when 'maintenance_lead' then array['dashboard','work_orders','inventory','reports']
      when 'maintenance_hand' then array['work_orders','inventory']
      when 'mechanic' then array['work_orders','inventory']
      when 'repair_tech' then array['work_orders','inventory']
      when 'employee' then array['dashboard','yard_view','inventory','purchase_orders','dti','dti_summary','hardband','reports']
      else array[]::text[]
    end;

    foreach module_name in array modules loop
      insert into public.user_module_permissions (user_id, module_key, can_access)
      values (profile_record.id, module_name, true)
      on conflict (user_id, module_key)
      do update set can_access = excluded.can_access, updated_at = now();
    end loop;
  end loop;
end $$;

do $$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array['pipe_inventory', 'tubular_release_requests', 'documents'] loop
    if to_regclass('public.' || target_table) is not null
      and exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = target_table
          and c.column_name = 'company_id'
      )
    then
      execute format('alter table public.%I enable row level security', target_table);
      policy_name := 'customers read own ' || target_table;
      execute format('drop policy if exists %I on public.%I', policy_name, target_table);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.current_user_role_text() <> ''customer'' or company_id = public.current_user_customer_id())',
        policy_name,
        target_table
      );
    end if;
  end loop;
end $$;
