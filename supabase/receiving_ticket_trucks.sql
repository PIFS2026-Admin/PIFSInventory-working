create extension if not exists pgcrypto;

create table if not exists public.receiving_ticket_trucks (
  id uuid primary key default gen_random_uuid(),
  receiving_ticket_id uuid not null references public.receiving_tickets(id) on delete cascade,
  truck_sequence integer not null default 1 check (truck_sequence > 0),
  truck_label text,
  carrier text,
  po_number text,
  truck_number text,
  driver_name text,
  truck_unit_number text,
  trailer_number text,
  bol_number text,
  arrival_at timestamptz,
  missing_box_protectors integer not null default 0 check (missing_box_protectors >= 0),
  missing_pin_protectors integer not null default 0 check (missing_pin_protectors >= 0),
  pathfinder_name text,
  pathfinder_signature text,
  carrier_name text,
  carrier_signature text,
  notes text,
  total_joints integer not null default 0,
  total_footage numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receiving_ticket_id, truck_sequence)
);

alter table public.ticket_line_items
  add column if not exists receiving_ticket_truck_id uuid;

alter table public.documents
  add column if not exists receiving_ticket_truck_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ticket_line_items_receiving_ticket_truck_id_fkey'
  ) then
    alter table public.ticket_line_items
      add constraint ticket_line_items_receiving_ticket_truck_id_fkey
      foreign key (receiving_ticket_truck_id)
      references public.receiving_ticket_trucks(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_receiving_ticket_truck_id_fkey'
  ) then
    alter table public.documents
      add constraint documents_receiving_ticket_truck_id_fkey
      foreign key (receiving_ticket_truck_id)
      references public.receiving_ticket_trucks(id)
      on delete set null;
  end if;
end $$;

create index if not exists receiving_ticket_trucks_ticket_idx
  on public.receiving_ticket_trucks(receiving_ticket_id, truck_sequence);

create index if not exists receiving_ticket_trucks_arrival_idx
  on public.receiving_ticket_trucks(arrival_at);

create index if not exists ticket_line_items_receiving_truck_idx
  on public.ticket_line_items(receiving_ticket_truck_id);

create index if not exists documents_receiving_truck_idx
  on public.documents(receiving_ticket_truck_id);

create or replace function public.set_receiving_ticket_truck_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_receiving_ticket_truck_updated_at on public.receiving_ticket_trucks;
create trigger set_receiving_ticket_truck_updated_at
before update on public.receiving_ticket_trucks
for each row execute function public.set_receiving_ticket_truck_updated_at();

create or replace function public.recalculate_receiving_ticket_totals(target_ticket_id uuid)
returns void
language plpgsql
as $$
begin
  if target_ticket_id is null then
    return;
  end if;

  update public.receiving_tickets ticket
  set
    carrier = (
      select string_agg(value, ', ')
      from (
        select distinct nullif(trim(carrier), '') as value
        from public.receiving_ticket_trucks
        where receiving_ticket_id = target_ticket_id
      ) values_list
      where value is not null
    ),
    po_number = (
      select string_agg(value, ', ')
      from (
        select distinct nullif(trim(po_number), '') as value
        from public.receiving_ticket_trucks
        where receiving_ticket_id = target_ticket_id
      ) values_list
      where value is not null
    ),
    truck_number = (
      select string_agg(value, ', ')
      from (
        select distinct nullif(trim(coalesce(truck_number, truck_unit_number)), '') as value
        from public.receiving_ticket_trucks
        where receiving_ticket_id = target_ticket_id
      ) values_list
      where value is not null
    ),
    missing_box_protectors = coalesce((
      select sum(missing_box_protectors)
      from public.receiving_ticket_trucks
      where receiving_ticket_id = target_ticket_id
    ), 0),
    missing_pin_protectors = coalesce((
      select sum(missing_pin_protectors)
      from public.receiving_ticket_trucks
      where receiving_ticket_id = target_ticket_id
    ), 0),
    joints = coalesce((
      select sum(joints)
      from public.ticket_line_items
      where receiving_ticket_id = target_ticket_id
    ), 0),
    footage = coalesce((
      select sum(footage)
      from public.ticket_line_items
      where receiving_ticket_id = target_ticket_id
    ), 0)
  where ticket.id = target_ticket_id;
end;
$$;

create or replace function public.recalculate_receiving_truck_totals(target_truck_id uuid)
returns void
language plpgsql
as $$
declare
  parent_ticket_id uuid;
begin
  if target_truck_id is null then
    return;
  end if;

  update public.receiving_ticket_trucks truck
  set
    total_joints = coalesce((
      select sum(joints)
      from public.ticket_line_items
      where receiving_ticket_truck_id = target_truck_id
    ), 0),
    total_footage = coalesce((
      select sum(footage)
      from public.ticket_line_items
      where receiving_ticket_truck_id = target_truck_id
    ), 0)
  where truck.id = target_truck_id
  returning truck.receiving_ticket_id into parent_ticket_id;

  perform public.recalculate_receiving_ticket_totals(parent_ticket_id);
end;
$$;

create or replace function public.recalculate_receiving_from_line_trigger()
returns trigger
language plpgsql
as $$
declare
  target_truck_id uuid;
  target_ticket_id uuid;
