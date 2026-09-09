"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { goBackOrFallback } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "./intelligence.module.css";

type CandidateJob = {
  id: string;
  job_number: string;
  title: string;
  customer_name: string | null;
  operator_name: string | null;
  rig_name: string | null;
  service_line: string;
  lifecycle_status: string;
};

type Candidate = {
  id: string;
  candidate_number: string;
  job_id: string;
  source_type: "Deviation" | "Debrief";
  customer_name: string | null;
  service_line: string;
  candidate_type: string;
  trigger_text: string | null;
  requirement_text: string;
  confidence: "Low" | "Medium" | "High";
  review_status: "Pending" | "Under Review" | "Decided" | "Voided";
  decision: "Add to Matrix" | "Job-Specific" | "Hold" | "No Change" | null;
  decision_note: string | null;
  updated_at: string;
  job: CandidateJob | null;
};

type Specification = {
  id: string;
  specification_number: string;
  source_candidate_id: string;
  source_job_id: string;
  customer_name: string | null;
  scope: "Customer" | "Company";
  service_line: string;
  title: string;
  requirement_text: string;
  effective_date: string;
  status: "Active" | "Superseded" | "Retired";
};

type IntelligenceResponse = {
  ok?: boolean;
  metrics?: { pending: number; underReview: number; repeatIssues: number; activeSpecifications: number };
  candidates?: Candidate[];
  specifications?: Specification[];
  error?: string;
};

