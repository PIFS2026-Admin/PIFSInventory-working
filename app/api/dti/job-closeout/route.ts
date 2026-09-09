import { createClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;
type Body = Record<string, unknown>;
type TitanProfile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase(); }
function nullable(value: unknown) { return clean(value) || null; }
function nonnegative(value: unknown, label: string) { const parsed = Number(value ?? 0); if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative whole number.`); return parsed; }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) { const value = normalized(errorMessage(error)); return value.includes("job_run_id") || value.includes("source_rollup") || value.includes("titan_dti_borderline_escalations") || value.includes("titan_dti_defect_decisions") || value.includes("titan_dti_connection_refacing") || value.includes("station_performance") || value.includes("completion_status") || value.includes("schema cache"); }
function optionalBoolean(value: unknown) { if (value === true || value === "true") return true; if (value === false || value === "false") return false; return null; }

async function authorizeWade(request: Request, admin: ReturnType<typeof adminClient>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !data) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const profile = data as TitanProfile;
  const identity = normalized(profile.email || userData.user.email).replace(/[^a-z0-9]/g, "");
  if (profile.is_disabled || (normalized(profile.full_name) !== "wade wisenor" && identity !== "wadepathfinderinspectionscom")) return { error: Response.json({ error: "DTI Closeout is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id, fullName: clean(profile.full_name) || "Wade Wisenor" };
}

async function loadJob(admin: ReturnType<typeof adminClient>, jobId: string) {
  const { data, error } = await admin.from("titan_jobs").select("id,job_number,title,service_line,lifecycle_status,customer_name,operator_name,rig_name,location_name,scheduled_start,job_type").eq("id", jobId).maybeSingle();
  if (error) throw error;
  return data && normalized(data.service_line) === "dti" ? data as Row : null;
}

function dateStamp(value: string) {
  const [year, month, day] = value.split("-");
  return `${month}-${day}-${year.slice(-2)}`;
}
function letterForIndex(index: number) { let n = index; let value = ""; do { value = String.fromCharCode(65 + (n % 26)) + value; n = Math.floor(n / 26) - 1; } while (n >= 0); return value; }

function defectRollup(decisions: Row[]) {
  const quantity = (predicate: (item: Row) => boolean) => decisions.filter(predicate).reduce((total, item) => total + Number(item.quantity || 0), 0);
  const has = (item: Row, value: string) => normalized(item.defect_type).includes(value);
  const pin = (item: Row) => normalized(item.component_location).includes("pin");
  const box = (item: Row) => normalized(item.component_location).includes("box");
  const result = {
    damage_threads_pin: quantity((item) => has(item, "thread damage") && pin(item)),
    damage_threads_box: quantity((item) => has(item, "thread damage") && box(item)),
    bent_tube: quantity((item) => has(item, "bent pipe")),
    min_tong_pin: quantity((item) => has(item, "minimum tong") && pin(item)),
    min_tong_box: quantity((item) => has(item, "minimum tong") && box(item)),
    tstr_pin: quantity((item) => has(item, "tstr") && pin(item)),
    tstr_box: quantity((item) => has(item, "tstr") && box(item)),
    emi: quantity((item) => has(item, "emi indication")),
    min_wall: quantity((item) => has(item, "minimum wall") || has(item, "general wall loss")),
    reface_pin: quantity((item) => item.disposition === "Reface" && pin(item)),
    reface_box: quantity((item) => item.disposition === "Reface" && box(item)),
    hardband_pin: quantity((item) => item.disposition === "Hardband" && pin(item)),
    hardband_box: quantity((item) => item.disposition === "Hardband" && box(item)),
    repair_joints: quantity((item) => item.disposition === "Field Repair"),
    dbr_joints: quantity((item) => item.disposition === "DBR"),
  };
  return { ...result, total_damages: result.damage_threads_pin + result.damage_threads_box + result.bent_tube, total_dbr: result.min_tong_pin + result.min_tong_box + result.tstr_pin + result.tstr_box + result.emi + result.min_wall, total_refaces: result.reface_pin + result.reface_box, total_hardbands: result.hardband_pin + result.hardband_box };
}

async function loadCloseout(admin: ReturnType<typeof adminClient>, job: Row, requestedRunId = "") {
  const { data: runs, error: runsError } = await admin.from("titan_dti_job_runs").select("*").eq("job_id", job.id).order("run_date", { ascending: false }).order("started_at", { ascending: false });
  if (runsError) throw runsError;
  const run = (runs ?? []).find((item) => item.id === requestedRunId) ?? runs?.[0] ?? null;
  const [racksResult, calibrationsResult, summariesResult, debriefResult, deviationsResult, escalationsResult, defectsResult, refacingResult] = await Promise.all([
    run ? admin.from("titan_dti_rack_runs").select("*").eq("job_run_id", run.id).order("rack_number") : Promise.resolve({ data: [], error: null }),
    run ? admin.from("titan_dti_field_calibrations").select("*").eq("job_run_id", run.id).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    admin.from("dti_daily_summaries").select("id,summary_number,job_id,job_run_id,status,summary_date,total_joints_inspected").eq("job_id", job.id).order("summary_date", { ascending: false }),
    admin.from("titan_job_debriefs").select("*,completion_status,station_performance,action_items").eq("job_id", job.id).maybeSingle(),
    admin.from("titan_job_deviations").select("id,deviation_number,status,defect_type,written_confirmation,confirmation_document_id").eq("job_id", job.id).neq("status", "Voided"),
    run ? admin.from("titan_dti_borderline_escalations").select("id,escalation_number,status,condition_type").eq("job_run_id", run.id) : Promise.resolve({ data: [], error: null }),
    run ? admin.from("titan_dti_defect_decisions").select("*").eq("job_run_id", run.id).order("created_at") : Promise.resolve({ data: [], error: null }),
    run ? admin.from("titan_dti_connection_refacing").select("*").eq("job_run_id", run.id).order("created_at") : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [racksResult, calibrationsResult, summariesResult, debriefResult, deviationsResult, escalationsResult, defectsResult, refacingResult]) if (result.error) throw result.error;
  const racks = racksResult.data ?? [];
  const calibrations = calibrationsResult.data ?? [];
  const summary = (summariesResult.data ?? []).find((item) => item.job_run_id === run?.id) ?? null;
  const completeRacks = racks.filter((rack) => rack.status === "Complete").length;
  const completedJoints = racks.reduce((total, rack) => total + Number(rack.completed_joints || 0), 0);
  const finalOd = calibrations.some((entry) => entry.calibration_kind === "OD Gauge" && entry.checkpoint === "Job End" && entry.result === "Pass");
  const finalEmi = calibrations.some((entry) => entry.calibration_kind === "EMI Standard" && entry.checkpoint === "Final Standard" && entry.result === "Pass");
  const debrief = debriefResult.data ?? null;
  const deviations = deviationsResult.data ?? [];
  const openDeviations = deviations.filter((item) => ["Draft", "Submitted"].includes(item.status));
  const escalations = escalationsResult.data ?? [];
  const openEscalations = escalations.filter((item) => item.status !== "Resolved");
  const gates = [
    { key: "run", label: "Execution run complete", passed: run?.status === "Complete", detail: run ? `${run.run_date} / ${run.shift_name}` : "No execution run" },
    { key: "racks", label: "Every rack complete", passed: racks.length > 0 && completeRacks === racks.length, detail: `${completeRacks} of ${racks.length} racks` },
    { key: "od", label: "Final OD verification passed", passed: finalOd, detail: finalOd ? "Job End recorded" : "Job End check required" },
    { key: "emi", label: "Final EMI standard passed", passed: finalEmi, detail: finalEmi ? "Final Standard recorded" : "Final Standard check required" },
    { key: "escalations", label: "Borderline calls resolved", passed: !openEscalations.length, detail: `${openEscalations.length} open` },
    { key: "summary", label: "Daily Summary created", passed: Boolean(summary), detail: summary?.summary_number ?? "Create draft from execution" },
    { key: "debrief", label: "OMS-203 debrief complete", passed: debrief?.completion_status === "Complete", detail: debrief?.completion_status === "Complete" ? debrief.debrief_number : debrief ? `${debrief.debrief_number} draft` : "Closeout review required" },
    { key: "deviations", label: "No unresolved deviations", passed: !openDeviations.length, detail: `${openDeviations.length} open` },
  ];
  return { runs: runs ?? [], run, racks, calibrations, defectDecisions: defectsResult.data ?? [], connectionRefacing: refacingResult.data ?? [], summaries: summariesResult.data ?? [], summary, debrief, deviations: openDeviations, debriefCounts: { borderline: escalations.length, deviationAgreements: deviations.filter((item) => item.status === "Approved").length }, totals: { completedJoints, completeRacks, rackCount: racks.length }, gates, ready: gates.every((gate) => gate.passed) };
}

export async function GET(request: Request) {
  try {
    const admin = adminClient(); const authorization = await authorizeWade(request, admin); if ("error" in authorization) return authorization.error;
    const params = new URL(request.url).searchParams; const jobId = clean(params.get("jobId"));
    if (!validUuid(jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 });
    const job = await loadJob(admin, jobId); if (!job) return Response.json({ error: "This DTI job could not be found." }, { status: 404 });
    return Response.json({ ok: true, job, ...await loadCloseout(admin, job, clean(params.get("runId"))) });
  } catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_execution_closeout.sql before using DTI Closeout." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}

export async function POST(request: Request) {
  try {
    const admin = adminClient(); const authorization = await authorizeWade(request, admin); if ("error" in authorization) return authorization.error;
    const body = await request.json().catch(() => ({})) as Body; const jobId = clean(body.jobId); const runId = clean(body.runId); const action = normalized(body.action);
    if (!validUuid(jobId)) return Response.json({ error: "Select a valid connected DTI job." }, { status: 400 });
    const job = await loadJob(admin, jobId); if (!job) return Response.json({ error: "This DTI job could not be found." }, { status: 404 });

    if (action === "create-summary") {
      if (!validUuid(runId)) return Response.json({ error: "Select a valid completed execution run." }, { status: 400 });
      const closeout = await loadCloseout(admin, job, runId);
      if (!closeout.run || closeout.run.status !== "Complete") return Response.json({ error: "Complete this execution run before creating its Daily Summary." }, { status: 400 });
      if (closeout.summary) return Response.json({ ok: true, ...closeout });
      const descriptions = [...new Set(closeout.racks.map((rack: Row) => clean(rack.pipe_description)).filter(Boolean))];
      const defectTotals = defectRollup(closeout.defectDecisions);
      const completedRefaces = closeout.connectionRefacing.filter((item: Row) => item.route === "Field Reface");
      const refacePin = completedRefaces.filter((item: Row) => ["Pin", "Both"].includes(item.component_end)).reduce((total: number, item: Row) => total + Number(item.quantity || 0), 0);
      const refaceBox = completedRefaces.filter((item: Row) => ["Box", "Both"].includes(item.component_end)).reduce((total: number, item: Row) => total + Number(item.quantity || 0), 0);
      if (completedRefaces.length) { defectTotals.reface_pin = refacePin; defectTotals.reface_box = refaceBox; defectTotals.total_refaces = refacePin + refaceBox; }
      const rollup = { generatedAt: new Date().toISOString(), jobId, runId, rackCount: closeout.totals.rackCount, completedJoints: closeout.totals.completedJoints, defectDecisionCount: closeout.defectDecisions.length, refacingRecordCount: closeout.connectionRefacing.length, racks: closeout.racks.map((rack: Row) => ({ id: rack.id, rackNumber: rack.rack_number, pipeDescription: rack.pipe_description, completedJoints: rack.completed_joints })) };
      const base = `DTI-SUM-${dateStamp(closeout.run.run_date)}`;
      let saved: Row | null = null;
      for (let index = 0; index < 702 && !saved; index += 1) {
        const summaryNumber = `${base}${letterForIndex(index)}`;
        const { data, error } = await admin.from("dti_daily_summaries").insert({ summary_number: summaryNumber, job_id: jobId, job_run_id: runId, source_rollup: rollup, operator: job.operator_name || job.customer_name, contractor: job.customer_name, location: job.location_name || job.rig_name, summary_date: closeout.run.run_date, page_number: "1", page_total: "1", inspection_type: job.job_type, connection_size_type: descriptions.join("; ") || null, total_joints_inspected: closeout.totals.completedJoints, ...defectTotals, remarks: `Generated from ${job.job_number}, ${closeout.run.shift_name} shift. ${closeout.totals.rackCount} rack${closeout.totals.rackCount === 1 ? "" : "s"} completed; ${closeout.defectDecisions.length} OMS-105 decision${closeout.defectDecisions.length === 1 ? "" : "s"} recorded.`, inspected_by: closeout.run.crew_lead_name || authorization.fullName, status: "Draft", created_by: authorization.userId }).select("*").single();
        if (!error) saved = data;
        else if (error.code !== "23505") throw error;
      }
      if (!saved) throw new Error("TITAN could not reserve a Daily Summary number.");
      await admin.from("titan_job_events").insert({ job_id: jobId, event_type: "dti_summary_created", source_module: "dti", summary: `${saved.summary_number} created from completed execution run.`, after_value: { summaryId: saved.id, runId }, actor_id: authorization.userId });
      return Response.json({ ok: true, ...await loadCloseout(admin, job, runId) });
    }

    if (action === "save-debrief") {
      const repeatIssue = Boolean(body.repeatIssue); const repeatNote = clean(body.repeatNote); const finalize = Boolean(body.finalize);
      if (repeatIssue && !repeatNote) return Response.json({ error: "Describe the repeated issue before saving the debrief." }, { status: 400 });
      const substantive = [body.stationBehind, body.varianceDriver, body.wentWell, body.slowedBy, body.safetyObservations, body.grayAreaSummary, body.customerFeedback, body.repeatNote, body.lessonsLearned].some((value) => clean(value));
      if (!substantive) return Response.json({ error: "Record at least one meaningful closeout observation." }, { status: 400 });
      const stationPerformance = Array.isArray(body.stationPerformance) ? body.stationPerformance.filter((item): item is Row => Boolean(item && typeof item === "object")).map((item) => ({ station: clean(item.station), status: clean(item.status), driver: clean(item.driver) })) : [];
      const expectedStations = ["Tube Prep", "Connection Clean", "Inspect & Reface", "Dimensional", "EMI", "Setup / Teardown"];
      const actionItems = Array.isArray(body.actionItems) ? body.actionItems.filter((item): item is Row => Boolean(item && typeof item === "object")).map((item) => ({ lesson: clean(item.lesson), owner: clean(item.owner), dueDate: clean(item.dueDate) })).filter((item) => item.lesson || item.owner || item.dueDate) : [];
      const slowdownCategories = Array.isArray(body.slowdownCategories) ? [...new Set(body.slowdownCategories.map(clean).filter(Boolean))] : [];
      const crewSize = clean(body.crewSize) ? nonnegative(body.crewSize, "Crew size") : null;
      const kpaCompleted = optionalBoolean(body.kpaCompleted); const restockGenerated = optionalBoolean(body.restockListGenerated); const stopWorkUsed = optionalBoolean(body.stopWorkUsed); const jsaEffective = optionalBoolean(body.jsaEffective);
      const closeout = validUuid(runId) ? await loadCloseout(admin, job, runId) : null;
      const borderlineCount = closeout?.debriefCounts.borderline ?? nonnegative(body.borderlineCount, "Borderline count");
      const deviationCount = closeout?.debriefCounts.deviationAgreements ?? 0;
      if (finalize) {
        if (optionalBoolean(body.onPlan) === null || !crewSize || !clean(body.weatherConditions) || !clean(body.loaderCyclesStandbyTime)) return Response.json({ error: "Complete the crew, conditions, loader/standby time, and on-plan review." }, { status: 422 });
        if (stationPerformance.length !== expectedStations.length || stationPerformance.some((item, index) => item.station !== expectedStations[index] || !["Ahead", "On", "Behind"].includes(item.status) || (item.status === "Behind" && !item.driver))) return Response.json({ error: "Rate every OMS-203 station and explain each station that ran behind." }, { status: 422 });
        if (!clean(body.wentWell) || !clean(body.slowedBy) || !clean(body.equipmentFailures) || !clean(body.equipmentTaggedOut) || !clean(body.restockConsumables) || kpaCompleted === null || restockGenerated === null) return Response.json({ error: "Complete the performance, equipment, KPA, and restock review." }, { status: 422 });
        if (!clean(body.nearMissGoodCatch) || stopWorkUsed === null || (stopWorkUsed && !clean(body.stopWorkDescription)) || jsaEffective === null || (!jsaEffective && !clean(body.jsaUpdateNeeded))) return Response.json({ error: "Complete the near-miss, stop-work, and JSA safety review." }, { status: 422 });
        if (actionItems.length < 1 || actionItems.some((item) => !item.lesson || !item.owner || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate))) return Response.json({ error: "Add at least one complete lesson/action item with an owner and due date." }, { status: 422 });
        if (!clean(body.crewLeadSignoffName) || !clean(body.crewLeadSignedOn) || !clean(body.managerReviewName) || !clean(body.managerReviewedOn)) return Response.json({ error: "Crew Lead and Service Line Manager sign-off are required." }, { status: 422 });
        if (deviationCount > 0 && !Boolean(body.deviationAgreementsAttached)) return Response.json({ error: "Confirm every approved OMS-202 agreement is attached before completing closeout." }, { status: 422 });
        if (closeout?.deviations.length) return Response.json({ error: "Resolve every Draft or Submitted OMS-202 deviation before completing the debrief." }, { status: 422 });
      }
      const payload = { job_id: jobId, on_plan: optionalBoolean(body.onPlan), station_behind: nullable(body.stationBehind), variance_driver: nullable(body.varianceDriver), went_well: nullable(body.wentWell), slowed_by: nullable(body.slowedBy), safety_observations: nullable(body.safetyObservations), gray_area_summary: nullable(body.grayAreaSummary), borderline_count: borderlineCount, customer_feedback: nullable(body.customerFeedback), repeat_issue: repeatIssue, repeat_note: repeatIssue ? repeatNote : null, lessons_learned: nullable(body.lessonsLearned), action_owner_name: nullable(body.actionOwnerName), crew_size: crewSize, weather_conditions: nullable(body.weatherConditions), loader_cycles_standby_time: nullable(body.loaderCyclesStandbyTime), station_performance: stationPerformance, slowdown_categories: slowdownCategories, equipment_failures: nullable(body.equipmentFailures), equipment_tagged_out: nullable(body.equipmentTaggedOut), restock_consumables: nullable(body.restockConsumables), kpa_completed: kpaCompleted, restock_list_generated: restockGenerated, near_miss_good_catch: nullable(body.nearMissGoodCatch), stop_work_used: stopWorkUsed, stop_work_description: stopWorkUsed ? nullable(body.stopWorkDescription) : null, jsa_effective: jsaEffective, jsa_update_needed: jsaEffective === false ? nullable(body.jsaUpdateNeeded) : null, deviation_agreements_applicable: deviationCount > 0, deviation_agreements_attached: deviationCount > 0 ? Boolean(body.deviationAgreementsAttached) : null, deviation_agreement_count: deviationCount, action_items: actionItems, crew_lead_signoff_name: nullable(body.crewLeadSignoffName), crew_lead_signed_on: nullable(body.crewLeadSignedOn), manager_review_name: nullable(body.managerReviewName), manager_reviewed_on: nullable(body.managerReviewedOn), completion_status: finalize ? "Complete" : "Draft", finalized_at: finalize ? new Date().toISOString() : null, finalized_by: finalize ? authorization.userId : null, updated_by: authorization.userId };
      const { data: existing, error: existingError } = await admin.from("titan_job_debriefs").select("id,status,completion_status").eq("job_id", jobId).maybeSingle(); if (existingError) throw existingError;
      if (existing?.status === "Voided") return Response.json({ error: "A voided debrief cannot be edited." }, { status: 409 });
      if (existing?.completion_status === "Complete" && !finalize) return Response.json({ error: "A completed OMS-203 closeout cannot be returned to Draft." }, { status: 409 });
      const query = existing ? admin.from("titan_job_debriefs").update(payload).eq("id", existing.id) : admin.from("titan_job_debriefs").insert({ ...payload, created_by: authorization.userId });
      const { data: saved, error } = await query.select("*").single(); if (error) throw error;
      await admin.from("titan_job_events").insert({ job_id: jobId, event_type: finalize ? "debrief_completed" : existing ? "debrief_updated" : "debrief_created", source_module: "dti", summary: `${saved.debrief_number} ${finalize ? "completed" : existing ? "updated" : "created"} from DTI Closeout.`, after_value: saved, actor_id: authorization.userId });
      return Response.json({ ok: true, ...await loadCloseout(admin, job, runId) });
    }
    return Response.json({ error: "Select a valid DTI closeout action." }, { status: 400 });
  } catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_execution_closeout.sql before using DTI Closeout." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}
