-- Controlled specification-intelligence loop for Connected Jobs.
-- Additive and rerunnable. Existing job intelligence is backfilled into the review queue.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_job_events') is null
    or to_regclass('public.titan_job_deviations') is null
    or to_regclass('public.titan_job_debriefs') is null then
    raise exception 'Run the connected-job and Job Intelligence migrations first.';
  end if;
end $$;

create sequence if not exists public.titan_spec_candidate_number_seq;
create sequence if not exists public.titan_customer_spec_number_seq;

create table if not exists public.titan_spec_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_number text not null unique default '',
  job_id uuid not null references public.titan_jobs(id) on delete restrict,
  source_deviation_id uuid unique references public.titan_job_deviations(id) on delete restrict,
  source_debrief_id uuid unique references public.titan_job_debriefs(id) on delete restrict,
  source_type text not null check (source_type in ('Deviation', 'Debrief')),
  customer_name text,
  service_line text not null default 'Unassigned',
  candidate_type text not null default 'Operational Lesson',
  trigger_text text,
  requirement_text text not null,
  confidence text not null default 'Medium' check (confidence in ('Low', 'Medium', 'High')),
  review_status text not null default 'Pending' check (review_status in ('Pending', 'Under Review', 'Decided', 'Voided')),
  decision text check (decision is null or decision in ('Add to Matrix', 'Job-Specific', 'Hold', 'No Change')),
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_spec_candidate_single_source_check check (
    (source_deviation_id is not null and source_debrief_id is null and source_type = 'Deviation')
    or (source_deviation_id is null and source_debrief_id is not null and source_type = 'Debrief')
  ),
  constraint titan_spec_candidate_decision_check check (
    (review_status in ('Pending', 'Under Review') and (decision is null or decision = 'Hold'))
    or (review_status = 'Decided' and decision in ('Add to Matrix', 'Job-Specific', 'No Change'))
    or review_status = 'Voided'
  ),
  constraint titan_spec_candidate_decision_note_check check (
    decision is null or nullif(trim(coalesce(decision_note, '')), '') is not null
  )
);

create table if not exists public.titan_customer_specifications (
  id uuid primary key default gen_random_uuid(),
  specification_number text not null unique default '',
  source_candidate_id uuid not null unique references public.titan_spec_candidates(id) on delete restrict,
  source_job_id uuid not null references public.titan_jobs(id) on delete restrict,
  customer_name text,
  scope text not null default 'Customer' check (scope in ('Customer', 'Company')),
  service_line text not null default 'Unassigned',
  title text not null,
  requirement_text text not null,
  effective_date date not null default current_date,
  status text not null default 'Active' check (status in ('Active', 'Superseded', 'Retired')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_customer_spec_scope_check check (
    scope <> 'Customer' or nullif(trim(coalesce(customer_name, '')), '') is not null
  )
);

create index if not exists titan_spec_candidates_review_idx
  on public.titan_spec_candidates(review_status, service_line, updated_at desc);
create index if not exists titan_spec_candidates_customer_idx
  on public.titan_spec_candidates(customer_name, service_line);
create index if not exists titan_customer_specifications_lookup_idx
  on public.titan_customer_specifications(status, customer_name, service_line, effective_date desc);

create or replace function public.set_titan_spec_candidate_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.candidate_number, '') = '' then
    new.candidate_number := 'SCI-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.titan_spec_candidate_number_seq')::text, 5, '0');
  end if;
  if tg_op = 'UPDATE' then new.row_version := old.row_version + 1; end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_titan_customer_spec_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.specification_number, '') = '' then
    new.specification_number := 'SPEC-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.titan_customer_spec_number_seq')::text, 5, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.sync_titan_deviation_spec_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_job public.titan_jobs%rowtype;
  requirement_value text;
begin
  select * into source_job from public.titan_jobs where id = new.job_id;
  requirement_value := coalesce(
    nullif(trim(new.controlling_criteria), ''),
    nullif(trim(new.inspector_recommendation), ''),
    nullif(trim(new.justification), ''),
    new.defect_type
  );

  if new.spec_candidate and new.status <> 'Voided' then
    insert into public.titan_spec_candidates (
      job_id, source_deviation_id, source_type, customer_name, service_line,
      candidate_type, trigger_text, requirement_text, confidence, created_by, updated_by
    ) values (
      new.job_id, new.id, 'Deviation', source_job.customer_name, source_job.service_line,
      'Field Deviation', new.defect_type, requirement_value, 'High', new.created_by, new.updated_by
    )
    on conflict (source_deviation_id) do update set
      customer_name = excluded.customer_name,
      service_line = excluded.service_line,
      trigger_text = excluded.trigger_text,
      requirement_text = case
        when titan_spec_candidates.review_status in ('Pending', 'Under Review') then excluded.requirement_text
        else titan_spec_candidates.requirement_text
      end,
      updated_by = excluded.updated_by,
      review_status = case
        when titan_spec_candidates.review_status = 'Voided' then 'Pending'
        else titan_spec_candidates.review_status
      end;
  else
    update public.titan_spec_candidates
    set review_status = 'Voided', decision = null, decision_note = 'Source deviation is no longer marked as a specification candidate.', updated_by = new.updated_by
    where source_deviation_id = new.id and review_status in ('Pending', 'Under Review');
  end if;
  return new;
