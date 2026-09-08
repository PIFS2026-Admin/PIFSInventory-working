-- TITAN connected job lifecycle foundation.
-- Additive only: existing CRM, service-board, field-ticket, and invoice records are unchanged.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.crm_opportunities') is null then
    raise exception 'crm_opportunities is required. Run supabase/titan_crm_foundation.sql first.';
  end if;
end $$;

create sequence if not exists public.titan_job_number_seq start with 1;

create table if not exists public.titan_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  crm_opportunity_id uuid unique references public.crm_opportunities(id) on delete set null,
  source_system text not null default 'titan',
  source_id text,
  title text not null,
  service_line text not null default 'Unassigned',
  lifecycle_status text not null default 'Requested',
  status_changed_at timestamptz not null default now(),
  customer_name text,
  operator_name text,
  rig_name text,
  contact_name text,
  location_name text,
  state text,
  county text,
  salesperson_name text,
  lead_name text,
  job_type text,
  job_description text,
  requested_on date,
  scheduled_start timestamptz,
  source_snapshot jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop index if exists public.titan_jobs_source_unique;
create index if not exists titan_jobs_source_idx
  on public.titan_jobs(source_system, source_id)
  where source_id is not null;

create index if not exists titan_jobs_service_status_idx
  on public.titan_jobs(service_line, lifecycle_status, archived_at);

create index if not exists titan_jobs_customer_idx
  on public.titan_jobs(customer_name, rig_name);

create table if not exists public.titan_job_links (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.titan_jobs(id) on delete cascade,
  module_key text not null,
  record_type text not null,
  record_id text not null,
  relationship_type text not null default 'related',
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, module_key, record_type, record_id)
);

create index if not exists titan_job_links_record_idx
  on public.titan_job_links(module_key, record_type, record_id)
  where archived_at is null;

create table if not exists public.titan_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.titan_jobs(id) on delete cascade,
  event_type text not null,
  source_module text not null,
  from_status text,
  to_status text,
  summary text not null,
  before_value jsonb,
  after_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_job_events_job_idx
  on public.titan_job_events(job_id, created_at desc);

