alter table public.racks
  add column if not exists layout_x integer,
  add column if not exists layout_y integer,
  add column if not exists layout_group text,
  add column if not exists rotation integer not null default 0,
  add column if not exists is_active boolean not null default true;

update public.racks
set
  layout_group = coalesce(layout_group, upper(left(rack_code, 1))),
  rotation = coalesce(rotation, 0)
where layout_group is null or rotation is null;
