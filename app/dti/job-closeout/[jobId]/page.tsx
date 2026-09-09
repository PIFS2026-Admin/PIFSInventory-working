"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import DtiProcedureMenu from "../../../components/DtiProcedureMenu";
import { goBackOrFallback } from "../../../../lib/navigation";
import { supabase } from "../../../../lib/supabase";
import styles from "./jobCloseout.module.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;
type Gate = { key: string; label: string; passed: boolean; detail: string };
type ApiResponse = { ok?: boolean; error?: string; job?: Row; runs?: Row[]; run?: Row | null; racks?: Row[]; calibrations?: Row[]; summary?: Row | null; debrief?: Row | null; deviations?: Row[]; totals?: { completedJoints: number; completeRacks: number; rackCount: number }; gates?: Gate[]; ready?: boolean };
type DebriefForm = { onPlan: string; stationBehind: string; varianceDriver: string; wentWell: string; slowedBy: string; safetyObservations: string; grayAreaSummary: string; borderlineCount: string; customerFeedback: string; repeatIssue: boolean; repeatNote: string; lessonsLearned: string; actionOwnerName: string };

const emptyDebrief: DebriefForm = { onPlan: "", stationBehind: "", varianceDriver: "", wentWell: "", slowedBy: "", safetyObservations: "", grayAreaSummary: "", borderlineCount: "0", customerFeedback: "", repeatIssue: false, repeatNote: "", lessonsLearned: "", actionOwnerName: "" };
function mapDebrief(row?: Row | null): DebriefForm { return row ? { onPlan: row.on_plan === null ? "" : String(Boolean(row.on_plan)), stationBehind: row.station_behind || "", varianceDriver: row.variance_driver || "", wentWell: row.went_well || "", slowedBy: row.slowed_by || "", safetyObservations: row.safety_observations || "", grayAreaSummary: row.gray_area_summary || "", borderlineCount: String(row.borderline_count ?? 0), customerFeedback: row.customer_feedback || "", repeatIssue: Boolean(row.repeat_issue), repeatNote: row.repeat_note || "", lessonsLearned: row.lessons_learned || "", actionOwnerName: row.action_owner_name || "" } : emptyDebrief; }

