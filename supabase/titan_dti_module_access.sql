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
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and coalesce(profile.is_disabled, false) = false
      and (
        lower(profile.role::text) in ('admin', 'owner')
        or (
          coalesce(profile.access_configured, false)
          and exists (
            select 1
            from public.user_module_permissions ump
            where ump.user_id = profile.id
              and ump.module_key = 'dti'
              and coalesce(ump.can_access, true)
          )
        )
        or (
          not coalesce(profile.access_configured, false)
          and case
            when exists (
              select 1
              from public.user_module_permissions ump
              where ump.user_id = profile.id
                and coalesce(ump.can_access, true)
            ) then exists (
              select 1
              from public.user_module_permissions ump
              where ump.user_id = profile.id
                and ump.module_key = 'dti'
                and coalesce(ump.can_access, true)
            )
            else
              coalesce((
                select upo.is_allowed
                from public.user_permission_overrides upo
                where upo.user_id = profile.id
                  and upo.module_key = 'dti'
                  and upo.action_key = 'view'
                limit 1
              ), lower(profile.role::text) in (
                'admin', 'owner', 'employee', 'service_line_manager', 'dti_superintendent',
                'dti_lead', 'dti_inspector', 'level_2_inspector', 'lead_inspector'
              ))
              or coalesce((
                select upo.is_allowed
                from public.user_permission_overrides upo
                where upo.user_id = profile.id
                  and upo.module_key = 'lead_scorecards'
                  and upo.action_key = 'view'
                limit 1
              ), lower(profile.role::text) in (
                'admin', 'owner', 'employee', 'service_line_manager', 'dti_superintendent',
                'lead_inspector'
              ))
          end
        )
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
