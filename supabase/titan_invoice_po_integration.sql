-- Connect TITAN Invoice Approval records to Purchase Orders without requiring a PO.
-- Safe to run more than once in the Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.titan_ap_invoice_po_matches (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.titan_ap_invoices(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  matched_amount numeric(14, 2) not null default 0 check (matched_amount >= 0),
  match_status text not null default 'pending_receipt'
    check (match_status in ('pending_receipt', 'matched', 'variance', 'overridden')),
  tolerance_percent numeric(6, 3) not null default 5 check (tolerance_percent >= 0),
  authorized_remaining numeric(14, 2) not null default 0,
  received_remaining numeric(14, 2) not null default 0,
  variance_amount numeric(14, 2) not null default 0,
  exception_reason text,
  overridden_by uuid references auth.users(id) on delete set null,
  overridden_by_name text,
  override_reason text,
  overridden_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, purchase_order_id)
);

create table if not exists public.titan_ap_invoice_po_line_matches (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.titan_ap_invoice_po_matches(id) on delete cascade,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  quantity_invoiced numeric(12, 2) not null default 0 check (quantity_invoiced >= 0),
  matched_amount numeric(14, 2) not null default 0 check (matched_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, purchase_order_line_id)
);

create index if not exists titan_ap_invoice_po_matches_invoice_idx
  on public.titan_ap_invoice_po_matches(invoice_id);

create index if not exists titan_ap_invoice_po_matches_po_idx
  on public.titan_ap_invoice_po_matches(purchase_order_id);

create index if not exists titan_ap_invoice_po_line_matches_match_idx
  on public.titan_ap_invoice_po_line_matches(match_id);

create or replace function public.titan_ap_refresh_po_matches(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  po_total numeric(14, 2) := 0;
  received_total numeric(14, 2) := 0;
  prior_invoiced numeric(14, 2) := 0;
  available_authorized numeric(14, 2);
  available_received numeric(14, 2);
  tolerance_amount numeric(14, 2);
  match_row record;
begin
  select coalesce(total_amount, total_value, 0)
  into po_total
  from public.purchase_orders
  where id = p_purchase_order_id;

  select coalesce(sum(
    least(coalesce(quantity_received, 0), coalesce(quantity_ordered, 0))
    * coalesce(unit_price, unit_cost, case when coalesce(quantity_ordered, 0) = 0 then 0 else coalesce(line_total, 0) / quantity_ordered end, 0)
  ), 0)
  into received_total
  from public.purchase_order_lines
  where purchase_order_id = p_purchase_order_id;

  for match_row in
    select *
    from public.titan_ap_invoice_po_matches
    where purchase_order_id = p_purchase_order_id
    order by created_at, id
  loop
    available_authorized := greatest(0, po_total - prior_invoiced);
    available_received := greatest(0, received_total - prior_invoiced);
    tolerance_amount := po_total * match_row.tolerance_percent / 100;

    if match_row.match_status <> 'overridden' then
      if match_row.matched_amount - available_authorized > tolerance_amount + .005 then
        update public.titan_ap_invoice_po_matches
        set match_status = 'variance',
            authorized_remaining = available_authorized,
            received_remaining = available_received,
            variance_amount = match_row.matched_amount - available_authorized,
            exception_reason = 'Invoice exceeds the remaining PO amount by ' || to_char(match_row.matched_amount - available_authorized, 'FM9999999990.00') || '.'
        where id = match_row.id;
      elsif match_row.matched_amount - available_received > .005 then
        update public.titan_ap_invoice_po_matches
        set match_status = 'pending_receipt',
            authorized_remaining = available_authorized,
            received_remaining = available_received,
            variance_amount = match_row.matched_amount - available_received,
            exception_reason = 'Receipt value is ' || to_char(match_row.matched_amount - available_received, 'FM9999999990.00') || ' short of this invoice.'
        where id = match_row.id;
      else
        update public.titan_ap_invoice_po_matches
        set match_status = 'matched',
            authorized_remaining = available_authorized,
            received_remaining = available_received,
            variance_amount = 0,
            exception_reason = null
        where id = match_row.id;
      end if;
    end if;

    prior_invoiced := prior_invoiced + match_row.matched_amount;
  end loop;
end;
$$;

create or replace function public.titan_ap_refresh_po_matches_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'purchase_orders' then
    perform public.titan_ap_refresh_po_matches(coalesce(new.id, old.id));
  elsif tg_table_name = 'purchase_order_lines' then
    perform public.titan_ap_refresh_po_matches(coalesce(new.purchase_order_id, old.purchase_order_id));
  else
    perform public.titan_ap_refresh_po_matches(coalesce(new.purchase_order_id, old.purchase_order_id));
  end if;
  return null;
end;
$$;

drop trigger if exists refresh_ap_matches_after_po_total on public.purchase_orders;
create trigger refresh_ap_matches_after_po_total
after update of total_amount, total_value on public.purchase_orders
for each row execute function public.titan_ap_refresh_po_matches_trigger();

drop trigger if exists refresh_ap_matches_after_po_line on public.purchase_order_lines;
create trigger refresh_ap_matches_after_po_line
after insert or delete or update of quantity_ordered, quantity_received, unit_price, unit_cost, line_total on public.purchase_order_lines
for each row execute function public.titan_ap_refresh_po_matches_trigger();

drop trigger if exists refresh_ap_matches_after_invoice_link on public.titan_ap_invoice_po_matches;
create trigger refresh_ap_matches_after_invoice_link
after insert or delete or update of matched_amount, purchase_order_id on public.titan_ap_invoice_po_matches
for each row execute function public.titan_ap_refresh_po_matches_trigger();

revoke all on function public.titan_ap_refresh_po_matches(uuid) from public;
revoke all on function public.titan_ap_refresh_po_matches_trigger() from public;
grant execute on function public.titan_ap_refresh_po_matches(uuid) to service_role;

alter table public.titan_ap_invoice_po_matches enable row level security;
alter table public.titan_ap_invoice_po_line_matches enable row level security;

revoke all on public.titan_ap_invoice_po_matches from anon, authenticated;
revoke all on public.titan_ap_invoice_po_line_matches from anon, authenticated;
grant select, insert, update, delete on public.titan_ap_invoice_po_matches to service_role;
grant select, insert, update, delete on public.titan_ap_invoice_po_line_matches to service_role;

drop trigger if exists set_titan_ap_invoice_po_matches_updated_at on public.titan_ap_invoice_po_matches;
create trigger set_titan_ap_invoice_po_matches_updated_at
before update on public.titan_ap_invoice_po_matches
for each row execute function public.titan_ap_set_updated_at();

drop trigger if exists set_titan_ap_invoice_po_line_matches_updated_at on public.titan_ap_invoice_po_line_matches;
create trigger set_titan_ap_invoice_po_line_matches_updated_at
before update on public.titan_ap_invoice_po_line_matches
for each row execute function public.titan_ap_set_updated_at();

comment on table public.titan_ap_invoice_po_matches is
  'Optional bridge between AP invoices and purchase orders. An AP invoice can remain standalone.';

comment on table public.titan_ap_invoice_po_line_matches is
  'Optional line-level PO allocations reserved for detailed three-way matching.';

select public.titan_ap_refresh_po_matches(id)
from public.purchase_orders;

commit;
