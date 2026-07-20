create extension if not exists pgcrypto;

create or replace function public.titan_boards_is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role::text, '') <> 'customer'
  );
$$;

grant execute on function public.titan_boards_is_internal_user() to authenticated;

create table if not exists public.service_boards (
  id uuid primary key default gen_random_uuid(),
  board_key text not null unique,
  service_line_key text not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.service_boards(id) on delete cascade,
  column_key text not null,
  title text not null,
  description text,
  color text not null default '#fb923c',
  sort_order integer not null default 0,
  wip_limit integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, column_key)
);

create sequence if not exists public.service_board_card_number_seq;

create table if not exists public.service_board_cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.service_boards(id) on delete cascade,
  column_id uuid not null references public.service_board_columns(id) on delete restrict,
  card_number text not null unique default '',
  title text not null,
  description text,
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Critical')),
  customer_name text,
  location_name text,
  assigned_to_profile_id uuid references public.profiles(id) on delete set null,
  assigned_to_name text,
  due_date date,
  sort_order integer not null default 0,
  tags text[] not null default '{}',
  source_type text,
  source_id text,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_board_card_assignments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.service_board_cards(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (card_id, profile_id)
);

create table if not exists public.service_board_card_checklist (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.service_board_cards(id) on delete cascade,
  label text not null,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_board_card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.service_board_cards(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_board_activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.service_boards(id) on delete cascade,
  card_id uuid references public.service_board_cards(id) on delete cascade,
  action text not null,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists service_board_cards_source_unique
on public.service_board_cards(board_id, source_type, source_id)
where source_type is not null and source_id is not null;

create index if not exists service_board_columns_board_idx on public.service_board_columns(board_id, sort_order);
create index if not exists service_board_cards_board_idx on public.service_board_cards(board_id, archived_at, sort_order);
create index if not exists service_board_cards_column_idx on public.service_board_cards(column_id, sort_order);
create index if not exists service_board_cards_assigned_idx on public.service_board_cards(assigned_to_profile_id);
create index if not exists service_board_card_comments_card_idx on public.service_board_card_comments(card_id, created_at desc);
create index if not exists service_board_card_checklist_card_idx on public.service_board_card_checklist(card_id, sort_order);
create index if not exists service_board_activity_board_idx on public.service_board_activity(board_id, created_at desc);
create index if not exists service_board_activity_card_idx on public.service_board_activity(card_id, created_at desc);

create or replace function public.set_service_board_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_service_board_card_number()
returns trigger
language plpgsql
as $$
declare
  board_prefix text;
begin
  if coalesce(new.card_number, '') = '' then
    select upper(left(regexp_replace(service_line_key, '[^a-zA-Z0-9]+', '', 'g'), 4))
    into board_prefix
    from public.service_boards
    where id = new.board_id;

    new.card_number := coalesce(nullif(board_prefix, ''), 'SL') || '-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.service_board_card_number_seq')::text, 5, '0');
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_service_boards_updated_at on public.service_boards;
create trigger set_service_boards_updated_at
before update on public.service_boards
for each row execute function public.set_service_board_updated_at();

drop trigger if exists set_service_board_columns_updated_at on public.service_board_columns;
create trigger set_service_board_columns_updated_at
before update on public.service_board_columns
for each row execute function public.set_service_board_updated_at();

drop trigger if exists set_service_board_cards_defaults on public.service_board_cards;
create trigger set_service_board_cards_defaults
before insert or update on public.service_board_cards
for each row execute function public.set_service_board_card_number();

drop trigger if exists set_service_board_checklist_updated_at on public.service_board_card_checklist;
create trigger set_service_board_checklist_updated_at
before update on public.service_board_card_checklist
for each row execute function public.set_service_board_updated_at();

drop trigger if exists set_service_board_comments_updated_at on public.service_board_card_comments;
create trigger set_service_board_comments_updated_at
before update on public.service_board_card_comments
for each row execute function public.set_service_board_updated_at();

alter table public.service_boards enable row level security;
alter table public.service_board_columns enable row level security;
alter table public.service_board_cards enable row level security;
alter table public.service_board_card_assignments enable row level security;
alter table public.service_board_card_checklist enable row level security;
alter table public.service_board_card_comments enable row level security;
alter table public.service_board_activity enable row level security;

grant select, insert, update on public.service_boards to authenticated;
grant select, insert, update on public.service_board_columns to authenticated;
grant select, insert, update on public.service_board_cards to authenticated;
grant select, insert, update on public.service_board_card_assignments to authenticated;
grant select, insert, update on public.service_board_card_checklist to authenticated;
grant select, insert, update on public.service_board_card_comments to authenticated;
grant select, insert on public.service_board_activity to authenticated;
grant usage, select on sequence public.service_board_card_number_seq to authenticated;

drop policy if exists "service boards internal read" on public.service_boards;
create policy "service boards internal read"
on public.service_boards
for select
to authenticated
using (public.titan_boards_is_internal_user());

drop policy if exists "service boards internal write" on public.service_boards;
create policy "service boards internal write"
on public.service_boards
for insert
to authenticated
with check (public.titan_boards_is_internal_user());

drop policy if exists "service boards internal update" on public.service_boards;
create policy "service boards internal update"
on public.service_boards
for update
to authenticated
using (public.titan_boards_is_internal_user())
with check (public.titan_boards_is_internal_user());

drop policy if exists "service board columns internal read" on public.service_board_columns;
create policy "service board columns internal read"
on public.service_board_columns
for select
to authenticated
using (public.titan_boards_is_internal_user());

drop policy if exists "service board columns internal write" on public.service_board_columns;
create policy "service board columns internal write"
on public.service_board_columns
for insert
to authenticated
with check (public.titan_boards_is_internal_user());

drop policy if exists "service board columns internal update" on public.service_board_columns;
create policy "service board columns internal update"
on public.service_board_columns
for update
to authenticated
using (public.titan_boards_is_internal_user())
with check (public.titan_boards_is_internal_user());

drop policy if exists "service board cards internal read" on public.service_board_cards;
create policy "service board cards internal read"
on public.service_board_cards
for select
to authenticated
using (public.titan_boards_is_internal_user());

drop policy if exists "service board cards internal write" on public.service_board_cards;
create policy "service board cards internal write"
on public.service_board_cards
for insert
to authenticated
with check (public.titan_boards_is_internal_user());

drop policy if exists "service board cards internal update" on public.service_board_cards;
create policy "service board cards internal update"
on public.service_board_cards
for update
to authenticated
using (public.titan_boards_is_internal_user())
with check (public.titan_boards_is_internal_user());

drop policy if exists "service board assignments internal full" on public.service_board_card_assignments;
create policy "service board assignments internal full"
on public.service_board_card_assignments
for all
to authenticated
using (public.titan_boards_is_internal_user())
with check (public.titan_boards_is_internal_user());

drop policy if exists "service board checklist internal full" on public.service_board_card_checklist;
create policy "service board checklist internal full"
on public.service_board_card_checklist
for all
to authenticated
using (public.titan_boards_is_internal_user())
with check (public.titan_boards_is_internal_user());

drop policy if exists "service board comments internal full" on public.service_board_card_comments;
create policy "service board comments internal full"
on public.service_board_card_comments
for all
to authenticated
using (public.titan_boards_is_internal_user())
with check (public.titan_boards_is_internal_user());

drop policy if exists "service board activity internal read" on public.service_board_activity;
create policy "service board activity internal read"
on public.service_board_activity
for select
to authenticated
using (public.titan_boards_is_internal_user());

drop policy if exists "service board activity internal insert" on public.service_board_activity;
create policy "service board activity internal insert"
on public.service_board_activity
for insert
to authenticated
with check (public.titan_boards_is_internal_user());

