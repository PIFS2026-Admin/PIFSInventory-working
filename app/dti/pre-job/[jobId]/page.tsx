"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import DtiProcedureMenu from "../../../components/DtiProcedureMenu";
import DtiJobScopePanel from "./DtiJobScopePanel";
import { goBackOrFallback } from "../../../../lib/navigation";
import { supabase } from "../../../../lib/supabase";
import styles from "./preJob.module.css";

type ResponseState = "" | "Complete" | "Needs Attention" | "Blocked" | "N/A";
type ItemResponse = { state: ResponseState; note: string; ownerName: string; dueDate: string };
type ChecklistItem = { code: string; section: string; text: string };
type Job = { id: string; job_number: string; title: string; lifecycle_status: string; customer_name: string | null; operator_name: string | null; rig_name: string | null; scheduled_start: string | null };
type Readiness = { readiness_status: "Ready" | "Needs Attention" | "Blocked"; responses: Record<string, ItemResponse>; total_items: number; complete_items: number; attention_items: number; blocked_items: number; finalized_at: string | null; updated_at: string };
type EquipmentReadiness = { status: "Ready" | "Needs Attention" | "Blocked"; blocked: number; attention: number; missing: string[] };
type ApiResponse = { ok?: boolean; job?: Job; checklist?: ChecklistItem[]; readiness?: Readiness | null; equipmentReadiness?: EquipmentReadiness | null; equipmentReady?: boolean; scopeReady?: boolean; scopeConfigured?: boolean; error?: string };

