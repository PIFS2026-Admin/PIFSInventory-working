-- OMS-106 dimensional readings tied to controlled tubular specifications.

begin;
do $$ begin
  if to_regclass('public.titan_dti_job_runs') is null or to_regclass('public.titan_dti_tubular_specs') is null
    or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run DTI Job Execution, Tubular Specifications, and DTI Controls migrations first.';
  end if;
end $$;

create sequence if not exists public.titan_dti_dimensional_reading_number_seq;
create table if not exists public.titan_dti_dimensional_readings (
  id uuid primary key default gen_random_uuid(),
  reading_number text not null unique default '',
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  job_run_id uuid not null references public.titan_dti_job_runs(id) on delete restrict,
  rack_run_id uuid references public.titan_dti_rack_runs(id) on delete set null,
  tubular_spec_id uuid not null references public.titan_dti_tubular_specs(id) on delete restrict,
  joint_id text not null,
  measurement_type text not null check (measurement_type in ('Tool Joint OD','Tool Joint ID','Counterbore Diameter','Counterbore Depth','Thread Stretch','Bevel Diameter','Tong Space')),
  component_end text not null check (component_end in ('Pin','Box','Tube','N/A')),
  reading_a_inches numeric(9,4) not null check (reading_a_inches >= 0),
  reading_b_inches numeric(9,4) check (reading_b_inches is null or reading_b_inches >= 0),
  recorded_value_inches numeric(9,4) not null check (recorded_value_inches >= 0),
  minimum_inches numeric(9,4),
  maximum_inches numeric(9,4),
  result text not null check (result in ('Pass','Borderline','Reject','Recorded')),
  spec_snapshot jsonb not null,
  instrument text not null,
  inspector_name text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists titan_dti_dimensional_readings_run_idx on public.titan_dti_dimensional_readings(job_run_id, rack_run_id, created_at desc);
create index if not exists titan_dti_dimensional_readings_joint_idx on public.titan_dti_dimensional_readings(job_id, joint_id);

create or replace function public.set_titan_dti_dimensional_reading_number()
returns trigger language plpgsql set search_path=public as $$ begin
  if coalesce(new.reading_number,'')='' then new.reading_number := 'DIM-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.titan_dti_dimensional_reading_number_seq')::text,5,'0'); end if;
  return new;
end; $$;
drop trigger if exists set_titan_dti_dimensional_reading_number on public.titan_dti_dimensional_readings;
create trigger set_titan_dti_dimensional_reading_number before insert on public.titan_dti_dimensional_readings
for each row execute function public.set_titan_dti_dimensional_reading_number();

alter table public.titan_dti_dimensional_readings enable row level security;
grant select on public.titan_dti_dimensional_readings to authenticated;
drop policy if exists "titan dti dimensional readings read" on public.titan_dti_dimensional_readings;
create policy "titan dti dimensional readings read" on public.titan_dti_dimensional_readings for select to authenticated
using (public.titan_dti_controls_can_access());
comment on table public.titan_dti_dimensional_readings is 'OMS-106 measurement evidence evaluated against an immutable snapshot of a controlled tubular specification.';
commit;
