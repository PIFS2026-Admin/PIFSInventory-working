import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import {
  applyPermissionOverrides,
  canCreate,
  canEdit,
  canReceiveNotifications,
  canView,
  getDefaultPermissionsForRole,
  normalizeRole,
} from "./modulePermissions";

type AdminClient = SupabaseClient;
type WorkflowKind = "assigned" | "reassigned" | "resolved" | "voided" | "returned" | "disputed" | "approved" | "posted" | "paid" | "archived";
type InvoiceRow = Record<string, unknown> & {
  id: string;
  vendor_name?: string;
  invoice_number?: string;
  total_amount?: number | string;
  due_date?: string | null;
  assigned_approver_id?: string;
};
type Recipient = { id: string; name: string; email: string };
type Notice = {
  title: string;
  body: string;
  priority: "normal" | "high" | "urgent";
  category: string;
};
type DeliveryResult = { delivered: number; warnings: string[] };
type ChannelDelivery = { userId: string; status: string; error?: string };

const defaultVapidSubject = "mailto:notifications@pifstitan.com";

function missingRecipientSettings(error: { message?: string } | null | undefined) {
  const message = text(error?.message).toLowerCase();
  return (message.includes("email_notification_types") || message.includes("email_notification_recipients"))
    && (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find"));
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function displayDate(value: unknown) {
  if (!value) return "No due date";
  const date = new Date(`${text(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(value: unknown) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://pifstitan.com").replace(/\/$/, "");
}

function invoicePath(invoiceId: string) {
  return `/invoice-approvals?invoice=${encodeURIComponent(invoiceId)}`;
}

function validVapidSubject(value: string) {
  const subject = value.trim();
  return /^(mailto:|https?:\/\/)/i.test(subject) ? subject : defaultVapidSubject;
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(validVapidSubject(process.env.VAPID_SUBJECT || defaultVapidSubject), publicKey, privateKey);
  return true;
}

async function microsoftAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return "";

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(text(result.error_description || result.error || "Microsoft authentication failed."));
  return text(result.access_token);
}

function emailHtml(notice: Notice, actionUrl: string) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827"><h2 style="margin:0 0 6px">${escapeHtml(notice.title)}</h2><p style="margin:0 0 18px;color:#f97316;font-weight:700">TITAN Invoice Approval</p><p>${escapeHtml(notice.body).replaceAll("\n", "<br />")}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:6px">Open Invoice</a></p><div style="margin-top:22px;padding-top:14px;border-top:1px solid #d1d5db;color:#374151;font-size:13px"><strong>Pathfinder Inspections &amp; Field Services</strong><br />7501 Groening St.<br />Odessa, TX 79765<br />(432) 233-3600</div></div>`;
}

async function eligibleRecipients(admin: AdminClient, userIds: string[], requireAp = false) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length && !requireAp) return [];

  let profileQuery = admin.from("profiles").select("id,full_name,email,role,is_disabled").eq("is_disabled", false);
  if (ids.length) profileQuery = profileQuery.in("id", ids);
  const profilesResult = await profileQuery;
  if (profilesResult.error) throw profilesResult.error;
  const profiles = profilesResult.data || [];
  const profileIds = profiles.map((profile) => profile.id);
  if (!profileIds.length) return [];

  const [moduleResult, overrideResult] = await Promise.all([
    admin.from("user_module_permissions").select("user_id,can_access").eq("module_key", "invoice_approvals").in("user_id", profileIds),
    admin.from("user_permission_overrides").select("user_id,module_key,action_key,is_allowed").eq("module_key", "invoice_approvals").in("user_id", profileIds),
  ]);
  if (moduleResult.error) throw moduleResult.error;
  if (overrideResult.error) throw overrideResult.error;

  const moduleAccess = new Map((moduleResult.data || []).map((row) => [row.user_id, Boolean(row.can_access)]));
  const overrides = new Map<string, typeof overrideResult.data>();
  (overrideResult.data || []).forEach((row) => {
    const rows = overrides.get(row.user_id) || [];
    rows.push(row);
    overrides.set(row.user_id, rows);
  });

  const recipients = profiles.flatMap((profile): Recipient[] => {
    const role = normalizeRole(profile.role);
    const permissions = applyPermissionOverrides(getDefaultPermissionsForRole(role), overrides.get(profile.id) || []);
    const isAdmin = role === "admin" || role === "owner";
    const hasModule = isAdmin || moduleAccess.get(profile.id) === true || canView(permissions, "invoice_approvals");
    const isAp = isAdmin || (role === "office_admin" && canCreate(permissions, "invoice_approvals") && canEdit(permissions, "invoice_approvals"));
    if (!hasModule || !canReceiveNotifications(permissions, "invoice_approvals") || (requireAp && !isAp)) return [];
    return [{ id: profile.id, name: text(profile.full_name || profile.email || "TITAN user"), email: text(profile.email) }];
  });
  await Promise.all(recipients.filter((recipient) => !recipient.email.includes("@")).map(async (recipient) => {
    const authUser = await admin.auth.admin.getUserById(recipient.id);
    if (!authUser.error) recipient.email = text(authUser.data.user?.email);
  }));
  return recipients;
}

async function configuredRecipientIds(admin: AdminClient, notificationKey: string) {
  const typeResult = await admin
    .from("email_notification_types")
    .select("id")
    .eq("notification_key", notificationKey)
    .eq("is_active", true)
    .maybeSingle();
  if (typeResult.error) {
    if (missingRecipientSettings(typeResult.error)) return null;
    throw typeResult.error;
  }
  if (!typeResult.data) return null;

  const recipientResult = await admin
    .from("email_notification_recipients")
    .select("user_id")
    .eq("notification_type_id", typeResult.data.id)
    .eq("enabled", true);
  if (recipientResult.error) {
    if (missingRecipientSettings(recipientResult.error)) return null;
    throw recipientResult.error;
  }
  return (recipientResult.data || []).map((row) => text(row.user_id)).filter(Boolean);
}

async function sendEmails(recipients: Recipient[], notice: Notice, actionUrl: string) {
  const from = text(process.env.MICROSOFT_MAIL_FROM);
  const recipientsWithEmail = recipients.filter((recipient) => recipient.email.includes("@"));
  const missing = recipients.filter((recipient) => !recipient.email.includes("@")).map((recipient): ChannelDelivery => ({ userId: recipient.id, status: "missing_address", error: "No email address is saved for this user." }));
  if (!from) return { sentIds: [] as string[], deliveries: [...missing, ...recipientsWithEmail.map((recipient): ChannelDelivery => ({ userId: recipient.id, status: "not_configured", error: "Microsoft 365 invoice email is not configured." }))], warning: "Microsoft 365 invoice email is not configured." };
  if (!recipientsWithEmail.length) return { sentIds: [] as string[], deliveries: missing, warning: "One or more recipients do not have an email address." };
  let token = "";
  try {
    token = await microsoftAccessToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Microsoft authentication failed.";
    return { sentIds: [] as string[], deliveries: [...missing, ...recipientsWithEmail.map((recipient): ChannelDelivery => ({ userId: recipient.id, status: "failed", error: message }))], warning: message };
  }
  if (!token) return { sentIds: [] as string[], deliveries: [...missing, ...recipientsWithEmail.map((recipient): ChannelDelivery => ({ userId: recipient.id, status: "not_configured", error: "Microsoft 365 invoice email is not configured." }))], warning: "Microsoft 365 invoice email is not configured." };

  const results = await Promise.allSettled(recipientsWithEmail.map(async (recipient) => {
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: `TITAN: ${notice.title}`,
          body: { contentType: "HTML", content: emailHtml(notice, actionUrl) },
          toRecipients: [{ emailAddress: { address: recipient.email, name: recipient.name } }],
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) throw new Error(`Microsoft email failed with status ${response.status}.`);
    return recipient.id;
  }));
  const sentIds = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failed = results.length - sentIds.length;
  const warnings = [
    missing.length ? `${missing.length} recipient${missing.length === 1 ? " does" : "s do"} not have an email address.` : "",
    failed ? `${failed} invoice email notification${failed === 1 ? "" : "s"} could not be sent.` : "",
  ].filter(Boolean);
  const deliveries = [
    ...missing,
    ...recipientsWithEmail.map((recipient, index): ChannelDelivery => results[index].status === "fulfilled"
      ? { userId: recipient.id, status: "sent" }
      : { userId: recipient.id, status: "failed", error: (results[index] as PromiseRejectedResult).reason instanceof Error ? (results[index] as PromiseRejectedResult).reason.message : "Email delivery failed." }),
  ];
  return { sentIds, deliveries, warning: warnings.join(" ") };
}

