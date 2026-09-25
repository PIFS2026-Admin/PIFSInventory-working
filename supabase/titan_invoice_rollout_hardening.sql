begin;

create table if not exists public.titan_ap_invoice_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.titan_ap_invoices(id) on delete restrict,
  notification_id uuid references public.notifications(id) on delete set null,
  event_category text not null,
  event_title text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_name text not null,
  recipient_email text,
  email_status text not null default 'pending',
  email_error text,
  push_status text not null default 'pending',
  push_error text,
  created_at timestamptz not null default now(),
  unique (notification_id)
);

create index if not exists titan_ap_invoice_notification_delivery_invoice_idx
  on public.titan_ap_invoice_notification_deliveries (invoice_id, created_at desc);

alter table public.titan_ap_invoice_notification_deliveries enable row level security;
revoke all on public.titan_ap_invoice_notification_deliveries from anon, authenticated;
grant select, insert, update, delete on public.titan_ap_invoice_notification_deliveries to service_role;

create or replace function public.titan_ap_register_invoice_file(
  p_invoice_id uuid,
  p_file_kind text,
  p_document_type text,
  p_version_number integer,
  p_storage_bucket text,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_sha256 text,
  p_note text,
  p_actor_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
  invoice_status text;
begin
  select status into invoice_status from public.titan_ap_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if p_file_kind not in ('original', 'corrected', 'supporting') then raise exception 'Invalid invoice file type.'; end if;

  if p_file_kind <> 'supporting' then
    update public.titan_ap_invoice_files
    set is_current = false
    where invoice_id = p_invoice_id and is_current;
  end if;

  insert into public.titan_ap_invoice_files (
    invoice_id, file_kind, document_type, version_number, is_current,
    storage_bucket, storage_path, original_file_name, mime_type, file_size,
    sha256, uploaded_by, uploaded_by_name
  ) values (
    p_invoice_id, p_file_kind, nullif(btrim(p_document_type), ''),
    p_version_number, p_file_kind <> 'supporting', p_storage_bucket,
    p_storage_path, p_original_file_name, p_mime_type, p_file_size,
    p_sha256, p_actor_id, p_actor_name
  ) returning id into saved_id;

  if p_file_kind in ('corrected', 'supporting') then
    insert into public.titan_ap_invoice_activity (
      invoice_id, action, actor_id, actor_name, from_status, to_status, note, details
    ) values (
      p_invoice_id,
      case when p_file_kind = 'corrected' then 'file_replaced' else 'supporting_document_added' end,
      p_actor_id, p_actor_name, invoice_status, invoice_status,
      nullif(btrim(p_note), ''),
      jsonb_build_object(
        'file_id', saved_id,
        'version_number', p_version_number,
        'document_type', nullif(btrim(p_document_type), ''),
        'file_name', p_original_file_name
      )
    );
  end if;

  return saved_id;
end;
$$;

create or replace function public.titan_ap_apply_invoice_action(
  p_invoice_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.titan_ap_invoices%rowtype;
  next_status text;
  event_action text := p_action;
  event_note text;
  event_details jsonb := coalesce(p_payload, '{}'::jsonb);
  approver_id uuid;
  correction_reason text;
begin
  select * into invoice_row
  from public.titan_ap_invoices
  where id = p_invoice_id
  for update;
  if not found then raise exception 'Invoice not found.'; end if;

  next_status := invoice_row.status;

  if p_action in ('dispute', 'return') then
    if invoice_row.status <> 'awaiting_approval' or invoice_row.assigned_approver_id <> p_actor_id then
      raise exception 'Only the assigned approver can take this action.';
    end if;
    event_note := nullif(btrim(p_payload->>'reason'), '');
    if event_note is null then raise exception 'A reason is required.'; end if;
    next_status := case when p_action = 'dispute' then 'disputed' else 'returned_to_ap' end;
    event_action := case when p_action = 'dispute' then 'disputed' else 'returned_to_ap' end;
    update public.titan_ap_invoices set
      status = next_status,
      dispute_reason = case when p_action = 'dispute' then event_note else null end,
      return_reason = case when p_action = 'return' then event_note else null end,
      row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'resolve_dispute' then
    if invoice_row.status <> 'disputed' then raise exception 'Only disputed invoices can be resolved.'; end if;
    event_note := nullif(btrim(p_payload->>'note'), '');
    approver_id := nullif(p_payload->>'approver_id', '')::uuid;
    if event_note is null or approver_id is null then raise exception 'Resolution note and approver are required.'; end if;
    next_status := 'awaiting_approval';
    event_action := 'dispute_resolved';
    event_details := event_details || jsonb_build_object('original_dispute_reason', invoice_row.dispute_reason);
    update public.titan_ap_invoices set
      assigned_approver_id = approver_id, assigned_by = p_actor_id,
      assigned_at = now(), status = next_status, resolution_note = event_note,
      resolved_by = p_actor_id, resolved_by_name = p_actor_name,
      resolved_at = now(), row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'void' then
    if invoice_row.status in ('approved', 'posted', 'paid', 'archived', 'voided') then
      raise exception 'Approved, archived, or already voided invoices cannot be voided.';
    end if;
    event_note := nullif(btrim(p_payload->>'reason'), '');
    if event_note is null then raise exception 'A void reason is required.'; end if;
    next_status := 'voided';
    event_action := 'voided';
    update public.titan_ap_invoices set
      status = next_status, void_reason = event_note, voided_by = p_actor_id,
      voided_by_name = p_actor_name, voided_at = now(), row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'reassign' then
    if invoice_row.status in ('approved', 'posted', 'paid', 'archived', 'voided', 'disputed') then
      raise exception 'This invoice cannot be reassigned from its current status.';
    end if;
    approver_id := nullif(p_payload->>'approver_id', '')::uuid;
    if approver_id is null then raise exception 'Approver is required.'; end if;
    next_status := 'awaiting_approval';
    event_action := 'reassigned';
    event_note := nullif(btrim(p_payload->>'note'), '');
    event_details := event_details || jsonb_build_object('previous_approver_id', invoice_row.assigned_approver_id);
    update public.titan_ap_invoices set
      assigned_approver_id = approver_id, assigned_by = p_actor_id,
      assigned_at = now(), status = next_status, dispute_reason = null,
      return_reason = null, row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'update_invoice' then
    if invoice_row.status in ('approved', 'posted', 'paid', 'archived', 'voided') then
      raise exception 'Approved, archived, and voided invoices are locked.';
    end if;
    event_action := 'invoice_updated';
    event_note := nullif(btrim(p_payload->>'notes'), '');
    event_details := jsonb_build_object(
      'previous_invoice_number', invoice_row.invoice_number,
      'invoice_number', p_payload->>'invoice_number',
      'previous_total_amount', invoice_row.total_amount,
      'total_amount', (p_payload->>'total_amount')::numeric
    );
    update public.titan_ap_invoices set
      yard_id = nullif(p_payload->>'yard_id', '')::uuid,
      vendor_id = nullif(p_payload->>'vendor_id', '')::uuid,
      vendor_name = btrim(p_payload->>'vendor_name'),
      invoice_number = btrim(p_payload->>'invoice_number'),
      invoice_date = (p_payload->>'invoice_date')::date,
      due_date = nullif(p_payload->>'due_date', '')::date,
      total_amount = (p_payload->>'total_amount')::numeric,
      notes = event_note,
      duplicate_acknowledged_by = case when coalesce((p_payload->>'duplicate_acknowledged')::boolean, false) then p_actor_id else duplicate_acknowledged_by end,
      duplicate_acknowledged_at = case when coalesce((p_payload->>'duplicate_acknowledged')::boolean, false) then now() else duplicate_acknowledged_at end,
      duplicate_acknowledgment_note = case when coalesce((p_payload->>'duplicate_acknowledged')::boolean, false) then nullif(btrim(p_payload->>'duplicate_note'), '') else duplicate_acknowledgment_note end,
      row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'closeout_posted' then
    if invoice_row.status <> 'approved' then raise exception 'Only approved invoices can be posted.'; end if;
    event_note := nullif(btrim(p_payload->>'posting_reference'), '');
    if event_note is null then raise exception 'Posting reference is required.'; end if;
    next_status := 'posted'; event_action := 'posted';
    update public.titan_ap_invoices set
      status = next_status, posting_reference = event_note, posted_by = p_actor_id,
      posted_by_name = p_actor_name, posted_at = now(), row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'closeout_paid' then
    if invoice_row.status <> 'posted' then raise exception 'Only posted invoices can be paid.'; end if;
    if nullif(btrim(p_payload->>'payment_reference'), '') is null or nullif(p_payload->>'payment_date', '') is null then
      raise exception 'Payment date and reference are required.';
    end if;
    next_status := 'paid'; event_action := 'paid';
    event_note := 'Payment recorded as ' || btrim(p_payload->>'payment_reference') || '.';
    update public.titan_ap_invoices set
      status = next_status, payment_reference = btrim(p_payload->>'payment_reference'),
      payment_date = (p_payload->>'payment_date')::date, paid_by = p_actor_id,
      paid_by_name = p_actor_name, paid_at = now(), row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'closeout_archived' then
    if invoice_row.status <> 'paid' then raise exception 'Only paid invoices can be archived.'; end if;
    next_status := 'archived'; event_action := 'archived';
    event_note := coalesce(nullif(btrim(p_payload->>'archive_note'), ''), 'Paid invoice archived by AP.');
    update public.titan_ap_invoices set
      status = next_status, archive_note = nullif(btrim(p_payload->>'archive_note'), ''),
      archived_by = p_actor_id, archived_by_name = p_actor_name,
      archived_at = now(), row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'correct_closeout' then
    if invoice_row.status not in ('posted', 'paid', 'archived') then raise exception 'This invoice has no closeout details to correct.'; end if;
    correction_reason := nullif(btrim(p_payload->>'reason'), '');
    if correction_reason is null then raise exception 'A correction reason is required.'; end if;
    event_action := 'closeout_corrected'; event_note := correction_reason;
    event_details := jsonb_build_object(
      'previous_posting_reference', invoice_row.posting_reference,
      'previous_payment_reference', invoice_row.payment_reference,
      'previous_payment_date', invoice_row.payment_date,
      'posting_reference', coalesce(nullif(btrim(p_payload->>'posting_reference'), ''), invoice_row.posting_reference),
      'payment_reference', coalesce(nullif(btrim(p_payload->>'payment_reference'), ''), invoice_row.payment_reference),
      'payment_date', coalesce(nullif(p_payload->>'payment_date', '')::date, invoice_row.payment_date)
    );
    update public.titan_ap_invoices set
      posting_reference = coalesce(nullif(btrim(p_payload->>'posting_reference'), ''), posting_reference),
      payment_reference = coalesce(nullif(btrim(p_payload->>'payment_reference'), ''), payment_reference),
      payment_date = coalesce(nullif(p_payload->>'payment_date', '')::date, payment_date),
      archive_note = case when p_payload ? 'archive_note' then nullif(btrim(p_payload->>'archive_note'), '') else archive_note end,
      row_version = row_version + 1
    where id = p_invoice_id;

  elsif p_action = 'reverse_closeout' then
    correction_reason := nullif(btrim(p_payload->>'reason'), '');
    if correction_reason is null then raise exception 'A reopening reason is required.'; end if;
    next_status := case invoice_row.status when 'posted' then 'approved' when 'paid' then 'posted' when 'archived' then 'paid' else null end;
    if next_status is null then raise exception 'This invoice cannot be reopened from its current status.'; end if;
    event_action := 'closeout_reopened'; event_note := correction_reason;
    event_details := jsonb_build_object('reopened_from', invoice_row.status, 'reopened_to', next_status);
    update public.titan_ap_invoices set status = next_status, row_version = row_version + 1 where id = p_invoice_id;

  else
    raise exception 'Unsupported invoice action.';
  end if;

  insert into public.titan_ap_invoice_activity (
    invoice_id, action, actor_id, actor_name, from_status, to_status, note, details
  ) values (
    p_invoice_id, event_action, p_actor_id, p_actor_name,
    invoice_row.status, next_status, event_note, coalesce(event_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.titan_ap_register_invoice_file(uuid, text, text, integer, text, text, text, text, bigint, text, text, uuid, text) from public, authenticated;
grant execute on function public.titan_ap_register_invoice_file(uuid, text, text, integer, text, text, text, text, bigint, text, text, uuid, text) to service_role;
revoke all on function public.titan_ap_apply_invoice_action(uuid, uuid, text, text, jsonb) from public, authenticated;
grant execute on function public.titan_ap_apply_invoice_action(uuid, uuid, text, text, jsonb) to service_role;

comment on table public.titan_ap_invoice_notification_deliveries is
  'Per-recipient email and push delivery results for invoice workflow notifications.';
comment on function public.titan_ap_apply_invoice_action(uuid, uuid, text, text, jsonb) is
  'Atomically applies an invoice workflow change and its append-only activity record.';

commit;
