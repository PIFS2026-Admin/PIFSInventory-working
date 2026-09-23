begin;

create table if not exists public.titan_financial_market_services (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  service_key text not null,
  name text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, service_key)
);

create table if not exists public.titan_financial_market_rigs (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  source_key text not null,
  rig_name text not null default '',
  operator text not null default '',
  segment text not null default 'Competitor',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, source_key)
);

create table if not exists public.titan_financial_market_cells (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  rig_id uuid not null references public.titan_financial_market_rigs(id) on delete restrict,
  service_id uuid not null references public.titan_financial_market_services(id) on delete restrict,
  kind text not null check (kind in ('pf', 'shared', 'comp', 'unknown', 'na')),
  holder_name text,
  effective_date date not null,
  source_key text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (yard_id, rig_id, service_id, effective_date)
);

create index if not exists titan_financial_market_cells_snapshot_idx
  on public.titan_financial_market_cells(yard_id, effective_date desc, rig_id, service_id);

create table if not exists public.titan_financial_market_competitors (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  canonical_name text not null,
  service_keys jsonb not null default '[]'::jsonb,
  aliases jsonb not null default '[]'::jsonb,
  is_pathfinder boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, canonical_name)
);

create table if not exists public.titan_financial_market_trend (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  service_key text not null,
  quarter text not null check (quarter ~ '^\d{4}-Q[1-4]$'),
  won_pct numeric(8,6) not null check (won_pct between 0 and 1),
  shared_pct numeric(8,6) check (shared_pct between 0 and 1),
  source text not null default 'compass',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, service_key, quarter)
);

alter table public.titan_financial_market_services enable row level security;
alter table public.titan_financial_market_rigs enable row level security;
alter table public.titan_financial_market_cells enable row level security;
alter table public.titan_financial_market_competitors enable row level security;
alter table public.titan_financial_market_trend enable row level security;

grant select, insert, update on
  public.titan_financial_market_services,
  public.titan_financial_market_rigs,
  public.titan_financial_market_cells,
  public.titan_financial_market_competitors,
  public.titan_financial_market_trend
to service_role;

comment on table public.titan_financial_market_cells is
  'Effective-dated rig and service market positions. Historical snapshots are retained for trend and audit use.';

commit;