async function sendPush(admin: AdminClient, recipients: Recipient[], notice: Notice, path: string, tag: string) {
  if (!configureWebPush()) return { sent: 0, deliveries: recipients.map((recipient): ChannelDelivery => ({ userId: recipient.id, status: "not_configured", error: "Invoice push delivery is not configured." })), warning: "Invoice push delivery is not configured." };
  const result = await admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth_secret").in("user_id", recipients.map((recipient) => recipient.id)).eq("is_active", true);
  if (result.error) throw result.error;
  const subscriptions = result.data || [];
  if (!subscriptions.length) return { sent: 0, deliveries: recipients.map((recipient): ChannelDelivery => ({ userId: recipient.id, status: "not_enabled", error: "No device has push notifications enabled." })), warning: "No recipient devices have push notifications enabled." };
  const expired: string[] = [];
  let sent = 0;
  const sentUserIds = new Set<string>();
  const errorsByUser = new Map<string, string>();
  await Promise.all(subscriptions.map(async (subscription) => {
    if (!subscription.endpoint || !subscription.p256dh || !subscription.auth_secret) return;
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } },
        JSON.stringify({ title: notice.title, body: notice.body, url: path, tag, priority: notice.priority }),
        { TTL: 60 * 60 * 24, urgency: notice.priority === "urgent" ? "high" : "normal" },
      );
      sent += 1;
      sentUserIds.add(subscription.user_id);
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) expired.push(subscription.id);
      else console.error("Invoice approval push failed", error);
      errorsByUser.set(subscription.user_id, error instanceof Error ? error.message : "Push delivery failed.");
    }
  }));
  if (expired.length) await admin.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).in("id", expired);
  const subscribedUserIds = new Set(subscriptions.map((subscription) => subscription.user_id));
  const missingRecipients = recipients.filter((recipient) => !subscribedUserIds.has(recipient.id)).length;
  const deliveries = recipients.map((recipient): ChannelDelivery => sentUserIds.has(recipient.id)
    ? { userId: recipient.id, status: "sent" }
    : !subscribedUserIds.has(recipient.id)
      ? { userId: recipient.id, status: "not_enabled", error: "No device has push notifications enabled." }
      : { userId: recipient.id, status: "failed", error: errorsByUser.get(recipient.id) || "Push delivery failed." });
  return { sent, deliveries, warning: missingRecipients ? `${missingRecipients} recipient${missingRecipients === 1 ? " does" : "s do"} not have push notifications enabled.` : "" };
}

