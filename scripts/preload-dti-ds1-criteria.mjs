import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const SOURCE_DOCUMENT_NUMBER = "DS-1-V3-E5-2020";
const CRITERIA_SET_NAME = "DS-1 Cat 4 Premium - 5 in 19.50 S-135 NC50";

const sourceDocument = {
  document_number: SOURCE_DOCUMENT_NUMBER,
  title: "Standard DS-1 Fifth Edition, Volume 3, Drill Stem Inspection",
  category: "Controlled Standard",
  department: "DTI",
  issue_date: "2020-08-01",
  approval_status: "Approved",
  document_status: "Active",
  notes: "Reference metadata only. TITAN does not redistribute the licensed manual. Criteria were verified against DS-1 Fifth Edition, Volume 3, Tables 3.5.1, 3.6.1, and 3.7.1.",
  is_customer_visible: false,
  is_restricted: true,
  document_type: "controlled_standard",
  file_url: "restricted://DS-1-V3-E5-2020",
  file_name: "Licensed DS-1 reference - file not distributed by TITAN",
};

const tubularSpec = {
  pipe_size: "5",
  weight_ppf: 19.5,
  grade: "S-135",
  connection: "NC50",
  new_wall_inches: 0.362,
  premium_min_wall_inches: 0.29,
  class_2_min_wall_inches: 0.253,
  tj_od_min_premium_inches: 6.3125,
  tj_id_max_inches: 3.4063,
  bevel_diameter_min_inches: 5.9531,
  bevel_diameter_max_inches: 6.0781,
  tong_space_min_inches: 4.7188,
  notes: "DS-1 Cat 4 / Premium. Pin tong minimum is 4.71875 in; box tong minimum is 6.125 in. Class 2 and DBR boundaries are held in the published acceptance criteria version.",
};

const rules = [
  rule("OD gauge acceptance", "odGage", "OD Gauge", "Tube", "Equals", null, null, "Yes", "Yes/No", "DBR", "OD gauge result does not meet the controlled DS-1 acceptance limits in Table 3.6.1."),
  rule("Premium remaining wall", "percentNominalWall", "% of Nominal Wall", "Tube", "Minimum", 80, null, null, "Percent", "Class 2", "Remaining wall is below the DS-1 Premium minimum of 80% in Tables 3.5.1 and 3.6.1."),
  rule("Class 2 remaining wall", "percentNominalWall", "% of Nominal Wall", "Tube", "Minimum", 70, null, null, "Percent", "DBR", "Remaining wall is below the DS-1 Class 2 minimum of 70% in Tables 3.5.1 and 3.6.1."),
  rule("Premium box OD", "boxOd", "Box OD", "Box", "Minimum", 6.3125, null, null, "Inches", "Class 2", "Box OD is below the DS-1 Premium minimum for 5 in, 19.50 lb/ft, S-135, NC50 in Table 3.7.1."),
  rule("Class 2 box OD", "boxOd", "Box OD", "Box", "Minimum", 6.1875, null, null, "Inches", "DBR", "Box OD is below the DS-1 Class 2 minimum for 5 in, 19.50 lb/ft, S-135, NC50 in Table 3.7.1."),
  rule("Premium pin ID", "pinId", "Pin ID", "Pin", "Maximum", null, 3.40625, null, "Inches", "Class 2", "Pin ID exceeds the DS-1 Premium maximum for 5 in, 19.50 lb/ft, S-135, NC50 in Table 3.7.1."),
  rule("Class 2 pin ID", "pinId", "Pin ID", "Pin", "Maximum", null, 3.625, null, "Inches", "DBR", "Pin ID exceeds the DS-1 Class 2 maximum for 5 in, 19.50 lb/ft, S-135, NC50 in Table 3.7.1."),
  rule("Premium box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", "Minimum", 5.953125, null, null, "Inches", "Class 2", "Box bevel diameter is below the DS-1 Premium minimum in Table 3.7.1."),
  rule("Class 2 box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", "Minimum", 5.875, null, null, "Inches", "DBR", "Box bevel diameter is below the DS-1 Class 2 minimum in Table 3.7.1."),
  rule("Maximum box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", "Maximum", null, 6.078125, null, "Inches", "DBR", "Box bevel diameter exceeds the DS-1 maximum in Table 3.7.1."),
  rule("Premium pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", "Minimum", 5.953125, null, null, "Inches", "Class 2", "Pin bevel diameter is below the DS-1 Premium minimum in Table 3.7.1."),
  rule("Class 2 pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", "Minimum", 5.875, null, null, "Inches", "DBR", "Pin bevel diameter is below the DS-1 Class 2 minimum in Table 3.7.1."),
  rule("Maximum pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", "Maximum", null, 6.078125, null, "Inches", "DBR", "Pin bevel diameter exceeds the DS-1 maximum in Table 3.7.1."),
  rule("Minimum box tong space", "boxTongSpace", "Box Tong Space", "Box", "Minimum", 6.125, null, null, "Inches", "DBR", "Box tong space is below the DS-1 minimum in Table 3.7.1."),
  rule("Minimum pin tong space", "pinTongSpace", "Pin Tong Space", "Pin", "Minimum", 4.71875, null, null, "Inches", "DBR", "Pin tong space is below the DS-1 minimum in Table 3.7.1."),
  rule("Maximum box counterbore diameter", "counterboreDiameter", "Counterbore Diameter", "Box", "Maximum", null, 5.375, null, "Inches", "DBR", "Box counterbore diameter exceeds the DS-1 maximum in Table 3.7.1."),
];