const emptyResponse: ItemResponse = { state: "", note: "", ownerName: "", dueDate: "" };
const statusOptions: ResponseState[] = ["", "Complete", "Needs Attention", "Blocked", "N/A"];

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  const parsed = new Date(`${value}${value.length === 10 ? "T12:00:00" : ""}`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function DtiPreJobReadinessPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = String(params.jobId ?? "");
  const [job, setJob] = useState<Job | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [responses, setResponses] = useState<Record<string, ItemResponse>>({});
  const [saved, setSaved] = useState<Readiness | null>(null);
  const [equipmentReadiness, setEquipmentReadiness] = useState<EquipmentReadiness | null>(null);
  const [equipmentReady, setEquipmentReady] = useState(true);
  const [scopeReady, setScopeReady] = useState(false);
  const [scopeConfigured, setScopeConfigured] = useState(true);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("Loading pre-job readiness...");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setMessage("Loading pre-job readiness...");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch(`/api/dti/pre-job?jobId=${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as ApiResponse;
      if (!request.ok || !body.job || !body.checklist) throw new Error(body.error || "TITAN could not load this readiness checklist.");
      const next: Record<string, ItemResponse> = {};
      body.checklist.forEach((item) => { next[item.code] = { ...emptyResponse, ...(body.readiness?.responses?.[item.code] ?? {}) }; });
      setJob(body.job); setChecklist(body.checklist); setResponses(next); setSaved(body.readiness ?? null);
      setEquipmentReadiness(body.equipmentReadiness ?? null); setEquipmentReady(body.equipmentReady !== false);
      setScopeReady(body.scopeReady === true); setScopeConfigured(body.scopeConfigured !== false);
      setOpenSections(new Set([body.checklist[0]?.section].filter(Boolean)));
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not load this readiness checklist."); }
  }, [jobId]);

  const handleScopeStatus = useCallback((ready: boolean, configured: boolean) => {
    setScopeReady(ready);
    setScopeConfigured(configured);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [jobId, load]);

  const sections = useMemo(() => [...new Set(checklist.map((item) => item.section))].map((section) => ({ section, items: checklist.filter((item) => item.section === section) })), [checklist]);
  const totals = useMemo(() => {
    const entries = checklist.map((item) => responses[item.code]?.state || "");
    const complete = entries.filter((state) => state === "Complete" || state === "N/A").length;
    const attention = entries.filter((state) => state === "Needs Attention").length;
    const blocked = entries.filter((state) => state === "Blocked").length;
    const unanswered = entries.filter((state) => !state).length;
    return { complete, attention, blocked, unanswered, status: blocked ? "Blocked" : attention || unanswered ? "Needs Attention" : "Ready" };
  }, [checklist, responses]);

  function update(code: string, patch: Partial<ItemResponse>) {
    setResponses((current) => ({ ...current, [code]: { ...(current[code] ?? emptyResponse), ...patch } }));
  }

  function markSectionComplete(section: string) {
    setResponses((current) => {
      const next = { ...current };
      checklist.filter((item) => item.section === section).forEach((item) => { next[item.code] = { ...(next[item.code] ?? emptyResponse), state: "Complete" }; });
      return next;
    });
  }

  async function save(action: "save" | "finalize") {
    if (saving) return;
    setSaving(true); setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch("/api/dti/pre-job", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobId, responses, action }) });
      const body = await request.json() as ApiResponse;
      if (!request.ok || !body.readiness) throw new Error(body.error || "TITAN could not save this readiness checklist.");
      setSaved(body.readiness);
      setMessage(action === "finalize" ? "Job marked Ready under OMS-101." : "Readiness progress saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save this readiness checklist."); }
    finally { setSaving(false); }
  }

  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}>
      <div className={styles.titleBlock}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI / OMS-101</span><h1>Pre-Job Readiness</h1></div></div>
      <div className={styles.headerActions}><button type="button" onClick={() => goBackOrFallback("/dti?view=jobs")}>Back</button>{job ? <Link href={`/crm/jobs/${encodeURIComponent(job.id)}`}>Open Connected Job</Link> : null}<DtiProcedureMenu procedures={[{ documentNumber: "OMS-101", label: "Pre-Job Planning" }, { documentNumber: "OMS-102", label: "Service Category & Scope" }, { documentNumber: "PFIS-IOM-001", label: "Inspection Operations Manual" }, { documentNumber: "HR-CM-001", label: "Competency Matrix" }]} /></div>
    </header>

    {job ? <section className={styles.jobBand}><div><span>{job.job_number} / {job.lifecycle_status}</span><h2>{job.title}</h2><p>{job.customer_name || "No customer"} / {job.rig_name || "No rig"} / {formatDate(job.scheduled_start)}</p></div><b data-status={totals.status}>{totals.status}</b></section> : null}

    {checklist.length ? <section className={styles.metrics}><article><span>Complete / N/A</span><strong>{totals.complete}<small> / {checklist.length}</small></strong></article><article><span>Unanswered</span><strong>{totals.unanswered}</strong></article><article data-tone="attention"><span>Needs Attention</span><strong>{totals.attention}</strong></article><article data-tone="blocked"><span>Blocked</span><strong>{totals.blocked}</strong></article></section> : null}

    {job ? <DtiJobScopePanel jobId={job.id} onStatusChange={handleScopeStatus} /> : null}

    {job ? <section className={styles.equipmentBand}><div><span>OMS-103 / OMS-108</span><strong>Equipment and Calibration Readiness</strong><small>{equipmentReady ? equipmentReadiness?.missing.length ? `${equipmentReadiness.missing.length} required equipment types are not assigned.` : equipmentReadiness?.status === "Ready" ? "All required equipment is assigned, calibrated, and verified." : "Equipment needs review before this job can be marked Ready." : "Run the equipment readiness SQL to activate this control."}</small></div><b data-status={equipmentReadiness?.status || "Not Configured"}>{equipmentReadiness?.status || "Not Configured"}</b><Link href={`/dti/equipment-readiness/${encodeURIComponent(job.id)}`}>Manage Equipment</Link></section> : null}

    {message ? <div className={message.includes("saved") || message.includes("marked Ready") ? styles.success : styles.message}>{message}</div> : null}

    <div className={styles.sections}>{sections.map(({ section, items }, index) => {
      const open = openSections.has(section);
      const answered = items.filter((item) => responses[item.code]?.state).length;
      return <section key={section} className={styles.section}>
        <div className={styles.sectionHeader}><button type="button" className={styles.sectionToggle} onClick={() => setOpenSections((current) => { const next = new Set(current); if (next.has(section)) next.delete(section); else next.add(section); return next; })}><span>{open ? "v" : ">"}</span><b>{index + 1}. {section}</b><small>{answered} / {items.length}</small></button><button type="button" className={styles.completeSection} onClick={() => markSectionComplete(section)}>Complete Section</button></div>
        {open ? <div className={styles.items}>{items.map((item) => {
          const response = responses[item.code] ?? emptyResponse;
          const exception = response.state === "Needs Attention" || response.state === "Blocked";
          return <article key={item.code} data-state={response.state || "Unanswered"}>
            <div className={styles.itemName}><span>{item.code}</span><strong>{item.text}</strong></div>
            <label><span>Status</span><select value={response.state} onChange={(event) => update(item.code, { state: event.target.value as ResponseState })}>{statusOptions.map((option) => <option key={option || "blank"} value={option}>{option || "Select status"}</option>)}</select></label>
            {exception ? <div className={styles.exceptionFields}><label><span>Exception / Action Needed</span><input value={response.note} onChange={(event) => update(item.code, { note: event.target.value })} /></label><label><span>Owner</span><input value={response.ownerName} onChange={(event) => update(item.code, { ownerName: event.target.value })} /></label><label><span>Due Date</span><input type="date" value={response.dueDate} onChange={(event) => update(item.code, { dueDate: event.target.value })} /></label></div> : null}
          </article>;
        })}</div> : null}
      </section>;
    })}</div>

    {checklist.length ? <footer className={styles.actions}><div><span>OMS-101 readiness</span><strong>{totals.status}</strong><small>{scopeConfigured ? scopeReady ? "OMS-102 scope confirmed" : "OMS-102 scope must be confirmed" : "Run the OMS-102 scope SQL"}</small>{saved?.updated_at ? <small>Last saved {new Date(saved.updated_at).toLocaleString()}</small> : null}</div><button type="button" onClick={() => void save("save")} disabled={saving}>{saving ? "Saving..." : "Save Progress"}</button><button type="button" className={styles.primary} onClick={() => void save("finalize")} disabled={saving || totals.status !== "Ready" || !scopeReady || !equipmentReady || equipmentReadiness?.status !== "Ready"}>Mark Ready</button></footer> : null}
  </main>;
}
