-- Keep explicitly connected operational records aligned with the canonical TITAN job
-- and its CRM Job Schedule row. This migration never creates or moves board cards.
-- Safe to rerun after the connected-job, board-connection, and DTI-connection migrations.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_job_events') is null
    or to_regclass('public.crm_opportunities') is null
    or to_regclass('public.service_board_cards') is null
    or to_regclass('public.service_board_columns') is null
    or to_regclass('public.service_boards') is null
    or to_regclass('public.dti_jobs') is null then
    raise exception 'Install the TITAN connected-job, service-board, and DTI connection migrations first.';
  end if;
end $$;

create table if not exists public.titan_job_status_sync_failures (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.titan_jobs(id) on delete set null,
  source_module text not null,
  source_record_id text,
  error_message text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists titan_job_status_sync_failures_created_idx
  on public.titan_job_status_sync_failures(created_at desc);

create index if not exists titan_job_status_sync_failures_job_idx
  on public.titan_job_status_sync_failures(job_id, created_at desc);

alter table public.titan_job_status_sync_failures enable row level security;
grant select on public.titan_job_status_sync_failures to authenticated;

drop policy if exists "titan job status failures admin read" on public.titan_job_status_sync_failures;
create policy "titan job status failures admin read"
on public.titan_job_status_sync_failures for select to authenticated
using (public.crm_can_access());

create or replace function public.titan_board_column_lifecycle_status(
  p_board_key text,
  p_column_key text,
  p_column_title text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  board_key text := public.titan_job_clean_key(p_board_key);
  column_key text := public.titan_job_clean_key(p_column_key);
  column_title text := public.titan_job_clean_key(p_column_title);
begin
  if board_key = 'tubing' then
    if column_title like 'completed%' then
      return 'Complete';
    elsif column_title like '%needsinvoice%' or column_title like '%sendtocustomer%' then
      return 'Review';
    elsif column_title like '%incomingjob%' then
      return 'Requested';
    elsif column_title like 'queuefor%' then
      return 'Scheduled';
    elsif column_title like '%inprogress%'
      or column_title like '%onhold%'
      or column_title like '%verification%'
      or column_title like '%afterinspectionrepair%' then
      return 'In Progress';
    end if;
  end if;

  if column_key in ('requested', 'request', 'new', 'incoming')
    or column_title in ('requested', 'request', 'new', 'incoming') then
    return 'Requested';
  elsif column_key in ('scheduled', 'schedule', 'queued', 'queue', 'ready')
    or column_title in ('scheduled', 'schedule', 'queued', 'queue', 'ready') then
    return 'Scheduled';
  elsif column_key in ('inprogress', 'active', 'onlocation', 'working')
    or column_title in ('inprogress', 'active', 'onlocation', 'working') then
    return 'In Progress';
  elsif column_key in ('review', 'qcreview', 'waitingonsignature')
    or column_title in ('review', 'qcreview', 'waitingonsignature') then
    return 'Review';
  elsif column_key in ('complete', 'completed', 'done')
    or column_title in ('complete', 'completed', 'done') then
    return 'Complete';
  elsif column_key in ('invoiced', 'billed')
    or column_title in ('invoiced', 'billed') then
    return 'Invoiced';
  elsif column_key in ('cancelled', 'canceled', 'void', 'voided')
    or column_title in ('cancelled', 'canceled', 'void', 'voided') then
    return 'Cancelled';
  end if;

  return null;
end;
$$;

create or replace function public.titan_dti_lifecycle_status(p_status text)
returns text
language sql
immutable
as $$
  select case public.titan_job_clean_key(p_status)
    when 'open' then 'Requested'
    when 'inprogress' then 'In Progress'
    when 'review' then 'Review'
    when 'closed' then 'Complete'
    when 'complete' then 'Complete'
    when 'completed' then 'Complete'
    when 'cancelled' then 'Cancelled'
    when 'canceled' then 'Cancelled'
    else null
  end;
$$;

-- Preserve the existing CRM-to-canonical trigger while allowing the controlled
-- operational sync below to update CRM without echoing back through that trigger.
create or replace function public.sync_crm_opportunity_to_titan_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.titan_status_sync_in_progress', true), '') = 'on' then
    return new;
  end if;

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

create or replace function public.sync_titan_job_operational_status(
  p_job_id uuid,
  p_lifecycle_status text,
  p_source_module text,
  p_source_record_id text,
  p_summary text,
  p_actor_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_job public.titan_jobs%rowtype;
  synced_job public.titan_jobs%rowtype;
  normalized_status text;
  crm_status text;
  crm_metadata jsonb;
begin
  if p_job_id is null or nullif(trim(coalesce(p_lifecycle_status, '')), '') is null then
    return false;
  end if;

  normalized_status := public.titan_normalize_job_status(p_lifecycle_status);

  if normalized_status not in (
    'Requested', 'Scheduled', 'In Progress', 'Review', 'Complete', 'Invoiced', 'Cancelled'
  ) then
    raise exception 'Unsupported TITAN lifecycle status: %', normalized_status;
  end if;

  select * into previous_job
  from public.titan_jobs
  where id = p_job_id
    and archived_at is null
  for update;

  if previous_job.id is null then
    raise exception 'Connected TITAN job % was not found.', p_job_id;
  end if;

  if previous_job.lifecycle_status = normalized_status then
    return false;
  end if;

  update public.titan_jobs
  set lifecycle_status = normalized_status,
      status_changed_at = now(),
      updated_by = coalesce(p_actor_id, auth.uid(), updated_by)
  where id = previous_job.id
  returning * into synced_job;

  if synced_job.crm_opportunity_id is not null then
    select coalesce(metadata, '{}'::jsonb)
    into crm_metadata
    from public.crm_opportunities
    where id = synced_job.crm_opportunity_id;

    crm_metadata := jsonb_set(
      coalesce(crm_metadata, '{}'::jsonb),
      '{groupName}',
      to_jsonb(normalized_status),
      true
    );
    crm_metadata := jsonb_set(
      crm_metadata,
      '{unmappedFieldValues}',
      case
        when jsonb_typeof(crm_metadata->'unmappedFieldValues') = 'object'
          then (crm_metadata->'unmappedFieldValues') || jsonb_build_object('Status', normalized_status)
        else jsonb_build_object('Status', normalized_status)
      end,
      true
    );

    crm_status := case
      when normalized_status in ('Complete', 'Invoiced') then 'Won'
      when normalized_status = 'Cancelled' then 'Cancelled'
      else 'Open'
    end;

    perform set_config('app.titan_status_sync_in_progress', 'on', true);

    update public.crm_opportunities
    set stage = normalized_status,
        status = crm_status,
        metadata = crm_metadata,
        updated_at = now()
    where id = synced_job.crm_opportunity_id;

    perform set_config('app.titan_status_sync_in_progress', 'off', true);
  end if;

  insert into public.titan_job_events (
    job_id,
    event_type,
    source_module,
    from_status,
    to_status,
    summary,
    before_value,
    after_value,
    actor_id
  ) values (
    synced_job.id,
    'status_changed',
    coalesce(nullif(trim(p_source_module), ''), 'operations'),
    previous_job.lifecycle_status,
    synced_job.lifecycle_status,
    coalesce(nullif(trim(p_summary), ''), 'Connected job status changed.'),
    jsonb_build_object(
      'job', to_jsonb(previous_job),
      'sourceRecordId', p_source_record_id,
      'details', coalesce(p_details, '{}'::jsonb)
    ),
    jsonb_build_object(
      'job', to_jsonb(synced_job),
      'sourceRecordId', p_source_record_id,
      'details', coalesce(p_details, '{}'::jsonb)
    ),
    coalesce(p_actor_id, auth.uid())
  );

  return true;
exception when others then
  perform set_config('app.titan_status_sync_in_progress', 'off', true);
  raise;
end;
$$;

revoke all on function public.sync_titan_job_operational_status(uuid, text, text, text, text, uuid, jsonb) from public;

create or replace function public.sync_connected_service_board_card_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job_id uuid;
  board_key text;
  column_key text;
  column_title text;
  lifecycle_status text;
begin
  if new.column_id is not distinct from old.column_id
    or coalesce(new.source_type, '') <> 'titan_job'
    or coalesce(new.source_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;

  target_job_id := new.source_id::uuid;

  select board.board_key, target_column.column_key, target_column.title
  into board_key, column_key, column_title
  from public.service_board_columns target_column
  join public.service_boards board on board.id = target_column.board_id
  where target_column.id = new.column_id
    and target_column.board_id = new.board_id;

  lifecycle_status := public.titan_board_column_lifecycle_status(
    board_key,
    column_key,
    column_title
  );

  if lifecycle_status is null then
    return new;
  end if;

  perform public.sync_titan_job_operational_status(
    target_job_id,
    lifecycle_status,
    'service_boards',
    new.id::text,
    'Moved connected job to ' || column_title || ' on the ' || board_key || ' board.',
    new.updated_by,
    jsonb_build_object(
      'boardKey', board_key,
      'columnKey', column_key,
      'columnTitle', column_title,
      'cardNumber', new.card_number
    )
  );

  return new;
exception when others then
  begin
    insert into public.titan_job_status_sync_failures (
      job_id,
      source_module,
      source_record_id,
      error_message,
      source_snapshot
    ) values (
      target_job_id,
      'service_boards',
      new.id::text,
      sqlerrm,
      jsonb_build_object(
        'cardId', new.id,
        'boardId', new.board_id,
        'columnId', new.column_id,
        'sourceType', new.source_type,
        'sourceId', new.source_id
      )
    );
  exception when others then
    raise warning 'Connected board status sync failed and could not be logged: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists sync_connected_service_board_card_status on public.service_board_cards;
create trigger sync_connected_service_board_card_status
after update of column_id on public.service_board_cards
for each row execute function public.sync_connected_service_board_card_status();

create or replace function public.sync_connected_dti_job_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lifecycle_status text;
begin
  if new.status is not distinct from old.status or new.titan_job_id is null then
    return new;
  end if;

  lifecycle_status := public.titan_dti_lifecycle_status(new.status);
  if lifecycle_status is null then
    return new;
  end if;

  perform public.sync_titan_job_operational_status(
    new.titan_job_id,
    lifecycle_status,
    'dti',
    new.id::text,
    'DTI job status changed to ' || new.status || '.',
    coalesce(new.closed_by, new.created_by),
    jsonb_build_object(
      'dtiJobId', new.id,
      'dtiJobNumber', new.job_number,
      'dtiStatus', new.status
    )
  );

  return new;
exception when others then
  begin
    insert into public.titan_job_status_sync_failures (
      job_id,
      source_module,
      source_record_id,
      error_message,
      source_snapshot
    ) values (
      new.titan_job_id,
      'dti',
      new.id::text,
      sqlerrm,
      jsonb_build_object(
        'dtiJobId', new.id,
        'dtiJobNumber', new.job_number,
        'status', new.status
      )
    );
  exception when others then
    raise warning 'Connected DTI status sync failed and could not be logged: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists sync_connected_dti_job_status on public.dti_jobs;
create trigger sync_connected_dti_job_status
after update of status on public.dti_jobs
for each row execute function public.sync_connected_dti_job_status();

comment on function public.titan_board_column_lifecycle_status(text, text, text) is
  'Maps operational board lanes to canonical lifecycle statuses without moving cards.';

comment on function public.sync_titan_job_operational_status(uuid, text, text, text, text, uuid, jsonb) is
  'Updates a connected canonical job and CRM Job Schedule status and writes one audit event.';

commit;