with board_seed(board_key, service_line_key, name, description) as (
  values
    ('dti', 'dti', 'DTI Work Board', 'DTI requests, scheduling, inspection, review, completion, and invoicing.'),
    ('hardbanding', 'hardbanding', 'Hardbanding Work Board', 'Hardband quotes, scheduling, field work, QC review, and closeout.'),
    ('cdt', 'cdt', 'CDT Work Board', 'CDT requests, scheduling, active work, review, and completion.'),
    ('tubing', 'tubing', 'Tubing Work Board', 'Tubing service requests, scheduling, production, review, and completion.'),
    ('hotshot', 'hotshot', 'Hotshot Work Board', 'Hotshot dispatch requests, assignment, pickup, transit, delivery, and closeout.')
)
insert into public.service_boards (board_key, service_line_key, name, description)
select board_key, service_line_key, name, description
from board_seed
on conflict (board_key) do update
set
  service_line_key = excluded.service_line_key,
  name = excluded.name,
  description = excluded.description,
  active = true,
  updated_at = now();

with column_seed(board_key, column_key, title, description, color, sort_order) as (
  values
    ('dti', 'requested', 'Requested', 'New work waiting to be scoped.', '#fb923c', 100),
    ('dti', 'scheduled', 'Scheduled', 'Crew, dates, and customer timing are set.', '#60a5fa', 200),
    ('dti', 'in_progress', 'In Progress', 'Inspection work is active.', '#facc15', 300),
    ('dti', 'review', 'Review', 'Reports, red flags, and paperwork need signoff.', '#a78bfa', 400),
    ('dti', 'complete', 'Complete', 'Field work is complete and ready for billing.', '#34d399', 500),
    ('dti', 'invoiced', 'Invoiced', 'Billing has been sent or closed.', '#94a3b8', 600),

    ('hardbanding', 'quoted', 'Quoted', 'Pricing or scope is being confirmed.', '#fb923c', 100),
    ('hardbanding', 'scheduled', 'Scheduled', 'Crew, customer, and location are set.', '#60a5fa', 200),
    ('hardbanding', 'on_location', 'On Location', 'Crew is mobilized or staged.', '#f59e0b', 300),
    ('hardbanding', 'in_progress', 'In Progress', 'Hardbanding is active.', '#facc15', 400),
    ('hardbanding', 'qc_review', 'QC Review', 'Closeout data and quality review.', '#a78bfa', 500),
    ('hardbanding', 'complete', 'Complete', 'Work is complete.', '#34d399', 600),

    ('cdt', 'requested', 'Requested', 'New CDT work requests.', '#fb923c', 100),
    ('cdt', 'scheduled', 'Scheduled', 'Work has been planned.', '#60a5fa', 200),
    ('cdt', 'in_progress', 'In Progress', 'CDT work is underway.', '#facc15', 300),
    ('cdt', 'review', 'Review', 'Final checks or paperwork.', '#a78bfa', 400),
    ('cdt', 'complete', 'Complete', 'Work is done.', '#34d399', 500),

    ('tubing', 'requested', 'Requested', 'New tubing requests.', '#fb923c', 100),
    ('tubing', 'scheduled', 'Scheduled', 'Work has been scheduled.', '#60a5fa', 200),
    ('tubing', 'in_progress', 'In Progress', 'Work is active.', '#facc15', 300),
    ('tubing', 'review', 'Review', 'Needs review or paperwork.', '#a78bfa', 400),
    ('tubing', 'complete', 'Complete', 'Work is complete.', '#34d399', 500),

    ('hotshot', 'requested', 'Requested', 'New hotshot requests.', '#fb923c', 100),
    ('hotshot', 'assigned', 'Assigned', 'Driver or unit assigned.', '#60a5fa', 200),
    ('hotshot', 'pickup', 'Pickup', 'Pickup is underway.', '#f59e0b', 300),
    ('hotshot', 'in_transit', 'In Transit', 'Load is moving.', '#facc15', 400),
    ('hotshot', 'delivered', 'Delivered', 'Delivered and awaiting closeout.', '#34d399', 500),
    ('hotshot', 'closed', 'Closed', 'Ticket and billing are closed.', '#94a3b8', 600)
)
insert into public.service_board_columns (board_id, column_key, title, description, color, sort_order)
select b.id, c.column_key, c.title, c.description, c.color, c.sort_order
from column_seed c
join public.service_boards b on b.board_key = c.board_key
on conflict (board_id, column_key) do update
set
  title = excluded.title,
  description = excluded.description,
  color = excluded.color,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

with starter_seed(board_key, column_key, source_id, title, description, priority, tags) as (
  values
    ('dti', 'requested', 'starter-dti-1', 'Create first DTI job card', 'Use this card to prove the board flow before connecting live DTI jobs.', 'Normal', array['setup', 'test']::text[]),
    ('hardbanding', 'quoted', 'starter-hardbanding-1', 'Hardband test job', 'Move this through the board to validate the workflow.', 'Normal', array['hardband']::text[]),
    ('cdt', 'requested', 'starter-cdt-1', 'CDT workflow placeholder', 'Use this until the CDT production module is built.', 'Normal', array['cdt']::text[]),
    ('tubing', 'requested', 'starter-tubing-1', 'Tubing workflow placeholder', 'Use this until tubing forms and production records are connected.', 'Normal', array['tubing']::text[]),
    ('hotshot', 'requested', 'starter-hotshot-1', 'Hotshot workflow placeholder', 'Use this until hotshot dispatch records are connected.', 'Normal', array['dispatch']::text[])
)
insert into public.service_board_cards (
  board_id,
  column_id,
  title,
  description,
  priority,
  sort_order,
  tags,
  source_type,
  source_id
)
select
  b.id,
  c.id,
  s.title,
  s.description,
  s.priority,
  100,
  s.tags,
  'starter',
  s.source_id
from starter_seed s
join public.service_boards b on b.board_key = s.board_key
join public.service_board_columns c on c.board_id = b.id and c.column_key = s.column_key
where not exists (
  select 1
  from public.service_board_cards existing
  where existing.board_id = b.id
    and existing.source_type = 'starter'
    and existing.source_id = s.source_id
);

alter table public.service_boards replica identity full;
alter table public.service_board_columns replica identity full;
alter table public.service_board_cards replica identity full;
alter table public.service_board_card_checklist replica identity full;
alter table public.service_board_card_comments replica identity full;
alter table public.service_board_activity replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.service_boards;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.service_board_columns;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.service_board_cards;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.service_board_card_checklist;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.service_board_card_comments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.service_board_activity;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- WTX Operations Board import from Trello export 697e6db13afc56743d72ba78.
-- Re-running this block updates imported card text/tags without resetting card movement.
create unique index if not exists service_board_cards_source_unique
on public.service_board_cards(board_id, source_type, source_id)
where source_type is not null and source_id is not null;

update public.service_boards
set
  name = 'WTX Operations Board',
  description = 'Trello-style WTX operations dispatch board imported from the current operations board.',
  service_line_key = 'dti',
  active = true,
  updated_at = now()
where board_key = 'dti';

with imported_column_keys(column_key) as (
  values ('wtx_01_trucks_trailers_emmett'), ('wtx_02_trailers'), ('wtx_03_trucks'), ('wtx_04_freedom_h_and_p_434_5_00_am'), ('wtx_05_dbe_ensign_777_dti_6_00_am'), ('wtx_06_ensign_t_054_montior'), ('wtx_07_clr_patterson_595_rf_6_00_am'), ('wtx_08_dbe_enisgn_t_141_5_30_am'), ('wtx_09_exxon_h_and_p_430_5_15_am'), ('wtx_10_exxon_maintenance_7_00_am'), ('wtx_11_ensign_t_124_lithos_resources_5_00_am'), ('wtx_12_clr_cactus_168_6_00am'), ('wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7'), ('wtx_14_dbe_icd_305_5_45_am'), ('wtx_15_satisfy_7_00_am'), ('wtx_16_meeting_8_00_am_break_down_by_15_minutes_e'), ('wtx_17_helping_zack_7am'), ('wtx_18_sm_energy_hp_376_6am'), ('wtx_19_lane'), ('wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water'), ('wtx_21_off_schedule'), ('wtx_22_0'), ('wtx_23_other_service_lines'), ('wtx_24_bullpen'), ('wtx_25_lane'), ('wtx_26_pmr_pathfinder_yard_7_30am'), ('wtx_27_clr_scan_denali_7_19_shop_6_am'), ('wtx_28_0'), ('wtx_29_0')
), target_column as (
  select c.id
  from public.service_boards b
  join public.service_board_columns c on c.board_id = b.id
  where b.board_key = 'dti' and c.column_key = 'wtx_24_bullpen'
  limit 1
), legacy_columns as (
  select c.id
  from public.service_boards b
  join public.service_board_columns c on c.board_id = b.id
  where b.board_key = 'dti'
    and c.column_key not in (select column_key from imported_column_keys)
)
update public.service_board_cards card
set column_id = (select id from target_column), updated_at = now()
where card.column_id in (select id from legacy_columns)
  and (select id from target_column) is not null
  and coalesce(card.source_type, '') <> 'trello_export';

