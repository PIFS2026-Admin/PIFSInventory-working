import { createClient } from "@supabase/supabase-js";
import { authorizeDtiAccess } from "../../../../../lib/serverDtiAccess";
import { buildDtiInspectionWorkbook } from "../../../../../lib/dtiInspectionWorkbook";

export const dynamic = "force-dynamic";

function clean(value: unknown) { return String(value ?? "").trim(); }
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
    const authorization = await authorizeDtiAccess(request, admin);
    if ("error" in authorization) return authorization.error;

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
