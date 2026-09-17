-- Private photo evidence linked to DTI inspection rows and serial numbers.

begin;

do $$ begin
  if to_regclass('public.titan_dti_inspection_reports') is null
    or to_regclass('public.titan_dti_inspection_items') is null
    or to_regprocedure('public.titan_dti_controls_can_access()') is null then
    raise exception 'Run the DTI inspection report and DTI controls migrations first.';
  end if;
end $$;

create table if not exists public.titan_dti_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.titan_dti_inspection_reports(id) on delete cascade,
  item_id uuid not null references public.titan_dti_inspection_items(id) on delete cascade,
  component_type text not null check (component_type in ('Drill Pipe','HWDP','Subs')),
  sequence_number integer not null check (sequence_number > 0),
  joint_number text,
  serial_number text,
  finding_key text not null,
  finding_label text not null,
  caption text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 15728640),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_dti_inspection_photos_report_idx
  on public.titan_dti_inspection_photos(report_id, serial_number, created_at desc);
create index if not exists titan_dti_inspection_photos_item_idx
  on public.titan_dti_inspection_photos(item_id, created_at desc);

alter table public.titan_dti_inspection_photos enable row level security;
grant select on public.titan_dti_inspection_photos to authenticated;

drop policy if exists "titan dti inspection photos read" on public.titan_dti_inspection_photos;
create policy "titan dti inspection photos read"
on public.titan_dti_inspection_photos for select to authenticated
using (public.titan_dti_controls_can_access());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'titan-dti-inspection-photos',
  'titan-dti-inspection-photos',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.titan_dti_inspection_photos is
  'Private photographic evidence permanently linked to a DTI report row and its captured serial number.';

commit;
