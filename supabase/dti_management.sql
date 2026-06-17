alter type public.user_role add value if not exists 'dti_superintendent';
alter type public.user_role add value if not exists 'dti_inspector';

create table if not exists public.dti_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  company_id uuid not null references public.companies(id),
  job_date date not null default current_date,
  field_ticket_number text,
  inspection_type text,
  inspection_company text,
  rig text,
  operator text,
  lead_inspector text,
  field_superintendent text,
  pad_location text,
  crew_lead text,
  reviewed_by text,
  review_date date,
  reviewer_signature text,
  status text not null default 'Open',
  overall_result text not null default 'Review',
  notes text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dti_jobs add column if not exists job_number text;
alter table public.dti_jobs add column if not exists company_id uuid references public.companies(id);
alter table public.dti_jobs add column if not exists job_date date default current_date;
alter table public.dti_jobs add column if not exists field_ticket_number text;
alter table public.dti_jobs add column if not exists inspection_type text;
alter table public.dti_jobs add column if not exists inspection_company text;
alter table public.dti_jobs add column if not exists rig text;
alter table public.dti_jobs add column if not exists operator text;
alter table public.dti_jobs add column if not exists lead_inspector text;
alter table public.dti_jobs add column if not exists field_superintendent text;
alter table public.dti_jobs add column if not exists pad_location text;
alter table public.dti_jobs add column if not exists crew_lead text;
alter table public.dti_jobs add column if not exists reviewed_by text;
alter table public.dti_jobs add column if not exists review_date date;
alter table public.dti_jobs add column if not exists reviewer_signature text;
alter table public.dti_jobs add column if not exists status text default 'Open';
alter table public.dti_jobs add column if not exists overall_result text default 'Review';
alter table public.dti_jobs add column if not exists notes text;
alter table public.dti_jobs add column if not exists closed_at timestamptz;
alter table public.dti_jobs add column if not exists closed_by uuid references auth.users(id);
alter table public.dti_jobs add column if not exists created_by uuid references auth.users(id);
alter table public.dti_jobs add column if not exists created_at timestamptz default now();
alter table public.dti_jobs add column if not exists updated_at timestamptz default now();

create table if not exists public.dti_checklist_responses (
  id uuid primary key default gen_random_uuid(),
  dti_job_id uuid not null references public.dti_jobs(id) on delete cascade,
  section text not null,
  category text,
  requirement text not null,
  definition text,
  priority text,
  weight numeric,
  score integer,
  notes text,
  red_flag boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dti_checklist_responses add column if not exists dti_job_id uuid references public.dti_jobs(id) on delete cascade;
alter table public.dti_checklist_responses add column if not exists section text;
alter table public.dti_checklist_responses add column if not exists category text;
alter table public.dti_checklist_responses add column if not exists requirement text;
alter table public.dti_checklist_responses add column if not exists definition text;
alter table public.dti_checklist_responses add column if not exists priority text;
alter table public.dti_checklist_responses add column if not exists weight numeric;
alter table public.dti_checklist_responses add column if not exists score integer;
alter table public.dti_checklist_responses add column if not exists notes text;
alter table public.dti_checklist_responses add column if not exists red_flag boolean default false;
alter table public.dti_checklist_responses add column if not exists sort_order integer default 0;
alter table public.dti_checklist_responses add column if not exists created_at timestamptz default now();
alter table public.dti_checklist_responses add column if not exists updated_at timestamptz default now();

create table if not exists public.dti_status_history (
  id uuid primary key default gen_random_uuid(),
  dti_job_id uuid not null references public.dti_jobs(id) on delete cascade,
  status text not null,
  comment text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.dti_status_history add column if not exists dti_job_id uuid references public.dti_jobs(id) on delete cascade;
alter table public.dti_status_history add column if not exists status text;
alter table public.dti_status_history add column if not exists comment text;
alter table public.dti_status_history add column if not exists created_by uuid references auth.users(id);
alter table public.dti_status_history add column if not exists created_at timestamptz default now();

create index if not exists dti_jobs_company_id_idx on public.dti_jobs(company_id);
create index if not exists dti_jobs_status_idx on public.dti_jobs(status);
create index if not exists dti_jobs_job_date_idx on public.dti_jobs(job_date);
create index if not exists dti_checklist_responses_job_id_idx on public.dti_checklist_responses(dti_job_id);
create index if not exists dti_status_history_job_id_idx on public.dti_status_history(dti_job_id);

alter table public.dti_jobs enable row level security;
alter table public.dti_checklist_responses enable row level security;
alter table public.dti_status_history enable row level security;

create or replace function public.is_dti_internal_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role()::text in ('admin', 'employee', 'dti_superintendent', 'dti_inspector'), false)
$$;

create or replace function public.is_dti_reader()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role()::text in ('admin', 'employee', 'sales', 'dti_superintendent', 'dti_inspector'), false)
$$;

