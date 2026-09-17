-- Phase 2: stored automatic classifications and tool-joint criteria support.

begin;

do $$
begin
  if to_regclass('public.titan_dti_criteria_rules') is null then
    raise exception 'Run supabase/titan_dti_acceptance_criteria.sql first.';
  end if;
  if to_regclass('public.titan_dti_inspection_items') is null then
    raise exception 'Run supabase/titan_dti_inspection_reports.sql first.';
  end if;
end $$;

alter table public.titan_dti_criteria_rules
  add column if not exists value_unit text;

update public.titan_dti_criteria_rules
set value_unit = case
  when field_key = 'percentNominalWall' then 'Percent'
  when lower(coalesce(expected_value, '')) in ('yes','no','true','false') then 'Yes/No'
  when comparison = 'Required' then 'Text'
  else 'Inches'
end
where value_unit is null or btrim(value_unit) = '';

alter table public.titan_dti_criteria_rules
  drop constraint if exists titan_dti_criteria_rules_inspection_area_check;

alter table public.titan_dti_criteria_rules
  add constraint titan_dti_criteria_rules_inspection_area_check
  check (inspection_area in ('Tube','Box','Pin','Tool Joint','Joint'));

alter table public.titan_dti_inspection_items
  add column if not exists grading_result jsonb,
  add column if not exists graded_at timestamptz,
  add column if not exists grading_criteria_version_id uuid
    references public.titan_dti_criteria_versions(id) on delete restrict;

create index if not exists titan_dti_inspection_items_grading_version_idx
  on public.titan_dti_inspection_items (grading_criteria_version_id);

comment on column public.titan_dti_criteria_rules.value_unit is
'Display and normalization unit such as Inches, Percent, Yes/No, Count, or Text.';
comment on column public.titan_dti_inspection_items.grading_result is
'Stored Tube, Box, Pin, Tool Joint, Joint, and Final Joint automatic classification with failed-rule reasons.';
comment on column public.titan_dti_inspection_items.grading_criteria_version_id is
'Published criteria version from the report snapshot used for this automatic classification.';

commit;
