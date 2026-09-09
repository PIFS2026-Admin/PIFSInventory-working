-- OMS-104 live rack workflow and OMS-108 field calibration checkpoints.
-- Additive, rerunnable, and Wade-only during controlled rollout.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null or to_regclass('public.equipment_assets') is null then
    raise exception 'Run the TITAN Connected Jobs and Equipment Master foundations first.';
  end if;
  if to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run supabase/titan_dti_controls_reassignment.sql first.';
  end if;
end $$;

create table if not exists public.titan_dti_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.titan_jobs(id) on delete cascade,
  run_date date not null default current_date,
  shift_name text not null default 'Day',
  crew_lead_name text,
  setup_type text not null default 'Side-by-Side'
    check (setup_type in ('Side-by-Side','Single Rack','Other')),
  planned_joints integer not null default 0 check (planned_joints >= 0),
  status text not null default 'Active'
    check (status in ('Active','Paused','Complete')),
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, run_date, shift_name)
);

create table if not exists public.titan_dti_rack_runs (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references public.titan_dti_job_runs(id) on delete cascade,
  rack_number integer not null check (rack_number > 0),
  rack_name text,
  pipe_description text,
  planned_joints integer not null default 0 check (planned_joints >= 0),
  completed_joints integer not null default 0 check (completed_joints >= 0),
  current_phase integer not null default 1 check (current_phase between 1 and 6),
  status text not null default 'Not Started'
    check (status in ('Not Started','In Progress','Hold','Complete')),
  hold_reason text,
  phase_history jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_run_id, rack_number),
  constraint titan_dti_rack_completed_count check (planned_joints = 0 or completed_joints <= planned_joints)
);

create table if not exists public.titan_dti_field_calibrations (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references public.titan_dti_job_runs(id) on delete cascade,
  rack_run_id uuid references public.titan_dti_rack_runs(id) on delete set null,
  equipment_asset_id uuid references public.equipment_assets(id) on delete set null,
  calibration_kind text not null
    check (calibration_kind in ('OD Gauge','UT Wall','EMI Standard')),
  checkpoint text not null
    check (checkpoint in ('Job Start','25 Joints','50 Joints','Size Change','Equipment Interruption','Job End','Final Standard')),
  joint_number integer check (joint_number is null or joint_number >= 0),
  result text not null check (result in ('Pass','Fail')),
  reading_summary text,
  performed_by_name text not null,
  occurred_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_dti_job_runs_job_idx
  on public.titan_dti_job_runs(job_id, run_date desc, started_at desc);
create index if not exists titan_dti_rack_runs_run_idx
  on public.titan_dti_rack_runs(job_run_id, rack_number);
create index if not exists titan_dti_field_calibrations_run_idx
  on public.titan_dti_field_calibrations(job_run_id, calibration_kind, occurred_at desc);

create or replace function public.set_titan_dti_execution_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;

drop trigger if exists set_titan_dti_job_runs_updated_at on public.titan_dti_job_runs;
create trigger set_titan_dti_job_runs_updated_at before update on public.titan_dti_job_runs
for each row execute function public.set_titan_dti_execution_updated_at();
drop trigger if exists set_titan_dti_rack_runs_updated_at on public.titan_dti_rack_runs;
create trigger set_titan_dti_rack_runs_updated_at before update on public.titan_dti_rack_runs
for each row execute function public.set_titan_dti_execution_updated_at();

alter table public.titan_dti_job_runs enable row level security;
alter table public.titan_dti_rack_runs enable row level security;
alter table public.titan_dti_field_calibrations enable row level security;
grant select on public.titan_dti_job_runs, public.titan_dti_rack_runs, public.titan_dti_field_calibrations to authenticated;

drop policy if exists "titan dti job runs read" on public.titan_dti_job_runs;
create policy "titan dti job runs read" on public.titan_dti_job_runs for select to authenticated
using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti rack runs read" on public.titan_dti_rack_runs;
create policy "titan dti rack runs read" on public.titan_dti_rack_runs for select to authenticated
using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti field calibrations read" on public.titan_dti_field_calibrations;
create policy "titan dti field calibrations read" on public.titan_dti_field_calibrations for select to authenticated
using (public.titan_dti_controls_can_access());

comment on table public.titan_dti_job_runs is 'DTI job shifts/runs governed by OMS-104.';
comment on table public.titan_dti_rack_runs is 'Per-rack phase progress for the OMS-104 six-phase workflow.';
comment on table public.titan_dti_field_calibrations is 'OD, UT, and EMI field verification checkpoints governed by OMS-104 and OMS-108.';

commit;
