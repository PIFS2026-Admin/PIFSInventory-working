-- OMS-109 borderline-condition escalation records for live DTI execution.
-- A resolved acceptance can link to OMS-202; reject/re-test decisions remain OMS-109 records only.

begin;

do $$
begin
  if to_regclass('public.titan_dti_job_runs') is null
    or to_regclass('public.titan_dti_rack_runs') is null
    or to_regclass('public.titan_job_deviations') is null
    or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run DTI Job Execution, Job Intelligence, and DTI Controls migrations first.';
  end if;
end $$;

create sequence if not exists public.titan_dti_escalation_number_seq;

create table if not exists public.titan_dti_borderline_escalations (
  id uuid primary key default gen_random_uuid(),
  escalation_number text not null unique default '',
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  job_run_id uuid not null references public.titan_dti_job_runs(id) on delete restrict,
  rack_run_id uuid references public.titan_dti_rack_runs(id) on delete set null,
  component_ids text not null,
  quantity integer not null default 1 check (quantity > 0),
  condition_type text not null,
  condition_description text not null,
  component_location text not null,
  measurements text not null,
  service_category text not null,
  critical_area boolean not null default false,
  repeated_condition boolean not null default false,
  controlling_criteria text,
  operational_risk text not null check (operational_risk in ('Low','Moderate','High')),
  inspector_recommendation text not null check (inspector_recommendation in ('Reject','Accept with Deviation','Further Evaluation')),
  lead_inspector_name text,
  customer_rep_name text,
  customer_company text,
  customer_contacted_on date,
  communication_method text,
  customer_decision text check (customer_decision is null or customer_decision in ('Accept with Deviation','Reject','Modify Criteria','Further Evaluation')),
  confirmation_document_id uuid references public.titan_job_documents(id) on delete set null,
  decision_notes text,
  status text not null default 'Open' check (status in ('Open','Lead Review','Customer Decision','Resolved')),
  deviation_id uuid references public.titan_job_deviations(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_dti_escalation_acceptance_evidence check (
    customer_decision <> 'Accept with Deviation'
    or (confirmation_document_id is not null and nullif(trim(coalesce(customer_rep_name,'')),'') is not null)
  ),
  constraint titan_dti_escalation_high_risk_check check (
    operational_risk <> 'High' or customer_decision is distinct from 'Accept with Deviation'
  )
);

create index if not exists titan_dti_borderline_escalations_job_idx
  on public.titan_dti_borderline_escalations(job_id, status, created_at desc);
create index if not exists titan_dti_borderline_escalations_run_idx
  on public.titan_dti_borderline_escalations(job_run_id, rack_run_id, created_at desc);

create or replace function public.set_titan_dti_escalation_defaults()
returns trigger language plpgsql set search_path=public as $$
begin
  if coalesce(new.escalation_number, '') = '' then
    new.escalation_number := 'ESC-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.titan_dti_escalation_number_seq')::text, 5, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_titan_dti_escalation_defaults on public.titan_dti_borderline_escalations;
create trigger set_titan_dti_escalation_defaults before insert or update on public.titan_dti_borderline_escalations
for each row execute function public.set_titan_dti_escalation_defaults();

alter table public.titan_dti_borderline_escalations enable row level security;
grant select on public.titan_dti_borderline_escalations to authenticated;
drop policy if exists "titan dti borderline escalations read" on public.titan_dti_borderline_escalations;
create policy "titan dti borderline escalations read" on public.titan_dti_borderline_escalations
for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_dti_borderline_escalations is
  'OMS-109 defensible decision trail; only accepted out-of-standard outcomes create OMS-202 deviations.';

commit;
