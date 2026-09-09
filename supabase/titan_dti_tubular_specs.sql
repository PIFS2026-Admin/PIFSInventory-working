-- DTI controlled tubular specifications.
-- No dimensional values are seeded. Every row must cite an approved Document Control record.

begin;

do $$
begin
  if to_regclass('public.documents') is null then
    raise exception 'Run the TITAN Document Control SQL first.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'approval_status'
  ) then
    raise exception 'Run supabase/document_control.sql before creating DTI Tubular Specifications.';
  end if;
  if to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run supabase/titan_dti_controls_reassignment.sql first.';
  end if;
end $$;

create table if not exists public.titan_dti_tubular_specs (
  id uuid primary key default gen_random_uuid(),
  pipe_size text not null,
  weight_ppf numeric(8,3) not null check (weight_ppf > 0),
  grade text not null,
  connection text not null,
  new_wall_inches numeric(8,4) check (new_wall_inches is null or new_wall_inches > 0),
  premium_min_wall_inches numeric(8,4) check (premium_min_wall_inches is null or premium_min_wall_inches > 0),
  class_2_min_wall_inches numeric(8,4) check (class_2_min_wall_inches is null or class_2_min_wall_inches > 0),
  tj_od_min_premium_inches numeric(8,4) check (tj_od_min_premium_inches is null or tj_od_min_premium_inches > 0),
  tj_id_max_inches numeric(8,4) check (tj_id_max_inches is null or tj_id_max_inches > 0),
  bevel_diameter_min_inches numeric(8,4) check (bevel_diameter_min_inches is null or bevel_diameter_min_inches > 0),
  bevel_diameter_max_inches numeric(8,4) check (bevel_diameter_max_inches is null or bevel_diameter_max_inches > 0),
  tong_space_min_inches numeric(8,4) check (tong_space_min_inches is null or tong_space_min_inches > 0),
  source_document_id uuid not null references public.documents(id) on delete restrict,
  notes text,
  row_version integer not null default 1,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_dti_tubular_specs_bevel_range check (
    bevel_diameter_min_inches is null
    or bevel_diameter_max_inches is null
    or bevel_diameter_max_inches >= bevel_diameter_min_inches
  )
);

create unique index if not exists titan_dti_tubular_specs_active_identity_uidx
  on public.titan_dti_tubular_specs (
    lower(trim(pipe_size)),
    weight_ppf,
    lower(trim(grade)),
    lower(trim(connection))
  )
  where archived_at is null;

create index if not exists titan_dti_tubular_specs_lookup_idx
  on public.titan_dti_tubular_specs (pipe_size, weight_ppf, grade, connection)
  where archived_at is null;

