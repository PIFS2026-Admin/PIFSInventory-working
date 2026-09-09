-- Connect OMS-104 execution runs to the existing DTI Daily Summary and OMS-203 closeout.
-- Additive and rerunnable. Existing summaries and debriefs are unchanged.

begin;

do $$
begin
  if to_regclass('public.dti_daily_summaries') is null
    or to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_dti_job_runs') is null
    or to_regclass('public.titan_job_debriefs') is null then
    raise exception 'Run the DTI Daily Summary, Connected Jobs, DTI Job Execution, and Job Intelligence migrations first.';
  end if;
end $$;

alter table public.dti_daily_summaries add column if not exists job_id uuid;
alter table public.dti_daily_summaries add column if not exists job_run_id uuid;
alter table public.dti_daily_summaries add column if not exists source_rollup jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dti_daily_summaries_job_id_fkey') then
    alter table public.dti_daily_summaries
      add constraint dti_daily_summaries_job_id_fkey
      foreign key (job_id) references public.titan_jobs(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dti_daily_summaries_job_run_id_fkey') then
    alter table public.dti_daily_summaries
      add constraint dti_daily_summaries_job_run_id_fkey
      foreign key (job_run_id) references public.titan_dti_job_runs(id) on delete set null;
  end if;
end $$;

create index if not exists dti_daily_summaries_job_idx
  on public.dti_daily_summaries(job_id, summary_date desc);
create unique index if not exists dti_daily_summaries_job_run_unique_idx
  on public.dti_daily_summaries(job_run_id) where job_run_id is not null;

comment on column public.dti_daily_summaries.job_id is
  'Canonical TITAN job that produced this editable DTI Daily Summary.';
comment on column public.dti_daily_summaries.job_run_id is
  'OMS-104 execution run used to seed this summary; one summary per run.';
comment on column public.dti_daily_summaries.source_rollup is
  'Immutable-at-creation execution snapshot used to trace seeded totals.';

commit;
