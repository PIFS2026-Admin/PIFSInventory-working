-- IOM 13.2 per-joint traceability for DTI inspection results.

begin;
do $$ begin
  if to_regclass('public.titan_dti_job_runs') is null
    or to_regclass('public.titan_dti_rack_runs') is null
    or to_regclass('public.titan_dti_tubular_specs') is null
    or to_regclass('public.titan_dti_defect_decisions') is null
    or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run DTI Execution, Tubular Specifications, Defect Decisions, and DTI Controls migrations first.';
  end if;
end $$;

create sequence if not exists public.titan_dti_joint_inspection_number_seq;
create table if not exists public.titan_dti_joint_inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_number text not null unique default '',
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  job_run_id uuid not null references public.titan_dti_job_runs(id) on delete restrict,
  rack_run_id uuid not null references public.titan_dti_rack_runs(id) on delete restrict,
  tubular_spec_id uuid not null references public.titan_dti_tubular_specs(id) on delete restrict,
  joint_id text not null,
  serial_number text,
  wall_basis text not null check (wall_basis in ('Premium','Class 2','Not Required')),
  ut_lowest_wall_inches numeric(8,4) check (ut_lowest_wall_inches is null or ut_lowest_wall_inches >= 0),
  ut_minimum_inches numeric(8,4) check (ut_minimum_inches is null or ut_minimum_inches >= 0),
  ut_result text not null check (ut_result in ('Pass','Borderline','Reject','Not Required')),
  emi_result text not null check (emi_result in ('Pass','Indication','Not Required')),
  emi_indication_description text,
  visual_result text not null check (visual_result in ('Pass','Indication')),
  mpi_result text not null check (mpi_result in ('Pass','Indication','Not Required')),
  connection_result text not null check (connection_result in ('Pass','Indication','Not Required')),
  dimensional_evidence_count integer not null default 0 check (dimensional_evidence_count >= 0),
  source_defect_decision_id uuid references public.titan_dti_defect_decisions(id) on delete set null,
  final_disposition text not null check (final_disposition in ('Accept','Reject','DBR','Field Repair','Reface','Hardband','Hold')),
  decision_justification text not null,
  record_status text not null check (record_status in ('Complete','Hold')),
  spec_snapshot jsonb not null default '{}'::jsonb,
  inspector_name text not null,
  inspected_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_run_id, joint_id),
  constraint titan_dti_joint_ut_evidence check (wall_basis = 'Not Required' or (ut_lowest_wall_inches is not null and ut_minimum_inches is not null)),
  constraint titan_dti_joint_emi_description check (emi_result <> 'Indication' or nullif(trim(coalesce(emi_indication_description,'')),'') is not null)
);
create index if not exists titan_dti_joint_inspections_run_idx on public.titan_dti_joint_inspections(job_run_id, rack_run_id, joint_id);
create or replace function public.set_titan_dti_joint_inspection_defaults()
returns trigger language plpgsql set search_path=public as $$ begin
  if coalesce(new.inspection_number,'')='' then new.inspection_number := 'JNT-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.titan_dti_joint_inspection_number_seq')::text,6,'0'); end if;
  new.updated_at := now(); return new;
end; $$;
drop trigger if exists set_titan_dti_joint_inspection_defaults on public.titan_dti_joint_inspections;
create trigger set_titan_dti_joint_inspection_defaults before insert or update on public.titan_dti_joint_inspections for each row execute function public.set_titan_dti_joint_inspection_defaults();
alter table public.titan_dti_joint_inspections enable row level security;
grant select on public.titan_dti_joint_inspections to authenticated;
drop policy if exists "titan dti joint inspections read" on public.titan_dti_joint_inspections;
create policy "titan dti joint inspections read" on public.titan_dti_joint_inspections for select to authenticated using (public.titan_dti_controls_can_access());
comment on table public.titan_dti_joint_inspections is 'IOM 13.2 traceable per-joint DTI results and server-derived final record status.';
commit;
