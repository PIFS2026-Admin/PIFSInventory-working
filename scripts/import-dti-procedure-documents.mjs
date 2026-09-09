import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile(".env"); } catch {}
try { process.loadEnvFile(".env.local"); } catch {}

const defaultSource = String.raw`C:\Users\Wade Wisenor\OneDrive - Pathfinder Inspections\Compass\Procedure docs`;
const sourceDirectory = resolve(process.argv[2] || defaultSource);
const bucket = "document-control";

const records = [
  {
    number: "PFIS-IOM-001", title: "Inspection Operations Manual", category: "SOPs",
    notes: "Current Pathfinder DTI operating manual for drill pipe, tubing, and BHA inspection.",
    versions: ["Pathfinder_IOM_v2 5.26.26.docx", "IOM_final.docx"], currentVersion: 2,
  },
  { number: "OMS-101", title: "Pre-Job Planning and Resource Checklist", category: "Forms", notes: "DTI pre-job scope, crew, equipment, safety, and document readiness checklist.", versions: ["OMS-101_Pre-Job_Planning_and_Resource_Checklist.docx"] },
  { number: "OMS-102", title: "Service Category and Inspection Scope", category: "Training Documents", notes: "DTI quick reference for DS-1 service categories and inspection scope.", versions: ["OMS-102_Service_Category_and_Inspection_Scope.docx"] },
  { number: "OMS-103", title: "Equipment Setup Guide", category: "SOPs", notes: "DTI field equipment and rack setup procedure.", versions: ["OMS-103_Equipment_Setup_Guide.docx"] },
  { number: "OMS-104", title: "Per-Rack Workflow Reference", category: "SOPs", notes: "DTI per-rack inspection workflow and station sequence.", versions: ["OMS-104_Per-Rack_Workflow_Reference.docx"] },
  { number: "OMS-105", title: "Defect Decision Quick Card", category: "Training Documents", notes: "DTI accept, reject, and escalation decision reference for inspection defects.", versions: ["OMS-105_Defect_Decision_Quick_Card.docx"] },
  { number: "OMS-106", title: "Dimensional Inspection Quick Reference", category: "Training Documents", notes: "DTI dimensional inspection reference with connection measurement diagram.", versions: ["OMS-106_Dimensional_Inspection_Quick_Reference (1).docx"] },
  { number: "OMS-107", title: "Connection ID and Refacing Decision Guide", category: "Training Documents", notes: "DTI connection identification and refacing disposition guide.", versions: ["OMS-107_Connection_ID_and_Refacing_Decision_Guide.docx"] },
  { number: "OMS-108", title: "EMI and UT Calibration Quick Card", category: "Training Documents", notes: "DTI field calibration and verification reference for EMI and UT equipment.", versions: ["OMS-108_EMI_and_UT_Calibration_Quick_Card.docx"] },
  { number: "OMS-109", title: "Borderline Escalation Flow Card", category: "Training Documents", notes: "DTI escalation path for borderline inspection conditions and customer decisions.", versions: ["OMS-109_Borderline_Escalation_Flow_Card.docx"] },
  { number: "OMS-201", title: "Field Audit", category: "Forms", notes: "Source field-audit workbook supporting DTI Management audit records.", versions: ["OMS-201_Field_Audit.xlsx"] },
  { number: "OMS-202", title: "Deviation Acceptance and Risk Agreement", category: "Forms", notes: "Source agreement supporting controlled DTI job deviations and written acceptance.", versions: ["OMS-202_Deviation_Acceptance_and_Risk_Agreement.docx"] },
  { number: "OMS-203", title: "Post-Job Debrief and Lessons-Learned Report", category: "Forms", notes: "Source report supporting DTI job debriefs, repeat issues, and lessons learned.", versions: ["OMS-203_Post-Job_Debrief_and_Lessons-Learned_Report.docx"] },
  { number: "DTI-JI-001", title: "DTI Job Intelligence Source Workbook", category: "Other", notes: "Source workbook retained for the TITAN DTI Job Intelligence workflow. Use TITAN for live records.", versions: ["Pathfinder_DTI_Job_Intelligence_Dashboard_v1.xlsx"] },
  { number: "HR-CM-001", title: "Inspector Competency Matrix", category: "Forms", notes: "Source competency matrix and behavioral anchors supporting TITAN Inspector Competency.", versions: ["PFIS_Inspector_Competency_Matrix_v5.xlsx"] },
];

const categoryOrder = new Map([
  ["SOPs", 20], ["Forms", 90], ["Training Documents", 110], ["Other", 120],
]);

