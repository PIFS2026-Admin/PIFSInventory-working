alter table public.inspectors
  drop constraint if exists inspectors_role_check;

update public.inspectors
set role = 'level_2_inspector'
where role = 'crew_lead';

alter table public.inspectors
  add constraint inspectors_role_check
  check (role in ('lead_inspector', 'level_2_inspector', 'both'));
