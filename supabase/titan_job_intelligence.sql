-- Job deviations and closeout debriefs for Connected Jobs.
-- Additive, rerunnable, Wade-only during the controlled CRM rollout.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_job_events') is null
    or to_regclass('public.titan_job_documents') is null then
    raise exception 'Run the connected-job lifecycle and document registry migrations first.';
  end if;
end $$;

create sequence if not exists public.titan_job_deviation_number_seq;
create sequence if not exists public.titan_job_debrief_number_seq;

create table if not exists public.titan_job_deviations (
  id uuid primary key default gen_random_uuid(),
  deviation_number text not null unique default '',
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  component text,
  joint_ids text,
  quantity integer check (quantity is null or quantity >= 0),
  defect_type text not null,
  location_on_component text,
  measurements text,
  controlling_criteria text,
  justification text,
  operational_risk text,
  inspector_recommendation text,
  communication_method text,
  written_confirmation boolean not null default false,
  confirmation_document_id uuid references public.titan_job_documents(id) on delete set null,
  spec_candidate boolean not null default false,
  status text not null default 'Draft' check (status in ('Draft', 'Submitted', 'Approved', 'Voided')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  void_reason text,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_job_deviation_approval_evidence_check check (
    status <> 'Approved' or (written_confirmation and confirmation_document_id is not null)
  ),
  constraint titan_job_deviation_void_reason_check check (
    status <> 'Voided' or nullif(trim(coalesce(void_reason, '')), '') is not null
  )
);

create table if not exists public.titan_job_debriefs (
  id uuid primary key default gen_random_uuid(),
  debrief_number text not null unique default '',
  job_id uuid not null unique references public.titan_jobs(id) on delete restrict,
  on_plan boolean,
  station_behind text,
  variance_driver text,
  went_well text,
  slowed_by text,
  safety_observations text,
  gray_area_summary text,
  borderline_count integer not null default 0 check (borderline_count >= 0),
  customer_feedback text,
  repeat_issue boolean not null default false,
  repeat_note text,
  lessons_learned text,
  action_owner_name text,
  status text not null default 'Active' check (status in ('Active', 'Voided')),
  void_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_job_debrief_repeat_note_check check (
    not repeat_issue or nullif(trim(coalesce(repeat_note, '')), '') is not null
  ),
  constraint titan_job_debrief_void_reason_check check (
    status <> 'Voided' or nullif(trim(coalesce(void_reason, '')), '') is not null
  )
);

create index if not exists titan_job_deviations_job_idx
  on public.titan_job_deviations(job_id, status, created_at desc);

create index if not exists titan_job_debriefs_job_idx
  on public.titan_job_debriefs(job_id, updated_at desc);

create or replace function public.set_titan_job_deviation_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.deviation_number, '') = '' then
    new.deviation_number := 'DEV-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.titan_job_deviation_number_seq')::text, 5, '0');
  end if;
  if tg_op = 'UPDATE' then new.row_version := old.row_version + 1; end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_titan_job_debrief_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.debrief_number, '') = '' then
    new.debrief_number := 'DBR-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.titan_job_debrief_number_seq')::text, 5, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_titan_job_deviation_defaults on public.titan_job_deviations;
create trigger set_titan_job_deviation_defaults
before insert or update on public.titan_job_deviations
for each row execute function public.set_titan_job_deviation_defaults();

drop trigger if exists set_titan_job_debrief_defaults on public.titan_job_debriefs;
create trigger set_titan_job_debrief_defaults
before insert or update on public.titan_job_debriefs
for each row execute function public.set_titan_job_debrief_defaults();

alter table public.titan_job_deviations enable row level security;
alter table public.titan_job_debriefs enable row level security;

grant select on public.titan_job_deviations to authenticated;
grant select on public.titan_job_debriefs to authenticated;

drop policy if exists "titan job deviations crm access read" on public.titan_job_deviations;
create policy "titan job deviations crm access read"
on public.titan_job_deviations for select to authenticated
using (public.crm_can_access());

drop policy if exists "titan job debriefs crm access read" on public.titan_job_debriefs;
create policy "titan job debriefs crm access read"
on public.titan_job_debriefs for select to authenticated
using (public.crm_can_access());

comment on table public.titan_job_deviations is
  'Permanent job deviation register. Records transition through Draft, Submitted, Approved, or Voided and are never deleted.';

comment on table public.titan_job_debriefs is
  'One durable closeout debrief per canonical TITAN job.';

commit;
