-- OMS-102 service category and inspection scope for connected DTI jobs.
-- One controlled scope record per job; customer additions never remove the DS-1 baseline.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_job_documents') is null
    or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run Connected Jobs, Job Document Registry, and DTI Controls migrations first.';
  end if;
end $$;

create table if not exists public.titan_dti_job_scopes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.titan_jobs(id) on delete cascade,
  scope_version text not null default 'OMS-102 Rev 0',
  component_family text not null check (component_family in ('Drill Pipe','Work String Tubing','BHA / HWDP / Collars')),
  component_description text not null,
  service_category text not null check (service_category in ('1','2','3','4','5','HDLS')),
  connection_type text not null check (connection_type in ('API','Proprietary','Double-Shoulder','Other')),
  estimated_quantity integer check (estimated_quantity is null or estimated_quantity >= 0),
  baseline_scope jsonb not null default '[]'::jsonb,
  additional_requirements text,
  customer_spec_document_id uuid references public.titan_job_documents(id) on delete set null,
  customer_confirmed boolean not null default false,
  customer_confirmed_by text,
  customer_confirmed_on date,
  status text not null default 'Draft' check (status in ('Draft','Confirmed')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_dti_job_scope_confirmation check (
    status <> 'Confirmed' or (
      customer_confirmed
      and nullif(trim(coalesce(customer_confirmed_by,'')),'') is not null
      and customer_confirmed_on is not null
      and jsonb_array_length(baseline_scope) > 0
    )
  )
);

create index if not exists titan_dti_job_scopes_status_idx
  on public.titan_dti_job_scopes(status, updated_at desc);

create or replace function public.set_titan_dti_job_scope_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;
drop trigger if exists set_titan_dti_job_scope_updated_at on public.titan_dti_job_scopes;
create trigger set_titan_dti_job_scope_updated_at before update on public.titan_dti_job_scopes
for each row execute function public.set_titan_dti_job_scope_updated_at();

alter table public.titan_dti_job_scopes enable row level security;
grant select on public.titan_dti_job_scopes to authenticated;
drop policy if exists "titan dti job scopes read" on public.titan_dti_job_scopes;
create policy "titan dti job scopes read" on public.titan_dti_job_scopes
for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_dti_job_scopes is
  'OMS-102 customer-confirmed service category and server-derived DS-1 baseline inspection scope.';

commit;
