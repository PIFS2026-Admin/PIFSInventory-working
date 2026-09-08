"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { goBackOrFallback } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "./jobs.module.css";

type LifecycleJob = {
  id: string;
  job_number: string;
  crm_opportunity_id: string | null;
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
  requested_on: string | null;
  scheduled_start: string | null;
  linked_record_count: number | null;
  latest_event_summary: string | null;
  latest_event_at: string | null;
};

type LifecycleResponse = {
  ok?: boolean;
  metrics?: {
    total: number;
    active: number;
    linked: number;
    unlinked: number;
    syncFailures: number;
  };
  serviceLineCounts?: Record<string, number>;
  jobs?: LifecycleJob[];
  error?: string;
};

const terminalStatuses = new Set(["complete", "completed", "invoiced", "cancelled", "canceled", "void", "voided"]);

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isTerminal(status: string) {
  return terminalStatuses.has(normalized(status));
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function locationLabel(job: LifecycleJob) {
  return [job.location_name, job.county, job.state].filter(Boolean).join(", ") || "-";
}

function serviceLineColor(value: string) {
  const key = normalized(value);
  if (key === "dti") return "#ef4444";
  if (key === "cdt") return "#0094ff";
  if (key === "hardbanding") return "#f97316";
  if (key === "tubing") return "#7dd3fc";
  if (key === "hotshot") return "#22c55e";
  return "#a78bfa";
}

export default function ConnectedJobsPage() {
  const [response, setResponse] = useState<LifecycleResponse | null>(null);
  const [message, setMessage] = useState("Loading connected jobs...");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"active" | "all">("active");
  const [serviceLine, setServiceLine] = useState("All service lines");
  const [status, setStatus] = useState("All statuses");

  const loadJobs = useCallback(async () => {
    setMessage("Loading connected jobs...");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      window.location.assign("/login");
      return;
    }

    try {
      const request = await fetch("/api/crm/job-lifecycle", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await request.json().catch(() => ({}))) as LifecycleResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not load connected jobs.");
      setResponse(body);
      setMessage("");
    } catch (error) {
      setResponse(null);
      setMessage(error instanceof Error ? error.message : "TITAN could not load connected jobs.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadJobs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  const jobs = useMemo(() => response?.jobs ?? [], [response?.jobs]);
  const serviceLines = useMemo(
    () => [...new Set(jobs.map((job) => job.service_line || "Unassigned"))].sort((a, b) => a.localeCompare(b)),
    [jobs],
  );
  const statuses = useMemo(
    () => [...new Set(jobs.map((job) => job.lifecycle_status))].sort((a, b) => a.localeCompare(b)),
    [jobs],
  );

  const visibleJobs = useMemo(() => {
    const query = normalized(search);
    return jobs.filter((job) => {
      if (scope === "active" && isTerminal(job.lifecycle_status)) return false;
      if (serviceLine !== "All service lines" && job.service_line !== serviceLine) return false;
      if (status !== "All statuses" && job.lifecycle_status !== status) return false;
      if (!query) return true;
      return [
        job.job_number,
        job.title,
        job.customer_name,
        job.operator_name,
        job.rig_name,
        job.contact_name,
        job.salesperson_name,
        job.lead_name,
        job.service_line,
        job.lifecycle_status,
      ].some((value) => normalized(value).includes(query));
    });
  }, [jobs, scope, search, serviceLine, status]);

  const metrics = response?.metrics;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority />
          <div>
            <span>CRM</span>
            <h1>Connected Jobs</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => goBackOrFallback("/crm")}>Back</button>
          <button type="button" onClick={() => void loadJobs()}>Refresh</button>
        </div>
      </header>

      {metrics && (
        <section className={styles.metrics} aria-label="Connected job totals">
          <article><span>Active</span><strong>{metrics.active.toLocaleString()}</strong></article>
          <article><span>All Jobs</span><strong>{metrics.total.toLocaleString()}</strong></article>
          <article><span>Linked</span><strong>{metrics.linked.toLocaleString()}</strong></article>
          <article><span>Unlinked</span><strong>{metrics.unlinked.toLocaleString()}</strong></article>
          <article className={metrics.syncFailures ? styles.metricWarning : ""}>
            <span>Sync Issues</span><strong>{metrics.syncFailures.toLocaleString()}</strong>
          </article>
        </section>
      )}

      <section className={styles.toolbar}>
        <div className={styles.scopeControl} aria-label="Job scope">
          <button className={scope === "active" ? styles.activeScope : ""} type="button" onClick={() => setScope("active")}>Active</button>
          <button className={scope === "all" ? styles.activeScope : ""} type="button" onClick={() => setScope("all")}>All</button>
        </div>
        <label className={styles.searchField}>
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Job, customer, rig, lead..." />
        </label>
        <label>
          <span>Service Line</span>
          <select value={serviceLine} onChange={(event) => setServiceLine(event.target.value)}>
            <option>All service lines</option>
            {serviceLines.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option>All statuses</option>
            {statuses.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
      </section>

      {message ? (
        <section className={styles.message}>{message}</section>
      ) : (
        <section className={styles.jobsSection}>
          <div className={styles.resultCount}>{visibleJobs.length.toLocaleString()} jobs</div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Service Line</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Customer / Operator</th>
                  <th>Rig</th>
                  <th>Location</th>
                  <th>Lead</th>
                  <th>Connection</th>
                </tr>
              </thead>
              <tbody>
                {visibleJobs.map((job) => (
                  <tr key={job.id}>
                    <td data-label="Job"><strong>{job.title}</strong><small>{job.job_number}</small></td>
                    <td data-label="Service Line"><span className={styles.serviceLine} style={{ borderColor: serviceLineColor(job.service_line) }}>{job.service_line}</span></td>
                    <td data-label="Status"><span className={styles.status}>{job.lifecycle_status}</span></td>
                    <td data-label="Scheduled">{formatDate(job.scheduled_start)}</td>
                    <td data-label="Customer / Operator">{job.customer_name || job.operator_name || "-"}</td>
                    <td data-label="Rig">{job.rig_name || "-"}</td>
                    <td data-label="Location">{locationLabel(job)}</td>
                    <td data-label="Lead">{job.lead_name || "-"}</td>
                    <td data-label="Connection">
                      <span className={Number(job.linked_record_count ?? 0) > 0 ? styles.linked : styles.unlinked}>
                        {Number(job.linked_record_count ?? 0) > 0 ? `${job.linked_record_count} linked` : "Not linked"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