function rule(ruleName, fieldKey, fieldLabel, inspectionArea, comparison, minimumValue, maximumValue, expectedValue, valueUnit, resultClassification, reason) {
  return { ruleName, fieldKey, fieldLabel, inspectionArea, comparison, minimumValue, maximumValue, expectedValue, valueUnit, resultClassification, reason };
}

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function canonicalRule(value) {
  const minimumValue = value.minimum_value ?? value.minimumValue ?? null;
  const maximumValue = value.maximum_value ?? value.maximumValue ?? null;
  return JSON.stringify({
    rule_name: value.rule_name ?? value.ruleName,
    field_key: value.field_key ?? value.fieldKey,
    field_label: value.field_label ?? value.fieldLabel,
    inspection_area: value.inspection_area ?? value.inspectionArea,
    comparison: value.comparison,
    minimum_value: minimumValue === null ? null : Number(minimumValue),
    maximum_value: maximumValue === null ? null : Number(maximumValue),
    expected_value: value.expected_value ?? value.expectedValue ?? null,
    value_unit: value.value_unit ?? value.valueUnit,
    result_classification: value.result_classification ?? value.resultClassification,
    reason: value.reason,
  });
}

function validateManifest() {
  const allowedFields = new Set(["odGage", "percentNominalWall", "boxOd", "pinId", "boxBevelDiameter", "pinBevelDiameter", "boxTongSpace", "pinTongSpace", "counterboreDiameter"]);
  const signatures = new Set();
  for (const [index, item] of rules.entries()) {
    if (!allowedFields.has(item.fieldKey)) throw new Error(`Rule ${index + 1} uses an unsupported report field.`);
    const signature = `${item.fieldKey}|${item.comparison}|${item.minimumValue}|${item.maximumValue}|${item.expectedValue}`;
    if (signatures.has(signature)) throw new Error(`Rule ${index + 1} duplicates an earlier boundary.`);
    signatures.add(signature);
  }
}

async function ensureSourceDocument(admin) {
  const existing = await admin.from("documents").select("*").eq("document_number", SOURCE_DOCUMENT_NUMBER).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const updated = await admin.from("documents").update({ ...sourceDocument, updated_at: new Date().toISOString() }).eq("id", existing.data.id).select("*").single();
    if (updated.error) throw updated.error;
    return updated.data;
  }
  const owner = await admin.from("documents").select("company_id").eq("department", "DTI").not("company_id", "is", null).limit(1).maybeSingle();
  if (owner.error) throw owner.error;
  if (!owner.data?.company_id) throw new Error("TITAN does not have an existing DTI document owner for the controlled DS-1 reference.");
  const created = await admin.from("documents").insert({ ...sourceDocument, company_id: owner.data.company_id }).select("*").single();
  if (created.error) throw created.error;
  return created.data;
}