async function deliver(admin: AdminClient, recipients: Recipient[], invoice: InvoiceRow, notice: Notice, actorId: string | null, existingKeys?: Set<string>) {
  const uniqueRecipients = Array.from(new Map(recipients.map((recipient) => [recipient.id, recipient])).values());
  if (!uniqueRecipients.length) return { delivered: 0, warnings: [] };
  const path = invoicePath(invoice.id);
  const actionUrl = `${siteUrl()}${path}`;
  const filteredRecipients = uniqueRecipients.filter((recipient) => !existingKeys?.has(`${recipient.id}|${notice.title}|${actionUrl}`));
  if (!filteredRecipients.length) return { delivered: 0, warnings: [] };

  const inserted = await admin.from("notifications").insert(filteredRecipients.map((recipient) => ({
    recipient_user_id: recipient.id,
    audience: "user",
    title: notice.title,
    body: notice.body,
    category: notice.category,
    priority: notice.priority,
    action_label: "Open Invoice",
    action_url: actionUrl,
    created_by: actorId,
  }))).select("id,recipient_user_id");
  if (inserted.error) throw inserted.error;

  const warnings: string[] = [];
  const [emailResult, pushResult] = await Promise.all([
    sendEmails(filteredRecipients, notice, actionUrl).catch((error) => ({ sentIds: [] as string[], deliveries: filteredRecipients.map((recipient): ChannelDelivery => ({ userId: recipient.id, status: "failed", error: error instanceof Error ? error.message : "Invoice email delivery failed." })), warning: error instanceof Error ? error.message : "Invoice email delivery failed." })),
    sendPush(admin, filteredRecipients, notice, path, `invoice-${notice.category}-${invoice.id}`).catch((error) => ({ sent: 0, deliveries: filteredRecipients.map((recipient): ChannelDelivery => ({ userId: recipient.id, status: "failed", error: error instanceof Error ? error.message : "Invoice push delivery failed." })), warning: error instanceof Error ? error.message : "Invoice push delivery failed." })),
  ]);
  if (emailResult.warning) warnings.push(emailResult.warning);
  if (pushResult.warning) warnings.push(pushResult.warning);
  const emailedNotificationIds = (inserted.data || []).filter((row) => emailResult.sentIds.includes(row.recipient_user_id)).map((row) => row.id);
  if (emailedNotificationIds.length) await admin.from("notifications").update({ email_sent_at: new Date().toISOString() }).in("id", emailedNotificationIds);
  const notificationByRecipient = new Map((inserted.data || []).map((row) => [row.recipient_user_id, row.id]));
  const emailByRecipient = new Map(emailResult.deliveries.map((delivery) => [delivery.userId, delivery]));
  const pushByRecipient = new Map(pushResult.deliveries.map((delivery) => [delivery.userId, delivery]));
  const auditRows = filteredRecipients.map((recipient) => {
    const email = emailByRecipient.get(recipient.id);
    const push = pushByRecipient.get(recipient.id);
    return {
      invoice_id: invoice.id,
      notification_id: notificationByRecipient.get(recipient.id) || null,
      event_category: notice.category,
      event_title: notice.title,
      recipient_user_id: recipient.id,
      recipient_name: recipient.name,
      recipient_email: recipient.email || null,
      email_status: email?.status || "failed",
      email_error: email?.error || null,
      push_status: push?.status || "failed",
      push_error: push?.error || null,
    };
  });
  const deliveryAudit = await admin.from("titan_ap_invoice_notification_deliveries").insert(auditRows);
  if (deliveryAudit.error) warnings.push("Notification recipients were contacted, but their delivery audit could not be saved.");
  filteredRecipients.forEach((recipient) => existingKeys?.add(`${recipient.id}|${notice.title}|${actionUrl}`));
  return { delivered: filteredRecipients.length, warnings: Array.from(new Set(warnings)) };
}

