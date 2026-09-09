-- Complete OMS-203 post-job debrief fields on the existing durable job record.

begin;

do $$ begin
  if to_regclass('public.titan_job_debriefs') is null
    or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run Job Intelligence and DTI Controls migrations first.';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'titan_job_debriefs' and column_name = 'completion_status') then
    alter table public.titan_job_debriefs
      add column completion_status text not null default 'Draft',
      add column finalized_at timestamptz,
      add column finalized_by uuid references auth.users(id) on delete set null;
    update public.titan_job_debriefs set completion_status = 'Complete', finalized_at = coalesce(updated_at, created_at);
  end if;
end $$;

alter table public.titan_job_debriefs
  add column if not exists crew_size integer,
  add column if not exists weather_conditions text,
  add column if not exists loader_cycles_standby_time text,
  add column if not exists station_performance jsonb not null default '[]'::jsonb,
  add column if not exists slowdown_categories text[] not null default '{}',
  add column if not exists equipment_failures text,
  add column if not exists equipment_tagged_out text,
  add column if not exists restock_consumables text,
  add column if not exists kpa_completed boolean,
  add column if not exists restock_list_generated boolean,
  add column if not exists near_miss_good_catch text,
  add column if not exists stop_work_used boolean,
  add column if not exists stop_work_description text,
  add column if not exists jsa_effective boolean,
  add column if not exists jsa_update_needed text,
  add column if not exists deviation_agreements_applicable boolean,
  add column if not exists deviation_agreements_attached boolean,
  add column if not exists deviation_agreement_count integer not null default 0,
  add column if not exists action_items jsonb not null default '[]'::jsonb,
  add column if not exists crew_lead_signoff_name text,
  add column if not exists crew_lead_signed_on date,
  add column if not exists manager_review_name text,
  add column if not exists manager_reviewed_on date,
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'titan_job_debriefs_crew_size_check' and conrelid = 'public.titan_job_debriefs'::regclass) then
    alter table public.titan_job_debriefs add constraint titan_job_debriefs_crew_size_check check (crew_size is null or crew_size > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'titan_job_debriefs_station_performance_check' and conrelid = 'public.titan_job_debriefs'::regclass) then
    alter table public.titan_job_debriefs add constraint titan_job_debriefs_station_performance_check check (jsonb_typeof(station_performance) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'titan_job_debriefs_action_items_check' and conrelid = 'public.titan_job_debriefs'::regclass) then
    alter table public.titan_job_debriefs add constraint titan_job_debriefs_action_items_check check (jsonb_typeof(action_items) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'titan_job_debriefs_deviation_count_check' and conrelid = 'public.titan_job_debriefs'::regclass) then
    alter table public.titan_job_debriefs add constraint titan_job_debriefs_deviation_count_check check (deviation_agreement_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'titan_job_debriefs_completion_status_check' and conrelid = 'public.titan_job_debriefs'::regclass) then
    alter table public.titan_job_debriefs add constraint titan_job_debriefs_completion_status_check check (completion_status in ('Draft','Complete'));
  end if;
end $$;

comment on column public.titan_job_debriefs.station_performance is 'OMS-203 benchmark result and variance driver for each execution station.';
comment on column public.titan_job_debriefs.action_items is 'OMS-203 lessons converted into owned actions with due dates.';
comment on column public.titan_job_debriefs.completion_status is 'Draft until all required OMS-203 review and sign-off controls pass.';

commit;
