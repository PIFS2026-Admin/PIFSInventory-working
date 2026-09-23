begin;

create table if not exists public.titan_financial_review_sections (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.titan_financial_reviews(id) on delete restrict,
  position integer not null default 0,
  kind text not null check (kind in ('metric', 'chart', 'narrative', 'manual_metric')),
  title text,
  config jsonb not null default '{}'::jsonb,
  body text,
  snapshot jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists titan_financial_review_sections_review_idx
  on public.titan_financial_review_sections(review_id, position, created_at);

alter table public.titan_financial_review_sections enable row level security;

grant select, insert, update on public.titan_financial_review_sections to service_role;

comment on table public.titan_financial_review_sections is
  'Ordered review-composer sections. Sections are soft-deactivated and their computed values freeze when the review is finalized.';

commit;
