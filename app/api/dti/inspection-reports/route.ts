import { createClient } from "@supabase/supabase-js";
import { calculatePercentNominalWall, dtiInspectionFields, isDtiComponentType, resolveDtiReportComponentType, type DtiComponentType } from "../../../../lib/dtiInspectionReport";

type Body = Record<string, unknown>;
type Row = Record<string, unknown>;
type Profile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase(); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function whole(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : NaN; }
function decimalOrNull(value: unknown) { if (value === "" || value === null || value === undefined) return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN; }
function object(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) { const value = normalized(errorMessage(error)); return value.includes("titan_dti_inspection_report") || value.includes("titan_dti_emi_prove_up") || value.includes("schema cache"); }
function legacyRowTrigger(error: unknown) { return (error as { code?: unknown })?.code === "42703" && normalized(errorMessage(error)).includes("report_number"); }

async function authorize(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !data) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const profile = data as Profile; const identity = normalized(profile.email || userData.user.email).replace(/[^a-z0-9]/g, "");
  if (profile.is_disabled || (normalized(profile.full_name) !== "wade wisenor" && identity !== "wadepathfinderinspectionscom")) return { error: Response.json({ error: "DTI Inspection Reports are currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}

async function loadReport(admin: ReturnType<typeof configuredSupabase>, reportId: string) {
  const [reportResult, itemsResult, proveUpsResult] = await Promise.all([
    admin.from("titan_dti_inspection_reports").select("*").eq("id", reportId).maybeSingle(),
    admin.from("titan_dti_inspection_items").select("*").eq("report_id", reportId).order("component_type").order("sequence_number"),
    admin.from("titan_dti_emi_prove_ups").select("*").eq("report_id", reportId).order("sequence_number"),
  ]);
  if (reportResult.error) throw reportResult.error; if (itemsResult.error) throw itemsResult.error; if (proveUpsResult.error) throw proveUpsResult.error;
  if (!reportResult.data) return null;
  return { report: reportResult.data, items: itemsResult.data ?? [], proveUps: proveUpsResult.data ?? [] };
}

async function logEvent(admin: ReturnType<typeof configuredSupabase>, reportId: string, entityType: string, entityId: string | null, eventType: string, beforeValue: unknown, afterValue: unknown, actorId: string) {
  const { error } = await admin.from("titan_dti_inspection_report_events").insert({ report_id: reportId, entity_type: entityType, entity_id: entityId, event_type: eventType, before_value: beforeValue, after_value: afterValue, actor_id: actorId });
  if (error) throw error;
}

async function replaceLegacyTriggeredRow(admin: ReturnType<typeof configuredSupabase>, table: "titan_dti_inspection_items" | "titan_dti_emi_prove_ups", prior: Row, payload: Row) {
  const replacement = { ...prior, ...payload, row_version: Number(prior.row_version ?? 1) + 1, updated_at: new Date().toISOString() };
  const deleted = await admin.from(table).delete().eq("id", clean(prior.id));
  if (deleted.error) throw deleted.error;
  const inserted = await admin.from(table).insert(replacement).select("*").single();
  if (!inserted.error) return inserted;

  // Preserve the original record if the compatibility replacement cannot be inserted.
  await admin.from(table).insert(prior);
  throw inserted.error;
}

function cleanRowData(componentType: DtiComponentType, value: unknown) {
  const source = object(value); const allowed = new Map(dtiInspectionFields[componentType].map((item) => [item.key, item])); const cleaned: Row = {};
  for (const [key, field] of allowed) {
    const raw = source[key];
    if (field.kind === "flag") cleaned[key] = raw === true;
    else if (field.kind === "number") cleaned[key] = raw === "" || raw === null || raw === undefined ? null : Number(raw);
    else cleaned[key] = clean(raw);
    if (field.kind === "number" && cleaned[key] !== null && !Number.isFinite(cleaned[key])) throw new Error(`${field.label} must be a valid number.`);
  }
  if (componentType === "Drill Pipe") cleaned.percentNominalWall = calculatePercentNominalWall(cleaned);
  return cleaned;
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase(); const authorization = await authorize(request, admin); if ("error" in authorization) return authorization.error;
    const reportId = clean(new URL(request.url).searchParams.get("reportId"));
    if (reportId) {
      if (!validUuid(reportId)) return Response.json({ error: "Select a valid inspection report." }, { status: 400 });
      const data = await loadReport(admin, reportId); return data ? Response.json({ ok: true, ...data }) : Response.json({ error: "Inspection report not found." }, { status: 404 });
    }
    const [reports, jobs] = await Promise.all([
      admin.from("titan_dti_inspection_reports").select("*").neq("status", "Archived").order("report_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      admin.from("titan_jobs").select("id,job_number,title,customer_name,rig_name,lifecycle_status").ilike("service_line", "DTI").order("created_at", { ascending: false }).limit(500),
    ]);
    if (reports.error) throw reports.error; if (jobs.error) throw jobs.error;
    return Response.json({ ok: true, reports: reports.data ?? [], jobs: jobs.data ?? [] });
  } catch (error) {
    console.error("DTI inspection report load failed", error);
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_inspection_reports.sql before using Inspection Reports." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase(); const authorization = await authorize(request, admin); if ("error" in authorization) return authorization.error;
    const body = await request.json().catch(() => ({})) as Body; const action = normalized(body.action); let reportId = clean(body.reportId);

    if (action === "create-report") {
      const operatorName = clean(body.operatorName); const reportDate = clean(body.reportDate); const jobId = clean(body.jobId); const componentType = clean(body.componentType);
      if (!operatorName || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return Response.json({ error: "Operator and report date are required." }, { status: 400 });
      if (!isDtiComponentType(componentType)) return Response.json({ error: "Select Drill Pipe, HWDP, or Subs for this report." }, { status: 400 });
      if (jobId && !validUuid(jobId)) return Response.json({ error: "Select a valid connected job or leave it blank." }, { status: 400 });
      const { data, error } = await admin.from("titan_dti_inspection_reports").insert({ job_id: jobId || null, operator_name: operatorName, contractor_name: clean(body.contractorName) || null, rig_number: clean(body.rigNumber) || null, report_date: reportDate, field_invoice: clean(body.fieldInvoice) || null, inspection_crew: clean(body.inspectionCrew) || null, connection_size: clean(body.connectionSize) || null, connection_type: clean(body.connectionType) || null, grade: clean(body.grade) || null, state: clean(body.state) || null, inspection_scope: { reportComponentType: componentType }, status: "Draft", created_by: authorization.userId, updated_by: authorization.userId }).select("*").single();
      if (error) throw error; reportId = data.id; await logEvent(admin, reportId, "Report", reportId, "Created", null, data, authorization.userId);
      return Response.json({ ok: true, ...(await loadReport(admin, reportId)) });
    }

    if (!validUuid(reportId)) return Response.json({ error: "Select a valid inspection report." }, { status: 400 });
    const loaded = await loadReport(admin, reportId); if (!loaded) return Response.json({ error: "Inspection report not found." }, { status: 404 });
    const reportComponentType = resolveDtiReportComponentType(object(loaded.report.inspection_scope), loaded.items);

    if (action === "save-report") {
      const status = clean(body.status); const reportDate = clean(body.reportDate); const operatorName = clean(body.operatorName);
      if (!operatorName || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !["Draft", "In Progress", "Complete"].includes(status)) return Response.json({ error: "Complete the operator, report date, and status." }, { status: 400 });
      const payload = { operator_name: operatorName, contractor_name: clean(body.contractorName) || null, rig_number: clean(body.rigNumber) || null, report_date: reportDate, field_invoice: clean(body.fieldInvoice) || null, inspection_crew: clean(body.inspectionCrew) || null, connection_size: clean(body.connectionSize) || null, connection_type: clean(body.connectionType) || null, grade: clean(body.grade) || null, state: clean(body.state) || null, inspection_scope: { ...object(body.inspectionScope), reportComponentType }, machine_shop: object(body.machineShop), remarks: object(body.remarks), status, completed_at: status === "Complete" ? new Date().toISOString() : null, updated_by: authorization.userId };
      const { data, error } = await admin.from("titan_dti_inspection_reports").update(payload).eq("id", reportId).select("*").single(); if (error) throw error;
      await logEvent(admin, reportId, "Report", reportId, loaded.report.status === status ? "Updated" : "Status Changed", loaded.report, data, authorization.userId);
    } else if (action === "delete-report") {
      const { data, error } = await admin.from("titan_dti_inspection_reports").update({ status: "Archived", updated_by: authorization.userId }).eq("id", reportId).select("*").single(); if (error) throw error;
      await logEvent(admin, reportId, "Report", reportId, "Deleted", loaded.report, data, authorization.userId); return Response.json({ ok: true, archived: true });
    } else if (action === "save-item") {
      const componentType = clean(body.componentType) as DtiComponentType; const sequenceNumber = whole(body.sequenceNumber); const itemId = clean(body.itemId);
      if (!(componentType in dtiInspectionFields) || sequenceNumber < 1) return Response.json({ error: "Select a component type and valid sequence number." }, { status: 400 });
      if (componentType !== reportComponentType) return Response.json({ error: `This is a ${reportComponentType} report. Create a separate ${componentType} report.` }, { status: 400 });
      const rowData = cleanRowData(componentType, body.rowData); let prior: Row | null = null;
      if (validUuid(itemId)) { const result = await admin.from("titan_dti_inspection_items").select("*").eq("id", itemId).eq("report_id", reportId).maybeSingle(); if (result.error) throw result.error; prior = result.data; }
      if (!prior) { const result = await admin.from("titan_dti_inspection_items").select("*").eq("report_id", reportId).eq("component_type", componentType).eq("sequence_number", sequenceNumber).maybeSingle(); if (result.error) throw result.error; prior = result.data; }
      const payload = { report_id: reportId, component_type: componentType, sequence_number: sequenceNumber, row_data: rowData, updated_by: authorization.userId };
      let result = prior ? await admin.from("titan_dti_inspection_items").update(payload).eq("id", prior.id).select("*").single() : await admin.from("titan_dti_inspection_items").insert({ ...payload, created_by: authorization.userId }).select("*").single();
      if (prior && result.error && legacyRowTrigger(result.error)) result = await replaceLegacyTriggeredRow(admin, "titan_dti_inspection_items", prior, payload);
      if (result.error) throw result.error; await logEvent(admin, reportId, componentType, result.data.id, prior ? "Updated" : "Created", prior, result.data, authorization.userId);
    } else if (action === "delete-item") {
      const itemId = clean(body.itemId); if (!validUuid(itemId)) return Response.json({ error: "Select a valid inspection row." }, { status: 400 });
      const prior = loaded.items.find((item) => item.id === itemId); if (!prior) return Response.json({ error: "Inspection row not found." }, { status: 404 });
      const { error } = await admin.from("titan_dti_inspection_items").delete().eq("id", itemId).eq("report_id", reportId); if (error) throw error;
      await logEvent(admin, reportId, clean(prior.component_type), itemId, "Deleted", prior, null, authorization.userId);
    } else if (action === "save-prove-up") {
      const proveUpId = clean(body.proveUpId); const sequenceNumber = whole(body.sequenceNumber); if (sequenceNumber < 1) return Response.json({ error: "Enter a valid prove-up sequence number." }, { status: 400 });
      const payload = { report_id: reportId, sequence_number: sequenceNumber, joint_number: clean(body.jointNumber) || null, serial_number: clean(body.serialNumber) || null, flaw: clean(body.flaw) || null, depth_inches: decimalOrNull(body.depthInches), adjacent_wall_inches: decimalOrNull(body.adjacentWallInches), remaining_body_wall_inches: decimalOrNull(body.remainingBodyWallInches), distance_from_end: clean(body.distanceFromEnd) || null, prove_up_result: clean(body.proveUpResult) || null, updated_by: authorization.userId };
      if ([payload.depth_inches, payload.adjacent_wall_inches, payload.remaining_body_wall_inches].some((value) => typeof value === "number" && !Number.isFinite(value))) return Response.json({ error: "Prove-up measurements must be non-negative numbers." }, { status: 400 });
      let prior: Row | null = null; if (validUuid(proveUpId)) prior = loaded.proveUps.find((item) => item.id === proveUpId) ?? null; if (!prior) prior = loaded.proveUps.find((item) => Number(item.sequence_number) === sequenceNumber) ?? null;
      let result = prior ? await admin.from("titan_dti_emi_prove_ups").update(payload).eq("id", prior.id).select("*").single() : await admin.from("titan_dti_emi_prove_ups").insert({ ...payload, created_by: authorization.userId }).select("*").single();
      if (prior && result.error && legacyRowTrigger(result.error)) result = await replaceLegacyTriggeredRow(admin, "titan_dti_emi_prove_ups", prior, payload);
      if (result.error) throw result.error; await logEvent(admin, reportId, "EMI Prove-Up", result.data.id, prior ? "Updated" : "Created", prior, result.data, authorization.userId);
    } else if (action === "delete-prove-up") {
      const proveUpId = clean(body.proveUpId); if (!validUuid(proveUpId)) return Response.json({ error: "Select a valid prove-up row." }, { status: 400 });
      const prior = loaded.proveUps.find((item) => item.id === proveUpId); if (!prior) return Response.json({ error: "Prove-up row not found." }, { status: 404 });
      const { error } = await admin.from("titan_dti_emi_prove_ups").delete().eq("id", proveUpId).eq("report_id", reportId); if (error) throw error;
      await logEvent(admin, reportId, "EMI Prove-Up", proveUpId, "Deleted", prior, null, authorization.userId);
    } else return Response.json({ error: "Unsupported inspection report action." }, { status: 400 });

    return Response.json({ ok: true, ...(await loadReport(admin, reportId)) });
  } catch (error) {
    console.error("DTI inspection report mutation failed", error);
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_inspection_reports.sql before using Inspection Reports." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