end;
$$;

create or replace function public.sync_titan_debrief_spec_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_job public.titan_jobs%rowtype;
  requirement_value text;
  trigger_value text;
begin
  select * into source_job from public.titan_jobs where id = new.job_id;
  requirement_value := coalesce(nullif(trim(new.repeat_note), ''), nullif(trim(new.lessons_learned), ''));
  trigger_value := case when new.repeat_issue then 'Repeated issue identified during closeout' else 'Closeout lesson identified' end;

  if new.status = 'Active' and requirement_value is not null then
    insert into public.titan_spec_candidates (
      job_id, source_debrief_id, source_type, customer_name, service_line,
      candidate_type, trigger_text, requirement_text, confidence, created_by, updated_by
    ) values (
      new.job_id, new.id, 'Debrief', source_job.customer_name, source_job.service_line,
      case when new.repeat_issue then 'Repeat Issue' else 'Operational Lesson' end,
      trigger_value, requirement_value, case when new.repeat_issue then 'High' else 'Medium' end,
      new.created_by, new.updated_by
    )
    on conflict (source_debrief_id) do update set
      customer_name = excluded.customer_name,
      service_line = excluded.service_line,
      candidate_type = excluded.candidate_type,
      trigger_text = excluded.trigger_text,
      requirement_text = case
        when titan_spec_candidates.review_status in ('Pending', 'Under Review') then excluded.requirement_text
        else titan_spec_candidates.requirement_text
      end,
      confidence = excluded.confidence,
      updated_by = excluded.updated_by,
      review_status = case
        when titan_spec_candidates.review_status = 'Voided' then 'Pending'
        else titan_spec_candidates.review_status
      end;
  else
    update public.titan_spec_candidates
    set review_status = 'Voided', decision = null, decision_note = 'The source debrief no longer contains candidate intelligence.', updated_by = new.updated_by
    where source_debrief_id = new.id and review_status in ('Pending', 'Under Review');
  end if;
  return new;
end;
$$;

create or replace function public.decide_titan_spec_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_decision_note text,
  p_specification_title text default null,
  p_requirement_text text default null,
  p_scope text default 'Customer',
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.titan_spec_candidates%rowtype;
  saved_candidate public.titan_spec_candidates%rowtype;
  saved_specification public.titan_customer_specifications%rowtype;
  requirement_value text;
  title_value text;
  scope_value text;
begin
  select * into candidate
  from public.titan_spec_candidates
  where id = p_candidate_id
  for update;

  if candidate.id is null then raise exception 'The intelligence candidate was not found.'; end if;
  if candidate.review_status = 'Voided' then raise exception 'A voided candidate cannot be reviewed.'; end if;
  if p_decision not in ('Add to Matrix', 'Job-Specific', 'Hold', 'No Change') then
    raise exception 'Select a valid review decision.';
  end if;
  if nullif(trim(coalesce(p_decision_note, '')), '') is null then
    raise exception 'Record the reason for this decision.';
  end if;

  requirement_value := coalesce(nullif(trim(p_requirement_text), ''), candidate.requirement_text);
  title_value := coalesce(nullif(trim(p_specification_title), ''), candidate.trigger_text, candidate.candidate_type);
  scope_value := case when p_scope = 'Company' then 'Company' else 'Customer' end;

  if p_decision = 'Add to Matrix' and nullif(trim(coalesce(requirement_value, '')), '') is null then
    raise exception 'A specification requirement is required.';
  end if;
  if p_decision = 'Add to Matrix' and scope_value = 'Customer'
    and nullif(trim(coalesce(candidate.customer_name, '')), '') is null then
    raise exception 'This job has no customer. Choose Company scope or correct the connected job first.';
  end if;

  update public.titan_spec_candidates
  set requirement_text = requirement_value,
      review_status = case when p_decision = 'Hold' then 'Under Review' else 'Decided' end,
      decision = p_decision,
      decision_note = trim(p_decision_note),
      decided_by = p_actor_id,
      decided_at = now(),
      updated_by = p_actor_id
  where id = candidate.id
  returning * into saved_candidate;

  if p_decision = 'Add to Matrix' then
    insert into public.titan_customer_specifications (
      source_candidate_id, source_job_id, customer_name, scope, service_line,
      title, requirement_text, status, created_by, updated_by
    ) values (
      candidate.id, candidate.job_id,
      case when scope_value = 'Customer' then candidate.customer_name else null end,
      scope_value, candidate.service_line, title_value, requirement_value, 'Active', p_actor_id, p_actor_id
    )
    on conflict (source_candidate_id) do update set
      customer_name = excluded.customer_name,
      scope = excluded.scope,
      service_line = excluded.service_line,
      title = excluded.title,
      requirement_text = excluded.requirement_text,
      status = 'Active',
      updated_by = excluded.updated_by
    returning * into saved_specification;
  end if;

  insert into public.titan_job_events (
    job_id, event_type, source_module, summary, before_value, after_value, actor_id
  ) values (
    candidate.job_id, 'spec_candidate_decided', 'spec_intelligence',
    candidate.candidate_number || ' decided: ' || p_decision || '.',
    to_jsonb(candidate),
    jsonb_build_object('candidate', to_jsonb(saved_candidate), 'specification', to_jsonb(saved_specification)),
    p_actor_id
  );

  return jsonb_build_object(
    'ok', true,
    'candidate', to_jsonb(saved_candidate),
    'specification', case when saved_specification.id is null then null else to_jsonb(saved_specification) end
  );
