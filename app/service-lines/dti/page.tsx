"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { goBackOrFallback, goHome } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "./dti-home.module.css";

type AttentionItem = { id: string; kind: string; severity: "High" | "Medium"; title: string; detail: string; href: string; occurredAt: string | null };
type Activity = { id: string; event_type: string; summary: string; created_at: string; job: { job_number: string; title: string } | null };
type Overview = {
  metrics: { activeJobs: number; needsAttention: number; unresolvedDeviations: number; actionRequiredAudits: number; openHighGaps: number };
  attention: AttentionItem[];
  activity: Activity[];
  error?: string;
};

const tools = [
  { title: "DTI Management", href: "/dti" },
  { title: "Daily Summaries", href: "/dti-summary" },
  { title: "Job Intelligence", href: "/dti/intelligence" },
  { title: "Inspector Competency", href: "/dti/competency" },
  { title: "Crew Schedule", href: "/dti/crew-schedule" },
  { title: "Document Library", href: "/dti/documents" },
  { title: "Tubular Specifications", href: "/dti/tubular-specs" },
];

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DtiServiceLinePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState("Loading DTI activity...");
  const [filter, setFilter] = useState("All");

  const load = useCallback(async () => {
    setMessage("Loading DTI activity...");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch("/api/dti/overview", { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as Overview;
      if (!request.ok) throw new Error(body.error || "TITAN could not load the DTI snapshot.");
      setOverview(body);
      setMessage("");
    } catch (error) {
      setOverview(null);
      setMessage(error instanceof Error ? error.message : "TITAN could not load the DTI snapshot.");
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const filters = useMemo(() => ["All", ...new Set((overview?.attention ?? []).map((item) => item.kind))], [overview?.attention]);
  const attention = useMemo(() => (overview?.attention ?? []).filter((item) => filter === "All" || item.kind === filter), [filter, overview?.attention]);

  return <main className={styles.shell}>
    <header className={`${styles.header} titan-page-header`}>
      <button className={`brand compact brand-home-link ${styles.brand}`} type="button" onClick={() => window.location.assign("/home")}>
        <Image className="brand-logo" src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority />
        <div><div className="brand-title">DTI Service Line</div></div>
      </button>
      <div className={styles.headerActions}><button className="button" type="button" onClick={() => goBackOrFallback("/service-lines")}>Back</button><button className="button" type="button" onClick={() => void load()}>Refresh</button><button className="button primary" type="button" onClick={goHome}>Home</button></div>
    </header>

    <nav className={styles.toolNav}>{tools.map((tool) => <button key={tool.href} type="button" onClick={() => window.location.assign(tool.href)}>{tool.title}</button>)}</nav>

    {overview ? <section className={styles.metrics}>
      <article><span>Active Jobs</span><strong>{overview.metrics.activeJobs}</strong></article>
      <article data-alert={overview.metrics.needsAttention > 0}><span>Needs Attention</span><strong>{overview.metrics.needsAttention}</strong></article>
      <article><span>Open Deviations</span><strong>{overview.metrics.unresolvedDeviations}</strong></article>
      <article data-alert={overview.metrics.actionRequiredAudits > 0}><span>Audit Actions</span><strong>{overview.metrics.actionRequiredAudits}</strong></article>
      <article data-alert={overview.metrics.openHighGaps > 0}><span>High Gaps</span><strong>{overview.metrics.openHighGaps}</strong></article>
    </section> : null}

    {message ? <div className={styles.message}>{message}</div> : <div className={styles.content}>
      <section className={styles.attentionPanel}>
        <div className={styles.sectionHead}><div><span>Current DTI Activity</span><h1>Needs Attention</h1></div><select aria-label="Filter attention items" value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map((value) => <option key={value}>{value}</option>)}</select></div>
        <div className={styles.attentionList}>{attention.map((item) => <button key={item.id} type="button" data-severity={item.severity} onClick={() => window.location.assign(item.href)}><b>{item.kind}</b><strong>{item.title}</strong><span>{item.detail}</span><time>{formatDate(item.occurredAt)}</time></button>)}{!attention.length ? <div className={styles.empty}>No DTI items need attention.</div> : null}</div>
      </section>
      <aside className={styles.activityPanel}><div className={styles.sectionHead}><div><span>DTI</span><h2>Latest Activity</h2></div></div><div className={styles.activityList}>{(overview?.activity ?? []).slice(0, 12).map((item) => <div key={item.id}><strong>{item.job?.job_number || item.event_type}</strong><span>{item.summary}</span><time>{formatDate(item.created_at)}</time></div>)}{!overview?.activity.length ? <div className={styles.empty}>No DTI activity recorded.</div> : null}</div></aside>
    </div>}
  </main>;
}
