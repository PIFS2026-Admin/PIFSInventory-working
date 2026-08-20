-- TITAN customer standalone yards
-- Run after supabase/customer_yard_access.sql.

alter table public.yards
  add column if not exists owner_company_id uuid references public.companies(id) on delete restrict,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.inventory_user_yards
  add column if not exists can_access boolean not null default true;

create index if not exists yards_owner_company_id_idx
  on public.yards (owner_company_id, is_active, name);

create index if not exists inventory_user_yards_user_yard_idx
  on public.inventory_user_yards (user_id, yard_id);

create or replace function public.can_access_titan_yard(p_yard_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and (
        lower(coalesce(auth.jwt() ->> 'email', '')) = 'wade@pathfinderinspections.com'
        or lower(coalesce(profile.role::text, '')) in ('admin', 'owner')
        or exists (
          select 1
          from public.inventory_user_yards assignment
          where assignment.user_id = auth.uid()
            and assignment.yard_id = p_yard_id
            and coalesce(assignment.can_access, true)
        )
      )
  );
$$;

create or replace function public.can_manage_customer_yard(target_yard_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.yards yard on yard.id = target_yard_id
    where profile.id = auth.uid()
      and lower(coalesce(profile.role::text, '')) = 'customer'
      and profile.company_id is not null
      and yard.owner_company_id = profile.company_id
      and exists (
        select 1
        from public.inventory_user_yards assignment
        where assignment.user_id = auth.uid()
          and assignment.yard_id = target_yard_id
          and coalesce(assignment.can_access, true)
      )
  );
$$;

revoke all on function public.can_access_titan_yard(uuid) from public;
revoke all on function public.can_manage_customer_yard(uuid) from public;
grant execute on function public.can_access_titan_yard(uuid) to authenticated, service_role;
grant execute on function public.can_manage_customer_yard(uuid) to authenticated, service_role;

-- Customers can discover only assigned yards. Internal access remains unchanged.
drop policy if exists "yards visible to authenticated" on public.yards;
drop policy if exists "yards visible by assignment" on public.yards;
drop policy if exists "customer assigned yard read" on public.yards;
create policy "customer assigned yard read"
on public.yards for select to authenticated
using (
  public.is_internal_user()
  or public.can_access_titan_yard(id)
);

drop policy if exists "racks visible to authenticated" on public.racks;
drop policy if exists "racks visible by yard assignment" on public.racks;
drop policy if exists "customer assigned rack read" on public.racks;
create policy "customer assigned rack read"
on public.racks for select to authenticated
using (
  public.is_internal_user()
  or public.can_access_titan_yard(yard_id)
);

drop policy if exists "zones visible to authenticated" on public.workflow_zones;
drop policy if exists "zones visible by yard assignment" on public.workflow_zones;
drop policy if exists "customer assigned zone read" on public.workflow_zones;
create policy "customer assigned zone read"
on public.workflow_zones for select to authenticated
using (
  public.is_internal_user()
  or public.can_access_titan_yard(yard_id)
);

-- Inventory requires both the customer's company and an assigned yard.
drop policy if exists "inventory customer read own" on public.pipe_inventory;
drop policy if exists "inventory customer read own assigned yards" on public.pipe_inventory;
drop policy if exists "customers read own pipe_inventory" on public.pipe_inventory;
drop policy if exists "customer company assigned yard inventory read" on public.pipe_inventory;
create policy "customer company assigned yard inventory read"
on public.pipe_inventory for select to authenticated
using (
  public.is_internal_user()
  or (
    company_id = public.current_user_company_id()
    and public.can_access_titan_yard(yard_id)
  )
);

drop policy if exists "transactions customer read own" on public.pipe_transactions;
drop policy if exists "transactions customer read own assigned yards" on public.pipe_transactions;
create policy "transactions customer read own assigned yards"
on public.pipe_transactions for select to authenticated
using (
  company_id = public.current_user_company_id()
  and exists (
    select 1 from public.pipe_inventory inventory
    where inventory.id = pipe_transactions.pipe_inventory_id
      and inventory.company_id = public.current_user_company_id()
      and public.can_access_titan_yard(inventory.yard_id)
  )
);

-- Tickets require both the customer's company and an assigned yard.
drop policy if exists "receiving tickets customer read own" on public.receiving_tickets;
drop policy if exists "receiving tickets customer read own assigned yards" on public.receiving_tickets;
drop policy if exists "customer company assigned yard receiving read" on public.receiving_tickets;
create policy "customer company assigned yard receiving read"
on public.receiving_tickets for select to authenticated
using (
  public.is_internal_user()
  or (
    company_id = public.current_user_company_id()
    and public.can_access_titan_yard(yard_id)
  )
);

