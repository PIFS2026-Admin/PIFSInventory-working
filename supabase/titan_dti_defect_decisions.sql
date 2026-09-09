-- OMS-105 confirmed defect decisions for live DTI execution.

begin;
do $$ begin
  if to_regclass('public.titan_dti_job_runs') is null or to_regclass('public.titan_dti_rack_runs') is null
    or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run DTI Job Execution and DTI Controls migrations first.';
  end if;
end $$;

create sequence if not exists public.titan_dti_defect_decision_number_seq;
create table if not exists public.titan_dti_defect_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_number text not null unique default '',
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  job_run_id uuid not null references public.titan_dti_job_runs(id) on delete restrict,
  rack_run_id uuid references public.titan_dti_rack_runs(id) on delete set null,
  joint_ids text not null,
  quantity integer not null default 1 check (quantity > 0),
  defect_type text not null,
  component_location text not null,
  detection_method text not null,
  confirmation_method text not null,
  measurements text not null,
  controlling_criteria text not null,
  disposition text not null check (disposition in ('Accept','Reject','DBR','Field Repair','Reface','Hardband')),
  action_notes text,
  inspector_name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint titan_dti_defect_independent_confirmation check (detection_method <> confirmation_method),
  constraint titan_dti_defect_nonnegotiable_reject check (
    lower(defect_type) not like '%crack%'
    and defect_type not in ('Bent Pipe','Structural Drift Failure')
    or disposition = 'Reject'
  )
);

create index if not exists titan_dti_defect_decisions_run_idx
  on public.titan_dti_defect_decisions(job_run_id, rack_run_id, created_at desc);
create or replace function public.set_titan_dti_defect_decision_number()
returns trigger language plpgsql set search_path=public as $$ begin
  if coalesce(new.decision_number,'')='' then new.decision_number := 'DEF-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.titan_dti_defect_decision_number_seq')::text,5,'0'); end if;
  return new;
end; $$;
drop trigger if exists set_titan_dti_defect_decision_number on public.titan_dti_defect_decisions;
create trigger set_titan_dti_defect_decision_number before insert on public.titan_dti_defect_decisions
for each row execute function public.set_titan_dti_defect_decision_number();

alter table public.titan_dti_defect_decisions enable row level security;
grant select on public.titan_dti_defect_decisions to authenticated;
drop policy if exists "titan dti defect decisions read" on public.titan_dti_defect_decisions;
create policy "titan dti defect decisions read" on public.titan_dti_defect_decisions for select to authenticated
using (public.titan_dti_controls_can_access());
comment on table public.titan_dti_defect_decisions is 'OMS-105 per-joint confirmed indication, measurement, criteria, and disposition records.';
commit;
