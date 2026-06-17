import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedRoles = [
  "admin",
  "employee",
  "sales",
  "dti_superintendent",
  "dti_inspector",
];

function getErrorMessage(error: any) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error_description === "string" && error.error_description.trim()) {
    return error.error_description;
  }
  if (typeof error.error === "string" && error.error.trim()) return error.error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function configuredSupabase() {
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Supabase notification route is not configured.");
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

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

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
}) {
  const from = process.env.MICROSOFT_MAIL_FROM;

  if (!from) {
    throw new Error("MICROSOFT_MAIL_FROM is missing.");
  }

  const accessToken = await getMicrosoftAccessToken();

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
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
          toRecipients: [
            {
              emailAddress: {
                address: options.to,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(getErrorMessage(result) || `Microsoft email failed with status ${response.status}.`);
  }
}

function buildEmailHtml(options: {
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
}) {
  const buttonHtml = options.actionUrl
    ? `<p><a href="${options.actionUrl}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:6px">${options.actionLabel || "Open TITAN"}</a></p>`
    : "";

  const linkHtml = options.actionUrl
    ? `<p style="font-size:12px;color:#6b7280">If the button does not open, copy this link:<br /><a href="${options.actionUrl}">${options.actionUrl}</a></p>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 6px">TITAN Notification</h2>
      <p style="margin:0 0 18px;color:#f97316;font-weight:700">Powering smarter pipe management</p>
      <h3 style="margin:0 0 10px">${options.title}</h3>
      <p>${options.body.replace(/\n/g, "<br />")}</p>
      ${buttonHtml}
      ${linkHtml}
      <div style="margin-top:22px;padding-top:14px;border-top:1px solid #d1d5db;color:#374151;font-size:13px">
        <strong>Pathfinder Inspections &amp; Field Services</strong><br />
        7501 Groening St.<br />
        Odessa, TX 79765<br />
        (432) 233-3600<br />
        <a href="https://pifstitan.com">pifstitan.com</a>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  try {
    const { publicClient, adminClient } = configuredSupabase();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return Response.json({ error: "You must be signed in to send notifications." }, { status: 401 });
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
      return Response.json({ error: "You do not have permission to send notifications." }, { status: 403 });
    }

    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const notificationBody = String(body.body ?? "").trim();
    const category = String(body.category ?? "general").trim() || "general";
    const priority = String(body.priority ?? "normal").trim() || "normal";
    const audience = String(body.audience ?? "user").trim() || "user";
    const role = body.role ? String(body.role).trim() : null;
    const recipientUserId = body.recipientUserId ? String(body.recipientUserId).trim() : null;
    const recipientCompanyId = body.recipientCompanyId ? String(body.recipientCompanyId).trim() : null;
    const actionLabel = body.actionLabel ? String(body.actionLabel).trim() : null;
    const rawActionUrl = body.actionUrl ? String(body.actionUrl).trim() : "";
    const recipientEmail = body.recipientEmail ? String(body.recipientEmail).trim() : "";
    const sendEmail = Boolean(body.sendEmail);

    if (!title) {
      return Response.json({ error: "Notification title is required." }, { status: 400 });
    }

    if (sendEmail && (!recipientEmail || !recipientEmail.includes("@"))) {
      return Response.json({ error: "A valid recipient email is required when sending email." }, { status: 400 });
    }

    const siteUrl = getSiteUrl();
    const actionUrl = rawActionUrl
      ? rawActionUrl.startsWith("http")
        ? rawActionUrl
        : `${siteUrl}${rawActionUrl.startsWith("/") ? rawActionUrl : `/${rawActionUrl}`}`
      : null;

    const { data: notification, error: insertError } = await adminClient
      .from("notifications")
      .insert({
        recipient_user_id: recipientUserId,
        recipient_company_id: recipientCompanyId,
        audience,
        role,
        title,
        body: notificationBody || null,
        category,
        priority,
        action_label: actionLabel,
        action_url: actionUrl,
        created_by: userData.user.id,
      })
      .select("id")
      .single();

    if (insertError || !notification) {
      return Response.json({ error: insertError?.message ?? "Notification could not be created." }, { status: 500 });
    }

    let emailSent = false;
    if (sendEmail) {
      await sendMicrosoftEmail({
        to: recipientEmail,
        subject: `TITAN: ${title}`,
        html: buildEmailHtml({
          title,
          body: notificationBody || "A TITAN notification is ready for review.",
          actionLabel: actionLabel || "Open TITAN",
          actionUrl: actionUrl || siteUrl,
        }),
      });

      const sentAt = new Date().toISOString();
      await adminClient.from("notifications").update({ email_sent_at: sentAt }).eq("id", notification.id);
      emailSent = true;
    }

    return Response.json({
      ok: true,
      notificationId: notification.id,
      emailSent,
    });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
