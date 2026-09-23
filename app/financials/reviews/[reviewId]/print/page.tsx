"use client";

/* eslint-disable @next/next/no-img-element */

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { financialLineNames, FinancialLine } from "../../../../../lib/financialKpi";
import { supabase } from "../../../../../lib/supabase";
import styles from "./print.module.css";

type Review = {
  id: string;
  service_line: FinancialLine;
  quarter: string | null;
  range_start: string;
  range_end: string;
  compare_mode: "prior" | "year";
  highlights: string | null;
  lowlights: string | null;
  goals: string | null;
  snapshot: Record<string, unknown>;
  finalized_at: string;
};

type ReviewSection = {
  id: string;
  kind: "metric" | "chart" | "narrative" | "manual_metric" | "photo";
  title: string | null;
  config: Record<string, unknown>;
  body: string | null;
  snapshot: Record<string, unknown> | null;
};

type PrintData = {
  review: Review;
  sections: ReviewSection[];
  snapshots: Array<{ id: string; finalized_at: string }>;
  photos: Array<{ id: string; section_id: string; caption: string | null; file_name: string; url: string }>;
  yard: { id: string; name: string; code: string };
};

const metricLabels: Record<string, string> = {
  jobs: "Jobs",
  revenue: "Revenue",
  cost: "Total Cost",
  profit: "Profit",
  margin: "Profit Margin",
  manhours: "Manhours",
  revenue_per_manhour: "Revenue / Manhour",
  labor_percent: "Labor % Revenue",
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return numberValue(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function percent(value: unknown) {
  return `${(numberValue(value) * 100).toFixed(1)}%`;
}

function metricValue(key: string, value: unknown) {
  if (key === "margin" || key === "labor_percent") return percent(value);
  if (["revenue", "cost", "profit", "revenue_per_manhour"].includes(key)) return money(value);
  return numberValue(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function dateText(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function FinancialReviewPrintContent() {
  const params = useParams<{ reviewId: string }>();
  const searchParams = useSearchParams();
  const reviewId = String(params.reviewId || "");
  const yardId = searchParams.get("yardId") || "";
  const [data, setData] = useState<PrintData | null>(null);
  const [message, setMessage] = useState("Loading finalized review...");

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token || !reviewId || !yardId) {
        setMessage("TITAN could not identify this finalized review.");
        return;
      }
      const response = await fetch(`/api/financials?yardId=${encodeURIComponent(yardId)}&reviewId=${encodeURIComponent(reviewId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || "TITAN could not load this finalized review.");
        return;
      }
      setData(result as PrintData);
      setMessage("");
    }
    void load();
  }, [reviewId, yardId]);

  if (!data) return <main className={styles.shell}><section className={styles.sheet}>{message}</section></main>;

  const { review, sections, yard } = data;
  const snapshot = review.snapshot || {};
  const comparison = snapshot.comparison as Record<string, unknown> | undefined;
  const embeddedSections = Array.isArray(snapshot.section_snapshots)
    ? snapshot.section_snapshots as Array<{ id: string; snapshot: Record<string, unknown> }>
    : [];
  const period = review.quarter || `${dateText(review.range_start)} - ${dateText(review.range_end)}`;

  return <main className={styles.shell}>
    <div className={styles.actions}>
      <button type="button" onClick={() => window.close()}>Close</button>
      <button type="button" className={styles.primary} onClick={() => window.print()}>Print / Save PDF</button>
    </div>
    <article className={styles.sheet}>
      <header className={styles.header}>
        <img src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" />
        <div><span>Controlled Financial Record</span><h1>Financial Performance Review</h1><p>{financialLineNames[review.service_line]} · {period}</p></div>
      </header>

      <section className={styles.meta}>
        <div><span>Yard</span><strong>{yard.name}</strong></div>
        <div><span>Service Line</span><strong>{financialLineNames[review.service_line]}</strong></div>
        <div><span>Review Window</span><strong>{period}</strong></div>
        <div><span>Comparison</span><strong>{review.compare_mode === "year" ? "Same Dates Last Year" : "Prior Period"}</strong></div>
        <div><span>Finalized</span><strong>{new Date(review.finalized_at).toLocaleString()}</strong></div>
        <div><span>Version</span><strong>{data.snapshots.length}</strong></div>
      </section>

      <section className={styles.metrics}>
        {(["jobs", "revenue", "cost", "profit", "margin", "manhours"] as const).map((key) => <div key={key}><span>{metricLabels[key]}</span><strong>{metricValue(key, snapshot[key])}</strong></div>)}
      </section>

      {comparison && <section className={styles.comparison}><span>{review.compare_mode === "year" ? "Same Dates Last Year" : "Prior Period"}</span><strong>{numberValue(comparison.jobs).toLocaleString()} jobs · {money(comparison.revenue)} revenue · {money(comparison.profit)} profit · {percent(comparison.margin)} margin</strong></section>}

      <section className={styles.narratives}>
        <div><span>Highlights</span><p>{review.highlights || "-"}</p></div>
        <div><span>Lowlights</span><p>{review.lowlights || "-"}</p></div>
        <div><span>Goals</span><p>{review.goals || "-"}</p></div>
      </section>

      {sections.map((section) => {
        const frozen = section.snapshot || embeddedSections.find((item) => item.id === section.id)?.snapshot || {};
        const metricKey = String(frozen.metric_key || section.config.metric_key || "revenue");
        const rows = Array.isArray(frozen.current) ? frozen.current as Array<{ label: string; value: number }> : [];
        const maximum = Math.max(1, ...rows.map((row) => Math.abs(numberValue(row.value))));
        return <section className={styles.section} key={section.id}>
          <div className={styles.sectionTitle}><span>{section.kind.replaceAll("_", " ")}</span><h2>{section.title || metricLabels[metricKey] || "Review Section"}</h2></div>
          {section.kind === "narrative" && <p className={styles.body}>{String(frozen.body || section.body || "-")}</p>}
          {section.kind === "manual_metric" && <div className={styles.manual}><span>{String(frozen.label || section.config.label || section.title || "Value")}</span><strong>{String(frozen.value || section.config.value || "-")}</strong></div>}
          {section.kind === "photo" && <><p className={styles.body}>{section.body || "Photo evidence"}</p><div className={styles.photos}>{data.photos.filter((photo) => photo.section_id === section.id).map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.caption || photo.file_name} /><figcaption>{photo.caption || photo.file_name}</figcaption></figure>)}</div></>}
          {section.kind === "metric" && <div className={styles.metricCompare}><div><span>Review Window</span><strong>{metricValue(metricKey, frozen.current)}</strong></div><div><span>{review.compare_mode === "year" ? "Last Year" : "Prior Period"}</span><strong>{metricValue(metricKey, frozen.comparison)}</strong></div></div>}
          {section.kind === "chart" && <div className={styles.chart}>{rows.map((row) => <div key={row.label}><span>{row.label}</span><i><b style={{ width: `${Math.abs(numberValue(row.value)) / maximum * 100}%` }} /></i><strong>{metricValue(metricKey, row.value)}</strong></div>)}</div>}
        </section>;
      })}

      <footer><strong>Pathfinder Inspections &amp; Field Services</strong><span>7501 Groening St. · Odessa, TX 79765 · (432) 233-3600 · pifstitan.com</span><small>Frozen TITAN record · Review ID {review.id}</small></footer>
    </article>
  </main>;
}

export default function FinancialReviewPrintPage() {
  return <Suspense fallback={<main className={styles.shell}><section className={styles.sheet}>Loading finalized review...</section></main>}><FinancialReviewPrintContent /></Suspense>;
}
