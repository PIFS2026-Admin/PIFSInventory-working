-- Repair the initial TITAN job-key normalizer and safely rerun the CRM backfill.
-- Existing CRM rows are read only. This script is idempotent.

create or replace function public.titan_job_clean_key(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '', 'g');
$$;

do $$
declare
  opportunity public.crm_opportunities%rowtype;
begin
  for opportunity in
    select *
    from public.crm_opportunities candidate
    where public.titan_is_job_schedule_opportunity(
      candidate.pipeline_name,
      coalesce(candidate.metadata, '{}'::jsonb)
    )
  loop
    begin
      perform public.sync_crm_opportunity_record_to_titan_job(opportunity);
    exception when others then
      insert into public.titan_job_sync_failures (
        crm_opportunity_id,
        error_message,
        source_snapshot
      ) values (
        opportunity.id,
        sqlerrm,
        jsonb_build_object(
          'opportunity_name', opportunity.opportunity_name,
          'pipeline_name', opportunity.pipeline_name,
          'stage', opportunity.stage,
          'status', opportunity.status,
          'external_id', opportunity.external_id,
          'metadata', coalesce(opportunity.metadata, '{}'::jsonb)
        )
      );
    end;
  end loop;
end $$;