function workflowNotice(kind: WorkflowKind, invoice: InvoiceRow, actorName: string, reason = ""): Notice {
  const vendor = text(invoice.vendor_name) || "Vendor";
  const number = text(invoice.invoice_number) || "invoice";
  const amount = money(invoice.total_amount);
  const due = displayDate(invoice.due_date);
  if (kind === "assigned" || kind === "reassigned") return {
    title: kind === "assigned" ? `Invoice awaiting your approval: ${vendor}` : `Invoice reassigned to you: ${vendor}`,
    body: `${vendor} invoice ${number} for ${amount} was ${kind === "assigned" ? "assigned" : "reassigned"} to you by ${actorName}. Due: ${due}.`,
    priority: "high",
    category: "invoice_assignment",
  };
  if (kind === "resolved") return {
    title: `Invoice dispute resolved: ${vendor} ${number}`,
    body: `${actorName} resolved the dispute for ${vendor} invoice ${number} for ${amount}. Resolution: ${reason}`,
    priority: "high",
    category: "invoice_resolved",
  };
  if (kind === "voided") return {
    title: `Invoice voided: ${vendor} ${number}`,
    body: `${actorName} voided ${vendor} invoice ${number} for ${amount}. Reason: ${reason}`,
    priority: "normal",
    category: "invoice_voided",
  };
  if (kind === "approved") return {
    title: `Invoice approved: ${vendor} ${number}`,
    body: `${actorName} approved and electronically signed ${vendor} invoice ${number} for ${amount}.`,
    priority: "normal",
    category: "invoice_approved",
  };
  if (kind === "posted" || kind === "paid" || kind === "archived") return {
    title: `Invoice ${kind}: ${vendor} ${number}`,
    body: `${actorName} marked ${vendor} invoice ${number} for ${amount} as ${kind}.`,
    priority: "normal",
    category: "invoice_closeout",
  };
  return {
    title: `${kind === "disputed" ? "Invoice disputed" : "Invoice returned to AP"}: ${vendor} ${number}`,
    body: `${actorName} ${kind === "disputed" ? "disputed" : "returned"} ${vendor} invoice ${number} for ${amount}. Reason: ${reason}`,
    priority: kind === "disputed" ? "urgent" : "high",
    category: kind === "disputed" ? "invoice_disputed" : "invoice_returned",
  };
}