create table if not exists public.titan_dti_tubular_spec_events (
  id uuid primary key default gen_random_uuid(),
  tubular_spec_id uuid not null references public.titan_dti_tubular_specs(id) on delete restrict,
  event_type text not null check (event_type in ('Created', 'Updated', 'Archived')),
  before_value jsonb,
  after_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_dti_tubular_spec_events_spec_idx
  on public.titan_dti_tubular_spec_events (tubular_spec_id, created_at desc);

create or replace function public.save_titan_dti_tubular_spec(
  p_id uuid,
  p_pipe_size text,
  p_weight_ppf numeric,
  p_grade text,
  p_connection text,
  p_new_wall_inches numeric,
  p_premium_min_wall_inches numeric,
  p_class_2_min_wall_inches numeric,
  p_tj_od_min_premium_inches numeric,
  p_tj_id_max_inches numeric,
  p_bevel_diameter_min_inches numeric,
  p_bevel_diameter_max_inches numeric,
  p_tong_space_min_inches numeric,
  p_source_document_id uuid,
  p_notes text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prior public.titan_dti_tubular_specs%rowtype;
  saved public.titan_dti_tubular_specs%rowtype;
  event_name text;
begin
  if nullif(trim(coalesce(p_pipe_size, '')), '') is null
    or p_weight_ppf is null
    or nullif(trim(coalesce(p_grade, '')), '') is null
    or nullif(trim(coalesce(p_connection, '')), '') is null then
    raise exception 'Pipe size, weight, grade, and connection are required.';
  end if;

  if not exists (
    select 1 from public.documents d
    where d.id = p_source_document_id
      and lower(trim(coalesce(d.approval_status, ''))) = 'approved'
  ) then
    raise exception 'Select an active approved source document.';
  end if;

  if p_id is null then
    insert into public.titan_dti_tubular_specs (
      pipe_size, weight_ppf, grade, connection, new_wall_inches,
      premium_min_wall_inches, class_2_min_wall_inches,
      tj_od_min_premium_inches, tj_id_max_inches,
      bevel_diameter_min_inches, bevel_diameter_max_inches,
      tong_space_min_inches, source_document_id, notes, created_by, updated_by
    ) values (
      trim(p_pipe_size), p_weight_ppf, trim(p_grade), trim(p_connection), p_new_wall_inches,
      p_premium_min_wall_inches, p_class_2_min_wall_inches,
      p_tj_od_min_premium_inches, p_tj_id_max_inches,
      p_bevel_diameter_min_inches, p_bevel_diameter_max_inches,
      p_tong_space_min_inches, p_source_document_id, nullif(trim(coalesce(p_notes, '')), ''), p_actor_id, p_actor_id
    ) returning * into saved;
    event_name := 'Created';
  else
    select * into prior from public.titan_dti_tubular_specs where id = p_id and archived_at is null for update;
    if prior.id is null then raise exception 'The active tubular specification was not found.'; end if;

    update public.titan_dti_tubular_specs set
      pipe_size = trim(p_pipe_size), weight_ppf = p_weight_ppf,
      grade = trim(p_grade), connection = trim(p_connection),
      new_wall_inches = p_new_wall_inches,
      premium_min_wall_inches = p_premium_min_wall_inches,
      class_2_min_wall_inches = p_class_2_min_wall_inches,
      tj_od_min_premium_inches = p_tj_od_min_premium_inches,
      tj_id_max_inches = p_tj_id_max_inches,
      bevel_diameter_min_inches = p_bevel_diameter_min_inches,
      bevel_diameter_max_inches = p_bevel_diameter_max_inches,
      tong_space_min_inches = p_tong_space_min_inches,
      source_document_id = p_source_document_id,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      row_version = row_version + 1, updated_by = p_actor_id, updated_at = now()
    where id = p_id returning * into saved;
    event_name := 'Updated';
  end if;

  insert into public.titan_dti_tubular_spec_events (tubular_spec_id, event_type, before_value, after_value, actor_id)
  values (saved.id, event_name, case when prior.id is null then null else to_jsonb(prior) end, to_jsonb(saved), p_actor_id);

  return jsonb_build_object('ok', true, 'spec', to_jsonb(saved));
end;
$$;

create or replace function public.archive_titan_dti_tubular_spec(p_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prior public.titan_dti_tubular_specs%rowtype;
  saved public.titan_dti_tubular_specs%rowtype;
begin
  select * into prior from public.titan_dti_tubular_specs where id = p_id and archived_at is null for update;
  if prior.id is null then raise exception 'The active tubular specification was not found.'; end if;

  update public.titan_dti_tubular_specs
  set archived_at = now(), archived_by = p_actor_id, updated_by = p_actor_id,
      updated_at = now(), row_version = row_version + 1
  where id = p_id returning * into saved;

  insert into public.titan_dti_tubular_spec_events (tubular_spec_id, event_type, before_value, after_value, actor_id)
  values (saved.id, 'Archived', to_jsonb(prior), to_jsonb(saved), p_actor_id);

  return jsonb_build_object('ok', true, 'spec', to_jsonb(saved));
end;
$$;

revoke all on function public.save_titan_dti_tubular_spec(uuid,text,numeric,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.save_titan_dti_tubular_spec(uuid,text,numeric,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,uuid,text,uuid) to service_role;
revoke all on function public.archive_titan_dti_tubular_spec(uuid,uuid) from public, anon, authenticated;
grant execute on function public.archive_titan_dti_tubular_spec(uuid,uuid) to service_role;

alter table public.titan_dti_tubular_specs enable row level security;
alter table public.titan_dti_tubular_spec_events enable row level security;
grant select on public.titan_dti_tubular_specs, public.titan_dti_tubular_spec_events to authenticated;

drop policy if exists "titan dti tubular specs read" on public.titan_dti_tubular_specs;
create policy "titan dti tubular specs read" on public.titan_dti_tubular_specs
  for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan dti tubular spec events read" on public.titan_dti_tubular_spec_events;
create policy "titan dti tubular spec events read" on public.titan_dti_tubular_spec_events
  for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_dti_tubular_specs is 'Controlled DTI tubular dimensions and acceptance values; every active row cites an approved Document Control record.';
comment on table public.titan_dti_tubular_spec_events is 'Append-only history for controlled DTI tubular specification changes.';

commit;
