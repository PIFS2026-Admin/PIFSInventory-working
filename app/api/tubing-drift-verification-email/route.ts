import { createClient } from "@supabase/supabase-js";
import {
  createTubingDriftVerificationPdfAttachment,
  safePdfFilename,
  toMicrosoftGraphAttachments,
} from "../../../lib/titanEmailPdf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function errorMessage(error: any) {
  if (typeof error?.message === "string") return error.message;
  if (typeof error?.error_description === "string") return error.error_description;
  if (typeof error?.error === "string") return error.error;
  return typeof error === "string" ? error : "Unknown error.";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  if (!response.ok || !result.access_token) throw new Error(errorMessage(result));
  return String(result.access_token);
}

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase server email route is not configured.");
    const publicClient = createClient(supabaseUrl, anonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return Response.json({ error: "You must be signed in to email drift verifications." }, { status: 401 });

    const { data: userData, error: userError } = await publicClient.auth.getUser(token);
    if (userError || !userData.user) return Response.json({ error: "Your login session could not be verified." }, { status: 401 });

    const { data: profile } = await adminClient.from("profiles").select("role").eq("id", userData.user.id).single();
    const role = String(profile?.role ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!["admin", "employee", "service_line_manager", "tubing_lead", "tubing_hand"].includes(role)) {
      return Response.json({ error: "You do not have permission to email Tubing drift verifications." }, { status: 403 });
    }

    const body = await request.json();
    const verificationId = String(body.verificationId ?? "").trim();
    const recipientEmail = String(body.recipientEmail ?? "").trim();
    const note = String(body.note ?? "").trim();
    if (!verificationId || !recipientEmail.includes("@")) {
      return Response.json({ error: "A drift verification and valid recipient email are required." }, { status: 400 });
    }

    const { data: verification, error } = await adminClient.from("tubing_drift_verifications").select("*").eq("id", verificationId).single();
    if (error || !verification) return Response.json({ error: error?.message ?? "Drift verification not found." }, { status: 404 });

    const attachment = createTubingDriftVerificationPdfAttachment({
      filename: `${safePdfFilename(`Tubing-Drift-Verification-${verification.verification_number || verification.id}`)}.pdf`,
      verification,
    });
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://pifstitan.com").replace(/\/$/, "");
    const reportUrl = `${siteUrl}/tubing-drift-verification/print?id=${encodeURIComponent(verification.id)}`;
    const accessToken = await microsoftAccessToken();
    const from = process.env.MICROSOFT_MAIL_FROM;
    if (!from) throw new Error("MICROSOFT_MAIL_FROM is missing.");

    const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 6px">TITAN Tubing Drift Verification</h2>
      <p style="margin:0 0 18px;color:#f97316;font-weight:700">For traceability and accuracy</p>
      <p>The completed drift verification is attached as a PDF. No TITAN access is required to open it.</p>
      <p><strong>Verification:</strong> ${escapeHtml(verification.verification_number)}<br />
      <strong>Date:</strong> ${escapeHtml(verification.verification_date)}<br />
      <strong>Drift Serial Number:</strong> ${escapeHtml(verification.drift_serial_number || "-")}<br />
      <strong>FT# or TU#:</strong> ${escapeHtml(verification.ft_tu_number || "-")}<br />
      <strong>Checked Out By:</strong> ${escapeHtml(verification.checked_out_by || "-")}</p>
      ${note ? `<p><strong>Message:</strong><br />${escapeHtml(note).replace(/\n/g, "<br />")}</p>` : ""}
      <p><a href="${reportUrl}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:6px">Open in TITAN</a></p>
      <p style="font-size:12px;color:#6b7280">The TITAN link is for authorized internal users. The attached PDF can be opened by anyone receiving this email.</p>
    </div>`;

    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: `TITAN Tubing Drift Verification - ${verification.verification_number}`,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: recipientEmail } }],
          attachments: toMicrosoftGraphAttachments([attachment]),
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null)));
    return Response.json({ ok: true, emailed: true, recipientEmail });
  } catch (error: any) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
