insert into public.yards (name, code)
values ('Pathfinder Yard', 'PIFS')
on conflict (code) do nothing;

insert into public.workflow_zones (yard_id, name, code, sort_order)
select y.id, z.name, z.code, z.sort_order
from public.yards y
cross join (
  values
    ('Loading', 'loading', 10),
    ('Unloading', 'unloading', 20),
    ('Bucking', 'bucking', 30),
    ('Water Blaster', 'water_blaster', 40),
    ('EMI', 'emi', 50),
    ('Hydro', 'hydro', 60),
    ('Machine Shop', 'machine_shop', 70),
    ('Scrap', 'scrap', 80),
    ('Warehouse', 'warehouse', 90)
) as z(name, code, sort_order)
where y.code = 'PIFS'
on conflict (yard_id, code) do nothing;

insert into public.racks (yard_id, rack_code, capacity_joints, sort_order)
select
  y.id,
  concat(r.n, s.side),
  500,
  ((r.n - 200) * 2) + s.sort
from public.yards y
cross join generate_series(200, 300) as r(n)
cross join (values ('A', 1), ('B', 2)) as s(side, sort)
where y.code = 'PIFS'
on conflict (yard_id, rack_code) do nothing;