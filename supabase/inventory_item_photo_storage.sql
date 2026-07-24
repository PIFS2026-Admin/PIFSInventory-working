create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('inventory-item-photos', 'inventory-item-photos', true)
on conflict (id) do update
set public = true;

do $$
begin
  if to_regclass('public.inventory_documents') is not null then
    alter table public.inventory_documents
      add column if not exists yard_id uuid references public.yards(id) on delete set null;

    create index if not exists inventory_documents_item_photo_idx
      on public.inventory_documents(linked_record_type, linked_record_id, uploaded_at desc);

    create index if not exists inventory_documents_yard_id_idx
      on public.inventory_documents(yard_id);
  end if;
end $$;

drop policy if exists "inventory item photos public read" on storage.objects;
create policy "inventory item photos public read"
on storage.objects
for select
to public
using (bucket_id = 'inventory-item-photos');

drop policy if exists "inventory item photos internal upload" on storage.objects;
create policy "inventory item photos internal upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'inventory-item-photos'
  and name like 'inventory-items/%'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.role is null or p.role::text <> 'customer')
  )
);

drop policy if exists "inventory item photos internal update" on storage.objects;
create policy "inventory item photos internal update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'inventory-item-photos'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.role is null or p.role::text <> 'customer')
  )
)
with check (
  bucket_id = 'inventory-item-photos'
  and name like 'inventory-items/%'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.role is null or p.role::text <> 'customer')
  )
);

drop policy if exists "inventory item photos internal delete" on storage.objects;
create policy "inventory item photos internal delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'inventory-item-photos'
  and name like 'inventory-items/%'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.role is null or p.role::text <> 'customer')
  )
);
