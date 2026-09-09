-- OMS-107 connection identification and refacing evidence for DTI execution.

begin;
do $$ begin
  if to_regclass('public.titan_dti_job_runs') is null or to_regclass('public.titan_job_documents') is null
    or to_regclass('public.titan_dti_tubular_specs') is null or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run DTI Job Execution, Job Documents, Tubular Specifications, and DTI Controls migrations first.';
  end if;
end $$;

create sequence if not exists public.titan_dti_reface_record_number_seq;
create table if not exists public.titan_dti_connection_refacing (
  id uuid primary key default gen_random_uuid(),
  record_number text not null unique default '',
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  job_run_id uuid not null references public.titan_dti_job_runs(id) on delete restrict,
  rack_run_id uuid references public.titan_dti_rack_runs(id) on delete set null,
  tubular_spec_id uuid not null references public.titan_dti_tubular_specs(id) on delete restrict,
  joint_ids text not null,
  quantity integer not null default 1 check (quantity > 0),
  component_end text not null check (component_end in ('Pin','Box','Both')),
  connection_type text not null check (connection_type in ('API','Double-Shoulder','Proprietary')),
  identification_basis text not null,
  manufacturer_drawing_document_id uuid references public.titan_job_documents(id) on delete set null,
  condition text not null,
  route text not null check (route in ('Field Reface','Machine Shop','Reject')),
  method text not null check (method in ('Sandpaper - API','Sandpaper - DS / Proprietary','Samss Lathe','No Field Reface')),
  removal_inches numeric(8,4) check (removal_inches is null or removal_inches >= 0),
  pin_benchmark_to_seal_inches numeric(8,4) check (pin_benchmark_to_seal_inches is null or pin_benchmark_to_seal_inches >= 0),
  box_benchmark_inches numeric(8,4) check (box_benchmark_inches is null or box_benchmark_inches >= 0),
  post_reface_bevel_inches numeric(8,4) check (post_reface_bevel_inches is null or post_reface_bevel_inches >= 0),
  squareness_verified boolean not null default false,
  copper_sulfate_verified boolean not null default false,
  samss_trained_operator boolean not null default false,
  operator_name text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint titan_dti_reface_drawing_required check (connection_type = 'API' or manufacturer_drawing_document_id is not null),
  constraint titan_dti_reface_samss_training check (method <> 'Samss Lathe' or samss_trained_operator),
  constraint titan_dti_reface_field_verification check (route <> 'Field Reface' or (squareness_verified and copper_sulfate_verified)),
  constraint titan_dti_reface_ds_removal_limit check (route <> 'Field Reface' or connection_type = 'API' or removal_inches is null or removal_inches <= 0.0625)
);
create index if not exists titan_dti_connection_refacing_run_idx on public.titan_dti_connection_refacing(job_run_id, rack_run_id, created_at desc);
create or replace function public.set_titan_dti_reface_record_number()
returns trigger language plpgsql set search_path=public as $$ begin
  if coalesce(new.record_number,'')='' then new.record_number := 'RFX-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.titan_dti_reface_record_number_seq')::text,5,'0'); end if;
  return new;
end; $$;
drop trigger if exists set_titan_dti_reface_record_number on public.titan_dti_connection_refacing;
create trigger set_titan_dti_reface_record_number before insert on public.titan_dti_connection_refacing for each row execute function public.set_titan_dti_reface_record_number();
alter table public.titan_dti_connection_refacing enable row level security;
grant select on public.titan_dti_connection_refacing to authenticated;
drop policy if exists "titan dti connection refacing read" on public.titan_dti_connection_refacing;
create policy "titan dti connection refacing read" on public.titan_dti_connection_refacing for select to authenticated using (public.titan_dti_controls_can_access());
comment on table public.titan_dti_connection_refacing is 'OMS-107 connection identification, routing, field-reface measurements, and verification.';
commit;