create table if not exists public.titan_job_sync_failures (
  id uuid primary key default gen_random_uuid(),
  crm_opportunity_id uuid,
  error_message text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists titan_job_sync_failures_opportunity_idx
  on public.titan_job_sync_failures(crm_opportunity_id, created_at desc);

create or replace function public.titan_job_clean_key(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function public.titan_job_metadata_field(metadata jsonb, requested_key text)
returns text
language sql
immutable
as $$
  select nullif(trim(entry.value), '')
  from jsonb_each_text(
    case
      when jsonb_typeof(coalesce(metadata->'unmappedFieldValues', '{}'::jsonb)) = 'object'
        then coalesce(metadata->'unmappedFieldValues', '{}'::jsonb)
      else '{}'::jsonb
    end
  ) as entry(key, value)
  where public.titan_job_clean_key(entry.key) = public.titan_job_clean_key(requested_key)
  limit 1;
$$;

create or replace function public.titan_normalize_service_line(value text)
returns text
language sql
immutable
as $$
  select case public.titan_job_clean_key(value)
    when 'dti' then 'DTI'
    when 'dtii' then 'DTI'
    when 'hb' then 'Hardbanding'
    when 'hardband' then 'Hardbanding'
    when 'hardbanding' then 'Hardbanding'
    when 'cdt' then 'CDT'
    when 'casingdrifttally' then 'CDT'
    when 'tubing' then 'Tubing'
    when 'hotshot' then 'Hotshot'
    else coalesce(nullif(trim(value), ''), 'Unassigned')
  end;
$$;

create or replace function public.titan_normalize_job_status(value text)
returns text
language sql
immutable
as $$
  select case
    when public.titan_job_clean_key(value) in ('request', 'requested', 'new') then 'Requested'
    when public.titan_job_clean_key(value) in ('schedule', 'scheduled') then 'Scheduled'
    when public.titan_job_clean_key(value) in ('inprogress', 'active', 'onlocation') then 'In Progress'
    when public.titan_job_clean_key(value) in ('review', 'qcreview', 'waitingonsignature') then 'Review'
    when public.titan_job_clean_key(value) in ('complete', 'completed', 'done') then 'Complete'
    when public.titan_job_clean_key(value) in ('invoice', 'invoiced', 'billed') then 'Invoiced'
    when public.titan_job_clean_key(value) in ('cancel', 'cancelled', 'canceled', 'void', 'voided') then 'Cancelled'
    else coalesce(nullif(trim(value), ''), 'Requested')
  end;
$$;

create or replace function public.titan_try_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  if nullif(trim(value), '') is null then return null; end if;
  return value::date;
exception when others then
  return null;
end;
$$;

create or replace function public.titan_try_timestamptz(value text)
returns timestamptz
language plpgsql
stable
as $$
begin
  if nullif(trim(value), '') is null then return null; end if;
  return value::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.titan_is_job_schedule_opportunity(
  pipeline_name text,
  metadata jsonb
)
returns boolean
language sql
immutable
as $$
  select
    public.titan_job_clean_key(metadata->'monday'->>'boardName') = 'jobschedule'
    or public.titan_job_clean_key(metadata->>'sourceBoard') = 'jobschedule'
    or lower(coalesce(metadata->>'createdInTitan', 'false')) = 'true'
    or public.titan_job_clean_key(pipeline_name) = 'jobschedule';
$$;

create or replace function public.set_titan_job_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(trim(new.job_number), '') is null then
    new.job_number := 'TITAN-JOB-' || lpad(nextval('public.titan_job_number_seq')::text, 6, '0');
  end if;

  new.service_line := public.titan_normalize_service_line(new.service_line);
  new.lifecycle_status := public.titan_normalize_job_status(new.lifecycle_status);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_titan_job_defaults on public.titan_jobs;
create trigger set_titan_job_defaults
before insert or update on public.titan_jobs
for each row execute function public.set_titan_job_defaults();

create or replace function public.set_titan_job_link_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_titan_job_link_updated_at on public.titan_job_links;
create trigger set_titan_job_link_updated_at
before update on public.titan_job_links
for each row execute function public.set_titan_job_link_updated_at();

create or replace function public.sync_crm_opportunity_record_to_titan_job(
  opportunity public.crm_opportunities
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_job public.titan_jobs%rowtype;
  synced_job public.titan_jobs%rowtype;
  metadata jsonb := coalesce(opportunity.metadata, '{}'::jsonb);
  group_name text;
  service_line text;
  customer_name text;
begin
  if not public.titan_is_job_schedule_opportunity(opportunity.pipeline_name, metadata) then
    return null;
  end if;

  select * into previous_job
  from public.titan_jobs
  where crm_opportunity_id = opportunity.id;

  group_name := coalesce(
    nullif(metadata->>'groupName', ''),
    public.titan_job_metadata_field(metadata, 'Status'),
    opportunity.stage,
    'Requested'
  );

  service_line := coalesce(
    public.titan_job_metadata_field(metadata, 'Service Line'),
    nullif(opportunity.pipeline_name, ''),
    'Unassigned'
  );

  customer_name := coalesce(
    public.titan_job_metadata_field(metadata, 'Customer'),
    public.titan_job_metadata_field(metadata, 'Operator')
  );

  insert into public.titan_jobs (
    job_number,
    crm_opportunity_id,
    source_system,
    source_id,
    title,
    service_line,
    lifecycle_status,
    status_changed_at,
    customer_name,
    operator_name,
    rig_name,
    contact_name,
    location_name,
    state,
    county,
    salesperson_name,
    lead_name,
    job_type,
    job_description,
    requested_on,
    scheduled_start,
    source_snapshot,
    created_by,
    updated_by
  ) values (
    coalesce(previous_job.job_number, ''),
    opportunity.id,
    coalesce(nullif(opportunity.source_system, ''), 'titan'),
    coalesce(nullif(opportunity.external_id, ''), opportunity.id::text),
    opportunity.opportunity_name,
    service_line,
    group_name,
    case
      when previous_job.id is null
        or previous_job.lifecycle_status is distinct from public.titan_normalize_job_status(group_name)
      then now()
      else previous_job.status_changed_at
    end,
    customer_name,
    public.titan_job_metadata_field(metadata, 'Operator'),
    public.titan_job_metadata_field(metadata, 'Rig'),
    public.titan_job_metadata_field(metadata, 'Contacts'),
    public.titan_job_metadata_field(metadata, 'Location'),
    public.titan_job_metadata_field(metadata, 'State'),
    public.titan_job_metadata_field(metadata, 'County'),
    public.titan_job_metadata_field(metadata, 'Salesperson'),
    public.titan_job_metadata_field(metadata, 'Lead'),
    public.titan_job_metadata_field(metadata, 'Job Type'),
    coalesce(
      public.titan_job_metadata_field(metadata, 'Job Description'),
      public.titan_job_metadata_field(metadata, 'Description')
    ),
    public.titan_try_date(public.titan_job_metadata_field(metadata, 'Date Requested')),
    public.titan_try_timestamptz(public.titan_job_metadata_field(metadata, 'Job Date/Time')),
    metadata,
    opportunity.created_by,
    opportunity.created_by
  )
  on conflict (crm_opportunity_id) do update set
    source_system = excluded.source_system,
    source_id = excluded.source_id,
    title = excluded.title,
    service_line = excluded.service_line,
    lifecycle_status = excluded.lifecycle_status,
    status_changed_at = excluded.status_changed_at,
    customer_name = excluded.customer_name,
    operator_name = excluded.operator_name,
    rig_name = excluded.rig_name,
    contact_name = excluded.contact_name,
    location_name = excluded.location_name,
    state = excluded.state,
    county = excluded.county,
    salesperson_name = excluded.salesperson_name,
    lead_name = excluded.lead_name,
    job_type = excluded.job_type,
    job_description = excluded.job_description,
    requested_on = excluded.requested_on,
    scheduled_start = excluded.scheduled_start,
    source_snapshot = excluded.source_snapshot,
    updated_by = excluded.updated_by
  returning * into synced_job;

  if previous_job.id is null then
    insert into public.titan_job_events (
      job_id, event_type, source_module, to_status, summary, after_value, actor_id
    ) values (
      synced_job.id,
      'job_connected',
      'crm',
      synced_job.lifecycle_status,
      'Connected CRM Job Schedule record to the TITAN job lifecycle.',
      to_jsonb(synced_job),
      opportunity.created_by
    );
  elsif previous_job.lifecycle_status is distinct from synced_job.lifecycle_status then
    insert into public.titan_job_events (
      job_id, event_type, source_module, from_status, to_status, summary,
      before_value, after_value, actor_id
    ) values (
      synced_job.id,
      'status_changed',
      'crm',
      previous_job.lifecycle_status,
      synced_job.lifecycle_status,
      'CRM Job Schedule status changed.',
      to_jsonb(previous_job),
      to_jsonb(synced_job),
      opportunity.created_by
    );
  elsif (
    previous_job.title,
    previous_job.service_line,
    previous_job.customer_name,
    previous_job.rig_name,
    previous_job.scheduled_start
  ) is distinct from (
    synced_job.title,
    synced_job.service_line,
    synced_job.customer_name,
    synced_job.rig_name,
    synced_job.scheduled_start
  ) then
    insert into public.titan_job_events (
      job_id, event_type, source_module, from_status, to_status, summary,
      before_value, after_value, actor_id
    ) values (
      synced_job.id,
      'job_updated',
      'crm',
      previous_job.lifecycle_status,
      synced_job.lifecycle_status,
      'CRM Job Schedule details changed.',
      to_jsonb(previous_job),
      to_jsonb(synced_job),
      opportunity.created_by
    );
  end if;

  return synced_job.id;
end;
$$;

revoke all on function public.sync_crm_opportunity_record_to_titan_job(public.crm_opportunities) from public;

create or replace function public.sync_crm_opportunity_to_titan_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_crm_opportunity_record_to_titan_job(new);
  return new;
exception when others then
  begin
    insert into public.titan_job_sync_failures (
      crm_opportunity_id,
      error_message,
      source_snapshot
    ) values (
      new.id,
      sqlerrm,
      jsonb_build_object(
        'opportunity_name', new.opportunity_name,
        'pipeline_name', new.pipeline_name,
        'stage', new.stage,
        'status', new.status,
        'external_id', new.external_id,
        'metadata', coalesce(new.metadata, '{}'::jsonb)
      )
    );
  exception when others then
    raise warning 'TITAN job lifecycle sync failed and could not be logged: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists sync_crm_opportunity_to_titan_job on public.crm_opportunities;
create trigger sync_crm_opportunity_to_titan_job
after insert or update of opportunity_name, pipeline_name, stage, status, external_id, metadata
on public.crm_opportunities
for each row execute function public.sync_crm_opportunity_to_titan_job();

-- Backfill only records that can be positively identified as Job Schedule jobs.
-- Existing CRM rows are read but never updated by this migration.
do $$
declare
  opportunity public.crm_opportunities%rowtype;
begin
  for opportunity in
    select *
    from public.crm_opportunities candidate
    where public.titan_is_job_schedule_opportunity(
      candidate.pipeline_name,
      coalesce(candidate.metadata, '{}'::jsonb)
    )
  loop
    begin
      perform public.sync_crm_opportunity_record_to_titan_job(opportunity);
    exception when others then
      insert into public.titan_job_sync_failures (
        crm_opportunity_id,
        error_message,
        source_snapshot
      ) values (
        opportunity.id,
        sqlerrm,
        jsonb_build_object(
          'opportunity_name', opportunity.opportunity_name,
          'pipeline_name', opportunity.pipeline_name,
          'stage', opportunity.stage,
          'status', opportunity.status,
          'external_id', opportunity.external_id,
          'metadata', coalesce(opportunity.metadata, '{}'::jsonb)
        )
      );
    end;
  end loop;
end $$;

alter table public.titan_jobs enable row level security;
alter table public.titan_job_links enable row level security;
alter table public.titan_job_events enable row level security;
alter table public.titan_job_sync_failures enable row level security;

grant select, insert, update on public.titan_jobs to authenticated;
grant select, insert, update on public.titan_job_links to authenticated;
grant select, insert on public.titan_job_events to authenticated;
grant select on public.titan_job_sync_failures to authenticated;
grant usage, select on sequence public.titan_job_number_seq to authenticated;

drop policy if exists "titan jobs crm access read" on public.titan_jobs;
create policy "titan jobs crm access read"
on public.titan_jobs for select to authenticated
using (public.crm_can_access());

drop policy if exists "titan jobs crm access insert" on public.titan_jobs;
create policy "titan jobs crm access insert"
on public.titan_jobs for insert to authenticated
with check (public.crm_can_access());

drop policy if exists "titan jobs crm access update" on public.titan_jobs;
create policy "titan jobs crm access update"
on public.titan_jobs for update to authenticated
using (public.crm_can_access())
with check (public.crm_can_access());

drop policy if exists "titan job links crm access read" on public.titan_job_links;
create policy "titan job links crm access read"
on public.titan_job_links for select to authenticated
using (public.crm_can_access());

drop policy if exists "titan job links crm access insert" on public.titan_job_links;
create policy "titan job links crm access insert"
on public.titan_job_links for insert to authenticated
with check (public.crm_can_access());

drop policy if exists "titan job links crm access update" on public.titan_job_links;
create policy "titan job links crm access update"
on public.titan_job_links for update to authenticated
using (public.crm_can_access())
with check (public.crm_can_access());

drop policy if exists "titan job events crm access read" on public.titan_job_events;
create policy "titan job events crm access read"
on public.titan_job_events for select to authenticated
using (public.crm_can_access());

drop policy if exists "titan job events crm access insert" on public.titan_job_events;
create policy "titan job events crm access insert"
on public.titan_job_events for insert to authenticated
with check (public.crm_can_access());

drop policy if exists "titan job sync failures admin read" on public.titan_job_sync_failures;
create policy "titan job sync failures admin read"
on public.titan_job_sync_failures for select to authenticated
using (public.crm_is_admin());

create or replace view public.titan_job_lifecycle_overview
with (security_invoker = true)
as
select
  job.*,
  coalesce(link_totals.link_count, 0)::integer as linked_record_count,
  latest_event.event_type as latest_event_type,
  latest_event.summary as latest_event_summary,
  latest_event.created_at as latest_event_at
from public.titan_jobs job
left join lateral (
  select count(*) as link_count
  from public.titan_job_links link
  where link.job_id = job.id
    and link.archived_at is null
) link_totals on true
left join lateral (
  select event.event_type, event.summary, event.created_at
  from public.titan_job_events event
  where event.job_id = job.id
  order by event.created_at desc
  limit 1
) latest_event on true;

grant select on public.titan_job_lifecycle_overview to authenticated;

comment on table public.titan_jobs is
  'Canonical TITAN job identity. Existing module records connect through titan_job_links.';
comment on table public.titan_job_links is
  'Non-destructive links between a canonical TITAN job and records in operational modules.';
comment on table public.titan_job_events is
  'Append-only lifecycle history for connected TITAN jobs.';
comment on table public.titan_job_sync_failures is
  'Isolated CRM-to-job sync failures. A failure never blocks the original CRM write.';
