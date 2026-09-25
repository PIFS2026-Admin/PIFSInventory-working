begin;

alter table public.titan_ap_invoices drop constraint if exists titan_ap_invoices_status_check;
alter table public.titan_ap_invoices
  add constraint titan_ap_invoices_status_check
  check (status in ('awaiting_approval', 'returned_to_ap', 'disputed', 'approved', 'voided'));

alter table public.titan_ap_invoices add column if not exists resolution_note text;
alter table public.titan_ap_invoices add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.titan_ap_invoices add column if not exists resolved_by_name text;
alter table public.titan_ap_invoices add column if not exists resolved_at timestamptz;
alter table public.titan_ap_invoices add column if not exists void_reason text;
alter table public.titan_ap_invoices add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.titan_ap_invoices add column if not exists voided_by_name text;
alter table public.titan_ap_invoices add column if not exists voided_at timestamptz;

alter table public.titan_ap_invoice_files add column if not exists document_type text;
alter table public.titan_ap_invoice_files drop constraint if exists titan_ap_invoice_files_document_type_check;
alter table public.titan_ap_invoice_files
  add constraint titan_ap_invoice_files_document_type_check
  check (document_type is null or document_type in ('receipt', 'purchase_order', 'correspondence', 'other'));

comment on column public.titan_ap_invoices.resolution_note is
  'Required AP explanation recorded when a disputed invoice is resolved and returned for approval.';
comment on column public.titan_ap_invoices.void_reason is
  'Required AP explanation for voiding an invoice entered in error.';
comment on column public.titan_ap_invoice_files.document_type is
  'Classification for supporting invoice documents; original and corrected invoice versions remain unclassified.';

commit;
