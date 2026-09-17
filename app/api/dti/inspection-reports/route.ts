import { createClient } from "@supabase/supabase-js";
import { authorizeDtiAccess } from "../../../../lib/serverDtiAccess";
import { calculatePercentNominalWall, dtiComponentLabel, dtiInspectionFields, isDtiComponentType, normalizeDtiYesNo, planDtiInspectionRowCount, resolveDtiReportComponentType, type DtiComponentType } from "../../../../lib/dtiInspectionReport";
import { evaluateDtiThresholdAlerts } from "../../../../lib/dtiThresholdAlerts";
import { evaluateDtiCriteria, type DtiCriteriaSnapshot } from "../../../../lib/dtiCriteriaEngine";

export const runtime = "nodejs";

type Body = Record<string, unknown>;
type Row = Record<string, unknown>;

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
function gradingMigrationMissing(error: unknown) { const value = normalized(errorMessage(error)); return value.includes("grading_result") || value.includes("grading_criteria_version_id") || value.includes("value_unit") || value.includes("schema cache"); }

async function removeInspectionPhotos(admin: ReturnType<typeof configuredSupabase>, reportId: string, itemIds: string[]) {
  if (!itemIds.length) return;
  const selected = await admin.from("titan_dti_inspection_photos").select("storage_path").eq("report_id", reportId).in("item_id", itemIds);
  if (selected.error) {
    if (migrationMissing(selected.error)) return;
    throw selected.error;
  }
  const paths = (selected.data ?? []).map((photo) => clean(photo.storage_path)).filter(Boolean);
  if (paths.length) { const removed = await admin.storage.from("titan-dti-inspection-photos").remove(paths); if (removed.error) throw removed.error; }
}

function managedCriteriaIdentity(name: unknown) {
  const parts = clean(name).split("|").map((part) => part.trim());
  if (parts.length < 5 || parts[0] !== "DS-1 Premium") return null;
  const weightPpf = Number(parts[2]);
  if (!Number.isFinite(weightPpf)) return null;
  return { pipeSize: parts[1], weightPpf, grade: parts[3], connection: parts.slice(4).join(" | ") };
}

function tubularSpecKey(values: { pipeSize?: unknown; weightPpf?: unknown; grade?: unknown; connection?: unknown }) {
  return `${normalized(values.pipeSize)}|${Number(values.weightPpf).toFixed(3)}|${normalized(values.grade)}|${normalized(values.connection)}`;
}

