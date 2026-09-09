import { createClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;
type Body = Record<string, unknown>;
type Profile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };

function adminClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("Supabase server configuration is missing."); return createClient(url, key, { auth: { persistSession: false } }); }
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase(); }
function nullable(value: unknown) { return clean(value) || null; }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) { const value = normalized(errorMessage(error)); return value.includes("third_party_monitor_present") || value.includes("confirmation_attached") || value.includes("schema cache"); }

async function authorize(request: Request, admin: ReturnType<typeof adminClient>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !data) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const profile = data as Profile; const identity = normalized(profile.email || userData.user.email).replace(/[^a-z0-9]/g, "");
  if (profile.is_disabled || (normalized(profile.full_name) !== "wade wisenor" && identity !== "wadepathfinderinspectionscom")) return { error: Response.json({ error: "DTI deviation control is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id, fullName: clean(profile.full_name) || "Wade Wisenor" };
}

async function dtiJobs(admin: ReturnType<typeof adminClient>) {
  const [jobsResult, linksResult] = await Promise.all([
    admin.from("titan_jobs").select("id,job_number,title,lifecycle_status,customer_name,operator_name,rig_name,location_name,job_type,service_line").is("archived_at", null).order("updated_at", { ascending: false }).limit(2000),
    admin.from("titan_job_links").select("job_id").eq("module_key", "dti").is("archived_at", null).limit(2000),
  ]);
  if (jobsResult.error) throw jobsResult.error; if (linksResult.error) throw linksResult.error;
  const linked = new Set((linksResult.data ?? []).map((item) => item.job_id));
  return (jobsResult.data ?? []).filter((job) => normalized(job.service_line) === "dti" || linked.has(job.id));
}

async function loadData(admin: ReturnType<typeof adminClient>) {
  const jobs = await dtiJobs(admin); const jobIds = jobs.map((job) => job.id); const empty = { data: [], error: null };
  const [deviationsResult, documentsResult] = await Promise.all([
    jobIds.length ? admin.from("titan_job_deviations").select("*").in("job_id", jobIds).order("updated_at", { ascending: false }).limit(2000) : empty,
    jobIds.length ? admin.from("titan_job_documents").select("id,job_id,document_type,display_name,created_at").in("job_id", jobIds).order("created_at", { ascending: false }).limit(4000) : empty,
  ]);
  if (deviationsResult.error) throw deviationsResult.error; if (documentsResult.error) throw documentsResult.error;
  const deviations = deviationsResult.data ?? [];
  return { jobs, deviations, documents: documentsResult.data ?? [], metrics: { total: deviations.length, draft: deviations.filter((item) => item.status === "Draft").length, submitted: deviations.filter((item) => item.status === "Submitted").length, approved: deviations.filter((item) => item.status === "Approved").length } };
}

export async function GET(request: Request) {
  try { const admin = adminClient(); const access = await authorize(request, admin); if ("error" in access) return access.error; return Response.json({ ok: true, ...await loadData(admin) }); }
  catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_deviation_workflow.sql before using the OMS-202 register." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}

export async function POST(request: Request) {
  try {
    const admin = adminClient(); const access = await authorize(request, admin); if ("error" in access) return access.error;
    const body = await request.json().catch(() => ({})) as Body; const action = normalized(body.action); const deviationId = clean(body.deviationId);
    if (!validUuid(deviationId)) return Response.json({ error: "Select a valid deviation." }, { status: 400 });
    const jobs = await dtiJobs(admin); const jobIds = new Set(jobs.map((job) => job.id));
    const { data: deviation, error } = await admin.from("titan_job_deviations").select("*").eq("id", deviationId).maybeSingle();
    if (error) throw error; if (!deviation || !jobIds.has(deviation.job_id)) return Response.json({ error: "This DTI deviation could not be found." }, { status: 404 });
    let saved: Row;
    if (action === "save") {
      if (deviation.status !== "Draft") return Response.json({ error: "Only Draft deviations can be edited." }, { status: 409 });
      const quantity = Number(body.quantity); const riskLevel = clean(body.riskLevel); const economicImpact = clean(body.economicImpact); const trend = clean(body.trendAcrossString); const documentId = clean(body.confirmationDocumentId);
      if (!Number.isInteger(quantity) || quantity < 1) return Response.json({ error: "Quantity must be at least one joint or component." }, { status: 400 });
      if (!["Low", "Moderate", "High"].includes(riskLevel) || !["Low", "Moderate", "High"].includes(economicImpact) || !["Isolated", "Several Joints", "Widespread"].includes(trend)) return Response.json({ error: "Select operational risk, economic impact, and trend." }, { status: 400 });
      if (normalized(body.defectType).includes("crack") || normalized(body.defectType).includes("structural deformation")) return Response.json({ error: "Confirmed cracks and structural deformation are not eligible for deviation. Record a rejection instead." }, { status: 400 });
      if (validUuid(documentId)) { const { data: document, error: documentError } = await admin.from("titan_job_documents").select("id").eq("id", documentId).eq("job_id", deviation.job_id).maybeSingle(); if (documentError) throw documentError; if (!document) return Response.json({ error: "Written confirmation must be attached to this DTI job." }, { status: 400 }); }
      const monitorPresent = Boolean(body.thirdPartyMonitorPresent);
      const payload = { component: nullable(body.component), joint_ids: nullable(body.jointIds), quantity, defect_type: clean(body.defectType), location_on_component: nullable(body.locationOnComponent), measurements: nullable(body.measurements), controlling_criteria: nullable(body.controllingCriteria), justification: nullable(body.justification), operational_risk: riskLevel, inspector_recommendation: nullable(body.inspectorRecommendation), communication_method: nullable(body.communicationMethod), written_confirmation: validUuid(documentId), confirmation_document_id: validUuid(documentId) ? documentId : null, third_party_monitor_present: monitorPresent, third_party_monitor_name: monitorPresent ? nullable(body.thirdPartyMonitorName) : null, third_party_monitor_company: monitorPresent ? nullable(body.thirdPartyMonitorCompany) : null, risk_level: riskLevel, economic_impact: economicImpact, trend_across_string: trend, customer_rep_name: nullable(body.customerRepName), customer_rep_title: nullable(body.customerRepTitle), customer_company: nullable(body.customerCompany), customer_authorized_on: nullable(body.customerAuthorizedOn), pathfinder_inspector_name: nullable(body.pathfinderInspectorName), pathfinder_inspector_signed_on: nullable(body.pathfinderInspectorSignedOn), lead_inspector_name: nullable(body.leadInspectorName), lead_inspector_signed_on: nullable(body.leadInspectorSignedOn), customer_signature_name: nullable(body.customerSignatureName), customer_signed_on: nullable(body.customerSignedOn), confirmation_attached: Boolean(body.confirmationAttached), attached_to_job_report: Boolean(body.attachedToJobReport), affected_joints_marked: Boolean(body.affectedJointsMarked), manager_copy_filed: Boolean(body.managerCopyFiled), updated_by: access.userId };
      if (!payload.defect_type) return Response.json({ error: "Enter the condition or defect type." }, { status: 400 });
      const { data, error: saveError } = await admin.from("titan_job_deviations").update(payload).eq("id", deviationId).select("*").single(); if (saveError) throw saveError; saved = data;
    } else if (action === "submit") {
      if (deviation.status !== "Draft") return Response.json({ error: "Only a Draft deviation can be submitted." }, { status: 409 });
      const required = [deviation.component, deviation.joint_ids, deviation.defect_type, deviation.location_on_component, deviation.measurements, deviation.controlling_criteria, deviation.justification, deviation.risk_level, deviation.economic_impact, deviation.trend_across_string, deviation.inspector_recommendation, deviation.customer_rep_name, deviation.customer_rep_title, deviation.customer_company, deviation.customer_authorized_on, deviation.pathfinder_inspector_name, deviation.pathfinder_inspector_signed_on, deviation.lead_inspector_name, deviation.lead_inspector_signed_on, deviation.customer_signature_name, deviation.customer_signed_on, deviation.communication_method, deviation.confirmation_document_id];
      if (required.some((value) => !clean(value)) || Number(deviation.quantity) < 1) return Response.json({ error: "Complete all OMS-202 condition, risk, authorization, signature, and evidence fields before submitting." }, { status: 422 });
      if (deviation.inspector_recommendation !== "Accept with Deviation") return Response.json({ error: "Only an Accept with Deviation recommendation can be submitted as an OMS-202 agreement." }, { status: 422 });
      if (deviation.third_party_monitor_present && (!clean(deviation.third_party_monitor_name) || !clean(deviation.third_party_monitor_company))) return Response.json({ error: "Record the third-party monitor's name and company before submitting." }, { status: 422 });
      if (deviation.risk_level === "High") return Response.json({ error: "High operational risk cannot be accepted by deviation. Reject the component." }, { status: 422 });
      if (deviation.trend_across_string === "Widespread") return Response.json({ error: "A widespread condition requires further escalation before deviation acceptance." }, { status: 422 });
      if (![deviation.confirmation_attached, deviation.attached_to_job_report, deviation.affected_joints_marked, deviation.manager_copy_filed].every(Boolean)) return Response.json({ error: "Complete all four OMS-202 filing and distribution checks before submitting." }, { status: 422 });
      const { data, error: saveError } = await admin.from("titan_job_deviations").update({ status: "Submitted", updated_by: access.userId }).eq("id", deviationId).select("*").single(); if (saveError) throw saveError; saved = data;
    } else if (action === "approve") {
      if (deviation.status !== "Submitted") return Response.json({ error: "Only a Submitted deviation can be approved." }, { status: 409 });
      if (!deviation.written_confirmation || !deviation.confirmation_document_id || deviation.risk_level === "High") return Response.json({ error: "Approval requires written evidence and acceptable operational risk." }, { status: 422 });
      const { data, error: saveError } = await admin.from("titan_job_deviations").update({ status: "Approved", approved_by: access.userId, approved_at: new Date().toISOString(), updated_by: access.userId }).eq("id", deviationId).select("*").single(); if (saveError) throw saveError; saved = data;
    } else if (action === "void") {
      const reason = clean(body.voidReason); if (!reason) return Response.json({ error: "Enter the reason for voiding this record." }, { status: 400 });
      if (deviation.status === "Voided") return Response.json({ error: "This deviation is already voided." }, { status: 409 });
      const { data, error: saveError } = await admin.from("titan_job_deviations").update({ status: "Voided", void_reason: reason, updated_by: access.userId }).eq("id", deviationId).select("*").single(); if (saveError) throw saveError; saved = data;
    } else return Response.json({ error: "Select a valid OMS-202 action." }, { status: 400 });
    const actionLabel = action === "save" ? "updated" : action === "submit" ? "submitted" : action === "approve" ? "approved" : "voided";
    await admin.from("titan_job_events").insert({ job_id: deviation.job_id, event_type: `dti_deviation_${action}`, source_module: "dti", from_status: deviation.status, to_status: saved.status, summary: `${saved.deviation_number} ${actionLabel} in DTI Management.`, before_value: deviation, after_value: saved, actor_id: access.userId });
    return Response.json({ ok: true, ...await loadData(admin) });
  } catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_deviation_workflow.sql before using the OMS-202 register." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}
