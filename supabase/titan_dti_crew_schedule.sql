-- DTI crew assignment history and hitch calendar.
-- Additive, rerunnable, and Wade-only during controlled rollout.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null or to_regclass('public.profiles') is null then
    raise exception 'Run the TITAN Connected Jobs foundation first.';
  end if;
  if to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run supabase/titan_dti_controls_reassignment.sql first.';
  end if;
end $$;

create table if not exists public.titan_dti_crew_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  assignment_role text not null default 'Inspector',
  starts_on date not null,
  ends_on date not null,
  status text not null default 'Scheduled' check (status in ('Scheduled','Confirmed','Complete','Cancelled')),
  notes text,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_dti_crew_assignment_dates check (ends_on >= starts_on)
);

create index if not exists titan_dti_crew_assignments_calendar_idx
  on public.titan_dti_crew_assignments(starts_on, ends_on) where archived_at is null;
create index if not exists titan_dti_crew_assignments_profile_idx
  on public.titan_dti_crew_assignments(profile_id, starts_on desc) where archived_at is null;
create index if not exists titan_dti_crew_assignments_job_idx
  on public.titan_dti_crew_assignments(job_id, starts_on desc) where archived_at is null;

create or replace function public.set_titan_dti_crew_assignment_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;

drop trigger if exists set_titan_dti_crew_assignment_updated_at on public.titan_dti_crew_assignments;
create trigger set_titan_dti_crew_assignment_updated_at before update on public.titan_dti_crew_assignments
for each row execute function public.set_titan_dti_crew_assignment_updated_at();

alter table public.titan_dti_crew_assignments enable row level security;
grant select on public.titan_dti_crew_assignments to authenticated;
drop policy if exists "titan dti crew assignments read" on public.titan_dti_crew_assignments;
create policy "titan dti crew assignments read" on public.titan_dti_crew_assignments
for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_dti_crew_assignments is 'DTI hitch calendar and permanent crew-to-job assignment history.';

commit;
