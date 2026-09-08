-- Controlled TITAN job-to-service-board connection.
-- Supports preview and atomic connection for true job boards only.

do $$
begin
  if to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_job_links') is null
    or to_regclass('public.titan_job_events') is null then
    raise exception 'Run supabase/titan_connected_job_lifecycle.sql first.';
  end if;

  if to_regclass('public.service_boards') is null
    or to_regclass('public.service_board_columns') is null
    or to_regclass('public.service_board_cards') is null then
    raise exception 'Run supabase/titan_service_line_boards.sql first.';
  end if;
end $$;

create or replace function public.connect_titan_job_to_service_board(
  p_job_id uuid,
  p_preview_only boolean default true,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.titan_jobs%rowtype;
  board public.service_boards%rowtype;
  target_column public.service_board_columns%rowtype;
  existing_link public.titan_job_links%rowtype;
  card public.service_board_cards%rowtype;
  v_board_key text;
  location_label text;
  card_description text;
  card_due_date date;
  actor_id uuid := coalesce(p_actor_id, auth.uid());
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.crm_is_admin() then
    raise exception 'Connected Jobs is currently restricted to Wade.' using errcode = '42501';
  end if;

  select * into job
  from public.titan_jobs
  where id = p_job_id
    and archived_at is null;

  if job.id is null then
    raise exception 'TITAN job was not found.' using errcode = 'P0002';
  end if;

  if public.titan_job_clean_key(job.lifecycle_status) in (
    'complete', 'completed', 'invoiced', 'cancelled', 'canceled', 'void', 'voided'
  ) then
    return jsonb_build_object(
      'ok', false,
      'canConnect', false,
      'reason', 'Completed, invoiced, cancelled, and voided jobs cannot create new operational cards.'
    );
  end if;

  v_board_key := case public.titan_job_clean_key(job.service_line)
    when 'hardbanding' then 'hardbanding'
    when 'hardband' then 'hardbanding'
    when 'hb' then 'hardbanding'
    when 'cdt' then 'cdt'
    when 'tubing' then 'tubing'
    when 'hotshot' then 'hotshot'
    else null
  end;

  if v_board_key is null then
    return jsonb_build_object(
      'ok', false,
      'canConnect', false,
      'reason', case
        when public.titan_job_clean_key(job.service_line) = 'dti'
          then 'DTI jobs must connect to DTI Jobs, not the WTX Operations Board.'
        else 'This service line does not have a supported TITAN job board.'
      end
    );
  end if;

  select * into board
  from public.service_boards
  where service_boards.board_key = v_board_key
    and active = true
  limit 1;

  if board.id is null then
    return jsonb_build_object(
      'ok', false,
      'canConnect', false,
      'reason', 'The destination service-line board is not active.'
    );
  end if;

  -- Serialize connection attempts for the same job to prevent duplicate cards or events.
  perform pg_advisory_xact_lock(hashtextextended(job.id::text, 0));

  select * into existing_link
  from public.titan_job_links
  where job_id = job.id
    and module_key = 'service_boards'
    and record_type = 'service_board_card'
    and archived_at is null
  order by created_at desc
  limit 1;

  if existing_link.id is not null then
    select * into card
    from public.service_board_cards
    where id::text = existing_link.record_id
    limit 1;

    if card.id is not null then
      select * into board
      from public.service_boards
      where id = card.board_id
      limit 1;
    end if;

    return jsonb_build_object(
      'ok', true,
      'canConnect', false,
      'alreadyConnected', true,
      'jobId', job.id,
      'cardId', card.id,
      'boardKey', board.board_key,
      'boardName', board.name,
      'columnName', null,
      'targetHref', '/service-lines/boards/' || board.board_key
    );
  end if;

  select * into target_column
  from public.service_board_columns
  where board_id = board.id
    and active = true
  order by sort_order asc, created_at asc
  limit 1;

  if target_column.id is null then
    return jsonb_build_object(
      'ok', false,
      'canConnect', false,
      'reason', 'The destination board does not have an active entry list.'
    );
  end if;

  location_label := nullif(concat_ws(', ',
    nullif(trim(coalesce(job.location_name, '')), ''),
    nullif(trim(coalesce(job.county, '')), ''),
    nullif(trim(coalesce(job.state, '')), '')
  ), '');

  card_description := nullif(concat_ws(E'\n',
    nullif(trim(coalesce(job.job_type, '')), ''),
    nullif(trim(coalesce(job.job_description, '')), ''),
    case when nullif(trim(coalesce(job.rig_name, '')), '') is not null
      then 'Rig: ' || trim(job.rig_name)
      else null
    end,
    case when nullif(trim(coalesce(job.contact_name, '')), '') is not null
      then 'Contact: ' || trim(job.contact_name)
      else null
    end
  ), '');

  card_due_date := job.scheduled_start::date;

  if coalesce(p_preview_only, true) then
    return jsonb_build_object(
      'ok', true,
      'canConnect', true,
      'alreadyConnected', false,
      'previewOnly', true,
      'jobId', job.id,
      'jobNumber', job.job_number,
      'title', job.title,
      'serviceLine', job.service_line,
      'boardKey', board.board_key,
      'boardName', board.name,
      'columnId', target_column.id,
      'columnName', target_column.title,
      'customerName', coalesce(job.customer_name, job.operator_name),
      'locationName', location_label,
      'dueDate', card_due_date,
      'targetHref', '/service-lines/boards/' || board.board_key
    );
  end if;

  insert into public.service_board_cards (
    board_id,
    column_id,
    title,
    description,
    priority,
    customer_name,
    location_name,
    assigned_to_name,
    due_date,
    sort_order,
    tags,
    source_type,
    source_id,
    created_by,
    updated_by
  )
  select
    board.id,
    target_column.id,
    job.title,
    card_description,
    'Normal',
    coalesce(job.customer_name, job.operator_name),
    location_label,
    job.lead_name,
    card_due_date,
    coalesce((
      select max(existing.sort_order) + 100
      from public.service_board_cards existing
      where existing.column_id = target_column.id
        and existing.archived_at is null
    ), 100),
    array[job.service_line, job.job_number]::text[],
    'titan_job',
    job.id::text,
    actor_id,
    actor_id
  where not exists (
    select 1
    from public.service_board_cards existing
    where existing.board_id = board.id
      and existing.source_type = 'titan_job'
      and existing.source_id = job.id::text
  )
  on conflict do nothing
  returning * into card;

  if card.id is null then
    select * into card
    from public.service_board_cards existing
    where existing.board_id = board.id
      and existing.source_type = 'titan_job'
      and existing.source_id = job.id::text
    limit 1;
  end if;

  if card.id is null then
    raise exception 'TITAN could not create or find the service-board card.';
  end if;

  insert into public.titan_job_links (
    job_id,
    module_key,
    record_type,
    record_id,
    relationship_type,
    is_primary,
    metadata,
    created_by
  ) values (
    job.id,
    'service_boards',
    'service_board_card',
    card.id::text,
    'operational_work',
    true,
    jsonb_build_object(
      'boardId', board.id,
      'boardKey', board.board_key,
      'columnId', target_column.id
    ),
    actor_id
  )
  on conflict (job_id, module_key, record_type, record_id) do update set
    archived_at = null,
    is_primary = true,
    metadata = excluded.metadata,
    updated_at = now();

  insert into public.titan_job_events (
    job_id,
    event_type,
    source_module,
    from_status,
    to_status,
    summary,
    after_value,
    actor_id
  ) values (
    job.id,
    'operational_record_connected',
    'service_boards',
    job.lifecycle_status,
    job.lifecycle_status,
    'Connected job to ' || board.name || ' / ' || target_column.title || '.',
    jsonb_build_object(
      'boardId', board.id,
      'boardKey', board.board_key,
      'columnId', target_column.id,
      'cardId', card.id
    ),
    actor_id
  );

  insert into public.service_board_activity (
    board_id,
    card_id,
    action,
    user_id,
    user_name,
    after_value
  ) values (
    board.id,
    card.id,
    'connected_from_crm',
    actor_id,
    'TITAN CRM',
    jsonb_build_object('jobId', job.id, 'jobNumber', job.job_number)
  );

  return jsonb_build_object(
    'ok', true,
    'canConnect', false,
    'alreadyConnected', false,
    'connected', true,
    'jobId', job.id,
    'jobNumber', job.job_number,
    'cardId', card.id,
    'boardKey', board.board_key,
    'boardName', board.name,
    'columnId', target_column.id,
    'columnName', target_column.title,
    'targetHref', '/service-lines/boards/' || board.board_key
  );
end;
$$;

revoke all on function public.connect_titan_job_to_service_board(uuid, boolean, uuid) from public;
grant execute on function public.connect_titan_job_to_service_board(uuid, boolean, uuid) to authenticated, service_role;

comment on function public.connect_titan_job_to_service_board(uuid, boolean, uuid) is
  'Previews or atomically connects an active canonical TITAN job to a supported service-line job board.';
