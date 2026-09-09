-- OMS-201 field audits for Connected Jobs.
-- Additive, rerunnable, and Wade-only during controlled rollout.

begin;

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_job_events') is null
    or to_regclass('public.titan_job_documents') is null then
    raise exception 'Run the Connected Jobs and Job Document Registry migrations first.';
  end if;
end $$;

create or replace function public.titan_dti_controls_can_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_disabled, false) = false
      and (
        lower(trim(coalesce(p.full_name, ''))) = 'wade wisenor'
        or lower(trim(coalesce(p.email, ''))) = 'wade@pathfinderinspections.com'
      )
  );
$$;

revoke all on function public.titan_dti_controls_can_access() from public, anon;
grant execute on function public.titan_dti_controls_can_access() to authenticated, service_role;

create sequence if not exists public.titan_field_audit_number_seq;
create sequence if not exists public.titan_audit_finding_number_seq;

create table if not exists public.titan_field_audit_checklist (
  item_code text primary key,
  section_code text not null check (section_code ~ '^[A-H]$'),
  section_title text not null,
  item_text text not null,
  reference_text text,
  is_critical boolean not null default false,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titan_field_audits (
  id uuid primary key default gen_random_uuid(),
  audit_number text not null unique default '',
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  audit_date date not null default current_date,
  service_line text not null,
  crew_lead_id uuid references auth.users(id) on delete set null,
  crew_lead_name text not null,
  auditor_id uuid references auth.users(id) on delete set null,
  auditor_name text not null,
  overall_percent numeric(5,2) not null default 0 check (overall_percent between 0 and 100),
  critical_nc_count integer not null default 0 check (critical_nc_count >= 0),
  status_band text not null default 'Below Standard' check (status_band in ('On Standard', 'Watch', 'Below Standard', 'Action Required')),
  notes text,
  status text not null default 'Filed' check (status in ('Filed', 'Voided')),
  void_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_field_audit_void_reason_check check (
    status <> 'Voided' or nullif(trim(coalesce(void_reason, '')), '') is not null
  )
);

create table if not exists public.titan_field_audit_items (
  id uuid primary key default gen_random_uuid(),
  field_audit_id uuid not null references public.titan_field_audits(id) on delete restrict,
  item_code text not null,
  section_code text not null,
  section_title text not null,
  item_text text not null,
  reference_text text,
  rating text not null check (rating in ('C', 'NI', 'NC', 'NA')),
  score integer check (score is null or score in (0, 1, 2, 3)),
  is_critical boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (field_audit_id, item_code)
);

alter table public.titan_field_audit_items drop constraint if exists titan_field_audit_items_score_check;
update public.titan_field_audit_items set score = 3 where rating = 'C' and score is distinct from 3;
update public.titan_field_audit_items set score = 2 where rating = 'NI' and score is distinct from 2;
update public.titan_field_audit_items set score = 1 where rating = 'NC' and score is distinct from 1;
update public.titan_field_audit_items set score = 0 where rating = 'NA' and score is distinct from 0;
alter table public.titan_field_audit_items
  add constraint titan_field_audit_items_score_check check (score is null or score in (0, 1, 2, 3));

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
    case when scored_count = 0 then 0 else round((total_points::numeric / (scored_count * 3)) * 100, 2) end as overall_value
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

create table if not exists public.titan_audit_findings (
  id uuid primary key default gen_random_uuid(),
  finding_number text not null unique default '',
  field_audit_id uuid not null references public.titan_field_audits(id) on delete restrict,
  audit_item_id uuid not null unique references public.titan_field_audit_items(id) on delete restrict,
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  severity text not null check (severity in ('NI', 'NC')),
  finding_text text not null,
  corrective_action text,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text,
  due_date date,
  finding_status text not null default 'Open' check (finding_status in ('Open', 'Action Assigned', 'Closed')),
  closure_evidence_document_id uuid references public.titan_job_documents(id) on delete restrict,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_audit_finding_assignment_check check (
    finding_status = 'Open' or (
      nullif(trim(coalesce(corrective_action, '')), '') is not null
      and nullif(trim(coalesce(owner_name, '')), '') is not null
      and due_date is not null
    )
  ),
  constraint titan_audit_finding_closure_check check (
    finding_status <> 'Closed' or (
      closure_evidence_document_id is not null and closed_by is not null and closed_at is not null
    )
  )
);

create index if not exists titan_field_audits_job_idx on public.titan_field_audits(job_id, audit_date desc);
create index if not exists titan_field_audits_standing_idx on public.titan_field_audits(crew_lead_name, audit_date desc) where status = 'Filed';
create index if not exists titan_audit_findings_status_idx on public.titan_audit_findings(finding_status, due_date, created_at desc);

insert into public.titan_field_audit_checklist (item_code, section_code, section_title, item_text, reference_text, is_critical, sort_order)
values
  ('A1','A','Safety & JSA','JSA performed at shift start and at every task change, and documented','IOM 6.3 / App. A',true,101),
  ('A2','A','Safety & JSA','All required PPE worn at all times','App. A',true,102),
  ('A3','A','Safety & JSA','H2S monitors charged/checked; required monitors in use','IOM 6.3',false,103),
  ('A4','A','Safety & JSA','Stop-work authority understood; crew looks out for one another','App. A',false,104),
  ('A5','A','Safety & JSA','Hot-work controls when applicable: HWP, extinguisher staged, no gasoline in sawdust','IOM 7.5.2',true,105),
  ('A6','A','Safety & JSA','Housekeeping and buffer zones maintained; safe pipe handling (tie-out)','IOM 6.3 / 7.3',false,106),
  ('B1','B','Pre-Job & Setup','Pre-job planning done; scope and service category confirmed','OMS-101 / IOM 2.1',false,201),
  ('B2','B','Pre-Job & Setup','Correct equipment and consumables on location','OMS-101 / IOM 5',false,202),
  ('B3','B','Pre-Job & Setup','Setup matches the space; power and staging per standard','OMS-103 / IOM 6',false,203),
  ('B4','B','Pre-Job & Setup','EMI standard staged and job file created by Lead','IOM 6.1.6',false,204),
  ('B5','B','Pre-Job & Setup','Check-in with Company Man and job-specific JSA completed','IOM 6.3',false,205),
  ('C1','C','Workflow & Quality Execution','Per-rack sequence followed; no stations skipped','OMS-104 / IOM 7',false,301),
  ('C2','C','Workflow & Quality Execution','Connections cleaned completely before inspection','IOM 7.5',true,302),
  ('C3','C','Workflow & Quality Execution','UT readings taken correctly; lowest value recorded','IOM 7.4.2',false,303),
  ('C4','C','Workflow & Quality Execution','Dimensional inspection performed and recorded per scope','OMS-106 / IOM 7.11',false,304),
  ('C5','C','Workflow & Quality Execution','Refacing within limits; correct field-vs-machine-shop routing','OMS-107 / IOM 7.8',false,305),
  ('C6','C','Workflow & Quality Execution','Marking, dope and protectors correct; no dope on machine-shop joints','IOM 7.13-7.14',true,306),
  ('C7','C','Workflow & Quality Execution','Cycle times tracked against benchmarks; bottlenecks managed','OMS-104 / IOM 12',false,307),
  ('D1','D','Calibration Discipline','UT calibrated before readings; step block within +/-0.001 inch','OMS-108 / IOM 7.4.1',true,401),
  ('D2','D','Calibration Discipline','EMI calibrated at required intervals: 50 joints or fewer, size change, interruption','IOM 8.2',true,402),
  ('D3','D','Calibration Discipline','Calibration repeatability verified and documented','IOM 8.2',true,403),
  ('D4','D','Calibration Discipline','Correct EMI head and calibration standard for the pipe','IOM 8.1',false,404),
  ('D5','D','Calibration Discipline','No inspection performed without valid calibration','IOM 8.5',true,405),
  ('E1','E','Decisions, Escalation & Documentation','Detection flow followed; indications confirmed before disposition','OMS-105 / IOM 3.6',false,501),
  ('E2','E','Decisions, Escalation & Documentation','Confirmed cracks rejected; no exceptions','IOM 10.1',true,502),
  ('E3','E','Decisions, Escalation & Documentation','Borderline conditions handled per flow and escalated when required','OMS-109 / IOM 3.4-3.5',false,503),
  ('E4','E','Decisions, Escalation & Documentation','Customer involved only where appropriate; inspector gives the recommendation','IOM 3.3',false,504),
  ('E5','E','Decisions, Escalation & Documentation','Gray-area decisions documented with who, why and criteria; no verbal-only approvals','IOM 3.5 / 13.4',true,505),
  ('F1','F','Reporting','Reports complete; all required data fields present','IOM 13.1-13.2',false,601),
  ('F2','F','Reporting','Defects documented with location and severity','IOM 13.3',false,602),
  ('F3','F','Reporting','Decisions justified; deviations recorded in writing','IOM 13.4',true,603),
  ('F4','F','Reporting','Reports accurate, legible and timely; Lead reviewed before submission','IOM 13.5 / 13.7',false,604),
  ('G1','G','OSP Conduct: Equipment, Vehicle & Presentation','Pre/Post-trip inspections done; issues logged in Samsara','App. A / IOM 14.5.7',false,701),
  ('G2','G','OSP Conduct: Equipment, Vehicle & Presentation','Only approved drivers; seatbelts and traffic laws followed; spotters used when backing','App. A',true,702),
  ('G3','G','OSP Conduct: Equipment, Vehicle & Presentation','Tools and equipment inspected, secured and properly stored','App. A',false,703),
  ('G4','G','OSP Conduct: Equipment, Vehicle & Presentation','Vehicles and equipment clean; professional appearance and conduct','App. A',false,704),
  ('G5','G','OSP Conduct: Equipment, Vehicle & Presentation','Site left clean; all trash and debris removed','App. A',false,705),
  ('H1','H','Training & Competency','Crew working within demonstrated competency','HR-CM-001',false,801),
  ('H2','H','Training & Competency','Competency Matrix current for the crew; gaps being addressed','IOM 14 / HR-CM-001',false,802),
  ('H3','H','Training & Competency','New hires supervised; no unsupervised independent calls','IOM 14.3',false,803),
  ('H4','H','Training & Competency','KPA alerts and required training current','IOM 14.5.7',false,804)
on conflict (item_code) do update set
  section_code = excluded.section_code,
  section_title = excluded.section_title,
  item_text = excluded.item_text,
  reference_text = excluded.reference_text,
  is_critical = excluded.is_critical,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function public.set_titan_field_audit_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.audit_number, '') = '' then
    new.audit_number := 'AUD-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.titan_field_audit_number_seq')::text, 5, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_titan_audit_finding_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.finding_number, '') = '' then
    new.finding_number := 'FND-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.titan_audit_finding_number_seq')::text, 5, '0');
  end if;
  if tg_op = 'UPDATE' then new.row_version := old.row_version + 1; end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_titan_field_audit_defaults on public.titan_field_audits;