with imported_column_keys(column_key) as (
  values ('wtx_01_trucks_trailers_emmett'), ('wtx_02_trailers'), ('wtx_03_trucks'), ('wtx_04_freedom_h_and_p_434_5_00_am'), ('wtx_05_dbe_ensign_777_dti_6_00_am'), ('wtx_06_ensign_t_054_montior'), ('wtx_07_clr_patterson_595_rf_6_00_am'), ('wtx_08_dbe_enisgn_t_141_5_30_am'), ('wtx_09_exxon_h_and_p_430_5_15_am'), ('wtx_10_exxon_maintenance_7_00_am'), ('wtx_11_ensign_t_124_lithos_resources_5_00_am'), ('wtx_12_clr_cactus_168_6_00am'), ('wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7'), ('wtx_14_dbe_icd_305_5_45_am'), ('wtx_15_satisfy_7_00_am'), ('wtx_16_meeting_8_00_am_break_down_by_15_minutes_e'), ('wtx_17_helping_zack_7am'), ('wtx_18_sm_energy_hp_376_6am'), ('wtx_19_lane'), ('wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water'), ('wtx_21_off_schedule'), ('wtx_22_0'), ('wtx_23_other_service_lines'), ('wtx_24_bullpen'), ('wtx_25_lane'), ('wtx_26_pmr_pathfinder_yard_7_30am'), ('wtx_27_clr_scan_denali_7_19_shop_6_am'), ('wtx_28_0'), ('wtx_29_0')
)
update public.service_board_columns c
set active = false, updated_at = now()
from public.service_boards b
where c.board_id = b.id
  and b.board_key = 'dti'
  and c.column_key not in (select column_key from imported_column_keys);

with wtx_column_seed(board_key, column_key, title, description, color, sort_order) as (
  values
    ('dti', 'wtx_01_trucks_trailers_emmett', 'Trucks/Trailers Emmett', '2 cards imported from WTX Operations Board.', '#fb923c', 100),
    ('dti', 'wtx_02_trailers', 'Trailers', '8 cards imported from WTX Operations Board.', '#60a5fa', 200),
    ('dti', 'wtx_03_trucks', 'Trucks', '10 cards imported from WTX Operations Board.', '#a78bfa', 300),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', 'Freedom H&P 434 5:00 AM', '10 cards imported from WTX Operations Board.', '#facc15', 400),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', 'DBE Ensign 777 (DTI) 6:00 AM', '8 cards imported from WTX Operations Board.', '#34d399', 500),
    ('dti', 'wtx_06_ensign_t_054_montior', 'Ensign T 054 ( Montior )', '2 cards imported from WTX Operations Board.', '#38bdf8', 600),
    ('dti', 'wtx_07_clr_patterson_595_rf_6_00_am', 'CLR Patterson 595 (RF) 6:00 am', '4 cards imported from WTX Operations Board.', '#f472b6', 700),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', 'DBE Enisgn T 141 5:30 Am', '8 cards imported from WTX Operations Board.', '#94a3b8', 800),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', 'Exxon H&P 430 5:15 AM', '11 cards imported from WTX Operations Board.', '#fb923c', 900),
    ('dti', 'wtx_10_exxon_maintenance_7_00_am', 'Exxon maintenance 7:00 AM', '6 cards imported from WTX Operations Board.', '#60a5fa', 1000),
    ('dti', 'wtx_11_ensign_t_124_lithos_resources_5_00_am', 'Ensign  T 124  Lithos Resources 5:00 AM', '4 cards imported from WTX Operations Board.', '#a78bfa', 1100),
    ('dti', 'wtx_12_clr_cactus_168_6_00am', 'CLR Cactus  168 6:00Am', '4 cards imported from WTX Operations Board.', '#facc15', 1200),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', '8 cards imported from WTX Operations Board.', '#34d399', 1300),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', 'DBE ICD 305 5:45 am', '8 cards imported from WTX Operations Board.', '#38bdf8', 1400),
    ('dti', 'wtx_15_satisfy_7_00_am', 'Satisfy 7:00 Am', '10 cards imported from WTX Operations Board.', '#f472b6', 1500),
    ('dti', 'wtx_16_meeting_8_00_am_break_down_by_15_minutes_e', 'Meeting 8: 00 AM break down by 15 minutes each guy', '6 cards imported from WTX Operations Board.', '#94a3b8', 1600),
    ('dti', 'wtx_17_helping_zack_7am', 'helping zack 7am', '1 cards imported from WTX Operations Board.', '#fb923c', 1700),
    ('dti', 'wtx_18_sm_energy_hp_376_6am', 'SM Energy HP 376 6am', '1 cards imported from WTX Operations Board.', '#60a5fa', 1800),
    ('dti', 'wtx_19_lane', '.', '2 cards imported from WTX Operations Board.', '#a78bfa', 1900),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', '12 cards imported from WTX Operations Board.', '#facc15', 2000),
    ('dti', 'wtx_21_off_schedule', 'OFF SCHEDULE', '17 cards imported from WTX Operations Board.', '#34d399', 2100),
    ('dti', 'wtx_22_0', '0', '8 cards imported from WTX Operations Board.', '#38bdf8', 2200),
    ('dti', 'wtx_23_other_service_lines', 'Other Service Lines', '11 cards imported from WTX Operations Board.', '#f472b6', 2300),
    ('dti', 'wtx_24_bullpen', 'Bullpen', '16 cards imported from WTX Operations Board.', '#94a3b8', 2400),
    ('dti', 'wtx_25_lane', '.', '2 cards imported from WTX Operations Board.', '#fb923c', 2500),
    ('dti', 'wtx_26_pmr_pathfinder_yard_7_30am', 'PMR Pathfinder Yard 7:30am', '0 cards imported from WTX Operations Board.', '#60a5fa', 2600),
    ('dti', 'wtx_27_clr_scan_denali_7_19_shop_6_am', 'CLR Scan Denali 7/19 Shop 6 am', '0 cards imported from WTX Operations Board.', '#a78bfa', 2700),
    ('dti', 'wtx_28_0', '0', '0 cards imported from WTX Operations Board.', '#facc15', 2800),
    ('dti', 'wtx_29_0', '0', '0 cards imported from WTX Operations Board.', '#34d399', 2900)
)
insert into public.service_board_columns (board_id, column_key, title, description, color, sort_order, active)
select b.id, c.column_key, c.title, c.description, c.color, c.sort_order, true
from wtx_column_seed c
join public.service_boards b on b.board_key = c.board_key
on conflict (board_id, column_key) do update
set
  title = excluded.title,
  description = excluded.description,
  color = excluded.color,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

