import { createClient } from "@supabase/supabase-js";
import { listNotificationRecipientsWithFallback } from "../../../lib/adminEmailRecipients";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type ReleaseRequestBody = {
  yardId?: string;
  rackId?: string;
  rackLabel?: string;
  quantityJoints?: number | string;
  releaseDate?: string;
  releasedTo?: string;
  shipDate?: string;
  carrier?: string;
  destination?: string;
  partSummary?: string;
  partLines?: unknown;
  notes?: string;
  signatureName?: string;
  signatureData?: string;
};

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
    throw new Error("Tubular release request route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://pifstitan.com"
  ).replace(/\/$/, "");
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePipeRangeValue(value: unknown): "Range 2" | "Range 3" {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

function normalizeReleasePartLines(rawLines: unknown, requestedJoints: number) {
  const rows = Array.isArray(rawLines) ? rawLines : [];
  let remaining = Math.max(0, toNumber(requestedJoints));
  const result: Array<Record<string, string | number>> = [];

  for (const row of rows as any[]) {
    const availableJoints = toNumber(row.joints ?? row.total_joints ?? row.bulk_joints);
    if (remaining <= 0 || availableJoints <= 0) continue;

    const releasedJoints = Math.min(availableJoints, remaining);
    const pipeRange = normalizePipeRangeValue(row.pipeRange ?? row.pipe_range);
    const storedFootage = toNumber(row.footage ?? row.total_footage ?? row.bulk_footage);
    const footagePerJoint =
      availableJoints > 0 && storedFootage > 0
        ? storedFootage / availableJoints
        : pipeRange === "Range 3"
          ? 43.5
          : 31.5;

    remaining -= releasedJoints;
    result.push({
      afe: String(row.afe ?? row.tu ?? ""),
      partNumber: String(row.partNumber ?? row.part_number ?? ""),
      size: String(row.size ?? ""),
      grade: String(row.grade ?? ""),
      connection: String(row.connection ?? ""),
      pipeRange,
      condition: String(row.condition ?? ""),
      joints: releasedJoints,
      footage: Math.round(releasedJoints * footagePerJoint * 100) / 100,
    });
  }

  return result;
}

function summarizeReleasePartNumbers(lines: Array<Record<string, string | number>>) {
  return lines
    .map((line) => `${line.partNumber || "Part"} (${toNumber(line.joints).toLocaleString()} joints)`)
    .join(", ");
}

async function getMicrosoftAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft 365 email is not configured.");
  }

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

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.access_token) {
    throw new Error(getErrorMessage(result));
  }

  return String(result.access_token);
}

async function sendMicrosoftEmail(options: { to: string[]; subject: string; html: string }) {
  const from = process.env.MICROSOFT_MAIL_FROM;
  const recipients = Array.from(new Set(options.to.map((email) => email.trim()).filter((email) => email.includes("@"))));

  if (!from || recipients.length === 0) return false;

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
        toRecipients: recipients.map((email) => ({
          emailAddress: { address: email },
        })),
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(getErrorMessage(result) || `Microsoft email failed with status ${response.status}.`);
  }

  return true;
}