end;
$$;

revoke all on function public.decide_titan_spec_candidate(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.decide_titan_spec_candidate(uuid, text, text, text, text, text, uuid) to service_role;

drop trigger if exists set_titan_spec_candidate_defaults on public.titan_spec_candidates;
create trigger set_titan_spec_candidate_defaults
before insert or update on public.titan_spec_candidates
for each row execute function public.set_titan_spec_candidate_defaults();

drop trigger if exists set_titan_customer_spec_defaults on public.titan_customer_specifications;
create trigger set_titan_customer_spec_defaults
before insert or update on public.titan_customer_specifications
for each row execute function public.set_titan_customer_spec_defaults();

drop trigger if exists sync_titan_deviation_spec_candidate on public.titan_job_deviations;
create trigger sync_titan_deviation_spec_candidate
after insert or update of spec_candidate, status, controlling_criteria, inspector_recommendation, justification, defect_type
on public.titan_job_deviations
for each row execute function public.sync_titan_deviation_spec_candidate();

drop trigger if exists sync_titan_debrief_spec_candidate on public.titan_job_debriefs;
create trigger sync_titan_debrief_spec_candidate
after insert or update of status, repeat_issue, repeat_note, lessons_learned
on public.titan_job_debriefs
for each row execute function public.sync_titan_debrief_spec_candidate();

insert into public.titan_spec_candidates (
  job_id, source_deviation_id, source_type, customer_name, service_line,
  candidate_type, trigger_text, requirement_text, confidence, created_by, updated_by
)
select
  deviation.job_id, deviation.id, 'Deviation', job.customer_name, job.service_line,
  'Field Deviation', deviation.defect_type,
  coalesce(nullif(trim(deviation.controlling_criteria), ''), nullif(trim(deviation.inspector_recommendation), ''), nullif(trim(deviation.justification), ''), deviation.defect_type),
  'High', deviation.created_by, deviation.updated_by
from public.titan_job_deviations deviation
join public.titan_jobs job on job.id = deviation.job_id
where deviation.spec_candidate and deviation.status <> 'Voided'
on conflict (source_deviation_id) do nothing;

insert into public.titan_spec_candidates (
  job_id, source_debrief_id, source_type, customer_name, service_line,
  candidate_type, trigger_text, requirement_text, confidence, created_by, updated_by
)
select
  debrief.job_id, debrief.id, 'Debrief', job.customer_name, job.service_line,
  case when debrief.repeat_issue then 'Repeat Issue' else 'Operational Lesson' end,
  case when debrief.repeat_issue then 'Repeated issue identified during closeout' else 'Closeout lesson identified' end,
  coalesce(nullif(trim(debrief.repeat_note), ''), nullif(trim(debrief.lessons_learned), '')),
  case when debrief.repeat_issue then 'High' else 'Medium' end,
  debrief.created_by, debrief.updated_by
from public.titan_job_debriefs debrief
join public.titan_jobs job on job.id = debrief.job_id
where debrief.status = 'Active'
  and coalesce(nullif(trim(debrief.repeat_note), ''), nullif(trim(debrief.lessons_learned), '')) is not null
on conflict (source_debrief_id) do nothing;

alter table public.titan_spec_candidates enable row level security;
alter table public.titan_customer_specifications enable row level security;

grant select on public.titan_spec_candidates to authenticated;
grant select on public.titan_customer_specifications to authenticated;

drop policy if exists "titan spec candidates crm access read" on public.titan_spec_candidates;
create policy "titan spec candidates crm access read"
on public.titan_spec_candidates for select to authenticated
using (public.crm_can_access());

drop policy if exists "titan customer specifications crm access read" on public.titan_customer_specifications;
create policy "titan customer specifications crm access read"
on public.titan_customer_specifications for select to authenticated
using (public.crm_can_access());

comment on table public.titan_spec_candidates is
  'Controlled review queue generated from job deviations and closeout debriefs. Candidate knowledge is never operational authority.';
comment on table public.titan_customer_specifications is
  'Approved customer or company requirements promoted through the TITAN specification-intelligence review process.';

commit;
