-- TITAN Invoice Approval and Coding module.
-- Safe to run more than once in the Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

-- The legacy module-access table uses a fixed allow-list. Extend the complete
-- current list before assigning Invoice Approvals to Office Admin users.
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
          'financials',
          'invoice_approvals',
          'admin',
          'reports',
          'dashboard'
        )
      );
  end if;
end $$;

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

drop index if exists public.titan_ap_accounting_codes_code_uidx;
create unique index if not exists titan_ap_accounting_codes_code_description_uidx
on public.titan_ap_accounting_codes (lower(btrim(code)), lower(btrim(description)));

-- Pathfinder account structure transcribed from Code Sheet pages 1-4.
-- Parent accounts marked DO NOT USE remain inactive for reference and cannot
-- be selected on invoice coding lines. Pages 3 and 4 contain duplicate content.
insert into public.titan_ap_accounting_codes (code, description, active)
values
  ('41000', 'Service Income - DO NOT USE', false),
  ('41100', 'Service Income', true),
  ('41200', 'Travel Income', true),
  ('42000', 'Rebill Income - DO NOT USE', false),
  ('42100', 'Subcontractor Rebilling - REBILLED; invoice number required', true),
  ('43000', 'Equipment Rental Income - DO NOT USE', false),
  ('43100', 'Equipment Rental - owned', true),
  ('43200', 'Equipment Rental 3rd Party', true),
  ('44000', 'Property Rental Income', true),
  ('51000', 'Cost of Labor - DO NOT USE', false),
  ('51040', 'Temp Labor - Pathfinder temporary employees', true),
  ('51050', 'Field Wages - hourly employees working in the field', true),
  ('51055', 'Field Wages - OT - hourly employees working in the field', true),
  ('51070', 'Salary Field Wages - operators, superintendents, field managers', true),
  ('51099', 'Allocate Shop Labor - allocate shop/OH labor to expense section', true),
  ('52100', 'Contract Labor - temp labor from staffing services', true),
  ('52500', 'Travel Expense - DO NOT USE', false),
  ('52510', 'Lodging - work travel lodging', true),
  ('52520', 'Travel Expense - travel allowance, airline, tolls, meals, car rental', true),
  ('52530', 'Per Diem - overnight travel paid on paycheck and marked on timesheet', true),
  ('52540', 'Travel Meals - meals or food while traveling', true),
  ('53100', 'Outside Services - DO NOT USE', false),
  ('53110', 'Subcontractor Labor REBILLED - outside labor rebilled; invoice number required', true),
  ('53130', 'Subcon Work (NOT rebilled) - fabrication, transportation, and other outside labor', true),
  ('55000', 'Equipment / Material Purchase - Small - DO NOT USE', false),
  ('55100', 'Small Equipment - Trailers - items under $5,000 with useful life over one year', true),
  ('55200', 'Small Equipment - Trucks - bumpers, bed liners, hitches, and items under $5,000', true),
  ('55300', 'Equipment Purchase - Small - equipment under $5,000 with useful life over one year', true),
  ('55400', 'Material and Welding Consumable - steel, rack pipe, paint, and welding supplies', true),
  ('55800', 'Equipment Rental', true),
  ('55810', 'Equip Rental - equipment rental that will NOT be rebilled', true),
  ('55820', 'Equip Rental - REBILLED; invoice number required', true),
  ('56000', 'Small Tools - DO NOT USE', false),
  ('56100', 'Small Tools - jacks, grinders, drills, shop tools, UT machines, gauges, and calipers', true),
  ('56200', 'Fabricated / Machine Tools - refacing equipment, mandrels, and gauges under $2,500', true),
  ('57000', 'Consumables - DO NOT USE', false),
  ('57100', 'Consumables - short-life items consumed when used', true),
  ('57150', 'Consumables - REBILLED; sold to customer and invoice number required', true),
  ('57200', 'HB Wire - hardband wire only', true),
  ('57300', 'Weed Spraying Chemical - Bare Ground', true),
  ('57350', 'Weed Spraying Chemical - Noxious', true),
  ('57400', 'Anchors - Bull Dog Safety Anchors and ground rods', true),
  ('57500', '142 Solvent - all purchased 142 solvent', true),
  ('58000', 'Automobile / Equipment Expense - DO NOT USE', false),
  ('58100', 'Automobile Expense - miscellaneous auto costs, pressure washing, and detailing', true),
  ('58110', 'Fuel - all fuel purchased', true),
  ('58120', 'Auto Repairs - third-party mechanical, body, transmission, and tire repairs', true),
  ('58130', 'Auto/Equip Consumables - in-house parts, filters, brakes, and fluids', true),
  ('58140', 'Tires - tires for trucks and equipment', true),
  ('58150', 'License & Registration - vehicle licensing and titles; not sales tax', true),
  ('58160', 'Equipment Build Out - build out for a specific use; include VIN/equipment ID and description', true),
  ('58200', 'Equipment Repairs - third-party equipment repair costs', true),
  ('59000', 'Tool Repairs and Maintenance - DO NOT USE', false),
  ('59100', 'Calibration of tools - third-party calibration of inspection and torque equipment', true),
  ('59200', 'Tool Repairs - tongs and other tool repairs', true),
  ('59300', 'Tool Replacement Parts', true),
  ('59999', 'Allocate Overhead - allocate charges to Admin Class to Expense', true),
  ('60100', 'Safety Expense - DO NOT USE', false),
  ('60110', 'FR Clothing / Coveralls - purchase of FR PPE only', true),
  ('60120', 'Coveralls (Laundry) - maintenance of FR clothing and laundry', true),
  ('60130', 'PPE - hard hats, gloves, gas monitors, harnesses, and other PPE', true),
  ('60140', 'Drug Testing - pre-employment and employee drug/alcohol testing', true),
  ('60150', 'Safety Expense - Misc - non-PPE safety supplies, software, and training materials', true),
  ('61100', 'Shop Rental - DO NOT USE', false),
  ('61110', 'Shop Rent ND (Killdeer)', true),
  ('61120', 'Shop/Office Rent TX - Pathfinder Properties', true),
  ('61130', 'Shop/Office Rent WY - Pathfinder Properties, Casper Industrial Center', true),
  ('61140', 'Shop Rent ND (Dickinson) - Pathfinder Properties', true),
  ('61150', 'Shop Repairs - repairs to rented North Dakota shops', true),
  ('61200', 'Apartment Expense - DO NOT USE', false),
  ('61210', 'Apartment Rent (ALL)', true),
  ('61220', 'Apartment Utilities (ALL) - utilities excluding deposits', true),
  ('61230', 'Apartment Expenses - Misc - cleaning, keys, bedding, and related expenses', true),
  ('62000', 'Facilities - DO NOT USE', false),
  ('62100', 'Building / Yard Repairs - building, shop, yard, HVAC, electrical, gates, and fencing', true),
  ('62140', 'Shop Cleanup/Remodel', true),
  ('62150', 'Shop Utilities - water, gas, waste services, and sump pumping', true),
  ('63100', 'Office - DO NOT USE', false),
  ('63110', 'Office Material and Supplies - office supplies and furniture under $2,500', true),
  ('63120', 'Office Printing - all third-party printing', true),
  ('63130', 'Office Cleaning - outside cleaning service and cleaning supplies', true),
  ('63140', 'Internet/Phone/Cellphone', true),
  ('65000', 'Fees/Penalties - DO NOT USE', false),
  ('65200', 'Dues and Subscriptions - customer portals and program access', true),
  ('65300', 'Licenses and Permits - DOT, Secretary of State, corporate filings, and location permits', true),
  ('65400', 'Bank / CC - bank and credit card fees', true),
  ('65500', 'Penalties - tax or other penalties', true),
  ('66000', 'Payroll Expenses - DO NOT USE', false),
  ('66050', 'Taxes and Benefits - DO NOT USE', false),
  ('66040', 'Retirement Account Expenses - 401K', true),
  ('66051', 'Fica/Med - payroll', true),
  ('66052', 'FUTA - payroll', true),
  ('66054', 'WY Workers Comp - payroll', true),
  ('66055', 'ND Workers Comp - payroll', true),
  ('66062', 'TX Worker''s Comp - payroll', true),
  ('66063', 'NM Worker''s Comp - payroll', true),
  ('66064', 'MT Workers Comp - payroll', true),
  ('66070', 'Unemployment - DO NOT USE', false),
  ('66071', 'WY Unemployment - payroll', true),
  ('66072', 'TX Unemployment - payroll', true),
  ('66073', 'NM Unemployment - payroll', true),
  ('66074', 'ND Unemployment - payroll', true),
  ('66075', 'MT Unemployment - payroll', true),
  ('66076', 'CO Unemployment - payroll', true),
  ('66077', 'CO Unemployment - payroll', true),
  ('66090', 'Health Insurance - health insurance, HC fees, VSP, and Delta Dental', true),
  ('66100', 'Wages - DO NOT USE', false),
  ('66105', 'Admin/Office Wages - office part time', true),
  ('66110', 'Officer Wages', true),
  ('66111', 'Salary Wages - Non Field', true),
  ('66115', 'Salary Wages - Sales', true),
  ('66100', 'Wages - Other - non-work wages (vacation)', true),
  ('66129', 'Shop Labor Allocated - shop labor allocated from COGS', true),
  ('66130', 'Commissions - DO NOT USE', false),
  ('66131', 'Commissions - Sales Group', true),
  ('66132', 'Commissions - Managers', true),
  ('66140', 'Discretionary Bonuses', true),
  ('66150', 'Travel Allowance - no receipts; considered compensation', true),
  ('66155', 'Cell Phone Allowance - no receipts; considered compensation', true),
  ('66200', 'Outside Professional Services - DO NOT USE', false),
  ('66210', 'Professional Services - accounting, engineering, and related services', true),
  ('66220', 'Training - safety, ASNT, operator, and mechanic training', true),
  ('66230', 'Consulting - Elite Industry Solutions', true),
  ('66240', 'Legal Services', true),
  ('66250', 'Medical Services - hospitals, clinics, chiropractors, and related services', true),
  ('67000', 'Advertising - DO NOT USE', false),
  ('67010', 'Employment/Job Ads - job boards, workforce services, radio, and newspaper', true),
  ('67020', 'Advertising and Promotion - Path Gear and promotional organizations', true)
