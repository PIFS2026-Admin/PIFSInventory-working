-- Canonical document registry for connected TITAN jobs.
-- Existing CRM attachments remain in their current secure storage location;
-- this table records references so every connected module can find them.

begin;

do $$
begin
  if to_regclass('public.titan_jobs') is null
    or to_regclass('public.crm_opportunities') is null then
    raise exception 'Run supabase/titan_connected_job_lifecycle.sql first.';
  end if;
end $$;

create table if not exists public.titan_job_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.titan_jobs(id) on delete cascade,
  document_type text not null,
  display_name text not null,
  storage_url text not null,
  source_module text not null default 'crm',
  source_record_id text,
  source_column text,
  source_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, source_module, source_key)
);

create index if not exists titan_job_documents_job_idx
  on public.titan_job_documents(job_id, archived_at, document_type, created_at desc);

create index if not exists titan_job_documents_source_idx
  on public.titan_job_documents(source_module, source_record_id)
  where archived_at is null;

create or replace function public.titan_job_document_type(p_column text)
returns text
language sql
immutable
as $$
  select case public.titan_job_clean_key(p_column)
    when 'directions' then 'Directions'
    when 'prejobchecklist' then 'Pre Job Checklist'
    when 'invoice' then 'Invoice'
    when 'signedinvoice' then 'Signed Invoice'
    when 'fieldticketdocument' then 'Field Ticket'
    when 'fieldticket' then 'Field Ticket'
    when 'report' then 'Report'
    else coalesce(nullif(trim(p_column), ''), 'Document')
  end;
$$;

