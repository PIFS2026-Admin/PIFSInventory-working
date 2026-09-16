-- Give every active TITAN user with DTI module access the full DTI workspace.
-- Additive and rerunnable. Existing DTI records and policies are preserved.

begin;

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.user_module_permissions') is null
    or to_regclass('public.user_permission_overrides') is null then
    raise exception 'Run the TITAN role and person-centered access migrations first.';
  end if;
end $$;

create or replace function public.titan_dti_controls_can_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select
      p.id,
      lower(p.role::text) as role_key,
      coalesce(p.access_configured, false) as access_configured
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_disabled, false) = false
  ),
  saved_modules as (
    select ump.module_key
    from public.user_module_permissions ump
    join current_profile p on p.id = ump.user_id
    where coalesce(ump.can_access, true)
  ),
  role_defaults as (
    select
      p.*,
      p.role_key in (
        'admin', 'owner', 'employee', 'service_line_manager', 'dti_superintendent',
        'dti_lead', 'dti_inspector', 'level_2_inspector', 'lead_inspector'
      ) as dti_view,
      p.role_key in (
        'admin', 'owner', 'employee', 'service_line_manager', 'dti_superintendent',
        'lead_inspector'
      ) as scorecard_view
    from current_profile p
  ),
  effective_defaults as (
    select
      p.id,
      p.role_key,
      p.access_configured,
      coalesce((
        select upo.is_allowed
        from public.user_permission_overrides upo
        where upo.user_id = p.id and upo.module_key = 'dti' and upo.action_key = 'view'
        limit 1
      ), p.dti_view) as dti_view,
      coalesce((
        select upo.is_allowed
        from public.user_permission_overrides upo
        where upo.user_id = p.id and upo.module_key = 'lead_scorecards' and upo.action_key = 'view'
        limit 1
      ), p.scorecard_view) as scorecard_view
    from role_defaults p
  )
  select exists (
    select 1
    from effective_defaults p
    where p.role_key in ('admin', 'owner')
      or (
        p.access_configured
        and exists (select 1 from saved_modules where module_key = 'dti')
      )
      or (
        not p.access_configured
        and case
          when exists (select 1 from saved_modules)
            then exists (select 1 from saved_modules where module_key = 'dti')
          else p.dti_view or p.scorecard_view
        end
      )
  );
$$;

revoke all on function public.titan_dti_controls_can_access() from public, anon;
grant execute on function public.titan_dti_controls_can_access() to authenticated, service_role;

drop policy if exists "dti module full access" on public.dti_jobs;
create policy "dti module full access" on public.dti_jobs
for all to authenticated
using (public.titan_dti_controls_can_access())
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module full access" on public.dti_checklist_responses;
create policy "dti module full access" on public.dti_checklist_responses
for all to authenticated
using (public.titan_dti_controls_can_access())
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module full access" on public.dti_status_history;
create policy "dti module full access" on public.dti_status_history
for all to authenticated
using (public.titan_dti_controls_can_access())
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module full access" on public.dti_grading_templates;
create policy "dti module full access" on public.dti_grading_templates
for all to authenticated
using (public.titan_dti_controls_can_access())
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module full access" on public.dti_grading_template_versions;
create policy "dti module full access" on public.dti_grading_template_versions
for all to authenticated
using (public.titan_dti_controls_can_access())
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module full access" on public.dti_grading_sections;
create policy "dti module full access" on public.dti_grading_sections
for all to authenticated
using (public.titan_dti_controls_can_access())
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module full access" on public.dti_grading_items;
create policy "dti module full access" on public.dti_grading_items
for all to authenticated
using (public.titan_dti_controls_can_access())
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module full access" on public.dti_grading_attachments;
create policy "dti module full access" on public.dti_grading_attachments
for all to authenticated
using (public.titan_dti_controls_can_access())
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module companies read" on public.companies;
create policy "dti module companies read" on public.companies
for select to authenticated
using (public.titan_dti_controls_can_access());

drop policy if exists "dti module companies create" on public.companies;
create policy "dti module companies create" on public.companies
for insert to authenticated
with check (public.titan_dti_controls_can_access());

drop policy if exists "dti module inspectors read" on public.inspectors;
create policy "dti module inspectors read" on public.inspectors
for select to authenticated
using (public.titan_dti_controls_can_access());

grant select, insert, update, delete on
  public.dti_jobs,
  public.dti_checklist_responses,
  public.dti_status_history,
  public.dti_grading_templates,
  public.dti_grading_template_versions,
  public.dti_grading_sections,
  public.dti_grading_items,
  public.dti_grading_attachments
to authenticated;

comment on function public.titan_dti_controls_can_access() is
  'Returns true when the signed-in, active TITAN user has effective access to the DTI module.';

commit;