function snapshotNominalWall(snapshot: unknown) {
  const spec = object(object(snapshot).tubularSpec);
  const value = Number(spec.new_wall_inches);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function authorize(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  return authorizeDtiAccess(request, admin);
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

async function loadPublishedCriteriaOptions(admin: ReturnType<typeof configuredSupabase>) {
  const setRows: Row[] = [];
  const versionRows: Row[] = [];
  const specRows: Row[] = [];
  try {
    for (let from = 0; ; from += 1000) {
      const result = await admin.from("titan_dti_criteria_sets").select("id,name,standard_type,component_type,customer_name").is("archived_at", null).range(from, from + 999);
      if (result.error) throw result.error;
      setRows.push(...(result.data ?? []));
      if ((result.data ?? []).length < 1000) break;
    }
    for (let from = 0; ; from += 1000) {
      const result = await admin.from("titan_dti_criteria_versions").select("id,criteria_set_id,version_number,effective_date,source_document_id,published_at").eq("status", "Published").order("version_number", { ascending: false }).range(from, from + 999);
      if (result.error) throw result.error;
      versionRows.push(...(result.data ?? []));
      if ((result.data ?? []).length < 1000) break;
    }
    for (let from = 0; ; from += 1000) {
      const result = await admin.from("titan_dti_tubular_specs").select("pipe_size,weight_ppf,grade,connection,new_wall_inches").is("archived_at", null).range(from, from + 999);
      if (result.error) throw result.error;
      specRows.push(...(result.data ?? []));
      if ((result.data ?? []).length < 1000) break;
    }
  } catch (error) {
    const message = normalized(errorMessage(error));
    if (message.includes("titan_dti_criteria") || message.includes("schema cache")) return [];
    throw error;
  }
  const sets = new Map(setRows.map((criteriaSet) => [criteriaSet.id, criteriaSet]));
  const nominalWallBySpec = new Map(specRows.map((spec) => [tubularSpecKey({ pipeSize: spec.pipe_size, weightPpf: spec.weight_ppf, grade: spec.grade, connection: spec.connection }), spec.new_wall_inches]));
  return versionRows.flatMap((version) => {
    const criteriaSet = sets.get(version.criteria_set_id);
    const identity = managedCriteriaIdentity(criteriaSet?.name);
    const nominalWall = identity ? nominalWallBySpec.get(tubularSpecKey(identity)) ?? null : null;
    return criteriaSet ? [{
      ...version,
      criteria_set: criteriaSet,
      nominal_wall_inches: nominalWall,
      pipe_size: identity?.pipeSize ?? null,
      weight_ppf: identity?.weightPpf ?? null,
      grade: identity?.grade ?? null,
      connection: identity?.connection ?? null,
    }] : [];
  });
}

async function loadCriteriaSnapshot(admin: ReturnType<typeof configuredSupabase>, versionId: string, componentType: DtiComponentType) {
  if (!validUuid(versionId)) throw new Error("Select a valid published acceptance criteria version.");
  const versionResult = await admin.from("titan_dti_criteria_versions").select("*").eq("id", versionId).eq("status", "Published").maybeSingle();
  if (versionResult.error) throw versionResult.error;
  if (!versionResult.data) throw new Error("Published acceptance criteria version not found.");
  const [setResult, rulesResult, documentResult] = await Promise.all([
    admin.from("titan_dti_criteria_sets").select("*").eq("id", versionResult.data.criteria_set_id).is("archived_at", null).maybeSingle(),
    admin.from("titan_dti_criteria_rules").select("*").eq("criteria_version_id", versionId).eq("is_active", true).order("display_order"),
    admin.from("documents").select("id,title,document_number,approval_status,document_status").eq("id", versionResult.data.source_document_id).maybeSingle(),
  ]);
  if (setResult.error) throw setResult.error; if (rulesResult.error) throw rulesResult.error; if (documentResult.error) throw documentResult.error;
  if (!setResult.data || setResult.data.component_type !== componentType) throw new Error(`Select published criteria for ${dtiComponentLabel(componentType)}.`);
  if (!rulesResult.data?.length) throw new Error("Published criteria must contain active rules.");
  const identity = managedCriteriaIdentity(setResult.data.name);
  let tubularSpec: Row | null = null;
  if (identity) {
    const specResult = await admin.from("titan_dti_tubular_specs").select("id,pipe_size,weight_ppf,grade,connection,new_wall_inches,premium_min_wall_inches,class_2_min_wall_inches").eq("pipe_size", identity.pipeSize).eq("weight_ppf", identity.weightPpf).eq("grade", identity.grade).eq("connection", identity.connection).is("archived_at", null).maybeSingle();
    if (specResult.error) throw specResult.error;
    tubularSpec = specResult.data;
  }
  return {
    capturedAt: new Date().toISOString(),
    criteriaSet: setResult.data,
    version: versionResult.data,
    sourceDocument: documentResult.data,
    tubularSpec,
    rules: rulesResult.data,
  };
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
    else if (field.kind === "yesno") cleaned[key] = normalizeDtiYesNo(raw);
    else if (field.kind === "calculated") cleaned[key] = null;
    else if (field.kind === "number") cleaned[key] = raw === "" || raw === null || raw === undefined ? null : Number(raw);
    else cleaned[key] = clean(raw);
    if (field.kind === "number" && cleaned[key] !== null && !Number.isFinite(cleaned[key])) throw new Error(`${field.label} must be a valid number.`);
  }
  cleaned.boxPassComplete = source.boxPassComplete === true;
  cleaned.pinPassComplete = source.pinPassComplete === true;
  cleaned.emiProveUp = source.emiProveUp === true;
  cleaned.emiProveUpId = validUuid(clean(source.emiProveUpId)) ? clean(source.emiProveUpId) : "";
  if (componentType === "Drill Pipe") cleaned.percentNominalWall = calculatePercentNominalWall(cleaned);
  return cleaned;
}

async function syncLinkedEmiProveUp(admin: ReturnType<typeof configuredSupabase>, reportId: string, savedItem: Row, loadedProveUps: Row[], actorId: string) {
  let rowData = object(savedItem.row_data);
  const linkedId = clean(rowData.emiProveUpId);
  let linked = validUuid(linkedId) ? loadedProveUps.find((item) => clean(item.id) === linkedId) ?? null : null;

  if (rowData.emiProveUp === true) {
    const jointNumber = clean(rowData.jointNumber) || String(savedItem.sequence_number);
    const serialNumber = clean(rowData.serialNumber) || null;
    if (linked) {
      if (clean(linked.joint_number) !== jointNumber || clean(linked.serial_number) !== clean(serialNumber)) {
        const updatePayload = { joint_number: jointNumber, serial_number: serialNumber, updated_by: actorId };
        let updated = await admin.from("titan_dti_emi_prove_ups").update(updatePayload).eq("id", linked.id).eq("report_id", reportId).select("*").single();
        if (updated.error && legacyRowTrigger(updated.error)) updated = await replaceLegacyTriggeredRow(admin, "titan_dti_emi_prove_ups", linked, updatePayload);
        if (updated.error) throw updated.error;
        await logEvent(admin, reportId, "EMI Prove-Up", clean(linked.id), "Updated", linked, updated.data, actorId);
        linked = updated.data;
      }
    } else {
      const latest = await admin.from("titan_dti_emi_prove_ups").select("sequence_number").eq("report_id", reportId).order("sequence_number", { ascending: false }).limit(1).maybeSingle();
      if (latest.error) throw latest.error;
      const payload = { report_id: reportId, sequence_number: Number(latest.data?.sequence_number ?? 0) + 1, joint_number: jointNumber, serial_number: serialNumber, updated_by: actorId, created_by: actorId };
      const created = await admin.from("titan_dti_emi_prove_ups").insert(payload).select("*").single();
      if (created.error) throw created.error;
      const createdData = created.data as Row;
      linked = createdData;
      await logEvent(admin, reportId, "EMI Prove-Up", clean(createdData.id), "Created", null, createdData, actorId);
    }
    if (!linked) throw new Error("TITAN could not link the EMI prove-up to this joint.");
    rowData = { ...rowData, emiProveUp: true, emiProveUpId: clean(linked.id) };
  } else {
    if (linked) {
      const deleted = await admin.from("titan_dti_emi_prove_ups").delete().eq("id", linked.id).eq("report_id", reportId);
      if (deleted.error) throw deleted.error;
      await logEvent(admin, reportId, "EMI Prove-Up", clean(linked.id), "Deleted", linked, null, actorId);
    }
    rowData = { ...rowData, emiProveUp: false, emiProveUpId: "" };
  }

  if (clean(object(savedItem.row_data).emiProveUpId) !== clean(rowData.emiProveUpId)) {
    const payload = { row_data: rowData, updated_by: actorId };
    let updated = await admin.from("titan_dti_inspection_items").update(payload).eq("id", savedItem.id).eq("report_id", reportId).select("*").single();
    if (updated.error && legacyRowTrigger(updated.error)) updated = await replaceLegacyTriggeredRow(admin, "titan_dti_inspection_items", savedItem, payload);
    if (updated.error) throw updated.error;
  }
}

async function syncInspectionRowCount(admin: ReturnType<typeof configuredSupabase>, reportId: string, componentType: DtiComponentType, requestedCount: number, loadedItems: Row[], actorId: string, nominalWall: number | null = null) {
  const componentItems = loadedItems.filter((item) => clean(item.component_type) === componentType);
  const plan = planDtiInspectionRowCount(componentItems.map((item) => Number(item.sequence_number)), requestedCount);
  const surplusSet = new Set(plan.surplusSequences);
  const surplus = componentItems.filter((item) => surplusSet.has(Number(item.sequence_number)));
  if (surplus.length) {
    await removeInspectionPhotos(admin, reportId, surplus.map((item) => clean(item.id)));
    const linkedIds = surplus.map((item) => clean(object(item.row_data).emiProveUpId)).filter(validUuid);
    if (linkedIds.length) {
      const linked = await admin.from("titan_dti_emi_prove_ups").select("*").eq("report_id", reportId).in("id", linkedIds);
      if (linked.error) throw linked.error;
      const deletedLinks = await admin.from("titan_dti_emi_prove_ups").delete().eq("report_id", reportId).in("id", linkedIds);
      if (deletedLinks.error) throw deletedLinks.error;
      for (const proveUp of linked.data ?? []) await logEvent(admin, reportId, "EMI Prove-Up", clean(proveUp.id), "Deleted", proveUp, null, actorId);
    }
    const { error } = await admin.from("titan_dti_inspection_items").delete().eq("report_id", reportId).in("id", surplus.map((item) => clean(item.id)));
    if (error) throw error;
  }

  const missingRows = plan.missingSequences.map((sequenceNumber) => ({
      report_id: reportId,
      component_type: componentType,
      sequence_number: sequenceNumber,
      row_data: cleanRowData(componentType, { jointNumber: String(sequenceNumber), ...(componentType === "Drill Pipe" && nominalWall ? { nominalWallThickness: nominalWall } : {}) }),
      created_by: actorId,
      updated_by: actorId,
    }));
  if (missingRows.length) {
    const { error } = await admin.from("titan_dti_inspection_items").insert(missingRows);
    if (error) throw error;
  }

  if (surplus.length || missingRows.length) {
    await logEvent(admin, reportId, componentType, null, "Row Count Changed", { count: componentItems.length }, { count: requestedCount }, actorId);
  }
}

async function saveItemGrade(admin: ReturnType<typeof configuredSupabase>, report: Row, item: Row, actorId: string) {
  const snapshot = object(report.criteria_snapshot) as DtiCriteriaSnapshot;
  const result = report.criteria_version_id ? evaluateDtiCriteria(object(item.row_data), snapshot) : null;
  const payload = {
    grading_result: result,
    graded_at: result?.gradedAt ?? null,
    grading_criteria_version_id: result?.criteriaVersionId || null,
    updated_by: actorId,
  };
  let saved = await admin.from("titan_dti_inspection_items").update(payload).eq("id", item.id).eq("report_id", report.id).select("*").single();
  if (saved.error && legacyRowTrigger(saved.error)) saved = await replaceLegacyTriggeredRow(admin, "titan_dti_inspection_items", item, payload);
  if (saved.error) throw saved.error;
}

async function gradeReportItems(admin: ReturnType<typeof configuredSupabase>, report: Row, items: Row[], actorId: string, itemId?: string | null) {
  const hasInspectionData = (item: Row) => Object.entries(object(item.row_data)).some(([key, value]) =>
    !["jointNumber", "serialNumber", "description", "nominalWallThickness", "percentNominalWall", "emiProveUpId"].includes(key)
    && value !== null && value !== undefined && value !== "" && value !== false,
  );
  const targets = itemId
    ? items.filter((item) => clean(item.id) === itemId)
    : items.filter((item) => item.grading_result || hasInspectionData(item));
  for (let start = 0; start < targets.length; start += 50) {
    await Promise.all(targets.slice(start, start + 50).map((item) => saveItemGrade(admin, report, item, actorId)));
  }
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase(); const authorization = await authorize(request, admin); if ("error" in authorization) return authorization.error;
    const reportId = clean(new URL(request.url).searchParams.get("reportId"));
    if (reportId) {
      if (!validUuid(reportId)) return Response.json({ error: "Select a valid inspection report." }, { status: 400 });
      const [data, criteriaVersions] = await Promise.all([loadReport(admin, reportId), loadPublishedCriteriaOptions(admin)]); return data ? Response.json({ ok: true, ...data, criteriaVersions }) : Response.json({ error: "Inspection report not found." }, { status: 404 });
    }
    const [reports, jobs, criteriaVersions] = await Promise.all([
      admin.from("titan_dti_inspection_reports").select("*").neq("status", "Archived").order("report_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      admin.from("titan_jobs").select("id,job_number,title,customer_name,rig_name,lifecycle_status").ilike("service_line", "DTI").order("created_at", { ascending: false }).limit(500),
      loadPublishedCriteriaOptions(admin),
    ]);
    if (reports.error) throw reports.error; if (jobs.error) throw jobs.error;
    return Response.json({ ok: true, reports: reports.data ?? [], jobs: jobs.data ?? [], criteriaVersions });
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
      if (!isDtiComponentType(componentType)) return Response.json({ error: "Select Drill Pipe, HWDP, or BHA for this report." }, { status: 400 });
      if (jobId && !validUuid(jobId)) return Response.json({ error: "Select a valid connected job or leave it blank." }, { status: 400 });
      const { data, error } = await admin.from("titan_dti_inspection_reports").insert({ job_id: jobId || null, operator_name: operatorName, contractor_name: clean(body.contractorName) || null, rig_number: clean(body.rigNumber) || null, report_date: reportDate, field_invoice: clean(body.fieldInvoice) || null, inspection_crew: clean(body.inspectionCrew) || null, connection_size: clean(body.connectionSize) || null, connection_type: clean(body.connectionType) || null, grade: clean(body.grade) || null, state: clean(body.state) || null, inspection_scope: { reportComponentType: componentType }, status: "Draft", created_by: authorization.userId, updated_by: authorization.userId }).select("*").single();
      if (error) throw error; reportId = data.id; await logEvent(admin, reportId, "Report", reportId, "Created", null, data, authorization.userId);
      return Response.json({ ok: true, ...(await loadReport(admin, reportId)) });
    }

    if (!validUuid(reportId)) return Response.json({ error: "Select a valid inspection report." }, { status: 400 });
    const loaded = await loadReport(admin, reportId); if (!loaded) return Response.json({ error: "Inspection report not found." }, { status: 404 });
    const reportComponentType = resolveDtiReportComponentType(object(loaded.report.inspection_scope), loaded.items);
    let gradingTargetId = "";

    if (action === "save-report") {
      const status = clean(body.status); const reportDate = clean(body.reportDate); const operatorName = clean(body.operatorName); const jointCount = whole(body.jointCount);
      if (!operatorName || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !["Draft", "In Progress", "Complete"].includes(status)) return Response.json({ error: "Complete the operator, report date, and status." }, { status: 400 });
      if (!Number.isInteger(jointCount) || jointCount < 0 || jointCount > 2000) return Response.json({ error: "Joint count must be a whole number from 0 to 2,000." }, { status: 400 });
      const criteriaVersionId = clean(body.criteriaVersionId);
      const supportsCriteria = Object.prototype.hasOwnProperty.call(loaded.report, "criteria_version_id") || Boolean(criteriaVersionId);
      const sameCriteriaVersion = criteriaVersionId && criteriaVersionId === clean(loaded.report.criteria_version_id);
      const reusableSnapshot = sameCriteriaVersion && loaded.report.criteria_snapshot && (reportComponentType !== "Drill Pipe" || snapshotNominalWall(loaded.report.criteria_snapshot));
      const criteriaSnapshot = reusableSnapshot
        ? loaded.report.criteria_snapshot
        : criteriaVersionId ? await loadCriteriaSnapshot(admin, criteriaVersionId, reportComponentType) : null;
      const payload = { operator_name: operatorName, contractor_name: clean(body.contractorName) || null, rig_number: clean(body.rigNumber) || null, report_date: reportDate, field_invoice: clean(body.fieldInvoice) || null, inspection_crew: clean(body.inspectionCrew) || null, connection_size: clean(body.connectionSize) || null, connection_type: clean(body.connectionType) || null, grade: clean(body.grade) || null, state: clean(body.state) || null, inspection_scope: { ...object(body.inspectionScope), reportComponentType }, machine_shop: object(body.machineShop), remarks: object(body.remarks), status, completed_at: status === "Complete" ? new Date().toISOString() : null, updated_by: authorization.userId, ...(supportsCriteria ? { criteria_version_id: criteriaVersionId || null, criteria_snapshot: criteriaSnapshot } : {}) };
      const { data, error } = await admin.from("titan_dti_inspection_reports").update(payload).eq("id", reportId).select("*").single(); if (error) throw error;
      await logEvent(admin, reportId, "Report", reportId, loaded.report.status === status ? "Updated" : "Status Changed", loaded.report, data, authorization.userId);
      await syncInspectionRowCount(admin, reportId, reportComponentType, jointCount, loaded.items, authorization.userId, snapshotNominalWall(criteriaSnapshot));
    } else if (action === "delete-report") {
      const { data, error } = await admin.from("titan_dti_inspection_reports").update({ status: "Archived", updated_by: authorization.userId }).eq("id", reportId).select("*").single(); if (error) throw error;
      await logEvent(admin, reportId, "Report", reportId, "Deleted", loaded.report, data, authorization.userId); return Response.json({ ok: true, archived: true });
    } else if (action === "save-item") {
      const componentType = clean(body.componentType) as DtiComponentType; const sequenceNumber = whole(body.sequenceNumber); const itemId = clean(body.itemId);
      if (!(componentType in dtiInspectionFields) || sequenceNumber < 1) return Response.json({ error: "Select a component type and valid sequence number." }, { status: 400 });
      if (componentType !== reportComponentType) return Response.json({ error: `This is a ${dtiComponentLabel(reportComponentType)} report. Create a separate ${dtiComponentLabel(componentType)} report.` }, { status: 400 });
      const nominalWall = componentType === "Drill Pipe" ? snapshotNominalWall(loaded.report.criteria_snapshot) : null;
      const rowData = cleanRowData(componentType, { ...object(body.rowData), ...(nominalWall ? { nominalWallThickness: nominalWall } : {}) }); let prior: Row | null = null;
      if (validUuid(itemId)) { const result = await admin.from("titan_dti_inspection_items").select("*").eq("id", itemId).eq("report_id", reportId).maybeSingle(); if (result.error) throw result.error; prior = result.data; }
      if (!prior) { const result = await admin.from("titan_dti_inspection_items").select("*").eq("report_id", reportId).eq("component_type", componentType).eq("sequence_number", sequenceNumber).maybeSingle(); if (result.error) throw result.error; prior = result.data; }
      const payload = { report_id: reportId, component_type: componentType, sequence_number: sequenceNumber, row_data: rowData, updated_by: authorization.userId };
      let result = prior ? await admin.from("titan_dti_inspection_items").update(payload).eq("id", prior.id).select("*").single() : await admin.from("titan_dti_inspection_items").insert({ ...payload, created_by: authorization.userId }).select("*").single();
      if (prior && result.error && legacyRowTrigger(result.error)) result = await replaceLegacyTriggeredRow(admin, "titan_dti_inspection_items", prior, payload);
      if (result.error) throw result.error; gradingTargetId = clean(result.data.id); await logEvent(admin, reportId, componentType, result.data.id, prior ? "Updated" : "Created", prior, result.data, authorization.userId);
      await syncLinkedEmiProveUp(admin, reportId, result.data, loaded.proveUps, authorization.userId);
    } else if (action === "delete-item") {
      const itemId = clean(body.itemId); if (!validUuid(itemId)) return Response.json({ error: "Select a valid inspection row." }, { status: 400 });
      const prior = loaded.items.find((item) => item.id === itemId); if (!prior) return Response.json({ error: "Inspection row not found." }, { status: 404 });
      const linkedProveUpId = clean(object(prior.row_data).emiProveUpId);
      const linkedProveUp = validUuid(linkedProveUpId) ? loaded.proveUps.find((item) => clean(item.id) === linkedProveUpId) : null;
      if (linkedProveUp) {
        const linkedDelete = await admin.from("titan_dti_emi_prove_ups").delete().eq("id", linkedProveUpId).eq("report_id", reportId); if (linkedDelete.error) throw linkedDelete.error;
        await logEvent(admin, reportId, "EMI Prove-Up", linkedProveUpId, "Deleted", linkedProveUp, null, authorization.userId);
      }
      await removeInspectionPhotos(admin, reportId, [itemId]);
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
      const linkedItem = loaded.items.find((item) => clean(object(item.row_data).emiProveUpId) === proveUpId);
      if (linkedItem) {
        const payload = { row_data: { ...object(linkedItem.row_data), emiProveUp: false, emiProveUpId: "" }, updated_by: authorization.userId };
        let updated = await admin.from("titan_dti_inspection_items").update(payload).eq("id", linkedItem.id).eq("report_id", reportId).select("*").single();
        if (updated.error && legacyRowTrigger(updated.error)) updated = await replaceLegacyTriggeredRow(admin, "titan_dti_inspection_items", linkedItem, payload);
        if (updated.error) throw updated.error;
      }
    } else return Response.json({ error: "Unsupported inspection report action." }, { status: 400 });

    let refreshed = await loadReport(admin, reportId);
    let gradingWarning = "";
    if (refreshed && ["save-report", "save-item"].includes(action)) {
      try {
        await gradeReportItems(admin, refreshed.report, refreshed.items, authorization.userId, action === "save-item" ? gradingTargetId : null);
        refreshed = await loadReport(admin, reportId);
      } catch (gradingError) {
        console.error("DTI automatic classification failed", gradingError);
        gradingWarning = gradingMigrationMissing(gradingError)
          ? "The inspection was saved, but automatic classification needs the Phase 2 database update."
          : "The inspection was saved, but TITAN could not update the automatic classification.";
      }
    }
    let alertWarning = "";
    if (refreshed && ["save-report", "save-item", "delete-item"].includes(action)) {
      try {
        await evaluateDtiThresholdAlerts({
          admin,
          report: refreshed.report,
          items: refreshed.items,
          actorId: authorization.userId,
        });
      } catch (alertError) {
        console.error("DTI inspection threshold alert evaluation failed", alertError);
        alertWarning = "The inspection was saved, but TITAN could not evaluate the DBR/repair alert. Check the threshold-alert setup.";
      }
    }

    return Response.json({ ok: true, ...refreshed, ...(gradingWarning ? { gradingWarning } : {}), ...(alertWarning ? { alertWarning } : {}) });
  } catch (error) {
    console.error("DTI inspection report mutation failed", error);
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_inspection_reports.sql before using Inspection Reports." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
