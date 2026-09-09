-- Complete OMS-202 deviation acceptance fields on the existing permanent register.

begin;

do $$ begin
  if to_regclass('public.titan_job_deviations') is null
    or to_regclass('public.titan_job_documents') is null
    or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run Job Intelligence, Job Documents, and DTI Controls migrations first.';
  end if;
end $$;

alter table public.titan_job_deviations
  add column if not exists third_party_monitor_present boolean not null default false,
  add column if not exists third_party_monitor_name text,
  add column if not exists third_party_monitor_company text,
  add column if not exists risk_level text,
  add column if not exists economic_impact text,
  add column if not exists trend_across_string text,
  add column if not exists customer_rep_name text,
  add column if not exists customer_rep_title text,
  add column if not exists customer_company text,
  add column if not exists customer_authorized_on date,
  add column if not exists pathfinder_inspector_name text,
  add column if not exists pathfinder_inspector_signed_on date,
  add column if not exists lead_inspector_name text,
  add column if not exists lead_inspector_signed_on date,
  add column if not exists customer_signature_name text,
  add column if not exists customer_signed_on date,
  add column if not exists confirmation_attached boolean not null default false,
  add column if not exists attached_to_job_report boolean not null default false,
  add column if not exists affected_joints_marked boolean not null default false,
  add column if not exists manager_copy_filed boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'titan_job_deviations_risk_level_check' and conrelid = 'public.titan_job_deviations'::regclass) then
    alter table public.titan_job_deviations add constraint titan_job_deviations_risk_level_check check (risk_level is null or risk_level in ('Low','Moderate','High'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'titan_job_deviations_economic_impact_check' and conrelid = 'public.titan_job_deviations'::regclass) then
    alter table public.titan_job_deviations add constraint titan_job_deviations_economic_impact_check check (economic_impact is null or economic_impact in ('Low','Moderate','High'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'titan_job_deviations_trend_check' and conrelid = 'public.titan_job_deviations'::regclass) then
    alter table public.titan_job_deviations add constraint titan_job_deviations_trend_check check (trend_across_string is null or trend_across_string in ('Isolated','Several Joints','Widespread'));
  end if;
end $$;

create index if not exists titan_job_deviations_dti_register_idx
  on public.titan_job_deviations(status, customer_authorized_on desc, updated_at desc);

comment on column public.titan_job_deviations.risk_level is 'OMS-202 operational risk classification; High is not eligible for acceptance.';
comment on column public.titan_job_deviations.confirmation_attached is 'OMS-202 filing confirmation that written customer authorization is attached.';
comment on column public.titan_job_deviations.attached_to_job_report is 'OMS-202 filing confirmation that the agreement is included with the job report.';
comment on column public.titan_job_deviations.affected_joints_marked is 'OMS-202 confirmation that affected joints are marked or stenciled per disposition.';
comment on column public.titan_job_deviations.manager_copy_filed is 'OMS-202 confirmation that the Service Line Manager received the record.';

commit;
