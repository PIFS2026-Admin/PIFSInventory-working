"use client";

import Image from "next/image";
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

type DetailResponse = {
  ok?: boolean;
  job?: JobDetail;
  links?: JobLink[];
  events?: JobEvent[];
  documents?: JobDocument[];
  documentRegistryReady?: boolean;
  error?: string;
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

export default function ConnectedJobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = Array.isArray(params.jobId) ? params.jobId[0] : params.jobId;
  const [response, setResponse] = useState<DetailResponse | null>(null);
  const [message, setMessage] = useState("Loading job record...");
  const [openingDocument, setOpeningDocument] = useState("");

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
  const operationsHref = job ? operationalHref(job, links) : "";

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
            {operationsHref ? <a href={operationsHref}>Open Operations</a> : null}
          </section>

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
