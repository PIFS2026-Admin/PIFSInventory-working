-- TITAN mechanic / repair role setup
-- Run this in Supabase SQL Editor after the work order tables exist.

do $$
declare
  role_name text;
begin
  if exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'user_role') then
    foreach role_name in array array[
      'maintenance_manager',
      'mechanic_manager',
      'mechanic',
      'repair_tech'
    ] loop
      execute format('alter type public.user_role add value if not exists %L', role_name);
    end loop;
  end if;
end $$;

do $$
begin
  if to_regclass('public.roles') is not null then
    insert into public.roles (role_key, name, description)
    values
      ('maintenance_manager', 'Maintenance Manager', 'Manages maintenance work orders, repair techs, closure, reporting, and repair costs.'),
      ('mechanic_manager', 'Mechanic Manager', 'Manages mechanic work orders, assignments, closure, reporting, and repair costs.'),
      ('mechanic', 'Mechanic', 'Works assigned equipment repair work orders and logs labor and parts.'),
      ('repair_tech', 'Repair Tech', 'Works assigned equipment repair work orders and logs labor and parts.')
    on conflict (role_key) do update
      set name = excluded.name,
          description = excluded.description;
  end if;
end $$;

do $$
begin
  if to_regclass('public.role_permission_defaults') is not null then
    with defaults(role_key, module_key, action_key) as (
      values
        ('maintenance_manager','dashboard','view'),
        ('maintenance_manager','work_orders','view'),
        ('maintenance_manager','work_orders','create'),
        ('maintenance_manager','work_orders','edit'),
        ('maintenance_manager','work_orders','approve'),
        ('maintenance_manager','work_orders','close'),
        ('maintenance_manager','work_orders','export'),
        ('maintenance_manager','work_orders','receive_notifications'),
        ('maintenance_manager','consumable_inventory','view'),
        ('maintenance_manager','issue_tickets','create'),
        ('maintenance_manager','reports','view'),
        ('maintenance_manager','exports','export'),
        ('mechanic_manager','dashboard','view'),
        ('mechanic_manager','work_orders','view'),
        ('mechanic_manager','work_orders','create'),
        ('mechanic_manager','work_orders','edit'),
        ('mechanic_manager','work_orders','approve'),
        ('mechanic_manager','work_orders','close'),
        ('mechanic_manager','work_orders','export'),
        ('mechanic_manager','work_orders','receive_notifications'),
        ('mechanic_manager','consumable_inventory','view'),
        ('mechanic_manager','issue_tickets','create'),
        ('mechanic_manager','reports','view'),
        ('mechanic_manager','exports','export'),
        ('mechanic','work_orders','view'),
        ('mechanic','work_orders','create'),
        ('mechanic','work_orders','edit'),
        ('mechanic','consumable_inventory','view'),
        ('mechanic','issue_tickets','create'),
        ('repair_tech','work_orders','view'),
        ('repair_tech','work_orders','create'),
        ('repair_tech','work_orders','edit'),
        ('repair_tech','consumable_inventory','view'),
        ('repair_tech','issue_tickets','create')
    )
    insert into public.role_permission_defaults (role_key, module_key, action_key, is_allowed)
    select role_key, module_key, action_key, true
    from defaults
    on conflict (role_key, module_key, action_key)
    do update set is_allowed = excluded.is_allowed;
  end if;
end $$;

do $$
begin
  if to_regclass('public.role_notification_preferences') is not null then
    insert into public.role_notification_preferences (role_key, module_key, notification_key, is_enabled)
    values
      ('maintenance_manager','work_orders','created', true),
      ('maintenance_manager','work_orders','assigned', true),
      ('maintenance_manager','work_orders','closed', true),
      ('mechanic_manager','work_orders','created', true),
      ('mechanic_manager','work_orders','assigned', true),
      ('mechanic_manager','work_orders','closed', true),
      ('mechanic','work_orders','assigned', true),
      ('repair_tech','work_orders','assigned', true)
    on conflict (role_key, module_key, notification_key)
    do update set is_enabled = excluded.is_enabled;
  end if;
end $$;

do $$
declare
  profile_record record;
  module_name text;
  modules text[];
begin
  if to_regclass('public.profiles') is null or to_regclass('public.user_module_permissions') is null then
    return;
  end if;

  for profile_record in
    select id, role::text as role_key
    from public.profiles
    where role::text in ('maintenance_manager', 'mechanic_manager', 'mechanic', 'repair_tech')
  loop
    modules := case profile_record.role_key
      when 'maintenance_manager' then array['dashboard','work_orders','inventory','reports']
      when 'mechanic_manager' then array['dashboard','work_orders','inventory','reports']
      when 'mechanic' then array['work_orders','inventory']
      when 'repair_tech' then array['work_orders','inventory']
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