async function requireUser(request: Request, adminSupabase: ReturnType<typeof configuredSupabase>) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { error: Response.json({ error: "Missing user session." }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { error: Response.json({ error: "Invalid user session." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, full_name, role, company_id, companies(name)")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    return { error: Response.json({ error: "User profile was not found." }, { status: 403 }) };
  }

  return { user: userData.user, profile };
}

function nextRequestLetter(existingNumbers: string[]) {
  const used = new Set(
    existingNumbers
      .map((number) => String(number).trim().split("").pop() ?? "")
      .filter((letter) => /^[A-Z]$/.test(letter))
  );

  for (let index = 0; index < 26; index += 1) {
    const letter = String.fromCharCode(65 + index);
    if (!used.has(letter)) return letter;
  }

  return String.fromCharCode(65 + (existingNumbers.length % 26));
}

async function generateRequestNumber(adminSupabase: ReturnType<typeof configuredSupabase>) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  const prefix = `REL-${month}-${day}-${year}`;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data } = await adminSupabase
    .from("tubular_release_requests")
    .select("request_number")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .like("request_number", `${prefix}%`);

  return `${prefix}${nextRequestLetter((data ?? []).map((row: any) => row.request_number))}`;
}

function buildReleaseEmailHtml(request: any) {
  const actionUrl = `${getSiteUrl()}/`;
  const partRows = Array.isArray(request.part_lines) ? request.part_lines : [];
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 6px">TITAN Tubular Release Request</h2>
      <p style="margin:0 0 18px;color:#f97316;font-weight:700">Powering smarter pipe management</p>
      <table style="border-collapse:collapse;width:100%;max-width:680px">
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Request</td><td style="border:1px solid #d1d5db;padding:8px">${request.request_number}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Customer</td><td style="border:1px solid #d1d5db;padding:8px">${request.company_name}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Yard</td><td style="border:1px solid #d1d5db;padding:8px">${request.yard_name}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Rack</td><td style="border:1px solid #d1d5db;padding:8px">${request.rack_label}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Part Numbers</td><td style="border:1px solid #d1d5db;padding:8px">${request.part_summary || "-"}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Quantity</td><td style="border:1px solid #d1d5db;padding:8px">${request.quantity_joints} joints</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Release Date</td><td style="border:1px solid #d1d5db;padding:8px">${request.release_date || "-"}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Released To</td><td style="border:1px solid #d1d5db;padding:8px">${request.released_to || "-"}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Ship Date</td><td style="border:1px solid #d1d5db;padding:8px">${request.ship_date || "-"}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Carrier</td><td style="border:1px solid #d1d5db;padding:8px">${request.carrier || "-"}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Destination</td><td style="border:1px solid #d1d5db;padding:8px">${request.destination || "-"}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Signed By</td><td style="border:1px solid #d1d5db;padding:8px">${request.signature_name}</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:8px;font-weight:700">Notes</td><td style="border:1px solid #d1d5db;padding:8px">${request.notes || "-"}</td></tr>
      </table>
      ${
        partRows.length > 0
          ? `<h3 style="margin:18px 0 8px">Rack Part Details</h3>
             <table style="border-collapse:collapse;width:100%;max-width:680px">
               <tr>
                 <th style="border:1px solid #d1d5db;padding:8px;text-align:left">TU#</th>
                 <th style="border:1px solid #d1d5db;padding:8px;text-align:left">Part Number</th>
                 <th style="border:1px solid #d1d5db;padding:8px;text-align:left">Range</th>
                 <th style="border:1px solid #d1d5db;padding:8px;text-align:left">Condition</th>
                 <th style="border:1px solid #d1d5db;padding:8px;text-align:left">Joints</th>
               </tr>
               ${partRows
                 .map(
                   (line: any) => `<tr>
                     <td style="border:1px solid #d1d5db;padding:8px">${line.afe || "-"}</td>
                     <td style="border:1px solid #d1d5db;padding:8px">${line.partNumber || "-"}</td>
                     <td style="border:1px solid #d1d5db;padding:8px">${line.pipeRange || "-"}</td>
                     <td style="border:1px solid #d1d5db;padding:8px">${line.condition || "-"}</td>
                     <td style="border:1px solid #d1d5db;padding:8px">${line.joints || 0}</td>
                   </tr>`
                 )
                 .join("")}
             </table>`
          : ""
      }
      <p><a href="${actionUrl}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:6px">Open TITAN</a></p>
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

export async function GET(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const access = await requireUser(request, adminSupabase);
    if ("error" in access && access.error) return access.error;

    const role = String(access.profile.role ?? "").toLowerCase();
    let query = adminSupabase
      .from("tubular_release_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!["admin", "employee", "internal", "yard_manager", "sales"].includes(role)) {
      query = query.eq("company_id", access.profile.company_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ requests: data ?? [] });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const access = await requireUser(request, adminSupabase);
    if ("error" in access && access.error) return access.error;

    const body = (await request.json().catch(() => ({}))) as ReleaseRequestBody;
    const yardId = String(body.yardId ?? "").trim();
    const rackId = String(body.rackId ?? "").trim();
    const quantityJoints = Number(body.quantityJoints ?? 0);
    const signatureName = String(body.signatureName ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const releaseDate = String(body.releaseDate ?? "").trim();
    const releasedTo = String(body.releasedTo ?? "").trim();
    const shipDate = String(body.shipDate ?? "").trim();
    const carrier = String(body.carrier ?? "").trim();
    const destination = String(body.destination ?? "").trim();
    const partLines = normalizeReleasePartLines(body.partLines, quantityJoints);
    const partSummary = String(body.partSummary ?? "").trim() || summarizeReleasePartNumbers(partLines);

    if (!access.profile.company_id) {
      return Response.json({ error: "Your login is not assigned to a customer company." }, { status: 400 });
    }

    if (!yardId || !rackId) {
      return Response.json({ error: "A yard and rack are required." }, { status: 400 });
    }

    if (!Number.isFinite(quantityJoints) || quantityJoints <= 0) {
      return Response.json({ error: "Quantity to release must be greater than zero." }, { status: 400 });
    }

    if (!signatureName) {
      return Response.json({ error: "Printed signature name is required." }, { status: 400 });
    }

    if (partLines.length === 0) {
      return Response.json({ error: "No pipe details were included for this release request." }, { status: 400 });
    }

    const companyRows = access.profile.companies;
    const company = Array.isArray(companyRows) ? companyRows[0] : companyRows;

    const { data: yard } = await adminSupabase
      .from("yards")
      .select("id, name")
      .eq("id", yardId)
      .maybeSingle();

    const { data: rack } = await adminSupabase
      .from("racks")
      .select("id, rack_code")
      .eq("id", rackId)
      .maybeSingle();

    const requestNumber = await generateRequestNumber(adminSupabase);
    const releaseRecord = {
      request_number: requestNumber,
      company_id: access.profile.company_id,
      yard_id: yardId,
      rack_id: rackId,
      customer_user_id: access.user.id,
      customer_name: access.profile.full_name ?? access.user.email ?? "Customer",
      customer_email: access.user.email ?? "",
      company_name: company?.name ?? "Customer",
      yard_name: yard?.name ?? "Yard",
      rack_label: rack?.rack_code ?? body.rackLabel ?? "Rack",
      part_summary: partSummary || null,
      part_lines: partLines,
      quantity_joints: quantityJoints,
      release_date: releaseDate || null,
      released_to: releasedTo || null,
      ship_date: shipDate || null,
      carrier: carrier || null,
      destination: destination || null,
      notes: notes || null,
      signature_name: signatureName,
      signature_data: body.signatureData ? String(body.signatureData) : null,
      status: "Submitted",
    };

    let { data: created, error: insertError } = await adminSupabase
      .from("tubular_release_requests")
      .insert(releaseRecord)
      .select("*")
      .single();

    if (insertError && /(part_(summary|lines)|release_date|released_to|ship_date|carrier|destination)/i.test(insertError.message ?? "")) {
      const {
        part_summary,
        part_lines,
        release_date,
        released_to,
        ship_date,
        carrier: releaseCarrier,
        destination: releaseDestination,
        ...legacyReleaseRecord
      } = releaseRecord;
      const legacyResult = await adminSupabase
        .from("tubular_release_requests")
        .insert(legacyReleaseRecord)
        .select("*")
        .single();

      created = legacyResult.data;
      insertError = legacyResult.error;
    }

    if (insertError || !created) {
      throw insertError ?? new Error("Release request could not be created.");
    }

    const title = `Tubular release request ${created.request_number}`;
    const releaseDestinationText = created.destination || created.released_to;
    const notificationBody = `${created.company_name} requested release of ${created.quantity_joints} joints from ${created.rack_label}${releaseDestinationText ? ` to ${releaseDestinationText}` : ""}.`;

    await adminSupabase.from("notifications").insert({
      audience: "internal",
      title,
      body: notificationBody,
      category: "tubular_release",
      priority: "high",
      action_label: "Open Tickets",
      action_url: `${getSiteUrl()}/`,
      created_by: access.user.id,
    });

    const userEmails = await listNotificationRecipientsWithFallback(
      adminSupabase,
      "customer_release_request",
      ["admin", "administrator", "yard_manager"],
      [
        process.env.TUBULAR_RELEASE_EMAIL_TO,
        process.env.RELEASE_REQUEST_EMAIL_TO,
        process.env.MICROSOFT_MAIL_FROM,
      ],
    );

    let emailSent = false;
    try {
      emailSent = await sendMicrosoftEmail({
        to: userEmails,
        subject: `TITAN ${created.request_number}: Tubular Release Request`,
        html: buildReleaseEmailHtml(created),
      });
    } catch (emailError: any) {
      return Response.json({
        request: created,
        emailSent: false,
        warning: `Release request saved, but email failed: ${getErrorMessage(emailError)}`,
      });
    }

    return Response.json({ request: created, emailSent });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
