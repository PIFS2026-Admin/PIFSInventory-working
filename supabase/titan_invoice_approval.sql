-- TITAN Invoice Approval and Coding module.
-- Safe to run more than once in the Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.titan_ap_accounting_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists titan_ap_accounting_codes_code_uidx
on public.titan_ap_accounting_codes (lower(btrim(code)));

create table if not exists public.titan_ap_invoices (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid references public.yards(id) on delete set null,
  vendor_id uuid references public.inventory_vendors(id) on delete set null,
  vendor_name text not null,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  currency_code text not null default 'USD',
  notes text,
  approver_notes text,
  status text not null default 'awaiting_approval'
    check (status in ('awaiting_approval', 'returned_to_ap', 'disputed', 'approved')),
  assigned_approver_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_by_name text not null,
  uploaded_at timestamptz not null default now(),
  duplicate_acknowledged_by uuid references auth.users(id) on delete set null,
  duplicate_acknowledged_at timestamptz,
  duplicate_acknowledgment_note text,
  dispute_reason text,
  return_reason text,
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.titan_ap_invoices add column if not exists approver_notes text;

create index if not exists titan_ap_invoices_status_assignee_idx
on public.titan_ap_invoices (status, assigned_approver_id, due_date);

create index if not exists titan_ap_invoices_vendor_number_idx
on public.titan_ap_invoices (lower(btrim(vendor_name)), lower(regexp_replace(invoice_number, '[^a-zA-Z0-9]', '', 'g')));

create index if not exists titan_ap_invoices_created_idx
on public.titan_ap_invoices (created_at desc);

create table if not exists public.titan_ap_invoice_coding_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.titan_ap_invoices(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  accounting_code_id uuid not null references public.titan_ap_accounting_codes(id) on delete restrict,
  accounting_code text not null,
  accounting_code_description text not null default '',
  amount numeric(14,2) not null check (amount >= 0),
  cost_center text,
  department text,
  job_number text,
  description text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, line_number)
);

create index if not exists titan_ap_invoice_coding_invoice_idx
on public.titan_ap_invoice_coding_lines (invoice_id, line_number);

create table if not exists public.titan_ap_invoice_files (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.titan_ap_invoices(id) on delete restrict,
  file_kind text not null default 'original' check (file_kind in ('original', 'corrected', 'supporting')),
  version_number integer not null check (version_number > 0),
  is_current boolean not null default true,
  storage_bucket text not null,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  sha256 text not null,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_by_name text not null,
  uploaded_at timestamptz not null default now(),
  unique (invoice_id, version_number),
  unique (storage_bucket, storage_path)
);

create unique index if not exists titan_ap_invoice_files_current_uidx
on public.titan_ap_invoice_files (invoice_id)
where is_current;

create table if not exists public.titan_ap_invoice_approvals (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.titan_ap_invoices(id) on delete restrict,
  approver_id uuid not null references auth.users(id) on delete restrict,
  approver_name text not null,
  approved_at timestamptz not null default now(),
  approved_total numeric(14,2) not null,
  coding_snapshot jsonb not null,
  original_file_sha256 text not null,
  approval_statement text not null,
  signature_version text not null default 'titan-auth-v1'
);

