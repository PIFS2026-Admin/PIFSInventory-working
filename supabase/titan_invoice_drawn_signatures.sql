begin;

alter table public.titan_ap_invoice_approvals add column if not exists signature_storage_bucket text;
alter table public.titan_ap_invoice_approvals add column if not exists signature_storage_path text;
alter table public.titan_ap_invoice_approvals add column if not exists signature_sha256 text;
alter table public.titan_ap_invoice_approvals alter column signature_version set default 'titan-drawn-v1';

drop function if exists public.titan_ap_approve_invoice(uuid, uuid, text, text);
drop function if exists public.titan_ap_approve_invoice(uuid, uuid, text, text, text, text, text);
create function public.titan_ap_approve_invoice(
  p_invoice_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_approval_statement text,
  p_signature_bucket text,
  p_signature_path text,
  p_signature_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.titan_ap_invoices%rowtype;
  coding_total numeric(14,2);
  coding_rows jsonb;
  file_hash text;
  approval_id uuid;
begin
  select * into invoice_row
  from public.titan_ap_invoices
  where id = p_invoice_id
  for update;

  if not found then raise exception 'Invoice not found.'; end if;
  if invoice_row.status <> 'awaiting_approval' then
    raise exception 'This invoice is no longer awaiting approval.';
  end if;
  if invoice_row.assigned_approver_id <> p_actor_id then
    raise exception 'Only the assigned approver can approve this invoice.';
  end if;
  if exists (select 1 from public.titan_ap_invoice_approvals where invoice_id = p_invoice_id) then
    raise exception 'This invoice has already been approved.';
  end if;
  if nullif(btrim(p_signature_bucket), '') is null
     or nullif(btrim(p_signature_path), '') is null
     or p_signature_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid captured signature is required.';
  end if;

  select coalesce(sum(amount), 0), coalesce(jsonb_agg(to_jsonb(lines) order by line_number), '[]'::jsonb)
  into coding_total, coding_rows
  from (
    select line_number, accounting_code, accounting_code_description, amount,
           cost_center, department, job_number, description
    from public.titan_ap_invoice_coding_lines
    where invoice_id = p_invoice_id
  ) lines;

  if coding_rows = '[]'::jsonb then raise exception 'Add at least one accounting code.'; end if;
  if coding_total <> invoice_row.total_amount then
    raise exception 'Coding amounts must equal the invoice total.';
  end if;

  select sha256 into file_hash
  from public.titan_ap_invoice_files
  where invoice_id = p_invoice_id and is_current
  limit 1;
  if file_hash is null then raise exception 'The original invoice file is missing.'; end if;

  insert into public.titan_ap_invoice_approvals (
    invoice_id, approver_id, approver_name, approved_total, coding_snapshot,
    original_file_sha256, approval_statement, signature_version,
    signature_storage_bucket, signature_storage_path, signature_sha256
  ) values (
    p_invoice_id, p_actor_id, p_actor_name, invoice_row.total_amount, coding_rows,
    file_hash, p_approval_statement, 'titan-drawn-v1',
    btrim(p_signature_bucket), btrim(p_signature_path), p_signature_sha256
  ) returning id into approval_id;

  update public.titan_ap_invoices
  set status = 'approved', dispute_reason = null, return_reason = null,
      row_version = row_version + 1
  where id = p_invoice_id;

  insert into public.titan_ap_invoice_activity (
    invoice_id, action, actor_id, actor_name, from_status, to_status, note, details
  ) values (
    p_invoice_id, 'approved', p_actor_id, p_actor_name,
    'awaiting_approval', 'approved', p_approval_statement,
    jsonb_build_object(
      'approval_id', approval_id,
      'approved_total', invoice_row.total_amount,
      'signature_sha256', p_signature_sha256,
      'signature_version', 'titan-drawn-v1'
    )
  );

  return approval_id;
end;
$$;

revoke all on function public.titan_ap_approve_invoice(uuid, uuid, text, text, text, text, text) from public, authenticated;
grant execute on function public.titan_ap_approve_invoice(uuid, uuid, text, text, text, text, text) to service_role;

comment on column public.titan_ap_invoice_approvals.signature_storage_path is
  'Private immutable PNG captured from the approver signature pad.';
comment on column public.titan_ap_invoice_approvals.signature_sha256 is
  'SHA-256 fingerprint of the captured signature PNG.';

commit;