drop policy if exists "shipping tickets customer read own" on public.shipping_tickets;
drop policy if exists "shipping tickets customer read own assigned yards" on public.shipping_tickets;
drop policy if exists "customer company assigned yard shipping read" on public.shipping_tickets;
create policy "customer company assigned yard shipping read"
on public.shipping_tickets for select to authenticated
using (
  public.is_internal_user()
  or (
    company_id = public.current_user_company_id()
    and public.can_access_titan_yard(yard_id)
  )
);

-- Child ticket records inherit authorization from their parent ticket.
drop policy if exists "ticket line items customer read own" on public.ticket_line_items;
drop policy if exists "ticket line items customer read own assigned yards" on public.ticket_line_items;
drop policy if exists "customer receiving line read" on public.ticket_line_items;
create policy "customer receiving line read"
on public.ticket_line_items for select to authenticated
using (
  public.is_internal_user()
  or (
    company_id = public.current_user_company_id()
    and (
      receiving_ticket_id is not null
      and exists (
        select 1 from public.receiving_tickets ticket
        where ticket.id = ticket_line_items.receiving_ticket_id
          and ticket.company_id = public.current_user_company_id()
          and public.can_access_titan_yard(ticket.yard_id)
      )
      or shipping_ticket_id is not null
      and exists (
        select 1 from public.shipping_tickets ticket
        where ticket.id = ticket_line_items.shipping_ticket_id
          and ticket.company_id = public.current_user_company_id()
          and public.can_access_titan_yard(ticket.yard_id)
      )
      or pipe_inventory_id is not null
      and exists (
        select 1 from public.pipe_inventory inventory
        where inventory.id = ticket_line_items.pipe_inventory_id
          and inventory.company_id = public.current_user_company_id()
          and public.can_access_titan_yard(inventory.yard_id)
      )
    )
  )
);

drop policy if exists "documents customer read own" on public.documents;
drop policy if exists "documents customer read own assigned yards" on public.documents;
drop policy if exists "customers read own documents" on public.documents;
create policy "documents customer read own assigned yards"
on public.documents for select to authenticated
using (
  company_id = public.current_user_company_id()
  and (
    exists (
      select 1 from public.receiving_tickets ticket
      where ticket.id = documents.receiving_ticket_id
        and ticket.company_id = public.current_user_company_id()
        and public.can_access_titan_yard(ticket.yard_id)
    )
    or exists (
      select 1 from public.shipping_tickets ticket
      where ticket.id = documents.shipping_ticket_id
        and ticket.company_id = public.current_user_company_id()
        and public.can_access_titan_yard(ticket.yard_id)
    )
    or exists (
      select 1 from public.pipe_inventory inventory
      where inventory.id = documents.pipe_inventory_id
        and inventory.company_id = public.current_user_company_id()
        and public.can_access_titan_yard(inventory.yard_id)
    )
  )
);

do $$
begin
  if to_regclass('public.receiving_ticket_trucks') is not null then
    execute 'drop policy if exists "receiving trucks customer read own" on public.receiving_ticket_trucks';
    execute 'drop policy if exists "receiving trucks customer read own assigned yards" on public.receiving_ticket_trucks';
    execute 'drop policy if exists "customer receiving truck assigned yard read" on public.receiving_ticket_trucks';
    execute $policy$
      create policy "customer receiving truck assigned yard read"
      on public.receiving_ticket_trucks for select to authenticated
      using (
        public.is_internal_user()
        or exists (
          select 1 from public.receiving_tickets ticket
          where ticket.id = receiving_ticket_trucks.receiving_ticket_id
            and ticket.company_id = public.current_user_company_id()
            and public.can_access_titan_yard(ticket.yard_id)
        )
      )
    $policy$;
  end if;
end $$;

drop policy if exists "release requests read own company or internal" on public.tubular_release_requests;
drop policy if exists "customers read own tubular_release_requests" on public.tubular_release_requests;
create policy "release requests read own company or internal"
on public.tubular_release_requests for select to authenticated
using (
  public.is_internal_user()
  or (
    company_id = public.current_user_company_id()
    and public.can_access_titan_yard(yard_id)
  )
);

drop policy if exists "release requests customer insert own company" on public.tubular_release_requests;
create policy "release requests customer insert own company"
on public.tubular_release_requests for insert to authenticated
with check (
  public.is_internal_user()
  or (
    company_id = public.current_user_company_id()
    and public.can_access_titan_yard(yard_id)
  )
);

-- Customers configure layouts through /api/customer-yards. No broad customer
-- insert/update/delete policy is granted on yard, rack, or work-zone tables.
