create extension if not exists pgcrypto;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  name text not null,
  description text,
  module_key text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, permission_id)
);

create table if not exists public.customer_assignments (
  id uuid primary key default gen_random_uuid(),
  sales_user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (sales_user_id, company_id)
);

create table if not exists public.email_notification_types (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.email_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_type_id uuid not null references public.email_notification_types(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (notification_type_id, user_id)
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.customer_assignments enable row level security;
alter table public.email_notification_types enable row level security;
alter table public.email_notification_recipients enable row level security;
alter table public.admin_audit_log enable row level security;

grant select, insert, update, delete on public.roles to authenticated, service_role;
grant select, insert, update, delete on public.permissions to authenticated, service_role;
grant select, insert, update, delete on public.role_permissions to authenticated, service_role;
grant select, insert, update, delete on public.user_roles to authenticated, service_role;
grant select, insert, update, delete on public.user_permissions to authenticated, service_role;
grant select, insert, update, delete on public.customer_assignments to authenticated, service_role;
grant select, insert, update, delete on public.email_notification_types to authenticated, service_role;
grant select, insert, update, delete on public.email_notification_recipients to authenticated, service_role;
grant select, insert, update, delete on public.admin_audit_log to authenticated, service_role;

create or replace function public.titan_current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(coalesce(p.role::text, '')) in ('admin', 'administrator')
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and ur.is_active = true
      and r.is_active = true
      and lower(r.role_key) in ('admin', 'administrator')
  );
$$;

create or replace function public.titan_current_user_is_internal()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.titan_current_user_is_admin()
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and lower(coalesce(p.role::text, '')) not in ('', 'customer')
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and ur.is_active = true
      and r.is_active = true
  );
$$;

revoke all on function public.titan_current_user_is_admin() from public, anon;
revoke all on function public.titan_current_user_is_internal() from public, anon;
grant execute on function public.titan_current_user_is_admin() to authenticated, service_role;
grant execute on function public.titan_current_user_is_internal() to authenticated, service_role;

drop policy if exists "admin full roles" on public.roles;
create policy "admin full roles" on public.roles
for all to authenticated
using (public.titan_current_user_is_admin())
with check (public.titan_current_user_is_admin());

drop policy if exists "internal read roles" on public.roles;
create policy "internal read roles" on public.roles
for select to authenticated
using (public.titan_current_user_is_internal());

drop policy if exists "admin full permissions" on public.permissions;
create policy "admin full permissions" on public.permissions
for all to authenticated
using (public.titan_current_user_is_admin())
with check (public.titan_current_user_is_admin());

drop policy if exists "internal read permissions" on public.permissions;
create policy "internal read permissions" on public.permissions
for select to authenticated
using (public.titan_current_user_is_internal());

drop policy if exists "admin full role permissions" on public.role_permissions;
create policy "admin full role permissions" on public.role_permissions
for all to authenticated
using (public.titan_current_user_is_admin())
with check (public.titan_current_user_is_admin());

drop policy if exists "internal read role permissions" on public.role_permissions;
create policy "internal read role permissions" on public.role_permissions
for select to authenticated
using (public.titan_current_user_is_internal());

drop policy if exists "admin full user roles" on public.user_roles;
create policy "admin full user roles" on public.user_roles
for all to authenticated
using (public.titan_current_user_is_admin())
with check (public.titan_current_user_is_admin());

drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles" on public.user_roles
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "admin full user permissions" on public.user_permissions;
create policy "admin full user permissions" on public.user_permissions
for all to authenticated
using (public.titan_current_user_is_admin())
with check (public.titan_current_user_is_admin());

drop policy if exists "users read own permissions" on public.user_permissions;
create policy "users read own permissions" on public.user_permissions
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "admin full customer assignments" on public.customer_assignments;
create policy "admin full customer assignments" on public.customer_assignments
for all to authenticated
using (public.titan_current_user_is_admin())
with check (public.titan_current_user_is_admin());

drop policy if exists "sales read own customer assignments" on public.customer_assignments;
create policy "sales read own customer assignments" on public.customer_assignments
for select to authenticated
using ((select auth.uid()) = sales_user_id and is_active = true);

