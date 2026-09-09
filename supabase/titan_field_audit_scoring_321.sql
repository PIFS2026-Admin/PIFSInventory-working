-- Change OMS-201 field-audit scoring to C=3, NI=2, NC=1, N/A=0, with every rating included.
-- Additive, rerunnable, and recalculates existing field audits.

begin;

do $$ begin
  if to_regclass('public.titan_field_audits') is null
    or to_regclass('public.titan_field_audit_items') is null then
    raise exception 'Run supabase/titan_field_audits.sql before this scoring update.';
  end if;
end $$;

alter table public.titan_field_audit_items
  drop constraint if exists titan_field_audit_items_score_check;

update public.titan_field_audit_items set score = 3 where rating = 'C' and score is distinct from 3;
update public.titan_field_audit_items set score = 2 where rating = 'NI' and score is distinct from 2;
update public.titan_field_audit_items set score = 1 where rating = 'NC' and score is distinct from 1;
update public.titan_field_audit_items set score = 0 where rating = 'NA' and score is distinct from 0;

alter table public.titan_field_audit_items
  add constraint titan_field_audit_items_score_check
  check (score is null or score in (0, 1, 2, 3));

with totals as (
  select audit.id,
    count(item.score) as scored_count,
    coalesce(sum(item.score), 0) as total_points,
    count(*) filter (where item.rating = 'NC' and item.is_critical) as critical_count
  from public.titan_field_audits audit
  left join public.titan_field_audit_items item on item.field_audit_id = audit.id
  group by audit.id
), recalculated as (
  select id, critical_count,
    case when scored_count = 0 then 0
      else round((total_points::numeric / (scored_count * 3)) * 100, 2)
    end as overall_value
  from totals
)
update public.titan_field_audits audit
set overall_percent = recalculated.overall_value,
  critical_nc_count = recalculated.critical_count,
  status_band = case
    when recalculated.critical_count > 0 then 'Action Required'
    when recalculated.overall_value >= 90 then 'On Standard'
    when recalculated.overall_value >= 75 then 'Watch'
    else 'Below Standard'
  end
from recalculated
where audit.id = recalculated.id;

create or replace function public.create_titan_field_audit(
  p_job_id uuid,
  p_audit_date date,
  p_crew_lead_id uuid,
  p_crew_lead_name text,
  p_auditor_id uuid,
  p_auditor_name text,
  p_notes text,
  p_items jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  source_job public.titan_jobs%rowtype;
  saved_audit public.titan_field_audits%rowtype;
  expected_count integer;
  submitted_count integer;
  scored_count integer;
  total_points integer;
  critical_count integer;
  overall_value numeric(5,2);
  band_value text;
  findings_count integer;
begin
  select * into source_job from public.titan_jobs where id = p_job_id and archived_at is null for update;
  if source_job.id is null then raise exception 'Connected job was not found.'; end if;
  if nullif(trim(coalesce(p_crew_lead_name, '')), '') is null then raise exception 'Select a crew lead.'; end if;
  if nullif(trim(coalesce(p_auditor_name, '')), '') is null then raise exception 'The auditor could not be identified.'; end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then raise exception 'Audit ratings are required.'; end if;

  select count(*) into expected_count from public.titan_field_audit_checklist where is_active;
  select count(*), count(distinct item_code) into submitted_count, scored_count
  from jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text);
  if submitted_count <> expected_count or scored_count <> expected_count then
    raise exception 'Rate every active OMS-201 checklist item exactly once.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
    where rating is null or rating not in ('C','NI','NC','NA')
  ) or exists (
    select 1 from public.titan_field_audit_checklist checklist
    where checklist.is_active and not exists (
      select 1 from jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
      where submitted.item_code = checklist.item_code
    )
  ) then raise exception 'The audit contains an invalid or missing checklist rating.';
  end if;

  insert into public.titan_field_audits (
    job_id, audit_date, service_line, crew_lead_id, crew_lead_name, auditor_id, auditor_name, notes, created_by, updated_by
  ) values (
    source_job.id, coalesce(p_audit_date, current_date), source_job.service_line, p_crew_lead_id,
    trim(p_crew_lead_name), p_auditor_id, trim(p_auditor_name), nullif(trim(coalesce(p_notes, '')), ''), p_auditor_id, p_auditor_id
  ) returning * into saved_audit;

  insert into public.titan_field_audit_items (
    field_audit_id, item_code, section_code, section_title, item_text, reference_text, rating, score, is_critical, note
  )
  select saved_audit.id, checklist.item_code, checklist.section_code, checklist.section_title,
    checklist.item_text, checklist.reference_text, submitted.rating,
    array_position(array['NA', 'NC', 'NI', 'C']::text[], submitted.rating) - 1,
    checklist.is_critical, nullif(trim(coalesce(submitted.note, '')), '')
  from public.titan_field_audit_checklist checklist
  join jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
    on submitted.item_code = checklist.item_code
  where checklist.is_active;

  select count(score), coalesce(sum(score), 0), count(*) filter (where rating = 'NC' and is_critical)
  into scored_count, total_points, critical_count
  from public.titan_field_audit_items where field_audit_id = saved_audit.id;
  overall_value := case when scored_count = 0 then 0
    else round((total_points::numeric / (scored_count * 3)) * 100, 2) end;
  band_value := case when critical_count > 0 then 'Action Required'
    when overall_value >= 90 then 'On Standard'
    when overall_value >= 75 then 'Watch' else 'Below Standard' end;

  update public.titan_field_audits set overall_percent = overall_value, critical_nc_count = critical_count,
    status_band = band_value where id = saved_audit.id returning * into saved_audit;

  insert into public.titan_audit_findings (
    field_audit_id, audit_item_id, job_id, severity, finding_text, created_by, updated_by
  )
  select saved_audit.id, item.id, saved_audit.job_id, item.rating,
    item.section_code || ' / ' || item.item_text || case when item.note is null then '' else ' - ' || item.note end,
    p_auditor_id, p_auditor_id
  from public.titan_field_audit_items item
  where item.field_audit_id = saved_audit.id and item.rating in ('NI','NC');
  get diagnostics findings_count = row_count;

  insert into public.titan_job_events (job_id, event_type, source_module, summary, after_value, actor_id)
  values (saved_audit.job_id, 'field_audit_filed', 'field_audits',
    saved_audit.audit_number || ' filed: ' || saved_audit.status_band || ' at ' || saved_audit.overall_percent || '%.',
    jsonb_build_object('audit', to_jsonb(saved_audit), 'findings_created', findings_count), p_auditor_id);

  return jsonb_build_object('ok', true, 'audit', to_jsonb(saved_audit), 'findingsCreated', findings_count);
end;
$$;

revoke all on function public.create_titan_field_audit(uuid, date, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_titan_field_audit(uuid, date, uuid, text, uuid, text, text, jsonb) to service_role;

commit;
