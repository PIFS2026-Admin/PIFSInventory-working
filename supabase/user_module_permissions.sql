create table if not exists public.user_module_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_key),
  constraint user_module_permissions_module_key_check check (
    module_key in (
      'yard_view',
      'inventory',
      'purchase_orders',
      'dti',
      'dti_summary',
      'hardband',
      'admin',
      'reports',
      'dashboard'
    )
  )
);

create index if not exists user_module_permissions_user_id_idx
  on public.user_module_permissions (user_id);

alter table public.user_module_permissions enable row level security;

grant select, insert, update, delete on public.user_module_permissions to authenticated;

drop policy if exists "module permissions self read" on public.user_module_permissions;
create policy "module permissions self read"
on public.user_module_permissions
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "module permissions admin read" on public.user_module_permissions;
create policy "module permissions admin read"
on public.user_module_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'employee')
  )
);

drop policy if exists "module permissions admin write" on public.user_module_permissions;
create policy "module permissions admin write"
on public.user_module_permissions
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);
