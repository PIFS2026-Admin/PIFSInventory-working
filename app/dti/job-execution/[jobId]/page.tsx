"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import DtiProcedureMenu from "../../../components/DtiProcedureMenu";
import DtiEscalationPanel from "./DtiEscalationPanel";
import DtiDefectDecisionPanel, { type DefectDecision } from "./DtiDefectDecisionPanel";
import { goBackOrFallback } from "../../../../lib/navigation";
import { supabase } from "../../../../lib/supabase";
import styles from "./jobExecution.module.css";

type Job = { id: string; job_number: string; title: string; lifecycle_status: string; customer_name: string | null; rig_name: string | null };
type Phase = { number: number; name: string; reference: string };
type Run = { id: string; run_date: string; shift_name: string; crew_lead_name: string | null; setup_type: string; planned_joints: number; status: "Active" | "Paused" | "Complete"; started_at: string };
type Rack = { id: string; rack_number: number; rack_name: string | null; pipe_description: string | null; planned_joints: number; completed_joints: number; current_phase: number; status: "Not Started" | "In Progress" | "Hold" | "Complete"; hold_reason: string | null };
type Calibration = { id: string; calibration_kind: string; checkpoint: string; joint_number: number | null; result: "Pass" | "Fail"; reading_summary: string | null; performed_by_name: string; occurred_at: string; equipment_asset_id: string | null };
type Asset = { id: string; equipment_name: string; equipment_number: string; equipment_type: string; serial_number: string | null };
type Warning = { kind: string; severity: "Attention" | "Blocked"; message: string };
type Summary = { planned: number; completed: number; percent: number; holds: number; completeRacks: number; warnings: Warning[]; status: "On Track" | "Needs Attention" | "Blocked" };
type Escalation = { id: string; escalation_number: string; rack_run_id: string | null; component_ids: string; condition_type: string; component_location: string; operational_risk: string; inspector_recommendation: string; customer_decision: string | null; status: string; deviation_id: string | null; created_at: string };
type JobDocument = { id: string; display_name: string; document_type: string };
type ApiResponse = { ok?: boolean; job?: Job; phases?: Phase[]; runs?: Run[]; run?: Run | null; racks?: Rack[]; calibrations?: Calibration[]; assets?: Asset[]; escalations?: Escalation[]; documents?: JobDocument[]; defectDecisions?: DefectDecision[]; summary?: Summary; error?: string };

const today = new Date().toISOString().slice(0, 10);
const emptyRun = { runDate: today, shiftName: "Day", crewLeadName: "", setupType: "Side-by-Side", plannedJoints: "0", notes: "" };
const emptyRack = { rackId: "", rackNumber: "1", rackName: "", pipeDescription: "", plannedJoints: "0", completedJoints: "0", currentPhase: "1", status: "Not Started", holdReason: "" };
const emptyCalibration = { calibrationKind: "OD Gauge", checkpoint: "Job Start", jointNumber: "0", result: "Pass", performedByName: "", assetId: "", rackId: "", readingSummary: "", notes: "" };

function displayDate(value: string) { const date = new Date(`${value}${value.length === 10 ? "T12:00:00" : ""}`); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, value.length === 10 ? { dateStyle: "medium" } : { dateStyle: "short", timeStyle: "short" }); }

