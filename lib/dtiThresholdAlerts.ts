import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateDtiThresholdMetrics,
  DTI_ALERT_THRESHOLD_PERCENT,
  type DtiInspectionItemLike,
  type DtiThresholdMetrics,
} from "./dtiInspectionReport";

type AdminClient = SupabaseClient;
type ReportRow = Record<string, unknown>;
type AlertKind = "dbr" | "repairs";
type Recipient = { id: string; email: string; name: string };
type AlertState = { alert_type: AlertKind; is_active: boolean };

const notificationKey = "dti_inspection_threshold_alert";
const fallbackRoles = new Set(["admin", "administrator", "dti_superintendent"]);
const defaultVapidSubject = "mailto:notifications@pifstitan.com";

function text(value: unknown) {
  return String(value ?? "").trim();
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

async function microsoftAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error("Microsoft 365 email is not configured.");

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
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(text(result.error_description || result.error || "Microsoft authentication failed."));
  return text(result.access_token);
}

async function sendEmail(recipient: Recipient, subject: string, title: string, body: string, actionUrl: string) {
  const from = process.env.MICROSOFT_MAIL_FROM;
  if (!from) throw new Error("MICROSOFT_MAIL_FROM is missing.");
  const token = await microsoftAccessToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827"><h2 style="margin:0 0 6px">${escapeHtml(title)}</h2><p style="margin:0 0 18px;color:#f97316;font-weight:700">TITAN DTI Alert</p><p>${escapeHtml(body).replaceAll("\n", "<br />")}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:6px">Open Inspection Report</a></p><div style="margin-top:22px;padding-top:14px;border-top:1px solid #d1d5db;color:#374151;font-size:13px"><strong>Pathfinder Inspections &amp; Field Services</strong><br />7501 Groening St.<br />Odessa, TX 79765<br />(432) 233-3600</div></div>`,
        },
        toRecipients: [{ emailAddress: { address: recipient.email, name: recipient.name } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(text(result.error?.message || `Microsoft email failed with status ${response.status}.`));
  }
}

async function authEmails(admin: AdminClient, userIds: string[]) {
  const emails = new Map<string, string>();
  if (!userIds.length) return emails;
  const wanted = new Set(userIds);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users ?? []) if (wanted.has(user.id) && user.email) emails.set(user.id, user.email);
    if (emails.size === wanted.size || (data.users ?? []).length < 1000) break;
  }
  return emails;
}

async function recipients(admin: AdminClient): Promise<Recipient[]> {
  let userIds: string[] = [];
  const typeResult = await admin.from("email_notification_types").select("id").eq("notification_key", notificationKey).eq("is_active", true).maybeSingle();
  if (!typeResult.error && typeResult.data?.id) {
    const configured = await admin.from("email_notification_recipients").select("user_id").eq("notification_type_id", typeResult.data.id).eq("enabled", true);
    if (!configured.error) userIds = (configured.data ?? []).map((row: { user_id: string }) => row.user_id).filter(Boolean);
  }

  const profilesResult = userIds.length
    ? await admin.from("profiles").select("id,full_name,role").in("id", userIds)
    : await admin.from("profiles").select("id,full_name,role");
  if (profilesResult.error) throw profilesResult.error;
  const profiles = (profilesResult.data ?? []).filter((profile: { id: string; role?: string }) =>
    userIds.length ? userIds.includes(profile.id) : fallbackRoles.has(text(profile.role).toLowerCase()),
  );
  const emailById = await authEmails(admin, profiles.map((profile: { id: string }) => profile.id));
  return profiles
    .map((profile: { id: string; full_name?: string }) => ({
      id: profile.id,
      email: emailById.get(profile.id) ?? "",
      name: text(profile.full_name) || "TITAN user",
    }))
    .filter((recipient: Recipient) => recipient.email.includes("@"));
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  if (!publicKey || !privateKey) return false;
  const configuredSubject = text(process.env.VAPID_SUBJECT);
  const subject = /^(mailto:|https?:\/\/)/i.test(configuredSubject) ? configuredSubject : defaultVapidSubject;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendPush(admin: AdminClient, recipientIds: string[], title: string, body: string, path: string, tag: string) {
  if (!configureWebPush() || !recipientIds.length) return;
  const result = await admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth_secret").in("user_id", recipientIds).eq("is_active", true);
  if (result.error) throw result.error;
  const expired: string[] = [];
  await Promise.all((result.data ?? []).map(async (subscription: Record<string, string>) => {
    if (!subscription.endpoint || !subscription.p256dh || !subscription.auth_secret) return;
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } },
        JSON.stringify({ title, body, url: path, tag, priority: "urgent" }),
        { TTL: 60 * 60 * 24, urgency: "high" },
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) expired.push(subscription.id);
      else console.error("DTI threshold push failed", error);
    }
  }));
  if (expired.length) await admin.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).in("id", expired);
}

