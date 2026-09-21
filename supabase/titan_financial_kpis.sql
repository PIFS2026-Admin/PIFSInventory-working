-- TITAN Financial KPI foundation, ported from the COMPASS S49 handover.
-- Additive and rerunnable. Financial history is immutable by design: saved jobs
-- retain both their computed snapshot and the exact rates used at save time.

begin;

-- The legacy module-access table uses a fixed check constraint. Extend the
-- complete current list before granting Financials access so a fresh or
-- previously upgraded TITAN database can run this migration unchanged.
do $$
begin
  if to_regclass('public.user_module_permissions') is not null then
    alter table public.user_module_permissions
      drop constraint if exists user_module_permissions_module_key_check;

    alter table public.user_module_permissions
      add constraint user_module_permissions_module_key_check check (
        module_key in (
          'yard_view',
          'inventory',
          'purchase_orders',
          'work_orders',
          'dti',
          'dti_summary',
          'hardband',
          'crm',
          'communications',
          'financials',
          'admin',
          'reports',
          'dashboard'
        )
      );
  end if;
end $$;

create table if not exists public.titan_financial_categories (
  id uuid primary key default gen_random_uuid(),
  service_line text not null,
  code text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (service_line, code)
);

create table if not exists public.titan_financial_rates (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  service_line text not null,
  rate_key text not null,
  label text not null,
  rate_value numeric not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, service_line, rate_key)
);

create table if not exists public.titan_financial_rate_periods (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  service_line text not null,
  rate_key text not null,
  effective_from date not null,
  minimum_quantity numeric not null default 0,
  rate_value numeric not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, service_line, rate_key, effective_from, minimum_quantity)
);

create index if not exists titan_financial_rate_periods_lookup_idx
  on public.titan_financial_rate_periods(yard_id, service_line, rate_key, effective_from desc, minimum_quantity desc)
  where is_active;

create table if not exists public.titan_financial_targets (
  id uuid primary key default gen_random_uuid(),
  service_line text not null,
  yard_id uuid references public.yards(id) on delete restrict,
  category_code text not null default 'standard',
  metric_key text not null,
  direction text not null check (direction in ('above','below')),
  target_value numeric not null,
  unit text not null default 'number' check (unit in ('percent','currency','number')),
  label text not null default 'Target',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists titan_financial_targets_default_uq
  on public.titan_financial_targets(service_line, category_code, metric_key) where yard_id is null;
create unique index if not exists titan_financial_targets_yard_uq
  on public.titan_financial_targets(yard_id, service_line, category_code, metric_key) where yard_id is not null;

create table if not exists public.titan_financial_pick_list_values (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  service_line text not null,
  list_key text not null,
  list_value text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, service_line, list_key, list_value)
);

create table if not exists public.titan_financial_jobs (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  service_line text not null check (service_line in ('dti','cdt','hb','trs','wash')),
  job_date date not null,
  category_code text not null default 'standard',
  operator text,
  rig text,
  lead text,
  state text,
  invoice text,
  revenue numeric,
  crew numeric,
  manhours numeric,
  comments text,
  inputs jsonb not null default '{}'::jsonb,
  computed jsonb not null default '{}'::jsonb,
  rates_used jsonb not null default '{}'::jsonb,
  source text not null default 'entered',
  source_key text,
  status text not null default 'active' check (status in ('active','void')),
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint titan_financial_jobs_void_reason_check check (status <> 'void' or nullif(trim(void_reason),'') is not null)
);

create index if not exists titan_financial_jobs_scope_idx
  on public.titan_financial_jobs(yard_id, service_line, job_date desc);
create unique index if not exists titan_financial_jobs_source_key_uq
  on public.titan_financial_jobs(source, source_key) where source_key is not null;

create table if not exists public.titan_financial_tubing_weeks (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  week_start date not null,
  manhours numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, week_start)
);

create table if not exists public.titan_financial_tubing_entries (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  week_start date not null,
  customer text not null,
  joints integer,
  jobs integer,
  trucks_in integer,
  trucks_out integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, week_start, customer)
);

