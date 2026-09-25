begin;

do $$
begin
  if to_regclass('public.email_notification_types') is null
    or to_regclass('public.email_notification_recipients') is null then
    raise exception 'Run supabase/admin_security_and_notifications.sql first.';
  end if;
end $$;

insert into public.email_notification_types (
  notification_key,
  name,
  description,
  sort_order,
  is_active
)
values
  ('invoice_approved', 'Invoice Approved', 'Selected recipients are notified after an invoice is approved and electronically signed.', 210, true),
  ('invoice_returned', 'Invoice Returned to AP', 'Selected recipients are notified when an approver returns an invoice to Accounts Payable.', 220, true),
  ('invoice_disputed', 'Invoice Disputed', 'Selected recipients are notified when an approver disputes an invoice.', 230, true),
  ('invoice_resolved', 'Invoice Dispute Resolved', 'The assigned approver is notified after AP resolves a dispute. Only the selected approver receives the notice.', 240, true),
  ('invoice_voided', 'Invoice Voided', 'The assigned approver is notified when AP voids an invoice. Only the selected approver receives the notice.', 250, true),
  ('invoice_due', 'Invoice Due Reminder', 'Selected recipients receive reminders for invoices due within three days or overdue.', 260, true),
  ('invoice_closeout', 'Invoice AP Closeout', 'Selected recipients are notified when AP marks an approved invoice posted, paid, or archived.', 270, true)
on conflict (notification_key) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

delete from public.email_notification_types
where notification_key = 'invoice_assignment';

commit;
