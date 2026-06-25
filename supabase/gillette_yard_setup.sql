-- TITAN Gillette yard setup.
-- Safe to run more than once. This does not delete or modify Pathfinder WTX inventory.

alter table public.racks add column if not exists layout_width integer;
alter table public.racks add column if not exists layout_height integer;

insert into public.yards (name, code)
values ('Gillette Yard', 'GILLETTE')
on conflict (code) do update
set name = excluded.name,
    is_active = true;

with yard as (
  select id from public.yards where code = 'GILLETTE' limit 1
)
insert into public.workflow_zones (yard_id, name, code, sort_order, is_active)
select yard.id, zone.name, zone.code, zone.sort_order, true
from yard
cross join (
  values
    ('Shipping', 'shipping', 10),
    ('Receiving', 'receiving', 20),
    ('Water Blaster', 'water_blaster', 30),
    ('Inspection', 'inspection', 40),
    ('Hardband', 'hardband', 50),
    ('Machine Shop', 'machine_shop', 60)
) as zone(name, code, sort_order)
on conflict (yard_id, code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

with yard as (
  select id from public.yards where code = 'GILLETTE' limit 1
),
rack_layout as (
  select *
  from (
    values
      ('Tower DBR Rack', 72, 70, 112, 44, 0, 1),
      ('Rack 9', 210, 70, 116, 76, 0, 2),
      ('Rack 8', 352, 70, 116, 76, 0, 3),
      ('Rack 7', 496, 70, 116, 76, 0, 4),
      ('Rack 6', 640, 70, 116, 76, 0, 5),
      ('North Gate', 782, 70, 226, 26, 0, 6),
      ('Rack 5', 1030, 70, 94, 66, 0, 7),
      ('Rack 4', 1150, 70, 94, 66, 0, 8),
      ('Rack 3', 1270, 70, 94, 66, 0, 9),
      ('Rack 2', 1360, 224, 48, 112, 90, 10),
      ('Rack 1', 1338, 356, 72, 104, 90, 11),
      ('Rack 10', 44, 224, 52, 112, 90, 12),
      ('Rack 11', 82, 356, 72, 104, 90, 13),
      ('Rack 12', 82, 486, 72, 104, 90, 14),
      ('Rack 13', 82, 616, 72, 86, 90, 15),
      ('Board Bunks', 40, 706, 84, 42, 0, 16),
      ('Rack 18', 210, 224, 116, 90, 0, 17),
      ('Rack 17', 352, 224, 116, 90, 0, 18),
      ('Rack 19', 210, 356, 116, 90, 0, 19),
      ('Rack 20', 352, 356, 116, 90, 0, 20),
      ('Rack 14', 112, 754, 116, 76, 0, 21),
      ('Rack 15', 252, 754, 116, 76, 0, 22),
      ('Rack 16', 414, 754, 116, 76, 0, 23),
      ('Helicopter Rack', 1115, 642, 118, 78, 0, 24),
      ('Waist High Racks', 1262, 642, 120, 64, 0, 25)
  ) as rack(rack_code, layout_x, layout_y, layout_width, layout_height, rotation, sort_order)
)
insert into public.racks (
  yard_id,
  rack_code,
  capacity_joints,
  sort_order,
  layout_x,
  layout_y,
  layout_width,
  layout_height,
  layout_group,
  rotation,
  is_active
)
select
  yard.id,
  rack_layout.rack_code,
  500,
  rack_layout.sort_order,
  rack_layout.layout_x,
  rack_layout.layout_y,
  rack_layout.layout_width,
  rack_layout.layout_height,
  'Gillette',
  rack_layout.rotation,
  true
from yard
cross join rack_layout
on conflict (yard_id, rack_code) do update
set sort_order = excluded.sort_order,
    layout_x = excluded.layout_x,
    layout_y = excluded.layout_y,
    layout_width = excluded.layout_width,
    layout_height = excluded.layout_height,
    layout_group = excluded.layout_group,
    is_active = true;

with codes as (
  select *
  from (
    values
      ('DP4XT39', 'DRILL PIPE 4" XT-39', '4"', 'XT-39'),
      ('DP4XT39YB', 'DRILL PIPE 4" XT-39 YELLOW BAND', '4"', 'XT-39'),
      ('DP4DS38', 'DRILL PIPE 4" DS-38', '4"', 'DS-38'),
      ('DP4DS38B', 'DRILL PIPE 4" DS-38 BAOSHAN', '4"', 'DS-38'),
      ('DP45DS42', 'DRILL PIPE 4.5" DS-42', '4.5"', 'DS-42'),
      ('HW4DS38', 'HEAVY WEIGHT 4" DS-38', '4"', 'DS-38'),
      ('HW4XT39', 'HEAVY WEIGHT 4" XT-39', '4"', 'XT-39'),
      ('HW5NC50', 'HEAVY WEIGHT 5" NC-50 CONVENTIONAL', '5"', 'NC-50'),
      ('HW5NC50S', 'HEAVY WEIGHT 5" NC-50 SPIRAL', '5"', 'NC-50'),
      ('TU2875PH6', 'TUBING 2.875" PH6 CONNECTIONS', '2.875"', 'PH6'),
      ('TU2375PH6', 'TUBING 2.375" PH6 CONNECTIONS', '2.375"', 'PH6')
  ) as code(part_number, description, size, connection)
)
insert into public.part_numbers (company_id, part_number, description, size, grade, connection, pipe_range)
select
  null,
  codes.part_number,
  codes.description,
  codes.size,
  null,
  codes.connection,
  'Range 2'
from codes
where not exists (
  select 1
  from public.part_numbers existing
  where existing.company_id is null
    and existing.part_number = codes.part_number
);