export default function DtiJobCloseoutPage() {
  const params = useParams<{ jobId: string }>(); const jobId = String(params.jobId ?? "");
  const [data, setData] = useState<ApiResponse | null>(null); const [form, setForm] = useState<DebriefForm>(emptyDebrief); const [message, setMessage] = useState("Loading DTI closeout..."); const [saving, setSaving] = useState(false);

  const load = useCallback(async (runId = "") => {
    setMessage("Loading DTI closeout...");
    try { const { data: auth } = await supabase.auth.getSession(); const token = auth.session?.access_token; if (!token) return window.location.assign("/login"); const response = await fetch(`/api/dti/job-closeout?jobId=${encodeURIComponent(jobId)}${runId ? `&runId=${encodeURIComponent(runId)}` : ""}`, { headers: { Authorization: `Bearer ${token}` } }); const body = await response.json() as ApiResponse; if (!response.ok) throw new Error(body.error || "TITAN could not load DTI closeout."); setData(body); setForm(mapDebrief(body.debrief)); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not load DTI closeout."); }
  }, [jobId]);
  useEffect(() => { if (!jobId) return; const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [jobId, load]);

  async function send(payload: Record<string, unknown>, success: string) {
    if (saving) return null; setSaving(true); setMessage("");
    try { const { data: auth } = await supabase.auth.getSession(); const token = auth.session?.access_token; if (!token) { window.location.assign("/login"); return null; } const response = await fetch("/api/dti/job-closeout", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobId, runId: data?.run?.id, ...payload }) }); const body = await response.json() as ApiResponse; if (!response.ok) throw new Error(body.error || "TITAN could not save DTI closeout."); setData(body); setForm(mapDebrief(body.debrief)); setMessage(success); return body; } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save DTI closeout."); return null; } finally { setSaving(false); }
  }
  async function createSummary() { const result = await send({ action: "create-summary" }, "Daily Summary draft is ready."); if (result?.summary?.id) window.location.assign(`/dti-summary?summaryId=${encodeURIComponent(result.summary.id)}`); }
  const update = (changes: Partial<DebriefForm>) => setForm((current) => ({ ...current, ...changes }));

  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}><div className={styles.title}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI / OMS-203</span><h1>Job Closeout</h1></div></div><div className={styles.headerActions}><button type="button" onClick={() => goBackOrFallback("/dti?view=jobs")}>Back</button>{data?.job ? <Link href={`/dti/job-execution/${encodeURIComponent(data.job.id)}`}>Execution</Link> : null}<Link href="/dti-summary">Daily Summaries</Link><DtiProcedureMenu procedures={[{ documentNumber: "OMS-203", label: "Post-Job Review" }, { documentNumber: "OMS-104", label: "Per-Rack Workflow" }]} /><button type="button" onClick={() => void load(data?.run?.id)}>Refresh</button></div></header>
    {data?.job ? <section className={styles.jobBand}><div><span>{data.job.job_number} / {data.job.lifecycle_status}</span><h2>{data.job.title}</h2><small>{data.job.customer_name || "No customer"} / {data.job.rig_name || "No rig"}</small></div><b data-ready={data.ready}>{data.ready ? "Closeout Ready" : "Closeout Incomplete"}</b></section> : null}
    {message ? <div className={message.includes("ready") || message.includes("saved") ? styles.success : styles.message}>{message}</div> : null}
    {data?.run ? <><section className={styles.runBar}><label><span>Execution Run</span><select value={data.run.id} onChange={(event) => void load(event.target.value)}>{data.runs?.map((run) => <option key={run.id} value={run.id}>{run.run_date} / {run.shift_name} / {run.status}</option>)}</select></label><div><span>Completed Joints</span><strong>{data.totals?.completedJoints ?? 0}</strong></div><div><span>Racks</span><strong>{data.totals?.completeRacks ?? 0} / {data.totals?.rackCount ?? 0}</strong></div></section>
      <section className={styles.gates}><div className={styles.sectionHead}><div><span>Closeout Control</span><h2>Readiness</h2></div><strong>{data.gates?.filter((gate) => gate.passed).length ?? 0} / {data.gates?.length ?? 0}</strong></div><div className={styles.gateGrid}>{data.gates?.map((gate) => <article key={gate.key} data-passed={gate.passed}><span aria-hidden="true">{gate.passed ? "OK" : "OPEN"}</span><div><strong>{gate.label}</strong><small>{gate.detail}</small></div></article>)}</div></section>
      <section className={styles.summaryPanel}><div><span>DTI Daily Summary</span><h2>{data.summary?.summary_number || "Create from completed execution"}</h2><p>The execution rollup seeds the job, rack descriptions, inspector, and completed joints. Inspection results remain editable on the standard summary.</p></div>{data.summary ? <Link className={styles.primary} href={`/dti-summary?summaryId=${encodeURIComponent(data.summary.id)}`}>Open Summary</Link> : <button className={styles.primary} type="button" disabled={saving || data.run.status !== "Complete"} onClick={() => void createSummary()}>Create Daily Summary</button>}</section>
      <section className={styles.debrief}><div className={styles.sectionHead}><div><span>OMS-203</span><h2>Post-Job Review</h2></div>{data.debrief?.debrief_number ? <strong>{data.debrief.debrief_number}</strong> : null}</div><div className={styles.formGrid}>
        <label><span>Was the job on plan?</span><select value={form.onPlan} onChange={(e) => update({ onPlan: e.target.value })}><option value="">Not answered</option><option value="true">Yes</option><option value="false">No</option></select></label>
        <label><span>Station Behind</span><input value={form.stationBehind} onChange={(e) => update({ stationBehind: e.target.value })} /></label>
        <label><span>Variance Driver</span><input value={form.varianceDriver} onChange={(e) => update({ varianceDriver: e.target.value })} /></label>
        <label><span>Borderline Count</span><input type="number" min="0" value={form.borderlineCount} onChange={(e) => update({ borderlineCount: e.target.value })} /></label>
        <label className={styles.wide}><span>What Went Well</span><textarea value={form.wentWell} onChange={(e) => update({ wentWell: e.target.value })} /></label>
        <label className={styles.wide}><span>What Slowed the Job</span><textarea value={form.slowedBy} onChange={(e) => update({ slowedBy: e.target.value })} /></label>
        <label className={styles.wide}><span>Safety Observations</span><textarea value={form.safetyObservations} onChange={(e) => update({ safetyObservations: e.target.value })} /></label>
        <label className={styles.wide}><span>Gray Areas / Borderline Decisions</span><textarea value={form.grayAreaSummary} onChange={(e) => update({ grayAreaSummary: e.target.value })} /></label>
        <label className={styles.wide}><span>Customer Feedback</span><textarea value={form.customerFeedback} onChange={(e) => update({ customerFeedback: e.target.value })} /></label>
        <label className={styles.check}><input type="checkbox" checked={form.repeatIssue} onChange={(e) => update({ repeatIssue: e.target.checked })} /><span>Repeated issue identified</span></label>
        {form.repeatIssue ? <label className={styles.wide}><span>Repeated Issue</span><textarea value={form.repeatNote} onChange={(e) => update({ repeatNote: e.target.value })} /></label> : null}
        <label className={styles.wide}><span>Lessons Learned</span><textarea value={form.lessonsLearned} onChange={(e) => update({ lessonsLearned: e.target.value })} /></label>
        <label><span>Action Owner</span><input value={form.actionOwnerName} onChange={(e) => update({ actionOwnerName: e.target.value })} /></label>
      </div><button className={styles.primary} type="button" disabled={saving} onClick={() => void send({ action: "save-debrief", ...form, onPlan: form.onPlan === "" ? "" : form.onPlan === "true" }, "OMS-203 debrief saved.")}>{saving ? "Saving..." : "Save Post-Job Review"}</button></section>
      {data.deviations?.length ? <section className={styles.deviations}><h2>Open Deviations</h2>{data.deviations.map((item) => <div key={item.id}><strong>{item.deviation_number}</strong><span>{item.defect_type}</span><b>{item.status}</b></div>)}</section> : null}
    </> : data && !message ? <div className={styles.empty}>No DTI execution run has been recorded for this job.</div> : null}
  </main>;
}