create or replace function public.sync_crm_job_documents(p_opportunity_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.titan_jobs%rowtype;
  opportunity public.crm_opportunities%rowtype;
  column_entry record;
  attachment_entry record;
  attachment jsonb;
  file_name text;
  file_url text;
  file_source text;
  file_added_at timestamptz;
  source_key text;
  synced_count integer := 0;
begin
  select * into opportunity
  from public.crm_opportunities
  where id = p_opportunity_id;

  if opportunity.id is null then
    return 0;
  end if;

  select * into job
  from public.titan_jobs
  where crm_opportunity_id = opportunity.id
    and archived_at is null;

  if job.id is null then
    return 0;
  end if;

  update public.titan_job_documents
  set archived_at = now(), updated_at = now()
  where job_id = job.id
    and source_module = 'crm'
    and archived_at is null;

  if jsonb_typeof(coalesce(opportunity.metadata->'titanBoardAttachments', '{}'::jsonb)) = 'object' then
    for column_entry in
      select key, value
      from jsonb_each(coalesce(opportunity.metadata->'titanBoardAttachments', '{}'::jsonb))
    loop
      if jsonb_typeof(column_entry.value) <> 'array' then
        continue;
      end if;

      for attachment_entry in
        select value
        from jsonb_array_elements(column_entry.value)
      loop
        attachment := attachment_entry.value;
        file_name := nullif(trim(coalesce(attachment->>'name', '')), '');
        file_url := nullif(trim(coalesce(attachment->>'url', '')), '');
        file_source := coalesce(nullif(trim(attachment->>'source'), ''), 'CRM');

        begin
          file_added_at := nullif(attachment->>'addedAt', '')::timestamptz;
        exception when others then
          file_added_at := null;
        end;

        if file_url is null then
          continue;
        end if;

        file_name := coalesce(file_name, regexp_replace(file_url, '^.*/', ''));
        source_key := md5(column_entry.key || '|' || file_url || '|' || file_name);

        insert into public.titan_job_documents (
          job_id,
          document_type,
          display_name,
          storage_url,
          source_module,
          source_record_id,
          source_column,
          source_key,
          metadata,
          archived_at,
          created_by,
          created_at,
          updated_at
        ) values (
          job.id,
          public.titan_job_document_type(column_entry.key),
          file_name,
          file_url,
          'crm',
          opportunity.id::text,
          column_entry.key,
          source_key,
          jsonb_build_object('source', file_source),
          null,
          opportunity.created_by,
          coalesce(file_added_at, opportunity.updated_at, now()),
          now()
        )
        on conflict (job_id, source_module, source_key) do update set
          document_type = excluded.document_type,
          display_name = excluded.display_name,
          storage_url = excluded.storage_url,
          source_record_id = excluded.source_record_id,
          source_column = excluded.source_column,
          metadata = excluded.metadata,
          archived_at = null,
          updated_at = now();

        synced_count := synced_count + 1;
      end loop;
    end loop;
  end if;

  -- Preserve downloadable legacy links that predate TITAN-managed attachments.
  if jsonb_typeof(coalesce(opportunity.metadata->'unmappedFieldValues', '{}'::jsonb)) = 'object' then
    for column_entry in
      select key, value
      from jsonb_each_text(coalesce(opportunity.metadata->'unmappedFieldValues', '{}'::jsonb))
      where public.titan_job_clean_key(key) in (
        'directions', 'prejobchecklist', 'invoice', 'signedinvoice',
        'fieldticket', 'fieldticketdocument', 'report'
      )
        and value ~* '^https?://'
    loop
      file_url := trim(column_entry.value);
      file_name := regexp_replace(file_url, '^.*/', '');
      source_key := md5(column_entry.key || '|' || file_url || '|' || file_name);

      insert into public.titan_job_documents (
        job_id, document_type, display_name, storage_url, source_module,
        source_record_id, source_column, source_key, metadata, archived_at,
        created_by, created_at, updated_at
      ) values (
        job.id,
        public.titan_job_document_type(column_entry.key),
        file_name,
        file_url,
        'crm',
        opportunity.id::text,
        column_entry.key,
        source_key,
        jsonb_build_object('source', 'Imported link'),
        null,
        opportunity.created_by,
        opportunity.updated_at,
        now()
      )
      on conflict (job_id, source_module, source_key) do update set
        archived_at = null,
        updated_at = now();

      synced_count := synced_count + 1;
    end loop;
  end if;

  return synced_count;
end;
$$;

revoke all on function public.sync_crm_job_documents(uuid) from public;

create or replace function public.sync_crm_job_documents_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_crm_job_documents(new.id);
  return new;
exception when others then
  begin
    insert into public.titan_job_sync_failures (
      crm_opportunity_id,
      error_message,
      source_snapshot
    ) values (
      new.id,
      'Job document registry sync failed: ' || sqlerrm,
      jsonb_build_object('metadata', coalesce(new.metadata, '{}'::jsonb))
    );
  exception when others then
    raise warning 'Job document registry sync failed and could not be logged: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists sync_crm_job_documents on public.crm_opportunities;
create trigger sync_crm_job_documents
after insert or update of metadata on public.crm_opportunities
for each row execute function public.sync_crm_job_documents_trigger();

-- Read-only backfill into the registry. CRM source rows and stored files are untouched.
do $$
declare
  opportunity_id uuid;
begin
  for opportunity_id in
    select crm_opportunity_id
    from public.titan_jobs
    where crm_opportunity_id is not null
      and archived_at is null
  loop
    begin
      perform public.sync_crm_job_documents(opportunity_id);
    exception when others then
      insert into public.titan_job_sync_failures (
        crm_opportunity_id,
        error_message,
        source_snapshot
      ) values (
        opportunity_id,
        'Job document registry backfill failed: ' || sqlerrm,
        '{}'::jsonb
      );
    end;
  end loop;
end $$;

alter table public.titan_job_documents enable row level security;
grant select on public.titan_job_documents to authenticated;

drop policy if exists "titan job documents crm access read" on public.titan_job_documents;
create policy "titan job documents crm access read"
on public.titan_job_documents for select to authenticated
using (public.crm_can_access());

comment on table public.titan_job_documents is
  'Secure references to documents associated with a canonical TITAN job.';

commit;
