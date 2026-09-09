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
function migrationMissing(error: unknown) { const message = normalized(errorMessage(error)); return message.includes("titan_dti_job_runs") || message.includes("titan_dti_rack_runs") || message.includes("titan_dti_field_calibrations") || message.includes("titan_dti_borderline_escalations") || message.includes("titan_dti_defect_decisions") || message.includes("titan_dti_dimensional_readings") || message.includes("titan_dti_connection_refacing") || message.includes("titan_dti_joint_inspections") || message.includes("schema cache"); }

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
  const [racksResult, calibrationsResult, assetsResult, escalationsResult, documentsResult, defectsResult, specsResult, dimensionsResult, scopeResult, refacingResult, jointsResult] = run ? await Promise.all([
    admin.from("titan_dti_rack_runs").select("*").eq("job_run_id", run.id).order("rack_number"),
    admin.from("titan_dti_field_calibrations").select("*").eq("job_run_id", run.id).order("occurred_at", { ascending: false }),
    admin.from("equipment_assets").select("id,equipment_name,equipment_number,equipment_type,serial_number,department").eq("is_active", true).order("equipment_name").limit(2000),
    admin.from("titan_dti_borderline_escalations").select("*").eq("job_run_id", run.id).order("created_at", { ascending: false }),
    admin.from("titan_job_documents").select("id,display_name,document_type").eq("job_id", clean(job.id)).is("archived_at", null).order("created_at", { ascending: false }),
    admin.from("titan_dti_defect_decisions").select("*").eq("job_run_id", run.id).order("created_at", { ascending: false }),
    admin.from("titan_dti_tubular_specs").select("id,pipe_size,weight_ppf,grade,connection,new_wall_inches,premium_min_wall_inches,class_2_min_wall_inches,tj_od_min_premium_inches,tj_id_max_inches,bevel_diameter_min_inches,bevel_diameter_max_inches,tong_space_min_inches,source_document_id").is("archived_at", null).order("pipe_size"),
    admin.from("titan_dti_dimensional_readings").select("*").eq("job_run_id", run.id).order("created_at", { ascending: false }),
    admin.from("titan_dti_job_scopes").select("status,baseline_scope").eq("job_id", clean(job.id)).maybeSingle(),
    admin.from("titan_dti_connection_refacing").select("*").eq("job_run_id", run.id).order("created_at", { ascending: false }),
    admin.from("titan_dti_joint_inspections").select("*").eq("job_run_id", run.id).order("joint_id"),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: null, error: null }, { data: [], error: null }, { data: [], error: null }];
  if (racksResult.error) throw racksResult.error;
  if (calibrationsResult.error) throw calibrationsResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (escalationsResult.error) throw escalationsResult.error;
  if (documentsResult.error) throw documentsResult.error;
  if (defectsResult.error) throw defectsResult.error;
  if (specsResult.error) throw specsResult.error;
  if (dimensionsResult.error) throw dimensionsResult.error;
  if (scopeResult.error) throw scopeResult.error;
  if (refacingResult.error) throw refacingResult.error;
  if (jointsResult.error) throw jointsResult.error;
  const racks = (racksResult.data ?? []) as Row[];
  const calibrations = (calibrationsResult.data ?? []) as Row[];
  return { runs: runs ?? [], run, racks, calibrations, assets: assetsResult.data ?? [], escalations: escalationsResult.data ?? [], documents: documentsResult.data ?? [], defectDecisions: defectsResult.data ?? [], tubularSpecs: specsResult.data ?? [], dimensionalReadings: dimensionsResult.data ?? [], connectionRefacing: refacingResult.data ?? [], jointInspections: jointsResult.data ?? [], jobScope: scopeResult.data ?? null, summary: executionSummary(run as Row | null, racks, calibrations) };
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
      } else if (action === "save-joint-inspection") {
        const rackId = clean(body.rackId); const specId = clean(body.specId); const jointId = clean(body.jointId); const serialNumber = clean(body.serialNumber); const wallBasis = clean(body.wallBasis); const emiResult = clean(body.emiResult); const visualResult = clean(body.visualResult); const mpiResult = clean(body.mpiResult); const connectionResult = clean(body.connectionResult); const defectId = clean(body.sourceDefectDecisionId); const inspectorName = clean(body.inspectorName); const justificationInput = clean(body.decisionJustification); const wallReading = clean(body.utLowestWallInches) ? decimal(body.utLowestWallInches) : null;
        if (!validUuid(rackId) || !validUuid(specId) || !jointId || !["Premium", "Class 2", "Not Required"].includes(wallBasis) || !["Pass", "Indication", "Not Required"].includes(emiResult) || !["Pass", "Indication"].includes(visualResult) || !["Pass", "Indication", "Not Required"].includes(mpiResult) || !["Pass", "Indication", "Not Required"].includes(connectionResult) || !inspectorName) return Response.json({ error: "Complete the rack, specification, joint ID, inspection results, and inspector." }, { status: 400 });
        if (emiResult === "Indication" && !clean(body.emiIndicationDescription)) return Response.json({ error: "Describe the EMI indication and its location." }, { status: 400 });
        const [{ data: rack, error: rackError }, { data: spec, error: specError }, { data: scope, error: scopeError }] = await Promise.all([
          admin.from("titan_dti_rack_runs").select("id").eq("id", rackId).eq("job_run_id", runId).maybeSingle(),
          admin.from("titan_dti_tubular_specs").select("*").eq("id", specId).is("archived_at", null).maybeSingle(),
          admin.from("titan_dti_job_scopes").select("status,baseline_scope").eq("job_id", jobId).maybeSingle(),
        ]);
        if (rackError) throw rackError; if (specError) throw specError; if (scopeError) throw scopeError;
        if (!rack) return Response.json({ error: "The selected rack does not belong to this run." }, { status: 400 });
        if (!spec) return Response.json({ error: "Select an active controlled tubular specification." }, { status: 400 });
        const required = Array.isArray(scope?.baseline_scope) ? scope.baseline_scope.map(clean) : [];
        const requiresUt = required.includes("UT Wall Thickness"); const requiresEmi = required.includes("EMI"); const requiresMpi = required.includes("MPI Slip / Upset"); const requiresDimensions = required.some((item) => item.startsWith("Dimensional"));
        let minimum: number | null = null; let utResult = "Not Required";
        if (wallBasis !== "Not Required") {
          minimum = wallBasis === "Premium" ? Number(spec.premium_min_wall_inches) : Number(spec.class_2_min_wall_inches);
          if (!Number.isFinite(minimum) || wallReading === null || !Number.isFinite(wallReading)) return Response.json({ error: `The selected specification needs a controlled ${wallBasis} wall limit and a valid UT reading.` }, { status: 400 });
          const reading = Number(wallReading.toFixed(4)); const limit = Number(minimum.toFixed(4)); utResult = reading < limit ? "Reject" : reading === limit ? "Borderline" : "Pass";
        }
        const [{ count: dimensionCount, error: dimensionError }, defectResult] = await Promise.all([
          admin.from("titan_dti_dimensional_readings").select("id", { count: "exact", head: true }).eq("job_run_id", runId).eq("joint_id", jointId),
          validUuid(defectId) ? admin.from("titan_dti_defect_decisions").select("*").eq("id", defectId).eq("job_run_id", runId).maybeSingle() : Promise.resolve({ data: null, error: null }),
        ]);
        if (dimensionError) throw dimensionError; if (defectResult.error) throw defectResult.error;
        const defect = defectResult.data;
        if (validUuid(defectId) && !defect) return Response.json({ error: "The selected OMS-105 decision does not belong to this run." }, { status: 400 });
        const hasIndication = [visualResult, emiResult, mpiResult, connectionResult].includes("Indication") || ["Reject", "Borderline"].includes(utResult);
        const missingRequired = scope?.status !== "Confirmed" || (requiresUt && wallBasis === "Not Required") || (requiresEmi && emiResult === "Not Required") || (requiresMpi && mpiResult === "Not Required") || (requiresDimensions && !dimensionCount);
        const recordStatus = missingRequired || (hasIndication && !defect) ? "Hold" : "Complete";
        const finalDisposition = defect?.disposition || (recordStatus === "Complete" ? "Accept" : "Hold");
        const justification = clean(defect?.action_notes) || clean(defect?.controlling_criteria) || justificationInput;
        if (!justification) return Response.json({ error: "State why the final Accept, Repair, Reject, or Hold decision was made." }, { status: 400 });
        const payload = { job_id: jobId, job_run_id: runId, rack_run_id: rackId, tubular_spec_id: specId, joint_id: jointId, serial_number: serialNumber || null, wall_basis: wallBasis, ut_lowest_wall_inches: wallBasis === "Not Required" ? null : wallReading, ut_minimum_inches: minimum, ut_result: utResult, emi_result: emiResult, emi_indication_description: emiResult === "Indication" ? clean(body.emiIndicationDescription) : null, visual_result: visualResult, mpi_result: mpiResult, connection_result: connectionResult, dimensional_evidence_count: dimensionCount ?? 0, source_defect_decision_id: defect?.id || null, final_disposition: finalDisposition, decision_justification: justification, record_status: recordStatus, spec_snapshot: spec, inspector_name: inspectorName, inspected_at: clean(body.inspectedAt) || new Date().toISOString(), notes: clean(body.notes) || null, updated_by: authorization.userId };
        const { data: existing, error: existingError } = await admin.from("titan_dti_joint_inspections").select("id").eq("job_run_id", runId).eq("joint_id", jointId).maybeSingle();
        if (existingError) throw existingError;
        const saveResult = existing
          ? await admin.from("titan_dti_joint_inspections").update(payload).eq("id", existing.id).select("inspection_number,record_status").single()
          : await admin.from("titan_dti_joint_inspections").insert({ ...payload, created_by: authorization.userId }).select("inspection_number,record_status").single();
        const { data: saved, error } = saveResult;
        if (error) throw error;
        if (saved.record_status === "Hold") { const { error: holdError } = await admin.from("titan_dti_rack_runs").update({ status: "Hold", hold_reason: `${saved.inspection_number}: ${jointId} has incomplete evidence or an unresolved indication.`, updated_by: authorization.userId }).eq("id", rackId); if (holdError) throw holdError; }
      } else if (action === "save-refacing") {
        const rackId = clean(body.rackId);
        const specId = clean(body.specId);
        const jointIds = clean(body.jointIds);
        const quantity = integer(body.quantity);
        const componentEnd = clean(body.componentEnd);
        const connectionType = clean(body.connectionType);
        const identificationBasis = clean(body.identificationBasis);
        const drawingId = clean(body.manufacturerDrawingDocumentId);
        const condition = clean(body.condition);
        const requestedMethod = clean(body.method);
        const operatorName = clean(body.operatorName);
        const removal = clean(body.removalInches) ? decimal(body.removalInches) : null;
        const pinBenchmark = clean(body.pinBenchmarkToSealInches) ? decimal(body.pinBenchmarkToSealInches) : null;
        const boxBenchmark = clean(body.boxBenchmarkInches) ? decimal(body.boxBenchmarkInches) : null;
        const bevel = clean(body.postRefaceBevelInches) ? decimal(body.postRefaceBevelInches) : null;
        const fieldConditions = ["Light Seal / Shoulder Damage"];
        const shopConditions = ["Over Faced", "Short Box", "Long Pin", "Swelled Box", "Post-Lathe Benchmark Out of Spec", "Severe Seal / Shoulder Damage"];
        const rejectConditions = ["Confirmed Crack", "Thread Damage Beyond Field Repair"];
        const methods = ["Sandpaper - API", "Sandpaper - DS / Proprietary", "Samss Lathe", "No Field Reface"];
        if (!validUuid(specId) || !jointIds || quantity < 1 || !["Pin", "Box", "Both"].includes(componentEnd) || !["API", "Double-Shoulder", "Proprietary"].includes(connectionType) || !identificationBasis || ![...fieldConditions, ...shopConditions, ...rejectConditions].includes(condition) || !methods.includes(requestedMethod) || !operatorName) return Response.json({ error: "Complete the controlled specification, joints, connection identification, condition, method, quantity, and operator." }, { status: 400 });
        const { data: spec, error: specError } = await admin.from("titan_dti_tubular_specs").select("*").eq("id", specId).is("archived_at", null).maybeSingle();
        if (specError) throw specError;
        if (!spec) return Response.json({ error: "Select an active controlled tubular specification." }, { status: 400 });
        if (validUuid(rackId)) { const { data: rack, error } = await admin.from("titan_dti_rack_runs").select("id").eq("id", rackId).eq("job_run_id", runId).maybeSingle(); if (error) throw error; if (!rack) return Response.json({ error: "The selected rack does not belong to this run." }, { status: 400 }); }
        if (connectionType !== "API") {
          if (!validUuid(drawingId)) return Response.json({ error: "Double-shoulder and proprietary connections require the manufacturer field dimension drawing." }, { status: 400 });
          const { data: drawing, error } = await admin.from("titan_job_documents").select("id").eq("id", drawingId).eq("job_id", jobId).maybeSingle();
          if (error) throw error;
          if (!drawing) return Response.json({ error: "The manufacturer drawing must be attached to this connected job." }, { status: 400 });
        }
        let route = rejectConditions.includes(condition) ? "Reject" : shopConditions.includes(condition) ? "Machine Shop" : "Field Reface";
        if (route === "Field Reface") {
          if (requestedMethod === "No Field Reface") return Response.json({ error: "Select the field-refacing method used." }, { status: 400 });
          if (!Boolean(body.squarenessVerified) || !Boolean(body.copperSulfateVerified)) return Response.json({ error: "Verify squareness and complete the copper sulfate test after field refacing." }, { status: 400 });
          if (requestedMethod === "Samss Lathe" && !Boolean(body.samssTrainedOperator)) return Response.json({ error: "Samss lathe work requires a trained operator." }, { status: 400 });
          if (connectionType !== "API" && removal === null) return Response.json({ error: "Record material removal for double-shoulder and proprietary connections." }, { status: 400 });
          if (connectionType !== "API" && removal !== null && removal > 0.0625) route = "Machine Shop";
          if (["Pin", "Both"].includes(componentEnd) && pinBenchmark !== null && pinBenchmark > 0.1875) route = "Machine Shop";
          if (["Box", "Both"].includes(componentEnd) && boxBenchmark !== null && boxBenchmark < 0.0625) route = "Machine Shop";
          const bevelMin = spec.bevel_diameter_min_inches === null ? null : Number(spec.bevel_diameter_min_inches);
          const bevelMax = spec.bevel_diameter_max_inches === null ? null : Number(spec.bevel_diameter_max_inches);
          if (bevel !== null && ((bevelMin !== null && bevel < bevelMin) || (bevelMax !== null && bevel > bevelMax))) route = "Machine Shop";
        }
        const method = route === "Field Reface" ? requestedMethod : "No Field Reface";
        const { data: saved, error } = await admin.from("titan_dti_connection_refacing").insert({ job_id: jobId, job_run_id: runId, rack_run_id: validUuid(rackId) ? rackId : null, tubular_spec_id: specId, joint_ids: jointIds, quantity, component_end: componentEnd, connection_type: connectionType, identification_basis: identificationBasis, manufacturer_drawing_document_id: connectionType === "API" ? null : drawingId, condition, route, method, removal_inches: removal, pin_benchmark_to_seal_inches: pinBenchmark, box_benchmark_inches: boxBenchmark, post_reface_bevel_inches: bevel, squareness_verified: Boolean(body.squarenessVerified), copper_sulfate_verified: Boolean(body.copperSulfateVerified), samss_trained_operator: Boolean(body.samssTrainedOperator), operator_name: operatorName, notes: clean(body.notes) || null, created_by: authorization.userId }).select("record_number").single();
        if (error) throw error;
        if (validUuid(rackId) && route !== "Field Reface") {
          const { error: holdError } = await admin.from("titan_dti_rack_runs").update({ status: "Hold", hold_reason: `${saved.record_number}: connection routed to ${route}.`, updated_by: authorization.userId }).eq("id", rackId).eq("job_run_id", runId);
          if (holdError) throw holdError;
        }
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
          if (current.summary.completed > 0 && current.jointInspections.length < current.summary.completed) return Response.json({ error: `Record every inspected joint before closing this run. ${current.jointInspections.length} of ${current.summary.completed} joint records are complete.` }, { status: 400 });
          if (current.jointInspections.some((entry) => entry.record_status !== "Complete")) return Response.json({ error: "Resolve every joint inspection hold before closing this run." }, { status: 400 });
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
