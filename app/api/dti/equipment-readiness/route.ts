import { createClient } from "@supabase/supabase-js";
import { titanEquipmentAssets } from "../../../../lib/titanEquipmentAssets";
import { buildDtiEquipmentReadiness, dtiEquipmentRequirements } from "../../../../lib/dtiEquipmentReadiness";

type TitanProfile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
type Row = Record<string, unknown>;
type RequestBody = Record<string, unknown>;

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase(); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) {
  const message = normalized(errorMessage(error));
  return message.includes("titan_dti_job_equipment") || message.includes("titan_equipment_calibrations") || message.includes("requires_calibration") || message.includes("schema cache");
}

async function authorizeWade(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !data) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const profile = data as TitanProfile;
  const identity = normalized(profile.email || userData.user.email).replace(/[^a-z0-9]/g, "");
  if (profile.is_disabled || (normalized(profile.full_name) !== "wade wisenor" && identity !== "wadepathfinderinspectionscom")) {
    return { error: Response.json({ error: "DTI equipment readiness is currently restricted to Wade." }, { status: 403 }) };
  }
  return { userId: userData.user.id };
}

async function syncBuiltInAssets(admin: ReturnType<typeof configuredSupabase>) {
  const rows = titanEquipmentAssets.map((asset) => ({
    source_key: asset.id,
    equipment_name: asset.name,
    equipment_number: asset.assetTag || asset.unitNumber || asset.name,
    equipment_type: asset.equipmentType,
    department: asset.department,
    current_assignment: asset.currentAssignment || null,
    is_active: asset.isActive !== false,
  }));
  const { error } = await admin.from("equipment_assets").upsert(rows, { onConflict: "source_key", ignoreDuplicates: true });
  if (error) throw error;
}

async function loadJob(admin: ReturnType<typeof configuredSupabase>, jobId: string) {
  const { data, error } = await admin.from("titan_jobs").select("id,job_number,title,service_line,lifecycle_status,customer_name,rig_name,scheduled_start,job_type,job_description,source_snapshot").eq("id", jobId).maybeSingle();
  if (error) throw error;
  if (!data || normalized(data.service_line) !== "dti") return null;
  return data as Row;
}

