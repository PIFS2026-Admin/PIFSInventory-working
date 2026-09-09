-- Move Field Audits and Inspector Competency access from CRM to the DTI module.
-- Additive and rerunnable. Existing audit, finding, inspector, rating, and training data is preserved.

begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'The TITAN profiles table is required.';
  end if;

  if to_regclass('public.titan_field_audit_checklist') is null
    or to_regclass('public.titan_field_audits') is null
    or to_regclass('public.titan_field_audit_items') is null
    or to_regclass('public.titan_audit_findings') is null then
    raise exception 'Run supabase/titan_field_audits.sql first.';
  end if;

  if to_regclass('public.titan_inspectors') is null
    or to_regclass('public.titan_competency_skills') is null
    or to_regclass('public.titan_skill_ratings') is null
    or to_regclass('public.titan_ds1_qualifications') is null
    or to_regclass('public.titan_asnt_certifications') is null
    or to_regclass('public.titan_training_gaps') is null then
    raise exception 'Run supabase/titan_competency_matrix.sql first.';
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

alter table public.titan_field_audit_checklist enable row level security;
alter table public.titan_field_audits enable row level security;
alter table public.titan_field_audit_items enable row level security;
alter table public.titan_audit_findings enable row level security;
alter table public.titan_inspectors enable row level security;
alter table public.titan_competency_skills enable row level security;
alter table public.titan_skill_ratings enable row level security;
alter table public.titan_ds1_qualifications enable row level security;
alter table public.titan_asnt_certifications enable row level security;
alter table public.titan_training_gaps enable row level security;

grant select on public.titan_field_audit_checklist, public.titan_field_audits,
  public.titan_field_audit_items, public.titan_audit_findings,
  public.titan_inspectors, public.titan_competency_skills,
  public.titan_skill_ratings, public.titan_ds1_qualifications,
  public.titan_asnt_certifications, public.titan_training_gaps
to authenticated;

drop policy if exists "titan field audit checklist crm access read" on public.titan_field_audit_checklist;
drop policy if exists "titan field audit checklist dti access read" on public.titan_field_audit_checklist;
create policy "titan field audit checklist dti access read"
  on public.titan_field_audit_checklist for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan field audits crm access read" on public.titan_field_audits;
drop policy if exists "titan field audits dti access read" on public.titan_field_audits;
create policy "titan field audits dti access read"
  on public.titan_field_audits for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan field audit items crm access read" on public.titan_field_audit_items;
drop policy if exists "titan field audit items dti access read" on public.titan_field_audit_items;
create policy "titan field audit items dti access read"
  on public.titan_field_audit_items for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan audit findings crm access read" on public.titan_audit_findings;
drop policy if exists "titan audit findings dti access read" on public.titan_audit_findings;
create policy "titan audit findings dti access read"
  on public.titan_audit_findings for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan competency crm read" on public.titan_inspectors;
drop policy if exists "titan competency dti read" on public.titan_inspectors;
create policy "titan competency dti read"
  on public.titan_inspectors for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan skills crm read" on public.titan_competency_skills;
drop policy if exists "titan skills dti read" on public.titan_competency_skills;
create policy "titan skills dti read"
  on public.titan_competency_skills for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan ratings crm read" on public.titan_skill_ratings;
drop policy if exists "titan ratings dti read" on public.titan_skill_ratings;
create policy "titan ratings dti read"
  on public.titan_skill_ratings for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan ds1 crm read" on public.titan_ds1_qualifications;
drop policy if exists "titan ds1 dti read" on public.titan_ds1_qualifications;
create policy "titan ds1 dti read"
  on public.titan_ds1_qualifications for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan asnt crm read" on public.titan_asnt_certifications;
drop policy if exists "titan asnt dti read" on public.titan_asnt_certifications;
create policy "titan asnt dti read"
  on public.titan_asnt_certifications for select to authenticated
  using (public.titan_dti_controls_can_access());

drop policy if exists "titan gaps crm read" on public.titan_training_gaps;
drop policy if exists "titan gaps dti read" on public.titan_training_gaps;
create policy "titan gaps dti read"
  on public.titan_training_gaps for select to authenticated
  using (public.titan_dti_controls_can_access());

commit;