type ReviewForm = {
  decision: "Add to Matrix" | "Job-Specific" | "Hold" | "No Change";
  decisionNote: string;
  specificationTitle: string;
  requirementText: string;
  scope: "Customer" | "Company";
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function reviewForm(candidate: Candidate): ReviewForm {
  return {
    decision: candidate.decision || "Add to Matrix",
    decisionNote: candidate.decision_note || "",
    specificationTitle: candidate.trigger_text || candidate.candidate_type,
    requirementText: candidate.requirement_text,
    scope: candidate.customer_name ? "Customer" : "Company",
  };
}

export default function JobIntelligencePage() {
  const [response, setResponse] = useState<IntelligenceResponse | null>(null);
  const [message, setMessage] = useState("Loading job intelligence...");
  const [tab, setTab] = useState<"queue" | "matrix">("queue");
  const [search, setSearch] = useState("");
  const [serviceLine, setServiceLine] = useState("All service lines");
  const [reviewStatus, setReviewStatus] = useState("Open review");
  const [sourceType, setSourceType] = useState("All sources");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const loadIntelligence = useCallback(async () => {
    setMessage("Loading job intelligence...");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch("/api/dti/job-intelligence", { headers: { Authorization: `Bearer ${token}` } });
      const body = (await request.json().catch(() => ({}))) as IntelligenceResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not load Job Intelligence.");
      setResponse(body);
      setMessage("");
    } catch (error) {
      setResponse(null);
      setMessage(error instanceof Error ? error.message : "TITAN could not load Job Intelligence.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadIntelligence(), 0);
    return () => window.clearTimeout(timer);
  }, [loadIntelligence]);

  const candidates = useMemo(() => response?.candidates ?? [], [response?.candidates]);
  const specifications = useMemo(() => response?.specifications ?? [], [response?.specifications]);
  const serviceLines = useMemo(() => [...new Set([
    ...candidates.map((item) => item.service_line),
    ...specifications.map((item) => item.service_line),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [candidates, specifications]);

  const visibleCandidates = useMemo(() => {
    const query = normalized(search);
    return candidates.filter((candidate) => {
      if (serviceLine !== "All service lines" && candidate.service_line !== serviceLine) return false;
      if (sourceType !== "All sources" && candidate.source_type !== sourceType) return false;
      if (reviewStatus === "Open review" && !["Pending", "Under Review"].includes(candidate.review_status)) return false;
      if (reviewStatus !== "Open review" && reviewStatus !== "All statuses" && candidate.review_status !== reviewStatus) return false;
      if (!query) return true;
      return [candidate.candidate_number, candidate.candidate_type, candidate.trigger_text, candidate.requirement_text,
        candidate.customer_name, candidate.service_line, candidate.decision, candidate.job?.job_number,
        candidate.job?.title, candidate.job?.rig_name].some((value) => normalized(value).includes(query));
    });
  }, [candidates, reviewStatus, search, serviceLine, sourceType]);

  const visibleSpecifications = useMemo(() => {
    const query = normalized(search);
    return specifications.filter((specification) => {
      if (serviceLine !== "All service lines" && specification.service_line !== serviceLine) return false;
      if (!query) return true;
      return [specification.specification_number, specification.customer_name, specification.service_line,
        specification.title, specification.requirement_text, specification.scope, specification.status]
        .some((value) => normalized(value).includes(query));
    });
  }, [search, serviceLine, specifications]);

  function openReview(candidate: Candidate) {
    setSelected(candidate);
    setForm(reviewForm(candidate));
    setActionMessage("");
  }

  async function runAction(payload: Record<string, unknown>) {
    if (saving) return false;
    setSaving(true);
    setActionMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        window.location.assign("/login");
        return false;
      }
      const request = await fetch("/api/dti/job-intelligence", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await request.json().catch(() => ({}))) as { error?: string };
      if (!request.ok) throw new Error(body.error || "TITAN could not save this review.");
      await loadIntelligence();
      return true;
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "TITAN could not save this review.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function beginReview(candidate: Candidate) {
    const saved = await runAction({ action: "start_review", candidateId: candidate.id });
    if (saved) setActionMessage(`${candidate.candidate_number} is now under review.`);
  }

  async function saveDecision() {
    if (!selected || !form) return;
    const saved = await runAction({ action: "decide_candidate", candidateId: selected.id, ...form });
    if (saved) {
      setSelected(null);
      setForm(null);
      setActionMessage(`${selected.candidate_number} decision saved.`);
      if (form.decision === "Add to Matrix") setTab("matrix");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority />
          <div><span>DTI</span><h1>Job Intelligence</h1></div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => goBackOrFallback("/service-lines/dti")}>Back</button>
          <Link href="/dti">DTI Management</Link>
          <Link href="/dti/field-audits">Field Audits</Link>
          <button type="button" onClick={() => void loadIntelligence()}>Refresh</button>
        </div>
      </header>

      {response?.metrics ? (
        <section className={styles.metrics}>
          <article><span>Pending</span><strong>{response.metrics.pending}</strong></article>
          <article><span>Under Review</span><strong>{response.metrics.underReview}</strong></article>
          <article><span>Repeat Issues</span><strong>{response.metrics.repeatIssues}</strong></article>
          <article><span>Active Specifications</span><strong>{response.metrics.activeSpecifications}</strong></article>
        </section>
      ) : null}

      <section className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={tab === "queue" ? styles.activeTab : ""} type="button" onClick={() => setTab("queue")}>Review Queue</button>
          <button className={tab === "matrix" ? styles.activeTab : ""} type="button" onClick={() => setTab("matrix")}>Specification Matrix</button>
        </div>
        <label className={styles.searchField}><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, job, rig, issue, requirement..." /></label>
        <label><span>Service Line</span><select value={serviceLine} onChange={(event) => setServiceLine(event.target.value)}><option>All service lines</option>{serviceLines.map((value) => <option key={value}>{value}</option>)}</select></label>
        {tab === "queue" ? <>
          <label><span>Source</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option>All sources</option><option>Deviation</option><option>Debrief</option></select></label>
          <label><span>Status</span><select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}><option>Open review</option><option>Pending</option><option>Under Review</option><option>Decided</option><option>Voided</option><option>All statuses</option></select></label>
        </> : null}
      </section>

      {actionMessage ? <div className={styles.actionMessage}>{actionMessage}</div> : null}
      {message ? <section className={styles.message}>{message}</section> : tab === "queue" ? (
        <section className={styles.tableSection}>
          <div className={styles.resultCount}>{visibleCandidates.length} candidates</div>
          <div className={styles.tableWrap}><table><thead><tr><th>Candidate</th><th>Source Job</th><th>Customer / Rig</th><th>Service Line</th><th>Field Intelligence</th><th>Confidence</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{visibleCandidates.map((candidate) => <tr key={candidate.id}>
              <td data-label="Candidate"><strong>{candidate.candidate_number}</strong><small>{candidate.candidate_type}</small></td>
              <td data-label="Source Job"><Link href={`/crm/jobs/${encodeURIComponent(candidate.job_id)}`}>{candidate.job?.title || "Open connected job"}</Link><small>{candidate.job?.job_number || candidate.source_type}</small></td>
              <td data-label="Customer / Rig">{candidate.customer_name || candidate.job?.operator_name || "-"}<small>{candidate.job?.rig_name || "-"}</small></td>
              <td data-label="Service Line">{candidate.service_line}</td>
              <td data-label="Field Intelligence"><strong>{candidate.trigger_text || candidate.source_type}</strong><p>{candidate.requirement_text}</p></td>
              <td data-label="Confidence"><span data-confidence={candidate.confidence}>{candidate.confidence}</span></td>
              <td data-label="Status"><span data-review-status={candidate.review_status}>{candidate.decision || candidate.review_status}</span></td>
              <td data-label="Action">{candidate.review_status === "Pending" ? <button type="button" onClick={() => void beginReview(candidate)} disabled={saving}>Start Review</button> : candidate.review_status === "Under Review" ? <button className={styles.primaryButton} type="button" onClick={() => openReview(candidate)}>Decide</button> : <button type="button" onClick={() => openReview(candidate)}>View</button>}</td>
            </tr>)}</tbody></table></div>
          {!visibleCandidates.length ? <div className={styles.empty}>No intelligence matches these filters.</div> : null}
        </section>
      ) : (
        <section className={styles.tableSection}>
          <div className={styles.resultCount}>{visibleSpecifications.length} specifications</div>
          <div className={styles.tableWrap}><table><thead><tr><th>Specification</th><th>Scope</th><th>Customer</th><th>Service Line</th><th>Requirement</th><th>Effective</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>{visibleSpecifications.map((specification) => <tr key={specification.id}>
              <td data-label="Specification"><strong>{specification.specification_number}</strong><small>{specification.title}</small></td>
              <td data-label="Scope">{specification.scope}</td><td data-label="Customer">{specification.customer_name || "All customers"}</td>
              <td data-label="Service Line">{specification.service_line}</td><td data-label="Requirement"><p>{specification.requirement_text}</p></td>
              <td data-label="Effective">{formatDate(specification.effective_date)}</td><td data-label="Status"><span data-review-status={specification.status}>{specification.status}</span></td>
              <td data-label="Source"><Link href={`/crm/jobs/${encodeURIComponent(specification.source_job_id)}`}>Open Job</Link></td>
            </tr>)}</tbody></table></div>
          {!visibleSpecifications.length ? <div className={styles.empty}>No active specifications match these filters.</div> : null}
        </section>
      )}

      {selected && form ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null); }}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className={styles.modalHeader}><div><span>{selected.candidate_number}</span><h2 id="review-title">Review Field Intelligence</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button></div>
          <div className={styles.sourceSummary}><strong>{selected.trigger_text || selected.candidate_type}</strong><p>{selected.requirement_text}</p><Link href={`/crm/jobs/${encodeURIComponent(selected.job_id)}`}>Open source job</Link></div>
          {selected.review_status === "Decided" || selected.review_status === "Voided" ? <div className={styles.decisionSummary}><span>Decision</span><strong>{selected.decision || selected.review_status}</strong><p>{selected.decision_note || "No decision note."}</p></div> : <div className={styles.reviewForm}>
            <label><span>Decision</span><select value={form.decision} onChange={(event) => setForm({ ...form, decision: event.target.value as ReviewForm["decision"] })}><option>Add to Matrix</option><option>Job-Specific</option><option>Hold</option><option>No Change</option></select></label>
            {form.decision === "Add to Matrix" ? <>
              <label><span>Scope</span><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value as ReviewForm["scope"] })}><option>Customer</option><option>Company</option></select></label>
              <label className={styles.fullField}><span>Specification Title</span><input value={form.specificationTitle} onChange={(event) => setForm({ ...form, specificationTitle: event.target.value })} /></label>
              <label className={styles.fullField}><span>Controlled Requirement</span><textarea value={form.requirementText} onChange={(event) => setForm({ ...form, requirementText: event.target.value })} /></label>
            </> : null}
            <label className={styles.fullField}><span>Decision Reason</span><textarea value={form.decisionNote} onChange={(event) => setForm({ ...form, decisionNote: event.target.value })} placeholder="Why is this the correct disposition?" /></label>
            {actionMessage ? <div className={`${styles.actionMessage} ${styles.fullField}`}>{actionMessage}</div> : null}
            <div className={`${styles.modalActions} ${styles.fullField}`}><button type="button" onClick={() => setSelected(null)} disabled={saving}>Cancel</button><button className={styles.primaryButton} type="button" onClick={() => void saveDecision()} disabled={saving}>{saving ? "Saving..." : "Save Decision"}</button></div>
          </div>}
        </section>
      </div> : null}
    </main>
  );
}
