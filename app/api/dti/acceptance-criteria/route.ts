import { createClient } from "@supabase/supabase-js";
import { authorizeDtiAccess } from "../../../../lib/serverDtiAccess";
import { dtiInspectionFields, isDtiComponentType, type DtiComponentType } from "../../../../lib/dtiInspectionReport";

type Body = Record<string, unknown>;
type Row = Record<string, unknown>;

const standards = ["API", "DS-1", "Class 2 Alternate", "Customer"];
const comparisons = ["Minimum", "Maximum", "Range", "Equals", "Required"];
const classifications = ["Premium", "Class 1", "Class 2", "Class 3", "Class 4", "DBR", "NI", "NC"];
const inspectionAreas = ["Tube", "Box", "Pin", "Tool Joint", "Joint"];
const valueUnits = ["Inches", "Percent", "Yes/No", "Count", "Text"];

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function text(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function numberOrNull(value: unknown) { if (value === "" || value === null || value === undefined) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : NaN; }
function whole(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : NaN; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) { const value = lower(errorMessage(error)); return value.includes("titan_dti_criteria") || value.includes("criteria_version_id") || value.includes("schema cache"); }
function phaseTwoMissing(error: unknown) { return lower(errorMessage(error)).includes("value_unit"); }

async function logEvent(admin: ReturnType<typeof adminClient>, values: {
  criteriaSetId: string; criteriaVersionId?: string | null; entityType: string; entityId?: string | null;
  eventType: string; beforeValue?: unknown; afterValue?: unknown; actorId: string;
}) {
  const { error } = await admin.from("titan_dti_criteria_events").insert({
    criteria_set_id: values.criteriaSetId,
    criteria_version_id: values.criteriaVersionId || null,
    entity_type: values.entityType,
    entity_id: values.entityId || null,
    event_type: values.eventType,
    before_value: values.beforeValue ?? null,
    after_value: values.afterValue ?? null,
    actor_id: values.actorId,
  });
  if (error) throw error;
}

async function loadData(admin: ReturnType<typeof adminClient>, versionId = "") {
  const sets: Row[] = [];
  const versions: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await admin.from("titan_dti_criteria_sets").select("*").is("archived_at", null).order("component_type").order("name").range(from, from + 999);
    if (result.error) throw result.error;
    sets.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const result = await admin.from("titan_dti_criteria_versions").select("*").order("version_number", { ascending: false }).range(from, from + 999);
    if (result.error) throw result.error;
    versions.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) break;
  }
  const [rulesResult, documentsResult] = await Promise.all([
    validUuid(versionId)
      ? admin.from("titan_dti_criteria_rules").select("*").eq("criteria_version_id", versionId).order("display_order").order("field_label")
      : Promise.resolve({ data: [] as Row[], error: null }),
    admin.from("documents").select("id,title,document_number,department,approval_status,document_status").limit(2000),
  ]);
  for (const result of [rulesResult, documentsResult]) if (result.error) throw result.error;
  const documents = (documentsResult.data ?? []).filter((document) => {
    const department = lower(document.department).replace(/[^a-z]/g, "");
    const status = lower(document.document_status);
    return lower(document.approval_status) === "approved"
      && ["", "active"].includes(status)
      && ["", "dti", "operations", "all", "company", "companywide"].includes(department);
  });
  return { sets, versions, rules: rulesResult.data ?? [], documents };
}

async function loadVersion(admin: ReturnType<typeof adminClient>, versionId: string) {
  if (!validUuid(versionId)) throw new Error("Select a valid criteria version.");
  const versionResult = await admin.from("titan_dti_criteria_versions").select("*").eq("id", versionId).maybeSingle();
  if (versionResult.error) throw versionResult.error;
  if (!versionResult.data) throw new Error("Criteria version not found.");
  const setResult = await admin.from("titan_dti_criteria_sets").select("*").eq("id", versionResult.data.criteria_set_id).is("archived_at", null).maybeSingle();
  if (setResult.error) throw setResult.error;
  if (!setResult.data) throw new Error("Active criteria set not found.");
  return { version: versionResult.data as Row, criteriaSet: setResult.data as Row };
}

