"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { goBackOrFallback } from "../../../../lib/navigation";
import { supabase } from "../../../../lib/supabase";
import styles from "./job-detail.module.css";

type JobDetail = {
  id: string;
  job_number: string;
  title: string;
  service_line: string;
  lifecycle_status: string;
  status_changed_at: string;
  customer_name: string | null;
  operator_name: string | null;
  rig_name: string | null;
  contact_name: string | null;
  location_name: string | null;
  state: string | null;
  county: string | null;
  salesperson_name: string | null;
  lead_name: string | null;
  job_type: string | null;
  job_description: string | null;
  requested_on: string | null;
  scheduled_start: string | null;
  created_at: string;
  updated_at: string;
};

type JobLink = {
  id: string;
  module_key: string;
  record_type: string;
  record_id: string;
  relationship_type: string;
  is_primary: boolean;
  metadata: Record<string, unknown> | null;
};

type JobEvent = {
  id: string;
  event_type: string;
  source_module: string;
  from_status: string | null;
  to_status: string | null;
  summary: string;
  created_at: string;
};

type JobDocument = {
  id: string;
  document_type: string;
  display_name: string;
  source_module: string;
  source_column: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type JobDeviation = {
  id: string;
  deviation_number: string;
  component: string | null;
  joint_ids: string | null;
  quantity: number | null;
  defect_type: string;
  location_on_component: string | null;
  measurements: string | null;
  controlling_criteria: string | null;
  justification: string | null;
  operational_risk: string | null;
  inspector_recommendation: string | null;
  communication_method: string | null;
  written_confirmation: boolean;
  confirmation_document_id: string | null;
  spec_candidate: boolean;
  status: "Draft" | "Submitted" | "Approved" | "Voided";
  approved_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

type JobDebrief = {
  id: string;
  debrief_number: string;
  on_plan: boolean | null;
  station_behind: string | null;
  variance_driver: string | null;
  went_well: string | null;
  slowed_by: string | null;
  safety_observations: string | null;
  gray_area_summary: string | null;
  borderline_count: number;
  customer_feedback: string | null;
  repeat_issue: boolean;
  repeat_note: string | null;
  lessons_learned: string | null;
  action_owner_name: string | null;
  status: "Active" | "Voided";
  updated_at: string;
};

type BriefSpecification = {
  id: string;
  specification_number: string;
  customer_name: string | null;
  scope: "Customer" | "Company";
  service_line: string;
  title: string;
  requirement_text: string;
  effective_date: string;
};

type BriefSignal = {
  id: string;
  candidate_number: string;
  job_id: string;
  source_type: "Deviation" | "Debrief";
  candidate_type: string;
  trigger_text: string | null;
  requirement_text: string;
  confidence: "Low" | "Medium" | "High";
  review_status: "Pending" | "Under Review" | "Decided";
  decision: string | null;
  updated_at: string;
};

type FieldAudit = {
  id: string;
  audit_number: string;
  audit_date: string;
  crew_lead_name: string;
  auditor_name: string;
  overall_percent: number;
  critical_nc_count: number;
  status_band: string;
};

type AuditFinding = {
  id: string;
  finding_number: string;
  field_audit_id: string;
  severity: "NI" | "NC";
  finding_text: string;
  corrective_action: string | null;
  owner_name: string | null;
  due_date: string | null;
  finding_status: "Open" | "Action Assigned" | "Closed";
  closure_evidence_document_id: string | null;
  created_at: string;
};

type DeviationForm = {
  id: string;
  component: string;
  jointIds: string;
  quantity: string;
  defectType: string;
  locationOnComponent: string;
  measurements: string;
  controllingCriteria: string;
  justification: string;
  operationalRisk: string;
  inspectorRecommendation: string;
  communicationMethod: string;
  writtenConfirmation: boolean;
  confirmationDocumentId: string;
  specCandidate: boolean;
};

type DebriefForm = {
  onPlan: "" | "true" | "false";
  stationBehind: string;
  varianceDriver: string;
  wentWell: string;
  slowedBy: string;
  safetyObservations: string;
  grayAreaSummary: string;
  borderlineCount: string;
  customerFeedback: string;
  repeatIssue: boolean;
  repeatNote: string;
  lessonsLearned: string;
  actionOwnerName: string;
};

type DetailResponse = {
  ok?: boolean;
  job?: JobDetail;
  links?: JobLink[];
  events?: JobEvent[];
  documents?: JobDocument[];
  documentRegistryReady?: boolean;
  deviations?: JobDeviation[];
  debrief?: JobDebrief | null;
  intelligenceReady?: boolean;
  preJobBrief?: {
    specifications: BriefSpecification[];
    openSignals: BriefSignal[];
    jobSpecificLessons: BriefSignal[];
  };
  specIntelligenceReady?: boolean;
  fieldAudits?: FieldAudit[];
  auditFindings?: AuditFinding[];
  fieldAuditsReady?: boolean;
  error?: string;
};

const emptyDeviationForm: DeviationForm = {
  id: "",
  component: "",
  jointIds: "",
  quantity: "",
  defectType: "",
  locationOnComponent: "",
  measurements: "",
  controllingCriteria: "",
  justification: "",
  operationalRisk: "",
  inspectorRecommendation: "",
  communicationMethod: "",
  writtenConfirmation: false,
  confirmationDocumentId: "",
  specCandidate: false,
};

const emptyDebriefForm: DebriefForm = {
  onPlan: "",
  stationBehind: "",
  varianceDriver: "",
  wentWell: "",
  slowedBy: "",
  safetyObservations: "",
  grayAreaSummary: "",
  borderlineCount: "0",
  customerFeedback: "",
  repeatIssue: false,
  repeatNote: "",
  lessonsLearned: "",
  actionOwnerName: "",
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, includeTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" });
}

function sourceLabel(value: string) {
  if (value === "service_boards") return "Operations Board";
  if (value === "dti") return "DTI";
  if (value === "crm") return "CRM";
  return value.replace(/_/g, " ");
}

function operationalHref(job: JobDetail, links: JobLink[]) {
  const boardLink = links.find((link) => link.module_key === "service_boards");
  const boardKey = String(boardLink?.metadata?.boardKey ?? "").trim();
  if (boardKey) return `/service-lines/boards/${encodeURIComponent(boardKey)}`;
  if (links.some((link) => link.module_key === "dti") || normalized(job.service_line) === "dti") return "/dti";
  return "";
}

function deviationToForm(deviation: JobDeviation): DeviationForm {
  return {
    id: deviation.id,
    component: deviation.component || "",
    jointIds: deviation.joint_ids || "",
    quantity: deviation.quantity === null ? "" : String(deviation.quantity),
    defectType: deviation.defect_type,
    locationOnComponent: deviation.location_on_component || "",
    measurements: deviation.measurements || "",
    controllingCriteria: deviation.controlling_criteria || "",
    justification: deviation.justification || "",
    operationalRisk: deviation.operational_risk || "",
    inspectorRecommendation: deviation.inspector_recommendation || "",
    communicationMethod: deviation.communication_method || "",
    writtenConfirmation: deviation.written_confirmation,
    confirmationDocumentId: deviation.confirmation_document_id || "",
    specCandidate: deviation.spec_candidate,
  };
}

function debriefToForm(debrief: JobDebrief | null | undefined): DebriefForm {
  if (!debrief) return emptyDebriefForm;
  return {
    onPlan: debrief.on_plan === null ? "" : debrief.on_plan ? "true" : "false",
    stationBehind: debrief.station_behind || "",
    varianceDriver: debrief.variance_driver || "",
    wentWell: debrief.went_well || "",
    slowedBy: debrief.slowed_by || "",
    safetyObservations: debrief.safety_observations || "",
    grayAreaSummary: debrief.gray_area_summary || "",
    borderlineCount: String(debrief.borderline_count ?? 0),
    customerFeedback: debrief.customer_feedback || "",
    repeatIssue: debrief.repeat_issue,
    repeatNote: debrief.repeat_note || "",
    lessonsLearned: debrief.lessons_learned || "",
    actionOwnerName: debrief.action_owner_name || "",
  };
}

export default function ConnectedJobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = Array.isArray(params.jobId) ? params.jobId[0] : params.jobId;
  const [response, setResponse] = useState<DetailResponse | null>(null);
  const [message, setMessage] = useState("Loading job record...");
  const [openingDocument, setOpeningDocument] = useState("");
  const [showDeviationForm, setShowDeviationForm] = useState(false);
  const [showDebriefForm, setShowDebriefForm] = useState(false);
  const [deviationForm, setDeviationForm] = useState<DeviationForm>(emptyDeviationForm);
  const [debriefForm, setDebriefForm] = useState<DebriefForm>(emptyDebriefForm);
  const [savingIntelligence, setSavingIntelligence] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const loadJob = useCallback(async () => {
    if (!jobId) return;
    setMessage("Loading job record...");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      window.location.assign("/login");
      return;
    }

    try {
      const request = await fetch(`/api/crm/job-lifecycle?jobId=${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await request.json().catch(() => ({}))) as DetailResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not load this job.");
      setResponse(body);
      setDebriefForm(debriefToForm(body.debrief));
      setMessage("");
    } catch (error) {
      setResponse(null);
      setMessage(error instanceof Error ? error.message : "TITAN could not load this job.");
    }
  }, [jobId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadJob(), 0);
    return () => window.clearTimeout(timer);
  }, [loadJob]);

  const job = response?.job;
  const links = useMemo(() => response?.links ?? [], [response?.links]);
  const documents = useMemo(() => response?.documents ?? [], [response?.documents]);
  const events = useMemo(() => response?.events ?? [], [response?.events]);
  const fieldAudits = useMemo(() => response?.fieldAudits ?? [], [response?.fieldAudits]);
  const auditFindings = useMemo(() => response?.auditFindings ?? [], [response?.auditFindings]);
  const openAuditFindings = useMemo(() => auditFindings.filter((finding) => finding.finding_status !== "Closed"), [auditFindings]);
  const deviations = useMemo(() => response?.deviations ?? [], [response?.deviations]);
  const preJobBrief = response?.preJobBrief;
  const operationsHref = job ? operationalHref(job, links) : "";
  const isDtiJob = Boolean(job && (normalized(job.service_line) === "dti" || links.some((link) => link.module_key === "dti")));

  async function openDocument(document: JobDocument) {
    const openedWindow = window.open("about:blank", "_blank");
    setOpeningDocument(document.id);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your TITAN session has expired.");

      const request = await fetch(`/api/crm/job-lifecycle?documentId=${encodeURIComponent(document.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await request.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!request.ok || !body.url) throw new Error(body.error || "TITAN could not open this document.");

      if (openedWindow) openedWindow.location.replace(body.url);
      else window.location.assign(body.url);
    } catch (error) {
      openedWindow?.close();
      setMessage(error instanceof Error ? error.message : "TITAN could not open this document.");
    } finally {
      setOpeningDocument("");
    }
  }

  async function runIntelligenceAction(payload: Record<string, unknown>, successMessage: string) {
    if (!jobId || savingIntelligence) return false;
    setSavingIntelligence(true);
    setActionMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        window.location.assign("/login");
        return false;
      }

      const request = await fetch("/api/crm/job-lifecycle", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, jobId }),
      });
      const body = (await request.json().catch(() => ({}))) as { error?: string };
      if (!request.ok) throw new Error(body.error || "TITAN could not save this job record.");

      setActionMessage(successMessage);
      await loadJob();
      return true;
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "TITAN could not save this job record.");
      return false;
    } finally {
      setSavingIntelligence(false);
    }
  }

  async function saveDeviation() {
    const saved = await runIntelligenceAction({
      action: "save_deviation",
      deviationId: deviationForm.id || undefined,
      ...deviationForm,
    }, deviationForm.id ? "Deviation updated." : "Deviation created as Draft.");
    if (saved) {
      setDeviationForm(emptyDeviationForm);
      setShowDeviationForm(false);
    }
  }

  function editDeviation(deviation: JobDeviation) {
    setDeviationForm(deviationToForm(deviation));
    setShowDeviationForm(true);
    setActionMessage("");
  }

  async function transitionDeviation(deviation: JobDeviation, action: "submit_deviation" | "approve_deviation" | "void_deviation") {
    let voidReason = "";
    if (action === "void_deviation") {
      voidReason = window.prompt(`Why is ${deviation.deviation_number} being voided?`)?.trim() || "";
      if (!voidReason) return;
    }
    await runIntelligenceAction({ action, deviationId: deviation.id, voidReason }, `${deviation.deviation_number} updated.`);
  }

  async function saveDebrief() {
    const saved = await runIntelligenceAction({ action: "save_debrief", ...debriefForm }, "Job debrief saved.");
    if (saved) setShowDebriefForm(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority />
          <div>
            <span>Job Intelligence</span>
            <h1>{job?.title || "Connected Job"}</h1>
            {job ? <small>{job.job_number}</small> : null}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => goBackOrFallback("/crm/jobs")}>Back</button>
          <button type="button" onClick={() => void loadJob()}>Refresh</button>
        </div>
      </header>

      {message && !job ? <section className={styles.message}>{message}</section> : null}

      {job ? (
        <>
          {message ? <section className={styles.notice}>{message}</section> : null}

          <section className={styles.statusBar}>
            <div><span>Status</span><strong>{job.lifecycle_status}</strong></div>
            <div><span>Service Line</span><strong>{job.service_line}</strong></div>
            <div><span>Scheduled</span><strong>{formatDate(job.scheduled_start, true)}</strong></div>
            <div><span>Documents</span><strong>{documents.length}</strong></div>
            <div><span>Open Audit Actions</span><strong>{openAuditFindings.length}</strong></div>
            {operationsHref ? <a href={operationsHref}>Open Operations</a> : null}
          </section>

          <section className={`${styles.panel} ${styles.briefPanel}`}>
            <div className={styles.panelHeader}>
              <div><span>Prepared from approved specifications and prior field intelligence</span><h2>Pre-Job Intelligence Brief</h2></div>
              <Link href="/dti/intelligence">Open DTI Job Intelligence</Link>
            </div>
            {!response?.specIntelligenceReady ? (
              <div className={styles.empty}>Run the Specification Intelligence SQL to activate the pre-job brief.</div>
            ) : (
              <div className={styles.briefGrid}>
                <section className={styles.requirementsSection}>
                  <div className={styles.briefSectionHeading}><h3>Controlled Requirements</h3><span>{preJobBrief?.specifications.length ?? 0}</span></div>
                  {preJobBrief?.specifications.length ? <div className={styles.briefList}>{preJobBrief.specifications.map((specification) => (
                    <article key={specification.id} className={styles.approvedBrief}>
                      <div><strong>{specification.title}</strong><span>{specification.specification_number} · {specification.scope}</span></div>
                      <p>{specification.requirement_text}</p>
                    </article>
                  ))}</div> : <div className={styles.briefEmpty}>No approved customer or company requirements currently match this job.</div>}
                </section>

                <section>
                  <div className={styles.briefSectionHeading}><h3>Pending Review</h3><span>{preJobBrief?.openSignals.length ?? 0}</span></div>
                  <div className={styles.pendingNotice}>Awareness only. These records are not approved requirements or authorization.</div>
                  {preJobBrief?.openSignals.length ? <div className={styles.briefList}>{preJobBrief.openSignals.map((signal) => (
                    <article key={signal.id} className={styles.pendingBrief}>
                      <div><strong>{signal.trigger_text || signal.candidate_type}</strong><span>{signal.candidate_number} · {signal.review_status}</span></div>
                      <p>{signal.requirement_text}</p>
                    </article>
                  ))}</div> : <div className={styles.briefEmpty}>No open repeat issues or candidate lessons match this customer and service line.</div>}
                </section>

                <section>
                  <div className={styles.briefSectionHeading}><h3>Prior Job-Specific Lessons</h3><span>{preJobBrief?.jobSpecificLessons.length ?? 0}</span></div>
                  {preJobBrief?.jobSpecificLessons.length ? <div className={styles.briefList}>{preJobBrief.jobSpecificLessons.map((lesson) => (
                    <article key={lesson.id}>
                      <div><strong>{lesson.trigger_text || lesson.candidate_type}</strong><span>{lesson.candidate_number} · Historical context</span></div>
                      <p>{lesson.requirement_text}</p>
                      <Link href={`/crm/jobs/${encodeURIComponent(lesson.job_id)}`}>Open source job</Link>
                    </article>
                  ))}</div> : <div className={styles.briefEmpty}>No prior job-specific lessons match this customer and service line.</div>}
                </section>
              </div>
            )}
          </section>

          {isDtiJob ? <section className={`${styles.panel} ${styles.auditPanel}`}>
            <div className={styles.panelHeader}>
              <div><span>OMS-201 oversight for this connected job</span><h2>DTI Management</h2></div>
              <Link href="/dti?view=audits">Open DTI Management</Link>
            </div>
            {!response?.fieldAuditsReady ? (
              <div className={styles.empty}>Run the Field Audits SQL to activate this section.</div>
            ) : (
              <div className={styles.auditSummaryGrid}>
                <div className={styles.auditMetric}><span>Filed Audits</span><strong>{fieldAudits.length}</strong></div>
                <div className={styles.auditMetric}><span>Open Actions</span><strong>{openAuditFindings.length}</strong></div>
                <div className={styles.auditMetric}><span>Overdue</span><strong>{openAuditFindings.filter((finding) => finding.due_date && finding.due_date < new Date().toISOString().slice(0, 10)).length}</strong></div>
                <div className={styles.auditMetric}><span>Latest Standing</span><strong>{fieldAudits[0]?.status_band || "Not audited"}</strong></div>
                {fieldAudits.length ? (
                  <div className={styles.auditRows}>
                    {fieldAudits.slice(0, 3).map((audit) => (
                      <article key={audit.id}>
                        <div><strong>{audit.audit_number}</strong><span>{audit.crew_lead_name} / {formatDate(audit.audit_date)}</span></div>
                        <b data-band={audit.status_band}>{Number(audit.overall_percent).toFixed(0)}% / {audit.status_band}</b>
                      </article>
                    ))}
                  </div>
                ) : <div className={styles.auditEmpty}>No field audit has been filed for this job.</div>}
                {openAuditFindings.length ? (
                  <div className={styles.auditRows}>
                    {openAuditFindings.slice(0, 3).map((finding) => (
                      <article key={finding.id}>
                        <div><strong>{finding.finding_number} / {finding.severity}</strong><span>{finding.finding_text}</span></div>
                        <b>{finding.due_date ? `Due ${formatDate(finding.due_date)}` : finding.finding_status}</b>
                      </article>
                    ))}
                  </div>
                ) : <div className={styles.auditEmpty}>No open corrective actions.</div>}
              </div>
            )}
          </section> : null}

          <div className={styles.contentGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><h2>Job Details</h2></div>
              <div className={styles.detailGrid}>
                <div><span>Customer</span><strong>{job.customer_name || "-"}</strong></div>
                <div><span>Operator</span><strong>{job.operator_name || "-"}</strong></div>
                <div><span>Rig</span><strong>{job.rig_name || "-"}</strong></div>
                <div><span>Contact</span><strong>{job.contact_name || "-"}</strong></div>
                <div><span>Location</span><strong>{[job.location_name, job.county, job.state].filter(Boolean).join(", ") || "-"}</strong></div>
                <div><span>Salesperson</span><strong>{job.salesperson_name || "-"}</strong></div>
                <div><span>Lead</span><strong>{job.lead_name || "-"}</strong></div>
                <div><span>Job Type</span><strong>{job.job_type || "-"}</strong></div>
                <div><span>Requested</span><strong>{formatDate(job.requested_on)}</strong></div>
                <div><span>Status Updated</span><strong>{formatDate(job.status_changed_at, true)}</strong></div>
              </div>
              {job.job_description ? <div className={styles.description}><span>Description</span><p>{job.job_description}</p></div> : null}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Documents</h2>
                <span>{documents.length}</span>
              </div>
              {!response?.documentRegistryReady ? (
                <div className={styles.empty}>Run the Job Document Registry SQL to activate this section.</div>
              ) : documents.length ? (
                <div className={styles.documentList}>
                  {documents.map((document) => (
                    <button key={document.id} type="button" onClick={() => void openDocument(document)} disabled={openingDocument === document.id}>
                      <span>{document.document_type}</span>
                      <strong>{openingDocument === document.id ? "Opening..." : document.display_name}</strong>
                      <small>{sourceLabel(document.source_module)} · {formatDate(document.created_at, true)}</small>
                    </button>
                  ))}
                </div>
              ) : <div className={styles.empty}>No downloadable documents are attached to this job yet.</div>}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Deviation Register</h2>
                <button type="button" onClick={() => {
                  setDeviationForm(emptyDeviationForm);
                  setShowDeviationForm((current) => !current);
                  setActionMessage("");
                }}>{showDeviationForm ? "Close" : "Add Deviation"}</button>
              </div>
              {!response?.intelligenceReady ? (
                <div className={styles.empty}>Run the Job Intelligence SQL to activate deviations and debriefs.</div>
              ) : (
                <>
                  {showDeviationForm ? (
                    <div className={styles.formGrid}>
                      <label className={styles.fullField}><span>Defect / Deviation Type</span><input value={deviationForm.defectType} onChange={(event) => setDeviationForm({ ...deviationForm, defectType: event.target.value })} /></label>
                      <label><span>Component</span><input value={deviationForm.component} onChange={(event) => setDeviationForm({ ...deviationForm, component: event.target.value })} /></label>
                      <label><span>Joint IDs</span><input value={deviationForm.jointIds} onChange={(event) => setDeviationForm({ ...deviationForm, jointIds: event.target.value })} /></label>
                      <label><span>Quantity</span><input type="number" min="0" value={deviationForm.quantity} onChange={(event) => setDeviationForm({ ...deviationForm, quantity: event.target.value })} /></label>
                      <label><span>Location on Component</span><input value={deviationForm.locationOnComponent} onChange={(event) => setDeviationForm({ ...deviationForm, locationOnComponent: event.target.value })} /></label>
                      <label className={styles.fullField}><span>Measurements</span><textarea value={deviationForm.measurements} onChange={(event) => setDeviationForm({ ...deviationForm, measurements: event.target.value })} /></label>
                      <label className={styles.fullField}><span>Controlling Criteria</span><textarea value={deviationForm.controllingCriteria} onChange={(event) => setDeviationForm({ ...deviationForm, controllingCriteria: event.target.value })} /></label>
                      <label className={styles.fullField}><span>Justification</span><textarea value={deviationForm.justification} onChange={(event) => setDeviationForm({ ...deviationForm, justification: event.target.value })} /></label>
                      <label className={styles.fullField}><span>Operational Risk</span><textarea value={deviationForm.operationalRisk} onChange={(event) => setDeviationForm({ ...deviationForm, operationalRisk: event.target.value })} /></label>
                      <label className={styles.fullField}><span>Inspector Recommendation</span><textarea value={deviationForm.inspectorRecommendation} onChange={(event) => setDeviationForm({ ...deviationForm, inspectorRecommendation: event.target.value })} /></label>
                      <label><span>Communication Method</span><select value={deviationForm.communicationMethod} onChange={(event) => setDeviationForm({ ...deviationForm, communicationMethod: event.target.value })}><option value="">Select</option><option>Email</option><option>Text Message</option><option>Customer Portal</option><option>Signed Document</option><option>Other Written</option></select></label>
                      <label><span>Confirmation Evidence</span><select value={deviationForm.confirmationDocumentId} onChange={(event) => setDeviationForm({ ...deviationForm, confirmationDocumentId: event.target.value, writtenConfirmation: Boolean(event.target.value) })}><option value="">Select document</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.document_type}: {document.display_name}</option>)}</select></label>
                      <label className={styles.checkField}><input type="checkbox" checked={deviationForm.writtenConfirmation} disabled={!deviationForm.confirmationDocumentId} onChange={(event) => setDeviationForm({ ...deviationForm, writtenConfirmation: event.target.checked })} /><span>Written confirmation received</span></label>
                      <label className={styles.checkField}><input type="checkbox" checked={deviationForm.specCandidate} onChange={(event) => setDeviationForm({ ...deviationForm, specCandidate: event.target.checked })} /><span>Review as specification candidate</span></label>
                      <div className={`${styles.formActions} ${styles.fullField}`}>
                        <button type="button" onClick={() => { setShowDeviationForm(false); setDeviationForm(emptyDeviationForm); }} disabled={savingIntelligence}>Cancel</button>
                        <button className={styles.primaryButton} type="button" onClick={() => void saveDeviation()} disabled={savingIntelligence}>{savingIntelligence ? "Saving..." : deviationForm.id ? "Save Changes" : "Save Draft"}</button>
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.recordList}>
                    {deviations.map((deviation) => (
                      <article key={deviation.id} className={deviation.status === "Voided" ? styles.voidedRecord : ""}>
                        <div className={styles.recordHeading}>
                          <div><span>{deviation.deviation_number}</span><strong>{deviation.defect_type}</strong></div>
                          <b data-status={deviation.status}>{deviation.status}</b>
                        </div>
                        <dl>
                          <div><dt>Component</dt><dd>{deviation.component || "-"}</dd></div>
                          <div><dt>Quantity</dt><dd>{deviation.quantity ?? "-"}</dd></div>
                          <div><dt>Written Evidence</dt><dd>{deviation.written_confirmation ? "Received" : "Missing"}</dd></div>
                          <div><dt>Updated</dt><dd>{formatDate(deviation.updated_at, true)}</dd></div>
                        </dl>
                        {deviation.operational_risk ? <p><strong>Risk:</strong> {deviation.operational_risk}</p> : null}
                        {deviation.void_reason ? <p><strong>Void reason:</strong> {deviation.void_reason}</p> : null}
                        {deviation.status !== "Voided" ? (
                          <div className={styles.recordActions}>
                            {deviation.status === "Draft" ? <button type="button" onClick={() => editDeviation(deviation)}>Edit</button> : null}
                            {deviation.status === "Draft" ? <button type="button" onClick={() => void transitionDeviation(deviation, "submit_deviation")} disabled={savingIntelligence}>Submit</button> : null}
                            {deviation.status === "Submitted" ? <button className={styles.primaryButton} type="button" onClick={() => void transitionDeviation(deviation, "approve_deviation")} disabled={savingIntelligence}>Approve</button> : null}
                            <button type="button" onClick={() => void transitionDeviation(deviation, "void_deviation")} disabled={savingIntelligence}>Void</button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                    {!deviations.length && !showDeviationForm ? <div className={styles.empty}>No deviations recorded for this job.</div> : null}
                  </div>
                </>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Closeout Debrief</h2>
                {response?.intelligenceReady ? <button type="button" onClick={() => setShowDebriefForm((current) => !current)}>{showDebriefForm ? "Close" : response.debrief ? "Edit Debrief" : "Add Debrief"}</button> : null}
              </div>
              {!response?.intelligenceReady ? (
                <div className={styles.empty}>Run the Job Intelligence SQL to activate deviations and debriefs.</div>
              ) : showDebriefForm ? (
                <div className={styles.formGrid}>
                  <label><span>Was Work on Plan?</span><select value={debriefForm.onPlan} onChange={(event) => setDebriefForm({ ...debriefForm, onPlan: event.target.value as DebriefForm["onPlan"] })}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select></label>
                  <label><span>Station Behind</span><input value={debriefForm.stationBehind} onChange={(event) => setDebriefForm({ ...debriefForm, stationBehind: event.target.value })} /></label>
                  <label className={styles.fullField}><span>Variance Driver</span><textarea value={debriefForm.varianceDriver} onChange={(event) => setDebriefForm({ ...debriefForm, varianceDriver: event.target.value })} /></label>
                  <label className={styles.fullField}><span>What Went Well</span><textarea value={debriefForm.wentWell} onChange={(event) => setDebriefForm({ ...debriefForm, wentWell: event.target.value })} /></label>
                  <label className={styles.fullField}><span>What Slowed the Job</span><textarea value={debriefForm.slowedBy} onChange={(event) => setDebriefForm({ ...debriefForm, slowedBy: event.target.value })} /></label>
                  <label className={styles.fullField}><span>Safety Observations</span><textarea value={debriefForm.safetyObservations} onChange={(event) => setDebriefForm({ ...debriefForm, safetyObservations: event.target.value })} /></label>
                  <label className={styles.fullField}><span>Gray Areas / Borderline Calls</span><textarea value={debriefForm.grayAreaSummary} onChange={(event) => setDebriefForm({ ...debriefForm, grayAreaSummary: event.target.value })} /></label>
                  <label><span>Borderline Count</span><input type="number" min="0" value={debriefForm.borderlineCount} onChange={(event) => setDebriefForm({ ...debriefForm, borderlineCount: event.target.value })} /></label>
                  <label><span>Action Owner</span><input value={debriefForm.actionOwnerName} onChange={(event) => setDebriefForm({ ...debriefForm, actionOwnerName: event.target.value })} /></label>
                  <label className={styles.fullField}><span>Customer Feedback</span><textarea value={debriefForm.customerFeedback} onChange={(event) => setDebriefForm({ ...debriefForm, customerFeedback: event.target.value })} /></label>
                  <label className={styles.checkField}><input type="checkbox" checked={debriefForm.repeatIssue} onChange={(event) => setDebriefForm({ ...debriefForm, repeatIssue: event.target.checked })} /><span>Repeated issue</span></label>
                  {debriefForm.repeatIssue ? <label className={styles.fullField}><span>Repeated Issue Details</span><textarea value={debriefForm.repeatNote} onChange={(event) => setDebriefForm({ ...debriefForm, repeatNote: event.target.value })} /></label> : null}
                  <label className={styles.fullField}><span>Lessons Learned / Next Action</span><textarea value={debriefForm.lessonsLearned} onChange={(event) => setDebriefForm({ ...debriefForm, lessonsLearned: event.target.value })} /></label>
                  <div className={`${styles.formActions} ${styles.fullField}`}><button type="button" onClick={() => { setDebriefForm(debriefToForm(response.debrief)); setShowDebriefForm(false); }} disabled={savingIntelligence}>Cancel</button><button className={styles.primaryButton} type="button" onClick={() => void saveDebrief()} disabled={savingIntelligence}>{savingIntelligence ? "Saving..." : "Save Debrief"}</button></div>
                </div>
              ) : response.debrief ? (
                <div className={styles.debriefSummary}>
                  <div><span>{response.debrief.debrief_number}</span><strong>{response.debrief.on_plan === null ? "Plan status not recorded" : response.debrief.on_plan ? "Work stayed on plan" : "Work varied from plan"}</strong></div>
                  {response.debrief.went_well ? <p><strong>Went well:</strong> {response.debrief.went_well}</p> : null}
                  {response.debrief.slowed_by ? <p><strong>Slowed by:</strong> {response.debrief.slowed_by}</p> : null}
                  {response.debrief.lessons_learned ? <p><strong>Next action:</strong> {response.debrief.lessons_learned}</p> : null}
                  <small>Updated {formatDate(response.debrief.updated_at, true)}</small>
                </div>
              ) : <div className={styles.empty}>No closeout debrief has been recorded.</div>}
            </section>

            {actionMessage ? <div className={styles.actionMessage}>{actionMessage}</div> : null}

            <section className={`${styles.panel} ${styles.timelinePanel}`}>
              <div className={styles.panelHeader}>
                <h2>Job Timeline</h2>
                <span>{events.length}</span>
              </div>
              {events.length ? (
                <div className={styles.timeline}>
                  {events.map((event) => (
                    <article key={event.id}>
                      <i aria-hidden="true" />
                      <div>
                        <div className={styles.eventHeading}>
                          <strong>{event.summary}</strong>
                          <time>{formatDate(event.created_at, true)}</time>
                        </div>
                        <span>{sourceLabel(event.source_module)}</span>
                        {event.from_status !== event.to_status && event.to_status ? (
                          <p>{event.from_status || "Started"} → {event.to_status}</p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <div className={styles.empty}>No job activity has been recorded.</div>}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