export async function notifyInvoiceWorkflow(options: {
  admin: AdminClient;
  invoice: InvoiceRow;
  kind: WorkflowKind;
  actorId: string;
  actorName: string;
  reason?: string;
}): Promise<DeliveryResult> {
  const { admin, invoice, kind, actorId, actorName, reason } = options;
  const notice = workflowNotice(kind, invoice, actorName, reason);
  const selectedIds = await configuredRecipientIds(admin, notice.category);
  const isDirectApproverNotice = kind === "assigned" || kind === "reassigned" || kind === "resolved" || kind === "voided";
  let recipients: Recipient[];

  if (selectedIds === null) {
    recipients = kind === "posted" || kind === "paid" || kind === "archived"
      ? []
      : isDirectApproverNotice
      ? await eligibleRecipients(admin, [text(invoice.assigned_approver_id)])
      : (await eligibleRecipients(admin, [], true)).filter((recipient) => recipient.id !== actorId);
  } else if (isDirectApproverNotice) {
    const approverId = text(invoice.assigned_approver_id);
    recipients = selectedIds.includes(approverId) ? await eligibleRecipients(admin, [approverId]) : [];
  } else {
    recipients = (await eligibleRecipients(admin, selectedIds)).filter((recipient) => recipient.id !== actorId);
  }

  return deliver(admin, recipients, invoice, notice, actorId);
}

function centralDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayDifference(dateValue: unknown, todayKey: string) {
  const due = Date.parse(`${text(dateValue).slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  return Number.isFinite(due) ? Math.round((due - today) / 86_400_000) : Number.NaN;
}

function reminderNotice(invoice: InvoiceRow, daysUntilDue: number): Notice {
  const vendor = text(invoice.vendor_name) || "Vendor";
  const number = text(invoice.invoice_number) || "invoice";
  const due = displayDate(invoice.due_date);
  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return { title: `Invoice overdue by ${days} day${days === 1 ? "" : "s"}: ${vendor} ${number}`, body: `${vendor} invoice ${number} for ${money(invoice.total_amount)} was due ${due} and still requires action.`, priority: "urgent", category: "invoice_due" };
  }
  if (daysUntilDue === 0) return { title: `Invoice due today: ${vendor} ${number}`, body: `${vendor} invoice ${number} for ${money(invoice.total_amount)} is due today and still requires action.`, priority: "urgent", category: "invoice_due" };
  return { title: `Invoice due soon (${due}): ${vendor} ${number}`, body: `${vendor} invoice ${number} for ${money(invoice.total_amount)} is due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"} and still requires action.`, priority: "high", category: "invoice_due" };
}

export async function sendInvoiceDueReminders(admin: AdminClient) {
  const today = centralDateKey();
  const invoiceResult = await admin.from("titan_ap_invoices").select("id,vendor_name,invoice_number,total_amount,due_date,status,assigned_approver_id").in("status", ["awaiting_approval", "returned_to_ap", "disputed"]).not("due_date", "is", null);
  if (invoiceResult.error) throw invoiceResult.error;
  const invoices = (invoiceResult.data || []) as InvoiceRow[];
  const actionable = invoices.map((invoice) => ({ invoice, days: dayDifference(invoice.due_date, today) })).filter(({ days }) => Number.isFinite(days) && days <= 3);
  if (!actionable.length) return { invoices: 0, notifications: 0, warnings: [] as string[] };

  const existingResult = await admin.from("notifications").select("recipient_user_id,title,action_url").eq("category", "invoice_due").gte("created_at", new Date(Date.now() - 120 * 86_400_000).toISOString());
  if (existingResult.error) throw existingResult.error;
  const existingKeys = new Set((existingResult.data || []).map((row) => `${row.recipient_user_id}|${row.title}|${row.action_url}`));
  const selectedIds = await configuredRecipientIds(admin, "invoice_due");
  const apRecipients = selectedIds === null
    ? await eligibleRecipients(admin, [], true)
    : await eligibleRecipients(admin, selectedIds);
  let notifications = 0;
  const warnings: string[] = [];

  for (const { invoice, days } of actionable) {
    const status = text(invoice.status);
    const approverId = text(invoice.assigned_approver_id);
    const recipients = status === "awaiting_approval"
      ? selectedIds === null || selectedIds.includes(approverId)
        ? await eligibleRecipients(admin, [approverId])
        : []
      : apRecipients;
    const result = await deliver(admin, recipients, invoice, reminderNotice(invoice, days), null, existingKeys);
    notifications += result.delivered;
    warnings.push(...result.warnings);
  }
  return { invoices: actionable.length, notifications, warnings: Array.from(new Set(warnings)) };
}