create trigger set_titan_field_audit_defaults before insert or update on public.titan_field_audits
for each row execute function public.set_titan_field_audit_defaults();

drop trigger if exists set_titan_audit_finding_defaults on public.titan_audit_findings;
create trigger set_titan_audit_finding_defaults before insert or update on public.titan_audit_findings
for each row execute function public.set_titan_audit_finding_defaults();

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
  overall_value := case when scored_count = 0 then 0 else round((total_points::numeric / (scored_count * 3)) * 100, 2) end;
  band_value := case when critical_count > 0 then 'Action Required' when overall_value >= 90 then 'On Standard' when overall_value >= 75 then 'Watch' else 'Below Standard' end;

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

create or replace function public.update_titan_audit_finding(
  p_finding_id uuid,
  p_action text,
  p_corrective_action text default null,
  p_owner_id uuid default null,
  p_owner_name text default null,
  p_due_date date default null,
  p_evidence_document_id uuid default null,
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
    if p_evidence_document_id is null or not exists (
      select 1 from public.titan_job_documents document
      where document.id = p_evidence_document_id and document.job_id = finding.job_id and document.archived_at is null
    ) then raise exception 'Closure requires an active evidence document attached to the same job.';
    end if;
    update public.titan_audit_findings set finding_status = 'Closed', closure_evidence_document_id = p_evidence_document_id,
      closed_by = p_actor_id, closed_at = now(), updated_by = p_actor_id
    where id = finding.id returning * into saved;
  else
    raise exception 'Unsupported finding action.';
  end if;

  insert into public.titan_job_events (job_id, event_type, source_module, summary, before_value, after_value, actor_id)
  values (finding.job_id, case when p_action = 'close' then 'audit_finding_closed' else 'audit_finding_assigned' end,
    'field_audits', saved.finding_number || case when p_action = 'close' then ' closed with evidence.' else ' assigned for corrective action.' end,
    to_jsonb(finding), to_jsonb(saved), p_actor_id);
  return jsonb_build_object('ok', true, 'finding', to_jsonb(saved));
end;
$$;

revoke all on function public.create_titan_field_audit(uuid, date, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_titan_field_audit(uuid, date, uuid, text, uuid, text, text, jsonb) to service_role;
revoke all on function public.update_titan_audit_finding(uuid, text, text, uuid, text, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.update_titan_audit_finding(uuid, text, text, uuid, text, date, uuid, uuid) to service_role;

alter table public.titan_field_audit_checklist enable row level security;
alter table public.titan_field_audits enable row level security;
alter table public.titan_field_audit_items enable row level security;
alter table public.titan_audit_findings enable row level security;
grant select on public.titan_field_audit_checklist, public.titan_field_audits, public.titan_field_audit_items, public.titan_audit_findings to authenticated;

drop policy if exists "titan field audit checklist crm access read" on public.titan_field_audit_checklist;
drop policy if exists "titan field audit checklist dti access read" on public.titan_field_audit_checklist;
create policy "titan field audit checklist dti access read" on public.titan_field_audit_checklist for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan field audits crm access read" on public.titan_field_audits;
drop policy if exists "titan field audits dti access read" on public.titan_field_audits;
create policy "titan field audits dti access read" on public.titan_field_audits for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan field audit items crm access read" on public.titan_field_audit_items;
drop policy if exists "titan field audit items dti access read" on public.titan_field_audit_items;
create policy "titan field audit items dti access read" on public.titan_field_audit_items for select to authenticated using (public.titan_dti_controls_can_access());
drop policy if exists "titan audit findings crm access read" on public.titan_audit_findings;
drop policy if exists "titan audit findings dti access read" on public.titan_audit_findings;
create policy "titan audit findings dti access read" on public.titan_audit_findings for select to authenticated using (public.titan_dti_controls_can_access());

comment on table public.titan_field_audits is 'OMS-201 permanent field-audit headers scored from the controlled A-H checklist.';
comment on table public.titan_audit_findings is 'NI/NC findings tracked from field audit through corrective action and evidence-backed closure.';

commit;
