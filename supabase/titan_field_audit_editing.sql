-- Full edit and delete support for OMS-201 field audits.
-- Run after supabase/titan_field_audits.sql.

begin;

alter table public.titan_field_audits alter column job_id drop not null;
alter table public.titan_field_audits add column if not exists manual_job_name text;
alter table public.titan_field_audits drop constraint if exists titan_field_audit_job_context_check;
alter table public.titan_field_audits add constraint titan_field_audit_job_context_check check (
  (job_id is not null and nullif(trim(coalesce(manual_job_name, '')), '') is null)
  or (job_id is null and nullif(trim(coalesce(manual_job_name, '')), '') is not null)
);

alter table public.titan_audit_findings alter column job_id drop not null;
alter table public.titan_audit_findings add column if not exists closure_evidence_note text;
alter table public.titan_audit_findings drop constraint if exists titan_audit_finding_closure_check;
alter table public.titan_audit_findings add constraint titan_audit_finding_closure_check check (
  finding_status <> 'Closed' or (
    (closure_evidence_document_id is not null or nullif(trim(coalesce(closure_evidence_note, '')), '') is not null)
    and closed_by is not null and closed_at is not null
  )
);

create or replace function public.create_titan_manual_field_audit(
  p_manual_job_name text,
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
  saved_audit public.titan_field_audits%rowtype;
  scored_count integer;
  total_points integer;
  critical_count integer;
  overall_value numeric(5,2);
  band_value text;
  findings_count integer;
begin
  if nullif(trim(coalesce(p_manual_job_name, '')), '') is null then raise exception 'Enter the job name or identifier.'; end if;
  if p_crew_lead_id is null or nullif(trim(coalesce(p_crew_lead_name, '')), '') is null then raise exception 'Select an active crew lead.'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Complete the audit checklist.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
    where submitted.rating not in ('C','NI','NC','NA')
  ) or exists (
    select 1 from public.titan_field_audit_checklist checklist where checklist.is_active and not exists (
      select 1 from jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
      where submitted.item_code = checklist.item_code
    )
  ) then raise exception 'The audit contains an invalid or missing checklist rating.'; end if;

  insert into public.titan_field_audits (
    job_id, manual_job_name, audit_date, service_line, crew_lead_id, crew_lead_name,
    auditor_id, auditor_name, notes, created_by, updated_by
  ) values (
    null, trim(p_manual_job_name), coalesce(p_audit_date, current_date), 'DTI', p_crew_lead_id,
    trim(p_crew_lead_name), p_auditor_id, trim(p_auditor_name),
    nullif(trim(coalesce(p_notes, '')), ''), p_auditor_id, p_auditor_id
  ) returning * into saved_audit;

  insert into public.titan_field_audit_items (
    field_audit_id, item_code, section_code, section_title, item_text, reference_text, rating, score, is_critical, note
  )
  select saved_audit.id, checklist.item_code, checklist.section_code, checklist.section_title,
    checklist.item_text, checklist.reference_text, submitted.rating,
    case submitted.rating when 'C' then 3 when 'NI' then 2 when 'NC' then 1 else null end,
    checklist.is_critical, nullif(trim(coalesce(submitted.note, '')), '')
  from public.titan_field_audit_checklist checklist
  join jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
    on submitted.item_code = checklist.item_code where checklist.is_active;

  select count(score), coalesce(sum(score), 0), count(*) filter (where rating = 'NC' and is_critical)
  into scored_count, total_points, critical_count
  from public.titan_field_audit_items where field_audit_id = saved_audit.id;
  overall_value := case when scored_count = 0 then 0 else round((total_points::numeric / (scored_count * 3)) * 100, 2) end;
  band_value := case when critical_count > 0 then 'Action Required' when overall_value >= 90 then 'On Standard' when overall_value >= 75 then 'Watch' else 'Below Standard' end;
  update public.titan_field_audits set overall_percent = overall_value, critical_nc_count = critical_count,
    status_band = band_value where id = saved_audit.id returning * into saved_audit;

  insert into public.titan_audit_findings (field_audit_id, audit_item_id, job_id, severity, finding_text, created_by, updated_by)
  select saved_audit.id, item.id, null, item.rating,
    item.section_code || ' / ' || item.item_text || case when item.note is null then '' else ' - ' || item.note end,
    p_auditor_id, p_auditor_id
  from public.titan_field_audit_items item where item.field_audit_id = saved_audit.id and item.rating in ('NI','NC');
  get diagnostics findings_count = row_count;

  return jsonb_build_object('ok', true, 'audit', to_jsonb(saved_audit), 'findingsCreated', findings_count);