function validateRule(body: Body, componentType: DtiComponentType) {
  const fieldKey = text(body.fieldKey);
  const field = dtiInspectionFields[componentType].find((candidate) => candidate.key === fieldKey);
  const comparison = text(body.comparison);
  const classification = text(body.resultClassification);
  const inspectionArea = text(body.inspectionArea);
  const minimumValue = numberOrNull(body.minimumValue);
  const maximumValue = numberOrNull(body.maximumValue);
  const expectedValue = text(body.expectedValue);
  const valueUnit = text(body.valueUnit);
  if (!text(body.ruleName) || !field) throw new Error("Rule name and a valid inspection field are required.");
  if (!comparisons.includes(comparison) || !classifications.includes(classification) || !inspectionAreas.includes(inspectionArea)) throw new Error("Select valid rule options.");
  if (Number.isNaN(minimumValue) || Number.isNaN(maximumValue)) throw new Error("Rule limits must be valid numbers.");
  if (comparison === "Minimum" && minimumValue === null) throw new Error("Enter the minimum accepted value.");
  if (comparison === "Maximum" && maximumValue === null) throw new Error("Enter the maximum accepted value.");
  if (comparison === "Range" && (minimumValue === null || maximumValue === null || maximumValue < minimumValue)) throw new Error("Enter a valid minimum and maximum range.");
  if (comparison === "Equals" && !expectedValue) throw new Error("Enter the required value.");
  if (!text(body.reason)) throw new Error("A classification reason is required.");
  if (!valueUnits.includes(valueUnit)) throw new Error("Select a valid value unit.");
  return { field, fieldKey, comparison, classification, inspectionArea, minimumValue, maximumValue, expectedValue, valueUnit };
}

