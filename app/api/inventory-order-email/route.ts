import { createClient } from "@supabase/supabase-js";
import {
  listNotificationRecipientsWithFallback,
  splitEmails,
} from "../../../lib/adminEmailRecipients";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedRoles = [
  "admin",
  "inventory_specialist",
  "inventory_manager",
  "service_line_manager",
  "dti_superintendent",
  "dti_lead",
  "level_2_inspector",
  "hardband_lead",
  "cdt_lead",
  "employee",
];

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
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Supabase server email route is not configured.");
  }

  return {
    publicClient: createClient(supabaseUrl, anonKey),
    adminClient: createClient(supabaseUrl, serviceRoleKey),
  };
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

async function sendMicrosoftEmail(options: { to: string; subject: string; html: string }) {
  const from = process.env.MICROSOFT_MAIL_FROM;
  if (!from) {
    throw new Error("MICROSOFT_MAIL_FROM is missing.");
  }

  const accessToken = await getMicrosoftAccessToken();
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
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(getErrorMessage(result) || `Microsoft email failed with status ${response.status}.`);
  }
}

export async function POST(request: Request) {
  try {
    const { publicClient, adminClient } = configuredSupabase();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return Response.json({ error: "You must be signed in to email consumable orders." }, { status: 401 });
    }

    const { data: userData, error: userError } = await publicClient.auth.getUser(token);
    if (userError || !userData.user) {
      return Response.json({ error: "Your login session could not be verified." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile) {
      return Response.json({ error: "Your user profile could not be loaded." }, { status: 403 });
    }

    if (!allowedRoles.includes(String(profile.role))) {
      return Response.json({ error: "You do not have permission to email consumable orders." }, { status: 403 });
    }

    const body = await request.json();
    const orderId = String(body.orderId ?? "").trim();
    const manualRecipient = String(body.recipientEmail ?? "").trim();

    if (!orderId) {
      return Response.json({ error: "Order ID is required." }, { status: 400 });
    }

    const configuredRecipients = await listNotificationRecipientsWithFallback(
      adminClient,
      "consumable_order_placed",
      ["admin", "administrator", "inventory_manager", "inventory_specialist"],
      [process.env.INVENTORY_ORDER_EMAIL_TO, process.env.INVENTORY_EMAIL_TO],
    );

    const recipients = Array.from(new Set([
      ...configuredRecipients,
      ...(manualRecipient ? splitEmails(manualRecipient) : []),
    ]));

    if (recipients.length === 0) {
      return Response.json({ error: "No inventory order email recipients are configured." }, { status: 400 });
    }

    const { data: order, error: orderError } = await adminClient
      .from("inventory_orders")
      .select("id, order_number, order_date, requested_by, department, unit_truck, job_number, status, notes, total_value")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return Response.json({ error: orderError?.message ?? "Consumable order not found." }, { status: 404 });
    }

    const { data: lines, error: linesError } = await adminClient
      .from("inventory_order_lines")
      .select("item_code, item_name, qty_requested, qty_fulfilled, unit_cost, line_value")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    if (linesError) {
      return Response.json({ error: linesError.message }, { status: 500 });
    }

    const totalQty = (lines || []).reduce((sum, line: any) => sum + Number(line.qty_requested || 0), 0);
    const rows = (lines || [])
      .map(
        (line: any) => `
          <tr>
            <td>${escapeHtml(line.item_code || "-")}</td>
            <td>${escapeHtml(line.item_name || "-")}</td>
            <td>${Number(line.qty_requested || 0).toLocaleString()}</td>
            <td>${Number(line.qty_fulfilled || 0).toLocaleString()}</td>
            <td>${money(line.unit_cost)}</td>
            <td>${money(line.line_value)}</td>
          </tr>
        `,
      )
      .join("");

    const siteUrl = getSiteUrl();
    const subject = `TITAN Consumable Order - ${order.order_number}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 6px">TITAN Consumable Order</h2>
        <p style="margin:0 0 18px;color:#f97316;font-weight:700">Powering smarter pipe management</p>
        <p>
          <strong>Order:</strong> ${escapeHtml(order.order_number)}<br />
          <strong>Date:</strong> ${escapeHtml(order.order_date || "-")}<br />
          <strong>Requested By:</strong> ${escapeHtml(order.requested_by || "-")}<br />
          <strong>Department:</strong> ${escapeHtml(order.department || "-")}<br />
          <strong>Unit / Truck:</strong> ${escapeHtml(order.unit_truck || "-")}<br />
          <strong>Job Number:</strong> ${escapeHtml(order.job_number || "-")}<br />
          <strong>Status:</strong> ${escapeHtml(order.status || "Submitted")}<br />
          <strong>Total Qty:</strong> ${totalQty.toLocaleString()}<br />
          <strong>Estimated Value:</strong> ${money(order.total_value)}
        </p>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <thead>
            <tr>
              <th style="background:#111827;color:white;text-align:left;padding:8px">Item ID</th>
              <th style="background:#111827;color:white;text-align:left;padding:8px">Item Name</th>
              <th style="background:#111827;color:white;text-align:left;padding:8px">Requested</th>
              <th style="background:#111827;color:white;text-align:left;padding:8px">Fulfilled</th>
              <th style="background:#111827;color:white;text-align:left;padding:8px">Unit Cost</th>
              <th style="background:#111827;color:white;text-align:left;padding:8px">Value</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6" style="border:1px solid #d1d5db;padding:8px">No line items found.</td></tr>`}</tbody>
        </table>
        <p><strong>Notes:</strong><br />${escapeHtml(order.notes || "No notes.").replace(/\n/g, "<br />")}</p>
        <p style="font-size:12px;color:#6b7280">TITAN Inventory: <a href="${siteUrl}/inventory">${siteUrl}/inventory</a></p>
        <div style="margin-top:22px;padding-top:14px;border-top:1px solid #d1d5db;color:#374151;font-size:13px">
          <strong>Pathfinder Inspections &amp; Field Services</strong><br />
          7501 Groening St.<br />
          Odessa, TX 79765<br />
          (432) 233-3600<br />
          <a href="https://pifstitan.com">pifstitan.com</a>
        </div>
      </div>
    `;

    for (const recipient of recipients) {
      await sendMicrosoftEmail({ to: recipient, subject, html });
    }

    return Response.json({ ok: true, emailed: true, recipients });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
