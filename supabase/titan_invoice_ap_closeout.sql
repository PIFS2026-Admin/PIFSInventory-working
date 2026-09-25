begin;

alter table public.titan_ap_invoices drop constraint if exists titan_ap_invoices_status_check;
alter table public.titan_ap_invoices
  add constraint titan_ap_invoices_status_check
  check (status in (
    'awaiting_approval',
    'returned_to_ap',
    'disputed',
    'approved',
    'posted',
    'paid',
    'archived',
    'voided'
  ));

alter table public.titan_ap_invoices add column if not exists posting_reference text;
alter table public.titan_ap_invoices add column if not exists posted_by uuid references auth.users(id) on delete set null;
alter table public.titan_ap_invoices add column if not exists posted_by_name text;
alter table public.titan_ap_invoices add column if not exists posted_at timestamptz;
alter table public.titan_ap_invoices add column if not exists payment_reference text;
alter table public.titan_ap_invoices add column if not exists payment_date date;
alter table public.titan_ap_invoices add column if not exists paid_by uuid references auth.users(id) on delete set null;
alter table public.titan_ap_invoices add column if not exists paid_by_name text;
alter table public.titan_ap_invoices add column if not exists paid_at timestamptz;
alter table public.titan_ap_invoices add column if not exists archive_note text;
alter table public.titan_ap_invoices add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.titan_ap_invoices add column if not exists archived_by_name text;
alter table public.titan_ap_invoices add column if not exists archived_at timestamptz;

alter table public.titan_ap_invoice_files drop constraint if exists titan_ap_invoice_files_document_type_check;
alter table public.titan_ap_invoice_files
  add constraint titan_ap_invoice_files_document_type_check
  check (document_type is null or document_type in (
    'receipt',
    'purchase_order',
    'correspondence',
    'payment_confirmation',
    'other'
  ));

comment on column public.titan_ap_invoices.posting_reference is
  'Accounting-system batch, voucher, or posting reference entered by AP.';
comment on column public.titan_ap_invoices.payment_reference is
  'Check, ACH, wire, or other payment confirmation reference entered by AP.';
comment on column public.titan_ap_invoices.archive_note is
  'Optional final AP note recorded when the paid invoice is archived.';

commit;
