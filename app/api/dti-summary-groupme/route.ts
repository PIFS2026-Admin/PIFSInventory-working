import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    throw new Error("Supabase server route is not configured.");
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

export async function POST(request: Request) {
  try {
    const botId = process.env.GROUPME_DAILY_SUMMARY_BOT_ID ?? process.env.GROUPME_BOT_ID;
    if (!botId) {
      return Response.json({ error: "GroupMe bot ID is not configured. Add GROUPME_DAILY_SUMMARY_BOT_ID in Vercel." }, { status: 400 });
    }

    const { publicClient, adminClient } = configuredSupabase();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return Response.json({ error: "You must be signed in to post DTI summaries." }, { status: 401 });
    }

    const { data: userData, error: userError } = await publicClient.auth.getUser(token);
    if (userError || !userData.user) {
      return Response.json({ error: "Your login session could not be verified." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile) {
      return Response.json({ error: "Your user profile could not be loaded." }, { status: 403 });
    }

    const allowedRoles = ["admin", "employee", "dti_superintendent", "dti_inspector"];
    if (!allowedRoles.includes(String(profile.role))) {
      return Response.json({ error: "You do not have permission to post DTI summaries." }, { status: 403 });
    }

    const body = await request.json();
    const summaryId = String(body.summaryId ?? "").trim();

    if (!summaryId) {
      return Response.json({ error: "DTI daily summary is required." }, { status: 400 });
    }

    const { data: summary, error: summaryError } = await adminClient
      .from("dti_daily_summaries")
      .select("id, summary_number, summary_date, operator, contractor, location, field_invoice, total_joints_inspected, total_damages, total_dbr, total_refaces, total_hardbands, inspected_by, inspection_report_name, inspection_report_url")
      .eq("id", summaryId)
      .single();

    if (summaryError || !summary) {
      return Response.json({ error: summaryError?.message ?? "DTI daily summary not found." }, { status: 404 });
    }

    const siteUrl = getSiteUrl();
    const reportUrl = `${siteUrl}/dti-summary/print?id=${encodeURIComponent(summary.id)}`;
    const lines = [
      "TITAN Daily Summary Posted",
      `Summary: ${summary.summary_number ?? "-"}`,
      `Date: ${summary.summary_date ?? "-"}`,
      `Operator: ${summary.operator ?? "-"}`,
      `Contractor: ${summary.contractor ?? "-"}`,
      `Location: ${summary.location ?? "-"}`,
      `Field Invoice: ${summary.field_invoice ?? "-"}`,
      `Inspected By: ${summary.inspected_by ?? "-"}`,
      `Joints: ${summary.total_joints_inspected ?? 0}`,
      `Damages: ${summary.total_damages ?? 0}`,
      `DBR: ${summary.total_dbr ?? 0}`,
      `Refaces: ${summary.total_refaces ?? 0}`,
      `Hardbands: ${summary.total_hardbands ?? 0}`,
      `Print: ${reportUrl}`,
    ];

    if (summary.inspection_report_url) {
      lines.push(`Inspection Report: ${summary.inspection_report_name ?? "Attached report"} - ${summary.inspection_report_url}`);
    }

    const response = await fetch("https://api.groupme.com/v3/bots/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bot_id: botId,
        text: lines.join("\n"),
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(getErrorMessage(result) || `GroupMe post failed with status ${response.status}.`);
    }

    await adminClient
      .from("dti_daily_summaries")
      .update({ status: "Posted", updated_at: new Date().toISOString() })
      .eq("id", summaryId);

    return Response.json({ ok: true, posted: true });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
