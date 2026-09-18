-- One Daily Summary per DTI inspection report, kept current from inspection rows.

begin;

do $$
begin
  if to_regclass('public.dti_daily_summaries') is null then
    raise exception 'Run supabase/dti_daily_summaries.sql first.';
  end if;
  if to_regclass('public.titan_dti_inspection_reports') is null
     or to_regclass('public.titan_dti_inspection_items') is null then
    raise exception 'Run supabase/titan_dti_inspection_reports.sql first.';
  end if;
end $$;

alter table public.dti_daily_summaries
  add column if not exists job_id uuid,
  add column if not exists source_rollup jsonb not null default '{}'::jsonb,
  add column if not exists inspection_report_id uuid,
  add column if not exists damage_torque_shoulder_box integer not null default 0,
  add column if not exists damage_torque_shoulder_pin integer not null default 0,
  add column if not exists pitted_box integer not null default 0,
  add column if not exists pitted_pin integer not null default 0,
  add column if not exists over_refaced_box integer not null default 0,
  add column if not exists over_refaced_pin integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dti_daily_summaries_inspection_report_id_fkey'
  ) then
    alter table public.dti_daily_summaries
      add constraint dti_daily_summaries_inspection_report_id_fkey
      foreign key (inspection_report_id)
      references public.titan_dti_inspection_reports(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists dti_daily_summaries_inspection_report_unique_idx
  on public.dti_daily_summaries(inspection_report_id)
  where inspection_report_id is not null;

create index if not exists dti_daily_summaries_job_idx
  on public.dti_daily_summaries(job_id, summary_date desc);

comment on column public.dti_daily_summaries.inspection_report_id is
  'The DTI inspection report that creates and continuously supplies this Daily Summary.';

create or replace function public.titan_dti_jsonb_marked(p_data jsonb, p_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case jsonb_typeof(coalesce(p_data, '{}'::jsonb) -> p_key)
    when 'boolean' then coalesce((p_data ->> p_key)::boolean, false)
    when 'string' then btrim(coalesce(p_data ->> p_key, '')) <> ''
    else false
  end;
$$;

create or replace function public.sync_titan_dti_inspection_daily_summary(p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.titan_dti_inspection_reports%rowtype;
  v_summary_id uuid;
  v_counts jsonb := '{}'::jsonb;
  v_job_customer text;
  v_job_location text;
  v_job_rig text;
  v_component text;
  v_category text;
  v_inspection_type text;
  v_connection text;
  v_location text;
  v_summary_number text;
begin
  select * into v_report
  from public.titan_dti_inspection_reports
  where id = p_report_id;

  if not found then
    return null;
  end if;

  if v_report.job_id is not null and to_regclass('public.titan_jobs') is not null then
    select customer_name, location_name, rig_name
      into v_job_customer, v_job_location, v_job_rig
    from public.titan_jobs
    where id = v_report.job_id;
  end if;

  v_component := coalesce(nullif(v_report.inspection_scope ->> 'reportComponentType', ''), 'Drill Pipe');
  v_category := nullif(v_report.inspection_scope ->> 'inspectionCategory', '');
  v_inspection_type := concat(
    case when v_component = 'Subs' then 'BHA' else v_component end,
    case
      when v_category is null then ''
      when upper(v_category) = 'HDLS' then ' / HDLS'
      else ' / Category ' || v_category
    end
  );
  v_connection := concat_ws(' / ',
    nullif(v_report.connection_size, ''),
    case
      when nullif(v_report.inspection_scope ->> 'criteriaWeightPpf', '') is null then null
      else (v_report.inspection_scope ->> 'criteriaWeightPpf') || ' lb/ft'
    end,
    nullif(v_report.grade, ''),
    nullif(v_report.connection_type, '')
  );
  v_location := coalesce(
    nullif(v_job_location, ''),
    nullif(v_report.rig_number, ''),
    nullif(v_job_rig, ''),
    nullif(v_report.state, '')
  );

  with row_flags as (
    select
      public.titan_dti_jsonb_marked(row_data, 'damagedSealBox') as damage_seat_box,
      public.titan_dti_jsonb_marked(row_data, 'damagedSealPin') as damage_seat_pin,
      public.titan_dti_jsonb_marked(row_data, 'damagedThreadsBox') as damage_threads_box,
      public.titan_dti_jsonb_marked(row_data, 'damagedThreadsPin') as damage_threads_pin,
      public.titan_dti_jsonb_marked(row_data, 'damagedHardbandBox') as damaged_hardband_box,
      public.titan_dti_jsonb_marked(row_data, 'damagedHardbandPin') as damaged_hardband_pin,
      public.titan_dti_jsonb_marked(row_data, 'bentTube') as bent_tube,
      public.titan_dti_jsonb_marked(row_data, 'otherDamage1') as other_damage_1,
      public.titan_dti_jsonb_marked(row_data, 'otherDamage2') as other_damage_2,
      public.titan_dti_jsonb_marked(row_data, 'otherDamage3') as other_damage_3,
      public.titan_dti_jsonb_marked(row_data, 'otherDamage4') as other_damage_4,
      public.titan_dti_jsonb_marked(row_data, 'minimumTongBox') as min_tong_box,
      public.titan_dti_jsonb_marked(row_data, 'minimumTongPin') as min_tong_pin,
      public.titan_dti_jsonb_marked(row_data, 'minimumSealBox') as tstr_box,
      public.titan_dti_jsonb_marked(row_data, 'minimumSealPin') as tstr_pin,
      public.titan_dti_jsonb_marked(row_data, 'emiReject') as emi,
      public.titan_dti_jsonb_marked(row_data, 'damagedTube') as damaged_tube,
      public.titan_dti_jsonb_marked(row_data, 'minimumWallTube') as min_wall,
      public.titan_dti_jsonb_marked(row_data, 'minimumOd') as minimum_od,
      public.titan_dti_jsonb_marked(row_data, 'dbrHardbandBox') as dbr_hardband_box,
      public.titan_dti_jsonb_marked(row_data, 'dbrHardbandPin') as dbr_hardband_pin,
      public.titan_dti_jsonb_marked(row_data, 'otherReject') as other_reject,
      public.titan_dti_jsonb_marked(row_data, 'boxReface') as reface_box,
      public.titan_dti_jsonb_marked(row_data, 'pinReface') as reface_pin,
      public.titan_dti_jsonb_marked(row_data, 'hardbandBox') as hardband_box,
      public.titan_dti_jsonb_marked(row_data, 'hardbandPin') as hardband_pin,
      public.titan_dti_jsonb_marked(row_data, 'damagedTorqueShoulderBox') as torque_box,
      public.titan_dti_jsonb_marked(row_data, 'damagedTorqueShoulderPin') as torque_pin,
      public.titan_dti_jsonb_marked(row_data, 'pittedBox') as pitted_box,
      public.titan_dti_jsonb_marked(row_data, 'pittedPin') as pitted_pin,
      public.titan_dti_jsonb_marked(row_data, 'overRefacedBox') as over_refaced_box,
      public.titan_dti_jsonb_marked(row_data, 'overRefacedPin') as over_refaced_pin,
      public.titan_dti_jsonb_marked(row_data, 'threadReconditionBox') as thread_recondition_box,
      public.titan_dti_jsonb_marked(row_data, 'threadReconditionPin') as thread_recondition_pin,
      public.titan_dti_jsonb_marked(row_data, 'bevelRepairBox') as bevel_repair_box,
      public.titan_dti_jsonb_marked(row_data, 'bevelRepairPin') as bevel_repair_pin
    from public.titan_dti_inspection_items
    where report_id = p_report_id
  ), totals as (
    select
      count(*)::integer as inspected,
      count(*) filter (where damage_seat_box)::integer as damage_seat_box,
      count(*) filter (where damage_seat_pin)::integer as damage_seat_pin,
      count(*) filter (where damage_threads_box)::integer as damage_threads_box,
      count(*) filter (where damage_threads_pin)::integer as damage_threads_pin,
      count(*) filter (where torque_box)::integer as damage_torque_shoulder_box,
      count(*) filter (where torque_pin)::integer as damage_torque_shoulder_pin,
      count(*) filter (where pitted_box)::integer as pitted_box,
      count(*) filter (where pitted_pin)::integer as pitted_pin,
      count(*) filter (where over_refaced_box)::integer as over_refaced_box,
      count(*) filter (where over_refaced_pin)::integer as over_refaced_pin,
      count(*) filter (where damaged_hardband_box)::integer as damaged_hardband_box,
      count(*) filter (where damaged_hardband_pin)::integer as damaged_hardband_pin,
      count(*) filter (where bent_tube)::integer as bent_tube,
      (count(*) filter (where other_damage_1)
        + count(*) filter (where other_damage_2)
        + count(*) filter (where other_damage_3)
        + count(*) filter (where other_damage_4))::integer as damage_other_quantity,
      count(*) filter (where min_tong_box)::integer as min_tong_box,
      count(*) filter (where min_tong_pin)::integer as min_tong_pin,
      count(*) filter (where tstr_box)::integer as tstr_box,
      count(*) filter (where tstr_pin)::integer as tstr_pin,
      count(*) filter (where emi)::integer as emi,
      count(*) filter (where damaged_tube)::integer as damaged_tube,
      count(*) filter (where min_wall)::integer as min_wall,
      (count(*) filter (where minimum_od)
        + count(*) filter (where dbr_hardband_box)
        + count(*) filter (where dbr_hardband_pin)
        + count(*) filter (where other_reject))::integer as dbr_other_quantity,
      count(*) filter (where reface_box)::integer as reface_box,
      count(*) filter (where reface_pin)::integer as reface_pin,
      count(*) filter (where hardband_box)::integer as hardband_box,
      count(*) filter (where hardband_pin)::integer as hardband_pin,
      count(*) filter (where
        damage_seat_box or damage_seat_pin or damage_threads_box or damage_threads_pin
        or torque_box or torque_pin or pitted_box or pitted_pin
        or over_refaced_box or over_refaced_pin or bent_tube
        or other_damage_1 or other_damage_2 or other_damage_3 or other_damage_4
        or damaged_hardband_box or damaged_hardband_pin
        or thread_recondition_box or thread_recondition_pin or bevel_repair_box or bevel_repair_pin
      )::integer as repair_joints,
      count(*) filter (where
        min_tong_box or min_tong_pin or tstr_box or tstr_pin or emi or damaged_tube
        or min_wall or minimum_od or dbr_hardband_box or dbr_hardband_pin or other_reject
      )::integer as dbr_joints,
      count(*) filter (where hardband_box or hardband_pin)::integer as hb_joints,
      count(*) filter (where damaged_hardband_box or damaged_hardband_pin)::integer as repair_hb_joints
    from row_flags
  )
  select to_jsonb(totals) into v_counts from totals;

  v_summary_number := 'DTI-SUM-' || regexp_replace(v_report.report_number, '^DTI-', '', 'i');

  update public.dti_daily_summaries
  set
    job_id = v_report.job_id,
    operator = v_report.operator_name,
    contractor = coalesce(nullif(v_report.contractor_name, ''), nullif(v_job_customer, '')),
    location = v_location,
    summary_date = v_report.report_date,
    field_invoice = v_report.field_invoice,
    inspection_type = v_inspection_type,
    connection_size_type = nullif(v_connection, ''),
    total_joints_inspected = (v_counts ->> 'inspected')::integer,
    damage_seat_box = (v_counts ->> 'damage_seat_box')::integer,
    damage_seat_pin = (v_counts ->> 'damage_seat_pin')::integer,
    damage_threads_box = (v_counts ->> 'damage_threads_box')::integer,
    damage_threads_pin = (v_counts ->> 'damage_threads_pin')::integer,
    damage_torque_shoulder_box = (v_counts ->> 'damage_torque_shoulder_box')::integer,
    damage_torque_shoulder_pin = (v_counts ->> 'damage_torque_shoulder_pin')::integer,
    pitted_box = (v_counts ->> 'pitted_box')::integer,
    pitted_pin = (v_counts ->> 'pitted_pin')::integer,
    over_refaced_box = (v_counts ->> 'over_refaced_box')::integer,
    over_refaced_pin = (v_counts ->> 'over_refaced_pin')::integer,
    short_box = (v_counts ->> 'damaged_hardband_box')::integer,
    damaged_hardband_box = (v_counts ->> 'damaged_hardband_box')::integer,
    damaged_hardband_pin = (v_counts ->> 'damaged_hardband_pin')::integer,
    bent_tube = (v_counts ->> 'bent_tube')::integer,
    damage_other_quantity = (v_counts ->> 'damage_other_quantity')::integer,
    min_tong_box = (v_counts ->> 'min_tong_box')::integer,
    min_tong_pin = (v_counts ->> 'min_tong_pin')::integer,
    tstr_box = (v_counts ->> 'tstr_box')::integer,
    tstr_pin = (v_counts ->> 'tstr_pin')::integer,
    emi = (v_counts ->> 'emi')::integer,
    damaged_tube = (v_counts ->> 'damaged_tube')::integer,
    min_wall = (v_counts ->> 'min_wall')::integer,
    dbr_other_quantity = (v_counts ->> 'dbr_other_quantity')::integer,
    reface_box = (v_counts ->> 'reface_box')::integer,
    reface_pin = (v_counts ->> 'reface_pin')::integer,
    hardband_box = (v_counts ->> 'hardband_box')::integer,
    hardband_pin = (v_counts ->> 'hardband_pin')::integer,
    repair_joints = (v_counts ->> 'repair_joints')::integer,
    dbr_joints = (v_counts ->> 'dbr_joints')::integer,
    hb_joints = (v_counts ->> 'hb_joints')::integer,
    repair_hb_joints = (v_counts ->> 'repair_hb_joints')::integer,
    total_damages =
      (v_counts ->> 'damage_seat_box')::integer + (v_counts ->> 'damage_seat_pin')::integer
      + (v_counts ->> 'damage_threads_box')::integer + (v_counts ->> 'damage_threads_pin')::integer
      + (v_counts ->> 'damage_torque_shoulder_box')::integer + (v_counts ->> 'damage_torque_shoulder_pin')::integer
      + (v_counts ->> 'pitted_box')::integer + (v_counts ->> 'pitted_pin')::integer
      + (v_counts ->> 'over_refaced_box')::integer + (v_counts ->> 'over_refaced_pin')::integer
      + (v_counts ->> 'damaged_hardband_box')::integer + (v_counts ->> 'damaged_hardband_pin')::integer
      + (v_counts ->> 'bent_tube')::integer + (v_counts ->> 'damage_other_quantity')::integer,
    total_dbr =
      (v_counts ->> 'min_tong_box')::integer + (v_counts ->> 'min_tong_pin')::integer
      + (v_counts ->> 'tstr_box')::integer + (v_counts ->> 'tstr_pin')::integer
      + (v_counts ->> 'emi')::integer + (v_counts ->> 'damaged_tube')::integer
      + (v_counts ->> 'min_wall')::integer + (v_counts ->> 'dbr_other_quantity')::integer,
    total_refaces = (v_counts ->> 'reface_box')::integer + (v_counts ->> 'reface_pin')::integer,
    total_hardbands = (v_counts ->> 'hardband_box')::integer + (v_counts ->> 'hardband_pin')::integer,
    inspected_by = coalesce(nullif(v_report.inspection_crew, ''), inspected_by),
    source_rollup = coalesce(source_rollup, '{}'::jsonb) || jsonb_build_object(
      'source', 'inspection_report',
      'inspectionReportId', v_report.id,
      'inspectionReportNumber', v_report.report_number,
      'componentType', case when v_component = 'Subs' then 'BHA' else v_component end,
      'syncedAt', now()
    ),
    updated_at = now()
  where inspection_report_id = p_report_id
  returning id into v_summary_id;

  if found then
    return v_summary_id;
  end if;

  if exists (
    select 1 from public.dti_daily_summaries
    where summary_number = v_summary_number
  ) then
    v_summary_number := v_summary_number || '-' || upper(substr(replace(v_report.id::text, '-', ''), 1, 8));
  end if;

  insert into public.dti_daily_summaries (
    summary_number, inspection_report_id, job_id, operator, contractor, location,
    summary_date, field_invoice, page_number, page_total, inspection_type,
    connection_size_type, total_joints_inspected, total_damages,
    damage_seat_box, damage_seat_pin, damage_threads_box, damage_threads_pin,
    damage_torque_shoulder_box, damage_torque_shoulder_pin, pitted_box, pitted_pin,
    over_refaced_box, over_refaced_pin,
    short_box, damaged_hardband_box, damaged_hardband_pin, bent_tube,
    damage_other_quantity, total_dbr, min_tong_box, min_tong_pin, tstr_box,
    tstr_pin, emi, damaged_tube, min_wall, dbr_other_quantity, total_refaces,
    reface_pin, reface_box, total_hardbands, hardband_pin, hardband_box,
    repair_joints, dbr_joints, hb_joints, repair_hb_joints, inspected_by,
    source_rollup, status, created_by
  ) values (
    v_summary_number, v_report.id, v_report.job_id, v_report.operator_name,
    coalesce(nullif(v_report.contractor_name, ''), nullif(v_job_customer, '')),
    v_location, v_report.report_date, v_report.field_invoice, '1', '1',
    v_inspection_type, nullif(v_connection, ''), (v_counts ->> 'inspected')::integer,
    (v_counts ->> 'damage_seat_box')::integer + (v_counts ->> 'damage_seat_pin')::integer
      + (v_counts ->> 'damage_threads_box')::integer + (v_counts ->> 'damage_threads_pin')::integer
      + (v_counts ->> 'damage_torque_shoulder_box')::integer + (v_counts ->> 'damage_torque_shoulder_pin')::integer
      + (v_counts ->> 'pitted_box')::integer + (v_counts ->> 'pitted_pin')::integer
      + (v_counts ->> 'over_refaced_box')::integer + (v_counts ->> 'over_refaced_pin')::integer
      + (v_counts ->> 'damaged_hardband_box')::integer + (v_counts ->> 'damaged_hardband_pin')::integer
      + (v_counts ->> 'bent_tube')::integer + (v_counts ->> 'damage_other_quantity')::integer,
    (v_counts ->> 'damage_seat_box')::integer, (v_counts ->> 'damage_seat_pin')::integer,
    (v_counts ->> 'damage_threads_box')::integer, (v_counts ->> 'damage_threads_pin')::integer,
    (v_counts ->> 'damage_torque_shoulder_box')::integer, (v_counts ->> 'damage_torque_shoulder_pin')::integer,
    (v_counts ->> 'pitted_box')::integer, (v_counts ->> 'pitted_pin')::integer,
    (v_counts ->> 'over_refaced_box')::integer, (v_counts ->> 'over_refaced_pin')::integer,
    (v_counts ->> 'damaged_hardband_box')::integer, (v_counts ->> 'damaged_hardband_box')::integer,
    (v_counts ->> 'damaged_hardband_pin')::integer, (v_counts ->> 'bent_tube')::integer,
    (v_counts ->> 'damage_other_quantity')::integer,
    (v_counts ->> 'min_tong_box')::integer + (v_counts ->> 'min_tong_pin')::integer
      + (v_counts ->> 'tstr_box')::integer + (v_counts ->> 'tstr_pin')::integer
      + (v_counts ->> 'emi')::integer + (v_counts ->> 'damaged_tube')::integer
      + (v_counts ->> 'min_wall')::integer + (v_counts ->> 'dbr_other_quantity')::integer,
    (v_counts ->> 'min_tong_box')::integer, (v_counts ->> 'min_tong_pin')::integer,
    (v_counts ->> 'tstr_box')::integer, (v_counts ->> 'tstr_pin')::integer,
    (v_counts ->> 'emi')::integer, (v_counts ->> 'damaged_tube')::integer,
    (v_counts ->> 'min_wall')::integer, (v_counts ->> 'dbr_other_quantity')::integer,
    (v_counts ->> 'reface_box')::integer + (v_counts ->> 'reface_pin')::integer,
    (v_counts ->> 'reface_pin')::integer, (v_counts ->> 'reface_box')::integer,
    (v_counts ->> 'hardband_box')::integer + (v_counts ->> 'hardband_pin')::integer,
    (v_counts ->> 'hardband_pin')::integer, (v_counts ->> 'hardband_box')::integer,
    (v_counts ->> 'repair_joints')::integer, (v_counts ->> 'dbr_joints')::integer,
    (v_counts ->> 'hb_joints')::integer, (v_counts ->> 'repair_hb_joints')::integer,
    nullif(v_report.inspection_crew, ''),
    jsonb_build_object(
      'source', 'inspection_report',
      'inspectionReportId', v_report.id,
      'inspectionReportNumber', v_report.report_number,
      'componentType', case when v_component = 'Subs' then 'BHA' else v_component end,
      'syncedAt', now()
    ),
    'Draft', v_report.created_by
  )
  returning id into v_summary_id;

  return v_summary_id;
end;
$$;

create or replace function public.titan_dti_sync_daily_summary_from_report_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_titan_dti_inspection_daily_summary(new.id);
  return new;
end;
$$;

create or replace function public.titan_dti_sync_daily_summary_from_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.report_id is distinct from new.report_id then
    perform public.sync_titan_dti_inspection_daily_summary(old.report_id);
  end if;
  perform public.sync_titan_dti_inspection_daily_summary(
    case when tg_op = 'DELETE' then old.report_id else new.report_id end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_titan_dti_daily_summary_from_report
  on public.titan_dti_inspection_reports;
create trigger sync_titan_dti_daily_summary_from_report
after insert or update of
  job_id, operator_name, contractor_name, rig_number, report_date, field_invoice,
  inspection_crew, connection_size, connection_type, grade, state, inspection_scope
on public.titan_dti_inspection_reports
for each row
execute function public.titan_dti_sync_daily_summary_from_report_trigger();

drop trigger if exists sync_titan_dti_daily_summary_from_item
  on public.titan_dti_inspection_items;
create trigger sync_titan_dti_daily_summary_from_item
after insert or update of report_id, row_data or delete
on public.titan_dti_inspection_items
for each row
execute function public.titan_dti_sync_daily_summary_from_item_trigger();

-- Existing inspection reports receive their matching Daily Summary immediately.
select public.sync_titan_dti_inspection_daily_summary(id)
from public.titan_dti_inspection_reports;

revoke all on function public.titan_dti_jsonb_marked(jsonb, text) from public;
revoke all on function public.sync_titan_dti_inspection_daily_summary(uuid) from public;
revoke all on function public.titan_dti_sync_daily_summary_from_report_trigger() from public;
revoke all on function public.titan_dti_sync_daily_summary_from_item_trigger() from public;

commit;
