-- TITAN person-centered access management.
-- Additive and rerunnable. Existing grants remain active exactly as they are.

begin;

do $$ begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.user_module_permissions') is null
    or to_regclass('public.user_permission_overrides') is null
    or to_regclass('public.inventory_user_yards') is null then
    raise exception 'Run supabase/role_permission_system.sql before this migration.';
  end if;
end $$;

alter table public.profiles add column if not exists service_line text;
alter table public.profiles add column if not exists access_configured boolean not null default false;

alter table public.user_module_permissions add column if not exists active boolean not null default true;
alter table public.user_module_permissions add column if not exists grant_source text not null default 'Existing Access';
alter table public.user_module_permissions add column if not exists role_at_grant text;
alter table public.user_module_permissions add column if not exists service_line text;
alter table public.user_module_permissions add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.user_permission_overrides add column if not exists active boolean not null default true;
alter table public.user_permission_overrides add column if not exists grant_source text not null default 'Existing Access';
alter table public.user_permission_overrides add column if not exists service_line text;

alter table public.inventory_user_yards add column if not exists active boolean not null default true;
alter table public.inventory_user_yards add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.titan_access_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null,
  summary text not null,
  before_value jsonb,
  after_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_access_events_target_idx on public.titan_access_events(target_user_id, created_at desc);
alter table public.titan_access_events enable row level security;
grant select on public.titan_access_events to authenticated;
drop policy if exists "permission admins read access events" on public.titan_access_events;
create policy "permission admins read access events" on public.titan_access_events
for select to authenticated using (public.is_permission_admin());

comment on table public.titan_access_events is 'Append-only audit history for person-centered role, module, yard, and extra permission changes.';

commit;
