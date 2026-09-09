-- HR-CM-001 inspector competency matrix.
-- Additive, rerunnable, and Wade-only during controlled rollout.

begin;

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.documents') is null
    or to_regprocedure('public.crm_can_access()') is null then
    raise exception 'The TITAN profiles, Document Control, and Connected Jobs foundations are required.';
  end if;
end $$;

create table if not exists public.titan_inspectors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  iom_level text not null default 'Level 1 - Entry/Support',
  title text,
  osp_score numeric(5,2) check (osp_score is null or osp_score between 0 and 100),
  field_score numeric(5,2) check (field_score is null or field_score between 0 and 100),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titan_competency_skills (
  skill_code text primary key,
  skill_name text not null unique,
  service_line text not null default 'DTI',
  reference_text text,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titan_skill_ratings (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.titan_inspectors(id) on delete restrict,
  skill_code text not null references public.titan_competency_skills(skill_code) on delete restrict,
  rating integer not null check (rating between 0 and 4),
  witnessed_by uuid references auth.users(id) on delete set null,
  effective_date date not null default current_date,
  note text,
  is_current boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists titan_skill_ratings_current_unique
on public.titan_skill_ratings(inspector_id, skill_code) where is_current;

create table if not exists public.titan_ds1_qualifications (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.titan_inspectors(id) on delete restrict,
  category text not null check (category in ('Cat 1','Cat 2','Cat 3','Cat 4','Cat 5','HDLS')),
  qualification_status text not null check (qualification_status in ('Not Qualified','In Training','Qualified','Lead Qualified')),
  effective_date date not null default current_date,
  witnessed_by uuid references auth.users(id) on delete set null,
  note text,
  is_current boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists titan_ds1_qualifications_current_unique
on public.titan_ds1_qualifications(inspector_id, category) where is_current;

create table if not exists public.titan_asnt_certifications (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.titan_inspectors(id) on delete restrict,
  method text not null check (method in ('VT','UT','MT','ET','PT')),
  certification_level text not null check (certification_level in ('None','I','II','III')),
  certificate_number text,
  issued_date date,
  expires_on date,
  status text not null default 'Active' check (status in ('Active','Expired','Revoked')),
  evidence_document_id uuid references public.documents(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspector_id, method)
);

create table if not exists public.titan_training_gaps (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.titan_inspectors(id) on delete restrict,
  priority text not null check (priority in ('High','Medium','Low')),
  gap_text text not null,
  scope_category text,
  current_state text,
  target_state text not null,
  training_action text not null,
  due_date date not null,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text not null,
  gap_status text not null default 'Planned' check (gap_status in ('Planned','In Progress','Complete','Voided')),
  completion_evidence_document_id uuid references public.documents(id) on delete restrict,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  void_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint titan_training_gap_complete_check check (
    gap_status <> 'Complete' or (completion_evidence_document_id is not null and completed_by is not null and completed_at is not null)
  ),
  constraint titan_training_gap_void_check check (
    gap_status <> 'Voided' or nullif(trim(coalesce(void_reason, '')), '') is not null
  )
);

create index if not exists titan_training_gaps_open_idx on public.titan_training_gaps(gap_status, priority, due_date);

insert into public.titan_competency_skills (skill_code, skill_name, reference_text, sort_order)
values
  ('PIN_CLEANING','Pin Cleaning','IOM 7.5.2',10),
  ('BOX_CLEANING','Box Cleaning','IOM 7.5.3',20),
  ('OD_GAUGING','OD Gauging','IOM 7.11',30),
  ('UT_WALL','UT Wall','IOM 7.4',40),
  ('MPI_UPSETS','MPI Upsets','IOM 7.2',50),
  ('THREAD_SEAL','Thread and Seal Inspection','IOM 7.6',60),
  ('API_REFACING','API Refacing','IOM 7.8.1',70),
  ('EMI_OPERATION','EMI Operation','IOM 8',80),
  ('EMI_INTERPRETATION','EMI Signal Interpretation','IOM 8.4',90),
  ('DIMENSIONAL','Dimensional Inspection','IOM 7.11',100),
  ('HARDBAND','Hardband Inspection','IOM 7',110),
  ('REPORT_WRITING','Report Writing','IOM 13',120),
  ('DS_REFACE','DS Reface Sandpaper','IOM 7.8',130),
  ('SAMSS_LATHE','Samss Lathe Refacing','IOM 9',140),
  ('DRIFT_TESTING','Drift Testing','IOM / service procedure',150),
  ('FIELD_JUDGMENT','Field Judgment','IOM 3',160)
on conflict (skill_code) do update set skill_name=excluded.skill_name, reference_text=excluded.reference_text,
  sort_order=excluded.sort_order, updated_at=now();

create or replace function public.recompute_titan_inspector_score(p_inspector_id uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare score_value numeric(5,2);
begin
  select round(avg(rating)::numeric / 4 * 100, 2) into score_value
  from public.titan_skill_ratings where inspector_id=p_inspector_id and is_current;
  update public.titan_inspectors set field_score=score_value, updated_at=now() where id=p_inspector_id;
  return score_value;
end;
$$;

create or replace function public.save_titan_skill_rating(
  p_inspector_id uuid, p_skill_code text, p_rating integer, p_witnessed_by uuid,
  p_effective_date date, p_note text, p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.titan_skill_ratings%rowtype; score_value numeric;
begin
  if not exists (select 1 from public.titan_inspectors where id=p_inspector_id and status='Active') then raise exception 'Active inspector not found.'; end if;
  if not exists (select 1 from public.titan_competency_skills where skill_code=p_skill_code and is_active) then raise exception 'Active skill not found.'; end if;
  if p_rating not between 0 and 4 then raise exception 'Skill rating must be between 0 and 4.'; end if;
  if p_rating > 2 and (p_witnessed_by is null or not exists (
    select 1 from public.titan_inspectors inspector
    join public.titan_ds1_qualifications qualification on qualification.inspector_id=inspector.id
      and qualification.is_current and qualification.qualification_status='Lead Qualified'
    where inspector.profile_id=p_witnessed_by and inspector.status='Active'
  )) then raise exception 'Ratings above 2 require a current Lead Qualified witness.'; end if;
  update public.titan_skill_ratings set is_current=false where inspector_id=p_inspector_id and skill_code=p_skill_code and is_current;
  insert into public.titan_skill_ratings(inspector_id,skill_code,rating,witnessed_by,effective_date,note,created_by)
  values(p_inspector_id,p_skill_code,p_rating,p_witnessed_by,coalesce(p_effective_date,current_date),nullif(trim(coalesce(p_note,'')),''),p_actor_id)
  returning * into saved;
  score_value := public.recompute_titan_inspector_score(p_inspector_id);
  return jsonb_build_object('ok',true,'rating',to_jsonb(saved),'fieldScore',score_value);
end;
$$;

create or replace function public.save_titan_ds1_qualification(
  p_inspector_id uuid, p_category text, p_status text, p_witnessed_by uuid,
  p_effective_date date, p_note text, p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.titan_ds1_qualifications%rowtype;
begin
  if not exists (select 1 from public.titan_inspectors where id=p_inspector_id and status='Active') then raise exception 'Active inspector not found.'; end if;
  if p_category not in ('Cat 1','Cat 2','Cat 3','Cat 4','Cat 5','HDLS') then raise exception 'Invalid DS-1 category.'; end if;
  if p_status not in ('Not Qualified','In Training','Qualified','Lead Qualified') then raise exception 'Invalid qualification status.'; end if;
  update public.titan_ds1_qualifications set is_current=false where inspector_id=p_inspector_id and category=p_category and is_current;
  insert into public.titan_ds1_qualifications(inspector_id,category,qualification_status,witnessed_by,effective_date,note,created_by)
  values(p_inspector_id,p_category,p_status,p_witnessed_by,coalesce(p_effective_date,current_date),nullif(trim(coalesce(p_note,'')),''),p_actor_id)
  returning * into saved;
  return jsonb_build_object('ok',true,'qualification',to_jsonb(saved));
end;
$$;

create or replace function public.set_titan_competency_updated_at()
returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists set_titan_inspectors_updated_at on public.titan_inspectors;
create trigger set_titan_inspectors_updated_at before update on public.titan_inspectors for each row execute function public.set_titan_competency_updated_at();
drop trigger if exists set_titan_asnt_updated_at on public.titan_asnt_certifications;
create trigger set_titan_asnt_updated_at before update on public.titan_asnt_certifications for each row execute function public.set_titan_competency_updated_at();
drop trigger if exists set_titan_training_gap_updated_at on public.titan_training_gaps;
create trigger set_titan_training_gap_updated_at before update on public.titan_training_gaps for each row execute function public.set_titan_competency_updated_at();

revoke all on function public.recompute_titan_inspector_score(uuid) from public,anon,authenticated;
revoke all on function public.save_titan_skill_rating(uuid,text,integer,uuid,date,text,uuid) from public,anon,authenticated;
revoke all on function public.save_titan_ds1_qualification(uuid,text,text,uuid,date,text,uuid) from public,anon,authenticated;
grant execute on function public.recompute_titan_inspector_score(uuid) to service_role;
grant execute on function public.save_titan_skill_rating(uuid,text,integer,uuid,date,text,uuid) to service_role;
grant execute on function public.save_titan_ds1_qualification(uuid,text,text,uuid,date,text,uuid) to service_role;

alter table public.titan_inspectors enable row level security;
alter table public.titan_competency_skills enable row level security;
alter table public.titan_skill_ratings enable row level security;
alter table public.titan_ds1_qualifications enable row level security;
alter table public.titan_asnt_certifications enable row level security;
alter table public.titan_training_gaps enable row level security;

grant select on public.titan_inspectors,public.titan_competency_skills,public.titan_skill_ratings,
  public.titan_ds1_qualifications,public.titan_asnt_certifications,public.titan_training_gaps to authenticated;

drop policy if exists "titan competency crm read" on public.titan_inspectors;
create policy "titan competency crm read" on public.titan_inspectors for select to authenticated using(public.crm_can_access());
drop policy if exists "titan skills crm read" on public.titan_competency_skills;
create policy "titan skills crm read" on public.titan_competency_skills for select to authenticated using(public.crm_can_access());
drop policy if exists "titan ratings crm read" on public.titan_skill_ratings;
create policy "titan ratings crm read" on public.titan_skill_ratings for select to authenticated using(public.crm_can_access());
drop policy if exists "titan ds1 crm read" on public.titan_ds1_qualifications;
create policy "titan ds1 crm read" on public.titan_ds1_qualifications for select to authenticated using(public.crm_can_access());
drop policy if exists "titan asnt crm read" on public.titan_asnt_certifications;
create policy "titan asnt crm read" on public.titan_asnt_certifications for select to authenticated using(public.crm_can_access());
drop policy if exists "titan gaps crm read" on public.titan_training_gaps;
create policy "titan gaps crm read" on public.titan_training_gaps for select to authenticated using(public.crm_can_access());

comment on table public.titan_inspectors is 'HR-CM-001 inspector extension of the existing TITAN profile directory.';
comment on table public.titan_skill_ratings is 'Permanent skill-rating history; one current rating per inspector and skill.';
comment on table public.titan_training_gaps is 'Controlled inspector training actions and evidence-backed closure.';

commit;