async function ensureTubularSpec(admin, sourceDocumentId) {
  const existing = await admin.from("titan_dti_tubular_specs").select("*")
    .eq("pipe_size", tubularSpec.pipe_size).eq("weight_ppf", tubularSpec.weight_ppf)
    .ilike("grade", tubularSpec.grade).ilike("connection", tubularSpec.connection).is("archived_at", null).maybeSingle();
  if (existing.error) throw existing.error;
  const payload = { ...tubularSpec, source_document_id: sourceDocumentId, updated_at: new Date().toISOString() };
  if (existing.data) {
    const unchanged = Object.entries({ ...tubularSpec, source_document_id: sourceDocumentId }).every(([key, value]) => {
      const current = existing.data[key];
      return typeof value === "number" ? Number(current) === value : current === value;
    });
    if (unchanged) return existing.data;
    const saved = await admin.from("titan_dti_tubular_specs").update({ ...payload, row_version: Number(existing.data.row_version ?? 1) + 1 }).eq("id", existing.data.id).select("*").single();
    if (saved.error) throw saved.error;
    const event = await admin.from("titan_dti_tubular_spec_events").insert({ tubular_spec_id: saved.data.id, event_type: "Updated", before_value: existing.data, after_value: saved.data });
    if (event.error) throw event.error;
    return saved.data;
  }
  const created = await admin.from("titan_dti_tubular_specs").insert(payload).select("*").single();
  if (created.error) throw created.error;
  const event = await admin.from("titan_dti_tubular_spec_events").insert({ tubular_spec_id: created.data.id, event_type: "Created", before_value: null, after_value: created.data });
  if (event.error) throw event.error;
  return created.data;
}

async function ensureAuditHistory(admin, criteriaSet, version, spec) {
  const specEvents = await admin.from("titan_dti_tubular_spec_events").select("id", { count: "exact", head: true }).eq("tubular_spec_id", spec.id).eq("event_type", "Created");
  if (specEvents.error) throw specEvents.error;
  if (!specEvents.count) {
    const inserted = await admin.from("titan_dti_tubular_spec_events").insert({ tubular_spec_id: spec.id, event_type: "Created", before_value: null, after_value: spec });
    if (inserted.error) throw inserted.error;
  }

  const criteriaEvents = await admin.from("titan_dti_criteria_events").select("id", { count: "exact", head: true }).eq("criteria_version_id", version.id).eq("event_type", "Published");
  if (criteriaEvents.error) throw criteriaEvents.error;
  if (!criteriaEvents.count) {
    const inserted = await admin.from("titan_dti_criteria_events").insert({
      criteria_set_id: criteriaSet.id,
      criteria_version_id: version.id,
      entity_type: "Version",
      entity_id: version.id,
      event_type: "Published",
      before_value: null,
      after_value: version,
    });
    if (inserted.error) throw inserted.error;
  }
}

async function ensureCriteriaSet(admin) {
  const existing = await admin.from("titan_dti_criteria_sets").select("*").eq("name", CRITERIA_SET_NAME).eq("component_type", "Drill Pipe").is("archived_at", null).maybeSingle();
  if (existing.error) throw existing.error;
  const payload = {
    name: CRITERIA_SET_NAME,
    standard_type: "DS-1",
    component_type: "Drill Pipe",
    customer_name: null,
    description: "Controlled DS-1 Cat 4 / Premium criteria for 5 in, 19.50 lb/ft, S-135 drill pipe with NC50 connections.",
    updated_at: new Date().toISOString(),
  };
  if (existing.data) {
    const saved = await admin.from("titan_dti_criteria_sets").update(payload).eq("id", existing.data.id).select("*").single();
    if (saved.error) throw saved.error;
    return saved.data;
  }
  const created = await admin.from("titan_dti_criteria_sets").insert(payload).select("*").single();
  if (created.error) throw created.error;
  return created.data;
}