with wtx_card_seed(board_key, column_key, source_id, title, description, priority, customer_name, location_name, tags, sort_order) as (
  values
    ('dti', 'wtx_01_trucks_trailers_emmett', '69d2c259862986694b268a50', 'Reface 1', null, 'Normal', '', 'Trucks/Trailers Emmett', array[]::text[], 100),
    ('dti', 'wtx_01_trucks_trailers_emmett', '69d2c2605145218f2fa70137', 'Reface 2', null, 'Normal', '', 'Trucks/Trailers Emmett', array[]::text[], 200),
    ('dti', 'wtx_02_trailers', '69d2c264a500454a99d2681e', 'Reface 3', null, 'Normal', '', 'Trailers', array[]::text[], 100),
    ('dti', 'wtx_02_trailers', '69d2c23e3b03e4e6bb4f314c', 'Pressure Wash 1', null, 'Normal', '', 'Trailers', array[]::text[], 200),
    ('dti', 'wtx_02_trailers', '69d2c2446df15683e7203658', 'Pressure Wash 2', null, 'Normal', '', 'Trailers', array[]::text[], 300),
    ('dti', 'wtx_02_trailers', '6a305f02ba00b0ad7929aa18', 'Pressure Washer Single', null, 'Normal', '', 'Trailers', array[]::text[], 400),
    ('dti', 'wtx_02_trailers', '6a023ae399dd60715e07f4e7', 'rattle unit/air compressor', null, 'Normal', '', 'Trailers', array[]::text[], 500),
    ('dti', 'wtx_02_trailers', '6a52a3d95fd844b1e855b110', 'Drift Vac', null, 'Normal', '', 'Trailers', array[]::text[], 600),
    ('dti', 'wtx_02_trailers', '69d2c249a6a23da5752ee138', 'Pressure Wash 3', null, 'Normal', '', 'Trailers', array[]::text[], 700),
    ('dti', 'wtx_02_trailers', '6a0b72e68c6946ac99e5c94f', 'Rental double PW unit', null, 'Normal', '', 'Trailers', array[]::text[], 800),
    ('dti', 'wtx_03_trucks', '69d039d39400bd3f06b78582', 'TXTRK220 (Open)', null, 'Normal', '', 'Trucks', array[]::text[], 100),
    ('dti', 'wtx_03_trucks', '69d034d9e77f7576f23f5246', 'TXTRK223 (OPEN)need to be satisfied', null, 'Normal', '', 'Trucks', array[]::text[], 200),
    ('dti', 'wtx_03_trucks', '69d034c0b587a840732f0690', 'TXTRK260 (Pete C.)need to be satisfied', null, 'Normal', '', 'Trucks', array[]::text[], 300),
    ('dti', 'wtx_03_trucks', '69d039b8736208d64276b322', 'TXTRK229 (PW Truck)', null, 'Normal', '', 'Trucks', array[]::text[], 400),
    ('dti', 'wtx_03_trucks', '69d0350e70d20016fc77e78a', 'TXTRK283 (Tubing)', null, 'Normal', '', 'Trucks', array[]::text[], 500),
    ('dti', 'wtx_03_trucks', '69d1735368993b981b45cea6', 'TXTRK243(Cody)', null, 'Normal', '', 'Trucks', array[]::text[], 600),
    ('dti', 'wtx_03_trucks', '69d1739ac89dac9931152045', 'TXTRK268(CDT)', null, 'Normal', '', 'Trucks', array[]::text[], 700),
    ('dti', 'wtx_03_trucks', '69d1735f416ce5a2b09452e0', 'TXTRK271(Korey)', null, 'Normal', '', 'Trucks', array[]::text[], 800),
    ('dti', 'wtx_03_trucks', '69d1738f47ff9f7eacb31100', 'TXTRK263(CDT)', null, 'Normal', '', 'Trucks', array[]::text[], 900),
    ('dti', 'wtx_03_trucks', '69d1733cd5d6d8361e8d4674', 'TXTRK244(Courtney)', null, 'Normal', '', 'Trucks', array[]::text[], 1000),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '69d03a905134e2298360c170', 'Pink Trailer', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array[]::text[], 100),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '69d035180bcb652a2348a070', 'TXTRK284 (Ben T)', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array[]::text[], 200),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '6a2b15249768b0c1d975f8e0', 'Benjamin Toutcheque', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array['Driver', 'DTI Lead', 'Level 2', 'Loader']::text[], 300),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '69e13234055150f05a7125cf', 'Brandon Harris', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array['DTI Hand', 'S.S.E']::text[], 400),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '6a592b0638b04d3e1f85b14d', 'Daniel Torres', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array['DTI Hand', 'S.S.E']::text[], 500),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '697e7a13c42156ed96b91230', 'Kane Romero(Larry R RH)', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array['DTI Hand', 'Right Hand']::text[], 600),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '697e77a2b5dc00b5cf27f042', 'Ricky Escovedo return 7/16/26', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array['Lathe Reface Operator', 'Driver', 'Loader', 'LVL2']::text[], 700),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '69da71f0741bb8040b053f68', 'Isael Garcia', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array['DTI Hand']::text[], 800),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '6a592b0adfc83e0160b673c4', 'Trevor Williams', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array['Probation Driver', 'S.S.E', 'DTI Hand']::text[], 900),
    ('dti', 'wtx_04_freedom_h_and_p_434_5_00_am', '697e76b218ac2b9eb0cbaee7', 'Xavier Cottrell', null, 'Normal', '', 'Freedom H&P 434 5:00 AM', array['DTI Hand']::text[], 1000),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', '69d03a543e2bfa7774f7ef25', 'Red Trailer (Robert R)Saitfied 6/26/26', null, 'Normal', '', 'DBE Ensign 777 (DTI) 6:00 AM', array[]::text[], 100),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', '69d0353ea8177733d653cc6b', 'TXTRK287 (Robert R )', null, 'Normal', '', 'DBE Ensign 777 (DTI) 6:00 AM', array[]::text[], 200),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', '697e6e145c639620f41d9de2', 'Robert Rodriguez TXTRK#261/Red EMI Unit', null, 'Normal', '', 'DBE Ensign 777 (DTI) 6:00 AM', array['DTI Lead', 'Driver', 'Lathe Reface Operator', 'Loader', 'Level 2']::text[], 300),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', '6a5a82561b18ea2b549c4223', 'Eduardo Sanchez', null, 'Normal', '', 'DBE Ensign 777 (DTI) 6:00 AM', array['DTI Hand', 'S.S.E', 'Driver']::text[], 400),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', '69e13231e4e13c6c63fcbd2d', 'Jose Rubio(Robert RH)', null, 'Normal', '', 'DBE Ensign 777 (DTI) 6:00 AM', array['DTI Hand', 'Loader', 'S.S.E', 'Right Hand']::text[], 500),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', '69d033cf02e52ead8c512d5b', 'Diego Pucha', null, 'Normal', '', 'DBE Ensign 777 (DTI) 6:00 AM', array['DTI Hand']::text[], 600),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', '69d033cb077f85ee5604bae1', 'Dangello Gutierrez', null, 'Normal', '', 'DBE Ensign 777 (DTI) 6:00 AM', array['DTI Hand', 'S.S.E']::text[], 700),
    ('dti', 'wtx_05_dbe_ensign_777_dti_6_00_am', '6a46cd2f846d51e4eec40df7', 'Rigo Valenzuela', null, 'Normal', '', 'DBE Ensign 777 (DTI) 6:00 AM', array['CDT Hand', 'Probation Driver']::text[], 800),
    ('dti', 'wtx_06_ensign_t_054_montior', '69d035281f22337b6651cc0a', 'TXTRK285 (Larry R)', null, 'Normal', '', 'Ensign T 054 ( Montior )', array[]::text[], 100),
    ('dti', 'wtx_06_ensign_t_054_montior', '697e766967d6599dba117911', 'Larry Romero TXTRK#285/Black EMI Unit(days off 1-10) will be back friday 6-26-26', null, 'Normal', '', 'Ensign T 054 ( Montior )', array['Driver', 'DTI Lead', 'Shearwave', 'Lathe Reface Operator', 'Loader', 'Level 2']::text[], 200),
    ('dti', 'wtx_07_clr_patterson_595_rf_6_00_am', '6a2f0ca3bc5d4f8c8a6df1d2', 'reface 4', null, 'Normal', '', 'CLR Patterson 595 (RF) 6:00 am', array[]::text[], 100),
    ('dti', 'wtx_07_clr_patterson_595_rf_6_00_am', '69d039c424a9d9023cf78524', 'TXTRK221(Open)', null, 'Normal', '', 'CLR Patterson 595 (RF) 6:00 am', array[]::text[], 200),
    ('dti', 'wtx_07_clr_patterson_595_rf_6_00_am', '69ceeaa961435ad62a1ea2cf', 'Scott Mangan', null, 'Normal', '', 'CLR Patterson 595 (RF) 6:00 am', array['DTI Hand', 'Loader', 'Driver', 'Lathe Reface Operator']::text[], 300),
    ('dti', 'wtx_07_clr_patterson_595_rf_6_00_am', '697e7625cf7b69867f4bda68', 'Brandon Murry', null, 'Normal', '', 'CLR Patterson 595 (RF) 6:00 am', array['Lathe Reface Operator', 'Loader']::text[], 400),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', '69d03a77f7c91bfa791bf509', 'Green Trailer (Pete C/Conner H) Need to be satified', null, 'Normal', '', 'DBE Enisgn T 141 5:30 Am', array[]::text[], 100),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', '69d034ceb65e3434fd436b07', 'TXTRK228 (Connor H)', null, 'Normal', '', 'DBE Enisgn T 141 5:30 Am', array[]::text[], 200),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', '697e71d9318e637babf9ab2d', 'Connor Harris', null, 'Normal', '', 'DBE Enisgn T 141 5:30 Am', array['Driver', 'Level 2', 'Loader', 'DTI Lead']::text[], 300),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', '6a0f427ee92257530165a2e3', 'Parker Jones ( Connor RH)', null, 'Normal', '', 'DBE Enisgn T 141 5:30 Am', array['DTI Hand', 'S.S.E', 'Driver']::text[], 400),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', '6a592b1385c4e588d85cb238', 'Damonte Parker', null, 'Normal', '', 'DBE Enisgn T 141 5:30 Am', array['DTI Hand', 'S.S.E']::text[], 500),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', '697e7a3f7489a4501050b8d8', 'Tre Brown', null, 'Normal', '', 'DBE Enisgn T 141 5:30 Am', array['DTI Hand', 'Driver']::text[], 600),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', '69bc1c89e03102ca397b6276', 'Gwendarius Lyons', null, 'Normal', '', 'DBE Enisgn T 141 5:30 Am', array['DTI Hand', 'S.S.E', 'Lathe Reface Operator']::text[], 700),
    ('dti', 'wtx_08_dbe_enisgn_t_141_5_30_am', '6a2b1532b3b3d74db0711532', 'Alexander Alvarado', null, 'Normal', '', 'DBE Enisgn T 141 5:30 Am', array['S.S.E', 'DTI Hand']::text[], 800),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '69d03a98357e5592fe1ba6f5', 'Blue Trailer (John R) need to be satisfied', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array[]::text[], 100),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '69d034e92e44d7a290d08422', 'TXTRK280 (John R)need to be satisfied', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array[]::text[], 200),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '697e6e1fd4813cf50e11487c', 'John Reed      TXTRK#280/Blue EMI Unit( Days off 11-20)', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['DTI Lead', 'Driver', 'Shearwave', 'Loader', 'Level 2']::text[], 300),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '6a077caff35437edb9190b9f', 'Leroy Lopez', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['S.S.E', 'DTI Hand']::text[], 400),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '6a46c49d8132ab3f11314212', 'Zachary Aguiar', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['DTI Hand', 'S.S.E', 'Driver']::text[], 500),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '69c5959b745575793a225eb2', 'Ysidro Eric Cardiel', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['Level 2', 'Driver', 'DTI Hand', 'Loader']::text[], 600),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '697e6eb377b703b6bfb65d81', 'Jesse Juarez', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['HB Lead', 'Driver', 'Loader']::text[], 700),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '6a03843479fa7ab7dec4e2a5', 'Orlando Perez', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['DTI Hand', 'S.S.E']::text[], 800),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '69fe54fe897552d01311b0f7', 'Akeem Jones', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['DTI Hand', 'S.S.E']::text[], 900),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '6a3402252853e1dfdba6f627', 'Carlos Martinez', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['S.S.E', 'DTI Hand']::text[], 1000),
    ('dti', 'wtx_09_exxon_h_and_p_430_5_15_am', '69ea4c5f37e3ce3af5f41706', 'Mauro Orozco', null, 'Normal', '', 'Exxon H&P 430 5:15 AM', array['CDT Hand', 'Driver']::text[], 1100),
    ('dti', 'wtx_10_exxon_maintenance_7_00_am', '69d01c01b8f257c786043a4d', 'TXTRK270 (Cris S)', null, 'Normal', '', 'Exxon maintenance 7:00 AM', array[]::text[], 100),
    ('dti', 'wtx_10_exxon_maintenance_7_00_am', '69d03a6e42b4a789ed78e174', 'Orange Trailer (Cris S)', null, 'Normal', '', 'Exxon maintenance 7:00 AM', array[]::text[], 200),
    ('dti', 'wtx_10_exxon_maintenance_7_00_am', '697e77af2a1ffbba29c851d7', 'Cristopher Salinas TXTRK#270', null, 'Normal', '', 'Exxon maintenance 7:00 AM', array['Lathe Reface Operator', 'Loader', 'Driver', 'Level 2', 'DTI Lead']::text[], 300),
    ('dti', 'wtx_10_exxon_maintenance_7_00_am', '697e791477b23cd770d48c11', 'Yohandi Delgado(Robert RH)', null, 'Normal', '', 'Exxon maintenance 7:00 AM', array['DTI Hand', 'Right Hand']::text[], 400),
    ('dti', 'wtx_10_exxon_maintenance_7_00_am', '6984efc4618b08d1b381ff98', 'Mark Castillo (Cris RH)', null, 'Normal', '', 'Exxon maintenance 7:00 AM', array['DTI Hand', 'Right Hand']::text[], 500),
    ('dti', 'wtx_10_exxon_maintenance_7_00_am', '6a399a143cdd358c543c267a', 'Said Carrillo', null, 'Normal', '', 'Exxon maintenance 7:00 AM', array['S.S.E', 'Driver']::text[], 600),
    ('dti', 'wtx_11_ensign_t_124_lithos_resources_5_00_am', '69d034f6696a9ad5c07ea250', 'TXTRK281 (Open)need to be satisfied', null, 'Normal', '', 'Ensign  T 124  Lithos Resources 5:00 AM', array[]::text[], 100),
    ('dti', 'wtx_11_ensign_t_124_lithos_resources_5_00_am', '69e1323ee11f4d4aed6cd60c', 'James Carmichael 7-6-26', null, 'Normal', '', 'Ensign  T 124  Lithos Resources 5:00 AM', array['LVL2', 'Loader', 'Driver']::text[], 200),
    ('dti', 'wtx_11_ensign_t_124_lithos_resources_5_00_am', '697e6e05a5c25ce58d6de158', 'Jonathan Alvarado', null, 'Normal', '', 'Ensign  T 124  Lithos Resources 5:00 AM', array[]::text[], 300),
    ('dti', 'wtx_11_ensign_t_124_lithos_resources_5_00_am', '6a3d8f879fd773e34d18cebd', 'Dakota Linehan', null, 'Normal', '', 'Ensign  T 124  Lithos Resources 5:00 AM', array['DTI Hand', 'S.S.E', 'Driver']::text[], 400),
    ('dti', 'wtx_12_clr_cactus_168_6_00am', '69d035332abadaed542aa351', 'TXTRK286 (Open) need to be satisfied', null, 'Normal', '', 'CLR Cactus  168 6:00Am', array[]::text[], 100),
    ('dti', 'wtx_12_clr_cactus_168_6_00am', '697e7a83f73426a5c6f82a09', 'Rodrick Garcia', null, 'Normal', '', 'CLR Cactus  168 6:00Am', array['DTI Hand', 'Driver', 'Loader', 'LVL2']::text[], 200),
    ('dti', 'wtx_12_clr_cactus_168_6_00am', '69addb34aacd93842bc87542', 'Adrian Adame', null, 'Normal', '', 'CLR Cactus  168 6:00Am', array['Driver']::text[], 300),
    ('dti', 'wtx_12_clr_cactus_168_6_00am', '6a592b1e18d4aaf6fab189c3', 'Angel Anchodo', null, 'Normal', '', 'CLR Cactus  168 6:00Am', array['S.S.E', 'Probation Driver', 'DTI Hand']::text[], 400),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', '69d03a431642a007c7c28144', 'White Trailer (Juan M)', null, 'Normal', '', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', array[]::text[], 100),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', '69d03501acf45d80fb41a1c9', 'TXTRK282 (Juan M)', null, 'Normal', '', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', array[]::text[], 200),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', '697e6e0b337649bff808c8e2', 'Juan Maldonado TXTRK#282/White EMI Unit', null, 'Normal', '', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', array['DTI Lead', 'Driver', 'Loader', 'Level 2']::text[], 300),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', '697e79011791e20d75a38067', 'Ezekiel Hernandez( Juan M RH)', null, 'Normal', '', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', array['DTI Hand', 'Driver', 'Right Hand']::text[], 400),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', '697e7b4a375fea81159efe2b', 'Clinton Dunn( Juan M RH)', null, 'Normal', '', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', array['Driver', 'DTI Hand', 'Right Hand']::text[], 500),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', '69f37a2b3a593932df646b48', 'David Cupp (DTI)', null, 'Normal', '', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', array['DTI Hand', 'S.S.E']::text[], 600),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', '69d033abb13b149ea4d34625', 'Benito Estrada', null, 'Normal', '', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', array['CDT Hand', 'Driver']::text[], 700),
    ('dti', 'wtx_13_satifsy_white_unit_6_00_am_head_to_quail_7', '6a46c4c9b6e7a32a18fbc4fc', 'Brandon Rosalez', null, 'Normal', '', 'satifsy white unit 6:00 AM head to quail  @  7:00 am', array['S.S.E', 'DTI Hand']::text[], 800),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', '69d03aa18b8196af6be6d576', 'Black Trailer (Larry R)need to be satisfied', null, 'Normal', '', 'DBE ICD 305 5:45 am', array[]::text[], 100),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', '69d01c18d4db62c5943298b1', 'TXTRK267 (Sirius S)need to be satisfied', null, 'Normal', '', 'DBE ICD 305 5:45 am', array[]::text[], 200),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', '697e7b45f66ed3e811f01d82', 'Sirius Solis', null, 'Normal', '', 'DBE ICD 305 5:45 am', array['Driver', 'Loader', 'LVL2', 'DTI Lead']::text[], 300),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', '697e798d9f2b0f850df42680', 'Jonathan Yost', null, 'Normal', '', 'DBE ICD 305 5:45 am', array['DTI Hand']::text[], 400),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', '697e704f6b619234e8bc244c', 'Cody Ryan ', null, 'Normal', '', 'DBE ICD 305 5:45 am', array['CDT Hand', 'CDT Lead']::text[], 500),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', '69f37a2d05f2c8c4fc37d6b0', 'James Shaw', null, 'Normal', '', 'DBE ICD 305 5:45 am', array['Driver', 'DTI Hand', 'LVL2']::text[], 600),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', '697e7a209cf78e0e836ff886', 'Emilio Garza', null, 'Normal', '', 'DBE ICD 305 5:45 am', array['DTI Hand', 'Loader']::text[], 700),
    ('dti', 'wtx_14_dbe_icd_305_5_45_am', '697e79889d04205ff3ca7a26', 'Dewayne Green', null, 'Normal', '', 'DBE ICD 305 5:45 am', array['DTI Hand']::text[], 800),
    ('dti', 'wtx_15_satisfy_7_00_am', '6a5cf73b3b8ac37d200281a9', '(Yard) Lasso 101', null, 'Normal', '', 'Satisfy 7:00 Am', array[]::text[], 100),
    ('dti', 'wtx_15_satisfy_7_00_am', '6a5cf78fdd3c0cd02032be04', '(Yard) Spur Akita 525', null, 'Normal', '', 'Satisfy 7:00 Am', array[]::text[], 200),
    ('dti', 'wtx_15_satisfy_7_00_am', '69d03a60ce73da854155ff83', 'Yellow Trailer', null, 'Normal', '', 'Satisfy 7:00 Am', array[]::text[], 300),
    ('dti', 'wtx_15_satisfy_7_00_am', '69d01c2d1e3868378ef5c4a0', 'TXTRK261 (Open)need to be satisfied', null, 'Normal', '', 'Satisfy 7:00 Am', array[]::text[], 400),
    ('dti', 'wtx_15_satisfy_7_00_am', '69af463326a56503ff7c9023', 'Jesus De Los Santos', null, 'Normal', '', 'Satisfy 7:00 Am', array['Driver']::text[], 500),
    ('dti', 'wtx_15_satisfy_7_00_am', '6a5d2f6eca3ef3b0a6a3ec66', 'quail pathfinder yard 10:00 AM', null, 'Normal', '', 'Satisfy 7:00 Am', array[]::text[], 600),
    ('dti', 'wtx_15_satisfy_7_00_am', '697e7063d14a66c8bab8cb4e', 'David De La Cruz III ', null, 'Normal', '', 'Satisfy 7:00 Am', array['CDT Hand']::text[], 700),
    ('dti', 'wtx_15_satisfy_7_00_am', '6a46cd21a45392cd720ee3b3', 'Jalen Goodman', null, 'Normal', '', 'Satisfy 7:00 Am', array['Probation Driver', 'CDT Hand']::text[], 800),
    ('dti', 'wtx_15_satisfy_7_00_am', '697e7070cf7f2642f0213b55', 'Jose Aguilera', null, 'Normal', '', 'Satisfy 7:00 Am', array['CDT Hand']::text[], 900),
    ('dti', 'wtx_15_satisfy_7_00_am', '6a3d8f91d6c68aa24a8c6e11', 'Ellis Smallwood', null, 'Normal', '', 'Satisfy 7:00 Am', array['Tubing Hand', 'Probation Driver', 'S.S.E']::text[], 1000),
    ('dti', 'wtx_16_meeting_8_00_am_break_down_by_15_minutes_e', '6a46c4766342de583c8cdb95', 'Ramon Hinojosa', null, 'Normal', '', 'Meeting 8: 00 AM break down by 15 minutes each guy', array['S.S.E', 'DTI Hand', 'Driver']::text[], 100),
    ('dti', 'wtx_16_meeting_8_00_am_break_down_by_15_minutes_e', '6a21dd7bf28c6d7264c7e608', 'Matthew Jimenez', null, 'Normal', '', 'Meeting 8: 00 AM break down by 15 minutes each guy', array['S.S.E', 'DTI Hand']::text[], 200),
    ('dti', 'wtx_16_meeting_8_00_am_break_down_by_15_minutes_e', '697e77c22e5542e1bc7d20f5', 'Robert Galindo', null, 'Normal', '', 'Meeting 8: 00 AM break down by 15 minutes each guy', array['DTI Hand']::text[], 300),
    ('dti', 'wtx_16_meeting_8_00_am_break_down_by_15_minutes_e', '6a077cd0ea820f8f7a29b701', 'Lavarcia Lathan', null, 'Normal', '', 'Meeting 8: 00 AM break down by 15 minutes each guy', array['S.S.E', 'DTI Hand']::text[], 400),
    ('dti', 'wtx_16_meeting_8_00_am_break_down_by_15_minutes_e', '6a2b1543c766f5231c77c1f6', 'Tredon Smith', null, 'Normal', '', 'Meeting 8: 00 AM break down by 15 minutes each guy', array['S.S.E', 'DTI Hand']::text[], 500),
    ('dti', 'wtx_16_meeting_8_00_am_break_down_by_15_minutes_e', '69d7d36eb6a286c8b4eb6727', 'Cameron Johnson', null, 'Normal', '', 'Meeting 8: 00 AM break down by 15 minutes each guy', array['DTI Hand', 'Probation Driver', 'S.S.E']::text[], 600),
    ('dti', 'wtx_17_helping_zack_7am', '697e7000333527fd6893ecc2', 'Courtney Scurlark', null, 'Normal', '', 'helping zack 7am', array['CDT Lead', 'Driver', 'Loader']::text[], 100),
    ('dti', 'wtx_18_sm_energy_hp_376_6am', '6a2b1553ee8bf9adee7015aa', 'Dearrius Gray', null, 'Normal', '', 'SM Energy HP 376 6am', array['HB Hand', 'Probation Driver']::text[], 100),
    ('dti', 'wtx_19_lane', '6a529921d2cc82f7791c1ccc', '(TU-078/FT#70539) Saguaro Pipe Rentals / CAT 3 + Waterblast + Drift on 900 joints of 2 7/8 HT6', null, 'Normal', '', '.', array[]::text[], 100),
    ('dti', 'wtx_19_lane', '6a45918e3d4034281e1143f9', '(TU-086 / FT#71167) Continental Cat.3 + Waterblast + Drift on 120 joints of 2 7/8 EUE 6.5# L-80 *Will be billed to FT#71207', null, 'Normal', '', '.', array[]::text[], 200),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '6a4d46b4060c80df27c4e2dc', '(TU-083/FT#70902) Long Strings / RDS Ranch / Michelle #1 / CAT 3 + Waterblast + Drift on 60 joints of 2 7/8 PH6', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array[]::text[], 100),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '6a51547b22cb45fb8dd32838', '(TU-084 / FT#71144) CP Energy (FT2312) CAT 3 + Waterblast + Drift on 710 joints of 2 7/8 FSS-265 and 223 joints of 2 3/8 FSS-247', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array[]::text[], 200),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '697e6fcf1f5651b59e589205', 'Xavius Moncreary', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Loader', 'Level 2', 'Crew team 2']::text[], 300),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '697e6f7dea11065304c450f4', 'John Johnson ', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Driver', 'Loader', 'Level 2', 'Lathe Reface Operator', 'Tubing Crew 1']::text[], 400),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '69ceea30d93c4bc402b50cc1', 'Gerard Evans', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Level 2']::text[], 500),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '6a4ffaefa028391b77422929', 'Jamar Jackson', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Tubing Hand', 'S.S.E']::text[], 600),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '6a21dd5ddaaeebd837b5a1c1', 'Jamon Mims', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Tubing Hand', 'S.S.E']::text[], 700),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '6a46eaacb735cd8ced32db7c', 'Wyatt Tucker', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Tubing Hand']::text[], 800),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '6a4ffafd5367001e94106b4c', 'Cordell Oney', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Tubing Hand', 'Driver', 'S.S.E']::text[], 900),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '69b3219b8277867d23b6364f', 'Denzell Rodgers', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Tubing Hand', 'Probation Driver']::text[], 1000),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '69ceea38c58b9b940990b1e5', 'Carmelo Johnson', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Tubing Hand']::text[], 1100),
    ('dti', 'wtx_20_tu_085_ft_71148_kaiser_francis_cat_3_water', '69ea4c8471ede7fedfd4b2d9', 'Wilbert Beverly', null, 'Normal', '', '(TU-085/FT#71148) Kaiser Francis CAT 3 + Waterblast + Drift on 42 joints of 2 7/8 BEN-EUI', array['Tubing Hand']::text[], 1200),
    ('dti', 'wtx_21_off_schedule', '697e7af88c83a20c350f413a', 'Requested Off', null, 'Normal', '', 'OFF SCHEDULE', array[]::text[], 100),
    ('dti', 'wtx_21_off_schedule', '69e1320bb8be0525b11f2e08', 'Jesus Alaniz', null, 'Normal', '', 'OFF SCHEDULE', array['Tubing Hand']::text[], 200),
    ('dti', 'wtx_21_off_schedule', '697e77c9eef494eb85847b4c', 'Nevan Moran', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand']::text[], 300),
    ('dti', 'wtx_21_off_schedule', '697e6e903ea81115e2cb6416', 'Shannon Sanchez TXTRK#286(Days off 21-30th)', null, 'Normal', '', 'OFF SCHEDULE', array['Level 2', 'Driver', 'Shearwave', 'Lathe Reface Operator', 'Loader']::text[], 400),
    ('dti', 'wtx_21_off_schedule', '697e6fe8d5b0f97971bc561c', 'Damond Lathan returns 7-21', null, 'Normal', '', 'OFF SCHEDULE', array['Driver', 'CDT Hand']::text[], 500),
    ('dti', 'wtx_21_off_schedule', '6a21dd85d47eedb039018109', 'Alex Armstrong return to Work 7/30', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand', 'S.S.E']::text[], 600),
    ('dti', 'wtx_21_off_schedule', '697e7b1a2fe56386a2354b5f', 'Rotation Off', null, 'Normal', '', 'OFF SCHEDULE', array[]::text[], 700),
    ('dti', 'wtx_21_off_schedule', '697e7a3dd008597e4bd12e43', 'Charles Douglas (John R RH)', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand', 'Driver', 'Right Hand']::text[], 800),
    ('dti', 'wtx_21_off_schedule', '69a0ab2994d359e22ad9b6d3', 'Marcus Bias', null, 'Normal', '', 'OFF SCHEDULE', array['Tubing Hand', 'Rotational']::text[], 900),
    ('dti', 'wtx_21_off_schedule', '697e6e2305e3ccc1fbc7cf82', 'Pete Chavez TXTRK#260/ Green EMI Unit', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Lead', 'Loader', 'Level 2']::text[], 1000),
    ('dti', 'wtx_21_off_schedule', '697e797527dd51431e7c4daa', 'Kaleb Cabrera', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand', 'LVL2', 'Driver']::text[], 1100),
    ('dti', 'wtx_21_off_schedule', '6a2b153d54c10fa820c8afd4', 'Isaac Urquidi (Pete RH)', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand', 'S.S.E', 'Driver']::text[], 1200),
    ('dti', 'wtx_21_off_schedule', '69bc1c9d3ac0c079dc0a2375', 'Marcus McCollum (John R RH)', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand', 'Driver', 'Right Hand']::text[], 1300),
    ('dti', 'wtx_21_off_schedule', '697e790997bec767591c2cd0', 'Martin Noriega (Pete RH)', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand', 'Right Hand', 'Loader']::text[], 1400),
    ('dti', 'wtx_21_off_schedule', '6a2b152a06f0467b0b76a2e0', 'Isaiah Feaster', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand', 'S.S.E']::text[], 1500),
    ('dti', 'wtx_21_off_schedule', '697e79173122be1bb6e037e1', 'Ender Cepeda', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand']::text[], 1600),
    ('dti', 'wtx_21_off_schedule', '69fe55034733b4adab130a90', 'Kebin Zamora', null, 'Normal', '', 'OFF SCHEDULE', array['DTI Hand', 'S.S.E']::text[], 1700),
    ('dti', 'wtx_22_0', '69c9661ad4d9674c63e44757', 'Safety Hours', null, 'Normal', '', '0', array[]::text[], 100),
    ('dti', 'wtx_22_0', '697e7b04439cac4ae8775ce7', 'Call Outs', null, 'Normal', '', '0', array[]::text[], 200),
    ('dti', 'wtx_22_0', '699f77dafff3574715ff1530', 'Brayam Carvajal (suspended until 23rd)', null, 'Normal', '', '0', array['Tubing Hand', 'Driver']::text[], 300),
    ('dti', 'wtx_22_0', '697e6fbdd1f7704b786f6040', 'Juan Quinones', null, 'Normal', '', '0', array['Level 2', 'Tubing Hand']::text[], 400),
    ('dti', 'wtx_22_0', '69861ae6d65a18004b897c1d', 'Suspended', null, 'Normal', '', '0', array[]::text[], 500),
    ('dti', 'wtx_22_0', '6a21dd6ecd83a41ec6bc2b6c', 'Daniel Ramirez', null, 'Normal', '', '0', array['CDT Hand', 'Probation Driver', 'S.S.E']::text[], 600),
    ('dti', 'wtx_22_0', '69ac97639d6c87994c6d5d9f', 'Termination', null, 'Normal', '', '0', array[]::text[], 700),
    ('dti', 'wtx_22_0', '6a4ffaf937322be588a4111e', 'Cruz Dominguez (RETURN TO WORK ON 7-20-26)', null, 'Normal', '', '0', array['Tubing Hand', 'S.S.E']::text[], 800),
    ('dti', 'wtx_23_other_service_lines', '697e7f268905ae8388048295', 'Hotshot', null, 'Normal', '', 'Other Service Lines', array[]::text[], 100),
    ('dti', 'wtx_23_other_service_lines', '6a077e0a54e7e34f5cdd02ca', 'Jose Hernandez', null, 'Normal', '', 'Other Service Lines', array['Driver', 'Loader', 'Hotshot Driver']::text[], 200),
    ('dti', 'wtx_23_other_service_lines', '697e7f2e15ca396a02984402', 'Construction', null, 'Normal', '', 'Other Service Lines', array[]::text[], 300),
    ('dti', 'wtx_23_other_service_lines', '697e7f632969db4f45ead8cf', 'Liandy Rodriguez', null, 'Normal', '', 'Other Service Lines', array[]::text[], 400),
    ('dti', 'wtx_23_other_service_lines', '697f11e31549f431b7097b7a', 'Kelley Daulphine', null, 'Normal', '', 'Other Service Lines', array[]::text[], 500),
    ('dti', 'wtx_23_other_service_lines', '697e7f347ba8fcd90ea5fe03', 'Yard', null, 'Normal', '', 'Other Service Lines', array[]::text[], 600),
    ('dti', 'wtx_23_other_service_lines', '697e7f6940c060c53a8fab09', 'Exrimill Perez', null, 'Normal', '', 'Other Service Lines', array['Driver', 'Loader', 'Level 2']::text[], 700),
    ('dti', 'wtx_23_other_service_lines', '697e6f1229e1ad5ddf036791', 'Raymond Quitano', null, 'Normal', '', 'Other Service Lines', array['Driver', 'Loader']::text[], 800),
    ('dti', 'wtx_23_other_service_lines', '6a340241f8888f39ceb43b40', 'Aaron Herrera', null, 'Normal', '', 'Other Service Lines', array['Probation Driver', 'S.S.E']::text[], 900),
    ('dti', 'wtx_23_other_service_lines', '6a5929df81ed54f5a3f4aff5', 'Adam Warner', null, 'Normal', '', 'Other Service Lines', array['S.S.E']::text[], 1000),
    ('dti', 'wtx_23_other_service_lines', '6a2b154c5cc99f2a64b50981', 'Derrick Pack', null, 'Normal', '', 'Other Service Lines', array['S.S.E']::text[], 1100),
    ('dti', 'wtx_24_bullpen', '69ced3307fffa45bae53f2f6', 'Diego Campoy', null, 'Normal', '', 'Bullpen', array[]::text[], 100),
    ('dti', 'wtx_24_bullpen', '6a1b6355c4ceaa8bea794b94', 'Luis Ramos', null, 'Normal', '', 'Bullpen', array['CDT Lead', 'Driver', 'Loader']::text[], 200),
    ('dti', 'wtx_24_bullpen', '697e6dec337649bff80882cd', 'DTI', null, 'Normal', '', 'Bullpen', array[]::text[], 300),
    ('dti', 'wtx_24_bullpen', '698a09ab9ce51f21cdbb4f59', 'CDT', null, 'Normal', '', 'Bullpen', array[]::text[], 400),
    ('dti', 'wtx_24_bullpen', '697e705424b8d0b0df488be1', 'Korey Patton', null, 'Normal', '', 'Bullpen', array['Loader', 'CDT Hand', 'CDT Lead']::text[], 500),
    ('dti', 'wtx_24_bullpen', '697e706928e66dec95fe2d39', 'David De La Cruz Jr ', null, 'Normal', '', 'Bullpen', array['Driver', 'CDT Hand']::text[], 600),
    ('dti', 'wtx_24_bullpen', '69b3335bc28377c4dc77aabd', 'Jacob Reyes', null, 'Normal', '', 'Bullpen', array['CDT Hand', 'CDT Lead']::text[], 700),
    ('dti', 'wtx_24_bullpen', '69b33355d822df5a1cffb6ca', 'Jabier Reyes ', null, 'Normal', '', 'Bullpen', array['CDT Hand']::text[], 800),
    ('dti', 'wtx_24_bullpen', '697e6e72f83753cc133cf4d4', 'Tubing', null, 'Normal', '', 'Bullpen', array[]::text[], 900),
    ('dti', 'wtx_24_bullpen', '698a0981e51e5899f64bd9cc', 'Hardbanding', null, 'Normal', '', 'Bullpen', array[]::text[], 1000),
    ('dti', 'wtx_24_bullpen', '6990d434509726ed831b0f6c', 'Quentin Greene', null, 'Normal', '', 'Bullpen', array['HB Lead', 'Loader', 'Grinder']::text[], 1100),
    ('dti', 'wtx_24_bullpen', '697e6f1af4e99c99011bb4a3', 'Kevin Salazar', null, 'Normal', '', 'Bullpen', array['HB Hand']::text[], 1200),
    ('dti', 'wtx_24_bullpen', '6a3969c1e2045463d9b6729a', 'Stephen Molock', null, 'Normal', '', 'Bullpen', array['Driver', 'S.S.E', 'HB Lead']::text[], 1300),
    ('dti', 'wtx_24_bullpen', '697e6ed978722674d0da1739', 'Christopher Reyna', null, 'Normal', '', 'Bullpen', array['HB Lead', 'Loader', 'Driver']::text[], 1400),
    ('dti', 'wtx_24_bullpen', '697e6eb98a9acbfc99cd6885', 'Justin Simina', null, 'Normal', '', 'Bullpen', array['HB Lead', 'Driver', 'Loader']::text[], 1500),
    ('dti', 'wtx_24_bullpen', '69e131e6940cadeab7fcebf9', 'Robert Ybarra', null, 'Normal', '', 'Bullpen', array['HB Hand', 'Probation Driver']::text[], 1600),
    ('dti', 'wtx_25_lane', '6a515461353f23fd6ab4e35c', '.', null, 'Normal', '', '.', array[]::text[], 100),
    ('dti', 'wtx_25_lane', '6a52993ce37f0eb13aeb7a54', '.', null, 'Normal', '', '.', array[]::text[], 200)
)
insert into public.service_board_cards (
  board_id,
  column_id,
  title,
  description,
  priority,
  customer_name,
  location_name,
  sort_order,
  tags,
  source_type,
  source_id
)
select
  b.id,
  c.id,
  s.title,
  s.description,
  s.priority,
  nullif(s.customer_name, ''),
  nullif(s.location_name, ''),
  s.sort_order,
  s.tags,
  'trello_export',
  s.source_id
from wtx_card_seed s
join public.service_boards b on b.board_key = s.board_key
join public.service_board_columns c on c.board_id = b.id and c.column_key = s.column_key
on conflict (board_id, source_type, source_id)
where source_type is not null and source_id is not null
do update
set
  title = excluded.title,
  description = excluded.description,
  priority = excluded.priority,
  customer_name = excluded.customer_name,
  location_name = excluded.location_name,
  tags = excluded.tags,
  updated_at = now();
