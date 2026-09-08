-- Connect canonical TITAN jobs to the existing DTI Jobs module.
-- Additive and rerunnable. Existing CRM and DTI jobs are preserved.

do $$
begin
  if to_regclass('public.titan_jobs') is null
    or to_regclass('public.titan_job_links') is null
    or to_regclass('public.dti_jobs') is null then
    raise exception 'TITAN connected jobs and DTI Management must be installed first.';
  end if;
end $$;

create or replace function public.titan_clean_repeated_list(value text)
returns text
language sql
immutable
as $$
  select nullif(string_agg(deduped.item, ', ' order by deduped.first_position), '')
  from (
    select
      (array_agg(trim(part.value) order by part.position))[1] as item,
      min(part.position) as first_position
    from unnest(string_to_array(coalesce(value, ''), ',')) with ordinality as part(value, position)
    where nullif(trim(part.value), '') is not null
    group by lower(trim(part.value))
  ) deduped;
$$;

create or replace function public.clean_titan_job_repeated_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.customer_name := public.titan_clean_repeated_list(new.customer_name);
  new.operator_name := public.titan_clean_repeated_list(new.operator_name);
  new.rig_name := public.titan_clean_repeated_list(new.rig_name);
  new.contact_name := public.titan_clean_repeated_list(new.contact_name);
  new.salesperson_name := public.titan_clean_repeated_list(new.salesperson_name);
  new.lead_name := public.titan_clean_repeated_list(new.lead_name);
  return new;
end;
$$;

drop trigger if exists clean_titan_job_repeated_fields on public.titan_jobs;
create trigger clean_titan_job_repeated_fields
before insert or update on public.titan_jobs
for each row execute function public.clean_titan_job_repeated_fields();

-- Clean only the canonical mirror. Source CRM data is not modified.
update public.titan_jobs
set
  customer_name = public.titan_clean_repeated_list(customer_name),
  operator_name = public.titan_clean_repeated_list(operator_name),
  rig_name = public.titan_clean_repeated_list(rig_name),
  contact_name = public.titan_clean_repeated_list(contact_name),
  salesperson_name = public.titan_clean_repeated_list(salesperson_name),
  lead_name = public.titan_clean_repeated_list(lead_name)
where
  customer_name is distinct from public.titan_clean_repeated_list(customer_name)
  or operator_name is distinct from public.titan_clean_repeated_list(operator_name)
  or rig_name is distinct from public.titan_clean_repeated_list(rig_name)
  or contact_name is distinct from public.titan_clean_repeated_list(contact_name)
  or salesperson_name is distinct from public.titan_clean_repeated_list(salesperson_name)
  or lead_name is distinct from public.titan_clean_repeated_list(lead_name);

alter table public.dti_jobs
  add column if not exists titan_job_id uuid references public.titan_jobs(id) on delete set null;

create unique index if not exists dti_jobs_titan_job_unique
  on public.dti_jobs(titan_job_id)
  where titan_job_id is not null;

comment on column public.dti_jobs.titan_job_id is
  'Canonical TITAN job that prefilled and owns this DTI job record.';
