import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const SOURCE_DOCUMENT_NUMBER = "DS-1-V3-E5-2020";
const DEFAULT_PDF = "C:\\Users\\Wade Wisenor\\OneDrive - Pathfinder Inspections\\Desktop\\Ds1.pdf";
const MANAGED_PREFIX = "DS-1 Premium |";
const BATCH_SIZE = 200;

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function ascii(value) {
  return String(value ?? "").replace(/[™®]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
}

function cleanNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
}

function chunks(values, size = BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function allRows(admin, table, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const result = await configure(admin.from(table).select("*")).range(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) break;
  }
  return rows;
}

async function insertReturning(admin, table, rows) {
  const saved = [];
  for (const batch of chunks(rows)) {
    const result = await admin.from(table).insert(batch).select("*");
    if (result.error) throw result.error;
    saved.push(...(result.data ?? []));
  }
  return saved;
}

async function insertOnly(admin, table, rows, batchSize = BATCH_SIZE) {
  for (const batch of chunks(rows, batchSize)) {
    const result = await admin.from(table).insert(batch);
    if (result.error) throw result.error;
  }
}

function extractCatalog(pdfPath) {
  const python = option("--python", process.env.CODEX_PYTHON || "python");
  const extractor = path.join(process.cwd(), "scripts", "extract-ds1-nwdp.py");
  const result = spawnSync(python, [extractor, pdfPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `DS-1 extraction failed with exit code ${result.status}.`);
  return JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
}

function rule(name, fieldKey, fieldLabel, inspectionArea, comparison, minimumValue, maximumValue, resultClassification, sourceTable) {
  const limit = comparison === "Minimum" ? `below ${minimumValue}` : comparison === "Maximum" ? `above ${maximumValue}` : `outside ${minimumValue}-${maximumValue}`;
  return {
    rule_name: name,
    field_key: fieldKey,
    field_label: fieldLabel,
    inspection_area: inspectionArea,
    comparison,
    value_unit: fieldKey === "percentNominalWall" ? "Percent" : fieldKey === "odGage" ? "Yes/No" : "Inches",
    minimum_value: minimumValue,
    maximum_value: maximumValue,
    expected_value: fieldKey === "odGage" ? "Yes" : null,
    result_classification: resultClassification,
    reason: `Measurement is ${limit}; does not meet DS-1 Fifth Edition Volume 3 Table ${sourceTable}.`,
    is_active: true,
  };
}

function minimum(name, key, label, area, value, result, table) {
  return cleanNumber(value) === null ? [] : [rule(name, key, label, area, "Minimum", cleanNumber(value), null, result, table)];
}

function maximum(name, key, label, area, value, result, table) {
  return cleanNumber(value) === null ? [] : [rule(name, key, label, area, "Maximum", null, cleanNumber(value), result, table)];
}

function range(name, key, label, area, min, max, result, table) {
  return cleanNumber(min) === null || cleanNumber(max) === null ? [] : [rule(name, key, label, area, "Range", cleanNumber(min), cleanNumber(max), result, table)];
}

function tubeRules(tube) {
  if (!tube) return [];
  return [
    { ...rule("OD gauge acceptance", "odGage", "OD Gauge", "Tube", "Equals", null, null, "DBR", "3.6.1"), reason: "OD gauge must be Yes to meet the controlled DS-1 tube acceptance criteria." },
    ...minimum("Premium remaining wall", "percentNominalWall", "% of Nominal Wall", "Tube", Number((tube.premiumMinWall / tube.nominalWall * 100).toFixed(4)), "Class 2", "3.6.1"),
    ...minimum("Class 2 remaining wall", "percentNominalWall", "% of Nominal Wall", "Tube", Number((tube.class2MinWall / tube.nominalWall * 100).toFixed(4)), "DBR", "3.6.1"),
  ];
}

function connectionRules(record) {
  const v = record.values;
  const t = record.sourceTable;
  if (record.schema === "api" || record.schema === "api_class2") {
    const premium = record.schema === "api" ? 4 : 0;
    const class2 = record.schema === "api" ? 8 : 4;
    const tail = record.schema === "api" ? 12 : 8;
    return [
      ...minimum("Premium box OD", "boxOd", "Box OD", "Box", v[premium], "Class 2", t),
      ...minimum("Class 2 box OD", "boxOd", "Box OD", "Box", v[class2], "DBR", t),
      ...maximum("Premium pin ID", "pinId", "Pin ID", "Pin", v[premium + 1], "Class 2", t),
      ...maximum("Class 2 pin ID", "pinId", "Pin ID", "Pin", v[class2 + 1], "DBR", t),
      ...minimum("Premium box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", v[premium + 2], "Class 2", t),
      ...minimum("Class 2 box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", v[class2 + 2], "DBR", t),
      ...minimum("Premium pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", v[premium + 2], "Class 2", t),
      ...minimum("Class 2 pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", v[class2 + 2], "DBR", t),
      ...minimum("Premium seal width", "sealWidth", "Seal Width", "Tool Joint", v[premium + 3], "Class 2", t),
      ...minimum("Class 2 seal width", "sealWidth", "Seal Width", "Tool Joint", v[class2 + 3], "DBR", t),
      ...minimum("Minimum pin tong space", "pinTongSpace", "Pin Tong Space", "Pin", v[tail], "DBR", t),
      ...minimum("Minimum box tong space", "boxTongSpace", "Box Tong Space", "Box", v[tail + 1], "DBR", t),
      ...maximum("Maximum box counterbore diameter", "counterboreDiameter", "Counterbore Diameter", "Box", v[tail + 2], "DBR", t),
      ...maximum("Maximum box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", v[tail + 3], "DBR", t),
      ...maximum("Maximum pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", v[tail + 3], "DBR", t),
    ];
  }
  if (record.schema === "wedge") return [
    ...range("Box OD range", "boxOd", "Box OD", "Box", v[0], v[1], "DBR", t),
    ...maximum("Maximum pin ID", "pinId", "Pin ID", "Pin", v[2], "DBR", t),
    ...minimum("Minimum pin tong space", "pinTongSpace", "Pin Tong Space", "Pin", v[3], "DBR", t),
    ...minimum("Minimum box tong space", "boxTongSpace", "Box Tong Space", "Box", v[4], "DBR", t),
    ...maximum("Maximum box counterbore diameter D1", "counterboreDiameter", "Counterbore Diameter", "Box", v[5], "DBR", t),
  ];
  if (record.schema === "reduced_tsr") return [
    ...maximum("Maximum pin ID", "pinId", "Pin ID", "Pin", v[0], "DBR", t),
    ...minimum("Minimum box OD", "boxOd", "Box OD", "Box", v[1], "DBR", t),
    ...minimum("Minimum seal width", "sealWidth", "Seal Width", "Tool Joint", v[2], "DBR", t),
    ...minimum("Minimum box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", v[3], "DBR", t),
    ...minimum("Minimum pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", v[3], "DBR", t),
    ...minimum("Minimum pin tong space", "pinTongSpace", "Pin Tong Space", "Pin", v[4], "DBR", t),
    ...minimum("Minimum box tong space", "boxTongSpace", "Box Tong Space", "Box", v[5], "DBR", t),
    ...maximum("Maximum box counterbore diameter", "counterboreDiameter", "Counterbore Diameter", "Box", v[6], "DBR", t),
    ...maximum("Maximum box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", v[7], "DBR", t),
    ...maximum("Maximum pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", v[7], "DBR", t),
  ];

  if (["3.7.21", "3.7.22", "3.7.23", "3.7.24"].includes(t)) return [
    ...minimum("Minimum box OD", "boxOd", "Box OD", "Box", v[0], "DBR", t), ...maximum("Maximum pin ID", "pinId", "Pin ID", "Pin", v[1], "DBR", t),
    ...range("Box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", v[3], v[4], "DBR", t), ...range("Pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", v[3], v[4], "DBR", t),
    ...range("Pin connection length", "pinCriticalLength", "Pin Critical Length", "Pin", v[5], v[6], "DBR", t), ...range("Pin nose diameter", "pinNoseDiameter", "Pin Nose Diameter", "Pin", v[7], v[8], "DBR", t),
    ...range("Box counterbore diameter", "counterboreDiameter", "Counterbore Diameter", "Box", v[9], v[10], "DBR", t), ...range("Box connection length", "boxCriticalLength", "Box Critical Length", "Box", v[11], v[12], "DBR", t),
    ...minimum("Minimum pin tong space", "pinTongSpace", "Pin Tong Space", "Pin", v[13], "DBR", t), ...minimum("Minimum box tong space", "boxTongSpace", "Box Tong Space", "Box", v[14], "DBR", t),
  ];
  if (t === "3.7.25") return [
    ...minimum("Minimum box OD", "boxOd", "Box OD", "Box", v[0], "DBR", t), ...maximum("Maximum pin ID", "pinId", "Pin ID", "Pin", v[1], "DBR", t),
    ...range("Box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", v[4], v[3], "DBR", t), ...range("Pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", v[4], v[3], "DBR", t),
    ...range("Pin connection length", "pinCriticalLength", "Pin Critical Length", "Pin", v[6], v[5], "DBR", t), ...range("Pin nose diameter", "pinNoseDiameter", "Pin Nose Diameter", "Pin", v[8], v[7], "DBR", t),
    ...range("Box counterbore diameter", "counterboreDiameter", "Counterbore Diameter", "Box", v[10], v[9], "DBR", t), ...range("Box connection length", "boxCriticalLength", "Box Critical Length", "Box", v[12], v[11], "DBR", t),
    ...minimum("Minimum pin tong space", "pinTongSpace", "Pin Tong Space", "Pin", v[13], "DBR", t), ...minimum("Minimum box tong space", "boxTongSpace", "Box Tong Space", "Box", v[14], "DBR", t),
  ];

  const hilong = ["3.7.16", "3.7.17", "3.7.18", "3.7.19"].includes(t);
  const tm2 = t === "3.7.12";
  const short = ["3.7.4", "3.7.7", "3.7.10", "3.7.11", "3.7.14"].includes(t);
  const pinLength = hilong ? [10, 9] : [8, 7];
  const pinNose = hilong ? [12, 11] : tm2 ? [null, 9] : short ? [null, 9] : [10, 9];
  const cbore = hilong ? [14, 13] : tm2 ? [null, 10] : short ? [11, 10] : [12, 11];
  const boxLength = hilong ? [16, 15] : tm2 ? [12, 11] : short ? [13, 12] : [14, 13];
  return [
    ...minimum("Minimum box OD", "boxOd", "Box OD", "Box", v[1], "DBR", t),
    ...minimum("Minimum pin tong space", "pinTongSpace", "Pin Tong Space", "Pin", v[3], "DBR", t), ...minimum("Minimum box tong space", "boxTongSpace", "Box Tong Space", "Box", v[4], "DBR", t),
    ...range("Box bevel diameter", "boxBevelDiameter", "Box Bevel Diameter", "Box", v[6], v[5], "DBR", t), ...range("Pin bevel diameter", "pinBevelDiameter", "Pin Bevel Diameter", "Pin", v[6], v[5], "DBR", t),
    ...range("Pin connection length", "pinCriticalLength", "Pin Critical Length", "Pin", v[pinLength[0]], v[pinLength[1]], "DBR", t),
    ...(pinNose[0] === null ? maximum("Maximum pin nose diameter", "pinNoseDiameter", "Pin Nose Diameter", "Pin", v[pinNose[1]], "DBR", t) : range("Pin nose diameter", "pinNoseDiameter", "Pin Nose Diameter", "Pin", v[pinNose[0]], v[pinNose[1]], "DBR", t)),
    ...(cbore[0] === null ? maximum("Maximum box counterbore diameter", "counterboreDiameter", "Counterbore Diameter", "Box", v[cbore[1]], "DBR", t) : range("Box counterbore diameter", "counterboreDiameter", "Counterbore Diameter", "Box", v[cbore[0]], v[cbore[1]], "DBR", t)),
    ...range("Box connection length", "boxCriticalLength", "Box Critical Length", "Box", v[boxLength[0]], v[boxLength[1]], "DBR", t),
  ];
}

function catalogManifests(catalog) {
  const tubes = new Map(catalog.tubes.map((tube) => [`${tube.pipeSize}|${tube.weightPpf}`, tube]));
  return catalog.connections.map((source) => {
    const record = { ...source, connection: ascii(source.connection), family: ascii(source.family) };
    const tube = tubes.get(`${record.pipeSize}|${record.weightPpf}`) ?? null;
    const rules = [...tubeRules(tube), ...connectionRules(record)].map((item, index) => ({ ...item, display_order: index + 1 }));
    const name = `${MANAGED_PREFIX} ${record.pipeSize} | ${Number(record.weightPpf).toFixed(2)} | ${ascii(record.grade)} | ${record.connection}`;
    const hash = crypto.createHash("sha256").update(JSON.stringify({ record, tube, rules })).digest("hex").slice(0, 16);
    return { name, record, tube, rules, hash };
  });
}

async function ensureSourceDocument(admin) {
  const current = await admin.from("documents").select("*").eq("document_number", SOURCE_DOCUMENT_NUMBER).maybeSingle();
  if (current.error) throw current.error;
  const values = {
    title: "Standard DS-1 Fifth Edition, Volume 3, Drill Stem Inspection", category: "Controlled Standard", department: "DTI",
    issue_date: "2020-08-01", approval_status: "Approved", document_status: "Active", is_customer_visible: false, is_restricted: true,
    document_type: "controlled_standard", file_url: "restricted://DS-1-V3-E5-2020", file_name: "Licensed DS-1 reference - file not distributed by TITAN",
    notes: "Reference metadata only. TITAN does not redistribute the licensed manual. Normal-weight drill-pipe criteria are controlled from DS-1 Fifth Edition, Volume 3, Tables 3.6.1 and 3.7.1 through 3.7.26.",
    updated_at: new Date().toISOString(),
  };
  if (current.data) {
    const saved = await admin.from("documents").update(values).eq("id", current.data.id).select("*").single();
    if (saved.error) throw saved.error;
    return saved.data;
  }
  const owner = await admin.from("documents").select("company_id").not("company_id", "is", null).limit(1).maybeSingle();
  if (owner.error) throw owner.error;
  if (!owner.data?.company_id) throw new Error("TITAN needs an existing controlled document owner before the DS-1 source can be registered.");
  const created = await admin.from("documents").insert({ ...values, document_number: SOURCE_DOCUMENT_NUMBER, company_id: owner.data.company_id }).select("*").single();
  if (created.error) throw created.error;
  return created.data;
}

async function preload(admin, manifests, sourceDocumentId) {
  const now = new Date().toISOString();
  const existingSets = await allRows(admin, "titan_dti_criteria_sets", (query) => query.is("archived_at", null));
  const byName = new Map(existingSets.map((item) => [`${item.component_type}|${item.name.toLowerCase()}`, item]));
  const missingSets = manifests.filter((item) => !byName.has(`Drill Pipe|${item.name.toLowerCase()}`)).map((item) => ({
    name: item.name, standard_type: "DS-1", component_type: "Drill Pipe", customer_name: null,
    description: `${item.record.family || "API"} normal-weight drill pipe. DS-1 Table ${item.record.sourceTable}. Premium acceptance preset.`, updated_at: now,
  }));
  for (const item of await insertReturning(admin, "titan_dti_criteria_sets", missingSets)) byName.set(`Drill Pipe|${item.name.toLowerCase()}`, item);

  const allVersions = await allRows(admin, "titan_dti_criteria_versions");
  const versionsBySet = new Map();
  for (const version of allVersions) {
    const list = versionsBySet.get(version.criteria_set_id) ?? [];
    list.push(version); versionsBySet.set(version.criteria_set_id, list);
  }
  const pending = [];
  let unchanged = 0;
  for (const manifest of manifests) {
    const set = byName.get(`Drill Pipe|${manifest.name.toLowerCase()}`);
    const versions = versionsBySet.get(set.id) ?? [];
    if (versions.some((version) => version.status === "Published" && String(version.notes ?? "").includes(`catalog-hash:${manifest.hash}`))) { unchanged += 1; continue; }
    if (versions.some((version) => version.status === "Draft")) throw new Error(`${manifest.name} has an editable draft. Publish or remove it before rerunning the controlled preload.`);
    pending.push({ manifest, set, versionNumber: Math.max(0, ...versions.map((version) => Number(version.version_number))) + 1 });
  }
  const createdVersions = await insertReturning(admin, "titan_dti_criteria_versions", pending.map(({ manifest, set, versionNumber }) => ({
    criteria_set_id: set.id, version_number: versionNumber, status: "Draft", effective_date: "2020-08-01", source_document_id: sourceDocumentId,
    notes: `Managed DS-1 normal-weight drill-pipe catalog. Source Table ${manifest.record.sourceTable}. catalog-hash:${manifest.hash}`,
  })));
  const versionBySet = new Map(createdVersions.map((version) => [version.criteria_set_id, version]));
  const ruleRows = [];
  for (const { manifest, set } of pending) {
    const version = versionBySet.get(set.id);
    for (const item of manifest.rules) ruleRows.push({ ...item, criteria_version_id: version.id });
  }
  await insertOnly(admin, "titan_dti_criteria_rules", ruleRows, 300);
  for (const batch of chunks(pending.map(({ set }) => set.id), 100)) {
    const retired = await admin.from("titan_dti_criteria_versions").update({ status: "Retired", updated_at: now }).in("criteria_set_id", batch).eq("status", "Published");
    if (retired.error) throw retired.error;
  }
  for (const batch of chunks(createdVersions.map((version) => version.id), 100)) {
    const published = await admin.from("titan_dti_criteria_versions").update({ status: "Published", published_at: now, updated_at: now }).in("id", batch);
    if (published.error) throw published.error;
  }
  await insertOnly(admin, "titan_dti_criteria_events", pending.map(({ set }) => {
    const version = versionBySet.get(set.id);
    return { criteria_set_id: set.id, criteria_version_id: version.id, entity_type: "Version", entity_id: version.id, event_type: "Published", before_value: null, after_value: { ...version, status: "Published", published_at: now } };
  }));

  const existingSpecs = await allRows(admin, "titan_dti_tubular_specs", (query) => query.is("archived_at", null));
  const specKey = (value) => `${ascii(value.pipe_size).toLowerCase()}|${Number(value.weight_ppf).toFixed(3)}|${ascii(value.grade).toLowerCase()}|${ascii(value.connection).toLowerCase()}`;
  const existingSpecKeys = new Set(existingSpecs.map(specKey));
  const specRows = manifests.filter(({ record }) => !existingSpecKeys.has(specKey({ pipe_size: record.pipeSize, weight_ppf: record.weightPpf, grade: record.grade, connection: record.connection }))).map(({ record, tube }) => {
    const values = record.values;
    const apiOffset = record.schema === "api" ? 4 : record.schema === "api_class2" ? 0 : null;
    return {
      pipe_size: record.pipeSize, weight_ppf: record.weightPpf, grade: ascii(record.grade), connection: record.connection,
      new_wall_inches: tube?.nominalWall ?? null, premium_min_wall_inches: tube?.premiumMinWall ?? null, class_2_min_wall_inches: tube?.class2MinWall ?? null,
      tj_od_min_premium_inches: apiOffset === null ? (record.schema === "wedge" ? values[0] : values[1] ?? values[0]) : values[apiOffset],
      tj_id_max_inches: apiOffset === null ? (record.schema === "wedge" ? values[2] : values[0] ?? values[1]) : values[apiOffset + 1],
      bevel_diameter_min_inches: apiOffset === null ? null : values[apiOffset + 2], bevel_diameter_max_inches: record.schema === "api" ? values[15] : record.schema === "api_class2" ? values[11] : null,
      tong_space_min_inches: record.schema === "api" ? values[12] : record.schema === "api_class2" ? values[8] : null,
      source_document_id: sourceDocumentId, notes: `DS-1 Table ${record.sourceTable}. ${record.family || "API"} normal-weight drill-pipe preset.`, updated_at: now,
    };
  });
  const createdSpecs = await insertReturning(admin, "titan_dti_tubular_specs", specRows);
  await insertOnly(admin, "titan_dti_tubular_spec_events", createdSpecs.map((spec) => ({ tubular_spec_id: spec.id, event_type: "Created", before_value: null, after_value: spec })));

  const legacy = existingSets.find((item) => item.name === "DS-1 Cat 4 Premium - 5 in 19.50 S-135 NC50" && !item.archived_at);
  if (legacy) {
    const archived = await admin.from("titan_dti_criteria_sets").update({ archived_at: now, updated_at: now }).eq("id", legacy.id);
    if (archived.error) throw archived.error;
  }
  return { createdSets: missingSets.length, publishedVersions: createdVersions.length, unchangedVersions: unchanged, insertedRules: ruleRows.length, createdSpecs: createdSpecs.length };
}

async function main() {
  const pdfPath = option("--pdf", process.env.DS1_PDF_PATH || DEFAULT_PDF);
  if (!fs.existsSync(pdfPath)) throw new Error(`DS-1 manual not found at ${pdfPath}. Pass --pdf with the licensed local file path.`);
  const catalog = extractCatalog(pdfPath);
  const manifests = catalogManifests(catalog);
  const duplicateNames = manifests.length - new Set(manifests.map((item) => item.name.toLowerCase())).size;
  const emptyRules = manifests.filter((item) => item.rules.length === 0).length;
  if (duplicateNames || emptyRules) throw new Error(`Catalog validation failed: ${duplicateNames} duplicate names and ${emptyRules} empty rule sets.`);
  const summary = {
    tubeSizesAndWeights: catalog.tubes.length,
    presets: manifests.length,
    rules: manifests.reduce((sum, item) => sum + item.rules.length, 0),
    sourceTables: [...new Set(catalog.connections.map((item) => item.sourceTable))].sort((a, b) => Number(a.split(".").at(-1)) - Number(b.split(".").at(-1))),
  };
  if (process.argv.includes("--dry-run")) { console.log(JSON.stringify(summary, null, 2)); return; }
  loadEnv(".env"); loadEnv(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const document = await ensureSourceDocument(admin);
  const result = await preload(admin, manifests, document.id);
  console.log(JSON.stringify({ ...summary, ...result }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
