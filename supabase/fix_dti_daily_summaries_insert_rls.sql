-- Fix DTI Daily Summary inserts without opening the table to public/anonymous users.
-- This keeps RLS enabled and allows only authenticated internal users who are
-- expected to create Daily Summary records.

create or replace function public.can_create_dti_daily_summary()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role_text text;
  allowed boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  select lower(replace(coalesce(p.role::text, ''), ' ', '_'))
  into current_role_text
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if current_role_text in (
    'admin',
    'owner',
    'owners',
    'employee',
    'service_line_manager',
    'service_line_managers',
    'dti_superintendent',
    'dti_superintendents',
    'dti_lead',
    'dti_leads',
    'level_2_inspector',
    'level_2_inspectors',
    'office_admin',
    'office_admins'
  ) then
    return true;
  end if;

  if to_regclass('public.user_permission_overrides') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_permission_overrides'
        and column_name in ('user_id', 'module_key', 'action_key', 'is_allowed')
      group by table_schema, table_name
      having count(distinct column_name) = 4
    )
  then
    execute $sql$
      select exists (
        select 1
        from public.user_permission_overrides
        where user_id = $1
          and lower(module_key::text) in ('daily_summaries', 'dti_daily_summaries', 'daily summaries')
          and lower(action_key::text) in ('create', 'edit', 'manage_settings')
          and coalesce(is_allowed, false) = true
      )
    $sql$
    into allowed
    using auth.uid();

    if allowed then
      return true;
    end if;
  end if;

  if to_regclass('public.user_module_permissions') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_module_permissions'
        and column_name in ('user_id', 'module_key', 'can_access')
      group by table_schema, table_name
      having count(distinct column_name) = 3
    )
  then
    execute $sql$
      select exists (
        select 1
        from public.user_module_permissions
        where user_id = $1
          and lower(module_key::text) in ('daily_summaries', 'dti_daily_summaries', 'daily summaries')
          and coalesce(can_access, false) = true
      )
    $sql$
    into allowed
    using auth.uid();

    if allowed then
      return true;
    end if;
  end if;

  if to_regclass('public.role_permission_defaults') is not null
    and current_role_text is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'role_permission_defaults'
        and column_name in ('role_key', 'module_key', 'action_key', 'is_allowed')
      group by table_schema, table_name
      having count(distinct column_name) = 4
    )
  then
    execute $sql$
      select exists (
        select 1
        from public.role_permission_defaults
        where lower(role_key::text) = $1
          and lower(module_key::text) in ('daily_summaries', 'dti_daily_summaries', 'daily summaries')
          and lower(action_key::text) in ('create', 'edit', 'manage_settings')
          and coalesce(is_allowed, false) = true
      )
    $sql$
    into allowed
    using current_role_text;

    if allowed then
      return true;
    end if;
  end if;

  return false;
end;
$$;

alter table public.dti_daily_summaries enable row level security;

drop policy if exists "dti daily summaries permission insert" on public.dti_daily_summaries;
create policy "dti daily summaries permission insert"
on public.dti_daily_summaries
for insert
to authenticated
with check (
  auth.uid() is not null
  and (created_by is null or created_by = auth.uid())
  and public.can_create_dti_daily_summary()
);

grant execute on function public.can_create_dti_daily_summary() to authenticated;
