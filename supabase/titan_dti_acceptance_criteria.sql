-- Versioned DTI acceptance criteria for Drill Pipe, HWDP, and Subs.
-- No acceptance values are seeded. Published versions require an approved source document.

begin;

do $$
begin
  if to_regclass('public.documents') is null then
    raise exception 'Run supabase/document_control.sql first.';
  end if;
  if to_regclass('public.titan_dti_inspection_reports') is null then
    raise exception 'Run supabase/titan_dti_inspection_reports.sql first.';
  end if;
  if to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run supabase/titan_dti_controls_reassignment.sql first.';
  end if;
end $$;

create table if not exists public.titan_dti_criteria_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  standard_type text not null check (standard_type in ('API','DS-1','Class 2 Alternate','Customer')),
  component_type text not null check (component_type in ('Drill Pipe','HWDP','Subs')),
  customer_name text,
  description text,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_dti_criteria_customer_name check (
    standard_type <> 'Customer' or nullif(trim(coalesce(customer_name, '')), '') is not null
  )
);

create unique index if not exists titan_dti_criteria_sets_active_name_uidx
  on public.titan_dti_criteria_sets (lower(trim(name)), component_type)
  where archived_at is null;

create table if not exists public.titan_dti_criteria_versions (
  id uuid primary key default gen_random_uuid(),
  criteria_set_id uuid not null references public.titan_dti_criteria_sets(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status text not null default 'Draft' check (status in ('Draft','Published','Retired')),
  effective_date date,
  source_document_id uuid references public.documents(id) on delete restrict,
  notes text,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (criteria_set_id, version_number)
);

create unique index if not exists titan_dti_criteria_versions_one_draft_uidx
  on public.titan_dti_criteria_versions (criteria_set_id)
  where status = 'Draft';

create index if not exists titan_dti_criteria_versions_published_idx
  on public.titan_dti_criteria_versions (criteria_set_id, version_number desc)
  where status = 'Published';

create table if not exists public.titan_dti_criteria_rules (
  id uuid primary key default gen_random_uuid(),
  criteria_version_id uuid not null references public.titan_dti_criteria_versions(id) on delete cascade,
  rule_name text not null,
  field_key text not null,
  field_label text not null,
  inspection_area text not null check (inspection_area in ('Tube','Box','Pin','Tool Joint','Joint')),
  comparison text not null check (comparison in ('Minimum','Maximum','Range','Equals','Required')),
  value_unit text,
  minimum_value numeric,
  maximum_value numeric,
  expected_value text,
  result_classification text not null check (result_classification in ('Premium','Class 1','Class 2','Class 3','Class 4','DBR','NI','NC')),
  reason text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_dti_criteria_rule_values check (
    (comparison = 'Minimum' and minimum_value is not null)
    or (comparison = 'Maximum' and maximum_value is not null)
    or (comparison = 'Range' and minimum_value is not null and maximum_value is not null and maximum_value >= minimum_value)
    or (comparison = 'Equals' and nullif(trim(coalesce(expected_value, '')), '') is not null)
    or comparison = 'Required'
  )
);

create index if not exists titan_dti_criteria_rules_version_idx
  on public.titan_dti_criteria_rules (criteria_version_id, display_order, field_key);

create table if not exists public.titan_dti_criteria_events (
  id uuid primary key default gen_random_uuid(),
  criteria_set_id uuid not null references public.titan_dti_criteria_sets(id) on delete restrict,
  criteria_version_id uuid references public.titan_dti_criteria_versions(id) on delete restrict,
  entity_type text not null check (entity_type in ('Criteria Set','Version','Rule')),
  entity_id uuid,
  event_type text not null check (event_type in ('Created','Updated','Deleted','Published','Retired','Archived')),
  before_value jsonb,
  after_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_dti_criteria_events_set_idx
  on public.titan_dti_criteria_events (criteria_set_id, created_at desc);

alter table public.titan_dti_inspection_reports
  add column if not exists criteria_version_id uuid references public.titan_dti_criteria_versions(id) on delete restrict,
  add column if not exists criteria_snapshot jsonb;

create index if not exists titan_dti_inspection_reports_criteria_idx
  on public.titan_dti_inspection_reports (criteria_version_id);

alter table public.titan_dti_criteria_sets enable row level security;
alter table public.titan_dti_criteria_versions enable row level security;
alter table public.titan_dti_criteria_rules enable row level security;
alter table public.titan_dti_criteria_events enable row level security;

grant select on public.titan_dti_criteria_sets, public.titan_dti_criteria_versions,
  public.titan_dti_criteria_rules, public.titan_dti_criteria_events to authenticated;

drop policy if exists "titan dti criteria sets read" on public.titan_dti_criteria_sets;
create policy "titan dti criteria sets read" on public.titan_dti_criteria_sets
  for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti criteria versions read" on public.titan_dti_criteria_versions;
create policy "titan dti criteria versions read" on public.titan_dti_criteria_versions
  for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti criteria rules read" on public.titan_dti_criteria_rules;
create policy "titan dti criteria rules read" on public.titan_dti_criteria_rules
  for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti criteria events read" on public.titan_dti_criteria_events;
create policy "titan dti criteria events read" on public.titan_dti_criteria_events
  for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_dti_criteria_sets is 'Named API, DS-1, Class 2 Alternate, or customer acceptance criteria separated by tubular component type.';
comment on table public.titan_dti_criteria_versions is 'Draft, published, and retired immutable versions of a DTI acceptance criteria set.';
comment on table public.titan_dti_criteria_rules is 'Structured acceptance rules evaluated against DTI inspection fields in a later classification phase.';
comment on column public.titan_dti_inspection_reports.criteria_snapshot is 'Immutable published criteria header and rules captured when a report selects a criteria version.';

commit;
