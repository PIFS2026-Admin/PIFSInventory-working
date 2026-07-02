-- TITAN Document Control database foundation
-- Files are stored in Supabase Storage bucket: document-control
-- Database tables below store metadata, permissions, version history, and notification scheduling only.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('document-control', 'document-control', false)
on conflict (id) do nothing;

create or replace function public.document_control_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.document_control_current_role()
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

create or replace function public.document_control_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (
    select p.company_id
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  );
$$;

create or replace function public.document_control_is_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(public.document_control_current_role()) not in ('', 'customer', 'customers');
$$;

create or replace function public.document_control_is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(replace(public.document_control_current_role(), ' ', '_')) in (
    'admin',
    'owner',
    'owners',
    'service_line_manager',
    'service_line_managers',
    'office_admin',
    'office_admins',
    'yard_manager',
    'inventory_manager',
    'hse',
    'hse_manager'
  );
$$;

create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_number text unique,
  title text not null,
  category_id uuid references public.document_categories(id) on delete set null,
  category text,
  department text,
  related_employee_id uuid,
  related_employee text,
  related_equipment_id uuid,
  related_equipment text,
  related_customer_id uuid references public.companies(id) on delete set null,
  related_customer text,
  related_vendor_id uuid,
  related_vendor text,
  issue_date date,
  expiration_date date,
  renewal_required boolean not null default false,
  approval_status text not null default 'Draft'
    check (approval_status in ('Draft', 'Pending Review', 'Approved', 'Rejected', 'Archived')),
  document_status text not null default 'Active'
    check (document_status in ('Active', 'Expiring Soon', 'Expired', 'Archived')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  current_version_id uuid,
  file_path text,
  file_name text,
  file_type text,
  file_size bigint,
  notes text,
  is_customer_visible boolean not null default false,
  is_restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null default 1,
  file_path text not null,
  file_name text,
  file_type text,
  file_size bigint,
  change_notes text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'documents'
      and constraint_name = 'documents_current_version_id_fkey'
  ) then
    alter table public.documents
      add constraint documents_current_version_id_fkey
      foreign key (current_version_id)
      references public.document_versions(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  permission_scope text not null
    check (permission_scope in ('role', 'user', 'department', 'customer', 'yard', 'all_internal')),
  role_name text,
  user_id uuid references public.profiles(id) on delete cascade,
  department text,
  customer_id uuid references public.companies(id) on delete cascade,
  yard_id uuid references public.yards(id) on delete cascade,
  can_view boolean not null default true,
  can_upload boolean not null default false,
  can_edit boolean not null default false,
  can_archive boolean not null default false,
  can_delete boolean not null default false,
  can_approve boolean not null default false,
  receive_notifications boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_expiration_notifications (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  notify_days_before integer not null default 30,
  notification_date date,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  recipient_email text,
  sent_at timestamptz,
  status text not null default 'Pending'
    check (status in ('Pending', 'Sent', 'Failed', 'Cancelled')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.document_categories (name, sort_order)
values
  ('HSE', 10),
  ('SOPs', 20),
  ('Certifications', 30),
  ('Calibrations', 40),
  ('Equipment Documents', 50),
  ('Employee Documents', 60),
  ('Customer Documents', 70),
  ('Vendor Documents', 80),
  ('Forms', 90),
  ('Policies', 100),
  ('Training Documents', 110),
  ('Other', 120)
on conflict (name) do update
set sort_order = excluded.sort_order,
    updated_at = now();

create index if not exists document_categories_name_idx on public.document_categories (name);
create index if not exists document_categories_active_idx on public.document_categories (is_active);

create index if not exists documents_category_id_idx on public.documents (category_id);
create index if not exists documents_category_idx on public.documents (category);
create index if not exists documents_department_idx on public.documents (department);
create index if not exists documents_expiration_date_idx on public.documents (expiration_date);
create index if not exists documents_status_idx on public.documents (document_status);
create index if not exists documents_approval_status_idx on public.documents (approval_status);
create index if not exists documents_related_customer_idx on public.documents (related_customer_id);
create index if not exists documents_related_employee_idx on public.documents (related_employee_id);
create index if not exists documents_related_equipment_idx on public.documents (related_equipment_id);
create index if not exists documents_related_vendor_idx on public.documents (related_vendor_id);
create index if not exists documents_uploaded_by_idx on public.documents (uploaded_by);

create index if not exists document_versions_document_id_idx on public.document_versions (document_id);

create index if not exists document_permissions_document_id_idx on public.document_permissions (document_id);
create index if not exists document_permissions_scope_idx on public.document_permissions (permission_scope);
create index if not exists document_permissions_user_id_idx on public.document_permissions (user_id);
create index if not exists document_permissions_role_name_idx on public.document_permissions (role_name);
create index if not exists document_permissions_department_idx on public.document_permissions (department);
create index if not exists document_permissions_customer_id_idx on public.document_permissions (customer_id);
create index if not exists document_permissions_yard_id_idx on public.document_permissions (yard_id);

create index if not exists document_expiration_notifications_document_id_idx
  on public.document_expiration_notifications (document_id);
create index if not exists document_expiration_notifications_status_idx
  on public.document_expiration_notifications (status);
create index if not exists document_expiration_notifications_date_idx
  on public.document_expiration_notifications (notification_date);
create index if not exists document_expiration_notifications_recipient_idx
  on public.document_expiration_notifications (recipient_user_id);

drop trigger if exists set_document_categories_updated_at on public.document_categories;
create trigger set_document_categories_updated_at
before update on public.document_categories
for each row execute function public.document_control_set_updated_at();

drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
before update on public.documents
for each row execute function public.document_control_set_updated_at();

drop trigger if exists set_document_permissions_updated_at on public.document_permissions;
create trigger set_document_permissions_updated_at
before update on public.document_permissions
for each row execute function public.document_control_set_updated_at();

drop trigger if exists set_document_expiration_notifications_updated_at
on public.document_expiration_notifications;
create trigger set_document_expiration_notifications_updated_at
before update on public.document_expiration_notifications
for each row execute function public.document_control_set_updated_at();

create or replace function public.can_view_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.document_control_is_manager()
    or exists (
      select 1
      from public.documents d
      where d.id = target_document_id
        and d.document_status <> 'Archived'
        and d.approval_status = 'Approved'
        and d.is_restricted = false
        and public.document_control_is_internal()
        and coalesce(d.category, '') in ('HSE', 'SOPs', 'Training Documents', 'Forms', 'Policies')
    )
    or exists (
      select 1
      from public.documents d
      where d.id = target_document_id
        and d.document_status <> 'Archived'
        and d.approval_status = 'Approved'
        and d.is_customer_visible = true
        and d.related_customer_id = public.document_control_current_company_id()
    )
    or exists (
      select 1
      from public.document_permissions dp
      left join public.profiles p on p.id = auth.uid()
      where dp.document_id = target_document_id
        and dp.can_view = true
        and (
          dp.permission_scope = 'all_internal' and public.document_control_is_internal()
          or dp.permission_scope = 'user' and dp.user_id = auth.uid()
          or dp.permission_scope = 'role' and lower(replace(dp.role_name, ' ', '_')) = lower(replace(public.document_control_current_role(), ' ', '_'))
          or dp.permission_scope = 'department' and lower(coalesce(dp.department, '')) = lower(coalesce(p.department, ''))
          or dp.permission_scope = 'customer' and dp.customer_id = public.document_control_current_company_id()
        )
    );
$$;

alter table public.document_categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_permissions enable row level security;
alter table public.document_expiration_notifications enable row level security;

drop policy if exists "document categories read" on public.document_categories;
create policy "document categories read"
on public.document_categories
for select
to authenticated
using (true);

drop policy if exists "document categories manage" on public.document_categories;
create policy "document categories manage"
on public.document_categories
for all
to authenticated
using (public.document_control_is_manager())
with check (public.document_control_is_manager());

drop policy if exists "documents read" on public.documents;
create policy "documents read"
on public.documents
for select
to authenticated
using (public.can_view_document(id));

drop policy if exists "documents insert internal" on public.documents;
create policy "documents insert internal"
on public.documents
for insert
to authenticated
with check (public.document_control_is_internal());

drop policy if exists "documents update authorized" on public.documents;
create policy "documents update authorized"
on public.documents
for update
to authenticated
using (
  public.document_control_is_manager()
  or exists (
    select 1
    from public.document_permissions dp
    where dp.document_id = documents.id
      and dp.can_edit = true
      and (
        dp.permission_scope = 'user' and dp.user_id = auth.uid()
        or dp.permission_scope = 'role' and lower(replace(dp.role_name, ' ', '_')) = lower(replace(public.document_control_current_role(), ' ', '_'))
      )
  )
)
with check (
  public.document_control_is_manager()
  or exists (
    select 1
    from public.document_permissions dp
    where dp.document_id = documents.id
      and dp.can_edit = true
      and (
        dp.permission_scope = 'user' and dp.user_id = auth.uid()
        or dp.permission_scope = 'role' and lower(replace(dp.role_name, ' ', '_')) = lower(replace(public.document_control_current_role(), ' ', '_'))
      )
  )
);

drop policy if exists "documents delete managers" on public.documents;
create policy "documents delete managers"
on public.documents
for delete
to authenticated
using (public.document_control_is_manager());

drop policy if exists "document versions read" on public.document_versions;
create policy "document versions read"
on public.document_versions
for select
to authenticated
using (public.can_view_document(document_id));

drop policy if exists "document versions insert authorized" on public.document_versions;
create policy "document versions insert authorized"
on public.document_versions
for insert
to authenticated
with check (
  public.document_control_is_manager()
  or exists (
    select 1
    from public.document_permissions dp
    where dp.document_id = document_versions.document_id
      and (dp.can_upload = true or dp.can_edit = true)
      and (
        dp.permission_scope = 'user' and dp.user_id = auth.uid()
        or dp.permission_scope = 'role' and lower(replace(dp.role_name, ' ', '_')) = lower(replace(public.document_control_current_role(), ' ', '_'))
      )
  )
);

drop policy if exists "document versions manage managers" on public.document_versions;
create policy "document versions manage managers"
on public.document_versions
for update
to authenticated
using (public.document_control_is_manager())
with check (public.document_control_is_manager());

drop policy if exists "document versions delete managers" on public.document_versions;
create policy "document versions delete managers"
on public.document_versions
for delete
to authenticated
using (public.document_control_is_manager());

drop policy if exists "document permissions read managers" on public.document_permissions;
create policy "document permissions read managers"
on public.document_permissions
for select
to authenticated
using (public.document_control_is_manager());

drop policy if exists "document permissions manage managers" on public.document_permissions;
create policy "document permissions manage managers"
on public.document_permissions
for all
to authenticated
using (public.document_control_is_manager())
with check (public.document_control_is_manager());

drop policy if exists "document expiration notifications read" on public.document_expiration_notifications;
create policy "document expiration notifications read"
on public.document_expiration_notifications
for select
to authenticated
using (
  public.document_control_is_manager()
  or recipient_user_id = auth.uid()
);

drop policy if exists "document expiration notifications manage managers" on public.document_expiration_notifications;
create policy "document expiration notifications manage managers"
on public.document_expiration_notifications
for all
to authenticated
using (public.document_control_is_manager())
with check (public.document_control_is_manager());

drop policy if exists "document control storage read" on storage.objects;
create policy "document control storage read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'document-control'
  and exists (
    select 1
    from public.documents d
    where d.file_path = storage.objects.name
      and public.can_view_document(d.id)
  )
);

drop policy if exists "document control storage upload" on storage.objects;
create policy "document control storage upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'document-control'
  and public.document_control_is_manager()
);

drop policy if exists "document control storage update" on storage.objects;
create policy "document control storage update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'document-control'
  and public.document_control_is_manager()
)
with check (
  bucket_id = 'document-control'
  and public.document_control_is_manager()
);

drop policy if exists "document control storage delete" on storage.objects;
create policy "document control storage delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'document-control'
  and public.document_control_is_manager()
);

grant usage on schema public to authenticated;
grant select on public.document_categories to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.document_versions to authenticated;
grant select, insert, update, delete on public.document_permissions to authenticated;
grant select, insert, update, delete on public.document_expiration_notifications to authenticated;

grant execute on function public.document_control_current_role() to authenticated;
grant execute on function public.document_control_current_company_id() to authenticated;
grant execute on function public.document_control_is_internal() to authenticated;
grant execute on function public.document_control_is_manager() to authenticated;
grant execute on function public.can_view_document(uuid) to authenticated;