function alertContent(kind: AlertKind, report: ReportRow, metrics: DtiThresholdMetrics) {
  const reportNumber = text(report.report_number) || "DTI inspection report";
  const operator = text(report.operator_name) || "Unknown operator";
  if (kind === "dbr") {
    return {
      title: `DTI DBR threshold reached: ${reportNumber}`,
      body: `${metrics.dbrJoints} of ${metrics.totalJoints} joints are marked DBR (${metrics.dbrPercent.toFixed(1)}%). The alert threshold is ${DTI_ALERT_THRESHOLD_PERCENT}%.\nOperator: ${operator}`,
    };
  }
  return {
    title: `DTI repair threshold reached: ${reportNumber}`,
    body: `${metrics.totalRepairs} qualifying repairs across ${metrics.totalJoints} joints (${metrics.repairPercent.toFixed(1)}%): ${metrics.boxRepairs} box and ${metrics.pinRepairs} pin. Refaces and hardbanding are excluded.\nOperator: ${operator}`,
  };
}

async function deliver(admin: AdminClient, report: ReportRow, metrics: DtiThresholdMetrics, kind: AlertKind, actorId: string) {
  const targets = await recipients(admin);
  if (!targets.length) throw new Error("No DTI threshold alert recipients are configured.");
  const content = alertContent(kind, report, metrics);
  const path = `/dti/inspection-reports/${encodeURIComponent(text(report.id))}`;
  const actionUrl = `${siteUrl()}${path}`;
  const notificationRows = targets.map((target) => ({
    recipient_user_id: target.id,
    audience: "user",
    title: content.title,
    body: content.body,
    category: "dti_threshold",
    priority: "urgent",
    action_label: "Open Inspection Report",
    action_url: actionUrl,
    created_by: actorId,
  }));
  const notificationResult = await admin.from("notifications").insert(notificationRows).select("id,recipient_user_id");
  if (notificationResult.error) throw notificationResult.error;

  const emailResults = await Promise.allSettled(targets.map((target) => sendEmail(target, `TITAN: ${content.title}`, content.title, content.body, actionUrl)));
  const sentRecipientIds = targets.filter((_, index) => emailResults[index].status === "fulfilled").map((target) => target.id);
  const sentNotificationIds = (notificationResult.data ?? []).filter((row: { id: string; recipient_user_id: string }) => sentRecipientIds.includes(row.recipient_user_id)).map((row: { id: string }) => row.id);
  if (sentNotificationIds.length) await admin.from("notifications").update({ email_sent_at: new Date().toISOString() }).in("id", sentNotificationIds);
  const failedEmails = emailResults.filter((result) => result.status === "rejected");
  if (failedEmails.length) console.error(`DTI threshold email failed for ${failedEmails.length} recipient(s).`, failedEmails);
  await sendPush(admin, targets.map((target) => target.id), content.title, content.body, path, `dti-${kind}-${text(report.id)}`);
}

export async function evaluateDtiThresholdAlerts(options: {
  admin: AdminClient;
  report: ReportRow;
  items: Array<Record<string, unknown>>;
  actorId: string;
}) {
  const { admin, report, items, actorId } = options;
  const metrics = calculateDtiThresholdMetrics(items as unknown as DtiInspectionItemLike[], items.length);
  const stateResult = await admin.from("titan_dti_inspection_threshold_states").select("alert_type,is_active").eq("report_id", report.id);
  if (stateResult.error) throw stateResult.error;
  const states = new Map<AlertKind, AlertState>((stateResult.data ?? []).map((state: AlertState) => [state.alert_type, state]));

  for (const kind of ["dbr", "repairs"] as const) {
    const active = kind === "dbr" ? metrics.dbrAlert : metrics.repairAlert;
    const count = kind === "dbr" ? metrics.dbrJoints : metrics.totalRepairs;
    const priorActive = states.get(kind)?.is_active === true;
    if (active && !priorActive) await deliver(admin, report, metrics, kind, actorId);
    if (active !== priorActive || active) {
      const stateUpdate = await admin.from("titan_dti_inspection_threshold_states").upsert({
        report_id: report.id,
        alert_type: kind,
        is_active: active,
        current_count: count,
        total_joint_count: metrics.totalJoints,
        last_alerted_at: active && !priorActive ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      }, { onConflict: "report_id,alert_type" });
      if (stateUpdate.error) throw stateUpdate.error;
    }
  }
  return metrics;
}
