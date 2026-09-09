-- OMS-101 pre-job readiness records for connected DTI jobs.
-- Additive, rerunnable, and Wade-only during controlled rollout.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null then
    raise exception 'Run the TITAN Connected Jobs foundation first.';
  end if;
  if to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run supabase/titan_dti_controls_reassignment.sql first.';
  end if;
end $$;

create table if not exists public.titan_dti_pre_job_readiness (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.titan_jobs(id) on delete cascade,
  checklist_version text not null default 'OMS-101 Rev 0',
  responses jsonb not null default '{}'::jsonb,
  readiness_status text not null default 'Needs Attention'
    check (readiness_status in ('Ready','Needs Attention','Blocked')),
  total_items integer not null default 0 check (total_items >= 0),
  complete_items integer not null default 0 check (complete_items >= 0),
  attention_items integer not null default 0 check (attention_items >= 0),
  blocked_items integer not null default 0 check (blocked_items >= 0),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_dti_pre_job_readiness_counts check (
    complete_items + attention_items + blocked_items <= total_items
  )
);

create index if not exists titan_dti_pre_job_readiness_status_idx
  on public.titan_dti_pre_job_readiness(readiness_status, updated_at desc);

create or replace function public.set_titan_dti_pre_job_readiness_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;

drop trigger if exists set_titan_dti_pre_job_readiness_updated_at on public.titan_dti_pre_job_readiness;
create trigger set_titan_dti_pre_job_readiness_updated_at
before update on public.titan_dti_pre_job_readiness
for each row execute function public.set_titan_dti_pre_job_readiness_updated_at();

alter table public.titan_dti_pre_job_readiness enable row level security;
grant select on public.titan_dti_pre_job_readiness to authenticated;
drop policy if exists "titan dti pre job readiness read" on public.titan_dti_pre_job_readiness;
create policy "titan dti pre job readiness read" on public.titan_dti_pre_job_readiness
for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_dti_pre_job_readiness is
  'OMS-101 pre-job readiness responses and disposition for each connected DTI job.';

commit;