async function ensurePublishedVersion(admin, criteriaSet, sourceDocumentId) {
  const versions = await admin.from("titan_dti_criteria_versions").select("*").eq("criteria_set_id", criteriaSet.id).order("version_number", { ascending: false });
  if (versions.error) throw versions.error;
  for (const version of versions.data ?? []) {
    if (version.status !== "Published") continue;
    const existingRules = await admin.from("titan_dti_criteria_rules").select("*").eq("criteria_version_id", version.id).eq("is_active", true).order("display_order");
    if (existingRules.error) throw existingRules.error;
    const existing = (existingRules.data ?? []).map(canonicalRule);
    const expected = rules.map(canonicalRule);
    if (existing.length === expected.length && existing.every((value, index) => value === expected[index])) return { version, changed: false };
    if (process.argv.includes("--debug")) {
      const differenceIndex = Math.max(0, expected.findIndex((value, index) => value !== existing[index]));
      console.error(JSON.stringify({ version: version.version_number, differenceIndex, existing: existing[differenceIndex], expected: expected[differenceIndex] }, null, 2));
      throw new Error("Controlled preload differs from the published version.");
    }
  }

  if ((versions.data ?? []).some((version) => version.status === "Draft")) {
    throw new Error(`${CRITERIA_SET_NAME} has an editable draft. Publish or remove that draft before rerunning the controlled preload.`);
  }

  const versionNumber = Math.max(0, ...(versions.data ?? []).map((version) => Number(version.version_number))) + 1;
  const created = await admin.from("titan_dti_criteria_versions").insert({
    criteria_set_id: criteriaSet.id,
    version_number: versionNumber,
    status: "Draft",
    effective_date: "2020-08-01",
    source_document_id: sourceDocumentId,
    notes: "DS-1 Fifth Edition, Volume 3. Tube limits: Tables 3.5.1 and 3.6.1. NC50 S-grade tool-joint limits: Table 3.7.1. Category 4 controls the inspection program; Premium controls acceptance limits.",
  }).select("*").single();
  if (created.error) throw created.error;

  const rows = rules.map((item, index) => ({
    criteria_version_id: created.data.id,
    rule_name: item.ruleName,
    field_key: item.fieldKey,
    field_label: item.fieldLabel,
    inspection_area: item.inspectionArea,
    comparison: item.comparison,
    minimum_value: item.minimumValue,
    maximum_value: item.maximumValue,
    expected_value: item.expectedValue,
    value_unit: item.valueUnit,
    result_classification: item.resultClassification,
    reason: item.reason,
    display_order: index + 1,
    is_active: true,
  }));
  const inserted = await admin.from("titan_dti_criteria_rules").insert(rows);
  if (inserted.error) throw inserted.error;

  const now = new Date().toISOString();
  const retired = await admin.from("titan_dti_criteria_versions").update({ status: "Retired", updated_at: now }).eq("criteria_set_id", criteriaSet.id).eq("status", "Published");
  if (retired.error) throw retired.error;
  const published = await admin.from("titan_dti_criteria_versions").update({ status: "Published", published_at: now, updated_at: now }).eq("id", created.data.id).select("*").single();
  if (published.error) throw published.error;
  return { version: published.data, changed: true };
}

async function main() {
  validateManifest();
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ sourceDocument, tubularSpec, criteriaSet: CRITERIA_SET_NAME, ruleCount: rules.length, rules }, null, 2));
    return;
  }

  loadEnv(".env");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const document = await ensureSourceDocument(admin);
  const spec = await ensureTubularSpec(admin, document.id);
  const criteriaSet = await ensureCriteriaSet(admin);
  const published = await ensurePublishedVersion(admin, criteriaSet, document.id);
  await ensureAuditHistory(admin, criteriaSet, published.version, spec);
  console.log(JSON.stringify({
    ok: true,
    sourceDocument: { id: document.id, documentNumber: document.document_number },
    tubularSpec: { id: spec.id, pipeSize: spec.pipe_size, weightPpf: spec.weight_ppf, grade: spec.grade, connection: spec.connection },
    criteriaSet: { id: criteriaSet.id, name: criteriaSet.name },
    version: { id: published.version.id, versionNumber: published.version.version_number, status: published.version.status, changed: published.changed },
    ruleCount: rules.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
