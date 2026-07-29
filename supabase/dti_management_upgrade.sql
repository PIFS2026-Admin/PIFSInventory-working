create extension if not exists pgcrypto;

alter table public.dti_jobs add column if not exists grading_snapshot jsonb;
alter table public.dti_jobs add column if not exists grading_template_version_id uuid;
alter table public.dti_jobs add column if not exists grading_started_at timestamptz;
alter table public.dti_jobs add column if not exists grading_finalized_at timestamptz;

alter table public.dti_checklist_responses add column if not exists grading_item_id uuid;
alter table public.dti_checklist_responses add column if not exists max_score numeric default 5;
alter table public.dti_checklist_responses add column if not exists is_required boolean default false;
alter table public.dti_checklist_responses add column if not exists comments_required boolean default false;
alter table public.dti_checklist_responses add column if not exists photo_required boolean default false;
alter table public.dti_checklist_responses add column if not exists attachment_url text;
alter table public.dti_checklist_responses add column if not exists finalized_at timestamptz;

create table if not exists public.dti_grading_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dti_grading_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.dti_grading_templates(id) on delete cascade,
  version_number integer not null,
  status text not null default 'Draft' check (status in ('Draft', 'Published', 'Retired')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, version_number)
);

create table if not exists public.dti_grading_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.dti_grading_templates(id) on delete cascade,
  template_version_id uuid references public.dti_grading_template_versions(id) on delete set null,
  section text not null,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dti_grading_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.dti_grading_templates(id) on delete cascade,
  template_version_id uuid references public.dti_grading_template_versions(id) on delete set null,
  section_id uuid references public.dti_grading_sections(id) on delete set null,
  section text not null,
  category text,
  requirement text not null,
  definition text,
  priority text not null default 'Standard',
  weight numeric,
  max_score numeric not null default 5,
  display_order integer not null default 0,
  is_required boolean not null default true,
  is_red_flag boolean not null default false,
  comments_required boolean not null default false,
  photo_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dti_grading_attachments (
  id uuid primary key default gen_random_uuid(),
  dti_job_id uuid not null references public.dti_jobs(id) on delete cascade,
  checklist_response_id uuid references public.dti_checklist_responses(id) on delete cascade,
  file_name text,
  file_path text not null,
  file_url text,
  file_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index if not exists dti_grading_sections_template_idx on public.dti_grading_sections(template_id, display_order);
create index if not exists dti_grading_items_template_idx on public.dti_grading_items(template_id, display_order);
create index if not exists dti_grading_items_active_idx on public.dti_grading_items(is_active, display_order);
create index if not exists dti_grading_attachments_job_idx on public.dti_grading_attachments(dti_job_id);
create index if not exists dti_checklist_responses_grading_item_idx on public.dti_checklist_responses(grading_item_id);

do $$
declare
  template_uuid uuid;
  version_uuid uuid;
begin
  insert into public.dti_grading_templates (name, description, is_active)
  values ('Default DTI Scorecard', 'Default configurable DTI job grading template.', true)
  on conflict (name) do update
    set description = excluded.description,
        is_active = true,
        updated_at = now()
  returning id into template_uuid;

  insert into public.dti_grading_template_versions (template_id, version_number, status, published_at)
  values (template_uuid, 1, 'Published', now())
  on conflict (template_id, version_number) do update
    set status = excluded.status,
        published_at = coalesce(public.dti_grading_template_versions.published_at, excluded.published_at),
        updated_at = now()
  returning id into version_uuid;

  insert into public.dti_grading_items (
    template_id,
    template_version_id,
    section,
    category,
    requirement,
    definition,
    priority,
    weight,
    max_score,
    display_order,
    is_required,
    is_red_flag,
    comments_required,
    photo_required,
    is_active
  )
  select
    template_uuid,
    version_uuid,
    source.section,
    source.category,
    source.requirement,
    source.definition,
    source.priority,
    source.weight,
    5,
    source.sort_order,
    true,
    false,
    false,
    false,
    true
  from (
    select distinct on (lower(coalesce(section, '')), lower(coalesce(category, '')), lower(coalesce(requirement, '')))
      coalesce(section, 'General') as section,
      category,
      coalesce(requirement, 'Checklist item') as requirement,
      definition,
      coalesce(priority, 'Standard') as priority,
      weight,
      coalesce(sort_order, 0) as sort_order
    from public.dti_checklist_responses
    where requirement is not null
    order by lower(coalesce(section, '')), lower(coalesce(category, '')), lower(coalesce(requirement, '')), sort_order
  ) source
  where not exists (select 1 from public.dti_grading_items);

  insert into public.dti_grading_items (
    template_id,
    template_version_id,
    section,
    category,
    requirement,
    definition,
    priority,
    weight,
    max_score,
    display_order,
    is_required,
    is_red_flag,
    comments_required,
    photo_required,
    is_active
  )
  select *
  from (
    values
      (template_uuid, version_uuid, 'Pre-Job', 'Job Confirmation', 'Job confirmed with Operator / CM', 'Scope, timing, location, and joint count verified before crew arrival.', 'High', null::numeric, 5::numeric, 1, true, false, false, false, true),
      (template_uuid, version_uuid, 'Pre-Job', 'Crew Readiness', 'Crew confirmed', 'Lead inspector, crew count, and start time confirmed.', 'High', null::numeric, 5::numeric, 2, true, false, false, false, true),
      (template_uuid, version_uuid, 'Field Inspection', 'Safety', 'JSA completed', 'JSA signed by all crew before work starts.', 'High', null::numeric, 5::numeric, 3, true, false, false, false, true),
      (template_uuid, version_uuid, 'Summary', 'Closeout', 'Final review complete', 'Superintendent reviewed checklist, red flags, scorecard, and customer concerns.', 'High', null::numeric, 5::numeric, 4, true, false, false, false, true)
  ) as fallback (
    template_id,
    template_version_id,
    section,
    category,
    requirement,
    definition,
    priority,
    weight,
    max_score,
    display_order,
    is_required,
    is_red_flag,
    comments_required,
    photo_required,
    is_active
  )
  where not exists (select 1 from public.dti_grading_items);

  insert into public.dti_grading_sections (template_id, template_version_id, section, display_order, is_active)
  select
    template_uuid,
    version_uuid,
    item.section,
    min(item.display_order),
    true
  from public.dti_grading_items item
  where item.template_id = template_uuid
  group by item.section
  on conflict do nothing;

  update public.dti_grading_items item
  set section_id = section.id
  from public.dti_grading_sections section
  where section.template_id = item.template_id
    and lower(section.section) = lower(item.section)
    and item.section_id is null;
end $$;

alter table public.dti_jobs
  drop constraint if exists dti_jobs_grading_template_version_fk;

alter table public.dti_jobs
  add constraint dti_jobs_grading_template_version_fk
  foreign key (grading_template_version_id)
  references public.dti_grading_template_versions(id)
  on delete set null;

alter table public.dti_checklist_responses
  drop constraint if exists dti_checklist_responses_grading_item_fk;

alter table public.dti_checklist_responses
  add constraint dti_checklist_responses_grading_item_fk
  foreign key (grading_item_id)
  references public.dti_grading_items(id)
  on delete set null;

create or replace function public.set_dti_grading_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_dti_grading_templates_updated_at on public.dti_grading_templates;
create trigger set_dti_grading_templates_updated_at
before update on public.dti_grading_templates
for each row execute function public.set_dti_grading_updated_at();

drop trigger if exists set_dti_grading_template_versions_updated_at on public.dti_grading_template_versions;
create trigger set_dti_grading_template_versions_updated_at
before update on public.dti_grading_template_versions
for each row execute function public.set_dti_grading_updated_at();

drop trigger if exists set_dti_grading_sections_updated_at on public.dti_grading_sections;
create trigger set_dti_grading_sections_updated_at
before update on public.dti_grading_sections
for each row execute function public.set_dti_grading_updated_at();

drop trigger if exists set_dti_grading_items_updated_at on public.dti_grading_items;
create trigger set_dti_grading_items_updated_at
before update on public.dti_grading_items
for each row execute function public.set_dti_grading_updated_at();

alter table public.dti_grading_templates enable row level security;
alter table public.dti_grading_template_versions enable row level security;
alter table public.dti_grading_sections enable row level security;
alter table public.dti_grading_items enable row level security;
alter table public.dti_grading_attachments enable row level security;

drop policy if exists "dti grading read internal" on public.dti_grading_templates;
create policy "dti grading read internal"
on public.dti_grading_templates
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'employee', 'sales', 'dti_superintendent', 'dti_lead', 'dti_inspector')
  )
);