end;
$$;

create or replace function public.update_titan_field_audit(
  p_audit_id uuid,
  p_job_id uuid,
  p_manual_job_name text,
  p_audit_date date,
  p_crew_lead_id uuid,
  p_crew_lead_name text,
  p_notes text,
  p_items jsonb,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  source_audit public.titan_field_audits%rowtype;
  source_job public.titan_jobs%rowtype;
  saved_audit public.titan_field_audits%rowtype;
  scored_count integer;
  total_points integer;
  critical_count integer;
  overall_value numeric(5,2);
  band_value text;
  connected_job_id uuid;
  findings_created integer := 0;
  findings_removed integer := 0;
begin
  select * into source_audit from public.titan_field_audits where id = p_audit_id for update;
  if source_audit.id is null then raise exception 'Field audit was not found.'; end if;
  if source_audit.status <> 'Filed' then raise exception 'Only filed audits can be edited.'; end if;

  if p_job_id is not null then
    select * into source_job from public.titan_jobs where id = p_job_id and archived_at is null;
    if source_job.id is null or source_job.service_line <> 'DTI' then raise exception 'Select an active connected DTI job.'; end if;
    connected_job_id := source_job.id;
  elsif nullif(trim(coalesce(p_manual_job_name, '')), '') is null then
    raise exception 'Select a connected job or enter the job manually.';
  end if;
  if p_crew_lead_id is null or nullif(trim(coalesce(p_crew_lead_name, '')), '') is null then
    raise exception 'Select an active crew lead.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Complete the audit checklist.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
    where submitted.rating not in ('C','NI','NC','NA')
  ) or exists (
    select 1 from public.titan_field_audit_checklist checklist
    where checklist.is_active and not exists (
      select 1 from jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
      where submitted.item_code = checklist.item_code
    )
  ) then raise exception 'The audit contains an invalid or missing checklist rating.';
  end if;

  update public.titan_field_audits set
    job_id = connected_job_id,
    manual_job_name = case when connected_job_id is null then trim(p_manual_job_name) else null end,
    audit_date = coalesce(p_audit_date, current_date),
    service_line = 'DTI',
    crew_lead_id = p_crew_lead_id,
    crew_lead_name = trim(p_crew_lead_name),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    updated_by = p_actor_id
  where id = source_audit.id;

  update public.titan_field_audit_items item set
    section_code = checklist.section_code,
    section_title = checklist.section_title,
    item_text = checklist.item_text,
    reference_text = checklist.reference_text,
    rating = submitted.rating,
    score = case submitted.rating when 'C' then 3 when 'NI' then 2 when 'NC' then 1 else null end,
    is_critical = checklist.is_critical,
    note = nullif(trim(coalesce(submitted.note, '')), '')
  from public.titan_field_audit_checklist checklist
  join jsonb_to_recordset(p_items) as submitted(item_code text, rating text, note text)
    on submitted.item_code = checklist.item_code
  where item.field_audit_id = source_audit.id and item.item_code = checklist.item_code;

  delete from public.titan_audit_findings finding
  using public.titan_field_audit_items item
  where finding.audit_item_id = item.id and item.field_audit_id = source_audit.id
    and item.rating not in ('NI','NC');
  get diagnostics findings_removed = row_count;

  update public.titan_audit_findings finding set
    job_id = connected_job_id,
    severity = item.rating,
    finding_text = item.section_code || ' / ' || item.item_text || case when item.note is null then '' else ' - ' || item.note end,
    closure_evidence_document_id = case when source_audit.job_id is distinct from connected_job_id then null else finding.closure_evidence_document_id end,
    closure_evidence_note = case when source_audit.job_id is distinct from connected_job_id then null else finding.closure_evidence_note end,
    closed_by = case when source_audit.job_id is distinct from connected_job_id then null else finding.closed_by end,
    closed_at = case when source_audit.job_id is distinct from connected_job_id then null else finding.closed_at end,
    finding_status = case when source_audit.job_id is distinct from connected_job_id and finding.finding_status = 'Closed' then 'Action Assigned' else finding.finding_status end,
    updated_by = p_actor_id
  from public.titan_field_audit_items item
  where finding.audit_item_id = item.id and item.field_audit_id = source_audit.id
    and item.rating in ('NI','NC');

  insert into public.titan_audit_findings (
    field_audit_id, audit_item_id, job_id, severity, finding_text, created_by, updated_by
  )
  select source_audit.id, item.id, connected_job_id, item.rating,
    item.section_code || ' / ' || item.item_text || case when item.note is null then '' else ' - ' || item.note end,
    p_actor_id, p_actor_id
  from public.titan_field_audit_items item
  where item.field_audit_id = source_audit.id and item.rating in ('NI','NC')
    and not exists (select 1 from public.titan_audit_findings finding where finding.audit_item_id = item.id);
  get diagnostics findings_created = row_count;

  select count(score), coalesce(sum(score), 0), count(*) filter (where rating = 'NC' and is_critical)
  into scored_count, total_points, critical_count
  from public.titan_field_audit_items where field_audit_id = source_audit.id;
  overall_value := case when scored_count = 0 then 0 else round((total_points::numeric / (scored_count * 3)) * 100, 2) end;
  band_value := case when critical_count > 0 then 'Action Required' when overall_value >= 90 then 'On Standard' when overall_value >= 75 then 'Watch' else 'Below Standard' end;

  update public.titan_field_audits set overall_percent = overall_value,
    critical_nc_count = critical_count, status_band = band_value, updated_by = p_actor_id
  where id = source_audit.id returning * into saved_audit;

  if saved_audit.job_id is not null then
    insert into public.titan_job_events (job_id, event_type, source_module, summary, before_value, after_value, actor_id)
    values (saved_audit.job_id, 'field_audit_updated', 'field_audits',
      saved_audit.audit_number || ' updated: ' || saved_audit.status_band || ' at ' || saved_audit.overall_percent || '%.',
      to_jsonb(source_audit), to_jsonb(saved_audit), p_actor_id);
  end if;

  return jsonb_build_object('ok', true, 'audit', to_jsonb(saved_audit),
    'findingsCreated', findings_created, 'findingsRemoved', findings_removed);
