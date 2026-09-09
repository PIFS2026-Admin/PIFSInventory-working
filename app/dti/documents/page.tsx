"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { goBackOrFallback } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "./documents.module.css";

type DocumentRecord = {
  id: string;
  documentNumber: string;
  title: string;
  category: string;
  serviceLine: string;
  issueDate: string;
  expirationDate: string;
  fileName: string;
  notes: string;
  updatedAt: string;
};
type DocumentResponse = { documents?: DocumentRecord[]; url?: string; error?: string };

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function DtiDocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [message, setMessage] = useState("Loading controlled documents...");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [opening, setOpening] = useState("");

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) { window.location.assign("/login"); return ""; }
    return data.session.access_token;
  }, []);

  const load = useCallback(async () => {
    setMessage("Loading controlled documents...");
    try {
      const accessToken = await token();
      if (!accessToken) return;
      const request = await fetch("/api/dti/documents", { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await request.json() as DocumentResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not load DTI documents.");
      setDocuments(body.documents ?? []);
      setMessage("");
    } catch (error) {
      setDocuments([]);
      setMessage(error instanceof Error ? error.message : "TITAN could not load DTI documents.");
    }
  }, [token]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const categories = useMemo(() => ["All", ...new Set(documents.map((document) => document.category))], [documents]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter((document) => (category === "All" || document.category === category)
      && (!query || [document.documentNumber, document.title, document.category, document.notes, document.fileName].some((value) => value.toLowerCase().includes(query))));
  }, [category, documents, search]);

  async function openDocument(document: DocumentRecord) {
    const newWindow = window.open("about:blank", "_blank");
    setOpening(document.id);
    try {
      const accessToken = await token();
      if (!accessToken) { newWindow?.close(); return; }
      const request = await fetch(`/api/dti/documents?documentId=${encodeURIComponent(document.id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await request.json() as DocumentResponse;
      if (!request.ok || !body.url) throw new Error(body.error || "TITAN could not open this document.");
      if (newWindow) newWindow.location.href = body.url;
      else window.location.assign(body.url);
    } catch (error) {
      newWindow?.close();
      setMessage(error instanceof Error ? error.message : "TITAN could not open this document.");
    } finally { setOpening(""); }
  }

  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}><div className={styles.title}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI</span><h1>Document Library</h1></div></div><div className={styles.actions}><button type="button" onClick={() => goBackOrFallback("/service-lines/dti")}>Back</button><Link href="/document-control">Document Control</Link><button type="button" onClick={() => void load()}>Refresh</button></div></header>
    <section className={styles.toolbar}><label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Document number, title, category, or file..." /></label><label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((value) => <option key={value}>{value}</option>)}</select></label></section>
    {message ? <div className={styles.message}>{message}</div> : <section className={styles.library}><div className={styles.count}>{visible.length} approved documents</div><div className={styles.rows}>{visible.map((document) => <button key={document.id} type="button" onClick={() => void openDocument(document)} disabled={opening === document.id}><div><span>{document.documentNumber || document.category}</span><strong>{document.title}</strong><small>{document.fileName || document.notes || "Controlled document"}</small></div><dl><div><dt>Service Line</dt><dd>{document.serviceLine}</dd></div><div><dt>Issued</dt><dd>{formatDate(document.issueDate)}</dd></div><div><dt>Expires</dt><dd>{formatDate(document.expirationDate)}</dd></div></dl><b>{opening === document.id ? "Opening..." : "Open"}</b></button>)}{!visible.length ? <div className={styles.empty}>No approved DTI documents match this search.</div> : null}</div></section>}
  </main>;
}