function requireConfiguration() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server configuration is missing.");
  }
  if (!existsSync(sourceDirectory)) throw new Error(`Source folder not found: ${sourceDirectory}`);
  for (const record of records) {
    for (const fileName of record.versions) {
      if (!existsSync(join(sourceDirectory, fileName))) throw new Error(`Required file not found: ${fileName}`);
    }
  }
}

function contentType(fileName) {
  return extname(fileName).toLowerCase() === ".xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function safeName(value) { return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-"); }
function hash(buffer) { return createHash("sha256").update(buffer).digest("hex"); }

requireConfiguration();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function ensureBucket() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (data.some((item) => item.id === bucket)) return;
  const { error: createError } = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 20 * 1024 * 1024 });
  if (createError) throw createError;
}

async function ensureCategories() {
  for (const [name, sort_order] of categoryOrder) {
    const { error } = await supabase.from("document_categories").upsert({ name, sort_order, is_active: true }, { onConflict: "name" });
    if (error) throw error;
  }
  const { data, error } = await supabase.from("document_categories").select("id,name").in("name", [...categoryOrder.keys()]);
  if (error) throw error;
  return new Map(data.map((category) => [category.name, category.id]));
}

async function pathfinderCompanyId() {
  const { data, error } = await supabase.from("companies").select("id,name").ilike("name", "Pathfinder").limit(2);
  if (error) throw error;
  const company = data.find((item) => item.name.trim().toLowerCase() === "pathfinder");
  if (!company) throw new Error("The Pathfinder company record was not found.");
  return company.id;
}

async function uploadVersion(record, fileName, versionNumber) {
  const localPath = join(sourceDirectory, fileName);
  const buffer = readFileSync(localPath);
  const digest = hash(buffer);
  const storagePath = `dti/${record.number.toLowerCase()}/v${versionNumber}-${digest.slice(0, 12)}-${safeName(basename(fileName))}`;
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: contentType(fileName), cacheControl: "3600", upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  return { localPath, storagePath, digest, buffer, fileName };
}

async function saveDocument(values) {
  const { data: existing, error: lookupError } = await supabase.from("documents").select("id").eq("document_number", values.document_number).maybeSingle();
  if (lookupError) throw lookupError;
  const request = existing
    ? supabase.from("documents").update(values).eq("id", existing.id)
    : supabase.from("documents").insert(values);
  const { error } = await request;
  if (error) throw error;
}

async function importRecord(record, categoryIds, companyId) {
  const uploaded = [];
  for (let index = 0; index < record.versions.length; index += 1) {
    uploaded.push(await uploadVersion(record, record.versions[index], index + 1));
  }
  const currentVersion = record.currentVersion || uploaded.length;
  const current = uploaded[currentVersion - 1];
  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(current.storagePath);
  await saveDocument({
    company_id: companyId,
    document_number: record.number,
    title: record.title,
    category_id: categoryIds.get(record.category),
    category: record.category,
    department: "DTI",
    renewal_required: false,
    approval_status: "Approved",
    document_status: "Active",
    document_type: "controlled_document",
    file_path: current.storagePath,
    file_url: publicUrl.publicUrl,
    file_name: current.fileName,
    mime_type: contentType(current.fileName),
    file_size: current.buffer.length,
    notes: `${record.notes} Source: Compass Procedure docs. SHA-256: ${current.digest}`,
    is_customer_visible: false,
    is_restricted: false,
  });

  if (record.number === "PFIS-IOM-001" && uploaded.length > 1) {
    const prior = uploaded[0];
    const { data: priorPublicUrl } = supabase.storage.from(bucket).getPublicUrl(prior.storagePath);
    await saveDocument({
      company_id: companyId,
      document_number: "PFIS-IOM-001-LEGACY",
      title: "Inspection Operations Manual Prior Source Version",
      category_id: categoryIds.get(record.category),
      category: record.category,
      department: "DTI",
      renewal_required: false,
      approval_status: "Archived",
      document_status: "Archived",
      document_type: "controlled_document",
      file_path: prior.storagePath,
      file_url: priorPublicUrl.publicUrl,
      file_name: prior.fileName,
      mime_type: contentType(prior.fileName),
      file_size: prior.buffer.length,
      notes: `Prior IOM source retained during controlled import. Source: Compass Procedure docs. SHA-256: ${prior.digest}`,
      is_customer_visible: false,
      is_restricted: true,
    });
  }
  console.log(`Imported ${record.number}: ${record.title} (${uploaded.length} version${uploaded.length === 1 ? "" : "s"})`);
}

await ensureBucket();
const categoryIds = await ensureCategories();
const companyId = await pathfinderCompanyId();
for (const record of records) await importRecord(record, categoryIds, companyId);
console.log(`Imported ${records.length} controlled DTI document records from ${sourceDirectory}`);
