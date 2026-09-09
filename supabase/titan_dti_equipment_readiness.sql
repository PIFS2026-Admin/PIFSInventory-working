-- DTI job equipment assignments and calibration history.
-- Additive, rerunnable, and Wade-only during controlled rollout.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null or to_regclass('public.equipment_assets') is null then
    raise exception 'Run supabase/titan_connected_job_lifecycle.sql and supabase/equipment_master_list.sql first.';
  end if;
  if to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run supabase/titan_dti_controls_reassignment.sql first.';
  end if;
end $$;

alter table public.equipment_assets add column if not exists serial_number text;
alter table public.equipment_assets add column if not exists requires_calibration boolean not null default false;
alter table public.equipment_assets add column if not exists calibration_frequency_days integer;
alter table public.equipment_assets add column if not exists current_assignment text;

create table if not exists public.titan_equipment_calibrations (
  id uuid primary key default gen_random_uuid(),
  equipment_asset_id uuid not null references public.equipment_assets(id) on delete cascade,
  calibration_type text not null,
  calibrated_on date not null,
  expires_on date not null,
  result text not null default 'Pass' check (result in ('Pass','Fail')),
  performed_by_name text,
  certificate_document_id uuid,
  certificate_name text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint titan_equipment_calibration_dates check (expires_on >= calibrated_on)
);

create index if not exists titan_equipment_calibrations_asset_idx
  on public.titan_equipment_calibrations(equipment_asset_id, calibrated_on desc, created_at desc);
create index if not exists titan_equipment_calibrations_expiry_idx
  on public.titan_equipment_calibrations(expires_on, result);

create table if not exists public.titan_dti_job_equipment (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.titan_jobs(id) on delete cascade,
  requirement_code text not null,
  requirement_label text not null,
  equipment_asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  is_required boolean not null default true,
  verification_status text not null default 'Assigned'
    check (verification_status in ('Assigned','Verified','Out of Service')),
  notes text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, requirement_code, equipment_asset_id)
);

create index if not exists titan_dti_job_equipment_job_idx
  on public.titan_dti_job_equipment(job_id, is_required, verification_status);
create index if not exists titan_dti_job_equipment_asset_idx
  on public.titan_dti_job_equipment(equipment_asset_id, job_id);

create or replace function public.set_titan_dti_job_equipment_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;

drop trigger if exists set_titan_dti_job_equipment_updated_at on public.titan_dti_job_equipment;
create trigger set_titan_dti_job_equipment_updated_at
before update on public.titan_dti_job_equipment
for each row execute function public.set_titan_dti_job_equipment_updated_at();

alter table public.titan_equipment_calibrations enable row level security;
alter table public.titan_dti_job_equipment enable row level security;
grant select on public.titan_equipment_calibrations, public.titan_dti_job_equipment to authenticated;

drop policy if exists "titan equipment calibrations read" on public.titan_equipment_calibrations;
create policy "titan equipment calibrations read" on public.titan_equipment_calibrations
for select to authenticated using (public.titan_dti_controls_can_access());

drop policy if exists "titan dti job equipment read" on public.titan_dti_job_equipment;
create policy "titan dti job equipment read" on public.titan_dti_job_equipment
for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_equipment_calibrations is
  'Calibration history and certificate references for equipment master assets.';
comment on table public.titan_dti_job_equipment is
  'OMS-103 equipment assignments and OMS-108 verification state for connected DTI jobs.';

commit;
