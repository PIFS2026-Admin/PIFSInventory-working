import { createClient } from "@supabase/supabase-js";

type Profile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
type Body = Record<string, unknown>;

function adminClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("Supabase server configuration is missing."); return createClient(url, key, { auth: { persistSession: false } }); }
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase(); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) { const value = normalized(errorMessage(error)); return value.includes("titan_dti_job_scopes") || value.includes("schema cache"); }

async function authorize(request: Request, admin: ReturnType<typeof adminClient>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim(); if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token); if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle(); if (error || !data) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const profile = data as Profile; const isWade = normalized(profile.full_name) === "wade wisenor" || normalized(profile.email) === "wade@pathfinderinspections.com" || normalized(userData.user.email) === "wade@pathfinderinspections.com";
  if (profile.is_disabled || !isWade) return { error: Response.json({ error: "DTI Job Scope is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}
async function job(admin: ReturnType<typeof adminClient>, jobId: string) { const { data, error } = await admin.from("titan_jobs").select("id,job_number,title,service_line,customer_name,rig_name,job_type").eq("id", jobId).maybeSingle(); if (error) throw error; return data && normalized(data.service_line) === "dti" ? data : null; }

function baseline(componentFamily: string, category: string, connectionType: string) {
  let items: string[] = [];
  if (componentFamily === "BHA / HWDP / Collars") {
    if (category === "1") items = ["Visual Tube", "Visual Connection", "Post-Inspection Marking"];
    else if (category === "2") items = ["Visual Tube", "Visual Connection", "Blacklight Connection", "Slip Groove (if applicable)", "Heat Checking (HWDP only)", "Pup Joint 1", "Post-Inspection Marking"];
    else if (category === "HDLS") items = ["Subs / Stabilizer / Kelly Inspection", "Pup Joint 2", "Traceability"];
    else items = ["Visual Tube", "Visual Connection", "Dimensional 3", "Blacklight Connection", "Slip Groove (if applicable)", "Heat Checking (HWDP only)", "MPI Slip / Upset", "Subs / Stabilizer / Kelly Inspection", "Shop Inspection of Fishing Tools", "Pup Joint 2", "Post-Inspection Marking"];
  } else {
    items = ["Visual Tube", "Visual Connection", "Post-Inspection Marking"];
    if (["2", "3"].includes(category)) items.push("Dimensional 1");
    if (["4", "5", "HDLS"].includes(category)) items.push("Dimensional 2");
    if (["2", "3", "4", "5", "HDLS"].includes(category)) items.push("OD Gauge", "UT Wall Thickness");
    if (["3", "4", "5", "HDLS"].includes(category)) items.push("EMI");
    if (["4", "5", "HDLS"].includes(category)) items.push("MPI Slip / Upset");
    if (["5", "HDLS"].includes(category)) items.push("Blacklight Connection", "Heat Checking", "UT Slip / Upset", "Full-Length UT (FLUT)");
    if (category === "HDLS") items.push("Traceability");
    if (componentFamily === "Work String Tubing" && ["2", "3", "4", "5"].includes(category)) items.push("Drift Testing", "Workstring Dimensional Connection");
  }
  if (["Proprietary", "Double-Shoulder"].includes(connectionType) && !items.includes("Dimensional 2")) items.push("Dimensional 2");
  return [...new Set(items)];
}

export async function GET(request: Request) {
  try { const admin = adminClient(); const authorization = await authorize(request, admin); if ("error" in authorization) return authorization.error; const jobId = clean(new URL(request.url).searchParams.get("jobId")); if (!validUuid(jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 }); const currentJob = await job(admin, jobId); if (!currentJob) return Response.json({ error: "This DTI job could not be found." }, { status: 404 }); const [scopeResult, documentsResult] = await Promise.all([admin.from("titan_dti_job_scopes").select("*").eq("job_id", jobId).maybeSingle(), admin.from("titan_job_documents").select("id,display_name,document_type").eq("job_id", jobId).is("archived_at", null).order("created_at", { ascending: false })]); if (scopeResult.error) throw scopeResult.error; if (documentsResult.error) throw documentsResult.error; return Response.json({ ok: true, job: currentJob, scope: scopeResult.data, documents: documentsResult.data ?? [] }); }
  catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_job_scope.sql before using OMS-102 Job Scope." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}

export async function POST(request: Request) {
  try {
    const admin = adminClient(); const authorization = await authorize(request, admin); if ("error" in authorization) return authorization.error; const body = await request.json().catch(() => ({})) as Body; const jobId = clean(body.jobId); if (!validUuid(jobId) || !await job(admin, jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 });
    const componentFamily = clean(body.componentFamily); const componentDescription = clean(body.componentDescription); const serviceCategory = clean(body.serviceCategory); const connectionType = clean(body.connectionType); const quantityText = clean(body.estimatedQuantity); const estimatedQuantity = quantityText ? Number(quantityText) : null; const confirm = normalized(body.action) === "confirm"; const specDocumentId = clean(body.customerSpecDocumentId);
    if (!["Drill Pipe", "Work String Tubing", "BHA / HWDP / Collars"].includes(componentFamily) || !componentDescription || !["1", "2", "3", "4", "5", "HDLS"].includes(serviceCategory) || !["API", "Proprietary", "Double-Shoulder", "Other"].includes(connectionType)) return Response.json({ error: "Complete the component family, description, service category, and connection type." }, { status: 400 });
    if (estimatedQuantity !== null && (!Number.isInteger(estimatedQuantity) || estimatedQuantity < 0)) return Response.json({ error: "Estimated quantity must be a non-negative whole number." }, { status: 400 });
    if (confirm && (!Boolean(body.customerConfirmed) || !clean(body.customerConfirmedBy) || !/^\d{4}-\d{2}-\d{2}$/.test(clean(body.customerConfirmedOn)))) return Response.json({ error: "Customer confirmation, representative name, and confirmation date are required." }, { status: 400 });
    if (validUuid(specDocumentId)) { const { data, error } = await admin.from("titan_job_documents").select("id").eq("id", specDocumentId).eq("job_id", jobId).maybeSingle(); if (error) throw error; if (!data) return Response.json({ error: "The selected customer specification is not attached to this job." }, { status: 400 }); }
    const payload = { job_id: jobId, scope_version: "OMS-102 Rev 0", component_family: componentFamily, component_description: componentDescription, service_category: serviceCategory, connection_type: connectionType, estimated_quantity: estimatedQuantity, baseline_scope: baseline(componentFamily, serviceCategory, connectionType), additional_requirements: clean(body.additionalRequirements) || null, customer_spec_document_id: validUuid(specDocumentId) ? specDocumentId : null, customer_confirmed: Boolean(body.customerConfirmed), customer_confirmed_by: clean(body.customerConfirmedBy) || null, customer_confirmed_on: clean(body.customerConfirmedOn) || null, status: confirm ? "Confirmed" : "Draft", updated_by: authorization.userId };
    const { data, error } = await admin.from("titan_dti_job_scopes").upsert({ ...payload, created_by: authorization.userId }, { onConflict: "job_id" }).select("*").single(); if (error) throw error;
    return Response.json({ ok: true, scope: data });
  } catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_job_scope.sql before saving OMS-102 Job Scope." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}
