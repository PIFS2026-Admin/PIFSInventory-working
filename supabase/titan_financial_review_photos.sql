-- Private photo evidence attached to Financial Review composer sections.

begin;

do $$ begin
  if to_regclass('public.titan_financial_review_sections') is null then
    raise exception 'Run titan_financial_review_sections.sql first.';
  end if;
end $$;

alter table public.titan_financial_review_sections
  drop constraint if exists titan_financial_review_sections_kind_check;
alter table public.titan_financial_review_sections
  add constraint titan_financial_review_sections_kind_check
  check (kind in ('metric', 'chart', 'narrative', 'manual_metric', 'photo'));

create table if not exists public.titan_financial_review_photos (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.titan_financial_review_sections(id) on delete restrict,
  caption text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 15728640),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists titan_financial_review_photos_section_idx
  on public.titan_financial_review_photos(section_id, is_active, created_at desc);

alter table public.titan_financial_review_photos enable row level security;
grant select, insert, update on public.titan_financial_review_photos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'titan-financial-review-photos',
  'titan-financial-review-photos',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.titan_financial_review_photos is
  'Private photo evidence linked to an ordered Financial Review photo section. Removal is soft so the audit record remains intact.';

commit;
