-- Exact field-report foundation for Drill Pipe, HWDP, Subs, and EMI prove-up records.

begin;

do $$ begin
  if to_regclass('public.titan_jobs') is null or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run TITAN Connected Jobs and DTI Controls migrations first.';
  end if;
end $$;

create sequence if not exists public.titan_dti_inspection_report_number_seq;

create table if not exists public.titan_dti_inspection_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null unique default '',
  source_template_version text not null default 'Blank Report.xlsx / 2026-09-16',
  job_id uuid references public.titan_jobs(id) on delete set null,
  operator_name text not null,
  contractor_name text,
  rig_number text,
  report_date date not null default current_date,
  field_invoice text,
  inspection_crew text,
  connection_size text,
  connection_type text,
  grade text,
  state text,
  inspection_scope jsonb not null default '{}'::jsonb,
  machine_shop jsonb not null default '{}'::jsonb,
  remarks jsonb not null default '{}'::jsonb,
  status text not null default 'Draft' check (status in ('Draft','In Progress','Complete','Archived')),
  completed_at timestamptz,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titan_dti_inspection_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.titan_dti_inspection_reports(id) on delete cascade,
  component_type text not null check (component_type in ('Drill Pipe','HWDP','Subs')),
  sequence_number integer not null check (sequence_number > 0),
  row_data jsonb not null default '{}'::jsonb,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_id, component_type, sequence_number)
);

create table if not exists public.titan_dti_emi_prove_ups (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.titan_dti_inspection_reports(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  joint_number text,
  serial_number text,
  flaw text,
  depth_inches numeric(9,4) check (depth_inches is null or depth_inches >= 0),
  adjacent_wall_inches numeric(9,4) check (adjacent_wall_inches is null or adjacent_wall_inches >= 0),
  remaining_body_wall_inches numeric(9,4) check (remaining_body_wall_inches is null or remaining_body_wall_inches >= 0),
  distance_from_end text,
  prove_up_result text,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_id, sequence_number)
);

create table if not exists public.titan_dti_inspection_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.titan_dti_inspection_reports(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  event_type text not null check (event_type in ('Created','Updated','Deleted','Status Changed')),
  before_value jsonb,
  after_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_dti_inspection_reports_job_idx on public.titan_dti_inspection_reports(job_id, report_date desc);
create index if not exists titan_dti_inspection_items_report_idx on public.titan_dti_inspection_items(report_id, component_type, sequence_number);
create index if not exists titan_dti_emi_prove_ups_report_idx on public.titan_dti_emi_prove_ups(report_id, sequence_number);
create index if not exists titan_dti_inspection_report_events_report_idx on public.titan_dti_inspection_report_events(report_id, created_at desc);

create or replace function public.set_titan_dti_inspection_report_defaults()
returns trigger language plpgsql set search_path=public as $$ begin
  if coalesce(new.report_number,'') = '' then
    new.report_number := 'DTI-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.titan_dti_inspection_report_number_seq')::text,6,'0');
  end if;
  if tg_op = 'UPDATE' then new.row_version := old.row_version + 1; end if;
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.set_titan_dti_inspection_row_defaults()
returns trigger language plpgsql set search_path=public as $$ begin
  new.row_version := old.row_version + 1;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists set_titan_dti_inspection_reports_defaults on public.titan_dti_inspection_reports;
create trigger set_titan_dti_inspection_reports_defaults before insert or update on public.titan_dti_inspection_reports for each row execute function public.set_titan_dti_inspection_report_defaults();
drop trigger if exists set_titan_dti_inspection_items_defaults on public.titan_dti_inspection_items;
create trigger set_titan_dti_inspection_items_defaults before update on public.titan_dti_inspection_items for each row execute function public.set_titan_dti_inspection_row_defaults();
drop trigger if exists set_titan_dti_emi_prove_ups_defaults on public.titan_dti_emi_prove_ups;
create trigger set_titan_dti_emi_prove_ups_defaults before update on public.titan_dti_emi_prove_ups for each row execute function public.set_titan_dti_inspection_row_defaults();

alter table public.titan_dti_inspection_reports enable row level security;
alter table public.titan_dti_inspection_items enable row level security;
alter table public.titan_dti_emi_prove_ups enable row level security;
alter table public.titan_dti_inspection_report_events enable row level security;
grant select on public.titan_dti_inspection_reports, public.titan_dti_inspection_items, public.titan_dti_emi_prove_ups, public.titan_dti_inspection_report_events to authenticated;

drop policy if exists "titan dti inspection reports read" on public.titan_dti_inspection_reports;
create policy "titan dti inspection reports read" on public.titan_dti_inspection_reports for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti inspection items read" on public.titan_dti_inspection_items;
create policy "titan dti inspection items read" on public.titan_dti_inspection_items for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti emi prove ups read" on public.titan_dti_emi_prove_ups;
create policy "titan dti emi prove ups read" on public.titan_dti_emi_prove_ups for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti inspection report events read" on public.titan_dti_inspection_report_events;
create policy "titan dti inspection report events read" on public.titan_dti_inspection_report_events for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_dti_inspection_reports is 'Versioned customer-facing DTI inspection report headers and scope.';
comment on table public.titan_dti_inspection_items is 'Exact Drill Pipe, HWDP, and Subs field rows stored against controlled field definitions.';
comment on table public.titan_dti_emi_prove_ups is 'EMI prove-up rows matching the controlled inspection report.';

commit;