drop policy if exists "admin full email notification types" on public.email_notification_types;
create policy "admin full email notification types" on public.email_notification_types
for all to authenticated
using (public.titan_current_user_is_admin())
with check (public.titan_current_user_is_admin());

drop policy if exists "internal read email notification types" on public.email_notification_types;
create policy "internal read email notification types" on public.email_notification_types
for select to authenticated
using (public.titan_current_user_is_internal());

drop policy if exists "admin full email notification recipients" on public.email_notification_recipients;
create policy "admin full email notification recipients" on public.email_notification_recipients
for all to authenticated
using (public.titan_current_user_is_admin())
with check (public.titan_current_user_is_admin());

drop policy if exists "users read own email notification recipients" on public.email_notification_recipients;
create policy "users read own email notification recipients" on public.email_notification_recipients
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "admin read audit log" on public.admin_audit_log;
create policy "admin read audit log" on public.admin_audit_log
for select to authenticated
using (public.titan_current_user_is_admin());

drop policy if exists "admin insert audit log" on public.admin_audit_log;
create policy "admin insert audit log" on public.admin_audit_log
for insert to authenticated
with check (public.titan_current_user_is_admin());

insert into public.roles (role_key, name, description)
values
  ('admin', 'Administrator', 'Full access to TITAN.'),
  ('administrator', 'Administrator', 'Full access to TITAN.'),
  ('operations', 'Operations', 'Operations access.'),
  ('dti', 'DTI', 'DTI access.'),
  ('sales', 'Sales', 'Sales and customer inventory visibility.'),
  ('inventory', 'Inventory', 'Inventory and purchasing access.'),
  ('accounting', 'Accounting', 'Accounting and report access.'),
  ('viewer', 'Viewer', 'Read-only access.'),
  ('employee', 'Employee', 'General employee access.'),
  ('customer', 'Customer', 'Customer portal access.'),
  ('operator', 'Operator', 'Operator access.'),
  ('service_line_manager', 'Service Line Manager', 'Service line management access.'),
  ('dti_superintendent', 'DTI Superintendent', 'DTI superintendent access.'),
  ('dti_lead', 'DTI Lead', 'DTI lead access.'),
  ('dti_inspector', 'DTI Inspector', 'DTI daily summary access.'),
  ('level_2_inspector', 'Level 2 Inspector', 'Level 2 inspection access.'),
  ('hardband_lead', 'Hardband Lead', 'Hardband lead access.'),
  ('cdt_lead', 'CDT Lead', 'CDT lead access.'),
  ('inventory_specialist', 'Inventory Specialist', 'Inventory specialist access.'),
  ('inventory_manager', 'Inventory Manager', 'Inventory management access.'),
  ('maintenance_manager', 'Maintenance Manager', 'Maintenance management access.'),
  ('mechanic_manager', 'Mechanic Manager', 'Mechanic management access.'),
  ('maintenance_lead', 'Maintenance Lead', 'Maintenance lead access.'),
  ('maintenance_hand', 'Maintenance Hand', 'Maintenance hand access.'),
  ('mechanic', 'Mechanic', 'Mechanic repair work order access.'),
  ('repair_tech', 'Repair Tech', 'Repair technician work order access.'),
  ('yard_manager', 'Yard Manager', 'Yard manager notifications and access.')
on conflict (role_key) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = now();

