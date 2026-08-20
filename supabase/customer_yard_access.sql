-- TITAN customer-specific yard access
-- Run once in the Supabase SQL Editor after deploying the matching application update.
-- Existing yards, inventory, tickets, and assignments are preserved.

create table if not exists public.inventory_user_yards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  yard_id uuid not null references public.yards(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, yard_id)
);

create index if not exists inventory_user_yards_user_id_idx
  on public.inventory_user_yards (user_id);

create index if not exists inventory_user_yards_yard_id_idx
  on public.inventory_user_yards (yard_id);

alter table public.inventory_user_yards enable row level security;
grant select on public.inventory_user_yards to authenticated;

drop policy if exists "inventory user yards self read" on public.inventory_user_yards;
create policy "inventory user yards self read"
on public.inventory_user_yards
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.can_access_titan_yard(p_yard_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    p_yard_id is not null
    and (
      lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'wade@pathfinderinspections.com'
      or exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and lower(coalesce(profile.role::text, '')) in ('admin', 'owner')
      )
      or exists (
        select 1
        from public.inventory_user_yards assignment
        where assignment.user_id = (select auth.uid())
          and assignment.yard_id = p_yard_id
      )
    );
$$;

grant execute on function public.can_access_titan_yard(uuid) to authenticated;

-- Customers can discover only assigned active yards and their layouts.
-- Existing internal access remains unchanged.
drop policy if exists "yards visible to authenticated" on public.yards;
drop policy if exists "yards visible by assignment" on public.yards;
create policy "yards visible by assignment"
on public.yards
for select
to authenticated
using (
  public.is_internal_user()
  or public.can_access_titan_yard(id)
);

drop policy if exists "racks visible to authenticated" on public.racks;
drop policy if exists "racks visible by yard assignment" on public.racks;
create policy "racks visible by yard assignment"
on public.racks
for select
to authenticated
using (
  public.is_internal_user()
  or public.can_access_titan_yard(yard_id)
);

drop policy if exists "zones visible to authenticated" on public.workflow_zones;
drop policy if exists "zones visible by yard assignment" on public.workflow_zones;
create policy "zones visible by yard assignment"
on public.workflow_zones
for select
to authenticated
using (
  public.is_internal_user()
  or public.can_access_titan_yard(yard_id)
);

-- Customer inventory remains company-private and is now yard-private too.
drop policy if exists "inventory customer read own" on public.pipe_inventory;
drop policy if exists "inventory customer read own assigned yards" on public.pipe_inventory;
create policy "inventory customer read own assigned yards"
on public.pipe_inventory
for select
to authenticated
using (
  company_id = public.current_user_company_id()
  and public.can_access_titan_yard(yard_id)
);

drop policy if exists "transactions customer read own" on public.pipe_transactions;
drop policy if exists "transactions customer read own assigned yards" on public.pipe_transactions;
create policy "transactions customer read own assigned yards"
on public.pipe_transactions
for select
to authenticated
using (
  company_id = public.current_user_company_id()
  and exists (
    select 1
    from public.pipe_inventory inventory
    where inventory.id = pipe_transactions.pipe_inventory_id
      and inventory.company_id = public.current_user_company_id()
      and public.can_access_titan_yard(inventory.yard_id)
  )
);

drop policy if exists "receiving tickets customer read own" on public.receiving_tickets;
drop policy if exists "receiving tickets customer read own assigned yards" on public.receiving_tickets;
create policy "receiving tickets customer read own assigned yards"
on public.receiving_tickets
for select
to authenticated
using (
  company_id = public.current_user_company_id()
  and public.can_access_titan_yard(yard_id)
);

drop policy if exists "shipping tickets customer read own" on public.shipping_tickets;
drop policy if exists "shipping tickets customer read own assigned yards" on public.shipping_tickets;
create policy "shipping tickets customer read own assigned yards"
on public.shipping_tickets
for select
to authenticated
using (
  company_id = public.current_user_company_id()
  and public.can_access_titan_yard(yard_id)
);

drop policy if exists "ticket line items customer read own" on public.ticket_line_items;
drop policy if exists "ticket line items customer read own assigned yards" on public.ticket_line_items;
create policy "ticket line items customer read own assigned yards"
on public.ticket_line_items
for select
to authenticated
using (
  company_id = public.current_user_company_id()
  and (
    exists (
      select 1 from public.receiving_tickets ticket
      where ticket.id = ticket_line_items.receiving_ticket_id
        and public.can_access_titan_yard(ticket.yard_id)
    )
    or exists (
      select 1 from public.shipping_tickets ticket
      where ticket.id = ticket_line_items.shipping_ticket_id
        and public.can_access_titan_yard(ticket.yard_id)
    )
    or exists (
      select 1 from public.pipe_inventory inventory
      where inventory.id = ticket_line_items.pipe_inventory_id
        and public.can_access_titan_yard(inventory.yard_id)
    )
  )
);

drop policy if exists "documents customer read own" on public.documents;
drop policy if exists "documents customer read own assigned yards" on public.documents;
create policy "documents customer read own assigned yards"
on public.documents
for select
to authenticated
using (
  company_id = public.current_user_company_id()
  and (
    exists (
      select 1 from public.receiving_tickets ticket
      where ticket.id = documents.receiving_ticket_id
        and public.can_access_titan_yard(ticket.yard_id)
    )
    or exists (
      select 1 from public.shipping_tickets ticket
      where ticket.id = documents.shipping_ticket_id
        and public.can_access_titan_yard(ticket.yard_id)
    )
    or exists (
      select 1 from public.pipe_inventory inventory
      where inventory.id = documents.pipe_inventory_id
        and public.can_access_titan_yard(inventory.yard_id)
    )
  )
);

do $$
begin
  if to_regclass('public.receiving_ticket_trucks') is not null then
    execute 'drop policy if exists "receiving trucks customer read own" on public.receiving_ticket_trucks';
    execute 'drop policy if exists "receiving trucks customer read own assigned yards" on public.receiving_ticket_trucks';
    execute $policy$
      create policy "receiving trucks customer read own assigned yards"
      on public.receiving_ticket_trucks
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.receiving_tickets ticket
          where ticket.id = receiving_ticket_trucks.receiving_ticket_id
            and ticket.company_id = public.current_user_company_id()
            and public.can_access_titan_yard(ticket.yard_id)
        )
      )
    $policy$;
  end if;
end $$;
