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
function migrationMissing(error: unknown) { const value = normalized(errorMessage(error)); return value.includes("job_run_id") || value.includes("source_rollup") || value.includes("titan_dti_borderline_escalations") || value.includes("schema cache"); }

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

async function loadCloseout(admin: ReturnType<typeof adminClient>, job: Row, requestedRunId = "") {
  const { data: runs, error: runsError } = await admin.from("titan_dti_job_runs").select("*").eq("job_id", job.id).order("run_date", { ascending: false }).order("started_at", { ascending: false });
  if (runsError) throw runsError;
  const run = (runs ?? []).find((item) => item.id === requestedRunId) ?? runs?.[0] ?? null;
  const [racksResult, calibrationsResult, summariesResult, debriefResult, deviationsResult, escalationsResult] = await Promise.all([
    run ? admin.from("titan_dti_rack_runs").select("*").eq("job_run_id", run.id).order("rack_number") : Promise.resolve({ data: [], error: null }),
    run ? admin.from("titan_dti_field_calibrations").select("*").eq("job_run_id", run.id).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    admin.from("dti_daily_summaries").select("id,summary_number,job_id,job_run_id,status,summary_date,total_joints_inspected").eq("job_id", job.id).order("summary_date", { ascending: false }),
    admin.from("titan_job_debriefs").select("*").eq("job_id", job.id).maybeSingle(),
    admin.from("titan_job_deviations").select("id,deviation_number,status,defect_type").eq("job_id", job.id).in("status", ["Draft", "Submitted"]),
    run ? admin.from("titan_dti_borderline_escalations").select("id,escalation_number,status,condition_type").eq("job_run_id", run.id).neq("status", "Resolved") : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [racksResult, calibrationsResult, summariesResult, debriefResult, deviationsResult, escalationsResult]) if (result.error) throw result.error;
  const racks = racksResult.data ?? [];
  const calibrations = calibrationsResult.data ?? [];
  const summary = (summariesResult.data ?? []).find((item) => item.job_run_id === run?.id) ?? null;
  const completeRacks = racks.filter((rack) => rack.status === "Complete").length;
  const completedJoints = racks.reduce((total, rack) => total + Number(rack.completed_joints || 0), 0);
  const finalOd = calibrations.some((entry) => entry.calibration_kind === "OD Gauge" && entry.checkpoint === "Job End" && entry.result === "Pass");
  const finalEmi = calibrations.some((entry) => entry.calibration_kind === "EMI Standard" && entry.checkpoint === "Final Standard" && entry.result === "Pass");
  const debrief = debriefResult.data ?? null;
  const gates = [
    { key: "run", label: "Execution run complete", passed: run?.status === "Complete", detail: run ? `${run.run_date} / ${run.shift_name}` : "No execution run" },
    { key: "racks", label: "Every rack complete", passed: racks.length > 0 && completeRacks === racks.length, detail: `${completeRacks} of ${racks.length} racks` },
    { key: "od", label: "Final OD verification passed", passed: finalOd, detail: finalOd ? "Job End recorded" : "Job End check required" },
    { key: "emi", label: "Final EMI standard passed", passed: finalEmi, detail: finalEmi ? "Final Standard recorded" : "Final Standard check required" },
    { key: "escalations", label: "Borderline calls resolved", passed: !(escalationsResult.data ?? []).length, detail: `${(escalationsResult.data ?? []).length} open` },
    { key: "summary", label: "Daily Summary created", passed: Boolean(summary), detail: summary?.summary_number ?? "Create draft from execution" },
    { key: "debrief", label: "OMS-203 debrief recorded", passed: Boolean(debrief), detail: debrief?.debrief_number ?? "Closeout review required" },
    { key: "deviations", label: "No unresolved deviations", passed: !(deviationsResult.data ?? []).length, detail: `${(deviationsResult.data ?? []).length} open` },
  ];
  return { runs: runs ?? [], run, racks, calibrations, summaries: summariesResult.data ?? [], summary, debrief, deviations: deviationsResult.data ?? [], totals: { completedJoints, completeRacks, rackCount: racks.length }, gates, ready: gates.every((gate) => gate.passed) };
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
      const rollup = { generatedAt: new Date().toISOString(), jobId, runId, rackCount: closeout.totals.rackCount, completedJoints: closeout.totals.completedJoints, racks: closeout.racks.map((rack: Row) => ({ id: rack.id, rackNumber: rack.rack_number, pipeDescription: rack.pipe_description, completedJoints: rack.completed_joints })) };
      const base = `DTI-SUM-${dateStamp(closeout.run.run_date)}`;
      let saved: Row | null = null;
      for (let index = 0; index < 702 && !saved; index += 1) {
        const summaryNumber = `${base}${letterForIndex(index)}`;
        const { data, error } = await admin.from("dti_daily_summaries").insert({ summary_number: summaryNumber, job_id: jobId, job_run_id: runId, source_rollup: rollup, operator: job.operator_name || job.customer_name, contractor: job.customer_name, location: job.location_name || job.rig_name, summary_date: closeout.run.run_date, page_number: "1", page_total: "1", inspection_type: job.job_type, connection_size_type: descriptions.join("; ") || null, total_joints_inspected: closeout.totals.completedJoints, remarks: `Generated from ${job.job_number}, ${closeout.run.shift_name} shift. ${closeout.totals.rackCount} rack${closeout.totals.rackCount === 1 ? "" : "s"} completed.`, inspected_by: closeout.run.crew_lead_name || authorization.fullName, status: "Draft", created_by: authorization.userId }).select("*").single();
        if (!error) saved = data;
        else if (error.code !== "23505") throw error;
      }
      if (!saved) throw new Error("TITAN could not reserve a Daily Summary number.");
      await admin.from("titan_job_events").insert({ job_id: jobId, event_type: "dti_summary_created", source_module: "dti", summary: `${saved.summary_number} created from completed execution run.`, after_value: { summaryId: saved.id, runId }, actor_id: authorization.userId });
      return Response.json({ ok: true, ...await loadCloseout(admin, job, runId) });
    }

    if (action === "save-debrief") {
      const repeatIssue = Boolean(body.repeatIssue); const repeatNote = clean(body.repeatNote);
      if (repeatIssue && !repeatNote) return Response.json({ error: "Describe the repeated issue before saving the debrief." }, { status: 400 });
      const substantive = [body.stationBehind, body.varianceDriver, body.wentWell, body.slowedBy, body.safetyObservations, body.grayAreaSummary, body.customerFeedback, body.repeatNote, body.lessonsLearned].some((value) => clean(value));
      if (!substantive) return Response.json({ error: "Record at least one meaningful closeout observation." }, { status: 400 });
      const payload = { job_id: jobId, on_plan: body.onPlan === "" || body.onPlan === null || body.onPlan === undefined ? null : Boolean(body.onPlan), station_behind: nullable(body.stationBehind), variance_driver: nullable(body.varianceDriver), went_well: nullable(body.wentWell), slowed_by: nullable(body.slowedBy), safety_observations: nullable(body.safetyObservations), gray_area_summary: nullable(body.grayAreaSummary), borderline_count: nonnegative(body.borderlineCount, "Borderline count"), customer_feedback: nullable(body.customerFeedback), repeat_issue: repeatIssue, repeat_note: repeatIssue ? repeatNote : null, lessons_learned: nullable(body.lessonsLearned), action_owner_name: nullable(body.actionOwnerName), updated_by: authorization.userId };
      const { data: existing, error: existingError } = await admin.from("titan_job_debriefs").select("id,status").eq("job_id", jobId).maybeSingle(); if (existingError) throw existingError;
      if (existing?.status === "Voided") return Response.json({ error: "A voided debrief cannot be edited." }, { status: 409 });
      const query = existing ? admin.from("titan_job_debriefs").update(payload).eq("id", existing.id) : admin.from("titan_job_debriefs").insert({ ...payload, created_by: authorization.userId });
      const { data: saved, error } = await query.select("*").single(); if (error) throw error;
      await admin.from("titan_job_events").insert({ job_id: jobId, event_type: existing ? "debrief_updated" : "debrief_created", source_module: "dti", summary: `${saved.debrief_number} ${existing ? "updated" : "created"} from DTI Closeout.`, after_value: saved, actor_id: authorization.userId });
      return Response.json({ ok: true, ...await loadCloseout(admin, job, runId) });
    }
    return Response.json({ error: "Select a valid DTI closeout action." }, { status: 400 });
  } catch (error) { return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_execution_closeout.sql before using DTI Closeout." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 }); }
}
