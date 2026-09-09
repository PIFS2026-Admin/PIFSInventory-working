"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DtiProcedureMenu from "../components/DtiProcedureMenu";
import { goBackOrFallback } from "../../lib/navigation";
import { supabase } from "../../lib/supabase";
import styles from "./field-audits/audits.module.css";

type Rating = "" | "C" | "NI" | "NC" | "NA";
type ChecklistItem = { item_code: string; section_code: string; section_title: string; item_text: string; reference_text: string | null; is_critical: boolean; sort_order: number };
type AuditItem = ChecklistItem & { id: string; field_audit_id: string; rating: Exclude<Rating, "">; score: number | null; note: string | null };
type Audit = { id: string; audit_number: string; job_id: string; audit_date: string; service_line: string; crew_lead_name: string; auditor_name: string; overall_percent: number; critical_nc_count: number; status_band: string; notes: string | null; items: AuditItem[] };
type Finding = { id: string; finding_number: string; field_audit_id: string; job_id: string; severity: "NI" | "NC"; finding_text: string; corrective_action: string | null; owner_id: string | null; owner_name: string | null; due_date: string | null; finding_status: "Open" | "Action Assigned" | "Closed"; closure_evidence_document_id: string | null; created_at: string };
type Job = { id: string; job_number: string; title: string; service_line: string; lifecycle_status: string; customer_name: string | null; operator_name: string | null; rig_name: string | null; scheduled_start: string | null };
type Person = { id: string; full_name: string; email: string | null; role: string; department: string | null };
type JobDocument = { id: string; job_id: string; document_type: string; display_name: string; created_at: string };
type Readiness = { job_id: string; readiness_status: "Ready" | "Needs Attention" | "Blocked"; complete_items: number; total_items: number; finalized_at: string | null; updated_at: string };
type AuditResponse = { ok?: boolean; metrics?: { audits: number; actionRequired: number; openFindings: number; overdue: number }; checklist?: ChecklistItem[]; audits?: Audit[]; findings?: Finding[]; jobs?: Job[]; readiness?: Readiness[]; readinessReady?: boolean; people?: Person[]; documents?: JobDocument[]; error?: string };
type FindingForm = { correctiveAction: string; ownerId: string; dueDate: string; evidenceDocumentId: string };
type ManagementTab = "overview" | "jobs" | "findings" | "audits";

const emptyFindingForm: FindingForm = { correctiveAction: "", ownerId: "", dueDate: "", evidenceDocumentId: "" };
const ratingDisplay: Record<Exclude<Rating, "">, string> = { C: "3", NI: "2", NC: "1", NA: "N/A" };