async function loadData(admin: ReturnType<typeof configuredSupabase>, job: Row) {
  const [assetsResult, assignmentsResult, calibrationsResult, documentsResult] = await Promise.all([
    admin.from("equipment_assets").select("*").eq("is_active", true).order("equipment_type").order("equipment_name").limit(2000),
    admin.from("titan_dti_job_equipment").select("*").eq("job_id", clean(job.id)).order("created_at"),
    admin.from("titan_equipment_calibrations").select("*").order("calibrated_on", { ascending: false }).order("created_at", { ascending: false }).limit(3000),
    admin.from("documents").select("id,document_number,title,department,approval_status,document_status,status,expiration_date").limit(2000),
  ]);
  if (assetsResult.error) throw assetsResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (calibrationsResult.error) throw calibrationsResult.error;
  if (documentsResult.error) throw documentsResult.error;
  const assets = (assetsResult.data ?? []) as Row[];
  const assignments = (assignmentsResult.data ?? []) as Row[];
  const calibrations = (calibrationsResult.data ?? []) as Row[];
  const documents = ((documentsResult.data ?? []) as Row[]).filter((document) => {
    const department = normalized(document.department);
    const status = normalized(document.document_status || document.status);
    return normalized(document.approval_status) === "approved" && ["", "dti", "operations", "all", "company", "company-wide"].includes(department) && ["", "active", "expiring soon"].includes(status);
  });
  return { assets, calibrations, documents, readiness: buildDtiEquipmentReadiness(job, assignments, assets, calibrations) };
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;
    const jobId = clean(new URL(request.url).searchParams.get("jobId"));
    if (!validUuid(jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 });
    const job = await loadJob(admin, jobId);
    if (!job) return Response.json({ error: "This DTI job could not be found." }, { status: 404 });
    await syncBuiltInAssets(admin);
    return Response.json({ ok: true, job, requirements: dtiEquipmentRequirements, ...await loadData(admin, job) });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_equipment_readiness.sql before using Equipment Readiness." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = await request.json().catch(() => ({})) as RequestBody;
    const action = normalized(body.action);
    const jobId = clean(body.jobId);
    if (!validUuid(jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 });
    const job = await loadJob(admin, jobId);
    if (!job) return Response.json({ error: "This DTI job could not be found." }, { status: 404 });
    await syncBuiltInAssets(admin);

    if (action === "save-asset") {
      const assetId = clean(body.assetId);
      const equipmentName = clean(body.equipmentName);
      const equipmentNumber = clean(body.equipmentNumber);
      const equipmentType = clean(body.equipmentType);
      if (!equipmentName || !equipmentNumber || !equipmentType) return Response.json({ error: "Equipment name, number, and type are required." }, { status: 400 });
      const payload = { equipment_name: equipmentName, equipment_number: equipmentNumber, equipment_type: equipmentType, serial_number: clean(body.serialNumber) || null, department: "DTI", requires_calibration: body.requiresCalibration === true, calibration_frequency_days: Number(body.calibrationFrequencyDays) > 0 ? Number(body.calibrationFrequencyDays) : null, is_active: true };
      const query = validUuid(assetId) ? admin.from("equipment_assets").update(payload).eq("id", assetId) : admin.from("equipment_assets").insert(payload);
      const { error } = await query;
      if (error) throw error;
    } else if (action === "assign") {
      const assetId = clean(body.assetId);
      const requirement = dtiEquipmentRequirements.find((item) => item.code === clean(body.requirementCode));
      const status = clean(body.verificationStatus);
      if (!requirement || !validUuid(assetId)) return Response.json({ error: "Select a requirement and equipment asset." }, { status: 400 });
      if (!["Assigned", "Verified", "Out of Service"].includes(status)) return Response.json({ error: "Select a valid verification status." }, { status: 400 });
      const { error } = await admin.from("titan_dti_job_equipment").upsert({ job_id: jobId, requirement_code: requirement.code, requirement_label: requirement.label, equipment_asset_id: assetId, is_required: body.isRequired !== false, verification_status: status, notes: clean(body.notes) || null, verified_at: status === "Verified" ? new Date().toISOString() : null, verified_by: status === "Verified" ? authorization.userId : null, created_by: authorization.userId, updated_by: authorization.userId }, { onConflict: "job_id,requirement_code,equipment_asset_id" });
      if (error) throw error;
    } else if (action === "remove-assignment") {
      const assignmentId = clean(body.assignmentId);
      if (!validUuid(assignmentId)) return Response.json({ error: "Select a valid equipment assignment." }, { status: 400 });
      const { error } = await admin.from("titan_dti_job_equipment").delete().eq("id", assignmentId).eq("job_id", jobId);
      if (error) throw error;
    } else if (action === "calibrate") {
      const assetId = clean(body.assetId);
      const calibratedOn = clean(body.calibratedOn);
      const expiresOn = clean(body.expiresOn);
      const result = clean(body.result);
      if (!validUuid(assetId) || !/^\d{4}-\d{2}-\d{2}$/.test(calibratedOn) || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || expiresOn < calibratedOn) return Response.json({ error: "Enter valid calibration and expiration dates." }, { status: 400 });
      if (!["Pass", "Fail"].includes(result)) return Response.json({ error: "Select Pass or Fail for the calibration result." }, { status: 400 });
      const documentId = clean(body.certificateDocumentId);
      if (documentId && !validUuid(documentId)) return Response.json({ error: "Select a valid calibration certificate." }, { status: 400 });
      const { error } = await admin.from("titan_equipment_calibrations").insert({ equipment_asset_id: assetId, calibration_type: clean(body.calibrationType) || "Calibration / Verification", calibrated_on: calibratedOn, expires_on: expiresOn, result, performed_by_name: clean(body.performedByName) || null, certificate_document_id: documentId || null, certificate_name: clean(body.certificateName) || null, notes: clean(body.notes) || null, created_by: authorization.userId });
      if (error) throw error;
    } else return Response.json({ error: "Select a valid equipment action." }, { status: 400 });

    return Response.json({ ok: true, ...await loadData(admin, job) });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_equipment_readiness.sql before saving Equipment Readiness." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
