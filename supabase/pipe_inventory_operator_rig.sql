alter table public.pipe_inventory
  add column if not exists operator text,
  add column if not exists rig text;
