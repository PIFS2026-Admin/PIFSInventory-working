begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_job_links') is null
    or to_regclass('public.service_boards') is null
    or to_regclass('public.service_board_columns') is null
    or to_regclass('public.service_board_cards') is null
    or to_regprocedure('public.sync_titan_job_operational_status(uuid,text,text,text,text,uuid,jsonb)') is null then
    raise exception 'Install the connected-job, status-sync, and service-board migrations first.';
  end if;
end $$;

create or replace function public.ensure_titan_dti_operations_lane(
  p_job_id uuid,
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
  lane public.service_board_columns%rowtype;
  lane_key text;
  lane_title text;
  lane_description text;
  contractor_name text;
  scheduled_label text;
  next_sort integer;
begin
  select * into job
  from public.titan_jobs
  where id = p_job_id
    and archived_at is null
  for update;

  if job.id is null then
    raise exception 'The connected TITAN job was not found.';
  end if;

  if lower(trim(coalesce(job.service_line, ''))) <> 'dti' then
    return jsonb_build_object('ok', false, 'created', false, 'reason', 'Only DTI jobs create DTI Operations Board lanes.');
  end if;

  select * into board
  from public.service_boards
  where board_key = 'dti'
    and active = true
  limit 1;

  if board.id is null then
    raise exception 'The DTI Operations Board is not active.';
  end if;

  lane_key := 'titan_job_' || replace(job.id::text, '-', '');
  contractor_name := nullif(trim(coalesce(job.source_snapshot->'unmappedFieldValues'->>'Contractor', '')), '');
  scheduled_label := case
    when job.scheduled_start is null then null
    else to_char(job.scheduled_start at time zone 'America/Chicago', 'Mon FMDD, FMHH12:MI AM')
  end;
  lane_title := concat_ws(' - ',
    coalesce(contractor_name, nullif(trim(coalesce(job.operator_name, '')), ''), nullif(trim(coalesce(job.customer_name, '')), ''), job.title),
    nullif(trim(coalesce(job.rig_name, '')), ''),
    scheduled_label
  );
  lane_description := concat_ws(E'\n',
    job.job_number || ' - ' || job.title,
    case when nullif(trim(coalesce(job.operator_name, '')), '') is not null then 'Operator: ' || trim(job.operator_name) end,
    case when contractor_name is not null then 'Contractor: ' || contractor_name end,
    case when nullif(trim(coalesce(job.job_type, '')), '') is not null then 'Job type: ' || trim(job.job_type) end
  );

  select * into lane
  from public.service_board_columns
  where board_id = board.id
    and column_key = lane_key
  limit 1;

  if lane.id is null then
    select coalesce(max(sort_order), 0) + 100 into next_sort
    from public.service_board_columns
    where board_id = board.id
      and active = true;

    insert into public.service_board_columns (
      board_id, column_key, title, description, color, sort_order, due_date, active
    ) values (
      board.id, lane_key, lane_title, lane_description, '#ef4444', next_sort, (job.scheduled_start at time zone 'America/Chicago')::date, true
    )
    returning * into lane;
  else
    update public.service_board_columns
    set title = lane_title,
        description = lane_description,
        due_date = (job.scheduled_start at time zone 'America/Chicago')::date,
        active = true
    where id = lane.id
    returning * into lane;
  end if;

  insert into public.titan_job_links (
    job_id, module_key, record_type, record_id, relationship_type, is_primary, metadata, created_by
  ) values (
    job.id,
    'service_boards',
    'service_board_lane',
    lane.id::text,
    'operations_lane',
    true,
    jsonb_build_object('boardKey', board.board_key, 'columnKey', lane.column_key),
    p_actor_id
  )
  on conflict (job_id, module_key, record_type, record_id) do update set
    archived_at = null,
    is_primary = true,
    metadata = excluded.metadata,
    updated_at = now();

  insert into public.service_board_activity (
    board_id, card_id, action, user_id, user_name, before_value, after_value
  ) values (
    board.id,
    null,
    'connected_job_lane_ready',
    p_actor_id,
    'TITAN Job Schedule',
    null,
    jsonb_build_object('jobId', job.id, 'jobNumber', job.job_number, 'laneId', lane.id, 'title', lane.title)
  );

  return jsonb_build_object(
    'ok', true,
    'created', true,
    'jobId', job.id,
    'jobNumber', job.job_number,
    'laneId', lane.id,
    'laneTitle', lane.title,
    'targetHref', '/service-lines/boards/dti'
  );
end;
$$;

create or replace function public.complete_titan_dti_operations_lane(
  p_lane_id uuid,
  p_actor_id uuid default null,
  p_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lane public.service_board_columns%rowtype;
  board public.service_boards%rowtype;
  bullpen public.service_board_columns%rowtype;
  job public.titan_jobs%rowtype;
  moved_cards integer := 0;
  bullpen_sort integer := 0;
begin
  select target_lane.* into lane
  from public.service_board_columns target_lane
  join public.service_boards target_board on target_board.id = target_lane.board_id
  where target_lane.id = p_lane_id
    and target_lane.active = true
    and target_board.board_key = 'dti'
  for update of target_lane;

  if lane.id is null then
    raise exception 'The active DTI job lane was not found.';
  end if;

  select * into board
  from public.service_boards
  where id = lane.board_id;

  select target_job.* into job
  from public.titan_job_links link
  join public.titan_jobs target_job on target_job.id = link.job_id
  where link.module_key = 'service_boards'
    and link.record_type = 'service_board_lane'
    and link.record_id = lane.id::text
    and link.archived_at is null
    and target_job.archived_at is null
  limit 1
  for update of target_job;

  if job.id is null then
    raise exception 'This lane is not connected to an active TITAN job.';
  end if;

  select * into bullpen
  from public.service_board_columns
  where board_id = board.id
    and active = true
    and (lower(trim(title)) = 'bullpen' or lower(column_key) like '%bullpen%')
  order by case when lower(trim(title)) = 'bullpen' then 0 else 1 end, sort_order
  limit 1;

  if bullpen.id is null then
    raise exception 'The Bullpen lane is required before this job can be completed.';
  end if;

  select coalesce(max(sort_order), 0) into bullpen_sort
  from public.service_board_cards
  where column_id = bullpen.id
    and archived_at is null;

  with moving_cards as (
    select id, row_number() over (order by sort_order, created_at, id) as row_position
    from public.service_board_cards
    where column_id = lane.id
      and archived_at is null
  )
  update public.service_board_cards card
  set column_id = bullpen.id,
      sort_order = bullpen_sort + moving_cards.row_position * 100,
      updated_by = coalesce(p_actor_id, card.updated_by)
  from moving_cards
  where card.id = moving_cards.id;

  get diagnostics moved_cards = row_count;

  perform public.sync_titan_job_operational_status(
    job.id,
    'Complete',
    'service_boards',
    lane.id::text,
    'Completed the DTI Operations Board lane and returned its cards to Bullpen.',
    p_actor_id,
    jsonb_build_object('laneId', lane.id, 'laneTitle', lane.title, 'bullpenLaneId', bullpen.id, 'movedCards', moved_cards)
  );

  update public.titan_jobs
  set archived_at = now(),
      updated_by = coalesce(p_actor_id, updated_by)
  where id = job.id;

  update public.service_board_columns
  set active = false
  where id = lane.id;

  update public.titan_job_links
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'completedAt', now(),
        'cardsMovedToBullpen', moved_cards,
        'bullpenLaneId', bullpen.id
      ),
      updated_at = now()
  where job_id = job.id
    and module_key = 'service_boards'
    and record_type = 'service_board_lane'
    and record_id = lane.id::text;

  insert into public.service_board_activity (
    board_id, card_id, action, user_id, user_name, before_value, after_value
  ) values (
    board.id,
    null,
    'completed_job_lane',
    p_actor_id,
    coalesce(nullif(trim(p_actor_name), ''), 'TITAN user'),
    jsonb_build_object('laneId', lane.id, 'title', lane.title, 'cards', moved_cards, 'active', true),
    jsonb_build_object('jobId', job.id, 'jobNumber', job.job_number, 'bullpenLaneId', bullpen.id, 'cardsMoved', moved_cards, 'active', false)
  );

  return jsonb_build_object(
    'ok', true,
    'jobId', job.id,
    'jobNumber', job.job_number,
    'laneId', lane.id,
    'laneTitle', lane.title,
    'cardsMoved', moved_cards,
    'bullpenLaneId', bullpen.id,
    'archived', true
  );
end;
$$;

revoke all on function public.ensure_titan_dti_operations_lane(uuid, uuid) from public;
revoke all on function public.complete_titan_dti_operations_lane(uuid, uuid, text) from public;
grant execute on function public.ensure_titan_dti_operations_lane(uuid, uuid) to service_role;
grant execute on function public.complete_titan_dti_operations_lane(uuid, uuid, text) to service_role;

comment on function public.ensure_titan_dti_operations_lane(uuid, uuid) is
  'Creates or restores the one DTI Operations Board lane connected to a scheduled DTI job.';
comment on function public.complete_titan_dti_operations_lane(uuid, uuid, text) is
  'Completes and archives a connected DTI job, moves active lane cards to Bullpen, and deactivates the empty lane.';

commit;
