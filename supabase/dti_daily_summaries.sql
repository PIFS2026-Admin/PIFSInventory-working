create table if not exists public.dti_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  summary_number text not null unique,
  operator text,
  contractor text,
  location text,
  summary_date date not null default current_date,
  field_invoice text,
  page_number text,
  page_total text,
  inspection_type text,
  connection_size_type text,
  total_joints_inspected integer not null default 0,
  total_damages integer not null default 0,
  damage_seat_box integer not null default 0,
  damage_seat_pin integer not null default 0,
  damage_threads_box integer not null default 0,
  damage_threads_pin integer not null default 0,
  short_box integer not null default 0,
  bent_tube integer not null default 0,
  damage_other text,
  damage_notes text,
  total_dbr integer not null default 0,
  min_tong_box integer not null default 0,
  min_tong_pin integer not null default 0,
  emi integer not null default 0,
  damaged_tube integer not null default 0,
  min_wall integer not null default 0,
  dbr_other text,
  dbr_notes text,
  total_refaces integer not null default 0,
  reface_pin integer not null default 0,
  reface_box integer not null default 0,
  total_hardbands integer not null default 0,
  hardband_pin integer not null default 0,
  hardband_box integer not null default 0,
  repair_joints integer not null default 0,
  dbr_joints integer not null default 0,
  hb_joints integer not null default 0,
  repair_hb_joints integer not null default 0,
  remarks text,
  inspected_by text,
  status text not null default 'Draft',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dti_daily_summaries add column if not exists summary_number text;
alter table public.dti_daily_summaries add column if not exists operator text;
alter table public.dti_daily_summaries add column if not exists contractor text;
alter table public.dti_daily_summaries add column if not exists location text;
alter table public.dti_daily_summaries add column if not exists summary_date date default current_date;
alter table public.dti_daily_summaries add column if not exists field_invoice text;
alter table public.dti_daily_summaries add column if not exists page_number text;
alter table public.dti_daily_summaries add column if not exists page_total text;
alter table public.dti_daily_summaries add column if not exists inspection_type text;
alter table public.dti_daily_summaries add column if not exists connection_size_type text;
alter table public.dti_daily_summaries add column if not exists total_joints_inspected integer default 0;
alter table public.dti_daily_summaries add column if not exists total_damages integer default 0;
alter table public.dti_daily_summaries add column if not exists damage_seat_box integer default 0;
alter table public.dti_daily_summaries add column if not exists damage_seat_pin integer default 0;
alter table public.dti_daily_summaries add column if not exists damage_threads_box integer default 0;
alter table public.dti_daily_summaries add column if not exists damage_threads_pin integer default 0;
alter table public.dti_daily_summaries add column if not exists short_box integer default 0;
alter table public.dti_daily_summaries add column if not exists bent_tube integer default 0;
alter table public.dti_daily_summaries add column if not exists damage_other text;
alter table public.dti_daily_summaries add column if not exists damage_notes text;
alter table public.dti_daily_summaries add column if not exists total_dbr integer default 0;
alter table public.dti_daily_summaries add column if not exists min_tong_box integer default 0;
alter table public.dti_daily_summaries add column if not exists min_tong_pin integer default 0;
alter table public.dti_daily_summaries add column if not exists emi integer default 0;
alter table public.dti_daily_summaries add column if not exists damaged_tube integer default 0;
alter table public.dti_daily_summaries add column if not exists min_wall integer default 0;
alter table public.dti_daily_summaries add column if not exists dbr_other text;
alter table public.dti_daily_summaries add column if not exists dbr_notes text;
alter table public.dti_daily_summaries add column if not exists total_refaces integer default 0;
alter table public.dti_daily_summaries add column if not exists reface_pin integer default 0;
alter table public.dti_daily_summaries add column if not exists reface_box integer default 0;
alter table public.dti_daily_summaries add column if not exists total_hardbands integer default 0;
alter table public.dti_daily_summaries add column if not exists hardband_pin integer default 0;
alter table public.dti_daily_summaries add column if not exists hardband_box integer default 0;
alter table public.dti_daily_summaries add column if not exists repair_joints integer default 0;
alter table public.dti_daily_summaries add column if not exists dbr_joints integer default 0;
alter table public.dti_daily_summaries add column if not exists hb_joints integer default 0;
alter table public.dti_daily_summaries add column if not exists repair_hb_joints integer default 0;
alter table public.dti_daily_summaries add column if not exists remarks text;
alter table public.dti_daily_summaries add column if not exists inspected_by text;
alter table public.dti_daily_summaries add column if not exists status text default 'Draft';
alter table public.dti_daily_summaries add column if not exists created_by uuid references auth.users(id);
alter table public.dti_daily_summaries add column if not exists created_at timestamptz default now();
alter table public.dti_daily_summaries add column if not exists updated_at timestamptz default now();

create unique index if not exists dti_daily_summaries_summary_number_idx on public.dti_daily_summaries(summary_number);
create index if not exists dti_daily_summaries_summary_date_idx on public.dti_daily_summaries(summary_date);
create index if not exists dti_daily_summaries_status_idx on public.dti_daily_summaries(status);
create index if not exists dti_daily_summaries_created_by_idx on public.dti_daily_summaries(created_by);

alter table public.dti_daily_summaries enable row level security;

drop policy if exists "dti daily summaries internal full" on public.dti_daily_summaries;
create policy "dti daily summaries internal full"
on public.dti_daily_summaries
for all
to authenticated
using (public.is_dti_internal_user())
with check (public.is_dti_internal_user());

drop policy if exists "dti daily summaries staff read" on public.dti_daily_summaries;
create policy "dti daily summaries staff read"
on public.dti_daily_summaries
for select
to authenticated
using (public.is_dti_reader());

grant select, insert, update, delete on public.dti_daily_summaries to authenticated;
