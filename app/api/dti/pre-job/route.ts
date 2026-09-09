import { createClient } from "@supabase/supabase-js";
import { buildDtiEquipmentReadiness } from "../../../../lib/dtiEquipmentReadiness";

type TitanProfile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
type ResponseState = "" | "Complete" | "Needs Attention" | "Blocked" | "N/A";
type ItemResponse = { state: ResponseState; note: string; ownerName: string; dueDate: string };
type SaveBody = { jobId?: unknown; responses?: unknown; action?: unknown };

const checklist = [
  { code: "1.1", section: "Job & Scope Confirmation", text: "Customer name confirmed" },
  { code: "1.2", section: "Job & Scope Confirmation", text: "Location / yard confirmed" },
  { code: "1.3", section: "Job & Scope Confirmation", text: "Job date / shift confirmed" },
  { code: "1.4", section: "Job & Scope Confirmation", text: "Invoice / job number entered in schedule (IOM 14.5.6)" },
  { code: "1.5", section: "Job & Scope Confirmation", text: "Inspection type confirmed: DTI / TU / BHA / RI" },
  { code: "1.6", section: "Job & Scope Confirmation", text: "DS-1 Service Category confirmed (Cat 1-5 / HDLS)" },
  { code: "1.7", section: "Job & Scope Confirmation", text: "Component type / size / grade confirmed" },
  { code: "1.8", section: "Job & Scope Confirmation", text: "Estimated quantity (joints / components) confirmed" },
  { code: "1.9", section: "Job & Scope Confirmation", text: "Customer specifications obtained and reviewed" },
  { code: "1.10", section: "Job & Scope Confirmation", text: "Proprietary / double-shoulder connection requirements and manufacturer drawing confirmed" },
  { code: "1.11", section: "Job & Scope Confirmation", text: "3rd-party monitor requirement confirmed" },
  { code: "2.1", section: "Crew Composition", text: "Crew size matched to job" },
  { code: "2.2", section: "Crew Composition", text: "Crew Lead assigned" },
  { code: "2.3", section: "Crew Composition", text: "Each member competency-verified for assigned tasks (HR-CM-001)" },
  { code: "2.4", section: "Crew Composition", text: "All HIGH-priority competency gaps resolved before assignment" },
  { code: "3.1", section: "Setup & Space Planning", text: "Setup method determined: Side-by-Side or Single Rack" },
  { code: "3.2", section: "Setup & Space Planning", text: "Adequate space and buffer zones confirmed (IOM 6.3)" },
  { code: "3.3", section: "Setup & Space Planning", text: "Loader availability/source confirmed; third-party loader daily inspection" },
  { code: "3.4", section: "Setup & Space Planning", text: "Number of inspection racks confirmed" },
  { code: "4.1", section: "Equipment Manifest", text: "Vedaq 2000 EMI unit and correct buggy heads" },
  { code: "4.2", section: "Equipment Manifest", text: "UT wall thickness gauge and transducer" },
  { code: "4.3", section: "Equipment Manifest", text: "Shear wave unit if required" },
  { code: "4.4", section: "Equipment Manifest", text: "AC yoke / DC coil as required" },
  { code: "4.5", section: "Equipment Manifest", text: "PT kit" },
  { code: "4.6", section: "Equipment Manifest", text: "OD/ID calipers, depth gauge/micrometer, 12-inch rule, pit gauge" },
  { code: "4.7", section: "Equipment Manifest", text: "OD gauge, drift mandrel, thread gauges, pin lead gauge" },
  { code: "4.8", section: "Equipment Manifest", text: "Current certified calibration standards" },
  { code: "4.9", section: "Equipment Manifest", text: "UV/white-light meter, field indicators, centrifuge tube/stand" },
  { code: "4.10", section: "Equipment Manifest", text: "DeWalt wire wheels and Milwaukee soft wheels" },
  { code: "4.11", section: "Equipment Manifest", text: "Pin/box refacers and correct mandrel" },
  { code: "4.12", section: "Equipment Manifest", text: "Hammers, file, grinder, box drill, blower, squares" },
  { code: "4.13", section: "Equipment Manifest", text: "Copper sulfate spray and applicator" },
  { code: "4.14", section: "Equipment Manifest", text: "Samss reface system and connection drawing if anticipated" },
  { code: "4.15", section: "Equipment Manifest", text: "Inspection trailer and power distribution box" },
  { code: "4.16", section: "Equipment Manifest", text: "Extension cords, air hoses, air compressor" },
  { code: "4.17", section: "Equipment Manifest", text: "Folding tables, plywood, pneumatic jacks, jack stands" },
  { code: "4.18", section: "Equipment Manifest", text: "Blacklight, tarp, mirror, flashlight, particle bath" },
  { code: "5.1", section: "Consumables", text: "Sawdust, salt gel/fines, thread compound" },
  { code: "5.2", section: "Consumables", text: "Gasoline in approved leak-free container" },
  { code: "5.3", section: "Consumables", text: "UT couplant, dry MPI powder, copper sulfate solution" },
  { code: "5.4", section: "Consumables", text: "Sash cord, marking paint/stencils/classification bands" },
  { code: "5.5", section: "Consumables", text: "Replacement thread protectors, refacing discs/mandrels" },
  { code: "5.6", section: "Consumables", text: "Spare wire/soft/flapper wheels" },
  { code: "6.1", section: "Vehicle & Trip Readiness", text: "Pre-Trip completed/documented in Samsara" },
  { code: "6.2", section: "Vehicle & Trip Readiness", text: "Only approved drivers assigned" },
  { code: "6.3", section: "Vehicle & Trip Readiness", text: "Trailer loaded and all tools/equipment/chemicals secured" },
  { code: "6.4", section: "Vehicle & Trip Readiness", text: "Fuel/diesel filled, vehicle clean and shift-ready" },
  { code: "7.1", section: "Safety & Training Readiness", text: "Pre-Job JSA planned per Pathfinder Safety Program" },
  { code: "7.2", section: "Safety & Training Readiness", text: "H2S monitors charged and checked out" },
  { code: "7.3", section: "Safety & Training Readiness", text: "Required PPE loaded" },
  { code: "7.4", section: "Safety & Training Readiness", text: "Outstanding KPA safety alerts/training identified" },
  { code: "7.5", section: "Safety & Training Readiness", text: "Hot Work requirement and permit/extinguisher plan confirmed" },
] as const;

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
function migrationMissing(error: unknown) { return normalized(errorMessage(error)).includes("titan_dti_pre_job_readiness") || normalized(errorMessage(error)).includes("schema cache"); }
function equipmentMigrationMissing(error: unknown) { const message = normalized(errorMessage(error)); return message.includes("titan_dti_job_equipment") || message.includes("titan_equipment_calibrations") || message.includes("requires_calibration") || message.includes("schema cache"); }

