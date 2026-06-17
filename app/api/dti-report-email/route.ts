import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

export async function POST(request: Request) {
  try {
    const { publicClient, adminClient } = configuredSupabase();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return Response.json({ error: "You must be signed in to email DTI reports." }, { status: 401 });
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

    const allowedRoles = ["admin", "employee", "sales", "dti_superintendent", "dti_inspector"];
    if (!allowedRoles.includes(String(profile.role))) {
      return Response.json({ error: "You do not have permission to email DTI reports." }, { status: 403 });
    }

    const body = await request.json();
    const jobId = String(body.jobId ?? "").trim();
    const section = String(body.section ?? "All Sections").trim() || "All Sections";
    const recipientEmail = String(body.recipientEmail ?? "").trim();
    const note = String(body.note ?? "").trim();

    if (!jobId || !recipientEmail) {
      return Response.json({ error: "DTI job and recipient email are required." }, { status: 400 });
    }

    if (!recipientEmail.includes("@")) {
      return Response.json({ error: "Enter a valid recipient email address." }, { status: 400 });
    }

    const { data: job, error: jobError } = await adminClient
      .from("dti_jobs")
      .select("id, job_number, job_date, rig, status, companies(name)")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return Response.json({ error: jobError?.message ?? "DTI job not found." }, { status: 404 });
    }

    const companyValue = (job as any).companies;
    const company = Array.isArray(companyValue)
      ? companyValue[0]?.name
      : companyValue?.name;

    const siteUrl = getSiteUrl();
    const reportUrl = `${siteUrl}/dti/print?id=${encodeURIComponent(job.id)}&section=${encodeURIComponent(section)}`;
    const subject = `TITAN DTI Report - ${job.job_number}`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 6px">TITAN DTI Report</h2>
        <p style="margin:0 0 18px;color:#f97316;font-weight:700">Powering smarter pipe management</p>
        <p>A DTI report is ready for review.</p>
        <p>
          <strong>Job:</strong> ${job.job_number}<br />
          <strong>Customer:</strong> ${company || "Unknown"}<br />
          <strong>Rig:</strong> ${job.rig || "-"}<br />
          <strong>Date:</strong> ${job.job_date || "-"}<br />
          <strong>Status:</strong> ${job.status || "-"}<br />
          <strong>Report Section:</strong> ${section}
        </p>
        ${note ? `<p><strong>Message:</strong><br />${note.replace(/\n/g, "<br />")}</p>` : ""}
        <p>
          <a href="${reportUrl}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:6px">
            Open DTI Report
          </a>
        </p>
        <p style="font-size:12px;color:#6b7280">If the button does not open, copy this link:<br /><a href="${reportUrl}">${reportUrl}</a></p>
        <div style="margin-top:22px;padding-top:14px;border-top:1px solid #d1d5db;color:#374151;font-size:13px">
          <strong>Pathfinder Inspections &amp; Field Services</strong><br />
          7501 Groening St.<br />
          Odessa, TX 79765<br />
          (432) 233-3600<br />
          <a href="https://pifstitan.com">pifstitan.com</a>
        </div>
      </div>
    `;

    await sendMicrosoftEmail({
      to: recipientEmail,
      subject,
      html,
    });

    return Response.json({ ok: true, emailed: true, recipientEmail });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