drop policy if exists "dti jobs internal full" on public.dti_jobs;
create policy "dti jobs internal full"
on public.dti_jobs
for all
to authenticated
using (public.is_dti_internal_user())
with check (public.is_dti_internal_user());

drop policy if exists "dti jobs staff read" on public.dti_jobs;
create policy "dti jobs staff read"
on public.dti_jobs
for select
to authenticated
using (public.is_dti_reader());

drop policy if exists "dti jobs customer read own" on public.dti_jobs;
create policy "dti jobs customer read own"
on public.dti_jobs
for select
to authenticated
using (company_id = public.current_user_company_id());

drop policy if exists "dti checklist internal full" on public.dti_checklist_responses;
create policy "dti checklist internal full"
on public.dti_checklist_responses
for all
to authenticated
using (
  exists (
    select 1
    from public.dti_jobs job
    where job.id = dti_job_id
      and public.is_dti_internal_user()
  )
)
with check (
  exists (
    select 1
    from public.dti_jobs job
    where job.id = dti_job_id
      and public.is_dti_internal_user()
  )
);

drop policy if exists "dti checklist staff read" on public.dti_checklist_responses;
create policy "dti checklist staff read"
on public.dti_checklist_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.dti_jobs job
    where job.id = dti_job_id
      and public.is_dti_reader()
  )
);

drop policy if exists "dti checklist customer read own" on public.dti_checklist_responses;
create policy "dti checklist customer read own"
on public.dti_checklist_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.dti_jobs job
    where job.id = dti_job_id
      and job.company_id = public.current_user_company_id()
  )
);

drop policy if exists "dti history internal full" on public.dti_status_history;
create policy "dti history internal full"
on public.dti_status_history
for all
to authenticated
using (
  exists (
    select 1
    from public.dti_jobs job
    where job.id = dti_job_id
      and public.is_dti_internal_user()
  )
)
with check (
  exists (
    select 1
    from public.dti_jobs job
    where job.id = dti_job_id
      and public.is_dti_internal_user()
  )
);

drop policy if exists "dti history readers" on public.dti_status_history;
create policy "dti history readers"
on public.dti_status_history
for select
to authenticated
using (
  exists (
    select 1
    from public.dti_jobs job
    where job.id = dti_job_id
      and (public.is_dti_reader() or job.company_id = public.current_user_company_id())
  )
);

grant select, insert, update, delete on public.dti_jobs to authenticated;
grant select, insert, update, delete on public.dti_checklist_responses to authenticated;
grant select, insert, update, delete on public.dti_status_history to authenticated;

drop policy if exists "dti users read companies" on public.companies;
create policy "dti users read companies"
on public.companies
for select
to authenticated
using (public.is_dti_reader());

drop policy if exists "dti users insert companies" on public.companies;
create policy "dti users insert companies"
on public.companies
for insert
to authenticated
with check (public.is_dti_internal_user());