async function authorizeWade(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name, email, is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !data) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const profile = data as TitanProfile;
  const isWade = normalized(profile.full_name) === "wade wisenor" || normalized(profile.email) === "wade@pathfinderinspections.com" || normalized(userData.user.email) === "wade@pathfinderinspections.com";
  if (profile.is_disabled || !isWade) return { error: Response.json({ error: "DTI pre-job readiness is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}

async function loadJob(admin: ReturnType<typeof configuredSupabase>, jobId: string) {
  const { data, error } = await admin.from("titan_jobs").select("id, job_number, title, service_line, lifecycle_status, customer_name, operator_name, rig_name, scheduled_start, job_type, job_description, source_snapshot").eq("id", jobId).maybeSingle();
  if (error) throw error;
  if (!data || normalized(data.service_line) !== "dti") return null;
  return data;
}

async function loadEquipmentReadiness(admin: ReturnType<typeof configuredSupabase>, job: Record<string, unknown>) {
  const [assignmentsResult, assetsResult, calibrationsResult] = await Promise.all([
    admin.from("titan_dti_job_equipment").select("*").eq("job_id", clean(job.id)),
    admin.from("equipment_assets").select("*").limit(2000),
    admin.from("titan_equipment_calibrations").select("*").order("calibrated_on", { ascending: false }).order("created_at", { ascending: false }).limit(3000),
  ]);
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (calibrationsResult.error) throw calibrationsResult.error;
  return buildDtiEquipmentReadiness(job, assignmentsResult.data ?? [], assetsResult.data ?? [], calibrationsResult.data ?? []);
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
    const { data, error } = await admin.from("titan_dti_pre_job_readiness").select("*").eq("job_id", jobId).maybeSingle();
    if (error) throw error;
    let equipmentReadiness = null;
    let equipmentReady = true;
    try { equipmentReadiness = await loadEquipmentReadiness(admin, job); }
    catch (error) { if (!equipmentMigrationMissing(error)) throw error; equipmentReady = false; }
    return Response.json({ ok: true, job, checklist, readiness: data, equipmentReadiness, equipmentReady });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_pre_job_readiness.sql before using Pre-Job Readiness." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = (await request.json().catch(() => ({}))) as SaveBody;
    const jobId = clean(body.jobId);
    if (!validUuid(jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 });
    if (!await loadJob(admin, jobId)) return Response.json({ error: "This DTI job could not be found." }, { status: 404 });
    const source = body.responses && typeof body.responses === "object" && !Array.isArray(body.responses) ? body.responses as Record<string, unknown> : {};
    const allowed = new Set<ResponseState>(["", "Complete", "Needs Attention", "Blocked", "N/A"]);
    const responses: Record<string, ItemResponse> = {};
    for (const item of checklist) {
      const raw = source[item.code] && typeof source[item.code] === "object" ? source[item.code] as Record<string, unknown> : {};
      const state = clean(raw.state) as ResponseState;
      if (!allowed.has(state)) return Response.json({ error: `Select a valid status for item ${item.code}.` }, { status: 400 });
      const entry = { state, note: clean(raw.note), ownerName: clean(raw.ownerName), dueDate: clean(raw.dueDate) };
      if (["Needs Attention", "Blocked"].includes(state) && (!entry.note || !entry.ownerName || !/^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate))) {
        return Response.json({ error: `Item ${item.code} requires a note, owner, and due date.` }, { status: 400 });
      }
      responses[item.code] = entry;
    }
    const values = Object.values(responses);
    const completeItems = values.filter((entry) => entry.state === "Complete" || entry.state === "N/A").length;
    const attentionItems = values.filter((entry) => entry.state === "Needs Attention").length;
    const blockedItems = values.filter((entry) => entry.state === "Blocked").length;
    const unanswered = values.filter((entry) => !entry.state).length;
    const readinessStatus = blockedItems ? "Blocked" : attentionItems || unanswered ? "Needs Attention" : "Ready";
    const finalize = normalized(body.action) === "finalize";
    if (finalize && readinessStatus !== "Ready") return Response.json({ error: "Every item must be Complete or N/A before this job can be marked Ready." }, { status: 400 });
    if (finalize) {
      let equipmentReadiness;
      try { equipmentReadiness = await loadEquipmentReadiness(admin, await loadJob(admin, jobId) as Record<string, unknown>); }
      catch (error) {
        if (equipmentMigrationMissing(error)) return Response.json({ error: "Run supabase/titan_dti_equipment_readiness.sql before marking this job Ready." }, { status: 409 });
        throw error;
      }
      if (equipmentReadiness.status !== "Ready") return Response.json({ error: "Required equipment must be assigned, calibrated, and verified before this job can be marked Ready." }, { status: 400 });
    }
    const payload = {
      job_id: jobId,
      checklist_version: "OMS-101 Rev 0",
      responses,
      readiness_status: readinessStatus,
      total_items: checklist.length,
      complete_items: completeItems,
      attention_items: attentionItems,
      blocked_items: blockedItems,
      finalized_at: finalize ? new Date().toISOString() : null,
      finalized_by: finalize ? authorization.userId : null,
      updated_by: authorization.userId,
    };
    const { data, error } = await admin.from("titan_dti_pre_job_readiness").upsert({ ...payload, created_by: authorization.userId }, { onConflict: "job_id" }).select("*").single();
    if (error) throw error;
    return Response.json({ ok: true, readiness: data });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_pre_job_readiness.sql before saving Pre-Job Readiness." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