function normalized(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(`${value}${value.length === 10 ? "T12:00:00" : ""}`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function DtiManagementWorkspace() {
  const [response, setResponse] = useState<AuditResponse | null>(null);
  const [message, setMessage] = useState("Loading DTI management...");
  const [tab, setTab] = useState<ManagementTab>("overview");
  const [showNewAudit, setShowNewAudit] = useState(false);
  const [jobId, setJobId] = useState("");
  const [crewLeadId, setCrewLeadId] = useState("");
  const [auditDate, setAuditDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["A"]));
  const [expandedAudit, setExpandedAudit] = useState("");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [findingMode, setFindingMode] = useState<"assign" | "close" | "view">("assign");
  const [findingForm, setFindingForm] = useState<FindingForm>(emptyFindingForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Open work");
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const loadAudits = useCallback(async () => {
    setMessage("Loading field audits...");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch("/api/dti/field-audits", { headers: { Authorization: `Bearer ${token}` } });
      const body = (await request.json().catch(() => ({}))) as AuditResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not load Field Audits.");
      setResponse(body);
      setMessage("");
    } catch (error) {
      setResponse(null);
      setMessage(error instanceof Error ? error.message : "TITAN could not load Field Audits.");
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void loadAudits(), 0); return () => window.clearTimeout(timer); }, [loadAudits]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (!requested || !["overview", "jobs", "findings", "audits"].includes(requested)) return;
    const timer = window.setTimeout(() => setTab(requested as ManagementTab), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const checklist = useMemo(() => response?.checklist ?? [], [response?.checklist]);
  const audits = useMemo(() => response?.audits ?? [], [response?.audits]);
  const findings = useMemo(() => response?.findings ?? [], [response?.findings]);
  const jobs = useMemo(() => response?.jobs ?? [], [response?.jobs]);
  const people = useMemo(() => response?.people ?? [], [response?.people]);
  const documents = useMemo(() => response?.documents ?? [], [response?.documents]);
  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const readinessByJob = useMemo(() => new Map((response?.readiness ?? []).map((item) => [item.job_id, item])), [response?.readiness]);
  const sections = useMemo(() => [...new Set(checklist.map((item) => item.section_code))].map((code) => ({ code, title: checklist.find((item) => item.section_code === code)?.section_title || code, items: checklist.filter((item) => item.section_code === code) })), [checklist]);

  const scorePreview = useMemo(() => {
    const rated = checklist.filter((item) => ratings[item.item_code] && ratings[item.item_code] !== "NA");
    const points = rated.reduce((sum, item) => sum + (ratings[item.item_code] === "C" ? 3 : ratings[item.item_code] === "NI" ? 2 : 1), 0);
    const percent = rated.length ? Math.round((points / (rated.length * 3)) * 10000) / 100 : 0;
    const critical = checklist.filter((item) => item.is_critical && ratings[item.item_code] === "NC").length;
    const band = critical ? "Action Required" : percent >= 90 ? "On Standard" : percent >= 75 ? "Watch" : "Below Standard";
    return { completed: checklist.filter((item) => Boolean(ratings[item.item_code])).length, percent, critical, band };
  }, [checklist, ratings]);

  const visibleFindings = useMemo(() => {
    const query = normalized(search);
    return findings.filter((finding) => {
      if (statusFilter === "Open work" && finding.finding_status === "Closed") return false;
      if (statusFilter !== "Open work" && statusFilter !== "All statuses" && finding.finding_status !== statusFilter) return false;
      const job = jobsById.get(finding.job_id);
      return !query || [finding.finding_number, finding.finding_text, finding.corrective_action, finding.owner_name, job?.title, job?.job_number, job?.customer_name, job?.rig_name].some((value) => normalized(value).includes(query));
    });
  }, [findings, jobsById, search, statusFilter]);

  const visibleAudits = useMemo(() => {
    const query = normalized(search);
    return audits.filter((audit) => { const job = jobsById.get(audit.job_id); return !query || [audit.audit_number, audit.crew_lead_name, audit.auditor_name, audit.status_band, job?.title, job?.job_number, job?.customer_name, job?.rig_name].some((value) => normalized(value).includes(query)); });
  }, [audits, jobsById, search]);
  const visibleJobs = useMemo(() => {
    const query = normalized(search);
    return jobs.filter((job) => !query || [job.job_number, job.title, job.customer_name, job.operator_name, job.rig_name, job.lifecycle_status].some((value) => normalized(value).includes(query)));
  }, [jobs, search]);

  function chooseTab(nextTab: ManagementTab) {
    setTab(nextTab);
    setSearch("");
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextTab);
    window.history.replaceState({}, "", url);
  }

  function startAudit(selectedJobId = "") {
    resetAudit();
    setJobId(selectedJobId);
    setShowNewAudit(true);
    setActionMessage("");
  }

  function resetAudit() {
    setJobId(""); setCrewLeadId(""); setAuditDate(new Date().toISOString().slice(0, 10)); setNotes(""); setRatings({}); setItemNotes({}); setOpenSections(new Set(["A"]));
  }

  function setSectionRating(sectionCode: string, rating: Exclude<Rating, "">) {
    const next = { ...ratings };
    checklist.filter((item) => item.section_code === sectionCode).forEach((item) => { next[item.item_code] = rating; });
    setRatings(next);
  }

  async function authenticatedRequest(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    if (saving) return false;
    setSaving(true); setActionMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { window.location.assign("/login"); return false; }
      const request = await fetch("/api/dti/field-audits", { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await request.json().catch(() => ({}))) as { error?: string };
      if (!request.ok) throw new Error(body.error || "TITAN could not save this audit record.");
      await loadAudits(); return true;
    } catch (error) { setActionMessage(error instanceof Error ? error.message : "TITAN could not save this audit record."); return false; }
    finally { setSaving(false); }
  }

  async function fileAudit() {
    const saved = await authenticatedRequest("POST", { jobId, crewLeadId, auditDate, notes, items: checklist.map((item) => ({ item_code: item.item_code, rating: ratings[item.item_code] || "", note: itemNotes[item.item_code] || "" })) });
    if (saved) { setActionMessage("Field audit filed and findings created."); setShowNewAudit(false); chooseTab("findings"); resetAudit(); }
  }

  function openFinding(finding: Finding, mode: "assign" | "close" | "view") {
    setSelectedFinding(finding); setFindingMode(mode); setActionMessage(""); setFindingForm({ correctiveAction: finding.corrective_action || "", ownerId: finding.owner_id || "", dueDate: finding.due_date || "", evidenceDocumentId: finding.closure_evidence_document_id || "" });
  }

  async function saveFinding() {
    if (!selectedFinding) return;
    const saved = await authenticatedRequest("PATCH", { action: findingMode, findingId: selectedFinding.id, ...findingForm });
    if (saved) { setActionMessage(findingMode === "close" ? "Finding closed with evidence." : "Corrective action assigned."); setSelectedFinding(null); setFindingForm(emptyFindingForm); }
  }

  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}><div className={styles.titleBlock}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI</span><h1>DTI Management</h1></div></div><div className={styles.headerActions}><button type="button" onClick={() => goBackOrFallback("/service-lines/dti")}>Back</button><Link href="/dti/job-reviews">Historical Job Reviews</Link><Link href="/dti/competency">Competency</Link><DtiProcedureMenu procedures={[{ documentNumber: "PFIS-IOM-001", label: "Inspection Operations Manual" }, { documentNumber: "OMS-201", label: "Field Audit" }, { documentNumber: "OMS-202", label: "Deviation Agreement" }, { documentNumber: "OMS-203", label: "Post-Job Debrief" }]} /><button type="button" onClick={() => void loadAudits()}>Refresh</button></div></header>

    {response?.metrics ? <section className={styles.metrics}><article><span>Filed Audits</span><strong>{response.metrics.audits}</strong></article><article className={response.metrics.actionRequired ? styles.alertMetric : ""}><span>Action Required</span><strong>{response.metrics.actionRequired}</strong></article><article><span>Open Findings</span><strong>{response.metrics.openFindings}</strong></article><article className={response.metrics.overdue ? styles.alertMetric : ""}><span>Overdue</span><strong>{response.metrics.overdue}</strong></article></section> : null}

    <section className={styles.toolbar}><div className={styles.tabs}><button className={tab === "overview" ? styles.activeTab : ""} type="button" onClick={() => chooseTab("overview")}>Overview</button><button className={tab === "jobs" ? styles.activeTab : ""} type="button" onClick={() => chooseTab("jobs")}>Jobs</button><button className={tab === "findings" ? styles.activeTab : ""} type="button" onClick={() => chooseTab("findings")}>Corrective Actions</button><button className={tab === "audits" ? styles.activeTab : ""} type="button" onClick={() => chooseTab("audits")}>Audit History</button></div>{tab === "overview" ? <div /> : <label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Job, customer, rig, lead, finding..." /></label>}{tab === "findings" ? <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Open work</option><option>Open</option><option>Action Assigned</option><option>Closed</option><option>All statuses</option></select></label> : <div />}<button className={styles.primaryButton} type="button" onClick={() => startAudit()}>New Field Audit</button></section>
    {actionMessage && !selectedFinding ? <div className={styles.actionMessage}>{actionMessage}</div> : null}
    {message ? <section className={styles.message}>{message}</section> : null}
    {!message && tab === "overview" ? <section className={styles.overviewGrid}>
      <article className={styles.overviewPanel}><div className={styles.panelHead}><div><span>Current Work</span><h2>Needs Attention</h2></div><button type="button" onClick={() => chooseTab("findings")}>View All</button></div><div className={styles.overviewList}>{findings.filter((finding) => finding.finding_status !== "Closed").slice(0, 8).map((finding) => { const job = jobsById.get(finding.job_id); return <button key={finding.id} type="button" data-severity={finding.severity} onClick={() => openFinding(finding, "assign")}><span>{finding.finding_number}</span><strong>{finding.finding_text}</strong><small>{job?.job_number || "Connected job"} / {finding.owner_name || "Unassigned"} / {formatDate(finding.due_date)}</small></button>; })}{!findings.some((finding) => finding.finding_status !== "Closed") ? <div className={styles.empty}>No open corrective actions.</div> : null}</div></article>
      <article className={styles.overviewPanel}><div className={styles.panelHead}><div><span>Connected CRM</span><h2>DTI Jobs</h2></div><button type="button" onClick={() => chooseTab("jobs")}>View All</button></div><div className={styles.overviewList}>{jobs.slice(0, 8).map((job) => { const readiness = readinessByJob.get(job.id); return <button key={job.id} type="button" onClick={() => window.location.assign(`/dti/pre-job/${encodeURIComponent(job.id)}`)}><span>{job.job_number}</span><strong>{job.title}</strong><b data-readiness={readiness?.readiness_status || "Not Started"}>{readiness?.readiness_status || "Pre-Job Not Started"}</b><small>{job.customer_name || "No customer"} / {job.rig_name || "No rig"} / {job.lifecycle_status}</small></button>; })}{!jobs.length ? <div className={styles.empty}>No connected DTI jobs.</div> : null}</div></article>
      <article className={`${styles.overviewPanel} ${styles.fullPanel}`}><div className={styles.panelHead}><div><span>OMS-201</span><h2>Recent Field Audits</h2></div><button type="button" onClick={() => chooseTab("audits")}>Audit History</button></div><div className={styles.auditSnapshot}>{audits.slice(0, 6).map((audit) => { const job = jobsById.get(audit.job_id); return <button key={audit.id} type="button" onClick={() => { setExpandedAudit(audit.id); chooseTab("audits"); }}><span>{audit.audit_number}</span><strong>{job?.title || "Connected job"}</strong><b data-band={audit.status_band}>{audit.status_band}</b><small>{Number(audit.overall_percent).toFixed(1)}% / {audit.crew_lead_name} / {formatDate(audit.audit_date)}</small></button>; })}{!audits.length ? <div className={styles.empty}>No field audits have been filed.</div> : null}</div></article>
    </section> : null}
    {!message && tab === "jobs" ? <section className={styles.listSection}>{response?.readinessReady === false ? <div className={styles.actionMessage}>Run supabase/titan_dti_pre_job_readiness.sql to activate OMS-101 readiness tracking.</div> : null}<div className={styles.resultCount}>{visibleJobs.length} connected DTI jobs</div><div className={styles.jobList}>{visibleJobs.map((job) => { const jobAudits = audits.filter((audit) => audit.job_id === job.id).length; const openFindings = findings.filter((finding) => finding.job_id === job.id && finding.finding_status !== "Closed").length; const readiness = readinessByJob.get(job.id); return <article key={job.id}><div><span>{job.job_number} / {job.lifecycle_status}</span><strong>{job.title}</strong><small>{job.customer_name || "No customer"} / {job.rig_name || "No rig"} / {formatDate(job.scheduled_start)}</small></div><dl><div><dt>Pre-Job</dt><dd className={styles.readinessValue} data-readiness={readiness?.readiness_status || "Not Started"}>{readiness?.readiness_status || "Not Started"}</dd></div><div><dt>Audits</dt><dd>{jobAudits}</dd></div><div><dt>Open Findings</dt><dd>{openFindings}</dd></div></dl><div className={styles.itemActions}><Link href={`/dti/pre-job/${encodeURIComponent(job.id)}`}>Pre-Job</Link><Link href={`/dti/equipment-readiness/${encodeURIComponent(job.id)}`}>Equipment</Link><Link href={`/dti/job-execution/${encodeURIComponent(job.id)}`}>Execution</Link><Link href={`/crm/jobs/${encodeURIComponent(job.id)}`}>Open Job</Link><button className={styles.primaryButton} type="button" onClick={() => startAudit(job.id)}>New Audit</button></div></article>; })}</div>{!visibleJobs.length ? <div className={styles.empty}>No connected DTI jobs match this search.</div> : null}</section> : null}
    {!message && tab === "findings" ? <section className={styles.listSection}><div className={styles.resultCount}>{visibleFindings.length} findings</div><div className={styles.findingList}>{visibleFindings.map((finding) => { const job = jobsById.get(finding.job_id); const overdue = finding.finding_status !== "Closed" && Boolean(finding.due_date) && finding.due_date! < new Date().toISOString().slice(0, 10); return <article key={finding.id} className={finding.severity === "NC" ? styles.ncFinding : styles.niFinding}><div className={styles.findingHeader}><div><span>{finding.finding_number} / Grade {ratingDisplay[finding.severity]}</span><strong>{finding.finding_text}</strong></div><b data-status={finding.finding_status}>{finding.finding_status}</b></div><dl><div><dt>Job</dt><dd><Link href={`/crm/jobs/${encodeURIComponent(finding.job_id)}`}>{job?.title || "Open job"}</Link></dd></div><div><dt>Owner</dt><dd>{finding.owner_name || "Unassigned"}</dd></div><div><dt>Due</dt><dd className={overdue ? styles.overdue : ""}>{formatDate(finding.due_date)}</dd></div></dl>{finding.corrective_action ? <p><strong>Corrective action:</strong> {finding.corrective_action}</p> : null}<div className={styles.itemActions}>{finding.finding_status === "Open" ? <button type="button" onClick={() => openFinding(finding, "assign")}>Assign Action</button> : finding.finding_status === "Action Assigned" ? <><button type="button" onClick={() => openFinding(finding, "assign")}>Edit Action</button><button className={styles.primaryButton} type="button" onClick={() => openFinding(finding, "close")}>Close with Evidence</button></> : <button type="button" onClick={() => openFinding(finding, "view")}>View Closure</button>}</div></article>; })}</div>{!visibleFindings.length ? <div className={styles.empty}>No findings match these filters.</div> : null}</section> : null}
    {!message && tab === "audits" ? <section className={styles.listSection}><div className={styles.resultCount}>{visibleAudits.length} audits</div><div className={styles.auditList}>{visibleAudits.map((audit) => { const job = jobsById.get(audit.job_id); const open = expandedAudit === audit.id; return <article key={audit.id}><button className={styles.auditSummary} type="button" onClick={() => setExpandedAudit(open ? "" : audit.id)}><div><span>{audit.audit_number} / {formatDate(audit.audit_date)}</span><strong>{job?.title || "Connected job"}</strong><small>{audit.crew_lead_name} / {audit.service_line}</small></div><div><b data-band={audit.status_band}>{audit.status_band}</b><strong>{Number(audit.overall_percent).toFixed(1)}%</strong><span>{open ? "Close" : "Details"}</span></div></button>{open ? <div className={styles.auditDetails}>{audit.items.map((item) => <div key={item.id} data-rating={item.rating}><span>{item.item_code}</span><strong>{item.item_text}{item.is_critical ? " *" : ""}</strong><b>{ratingDisplay[item.rating]}</b>{item.note ? <small>{item.note}</small> : null}</div>)}</div> : null}</article>; })}</div>{!visibleAudits.length ? <div className={styles.empty}>No audits match this search.</div> : null}</section> : null}

    {showNewAudit ? <div className={styles.modalBackdrop}><section className={`${styles.modal} ${styles.auditModal}`} role="dialog" aria-modal="true"><div className={styles.modalHeader}><div><span>OMS-201 / 3 = Meets Standard / 2 = Needs Improvement / 1 = Noncompliant / N/A = Not Scored</span><h2>New Field Audit</h2></div><button type="button" onClick={() => setShowNewAudit(false)} aria-label="Close">X</button></div><div className={styles.auditSetup}><label><span>Connected Job</span><select value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">Select job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.job_number} / {job.title} / {job.service_line}</option>)}</select></label><label><span>Crew Lead</span><select value={crewLeadId} onChange={(event) => setCrewLeadId(event.target.value)}><option value="">Select crew lead</option>{people.map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.department ? ` / ${person.department}` : ""}</option>)}</select></label><label><span>Audit Date</span><input type="date" value={auditDate} onChange={(event) => setAuditDate(event.target.value)} /></label><label className={styles.fullField}><span>Audit Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><div className={styles.scoreBar}><div><span>Completed</span><strong>{scorePreview.completed} / {checklist.length}</strong></div><div><span>Score</span><strong>{scorePreview.percent.toFixed(1)}%</strong></div><div><span>Critical Grade 1</span><strong>{scorePreview.critical}</strong></div><div><span>Standing</span><strong data-band={scorePreview.band}>{scorePreview.band}</strong></div></div><div className={styles.checklist}>{sections.map((section) => { const open = openSections.has(section.code); const completed = section.items.filter((item) => ratings[item.item_code]).length; return <section key={section.code}><button className={styles.sectionToggle} type="button" onClick={() => setOpenSections((current) => { const next = new Set(current); if (next.has(section.code)) next.delete(section.code); else next.add(section.code); return next; })}><span>{section.code}</span><strong>{section.title}</strong><small>{completed}/{section.items.length} / {open ? "Close" : "Open"}</small></button>{open ? <div className={styles.checkItems}><div className={styles.sectionFill}><span>Set entire section</span>{(["C","NI","NC","NA"] as const).map((rating) => <button key={rating} type="button" onClick={() => setSectionRating(section.code, rating)}>{ratingDisplay[rating]}</button>)}</div>{section.items.map((item) => <article key={item.item_code}><div className={styles.itemText}><span>{item.item_code}{item.is_critical ? " * Critical" : ""}</span><strong>{item.item_text}</strong><small>{item.reference_text}</small></div><div className={styles.ratingButtons}>{(["C","NI","NC","NA"] as const).map((rating) => <button key={rating} className={ratings[item.item_code] === rating ? styles.selectedRating : ""} data-rating={rating} type="button" onClick={() => setRatings({ ...ratings, [item.item_code]: rating })}>{ratingDisplay[rating]}</button>)}</div><input value={itemNotes[item.item_code] || ""} onChange={(event) => setItemNotes({ ...itemNotes, [item.item_code]: event.target.value })} placeholder="Observation note" /></article>)}</div> : null}</section>; })}</div>{actionMessage ? <div className={styles.actionMessage}>{actionMessage}</div> : null}<div className={styles.modalActions}><button type="button" onClick={() => setShowNewAudit(false)} disabled={saving}>Cancel</button><button className={styles.primaryButton} type="button" onClick={() => void fileAudit()} disabled={saving || scorePreview.completed !== checklist.length}>{saving ? "Filing..." : "File Audit"}</button></div></section></div> : null}

    {selectedFinding ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelectedFinding(null); }}><section className={styles.modal} role="dialog" aria-modal="true"><div className={styles.modalHeader}><div><span>{selectedFinding.finding_number}</span><h2>{findingMode === "close" ? "Close Finding" : findingMode === "view" ? "Finding Closure" : "Corrective Action"}</h2></div><button type="button" onClick={() => setSelectedFinding(null)} aria-label="Close">X</button></div><div className={styles.findingText}>{selectedFinding.finding_text}</div>{findingMode === "view" ? <div className={styles.closureSummary}><span>Status</span><strong>Closed with evidence</strong><p>{selectedFinding.corrective_action}</p></div> : <div className={styles.findingForm}>{findingMode === "assign" ? <><label className={styles.fullField}><span>Corrective Action</span><textarea value={findingForm.correctiveAction} onChange={(event) => setFindingForm({ ...findingForm, correctiveAction: event.target.value })} /></label><label><span>Owner</span><select value={findingForm.ownerId} onChange={(event) => setFindingForm({ ...findingForm, ownerId: event.target.value })}><option value="">Select owner</option>{people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label><label><span>Due Date</span><input type="date" value={findingForm.dueDate} onChange={(event) => setFindingForm({ ...findingForm, dueDate: event.target.value })} /></label></> : <label className={styles.fullField}><span>Closure Evidence</span><select value={findingForm.evidenceDocumentId} onChange={(event) => setFindingForm({ ...findingForm, evidenceDocumentId: event.target.value })}><option value="">Select job document</option>{documents.filter((document) => document.job_id === selectedFinding.job_id).map((document) => <option key={document.id} value={document.id}>{document.document_type} / {document.display_name}</option>)}</select><small>Evidence must already be attached to the Connected Job.</small></label>}{actionMessage ? <div className={`${styles.actionMessage} ${styles.fullField}`}>{actionMessage}</div> : null}<div className={`${styles.modalActions} ${styles.fullField}`}><button type="button" onClick={() => setSelectedFinding(null)} disabled={saving}>Cancel</button><button className={styles.primaryButton} type="button" onClick={() => void saveFinding()} disabled={saving}>{saving ? "Saving..." : findingMode === "close" ? "Close Finding" : "Save Action"}</button></div></div>}</section></div> : null}
  </main>;
}
