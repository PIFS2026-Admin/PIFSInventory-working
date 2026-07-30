create extension if not exists pgcrypto;

alter table public.pipe_inventory
  add column if not exists weight text;

alter table public.ticket_line_items
  add column if not exists weight text,
  add column if not exists missing_box_protectors integer not null default 0 check (missing_box_protectors >= 0),
  add column if not exists missing_pin_protectors integer not null default 0 check (missing_pin_protectors >= 0),
  add column if not exists line_sequence integer not null default 1 check (line_sequence > 0);

create index if not exists ticket_line_items_receiving_truck_sequence_idx
  on public.ticket_line_items(receiving_ticket_truck_id, line_sequence);

grant select, insert, update, delete on public.ticket_line_items to authenticated;

with first_truck_line as (
  select
    line.id,
    line.receiving_ticket_truck_id,
    row_number() over (
      partition by line.receiving_ticket_truck_id
      order by line.line_sequence, line.id
    ) as line_rank
  from public.ticket_line_items line
  where line.receiving_ticket_truck_id is not null
)
update public.ticket_line_items line
set
  missing_box_protectors = truck.missing_box_protectors,
  missing_pin_protectors = truck.missing_pin_protectors
from first_truck_line first_line
join public.receiving_ticket_trucks truck
  on truck.id = first_line.receiving_ticket_truck_id
where line.id = first_line.id
  and first_line.line_rank = 1
  and line.missing_box_protectors = 0
  and line.missing_pin_protectors = 0
  and (
    truck.missing_box_protectors > 0
    or truck.missing_pin_protectors > 0
  );

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
    ), 0),
    missing_box_protectors = coalesce((
      select sum(missing_box_protectors)
      from public.ticket_line_items
      where receiving_ticket_truck_id = target_truck_id
    ), 0),
    missing_pin_protectors = coalesce((
      select sum(missing_pin_protectors)
      from public.ticket_line_items
      where receiving_ticket_truck_id = target_truck_id
    ), 0)
  where truck.id = target_truck_id
  returning truck.receiving_ticket_id into parent_ticket_id;

  perform public.recalculate_receiving_ticket_totals(parent_ticket_id);
end;
$$;

do $$
declare
  target_truck uuid;
begin
  for target_truck in select id from public.receiving_ticket_trucks loop
    perform public.recalculate_receiving_truck_totals(target_truck);
  end loop;
end $$;