export default function DtiJobExecutionPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = String(params.jobId ?? "");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [message, setMessage] = useState("Loading job execution...");
  const [saving, setSaving] = useState(false);
  const [runForm, setRunForm] = useState(emptyRun);
  const [rackForm, setRackForm] = useState(emptyRack);
  const [calibrationForm, setCalibrationForm] = useState(emptyCalibration);

  const load = useCallback(async (runId = "") => {
    setMessage("Loading job execution...");
    try {
      const { data: auth } = await supabase.auth.getSession(); const token = auth.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch(`/api/dti/job-execution?jobId=${encodeURIComponent(jobId)}${runId ? `&runId=${encodeURIComponent(runId)}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as ApiResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not load job execution.");
      setData(body); setMessage("");
      setRackForm((current) => ({ ...current, rackNumber: String(Math.max(0, ...(body.racks ?? []).map((rack) => rack.rack_number)) + 1) }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not load job execution."); }
  }, [jobId]);

  useEffect(() => { if (!jobId) return; const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [jobId, load]);

  async function send(payload: Record<string, unknown>, success: string) {
    if (saving) return false;
    setSaving(true); setMessage("");
    try {
      const { data: auth } = await supabase.auth.getSession(); const token = auth.session?.access_token;
      if (!token) { window.location.assign("/login"); return false; }
      const request = await fetch("/api/dti/job-execution", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobId, runId: data?.run?.id, ...payload }) });
      const body = await request.json() as ApiResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not save job execution.");
      setData(body); setMessage(success); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save job execution."); return false; }
    finally { setSaving(false); }
  }

  async function createRun() { if (await send({ action: "create-run", ...runForm }, "DTI job run started.")) setRunForm(emptyRun); }
  async function saveRack() { if (await send({ action: "save-rack", ...rackForm }, "Rack progress saved.")) { const increment = rackForm.rackId ? 1 : 2; setRackForm({ ...emptyRack, rackNumber: String(Math.max(0, ...(data?.racks ?? []).map((rack) => rack.rack_number)) + increment) }); } }
  async function saveCalibration() { if (await send({ action: "calibration", ...calibrationForm }, "Field verification recorded.")) setCalibrationForm({ ...emptyCalibration, performedByName: calibrationForm.performedByName, jointNumber: String(data?.summary?.completed ?? 0) }); }
  function editRack(rack: Rack) { setRackForm({ rackId: rack.id, rackNumber: String(rack.rack_number), rackName: rack.rack_name || "", pipeDescription: rack.pipe_description || "", plannedJoints: String(rack.planned_joints), completedJoints: String(rack.completed_joints), currentPhase: String(rack.current_phase), status: rack.status, holdReason: rack.hold_reason || "" }); document.getElementById("rack-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  async function advanceRack(rack: Rack) {
    const nextPhase = Math.min(6, rack.current_phase + 1);
    const complete = rack.current_phase === 6;
    await send({ action: "save-rack", rackId: rack.id, rackNumber: rack.rack_number, rackName: rack.rack_name, pipeDescription: rack.pipe_description, plannedJoints: rack.planned_joints, completedJoints: complete ? rack.planned_joints : rack.completed_joints, currentPhase: nextPhase, status: complete ? "Complete" : "In Progress", holdReason: "" }, complete ? `Rack ${rack.rack_number} completed.` : `Rack ${rack.rack_number} advanced to Phase ${nextPhase}.`);
  }

  const run = data?.run; const summary = data?.summary;
  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}><div className={styles.title}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI / OMS-104 / OMS-108</span><h1>Job Execution</h1></div></div><div className={styles.headerActions}><button type="button" onClick={() => goBackOrFallback("/dti?view=jobs")}>Back</button>{data?.job ? <><Link href={`/dti/pre-job/${encodeURIComponent(data.job.id)}`}>Pre-Job</Link><Link href={`/dti/job-closeout/${encodeURIComponent(data.job.id)}`}>Closeout</Link></> : null}<Link href="/dti-summary">Daily Summary</Link><DtiProcedureMenu procedures={[{ documentNumber: "OMS-104", label: "Per-Rack Workflow" }, { documentNumber: "OMS-108", label: "EMI and UT Calibration" }, { documentNumber: "OMS-105", label: "Defect Decisions" }, { documentNumber: "OMS-106", label: "Dimensional Reference" }, { documentNumber: "OMS-107", label: "Connection and Refacing" }]} /><button type="button" onClick={() => void load(run?.id)}>Refresh</button></div></header>

    {data?.job ? <section className={styles.jobBand}><div><span>{data.job.job_number} / {data.job.lifecycle_status}</span><h2>{data.job.title}</h2><small>{data.job.customer_name || "No customer"} / {data.job.rig_name || "No rig"}</small></div>{summary ? <b data-status={summary.status}>{summary.status}</b> : null}</section> : null}
    {message ? <div className={message.includes("saved") || message.includes("started") || message.includes("recorded") || message.includes("advanced") || message.includes("completed") ? styles.success : styles.message}>{message}</div> : null}

    {!run && data ? <section className={styles.startPanel}><div className={styles.panelHead}><div><span>New Shift / Run</span><h2>Start Job Execution</h2></div></div><div className={styles.formGrid}><label><span>Run Date</span><input type="date" value={runForm.runDate} onChange={(event) => setRunForm({ ...runForm, runDate: event.target.value })} /></label><label><span>Shift</span><input value={runForm.shiftName} onChange={(event) => setRunForm({ ...runForm, shiftName: event.target.value })} /></label><label><span>Crew Lead</span><input value={runForm.crewLeadName} onChange={(event) => setRunForm({ ...runForm, crewLeadName: event.target.value })} /></label><label><span>Setup</span><select value={runForm.setupType} onChange={(event) => setRunForm({ ...runForm, setupType: event.target.value })}><option>Side-by-Side</option><option>Single Rack</option><option>Other</option></select></label><label><span>Planned Joints</span><input type="number" min="0" value={runForm.plannedJoints} onChange={(event) => setRunForm({ ...runForm, plannedJoints: event.target.value })} /></label><label className={styles.wide}><span>Notes</span><input value={runForm.notes} onChange={(event) => setRunForm({ ...runForm, notes: event.target.value })} /></label><button className={styles.primary} type="button" onClick={() => void createRun()} disabled={saving}>Start Run</button></div></section> : null}

    {run && summary ? <><section className={styles.runBar}><div><label><span>Run</span><select value={run.id} onChange={(event) => void load(event.target.value)}>{data?.runs?.map((item) => <option key={item.id} value={item.id}>{item.run_date} / {item.shift_name} / {item.status}</option>)}</select></label><div><span>{run.setup_type}</span><strong>{run.crew_lead_name || "No crew lead"}</strong></div></div><div className={styles.runActions}>{run.status !== "Active" ? <button type="button" onClick={() => void send({ action: "update-run", status: "Active" }, "Run activated.")}>Activate</button> : <button type="button" onClick={() => void send({ action: "update-run", status: "Paused" }, "Run paused.")}>Pause</button>}<button className={styles.primary} type="button" onClick={() => void send({ action: "update-run", status: "Complete" }, "Run completed.")}>Complete Run</button></div></section>
      <section className={styles.metrics}><article><span>Completed Joints</span><strong>{summary.completed}<small> / {summary.planned || "-"}</small></strong></article><article><span>Progress</span><strong>{summary.percent}%</strong></article><article><span>Complete Racks</span><strong>{summary.completeRacks}<small> / {data?.racks?.length ?? 0}</small></strong></article><article data-tone={summary.holds ? "blocked" : "ok"}><span>Racks on Hold</span><strong>{summary.holds}</strong></article></section>
      {summary.warnings.length ? <section className={styles.warnings}><div className={styles.panelHead}><div><span>Calibration Control</span><h2>Action Required</h2></div></div>{summary.warnings.map((warning, index) => <div key={`${warning.kind}-${index}`} data-severity={warning.severity}><b>{warning.kind}</b><span>{warning.message}</span></div>)}</section> : <div className={styles.onTrack}>OD, UT, and EMI checkpoints are current.</div>}

      <section className={styles.racks}><div className={styles.panelHead}><div><span>OMS-104</span><h2>Rack Progress</h2></div><strong>{data?.racks?.length ?? 0} racks</strong></div><div className={styles.rackGrid}>{data?.racks?.map((rack) => <article key={rack.id} data-status={rack.status}><div className={styles.rackHead}><div><span>Rack {rack.rack_number}</span><strong>{rack.rack_name || rack.pipe_description || "Unnamed rack"}</strong><small>{rack.pipe_description || "No pipe description"}</small></div><b>{rack.status}</b></div><div className={styles.phaseTrack}>{data.phases?.map((phase) => <div key={phase.number} data-active={phase.number === rack.current_phase} data-complete={phase.number < rack.current_phase || rack.status === "Complete"}><span>{phase.number}</span><small>{phase.name}</small></div>)}</div><div className={styles.rackTotals}><span>{rack.completed_joints} / {rack.planned_joints || "-"} joints</span><progress max={rack.planned_joints || 1} value={rack.completed_joints} /></div>{rack.hold_reason ? <p><strong>Hold:</strong> {rack.hold_reason}</p> : null}<div className={styles.rowActions}><button type="button" onClick={() => editRack(rack)}>Edit</button><button className={styles.primary} type="button" onClick={() => void advanceRack(rack)} disabled={rack.status === "Complete"}>{rack.current_phase === 6 ? "Complete Rack" : "Next Phase"}</button><button type="button" onClick={() => void send({ action: "delete-rack", rackId: rack.id }, `Rack ${rack.rack_number} removed.`)}>Remove</button></div></article>)}</div>{!data?.racks?.length ? <div className={styles.empty}>Add the first rack to begin tracking production.</div> : null}</section>

      <section id="rack-editor" className={styles.editor}><div className={styles.panelHead}><div><span>Rack Control</span><h2>{rackForm.rackId ? `Edit Rack ${rackForm.rackNumber}` : "Add Rack"}</h2></div>{rackForm.rackId ? <button type="button" onClick={() => setRackForm({ ...emptyRack, rackNumber: String(Math.max(0, ...(data?.racks ?? []).map((rack) => rack.rack_number)) + 1) })}>Cancel Edit</button> : null}</div><div className={styles.formGrid}><label><span>Rack Number</span><input type="number" min="1" value={rackForm.rackNumber} onChange={(event) => setRackForm({ ...rackForm, rackNumber: event.target.value })} /></label><label><span>Rack Name</span><input value={rackForm.rackName} onChange={(event) => setRackForm({ ...rackForm, rackName: event.target.value })} /></label><label className={styles.wide}><span>Pipe Description</span><input value={rackForm.pipeDescription} onChange={(event) => setRackForm({ ...rackForm, pipeDescription: event.target.value })} /></label><label><span>Planned Joints</span><input type="number" min="0" value={rackForm.plannedJoints} onChange={(event) => setRackForm({ ...rackForm, plannedJoints: event.target.value })} /></label><label><span>Completed Joints</span><input type="number" min="0" value={rackForm.completedJoints} onChange={(event) => setRackForm({ ...rackForm, completedJoints: event.target.value })} /></label><label><span>Current Phase</span><select value={rackForm.currentPhase} onChange={(event) => setRackForm({ ...rackForm, currentPhase: event.target.value })}>{data.phases?.map((phase) => <option key={phase.number} value={phase.number}>{phase.number}. {phase.name}</option>)}</select></label><label><span>Status</span><select value={rackForm.status} onChange={(event) => setRackForm({ ...rackForm, status: event.target.value })}><option>Not Started</option><option>In Progress</option><option>Hold</option><option>Complete</option></select></label>{rackForm.status === "Hold" ? <label className={styles.wide}><span>Hold Reason</span><input value={rackForm.holdReason} onChange={(event) => setRackForm({ ...rackForm, holdReason: event.target.value })} /></label> : null}<button className={styles.primary} type="button" onClick={() => void saveRack()} disabled={saving}>Save Rack</button></div></section>

      <section className={styles.calibrations}><div className={styles.panelHead}><div><span>OMS-108</span><h2>Field Calibration Log</h2></div><strong>{data?.calibrations?.length ?? 0} records</strong></div><div className={styles.formGrid}><label><span>Equipment / Check</span><select value={calibrationForm.calibrationKind} onChange={(event) => setCalibrationForm({ ...calibrationForm, calibrationKind: event.target.value })}><option>OD Gauge</option><option>UT Wall</option><option>EMI Standard</option></select></label><label><span>Checkpoint</span><select value={calibrationForm.checkpoint} onChange={(event) => setCalibrationForm({ ...calibrationForm, checkpoint: event.target.value })}><option>Job Start</option><option>25 Joints</option><option>50 Joints</option><option>Size Change</option><option>Equipment Interruption</option><option>Job End</option><option>Final Standard</option></select></label><label><span>Cumulative Joint #</span><input type="number" min="0" value={calibrationForm.jointNumber} onChange={(event) => setCalibrationForm({ ...calibrationForm, jointNumber: event.target.value })} /></label><label><span>Result</span><select value={calibrationForm.result} onChange={(event) => setCalibrationForm({ ...calibrationForm, result: event.target.value })}><option>Pass</option><option>Fail</option></select></label><label><span>Inspector</span><input value={calibrationForm.performedByName} onChange={(event) => setCalibrationForm({ ...calibrationForm, performedByName: event.target.value })} /></label><label><span>Equipment Asset</span><select value={calibrationForm.assetId} onChange={(event) => setCalibrationForm({ ...calibrationForm, assetId: event.target.value })}><option value="">Not selected</option>{data?.assets?.map((asset) => <option key={asset.id} value={asset.id}>{asset.equipment_number} / {asset.equipment_name}</option>)}</select></label><label><span>Rack</span><select value={calibrationForm.rackId} onChange={(event) => setCalibrationForm({ ...calibrationForm, rackId: event.target.value })}><option value="">Whole job</option>{data?.racks?.map((rack) => <option key={rack.id} value={rack.id}>Rack {rack.rack_number}</option>)}</select></label><label className={styles.wide}><span>Readings / Verification</span><input value={calibrationForm.readingSummary} onChange={(event) => setCalibrationForm({ ...calibrationForm, readingSummary: event.target.value })} placeholder="Three UT steps within tolerance, repeatable EMI signal..." /></label><button className={styles.primary} type="button" onClick={() => void saveCalibration()} disabled={saving}>Record Check</button></div><div className={styles.log}>{data?.calibrations?.map((entry) => <article key={entry.id} data-result={entry.result}><div><span>{entry.calibration_kind} / {entry.checkpoint}</span><strong>{entry.result}</strong></div><div><span>Joint</span><strong>{entry.joint_number ?? "-"}</strong></div><div><span>Inspector</span><strong>{entry.performed_by_name}</strong></div><div><span>Recorded</span><strong>{displayDate(entry.occurred_at)}</strong></div>{entry.reading_summary ? <p>{entry.reading_summary}</p> : null}</article>)}</div></section>
    </> : null}
    {run ? <><DtiDefectDecisionPanel jobId={jobId} runId={run.id} racks={data?.racks ?? []} decisions={data?.defectDecisions ?? []} onSaved={() => void load(run.id)} /><DtiEscalationPanel jobId={jobId} runId={run.id} racks={data?.racks ?? []} escalations={data?.escalations ?? []} documents={data?.documents ?? []} onSaved={() => void load(run.id)} /></> : null}
  </main>;
}