begin
  if tg_op = 'DELETE' then
    target_truck_id = old.receiving_ticket_truck_id;
    target_ticket_id = old.receiving_ticket_id;
  else
    target_truck_id = new.receiving_ticket_truck_id;
    target_ticket_id = new.receiving_ticket_id;
  end if;

  if target_truck_id is not null then
    perform public.recalculate_receiving_truck_totals(target_truck_id);
  else
    perform public.recalculate_receiving_ticket_totals(target_ticket_id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.recalculate_receiving_from_truck_trigger()
returns trigger
language plpgsql
as $$
declare
  target_ticket_id uuid;
begin
  if tg_op = 'DELETE' then
    target_ticket_id = old.receiving_ticket_id;
  else
    target_ticket_id = new.receiving_ticket_id;
  end if;

  perform public.recalculate_receiving_ticket_totals(target_ticket_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists recalculate_receiving_from_line on public.ticket_line_items;
create trigger recalculate_receiving_from_line
after insert or update or delete on public.ticket_line_items
for each row execute function public.recalculate_receiving_from_line_trigger();

drop trigger if exists recalculate_receiving_from_truck on public.receiving_ticket_trucks;
create trigger recalculate_receiving_from_truck
after insert or update or delete on public.receiving_ticket_trucks
for each row execute function public.recalculate_receiving_from_truck_trigger();

insert into public.receiving_ticket_trucks (
  receiving_ticket_id,
  truck_sequence,
  truck_label,
  carrier,
  po_number,
  truck_number,
  truck_unit_number,
  arrival_at,
  missing_box_protectors,
  missing_pin_protectors,
  pathfinder_name,
  pathfinder_signature,
  carrier_name,
  carrier_signature,
  notes,
  total_joints,
  total_footage,
  created_at,
  updated_at
)
select
  ticket.id,
  1,
  'Truck 1',
  ticket.carrier,
  ticket.po_number,
  ticket.truck_number,
  ticket.truck_number,
  ticket.received_at,
  ticket.missing_box_protectors,
  ticket.missing_pin_protectors,
  ticket.pathfinder_name,
  ticket.pathfinder_signature,
  ticket.carrier_name,
  ticket.carrier_signature,
  ticket.notes,
  ticket.joints,
  ticket.footage,
  ticket.created_at,
  now()
from public.receiving_tickets ticket
where not exists (
  select 1
  from public.receiving_ticket_trucks truck
  where truck.receiving_ticket_id = ticket.id
);

update public.ticket_line_items line
set receiving_ticket_truck_id = truck.id
from public.receiving_ticket_trucks truck
where line.receiving_ticket_id = truck.receiving_ticket_id
  and truck.truck_sequence = 1
  and line.receiving_ticket_id is not null
  and line.receiving_ticket_truck_id is null;

update public.documents document
set receiving_ticket_truck_id = truck.id
from public.receiving_ticket_trucks truck
where document.receiving_ticket_id = truck.receiving_ticket_id
  and truck.truck_sequence = 1
  and document.receiving_ticket_id is not null
  and document.receiving_ticket_truck_id is null
  and document.document_type = 'receiving_attachment';

do $$
declare
  target_ticket uuid;
begin
  for target_ticket in select id from public.receiving_tickets loop
    perform public.recalculate_receiving_truck_totals(truck.id)
    from public.receiving_ticket_trucks truck
    where truck.receiving_ticket_id = target_ticket;

    perform public.recalculate_receiving_ticket_totals(target_ticket);
  end loop;
end $$;

alter table public.receiving_ticket_trucks enable row level security;

grant select, insert, update on public.receiving_ticket_trucks to authenticated;
grant select, insert, update on public.receiving_tickets to authenticated;
grant select, insert, update on public.ticket_line_items to authenticated;
grant select, insert, update on public.documents to authenticated;

drop policy if exists "receiving tickets internal insert" on public.receiving_tickets;
create policy "receiving tickets internal insert"
on public.receiving_tickets
for insert
to authenticated
with check (public.is_internal_user());

drop policy if exists "receiving tickets internal update" on public.receiving_tickets;
create policy "receiving tickets internal update"
on public.receiving_tickets
for update
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "receiving trucks staff read" on public.receiving_ticket_trucks;
create policy "receiving trucks staff read"
on public.receiving_ticket_trucks
for select
to authenticated
using (public.is_staff_reader());

drop policy if exists "receiving trucks customer read own" on public.receiving_ticket_trucks;
create policy "receiving trucks customer read own"
on public.receiving_ticket_trucks
for select
to authenticated
using (
  exists (
    select 1
    from public.receiving_tickets ticket
    where ticket.id = receiving_ticket_trucks.receiving_ticket_id
      and ticket.company_id = public.current_user_company_id()
  )
);

drop policy if exists "receiving trucks internal insert" on public.receiving_ticket_trucks;
create policy "receiving trucks internal insert"
on public.receiving_ticket_trucks
for insert
to authenticated
with check (public.is_internal_user());

drop policy if exists "receiving trucks internal update" on public.receiving_ticket_trucks;
create policy "receiving trucks internal update"
on public.receiving_ticket_trucks
for update
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());