insert into public.permissions (permission_key, name, description, module_key, sort_order)
values
  ('dashboard.view', 'Dashboard', 'Open the dashboard.', 'dashboard', 10),
  ('dti.view', 'DTI', 'Open DTI screens.', 'dti', 20),
  ('dti.manage', 'DTI Management', 'Create and manage DTI jobs.', 'dti', 21),
  ('daily_summaries.view', 'Daily Summaries', 'Open daily summaries.', 'daily_summaries', 30),
  ('daily_summaries.manage', 'Daily Summary Management', 'Create and manage daily summaries.', 'daily_summaries', 31),
  ('inventory.view', 'Inventory', 'View inventory items.', 'inventory', 40),
  ('inventory.manage', 'Inventory Management', 'Receive, issue, adjust, and manage inventory.', 'inventory', 41),
  ('customer_inventory.view', 'Customer Inventory', 'View customer inventory.', 'customer_inventory', 50),
  ('customer_inventory.manage', 'Customer Inventory Management', 'Manage customer inventory access.', 'customer_inventory', 51),
  ('purchase_orders.view', 'Purchase Orders', 'View purchase orders.', 'purchase_orders', 60),
  ('purchase_orders.manage', 'Purchase Order Management', 'Create and manage purchase orders.', 'purchase_orders', 61),
  ('issue_tickets.view', 'Issue Tickets', 'View issue tickets.', 'issue_tickets', 70),
  ('issue_tickets.manage', 'Issue Ticket Management', 'Create and fulfill issue tickets.', 'issue_tickets', 71),
  ('reports.view', 'Reports', 'View reports.', 'reports', 80),
  ('reports.print', 'Print Reports', 'Print and export reports.', 'reports', 81),
  ('auto_emails.manage', 'Auto Generated Emails', 'Manage automated email recipients.', 'auto_emails', 90),
  ('admin_settings.manage', 'Admin Settings', 'Manage users, roles, permissions, and system setup.', 'admin_settings', 100),
  ('equipment.view', 'Equipment', 'View equipment.', 'equipment', 110),
  ('equipment.manage', 'Equipment Management', 'Manage equipment.', 'equipment', 111),
  ('hardbanding.view', 'Hardbanding', 'View hardbanding jobs.', 'hardbanding', 120),
  ('hardbanding.manage', 'Hardbanding Management', 'Manage hardbanding jobs.', 'hardbanding', 121),
  ('tubing.view', 'Tubing', 'View tubing module.', 'tubing', 130),
  ('tubing.manage', 'Tubing Management', 'Manage tubing module.', 'tubing', 131),
  ('analytics.view', 'Analytics', 'View analytics.', 'analytics', 140),
  ('settings.manage', 'Settings', 'Manage system settings.', 'settings', 150)
on conflict (permission_key) do update
set name = excluded.name,
    description = excluded.description,
    module_key = excluded.module_key,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.email_notification_types (notification_key, name, description, sort_order)
values
  ('customer_release_request', 'Customer Release Request', 'Customer submits a tubular release request.', 10),
  ('consumable_order_placed', 'Consumable Order Placed', 'Employee submits a consumable inventory order.', 20),
  ('purchase_order_created', 'PO Created', 'Purchase order is created.', 30),
  ('purchase_order_approved', 'PO Approved', 'Purchase order is approved.', 40),
  ('purchase_order_received', 'PO Received', 'Purchase order is received.', 50),
  ('issue_ticket_created', 'Issue Ticket Created', 'Inventory issue ticket is created.', 60),
  ('daily_summary', 'Daily Summary', 'DTI daily summary is posted.', 70),
  ('dti_summary', 'DTI Summary', 'DTI scorecard or summary is posted.', 80),
  ('inventory_adjustment', 'Inventory Adjustment', 'Inventory quantity or pricing is adjusted.', 90),
  ('low_stock_alert', 'Low Stock Alert', 'Inventory item drops below minimum quantity.', 100),
  ('equipment_work_order', 'Equipment Work Order', 'Equipment work order is created.', 110),
  ('equipment_work_order_completed', 'Equipment Work Order Completed', 'Equipment work order is completed.', 120),
  ('new_user_created', 'New User Created', 'New TITAN user is created.', 130),
  ('password_reset', 'Password Reset', 'Password reset notification.', 140)
on conflict (notification_key) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.user_roles (user_id, role_id, is_active)
select p.id, r.id, true
from public.profiles p
join public.roles r on r.role_key = 'admin'
where lower(coalesce(p.role::text, '')) in ('admin', 'administrator')
on conflict (user_id, role_id) do update set is_active = true;

insert into public.user_permissions (user_id, permission_id, can_access)
select p.id, perm.id, true
from public.profiles p
cross join public.permissions perm
where lower(coalesce(p.role::text, '')) in ('admin', 'administrator')
on conflict (user_id, permission_id) do update set can_access = true;

insert into public.email_notification_recipients (notification_type_id, user_id, enabled)
select nt.id, p.id, true
from public.email_notification_types nt
cross join public.profiles p
where nt.notification_key in ('customer_release_request', 'consumable_order_placed')
  and lower(coalesce(p.role::text, '')) in ('admin', 'administrator')
on conflict (notification_type_id, user_id) do update set enabled = true;
