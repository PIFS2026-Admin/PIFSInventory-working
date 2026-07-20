import { createClient } from "@supabase/supabase-js";
import { listNotificationRecipientsWithFallback } from "../../../lib/adminEmailRecipients";
import {
  createTitanPdfAttachment,
  safePdfFilename,
  toMicrosoftGraphAttachments,
  type TitanEmailAttachment,
} from "../../../lib/titanEmailPdf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type IssueTicket = {
  id: string;
  ticket_number: string | null;
  issue_date: string | null;
  issued_to: string | null;
  department: string | null;
  picked_by: string | null;
  unit_truck: string | null;
  job_number: string | null;
  total_value: number | string | null;
  status: string | null;
};

type IssueLine = {
  id: string;
  issue_ticket_id: string | null;
  ticket_number: string | null;
  item_code: string | null;
  item_name: string | null;
  qty_issued: number | string | null;
  line_value: number | string | null;
  unit_truck: string | null;
};

type Recipient = {
  email: string;
  fullName: string;
  role: string;
};

const weeklyInventoryNotificationKey = "inventory_weekly_report";

function getErrorMessage(error: any) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error_description === "string" && error.error_description.trim()) return error.error_description;
  if (typeof error.error === "string" && error.error.trim()) return error.error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function configuredSupabase() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://pifstitan.com"
  ).replace(/\/$/, "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value: unknown) {
  const number = Number(value || 0);
  return number.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function startOfCurrentUtcWeek() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function topBy<T extends { label: string; quantity: number; value: number }>(rows: T[], limit = 10) {
  return rows
    .sort((a, b) => b.quantity - a.quantity || b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

async function getMicrosoftAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft 365 email is not configured.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(getErrorMessage(result));
  }

  return String(result.access_token);
}

async function sendMicrosoftEmail(options: {
  to: string;
  subject: string;
  html: string;
  attachments?: TitanEmailAttachment[];
}) {
  const from = process.env.MICROSOFT_MAIL_FROM;
  if (!from) {
    throw new Error("MICROSOFT_MAIL_FROM is missing.");
  }

  const accessToken = await getMicrosoftAccessToken();
  const graphAttachments = toMicrosoftGraphAttachments(options.attachments);
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: options.subject,
        body: {
          contentType: "HTML",
          content: options.html,
        },
        toRecipients: [{ emailAddress: { address: options.to } }],
        ...(graphAttachments ? { attachments: graphAttachments } : {}),
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(getErrorMessage(result) || `Microsoft email failed with status ${response.status}.`);
  }
}

function makeRows<T extends { label: string; quantity: number; value: number }>(rows: T[]) {
  if (!rows.length) {
    return `<tr><td colspan="3" style="border:1px solid #d1d5db;padding:8px">No issue activity found.</td></tr>`;
  }

  return rows
    .map(
      (row) => `
        <tr>
          <td style="border:1px solid #d1d5db;padding:8px">${escapeHtml(row.label)}</td>
          <td style="border:1px solid #d1d5db;padding:8px">${row.quantity.toLocaleString()}</td>
          <td style="border:1px solid #d1d5db;padding:8px">${money(row.value)}</td>
        </tr>
      `,
    )
    .join("");
}