export async function GET(request: Request) {
  try {
    const admin = adminClient();
    const authorization = await authorizeDtiAccess(request, admin);
    if ("error" in authorization) return authorization.error;
    const versionId = new URL(request.url).searchParams.get("versionId") || "";
    return Response.json({ ok: true, ...(await loadData(admin, versionId)) });
  } catch (error) {
    return Response.json({ error: phaseTwoMissing(error) ? "Run supabase/titan_dti_automatic_classification.sql before editing Phase 2 criteria." : migrationMissing(error) ? "Run supabase/titan_dti_acceptance_criteria.sql before opening Acceptance Criteria." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = adminClient();
    const authorization = await authorizeDtiAccess(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = await request.json().catch(() => ({})) as Body;
    const action = lower(body.action);

    if (action === "create-set") {
      const name = text(body.name); const standardType = text(body.standardType); const componentType = text(body.componentType); const customerName = text(body.customerName);
      if (!name || !standards.includes(standardType) || !isDtiComponentType(componentType)) return Response.json({ error: "Name, standard, and component type are required." }, { status: 400 });
      if (standardType === "Customer" && !customerName) return Response.json({ error: "Customer name is required for customer criteria." }, { status: 400 });
      const createdSet = await admin.from("titan_dti_criteria_sets").insert({ name, standard_type: standardType, component_type: componentType, customer_name: customerName || null, description: text(body.description) || null, created_by: authorization.userId, updated_by: authorization.userId }).select("*").single();
      if (createdSet.error) throw createdSet.error;
      const createdVersion = await admin.from("titan_dti_criteria_versions").insert({ criteria_set_id: createdSet.data.id, version_number: 1, status: "Draft", created_by: authorization.userId, updated_by: authorization.userId }).select("*").single();
      if (createdVersion.error) { await admin.from("titan_dti_criteria_sets").delete().eq("id", createdSet.data.id); throw createdVersion.error; }
      await logEvent(admin, { criteriaSetId: createdSet.data.id, criteriaVersionId: createdVersion.data.id, entityType: "Criteria Set", entityId: createdSet.data.id, eventType: "Created", afterValue: createdSet.data, actorId: authorization.userId });
    } else if (action === "update-set") {
      const setId = text(body.setId); if (!validUuid(setId)) return Response.json({ error: "Select a valid criteria set." }, { status: 400 });
      const prior = await admin.from("titan_dti_criteria_sets").select("*").eq("id", setId).is("archived_at", null).single(); if (prior.error) throw prior.error;
      const name = text(body.name); const standardType = text(body.standardType); const customerName = text(body.customerName);
      if (!name || !standards.includes(standardType) || (standardType === "Customer" && !customerName)) return Response.json({ error: "Complete the criteria set information." }, { status: 400 });
      const saved = await admin.from("titan_dti_criteria_sets").update({ name, standard_type: standardType, customer_name: customerName || null, description: text(body.description) || null, updated_by: authorization.userId, updated_at: new Date().toISOString() }).eq("id", setId).select("*").single(); if (saved.error) throw saved.error;
      await logEvent(admin, { criteriaSetId: setId, entityType: "Criteria Set", entityId: setId, eventType: "Updated", beforeValue: prior.data, afterValue: saved.data, actorId: authorization.userId });
    } else if (action === "create-version") {
      const setId = text(body.setId); if (!validUuid(setId)) return Response.json({ error: "Select a valid criteria set." }, { status: 400 });
      const existingDraft = await admin.from("titan_dti_criteria_versions").select("id").eq("criteria_set_id", setId).eq("status", "Draft").maybeSingle(); if (existingDraft.error) throw existingDraft.error;
      if (existingDraft.data) return Response.json({ error: "This criteria set already has an editable draft." }, { status: 409 });
      const latest = await admin.from("titan_dti_criteria_versions").select("*").eq("criteria_set_id", setId).order("version_number", { ascending: false }).limit(1).maybeSingle(); if (latest.error) throw latest.error;
      if (!latest.data) return Response.json({ error: "Criteria set has no version to continue." }, { status: 409 });
      const created = await admin.from("titan_dti_criteria_versions").insert({ criteria_set_id: setId, version_number: Number(latest.data.version_number) + 1, status: "Draft", effective_date: latest.data.effective_date, source_document_id: latest.data.source_document_id, notes: latest.data.notes, created_by: authorization.userId, updated_by: authorization.userId }).select("*").single(); if (created.error) throw created.error;
      const priorRules = await admin.from("titan_dti_criteria_rules").select("*").eq("criteria_version_id", latest.data.id).order("display_order"); if (priorRules.error) throw priorRules.error;
      if ((priorRules.data ?? []).length) {
        const copies = (priorRules.data ?? []).map((rule) => ({
          criteria_version_id: created.data.id, rule_name: rule.rule_name, field_key: rule.field_key,
          field_label: rule.field_label, inspection_area: rule.inspection_area, comparison: rule.comparison,
          minimum_value: rule.minimum_value, maximum_value: rule.maximum_value, expected_value: rule.expected_value,
          value_unit: rule.value_unit,
          result_classification: rule.result_classification, reason: rule.reason, display_order: rule.display_order,
          is_active: rule.is_active, created_by: authorization.userId, updated_by: authorization.userId,
        }));
        const copied = await admin.from("titan_dti_criteria_rules").insert(copies); if (copied.error) throw copied.error;
      }
      await logEvent(admin, { criteriaSetId: setId, criteriaVersionId: created.data.id, entityType: "Version", entityId: created.data.id, eventType: "Created", afterValue: created.data, actorId: authorization.userId });
    } else if (action === "save-version") {
      const versionId = text(body.versionId); const loaded = await loadVersion(admin, versionId);
      if (loaded.version.status !== "Draft") return Response.json({ error: "Published and retired criteria versions cannot be edited." }, { status: 409 });
      const sourceDocumentId = text(body.sourceDocumentId); if (sourceDocumentId && !validUuid(sourceDocumentId)) return Response.json({ error: "Select a valid source document." }, { status: 400 });
      const saved = await admin.from("titan_dti_criteria_versions").update({ effective_date: text(body.effectiveDate) || null, source_document_id: sourceDocumentId || null, notes: text(body.notes) || null, updated_by: authorization.userId, updated_at: new Date().toISOString() }).eq("id", versionId).select("*").single(); if (saved.error) throw saved.error;
      await logEvent(admin, { criteriaSetId: text(loaded.criteriaSet.id), criteriaVersionId: versionId, entityType: "Version", entityId: versionId, eventType: "Updated", beforeValue: loaded.version, afterValue: saved.data, actorId: authorization.userId });
    } else if (action === "save-rule") {
      const versionId = text(body.versionId); const loaded = await loadVersion(admin, versionId);
      if (loaded.version.status !== "Draft") return Response.json({ error: "Only draft criteria rules can be edited." }, { status: 409 });
      const componentType = text(loaded.criteriaSet.component_type) as DtiComponentType;
      const checked = validateRule(body, componentType); const ruleId = text(body.ruleId); const displayOrder = whole(body.displayOrder);
      const payload = { criteria_version_id: versionId, rule_name: text(body.ruleName), field_key: checked.fieldKey, field_label: checked.field.label, inspection_area: checked.inspectionArea, comparison: checked.comparison, minimum_value: checked.minimumValue, maximum_value: checked.maximumValue, expected_value: checked.expectedValue || null, value_unit: checked.valueUnit, result_classification: checked.classification, reason: text(body.reason), display_order: Number.isInteger(displayOrder) ? displayOrder : 0, is_active: body.isActive !== false, updated_by: authorization.userId, updated_at: new Date().toISOString() };
      let prior: Row | null = null; let saved;
      if (validUuid(ruleId)) { const result = await admin.from("titan_dti_criteria_rules").select("*").eq("id", ruleId).eq("criteria_version_id", versionId).single(); if (result.error) throw result.error; prior = result.data; saved = await admin.from("titan_dti_criteria_rules").update(payload).eq("id", ruleId).select("*").single(); }
      else saved = await admin.from("titan_dti_criteria_rules").insert({ ...payload, created_by: authorization.userId }).select("*").single();
      if (saved.error) throw saved.error;
      await logEvent(admin, { criteriaSetId: text(loaded.criteriaSet.id), criteriaVersionId: versionId, entityType: "Rule", entityId: saved.data.id, eventType: prior ? "Updated" : "Created", beforeValue: prior, afterValue: saved.data, actorId: authorization.userId });
    } else if (action === "delete-rule") {
      const versionId = text(body.versionId); const ruleId = text(body.ruleId); const loaded = await loadVersion(admin, versionId);
      if (loaded.version.status !== "Draft" || !validUuid(ruleId)) return Response.json({ error: "Select an editable draft rule." }, { status: 409 });
      const prior = await admin.from("titan_dti_criteria_rules").select("*").eq("id", ruleId).eq("criteria_version_id", versionId).single(); if (prior.error) throw prior.error;
      const deleted = await admin.from("titan_dti_criteria_rules").delete().eq("id", ruleId); if (deleted.error) throw deleted.error;
      await logEvent(admin, { criteriaSetId: text(loaded.criteriaSet.id), criteriaVersionId: versionId, entityType: "Rule", entityId: ruleId, eventType: "Deleted", beforeValue: prior.data, actorId: authorization.userId });
    } else if (action === "publish-version") {
      const versionId = text(body.versionId); const loaded = await loadVersion(admin, versionId);
      if (loaded.version.status !== "Draft") return Response.json({ error: "Only a draft version can be published." }, { status: 409 });
      if (!validUuid(text(loaded.version.source_document_id))) return Response.json({ error: "Select an approved source document before publishing." }, { status: 400 });
      const document = await admin.from("documents").select("id,approval_status,document_status").eq("id", loaded.version.source_document_id).single(); if (document.error) throw document.error;
      if (lower(document.data.approval_status) !== "approved" || !["", "active"].includes(lower(document.data.document_status))) return Response.json({ error: "The source document must be approved and active." }, { status: 400 });
      const ruleCount = await admin.from("titan_dti_criteria_rules").select("id", { count: "exact", head: true }).eq("criteria_version_id", versionId).eq("is_active", true); if (ruleCount.error) throw ruleCount.error;
      if (!ruleCount.count) return Response.json({ error: "Add at least one active rule before publishing." }, { status: 400 });
      const retired = await admin.from("titan_dti_criteria_versions").update({ status: "Retired", updated_by: authorization.userId, updated_at: new Date().toISOString() }).eq("criteria_set_id", loaded.criteriaSet.id).eq("status", "Published"); if (retired.error) throw retired.error;
      const saved = await admin.from("titan_dti_criteria_versions").update({ status: "Published", published_at: new Date().toISOString(), published_by: authorization.userId, updated_by: authorization.userId, updated_at: new Date().toISOString() }).eq("id", versionId).select("*").single(); if (saved.error) throw saved.error;
      await logEvent(admin, { criteriaSetId: text(loaded.criteriaSet.id), criteriaVersionId: versionId, entityType: "Version", entityId: versionId, eventType: "Published", beforeValue: loaded.version, afterValue: saved.data, actorId: authorization.userId });
    } else if (action === "archive-set") {
      const setId = text(body.setId); if (!validUuid(setId)) return Response.json({ error: "Select a valid criteria set." }, { status: 400 });
      const prior = await admin.from("titan_dti_criteria_sets").select("*").eq("id", setId).is("archived_at", null).single(); if (prior.error) throw prior.error;
      const saved = await admin.from("titan_dti_criteria_sets").update({ archived_at: new Date().toISOString(), archived_by: authorization.userId, updated_by: authorization.userId, updated_at: new Date().toISOString() }).eq("id", setId).select("*").single(); if (saved.error) throw saved.error;
      await logEvent(admin, { criteriaSetId: setId, entityType: "Criteria Set", entityId: setId, eventType: "Archived", beforeValue: prior.data, afterValue: saved.data, actorId: authorization.userId });
    } else return Response.json({ error: "Unsupported acceptance criteria action." }, { status: 400 });

    return Response.json({ ok: true, ...(await loadData(admin, text(body.versionId))) });
  } catch (error) {
    return Response.json({ error: phaseTwoMissing(error) ? "Run supabase/titan_dti_automatic_classification.sql before editing Phase 2 criteria." : migrationMissing(error) ? "Run supabase/titan_dti_acceptance_criteria.sql before changing Acceptance Criteria." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
