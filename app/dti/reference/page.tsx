"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useMemo, useState } from "react";
import { goBackOrFallback } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "./reference.module.css";

type ResultType = "Document" | "Tubular Specification" | "Customer Requirement" | "Field Lesson";
type SearchResult = { id: string; type: ResultType; title: string; reference: string; summary: string; context: string; href: string; documentId?: string; updatedAt: string };
type SearchResponse = { results?: SearchResult[]; counts?: Record<string, number>; error?: string };

const resultTypes: Array<"All" | ResultType> = ["All", "Document", "Tubular Specification", "Customer Requirement", "Field Lesson"];

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function DtiReferencePage() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filter, setFilter] = useState<"All" | ResultType>("All");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState("");

  const accessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) { window.location.assign("/login"); return ""; }
    return data.session.access_token;
  }, []);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    const value = query.trim();
    if (value.length < 2) { setMessage("Enter at least two characters to search DTI records."); return; }
    setLoading(true); setMessage(""); setFilter("All");
    try {
      const token = await accessToken();
      if (!token) return;
      const request = await fetch(`/api/dti/reference?q=${encodeURIComponent(value)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as SearchResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not search DTI records.");
      setResults(body.results ?? []); setSearched(value);
    } catch (error) {
      setResults([]); setSearched(value);
      setMessage(error instanceof Error ? error.message : "TITAN could not search DTI records.");
    } finally { setLoading(false); }
  }

  const visible = useMemo(() => filter === "All" ? results : results.filter((result) => result.type === filter), [filter, results]);
  const counts = useMemo(() => results.reduce<Record<string, number>>((total, result) => { total[result.type] = (total[result.type] ?? 0) + 1; return total; }, {}), [results]);

  async function openResult(result: SearchResult) {
    if (!result.documentId) { window.location.assign(result.href); return; }
    const newWindow = window.open("about:blank", "_blank");
    setOpening(result.id); setMessage("");
    try {
      const token = await accessToken();
      if (!token) { newWindow?.close(); return; }
      const request = await fetch(`/api/dti/documents?documentId=${encodeURIComponent(result.documentId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as { url?: string; error?: string };
      if (!request.ok || !body.url) throw new Error(body.error || "TITAN could not open this document.");
      if (newWindow) newWindow.location.href = body.url;
      else window.location.assign(body.url);
    } catch (error) {
      newWindow?.close();
      setMessage(error instanceof Error ? error.message : "TITAN could not open this document.");
    } finally { setOpening(""); }
  }

  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}>
      <div className={styles.title}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI</span><h1>Ask TITAN</h1></div></div>
      <div className={styles.actions}><button type="button" onClick={() => goBackOrFallback("/service-lines/dti")}>Back</button><Link href="/dti/documents">Documents</Link><Link href="/dti/tubular-specs">Specifications</Link></div>
    </header>

    <form className={styles.search} onSubmit={(event) => void search(event)}>
      <label><span>Search DTI Knowledge</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pipe size, connection, customer, requirement, defect, or document..." autoFocus /><button type="submit" disabled={loading}>{loading ? "Searching..." : "Search"}</button></div></label>
      <p>Results come only from approved documents, controlled specifications, active requirements, and recorded DTI job lessons.</p>
    </form>

    {message ? <div className={styles.message}>{message}</div> : null}
    {searched ? <section className={styles.results}>
      <div className={styles.resultHead}><div><span>Search Results</span><strong>{results.length} matches for &quot;{searched}&quot;</strong></div><div className={styles.filters}>{resultTypes.map((type) => <button key={type} type="button" data-active={filter === type} onClick={() => setFilter(type)}>{type}<b>{type === "All" ? results.length : counts[type] ?? 0}</b></button>)}</div></div>
      <div className={styles.rows}>{visible.map((result) => <button key={result.id} type="button" onClick={() => void openResult(result)} disabled={opening === result.id}>
        <span className={styles.type}>{result.type}</span><div className={styles.resultBody}><strong>{result.title}</strong><p>{result.summary}</p><small>{result.context}</small></div><div className={styles.source}><b>{result.reference}</b><time>{formatDate(result.updatedAt)}</time><span>{opening === result.id ? "Opening..." : result.documentId ? "Open Document" : "Open Source"}</span></div>
      </button>)}{!visible.length ? <div className={styles.empty}>No {filter === "All" ? "controlled DTI records" : filter.toLowerCase()} matched this search.</div> : null}</div>
    </section> : <section className={styles.start}><strong>Search the DTI record</strong><span>Use a pipe description, customer, rig, inspection issue, acceptance value, or document number.</span></section>}
  </main>;
}