async function buildWeeklyReport() {
  const adminClient = configuredSupabase();
  const weekStart = startOfCurrentUtcWeek();
  const since = formatDate(weekStart);
  const siteUrl = getSiteUrl();

  const recipientEmails = await listNotificationRecipientsWithFallback(
    adminClient,
    weeklyInventoryNotificationKey,
    ["admin", "administrator", "inventory_manager"],
    [process.env.INVENTORY_WEEKLY_EMAIL_TO],
  );

  const recipients: Recipient[] = recipientEmails.map((email) => ({
    email,
    fullName: email,
    role: "weekly_inventory_report",
  }));

  const { data: tickets, error: ticketError } = await adminClient
    .from("inventory_issue_tickets")
    .select("id, ticket_number, issue_date, issued_to, department, picked_by, unit_truck, job_number, total_value, status")
    .gte("issue_date", since)
    .order("issue_date", { ascending: false });

  if (ticketError) {
    throw new Error(ticketError.message);
  }

  const ticketRows = (tickets || []) as IssueTicket[];
  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const ticketNumbers = ticketRows.map((ticket) => ticket.ticket_number).filter((ticketNumber): ticketNumber is string => Boolean(ticketNumber));
  let lines: IssueLine[] = [];

  if (ticketIds.length || ticketNumbers.length) {
    const lineMap = new Map<string, IssueLine>();

    const { data: lineData, error: lineError } = await adminClient
      .from("inventory_issue_ticket_lines")
      .select("id, issue_ticket_id, ticket_number, item_code, item_name, qty_issued, line_value, unit_truck")
      .in("issue_ticket_id", ticketIds);

    if (lineError) {
      throw new Error(lineError.message);
    }

    ((lineData || []) as IssueLine[]).forEach((line) => lineMap.set(line.id, line));

    if (ticketNumbers.length) {
      const { data: lineNumberData, error: lineNumberError } = await adminClient
        .from("inventory_issue_ticket_lines")
        .select("id, issue_ticket_id, ticket_number, item_code, item_name, qty_issued, line_value, unit_truck")
        .in("ticket_number", ticketNumbers);

      if (lineNumberError) {
        throw new Error(lineNumberError.message);
      }

      ((lineNumberData || []) as IssueLine[]).forEach((line) => lineMap.set(line.id, line));
    }

    lines = Array.from(lineMap.values());
  }

  const ticketById = new Map(ticketRows.map((ticket) => [ticket.id, ticket]));
  const ticketByNumber = new Map(ticketRows.map((ticket) => [ticket.ticket_number, ticket]));
  const weeklySpending = ticketRows.reduce((sum, ticket) => sum + Number(ticket.total_value || 0), 0);

  const itemTotals = new Map<string, { label: string; quantity: number; value: number }>();
  const unitTotals = new Map<string, { label: string; quantity: number; value: number }>();

  lines.forEach((line) => {
    const quantity = Number(line.qty_issued || 0);
    const value = Number(line.line_value || 0);
    const itemLabel = `${line.item_code || "-"} - ${line.item_name || "Unnamed item"}`;
    const item = itemTotals.get(itemLabel) || { label: itemLabel, quantity: 0, value: 0 };
    item.quantity += quantity;
    item.value += value;
    itemTotals.set(itemLabel, item);

    const ticket = line.issue_ticket_id ? ticketById.get(line.issue_ticket_id) : line.ticket_number ? ticketByNumber.get(line.ticket_number) : null;
    const unitLabel = line.unit_truck || ticket?.unit_truck || "No unit / truck listed";
    const unit = unitTotals.get(unitLabel) || { label: unitLabel, quantity: 0, value: 0 };
    unit.quantity += quantity;
    unit.value += value;
    unitTotals.set(unitLabel, unit);
  });

  const topItems = topBy(Array.from(itemTotals.values()));
  const topUnits = topBy(Array.from(unitTotals.values()));
  const subject = `TITAN Weekly Inventory Report - ${since}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 6px">TITAN Weekly Inventory Report</h2>
      <p style="margin:0 0 18px;color:#f97316;font-weight:700">Powering smarter pipe management</p>
      <p>The weekly inventory report is attached as a PDF.</p>
      <p>
        <strong>Week Starting:</strong> ${escapeHtml(since)}<br />
        <strong>Issue Tickets:</strong> ${ticketRows.length.toLocaleString()}<br />
        <strong>Weekly Spending:</strong> ${money(weeklySpending)}
      </p>
      <h3>Top 10 Items Issued</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr>
            <th style="background:#111827;color:white;text-align:left;padding:8px">Item</th>
            <th style="background:#111827;color:white;text-align:left;padding:8px">Qty</th>
            <th style="background:#111827;color:white;text-align:left;padding:8px">Value</th>
          </tr>
        </thead>
        <tbody>${makeRows(topItems)}</tbody>
      </table>
      <h3>Top 10 Units / Trucks</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr>
            <th style="background:#111827;color:white;text-align:left;padding:8px">Unit / Truck</th>
            <th style="background:#111827;color:white;text-align:left;padding:8px">Qty</th>
            <th style="background:#111827;color:white;text-align:left;padding:8px">Value</th>
          </tr>
        </thead>
        <tbody>${makeRows(topUnits)}</tbody>
      </table>
      <p style="font-size:12px;color:#6b7280">The PDF is attached so no TITAN login is required. Internal inventory link:<br /><a href="${siteUrl}/inventory">${siteUrl}/inventory</a></p>
      <div style="margin-top:22px;padding-top:14px;border-top:1px solid #d1d5db;color:#374151;font-size:13px">
        <strong>Pathfinder Inspections &amp; Field Services</strong><br />
        7501 Groening St.<br />
        Odessa, TX 79765<br />
        (432) 233-3600<br />
        <a href="https://pifstitan.com">pifstitan.com</a>
      </div>
    </div>
  `;

  const attachment = createTitanPdfAttachment({
    filename: `${safePdfFilename(`Weekly-Inventory-Report-${since}`)}.pdf`,
    title: "Weekly Inventory Report",
    subtitle: `Week Starting ${since}`,
    fields: [
      { label: "Week Starting", value: since },
      { label: "Issue Tickets", value: ticketRows.length.toLocaleString() },
      { label: "Weekly Spending", value: money(weeklySpending) },
    ],
    tables: [
      {
        title: "Top 10 Items Issued",
        headers: ["Item", "Qty", "Value"],
        rows: topItems.map((item) => [item.label, item.quantity.toLocaleString(), money(item.value)]),
      },
      {
        title: "Top 10 Units / Trucks",
        headers: ["Unit / Truck", "Qty", "Value"],
        rows: topUnits.map((unit) => [unit.label, unit.quantity.toLocaleString(), money(unit.value)]),
      },
    ],
  });

  return { subject, html, recipients, ticketCount: ticketRows.length, weeklySpending, attachment };
}

function isAuthorizedCron(request: Request) {
  const configuredSecret = process.env.INVENTORY_WEEKLY_EMAIL_SECRET ?? process.env.CRON_SECRET ?? "";
  if (!configuredSecret) return true;

  const url = new URL(request.url);
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.replace(/^Bearer\s+/i, "").trim();
  const provided =
    bearer ||
    request.headers.get("x-cron-secret") ||
    url.searchParams.get("secret") ||
    "";

  return provided === configuredSecret;
}

async function handleWeeklyEmail(request: Request) {
  try {
    if (!isAuthorizedCron(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const report = await buildWeeklyReport();

    for (const recipient of report.recipients) {
      await sendMicrosoftEmail({
        to: recipient.email,
        subject: report.subject,
        html: report.html,
        attachments: [report.attachment],
      });
    }

    return Response.json({
      ok: true,
      emailed: report.recipients.length,
      ticketCount: report.ticketCount,
      weeklySpending: report.weeklySpending,
    });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleWeeklyEmail(request);
}

export async function POST(request: Request) {
  return handleWeeklyEmail(request);
}