create table if not exists public.titan_ap_invoice_activity (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.titan_ap_invoices(id) on delete restrict,
  action text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_name text not null,
  from_status text,
  to_status text,
  note text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists titan_ap_invoice_activity_invoice_idx
on public.titan_ap_invoice_activity (invoice_id, created_at desc);

create or replace function public.titan_ap_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists titan_ap_accounting_codes_updated_at on public.titan_ap_accounting_codes;
create trigger titan_ap_accounting_codes_updated_at
before update on public.titan_ap_accounting_codes
for each row execute function public.titan_ap_set_updated_at();

drop trigger if exists titan_ap_invoices_updated_at on public.titan_ap_invoices;
create trigger titan_ap_invoices_updated_at
before update on public.titan_ap_invoices
for each row execute function public.titan_ap_set_updated_at();

drop trigger if exists titan_ap_coding_lines_updated_at on public.titan_ap_invoice_coding_lines;
create trigger titan_ap_coding_lines_updated_at
before update on public.titan_ap_invoice_coding_lines
for each row execute function public.titan_ap_set_updated_at();

create or replace function public.titan_ap_approve_invoice(
  p_invoice_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_approval_statement text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.titan_ap_invoices%rowtype;
  coding_total numeric(14,2);
  coding_rows jsonb;
  file_hash text;
  approval_id uuid;
begin
  select * into invoice_row
  from public.titan_ap_invoices
  where id = p_invoice_id
  for update;

  if not found then raise exception 'Invoice not found.'; end if;
  if invoice_row.status <> 'awaiting_approval' then
    raise exception 'This invoice is no longer awaiting approval.';
  end if;
  if invoice_row.assigned_approver_id <> p_actor_id then
    raise exception 'Only the assigned approver can approve this invoice.';
  end if;
  if exists (select 1 from public.titan_ap_invoice_approvals where invoice_id = p_invoice_id) then
    raise exception 'This invoice has already been approved.';
  end if;

  select coalesce(sum(amount), 0), coalesce(jsonb_agg(to_jsonb(lines) order by line_number), '[]'::jsonb)
  into coding_total, coding_rows
  from (
    select line_number, accounting_code, accounting_code_description, amount,
           cost_center, department, job_number, description
    from public.titan_ap_invoice_coding_lines
    where invoice_id = p_invoice_id
  ) lines;

  if coding_rows = '[]'::jsonb then raise exception 'Add at least one accounting code.'; end if;
  if coding_total <> invoice_row.total_amount then
    raise exception 'Coding amounts must equal the invoice total.';
  end if;

  select sha256 into file_hash
  from public.titan_ap_invoice_files
  where invoice_id = p_invoice_id and is_current
  limit 1;
  if file_hash is null then raise exception 'The original invoice file is missing.'; end if;

  insert into public.titan_ap_invoice_approvals (
    invoice_id, approver_id, approver_name, approved_total, coding_snapshot,
    original_file_sha256, approval_statement
  ) values (
    p_invoice_id, p_actor_id, p_actor_name, invoice_row.total_amount, coding_rows,
    file_hash, p_approval_statement
  ) returning id into approval_id;

  update public.titan_ap_invoices
  set status = 'approved', dispute_reason = null, return_reason = null,
      row_version = row_version + 1
  where id = p_invoice_id;

  insert into public.titan_ap_invoice_activity (
    invoice_id, action, actor_id, actor_name, from_status, to_status, note,
    details
  ) values (
    p_invoice_id, 'approved', p_actor_id, p_actor_name,
    'awaiting_approval', 'approved', p_approval_statement,
    jsonb_build_object('approval_id', approval_id, 'approved_total', invoice_row.total_amount)
  );

  return approval_id;
end;
$$;

drop function if exists public.titan_ap_replace_coding_lines(uuid, uuid, text, jsonb);
create or replace function public.titan_ap_replace_coding_lines(
  p_invoice_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_lines jsonb,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.titan_ap_invoices%rowtype;
  line_row jsonb;
  code_row public.titan_ap_accounting_codes%rowtype;
  line_no integer := 0;
begin
  select * into invoice_row
  from public.titan_ap_invoices
  where id = p_invoice_id
  for update;

  if not found then raise exception 'Invoice not found.'; end if;
  if invoice_row.status <> 'awaiting_approval' then
    raise exception 'Coding can only be changed while the invoice is awaiting approval.';
  end if;
  if invoice_row.assigned_approver_id <> p_actor_id then
    raise exception 'Only the assigned approver can change the accounting coding.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one accounting code.';
  end if;

  delete from public.titan_ap_invoice_coding_lines where invoice_id = p_invoice_id;

  for line_row in select value from jsonb_array_elements(p_lines)
  loop
    line_no := line_no + 1;
    select * into code_row
    from public.titan_ap_accounting_codes
    where id = nullif(line_row->>'accountingCodeId', '')::uuid and active;
    if not found then raise exception 'Select an active accounting code for line %.', line_no; end if;
    if coalesce((line_row->>'amount')::numeric, -1) < 0 then
      raise exception 'Enter a valid amount for line %.', line_no;
    end if;

    insert into public.titan_ap_invoice_coding_lines (
      invoice_id, line_number, accounting_code_id, accounting_code,
      accounting_code_description, amount, cost_center, department,
      job_number, description, created_by, updated_by
    ) values (
      p_invoice_id, line_no, code_row.id, code_row.code, code_row.description,
      (line_row->>'amount')::numeric,
      nullif(btrim(line_row->>'costCenter'), ''),
      nullif(btrim(line_row->>'department'), ''),
      nullif(btrim(line_row->>'jobNumber'), ''),
      nullif(btrim(line_row->>'description'), ''),
      p_actor_id, p_actor_id
    );
  end loop;

  update public.titan_ap_invoices
  set approver_notes = nullif(btrim(p_notes), ''), row_version = row_version + 1
  where id = p_invoice_id;

  insert into public.titan_ap_invoice_activity (
    invoice_id, action, actor_id, actor_name, from_status, to_status, details
  ) values (
    p_invoice_id, 'coding_updated', p_actor_id, p_actor_name,
    invoice_row.status, invoice_row.status,
    jsonb_build_object('line_count', line_no)
  );
end;
$$;

revoke all on function public.titan_ap_approve_invoice(uuid, uuid, text, text) from public, authenticated;
grant execute on function public.titan_ap_approve_invoice(uuid, uuid, text, text) to service_role;
revoke all on function public.titan_ap_replace_coding_lines(uuid, uuid, text, jsonb, text) from public, authenticated;
grant execute on function public.titan_ap_replace_coding_lines(uuid, uuid, text, jsonb, text) to service_role;

alter table public.titan_ap_accounting_codes enable row level security;
alter table public.titan_ap_invoices enable row level security;
alter table public.titan_ap_invoice_coding_lines enable row level security;
alter table public.titan_ap_invoice_files enable row level security;
alter table public.titan_ap_invoice_approvals enable row level security;
alter table public.titan_ap_invoice_activity enable row level security;

-- Invoice data is only served by authenticated TITAN API routes after an
-- application permission check. The service role bypasses RLS; browser clients do not.
revoke all on public.titan_ap_accounting_codes from anon, authenticated;
revoke all on public.titan_ap_invoices from anon, authenticated;
revoke all on public.titan_ap_invoice_coding_lines from anon, authenticated;
revoke all on public.titan_ap_invoice_files from anon, authenticated;
revoke all on public.titan_ap_invoice_approvals from anon, authenticated;
revoke all on public.titan_ap_invoice_activity from anon, authenticated;
grant select, insert, update, delete on public.titan_ap_accounting_codes to service_role;
grant select, insert, update, delete on public.titan_ap_invoices to service_role;
grant select, insert, update, delete on public.titan_ap_invoice_coding_lines to service_role;
grant select, insert, update, delete on public.titan_ap_invoice_files to service_role;
grant select, insert on public.titan_ap_invoice_approvals to service_role;
grant select, insert on public.titan_ap_invoice_activity to service_role;

-- Existing role/action permission tables accept new module keys without schema changes.
insert into public.role_permission_defaults (role_key, module_key, action_key, is_allowed)
select role_key, 'invoice_approvals', action_key, true
from (values ('admin'), ('owner')) roles(role_key)
cross join (values ('view'), ('create'), ('edit'), ('approve'), ('export'), ('manage_settings'), ('receive_notifications')) actions(action_key)
on conflict (role_key, module_key, action_key)
do update set is_allowed = excluded.is_allowed;

insert into public.role_permission_defaults (role_key, module_key, action_key, is_allowed)
select 'office_admin', 'invoice_approvals', action_key, true
from (values ('view'), ('create'), ('edit'), ('approve'), ('export'), ('receive_notifications')) actions(action_key)
on conflict (role_key, module_key, action_key)
do update set is_allowed = excluded.is_allowed;

insert into public.user_module_permissions (user_id, module_key, can_access)
select p.id, 'invoice_approvals', true
from public.profiles p
where lower(regexp_replace(coalesce(p.role::text, ''), '[^a-zA-Z0-9]+', '_', 'g')) in ('office_admin', 'office_admins', 'admin', 'admins', 'owner', 'owners')
on conflict (user_id, module_key)
do update set can_access = excluded.can_access, updated_at = now();

comment on table public.titan_ap_invoice_approvals is
  'Immutable authenticated TITAN approval record. One approval is allowed per invoice.';
comment on table public.titan_ap_invoice_files is
  'Append-only invoice file versions. Replacements never delete the originally uploaded document.';
comment on table public.titan_ap_invoice_activity is
  'Append-only AP invoice workflow history.';

commit;
