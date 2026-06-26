alter table public.ticket_line_items enable row level security;

drop policy if exists "ticket line items internal full" on public.ticket_line_items;

create policy "ticket line items internal full"
on public.ticket_line_items
for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());
