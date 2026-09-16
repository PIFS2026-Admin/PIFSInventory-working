import { createClient } from "@supabase/supabase-js";
import { buildDtiInspectionWorkbook } from "../../../../../lib/dtiInspectionWorkbook";

export const dynamic = "force-dynamic";

type Profile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase(); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase();
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return Response.json({ error: "You must be signed in." }, { status: 401 });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return Response.json({ error: "Your session could not be verified." }, { status: 401 });
    const profileResult = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
    const profile = profileResult.data as Profile | null;
    const identity = normalized(profile?.email || userData.user.email).replace(/[^a-z0-9]/g, "");
    if (profileResult.error || !profile || profile.is_disabled || (normalized(profile.full_name) !== "wade wisenor" && identity !== "wadepathfinderinspectionscom")) return Response.json({ error: "DTI Inspection Reports are currently restricted to Wade." }, { status: 403 });

    const reportId = clean(new URL(request.url).searchParams.get("reportId"));
    if (!validUuid(reportId)) return Response.json({ error: "Select a valid inspection report." }, { status: 400 });
    const [reportResult, itemsResult, proveUpsResult] = await Promise.all([
      admin.from("titan_dti_inspection_reports").select("*").eq("id", reportId).maybeSingle(),
      admin.from("titan_dti_inspection_items").select("*").eq("report_id", reportId).order("component_type").order("sequence_number"),
      admin.from("titan_dti_emi_prove_ups").select("*").eq("report_id", reportId).order("sequence_number"),
    ]);
    if (reportResult.error) throw reportResult.error; if (itemsResult.error) throw itemsResult.error; if (proveUpsResult.error) throw proveUpsResult.error;
    if (!reportResult.data) return Response.json({ error: "Inspection report not found." }, { status: 404 });

    const output = await buildDtiInspectionWorkbook(reportResult.data, itemsResult.data ?? [], proveUpsResult.data ?? []);
    const filename = `${clean(reportResult.data.report_number).replace(/[^a-z0-9_-]+/gi, "-") || "DTI-Inspection-Report"}.xlsx`;
    const body = Uint8Array.from(output).buffer;
    return new Response(body, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("DTI inspection workbook export failed", error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