end;
$$;

create or replace function public.delete_titan_field_audit(p_audit_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  source_audit public.titan_field_audits%rowtype;
  findings_count integer;
begin
  select * into source_audit from public.titan_field_audits where id = p_audit_id for update;
  if source_audit.id is null then raise exception 'Field audit was not found.'; end if;

  select count(*) into findings_count from public.titan_audit_findings where field_audit_id = source_audit.id;
  delete from public.titan_audit_findings where field_audit_id = source_audit.id;
  delete from public.titan_field_audit_items where field_audit_id = source_audit.id;
  delete from public.titan_field_audits where id = source_audit.id;

  if source_audit.job_id is not null then
    insert into public.titan_job_events (job_id, event_type, source_module, summary, before_value, actor_id)
    values (source_audit.job_id, 'field_audit_deleted', 'field_audits',
      source_audit.audit_number || ' deleted with ' || findings_count || ' generated finding(s).',
      to_jsonb(source_audit), p_actor_id);
  end if;

  return jsonb_build_object('ok', true, 'auditNumber', source_audit.audit_number, 'findingsDeleted', findings_count);
end;
$$;

create or replace function public.update_titan_audit_finding_v2(
  p_finding_id uuid,
  p_action text,
  p_corrective_action text default null,
  p_owner_id uuid default null,
  p_owner_name text default null,
  p_due_date date default null,
  p_evidence_document_id uuid default null,
  p_evidence_note text default null,
  p_actor_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  finding public.titan_audit_findings%rowtype;
  saved public.titan_audit_findings%rowtype;
begin
  select * into finding from public.titan_audit_findings where id = p_finding_id for update;
  if finding.id is null then raise exception 'Audit finding was not found.'; end if;

  if p_action = 'assign' then
    if finding.finding_status = 'Closed' then raise exception 'A closed finding cannot be reassigned.'; end if;
    if nullif(trim(coalesce(p_corrective_action, '')), '') is null
      or nullif(trim(coalesce(p_owner_name, '')), '') is null or p_due_date is null then
      raise exception 'Corrective action, owner and due date are required.';
    end if;
    update public.titan_audit_findings set corrective_action = trim(p_corrective_action), owner_id = p_owner_id,
      owner_name = trim(p_owner_name), due_date = p_due_date, finding_status = 'Action Assigned', updated_by = p_actor_id
    where id = finding.id returning * into saved;
  elsif p_action = 'close' then
    if finding.finding_status <> 'Action Assigned' then raise exception 'Assign the corrective action before closing this finding.'; end if;
    if finding.job_id is not null then
      if p_evidence_document_id is null or not exists (
        select 1 from public.titan_job_documents document
        where document.id = p_evidence_document_id and document.job_id = finding.job_id and document.archived_at is null
      ) then raise exception 'Closure requires an active evidence document attached to the same job.'; end if;
    elsif nullif(trim(coalesce(p_evidence_note, '')), '') is null then
      raise exception 'Describe or reference the closure evidence for this manual job.';
    end if;
    update public.titan_audit_findings set finding_status = 'Closed',
      closure_evidence_document_id = case when finding.job_id is not null then p_evidence_document_id else null end,
      closure_evidence_note = case when finding.job_id is null then trim(p_evidence_note) else null end,
      closed_by = p_actor_id, closed_at = now(), updated_by = p_actor_id
    where id = finding.id returning * into saved;
  else
    raise exception 'Unsupported finding action.';
  end if;

  if finding.job_id is not null then
    insert into public.titan_job_events (job_id, event_type, source_module, summary, before_value, after_value, actor_id)
    values (finding.job_id, case when p_action = 'close' then 'audit_finding_closed' else 'audit_finding_assigned' end,
      'field_audits', saved.finding_number || case when p_action = 'close' then ' closed with evidence.' else ' assigned for corrective action.' end,
      to_jsonb(finding), to_jsonb(saved), p_actor_id);
  end if;
  return jsonb_build_object('ok', true, 'finding', to_jsonb(saved));
end;
$$;

revoke all on function public.create_titan_manual_field_audit(text, date, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_titan_manual_field_audit(text, date, uuid, text, uuid, text, text, jsonb) to service_role;
revoke all on function public.update_titan_field_audit(uuid, uuid, text, date, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.update_titan_field_audit(uuid, uuid, text, date, uuid, text, text, jsonb, uuid) to service_role;
revoke all on function public.delete_titan_field_audit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_titan_field_audit(uuid, uuid) to service_role;
revoke all on function public.update_titan_audit_finding_v2(uuid, text, text, uuid, text, date, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.update_titan_audit_finding_v2(uuid, text, text, uuid, text, date, uuid, text, uuid) to service_role;

commit;