create table if not exists public.titan_financial_tubing_revenue (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  revenue_month date not null,
  customer text,
  amount numeric not null,
  source text not null default 'entered',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists titan_financial_tubing_revenue_uq
  on public.titan_financial_tubing_revenue(yard_id, revenue_month, coalesce(customer,'(total)'));

create table if not exists public.titan_financial_reviews (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete restrict,
  service_line text not null,
  quarter text not null,
  status text not null default 'open' check (status in ('open','final')),
  highlights text,
  lowlights text,
  goals text,
  facts jsonb not null default '{}'::jsonb,
  snapshot jsonb,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (yard_id, service_line, quarter)
);

create table if not exists public.titan_financial_review_snapshots (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.titan_financial_reviews(id) on delete restrict,
  snapshot jsonb not null,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz not null,
  superseded_at timestamptz not null default now(),
  superseded_by uuid references auth.users(id) on delete set null
);

create table if not exists public.titan_financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid references public.yards(id) on delete restrict,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_financial_audit_entity_idx
  on public.titan_financial_audit_log(entity_type, entity_id, created_at desc);

insert into public.titan_financial_categories(service_line, code, label, sort_order)
values
  ('dti','standard','Standard',0), ('dti','bha','BHA',1),
  ('cdt','standard','Standard',0), ('cdt','pmi','Post-mill (PMI)',1),
  ('hb','standard','Standard',0), ('trs','standard','Standard',0),
  ('wash','standard','Standard',0), ('tu','standard','Standard',0)
on conflict (service_line, code) do update set label=excluded.label, sort_order=excluded.sort_order;

insert into public.titan_financial_targets(service_line, category_code, metric_key, direction, target_value, unit, label)
values
  ('cdt','standard','labor_pct','below',0.27,'percent','Optimal'),
  ('cdt','standard','rev_per_mh','above',110,'currency','Optimal'),
  ('cdt','standard','margin','above',0.50,'percent','Goal')
on conflict do nothing;

with defaults(service_line, rate_key, label, rate_value, sort_order) as (
  values
    ('dti','vehicle_hr','Vehicle / Hour',25,10), ('dti','fuel_gal','Fuel / Gallon',3.87,20),
    ('dti','mpg','Miles / Gallon',15,30), ('dti','consumables','Consumables / Day',350,40),
    ('dti','dmr','D/M/R / Manhour',5,50), ('dti','burden','Labor Burden / Manhour',35.26,60),
    ('cdt','vehicle_hr','Vehicle / Hour',25,10), ('cdt','fuel_gal','Fuel / Gallon',3.87,20),
    ('cdt','mpg','Miles / Gallon',15,30), ('cdt','consumables','Consumables / Job',150,40),
    ('cdt','dmr','D/M/R / Manhour',5,50), ('cdt','burden','Labor Burden / Manhour',36.19,60),
    ('cdt','overhead','Overhead % Revenue',0.13,70),
    ('hb','vehicle_hr','Vehicle / Hour',25,10), ('hb','fuel_gal','Fuel / Gallon',4,20),
    ('hb','mpg','Miles / Gallon',15,30), ('hb','consumables','Consumables / Day',150,40),
    ('hb','dmr','D/M/R / Manhour',5,50), ('hb','burden','Labor Burden / Manhour',39.41,60),
    ('hb','wire_lb','Wire / Pound',11.55,70),
    ('trs','vehicle_hr','Vehicle / Hour',15,10), ('trs','fuel_gal','Fuel / Gallon',4,20),
    ('trs','mpg','Miles / Gallon',5,30), ('trs','consumables','Consumables / Job',150,40),
    ('trs','dmr','D/M/R / Manhour',5,50), ('trs','burden','Labor Burden / Manhour',46.13,60),
    ('wash','vehicles','Vehicles',4,5), ('wash','vehicle_hr','Vehicle / Hour',25,10),
    ('wash','fuel_gal','Fuel / Gallon',4,20), ('wash','mpg','Miles / Gallon',15,30),
    ('wash','consumables','Consumables / Job',150,40), ('wash','dmr','D/M/R / Manhour',5,50),
    ('wash','burden','Labor Burden / Manhour',40,60), ('wash','overhead','Overhead % Revenue',0.13,70)
)
insert into public.titan_financial_rates(yard_id, service_line, rate_key, label, rate_value, sort_order)
select yard.id, defaults.service_line, defaults.rate_key, defaults.label, defaults.rate_value, defaults.sort_order
from public.yards yard cross join defaults
where yard.is_active
on conflict (yard_id, service_line, rate_key) do nothing;

do $$
begin
  if to_regclass('public.role_permission_defaults') is not null then
    insert into public.role_permission_defaults(role_key, module_key, action_key, is_allowed)
    select role_key, 'financials', action_key, true
    from (values ('admin'),('owner')) roles(role_key)
    cross join (values ('view'),('create'),('edit'),('delete'),('approve'),('close'),('export'),('manage_settings'),('receive_notifications')) actions(action_key)
    on conflict (role_key,module_key,action_key) do update set is_allowed=true;

    insert into public.role_permission_defaults(role_key, module_key, action_key, is_allowed)
    select 'service_line_manager', 'financials', action_key, true
    from (values ('view'),('create'),('edit'),('approve'),('export'),('manage_settings')) actions(action_key)
    on conflict (role_key,module_key,action_key) do update set is_allowed=true;

    insert into public.role_permission_defaults(role_key, module_key, action_key, is_allowed)
    select 'office_admin', 'financials', action_key, true
    from (values ('view'),('create'),('edit'),('export')) actions(action_key)
    on conflict (role_key,module_key,action_key) do update set is_allowed=true;
  end if;

  if to_regclass('public.user_module_permissions') is not null then
    insert into public.user_module_permissions(user_id, module_key, can_access)
    select id, 'financials', true from public.profiles where lower(role::text) in ('admin','owner')
    on conflict (user_id,module_key) do update set can_access=true;
  end if;
end $$;

alter table public.titan_financial_categories enable row level security;
alter table public.titan_financial_rates enable row level security;
alter table public.titan_financial_rate_periods enable row level security;
alter table public.titan_financial_targets enable row level security;
alter table public.titan_financial_pick_list_values enable row level security;
alter table public.titan_financial_jobs enable row level security;
alter table public.titan_financial_tubing_weeks enable row level security;
alter table public.titan_financial_tubing_entries enable row level security;
alter table public.titan_financial_tubing_revenue enable row level security;
alter table public.titan_financial_reviews enable row level security;
alter table public.titan_financial_review_snapshots enable row level security;
alter table public.titan_financial_audit_log enable row level security;

grant select, insert, update on
  public.titan_financial_categories, public.titan_financial_rates, public.titan_financial_rate_periods,
  public.titan_financial_targets, public.titan_financial_pick_list_values, public.titan_financial_jobs,
  public.titan_financial_tubing_weeks, public.titan_financial_tubing_entries,
  public.titan_financial_tubing_revenue, public.titan_financial_reviews,
  public.titan_financial_review_snapshots, public.titan_financial_audit_log
to service_role;

comment on table public.titan_financial_jobs is
  'Frozen job-cost ledger ported from COMPASS. Never hard-delete; void rows remain auditable.';

commit;
