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