on conflict do nothing;

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
    check (status in ('awaiting_approval', 'returned_to_ap', 'disputed', 'approved', 'voided')),
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
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_by_name text,
  resolved_at timestamptz,
  void_reason text,
  voided_by uuid references auth.users(id) on delete set null,
  voided_by_name text,
  voided_at timestamptz,
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.titan_ap_invoices add column if not exists approver_notes text;
alter table public.titan_ap_invoices add column if not exists resolution_note text;
alter table public.titan_ap_invoices add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.titan_ap_invoices add column if not exists resolved_by_name text;
alter table public.titan_ap_invoices add column if not exists resolved_at timestamptz;
alter table public.titan_ap_invoices add column if not exists void_reason text;
alter table public.titan_ap_invoices add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.titan_ap_invoices add column if not exists voided_by_name text;
alter table public.titan_ap_invoices add column if not exists voided_at timestamptz;
alter table public.titan_ap_invoices drop constraint if exists titan_ap_invoices_status_check;
alter table public.titan_ap_invoices
  add constraint titan_ap_invoices_status_check
  check (status in ('awaiting_approval', 'returned_to_ap', 'disputed', 'approved', 'voided'));

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
  document_type text check (document_type is null or document_type in ('receipt', 'purchase_order', 'correspondence', 'other')),
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

