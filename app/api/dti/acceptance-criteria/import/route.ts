import { createClient } from "@supabase/supabase-js";
import { authorizeDtiAccess } from "../../../../../lib/serverDtiAccess";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function text(value: unknown) { return String(value ?? "").trim(); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function object(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }

const importedFields: Record<string, { label: string; area: string; cells: string[] }> = {
  utThickness: { label: "UT Thickness", area: "Tube", cells: ["Criteria Sheet!Z44", "Criteria Sheet!AB44", "Criteria Sheet!AD44"] },
  boxOd: { label: "Box OD", area: "Box", cells: ["Criteria Sheet!Z50", "Criteria Sheet!AB50", "Criteria Sheet!AD50"] },
  boxTongSpace: { label: "Box Tong Space", area: "Box", cells: ["Criteria Sheet!Z56"] },
  pinTongSpace: { label: "Pin Tong Space", area: "Pin", cells: ["Criteria Sheet!Z60"] },
};
const importedClassifications = ["Class 2", "Class 3", "Class 4"];

function validateRules(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new Error("The RTS preview contains an invalid number of rules.");
  const sourceCells = new Set<string>();
  return value.map((candidate, index) => {
    const rule = object(candidate); const fieldKey = text(rule.fieldKey); const field = importedFields[fieldKey];
    const classification = text(rule.resultClassification); const sourceCell = text(rule.sourceCell); const minimumValue = Number(rule.minimumValue);
    if (!field || !importedClassifications.includes(classification) || !field.cells.includes(sourceCell) || sourceCells.has(sourceCell) || !Number.isFinite(minimumValue) || minimumValue <= 0) throw new Error(`Imported rule ${index + 1} is not valid for the RTS template.`);
    sourceCells.add(sourceCell);
    return {
      ruleName: `${field.label} minimum for ${classification}`,
      fieldKey,
      fieldLabel: field.label,
      inspectionArea: field.area,
      minimumValue,
      valueUnit: "Inches",
      resultClassification: classification,
      reason: `${field.label} is below the RTS minimum and is classified ${classification}.`,
      displayOrder: index + 1,
      sourceCell,
    };
  });
}

async function loadDraft(admin: ReturnType<typeof adminClient>, versionId: string) {
  const version = await admin.from("titan_dti_criteria_versions").select("*").eq("id", versionId).maybeSingle();
  if (version.error) throw version.error;
  if (!version.data || version.data.status !== "Draft") throw new Error("Select an editable draft criteria version before importing.");
  const criteriaSet = await admin.from("titan_dti_criteria_sets").select("*").eq("id", version.data.criteria_set_id).is("archived_at", null).maybeSingle();
  if (criteriaSet.error) throw criteriaSet.error;
  if (!criteriaSet.data || criteriaSet.data.component_type !== "Drill Pipe") throw new Error("RTS workbook import currently supports Drill Pipe criteria sets.");
  return { version: version.data as Row, criteriaSet: criteriaSet.data as Row };
}

export async function POST(request: Request) {
  try {
    const admin = adminClient();
    const authorization = await authorizeDtiAccess(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = await request.json().catch(() => ({})) as Row;
    const versionId = text(body.versionId);
    if (!validUuid(versionId)) return Response.json({ error: "Select a valid draft criteria version." }, { status: 400 });
    const loaded = await loadDraft(admin, versionId);
    const preview = object(body.preview);
    if (text(preview.standardType) !== text(loaded.criteriaSet.standard_type)) throw new Error(`The workbook uses ${text(preview.standardType) || "an unknown standard"}, but this criteria set is ${text(loaded.criteriaSet.standard_type)}.`);
    const rules = validateRules(preview.rules);

    const prior = await admin.from("titan_dti_criteria_rules").select("*").eq("criteria_version_id", versionId).order("display_order");
    if (prior.error) throw prior.error;
    const deleted = await admin.from("titan_dti_criteria_rules").delete().eq("criteria_version_id", versionId);
    if (deleted.error) throw deleted.error;
    const rows = rules.map((rule) => ({
      criteria_version_id: versionId,
      rule_name: rule.ruleName,
      field_key: rule.fieldKey,
      field_label: rule.fieldLabel,
      inspection_area: rule.inspectionArea,
      comparison: "Minimum",
      minimum_value: rule.minimumValue,
      maximum_value: null,
      expected_value: null,
      value_unit: rule.valueUnit,
      result_classification: rule.resultClassification,
      reason: rule.reason,
      display_order: rule.displayOrder,
      is_active: true,
      created_by: authorization.userId,
      updated_by: authorization.userId,
    }));
    const inserted = await admin.from("titan_dti_criteria_rules").insert(rows).select("id");
    if (inserted.error) {
      if (prior.data?.length) await admin.from("titan_dti_criteria_rules").insert(prior.data);
      throw inserted.error;
    }
    const event = await admin.from("titan_dti_criteria_events").insert({
      criteria_set_id: loaded.criteriaSet.id,
      criteria_version_id: versionId,
      entity_type: "Version",
      entity_id: versionId,
      event_type: "Updated",
      before_value: { rules: prior.data ?? [] },
      after_value: { importTemplate: text(preview.template), criteriaLabel: text(preview.criteriaLabel), standardType: text(preview.standardType), ruleCount: rows.length, warnings: Array.isArray(preview.warnings) ? preview.warnings.map(text) : [] },
      actor_id: authorization.userId,
    });
    if (event.error) {
      await admin.from("titan_dti_criteria_rules").delete().eq("criteria_version_id", versionId);
      if (prior.data?.length) await admin.from("titan_dti_criteria_rules").insert(prior.data);
      throw event.error;
    }
    return Response.json({ ok: true, imported: rows.length });
  } catch (error) {
    console.error("DTI RTS criteria import failed", error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
