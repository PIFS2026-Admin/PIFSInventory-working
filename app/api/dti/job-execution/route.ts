import { createClient } from "@supabase/supabase-js";

type TitanProfile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
type Row = Record<string, unknown>;
type Body = Record<string, unknown>;

const phases = [
  { number: 1, name: "Tube Prep", reference: "IOM 7.1-7.4" },
  { number: 2, name: "Clean Connections", reference: "IOM 7.5" },
  { number: 3, name: "Inspect & Repair", reference: "IOM 7.6-7.12" },
  { number: 4, name: "Mark & Protect", reference: "IOM 7.13-7.14" },
  { number: 5, name: "EMI", reference: "IOM 7.15 / 8" },
  { number: 6, name: "Rack Reset", reference: "IOM 7.16" },
];

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase(); }
function integer(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : NaN; }
function decimal(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN; }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) { const message = normalized(errorMessage(error)); return message.includes("titan_dti_job_runs") || message.includes("titan_dti_rack_runs") || message.includes("titan_dti_field_calibrations") || message.includes("titan_dti_borderline_escalations") || message.includes("titan_dti_defect_decisions") || message.includes("titan_dti_dimensional_readings") || message.includes("schema cache"); }

async function authorizeWade(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !data) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const profile = data as TitanProfile;
  const identity = normalized(profile.email || userData.user.email).replace(/[^a-z0-9]/g, "");
  if (profile.is_disabled || (normalized(profile.full_name) !== "wade wisenor" && identity !== "wadepathfinderinspectionscom")) return { error: Response.json({ error: "DTI Job Execution is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id, fullName: clean(profile.full_name) || "Wade Wisenor" };
}

async function loadJob(admin: ReturnType<typeof configuredSupabase>, jobId: string) {
  const { data, error } = await admin.from("titan_jobs").select("id,job_number,title,service_line,lifecycle_status,customer_name,rig_name,scheduled_start,job_type").eq("id", jobId).maybeSingle();
  if (error) throw error;
  return data && normalized(data.service_line) === "dti" ? data as Row : null;
}

function executionSummary(run: Row | null, racks: Row[], calibrations: Row[]) {
  const completed = racks.reduce((sum, rack) => sum + Number(rack.completed_joints || 0), 0);
  const planned = racks.reduce((sum, rack) => sum + Number(rack.planned_joints || 0), 0) || Number(run?.planned_joints || 0);
  const latestByKind = new Map<string, Row>();
  calibrations.forEach((entry) => { if (!latestByKind.has(clean(entry.calibration_kind))) latestByKind.set(clean(entry.calibration_kind), entry); });
  const warnings: { kind: string; severity: "Attention" | "Blocked"; message: string }[] = [];
  for (const kind of ["OD Gauge", "UT Wall", "EMI Standard"]) {
    const latest = latestByKind.get(kind);
    const hasPassingStart = calibrations.some((entry) => clean(entry.calibration_kind) === kind && clean(entry.checkpoint) === "Job Start" && clean(entry.result) === "Pass");
    if (!hasPassingStart) warnings.push({ kind, severity: "Attention", message: `${kind} job-start verification has not been recorded.` });
    else if (latest && clean(latest.result) === "Fail") warnings.push({ kind, severity: "Blocked", message: `${kind} latest verification failed.` });
  }
  const odJoint = Number(latestByKind.get("OD Gauge")?.joint_number || 0);
  const emiJoint = Number(latestByKind.get("EMI Standard")?.joint_number || 0);
  if (completed > 0 && completed - odJoint >= 25) warnings.push({ kind: "OD Gauge", severity: "Attention", message: `OD gauge verification is due at joint ${odJoint + 25}.` });
  if (completed > 0 && completed - emiJoint >= 50) warnings.push({ kind: "EMI Standard", severity: "Blocked", message: `EMI standard is overdue; last recorded at joint ${emiJoint}.` });
  if (clean(run?.status) === "Complete") {
    if (!calibrations.some((entry) => clean(entry.calibration_kind) === "OD Gauge" && clean(entry.checkpoint) === "Job End" && clean(entry.result) === "Pass")) warnings.push({ kind: "OD Gauge", severity: "Blocked", message: "Passing job-end OD gauge verification is missing." });
    if (!calibrations.some((entry) => clean(entry.calibration_kind) === "EMI Standard" && clean(entry.checkpoint) === "Final Standard" && clean(entry.result) === "Pass")) warnings.push({ kind: "EMI Standard", severity: "Blocked", message: "Passing final EMI standard is missing." });
  }
  return { planned, completed, percent: planned ? Math.min(100, Math.round((completed / planned) * 100)) : 0, holds: racks.filter((rack) => rack.status === "Hold").length, completeRacks: racks.filter((rack) => rack.status === "Complete").length, warnings, status: warnings.some((warning) => warning.severity === "Blocked") ? "Blocked" : warnings.length ? "Needs Attention" : "On Track" };
}

async function loadData(admin: ReturnType<typeof configuredSupabase>, job: Row, requestedRunId = "") {
  const { data: runs, error: runsError } = await admin.from("titan_dti_job_runs").select("*").eq("job_id", clean(job.id)).order("run_date", { ascending: false }).order("started_at", { ascending: false }).limit(100);
  if (runsError) throw runsError;
  const run = (runs ?? []).find((item) => item.id === requestedRunId) ?? (runs ?? []).find((item) => item.status !== "Complete") ?? runs?.[0] ?? null;
  const [racksResult, calibrationsResult, assetsResult, escalationsResult, documentsResult, defectsResult, specsResult, dimensionsResult, scopeResult] = run ? await Promise.all([
    admin.from("titan_dti_rack_runs").select("*").eq("job_run_id", run.id).order("rack_number"),
    admin.from("titan_dti_field_calibrations").select("*").eq("job_run_id", run.id).order("occurred_at", { ascending: false }),
    admin.from("equipment_assets").select("id,equipment_name,equipment_number,equipment_type,serial_number,department").eq("is_active", true).order("equipment_name").limit(2000),
    admin.from("titan_dti_borderline_escalations").select("*").eq("job_run_id", run.id).order("created_at", { ascending: false }),
    admin.from("titan_job_documents").select("id,display_name,document_type").eq("job_id", clean(job.id)).is("archived_at", null).order("created_at", { ascending: false }),
    admin.from("titan_dti_defect_decisions").select("*").eq("job_run_id", run.id).order("created_at", { ascending: false }),
    admin.from("titan_dti_tubular_specs").select("id,pipe_size,weight_ppf,grade,connection,new_wall_inches,premium_min_wall_inches,class_2_min_wall_inches,tj_od_min_premium_inches,tj_id_max_inches,bevel_diameter_min_inches,bevel_diameter_max_inches,tong_space_min_inches,source_document_id").is("archived_at", null).order("pipe_size"),
    admin.from("titan_dti_dimensional_readings").select("*").eq("job_run_id", run.id).order("created_at", { ascending: false }),
    admin.from("titan_dti_job_scopes").select("status,baseline_scope").eq("job_id", clean(job.id)).maybeSingle(),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: null, error: null }];
  if (racksResult.error) throw racksResult.error;
  if (calibrationsResult.error) throw calibrationsResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (escalationsResult.error) throw escalationsResult.error;
  if (documentsResult.error) throw documentsResult.error;
  if (defectsResult.error) throw defectsResult.error;
  if (specsResult.error) throw specsResult.error;
  if (dimensionsResult.error) throw dimensionsResult.error;
  if (scopeResult.error) throw scopeResult.error;
  const racks = (racksResult.data ?? []) as Row[];
  const calibrations = (calibrationsResult.data ?? []) as Row[];
  return { runs: runs ?? [], run, racks, calibrations, assets: assetsResult.data ?? [], escalations: escalationsResult.data ?? [], documents: documentsResult.data ?? [], defectDecisions: defectsResult.data ?? [], tubularSpecs: specsResult.data ?? [], dimensionalReadings: dimensionsResult.data ?? [], jobScope: scopeResult.data ?? null, summary: executionSummary(run as Row | null, racks, calibrations) };
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;
    const params = new URL(request.url).searchParams;
    const jobId = clean(params.get("jobId"));
    if (!validUuid(jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 });
    const job = await loadJob(admin, jobId);
    if (!job) return Response.json({ error: "This DTI job could not be found." }, { status: 404 });
    return Response.json({ ok: true, job, phases, ...await loadData(admin, job, clean(params.get("runId"))) });
  } catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_job_execution.sql before using Job Execution." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = await request.json().catch(() => ({})) as Body;
    const action = normalized(body.action);
    const jobId = clean(body.jobId);
    if (!validUuid(jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 });
    const job = await loadJob(admin, jobId);
    if (!job) return Response.json({ error: "This DTI job could not be found." }, { status: 404 });
    let runId = clean(body.runId);

    if (action === "create-run") {
      const runDate = clean(body.runDate);
      const shiftName = clean(body.shiftName);
      const planned = integer(body.plannedJoints);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate) || !shiftName || !Number.isInteger(planned) || planned < 0) return Response.json({ error: "Enter a run date, shift, and non-negative planned joint count." }, { status: 400 });
      const setupType = clean(body.setupType);
      if (!["Side-by-Side", "Single Rack", "Other"].includes(setupType)) return Response.json({ error: "Select a valid setup type." }, { status: 400 });
      const { data, error } = await admin.from("titan_dti_job_runs").insert({ job_id: jobId, run_date: runDate, shift_name: shiftName, crew_lead_name: clean(body.crewLeadName) || null, setup_type: setupType, planned_joints: planned, status: "Active", notes: clean(body.notes) || null, created_by: authorization.userId, updated_by: authorization.userId }).select("id").single();
      if (error) throw error; runId = data.id;
    } else {
      if (!validUuid(runId)) return Response.json({ error: "Select a valid DTI job run." }, { status: 400 });
      const { data: ownedRun, error } = await admin.from("titan_dti_job_runs").select("id,status").eq("id", runId).eq("job_id", jobId).maybeSingle();
      if (error) throw error;
      if (!ownedRun) return Response.json({ error: "This job run could not be found." }, { status: 404 });

      if (action === "save-rack") {
        const rackId = clean(body.rackId);
        const rackNumber = integer(body.rackNumber);
        const planned = integer(body.plannedJoints);
        const completed = integer(body.completedJoints);
        const phase = integer(body.currentPhase);
        const status = clean(body.status);
        if (rackNumber < 1 || planned < 0 || completed < 0 || (planned > 0 && completed > planned) || phase < 1 || phase > 6 || !["Not Started", "In Progress", "Hold", "Complete"].includes(status)) return Response.json({ error: "Check the rack number, joint counts, phase, and status." }, { status: 400 });
        if (status === "Hold" && !clean(body.holdReason)) return Response.json({ error: "Enter the reason this rack is on hold." }, { status: 400 });
        const historyEntry = { phase, status, at: new Date().toISOString(), by: authorization.fullName };
        if (validUuid(rackId)) {
          const { data: prior, error: priorError } = await admin.from("titan_dti_rack_runs").select("phase_history,started_at,current_phase,status").eq("id", rackId).eq("job_run_id", runId).maybeSingle();
          if (priorError) throw priorError;
          const history = Array.isArray(prior?.phase_history) ? prior.phase_history : [];
          const changed = Number(prior?.current_phase) !== phase || clean(prior?.status) !== status;
          const { error } = await admin.from("titan_dti_rack_runs").update({ rack_number: rackNumber, rack_name: clean(body.rackName) || null, pipe_description: clean(body.pipeDescription) || null, planned_joints: planned, completed_joints: completed, current_phase: phase, status, hold_reason: status === "Hold" ? clean(body.holdReason) : null, phase_history: changed ? [...history, historyEntry] : history, started_at: status === "Not Started" ? null : prior?.started_at || new Date().toISOString(), completed_at: status === "Complete" ? new Date().toISOString() : null, updated_by: authorization.userId }).eq("id", rackId).eq("job_run_id", runId);
          if (error) throw error;
        } else {
          const { error } = await admin.from("titan_dti_rack_runs").insert({ job_run_id: runId, rack_number: rackNumber, rack_name: clean(body.rackName) || null, pipe_description: clean(body.pipeDescription) || null, planned_joints: planned, completed_joints: completed, current_phase: phase, status, hold_reason: status === "Hold" ? clean(body.holdReason) : null, phase_history: [historyEntry], started_at: status === "Not Started" ? null : new Date().toISOString(), completed_at: status === "Complete" ? new Date().toISOString() : null, created_by: authorization.userId, updated_by: authorization.userId });
          if (error) throw error;
        }
      } else if (action === "delete-rack") {
        const rackId = clean(body.rackId);
        if (!validUuid(rackId)) return Response.json({ error: "Select a valid rack." }, { status: 400 });
        const { error } = await admin.from("titan_dti_rack_runs").delete().eq("id", rackId).eq("job_run_id", runId);
        if (error) throw error;
      } else if (action === "calibration") {
        const kind = clean(body.calibrationKind);
        const checkpoint = clean(body.checkpoint);
        const jointNumber = clean(body.jointNumber) ? integer(body.jointNumber) : null;
        const result = clean(body.result);
        if (!["OD Gauge", "UT Wall", "EMI Standard"].includes(kind) || !["Job Start", "25 Joints", "50 Joints", "Size Change", "Equipment Interruption", "Job End", "Final Standard"].includes(checkpoint) || (jointNumber !== null && jointNumber < 0) || !["Pass", "Fail"].includes(result) || !clean(body.performedByName)) return Response.json({ error: "Complete the calibration kind, checkpoint, result, and inspector." }, { status: 400 });
        const rackId = clean(body.rackId); const assetId = clean(body.assetId);
        const { error } = await admin.from("titan_dti_field_calibrations").insert({ job_run_id: runId, rack_run_id: validUuid(rackId) ? rackId : null, equipment_asset_id: validUuid(assetId) ? assetId : null, calibration_kind: kind, checkpoint, joint_number: jointNumber, result, reading_summary: clean(body.readingSummary) || null, performed_by_name: clean(body.performedByName), notes: clean(body.notes) || null, created_by: authorization.userId });
        if (error) throw error;
      } else if (action === "save-dimensional") {
        const rackId = clean(body.rackId);
        const specId = clean(body.specId);
        const jointId = clean(body.jointId);
        const measurementType = clean(body.measurementType);
        const componentEnd = clean(body.componentEnd);
        const readingA = decimal(body.readingA);
        const readingB = clean(body.readingB) ? decimal(body.readingB) : null;
        const instrument = clean(body.instrument);
        const inspectorName = clean(body.inspectorName);
        const measurementTypes = ["Tool Joint OD", "Tool Joint ID", "Counterbore Diameter", "Counterbore Depth", "Thread Stretch", "Bevel Diameter", "Tong Space"];
        if (!validUuid(specId) || !jointId || !measurementTypes.includes(measurementType) || !["Pin", "Box", "Tube", "N/A"].includes(componentEnd) || !Number.isFinite(readingA) || !instrument || !inspectorName) return Response.json({ error: "Complete the controlled specification, joint, measurement, reading, instrument, and inspector." }, { status: 400 });
        if (["Tool Joint OD", "Tool Joint ID"].includes(measurementType) && (readingB === null || !Number.isFinite(readingB))) return Response.json({ error: "Tool-joint OD and ID require two readings taken 90 degrees apart." }, { status: 400 });
        if (readingB !== null && !Number.isFinite(readingB)) return Response.json({ error: "Reading B must be a non-negative number." }, { status: 400 });
        const { data: spec, error: specError } = await admin.from("titan_dti_tubular_specs").select("*").eq("id", specId).is("archived_at", null).maybeSingle();
        if (specError) throw specError;
        if (!spec) return Response.json({ error: "Select an active controlled tubular specification." }, { status: 400 });
        if (validUuid(rackId)) { const { data: rack, error } = await admin.from("titan_dti_rack_runs").select("id").eq("id", rackId).eq("job_run_id", runId).maybeSingle(); if (error) throw error; if (!rack) return Response.json({ error: "The selected rack does not belong to this run." }, { status: 400 }); }
        const second = readingB ?? readingA;
        const recordedValue = measurementType === "Tool Joint OD" ? Math.min(readingA, second) : measurementType === "Tool Joint ID" ? Math.max(readingA, second) : readingA;
        let minimum: number | null = null; let maximum: number | null = null;
        if (measurementType === "Tool Joint OD") minimum = spec.tj_od_min_premium_inches === null ? null : Number(spec.tj_od_min_premium_inches);
        if (measurementType === "Tool Joint ID") maximum = spec.tj_id_max_inches === null ? null : Number(spec.tj_id_max_inches);
        if (measurementType === "Bevel Diameter") { minimum = spec.bevel_diameter_min_inches === null ? null : Number(spec.bevel_diameter_min_inches); maximum = spec.bevel_diameter_max_inches === null ? null : Number(spec.bevel_diameter_max_inches); }
        if (measurementType === "Tong Space") minimum = spec.tong_space_min_inches === null ? null : Number(spec.tong_space_min_inches);
        if (measurementType === "Counterbore Depth") minimum = 0.5625;
        if (measurementType === "Thread Stretch") maximum = 0.006;
        if (measurementType !== "Counterbore Diameter" && minimum === null && maximum === null) return Response.json({ error: `The selected controlled specification has no ${measurementType} acceptance limit.` }, { status: 400 });
        const rounded = Number(recordedValue.toFixed(4)); const minRounded = minimum === null ? null : Number(minimum.toFixed(4)); const maxRounded = maximum === null ? null : Number(maximum.toFixed(4));
        const rejected = (minRounded !== null && rounded < minRounded) || (maxRounded !== null && rounded > maxRounded);
        const borderline = !rejected && ((minRounded !== null && rounded === minRounded) || (maxRounded !== null && rounded === maxRounded));
        const result = minimum === null && maximum === null ? "Recorded" : rejected ? "Reject" : borderline ? "Borderline" : "Pass";
        const { data: savedReading, error } = await admin.from("titan_dti_dimensional_readings").insert({ job_id: jobId, job_run_id: runId, rack_run_id: validUuid(rackId) ? rackId : null, tubular_spec_id: specId, joint_id: jointId, measurement_type: measurementType, component_end: componentEnd, reading_a_inches: readingA, reading_b_inches: readingB, recorded_value_inches: rounded, minimum_inches: minimum, maximum_inches: maximum, result, spec_snapshot: spec, instrument, inspector_name: inspectorName, notes: clean(body.notes) || null, created_by: authorization.userId }).select("reading_number").single();
        if (error) throw error;
        if (validUuid(rackId) && ["Borderline", "Reject"].includes(result)) {
          const { error: holdError } = await admin.from("titan_dti_rack_runs").update({ status: "Hold", hold_reason: `${savedReading.reading_number}: ${measurementType} ${result.toLowerCase()}; record OMS-105 disposition.`, updated_by: authorization.userId }).eq("id", rackId).eq("job_run_id", runId);
          if (holdError) throw holdError;
        }
      } else if (action === "save-defect") {
        const rackId = clean(body.rackId);
        const jointIds = clean(body.jointIds);
        const quantity = integer(body.quantity);
        const defectType = clean(body.defectType);
        const componentLocation = clean(body.componentLocation);
        const detectionMethod = clean(body.detectionMethod);
        const confirmationMethod = clean(body.confirmationMethod);
        const measurements = clean(body.measurements);
        const controllingCriteria = clean(body.controllingCriteria);
        const disposition = clean(body.disposition);
        const inspectorName = clean(body.inspectorName);
        if (!jointIds || quantity < 1 || !defectType || !componentLocation || !detectionMethod || !confirmationMethod || !measurements || !controllingCriteria || !inspectorName) return Response.json({ error: "Complete the joints, defect, location, detection and confirmation methods, measurements, criteria, and inspector." }, { status: 400 });
        if (detectionMethod === confirmationMethod) return Response.json({ error: "Confirm the indication with a different inspection method." }, { status: 400 });
        if (!["Accept", "Reject", "DBR", "Field Repair", "Reface", "Hardband"].includes(disposition)) return Response.json({ error: "Select a valid final disposition." }, { status: 400 });
        if ((normalized(defectType).includes("crack") || ["Bent Pipe", "Structural Drift Failure"].includes(defectType)) && disposition !== "Reject") return Response.json({ error: "Confirmed cracks, bent pipe, and structural drift failures must be rejected." }, { status: 400 });
        if (validUuid(rackId)) {
          const { data: rack, error } = await admin.from("titan_dti_rack_runs").select("id").eq("id", rackId).eq("job_run_id", runId).maybeSingle();
          if (error) throw error;
          if (!rack) return Response.json({ error: "The selected rack does not belong to this run." }, { status: 400 });
        }
        const { error } = await admin.from("titan_dti_defect_decisions").insert({ job_id: jobId, job_run_id: runId, rack_run_id: validUuid(rackId) ? rackId : null, joint_ids: jointIds, quantity, defect_type: defectType, component_location: componentLocation, detection_method: detectionMethod, confirmation_method: confirmationMethod, measurements, controlling_criteria: controllingCriteria, disposition, action_notes: clean(body.actionNotes) || null, inspector_name: inspectorName, created_by: authorization.userId });
        if (error) throw error;
      } else if (action === "save-escalation") {
        const rackId = clean(body.rackId);
        const componentIds = clean(body.componentIds);
        const quantity = integer(body.quantity);
        const conditionType = clean(body.conditionType);
        const conditionDescription = clean(body.conditionDescription);
        const componentLocation = clean(body.componentLocation);
        const measurements = clean(body.measurements);
        const serviceCategory = clean(body.serviceCategory);
        const operationalRisk = clean(body.operationalRisk);
        const recommendation = clean(body.inspectorRecommendation);
        const customerDecision = clean(body.customerDecision);
        const confirmationDocumentId = clean(body.confirmationDocumentId);
        if (!componentIds || quantity < 1 || !conditionType || !conditionDescription || !componentLocation || !measurements || !serviceCategory) return Response.json({ error: "Complete the component, condition, location, measurements, service category, and quantity." }, { status: 400 });
        if (!["Low", "Moderate", "High"].includes(operationalRisk) || !["Reject", "Accept with Deviation", "Further Evaluation"].includes(recommendation)) return Response.json({ error: "Select the operational risk and inspector recommendation." }, { status: 400 });
        if (customerDecision && !["Accept with Deviation", "Reject", "Modify Criteria", "Further Evaluation"].includes(customerDecision)) return Response.json({ error: "Select a valid customer decision." }, { status: 400 });
        if (operationalRisk === "High" && customerDecision === "Accept with Deviation") return Response.json({ error: "High-risk conditions cannot be accepted. Reject the component or record further evaluation." }, { status: 400 });
        if (customerDecision === "Accept with Deviation" && normalized(conditionType).includes("crack")) return Response.json({ error: "Confirmed cracks are not eligible for deviation and must be rejected." }, { status: 400 });
        if (customerDecision === "Accept with Deviation" && (!clean(body.customerRepName) || !clean(body.customerCompany) || !clean(body.customerContactedOn) || !clean(body.communicationMethod) || !validUuid(confirmationDocumentId))) return Response.json({ error: "Accepted deviations require the customer representative, company, date, communication method, and written confirmation attachment." }, { status: 400 });
        if (validUuid(rackId)) {
          const { data: rack, error } = await admin.from("titan_dti_rack_runs").select("id").eq("id", rackId).eq("job_run_id", runId).maybeSingle();
          if (error) throw error;
          if (!rack) return Response.json({ error: "The selected rack does not belong to this run." }, { status: 400 });
        }
        if (validUuid(confirmationDocumentId)) {
          const { data: document, error } = await admin.from("titan_job_documents").select("id").eq("id", confirmationDocumentId).eq("job_id", jobId).maybeSingle();
          if (error) throw error;
          if (!document) return Response.json({ error: "The written confirmation must be attached to this connected job." }, { status: 400 });
        }
        let deviationId: string | null = null;
        if (customerDecision === "Accept with Deviation") {
          const { data: deviation, error } = await admin.from("titan_job_deviations").insert({ job_id: jobId, component: componentIds, joint_ids: componentIds, quantity, defect_type: conditionType, location_on_component: componentLocation, measurements, controlling_criteria: clean(body.controllingCriteria) || null, justification: conditionDescription, operational_risk: operationalRisk, inspector_recommendation: recommendation, communication_method: clean(body.communicationMethod), written_confirmation: true, confirmation_document_id: confirmationDocumentId, status: "Draft", created_by: authorization.userId, updated_by: authorization.userId }).select("id").single();
          if (error) throw error;
          deviationId = deviation.id;
        }
        const status = customerDecision ? "Resolved" : clean(body.leadInspectorName) ? "Customer Decision" : "Lead Review";
        const { data: escalation, error: escalationError } = await admin.from("titan_dti_borderline_escalations").insert({ job_id: jobId, job_run_id: runId, rack_run_id: validUuid(rackId) ? rackId : null, component_ids: componentIds, quantity, condition_type: conditionType, condition_description: conditionDescription, component_location: componentLocation, measurements, service_category: serviceCategory, critical_area: Boolean(body.criticalArea), repeated_condition: Boolean(body.repeatedCondition), controlling_criteria: clean(body.controllingCriteria) || null, operational_risk: operationalRisk, inspector_recommendation: recommendation, lead_inspector_name: clean(body.leadInspectorName) || null, customer_rep_name: clean(body.customerRepName) || null, customer_company: clean(body.customerCompany) || null, customer_contacted_on: clean(body.customerContactedOn) || null, communication_method: clean(body.communicationMethod) || null, customer_decision: customerDecision || null, confirmation_document_id: validUuid(confirmationDocumentId) ? confirmationDocumentId : null, decision_notes: clean(body.decisionNotes) || null, status, deviation_id: deviationId, created_by: authorization.userId, updated_by: authorization.userId }).select("escalation_number").single();
        if (escalationError) throw escalationError;
        if (validUuid(rackId) && status !== "Resolved") {
          const { error } = await admin.from("titan_dti_rack_runs").update({ status: "Hold", hold_reason: `${escalation.escalation_number}: borderline condition awaiting decision.`, updated_by: authorization.userId }).eq("id", rackId).eq("job_run_id", runId);
          if (error) throw error;
        }
      } else if (action === "update-run") {
        const status = clean(body.status);
        if (!["Active", "Paused", "Complete"].includes(status)) return Response.json({ error: "Select a valid run status." }, { status: 400 });
        if (status === "Complete") {
          const current = await loadData(admin, job, runId);
          if (!current.racks.length || current.racks.some((rack) => rack.status !== "Complete")) return Response.json({ error: "Every rack must be complete before closing this run." }, { status: 400 });
          if (current.escalations.some((entry) => entry.status !== "Resolved")) return Response.json({ error: "Resolve every OMS-109 borderline escalation before closing this run." }, { status: 400 });
          const requiredScope = Array.isArray(current.jobScope?.baseline_scope) ? current.jobScope.baseline_scope as unknown[] : [];
          if (current.jobScope?.status === "Confirmed" && requiredScope.some((item) => clean(item).startsWith("Dimensional")) && !current.dimensionalReadings.length) return Response.json({ error: "The confirmed OMS-102 scope requires dimensional inspection. Record OMS-106 measurements before closing this run." }, { status: 400 });
          const finalOd = current.calibrations.some((entry) => entry.calibration_kind === "OD Gauge" && entry.checkpoint === "Job End" && entry.result === "Pass");
          const finalEmi = current.calibrations.some((entry) => entry.calibration_kind === "EMI Standard" && entry.checkpoint === "Final Standard" && entry.result === "Pass");
          if (!finalOd || !finalEmi) return Response.json({ error: "Record passing Job End OD Gauge and Final Standard EMI checks before closing this run." }, { status: 400 });
        }
        const { error } = await admin.from("titan_dti_job_runs").update({ status, completed_at: status === "Complete" ? new Date().toISOString() : null, updated_by: authorization.userId }).eq("id", runId).eq("job_id", jobId);
        if (error) throw error;
      } else return Response.json({ error: "Select a valid execution action." }, { status: 400 });
    }
    return Response.json({ ok: true, job, phases, ...await loadData(admin, job, runId) });
  } catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_job_execution.sql before saving Job Execution." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}