drop policy if exists "dti grading manage admin" on public.dti_grading_templates;
create policy "dti grading manage admin"
on public.dti_grading_templates
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'dti_superintendent')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'dti_superintendent')
  )
);

drop policy if exists "dti grading versions read internal" on public.dti_grading_template_versions;
create policy "dti grading versions read internal"
on public.dti_grading_template_versions
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'employee', 'sales', 'dti_superintendent', 'dti_lead', 'dti_inspector')
  )
);

drop policy if exists "dti grading versions manage admin" on public.dti_grading_template_versions;
create policy "dti grading versions manage admin"
on public.dti_grading_template_versions
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'dti_superintendent')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'dti_superintendent')
  )
);

drop policy if exists "dti grading sections read internal" on public.dti_grading_sections;
create policy "dti grading sections read internal"
on public.dti_grading_sections
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'employee', 'sales', 'dti_superintendent', 'dti_lead', 'dti_inspector')
  )
);

drop policy if exists "dti grading sections manage admin" on public.dti_grading_sections;
create policy "dti grading sections manage admin"
on public.dti_grading_sections
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'dti_superintendent')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'dti_superintendent')
  )
);

drop policy if exists "dti grading items read internal" on public.dti_grading_items;
create policy "dti grading items read internal"
on public.dti_grading_items
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'employee', 'sales', 'dti_superintendent', 'dti_lead', 'dti_inspector')
  )
);

drop policy if exists "dti grading items manage admin" on public.dti_grading_items;
create policy "dti grading items manage admin"
on public.dti_grading_items
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'dti_superintendent')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'dti_superintendent')
  )
);

drop policy if exists "dti grading attachments internal" on public.dti_grading_attachments;
create policy "dti grading attachments internal"
on public.dti_grading_attachments
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'employee', 'dti_superintendent', 'dti_lead', 'dti_inspector')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') in ('admin', 'employee', 'dti_superintendent', 'dti_lead', 'dti_inspector')
  )
);

grant select, insert, update, delete on public.dti_grading_templates to authenticated;
grant select, insert, update, delete on public.dti_grading_template_versions to authenticated;
grant select, insert, update, delete on public.dti_grading_sections to authenticated;
grant select, insert, update, delete on public.dti_grading_items to authenticated;
grant select, insert, update, delete on public.dti_grading_attachments to authenticated;