alter table public.titan_ap_invoice_files add column if not exists document_type text;
alter table public.titan_ap_invoice_files drop constraint if exists titan_ap_invoice_files_document_type_check;
alter table public.titan_ap_invoice_files
  add constraint titan_ap_invoice_files_document_type_check
  check (document_type is null or document_type in ('receipt', 'purchase_order', 'correspondence', 'other'));

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
  signature_version text not null default 'titan-drawn-v1',
  signature_storage_bucket text,
  signature_storage_path text,
  signature_sha256 text
);

alter table public.titan_ap_invoice_approvals add column if not exists signature_storage_bucket text;
alter table public.titan_ap_invoice_approvals add column if not exists signature_storage_path text;
alter table public.titan_ap_invoice_approvals add column if not exists signature_sha256 text;
alter table public.titan_ap_invoice_approvals alter column signature_version set default 'titan-drawn-v1';

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

drop function if exists public.titan_ap_approve_invoice(uuid, uuid, text, text);
drop function if exists public.titan_ap_approve_invoice(uuid, uuid, text, text, text, text, text);
create function public.titan_ap_approve_invoice(
  p_invoice_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_approval_statement text,
  p_signature_bucket text,
  p_signature_path text,
  p_signature_sha256 text
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
  if nullif(btrim(p_signature_bucket), '') is null
     or nullif(btrim(p_signature_path), '') is null
     or p_signature_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid captured signature is required.';
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
    original_file_sha256, approval_statement, signature_version,
    signature_storage_bucket, signature_storage_path, signature_sha256
  ) values (
    p_invoice_id, p_actor_id, p_actor_name, invoice_row.total_amount, coding_rows,
    file_hash, p_approval_statement, 'titan-drawn-v1',
    btrim(p_signature_bucket), btrim(p_signature_path), p_signature_sha256
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
    jsonb_build_object(
      'approval_id', approval_id,
      'approved_total', invoice_row.total_amount,
      'signature_sha256', p_signature_sha256,
      'signature_version', 'titan-drawn-v1'
    )
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

revoke all on function public.titan_ap_approve_invoice(uuid, uuid, text, text, text, text, text) from public, authenticated;
grant execute on function public.titan_ap_approve_invoice(uuid, uuid, text, text, text, text, text) to service_role;
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
from (values ('view'), ('create'), ('edit'), ('export'), ('receive_notifications')) actions(action_key)
on conflict (role_key, module_key, action_key)
do update set is_allowed = excluded.is_allowed;

insert into public.role_permission_defaults (role_key, module_key, action_key, is_allowed)
values ('office_admin', 'invoice_approvals', 'approve', false)
on conflict (role_key, module_key, action_key)
do update set is_allowed = excluded.is_allowed;

insert into public.role_permission_defaults (role_key, module_key, action_key, is_allowed)
select role_key, 'invoice_approvals', action_key, true
from (values ('service_line_manager'), ('yard_manager'), ('inventory_manager'), ('maintenance_manager'), ('mechanic_manager')) roles(role_key)
cross join (values ('view'), ('approve'), ('export'), ('receive_notifications')) actions(action_key)
on conflict (role_key, module_key, action_key)
do update set is_allowed = excluded.is_allowed;

insert into public.user_module_permissions (user_id, module_key, can_access)
select p.id, 'invoice_approvals', true
from public.profiles p
where lower(regexp_replace(coalesce(p.role::text, ''), '[^a-zA-Z0-9]+', '_', 'g')) in (
  'office_admin', 'office_admins', 'admin', 'admins', 'owner', 'owners',
  'service_line_manager', 'service_line_managers', 'yard_manager', 'yard_managers',
  'inventory_manager', 'inventory_managers', 'maintenance_manager', 'maintenance_managers',
  'mechanic_manager', 'mechanic_managers'
)
on conflict (user_id, module_key)
do update set can_access = excluded.can_access, updated_at = now();

comment on table public.titan_ap_invoice_approvals is
  'Immutable authenticated TITAN approval record. One approval is allowed per invoice.';
comment on table public.titan_ap_invoice_files is
  'Append-only invoice file versions. Replacements never delete the originally uploaded document.';
comment on table public.titan_ap_invoice_activity is
  'Append-only AP invoice workflow history.';

commit;
