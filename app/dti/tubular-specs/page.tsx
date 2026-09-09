"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { goBackOrFallback } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "./tubular-specs.module.css";

type SourceDocument = { id: string; title: string; document_number: string; department: string };
type Spec = {
  id: string; pipe_size: string; weight_ppf: number; grade: string; connection: string;
  new_wall_inches: number | null; premium_min_wall_inches: number | null; class_2_min_wall_inches: number | null;
  tj_od_min_premium_inches: number | null; tj_id_max_inches: number | null;
  bevel_diameter_min_inches: number | null; bevel_diameter_max_inches: number | null; tong_space_min_inches: number | null;
  source_document_id: string; notes: string | null; source_document: SourceDocument | null;
};
type ResponseData = { specs?: Spec[]; documents?: SourceDocument[]; error?: string };
type Form = { id: string; pipeSize: string; weightPpf: string; grade: string; connection: string; newWall: string; premiumMinWall: string; class2MinWall: string; tjOdMin: string; tjIdMax: string; bevelMin: string; bevelMax: string; tongSpaceMin: string; sourceDocumentId: string; notes: string };

const emptyForm: Form = { id: "", pipeSize: "", weightPpf: "", grade: "", connection: "", newWall: "", premiumMinWall: "", class2MinWall: "", tjOdMin: "", tjIdMax: "", bevelMin: "", bevelMax: "", tongSpaceMin: "", sourceDocumentId: "", notes: "" };
function value(number: number | null) { return number === null ? "-" : String(number); }
function editForm(spec: Spec): Form { return { id: spec.id, pipeSize: spec.pipe_size, weightPpf: String(spec.weight_ppf), grade: spec.grade, connection: spec.connection, newWall: value(spec.new_wall_inches).replace("-", ""), premiumMinWall: value(spec.premium_min_wall_inches).replace("-", ""), class2MinWall: value(spec.class_2_min_wall_inches).replace("-", ""), tjOdMin: value(spec.tj_od_min_premium_inches).replace("-", ""), tjIdMax: value(spec.tj_id_max_inches).replace("-", ""), bevelMin: value(spec.bevel_diameter_min_inches).replace("-", ""), bevelMax: value(spec.bevel_diameter_max_inches).replace("-", ""), tongSpaceMin: value(spec.tong_space_min_inches).replace("-", ""), sourceDocumentId: spec.source_document_id, notes: spec.notes || "" }; }

export default function TubularSpecsPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [message, setMessage] = useState("Loading controlled specifications...");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setMessage("Loading controlled specifications...");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch("/api/dti/tubular-specs", { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as ResponseData;
      if (!request.ok) throw new Error(body.error || "TITAN could not load Tubular Specifications.");
      setData(body); setMessage("");
    } catch (error) { setData(null); setMessage(error instanceof Error ? error.message : "TITAN could not load Tubular Specifications."); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const specs = useMemo(() => data?.specs ?? [], [data?.specs]);
  const visible = useMemo(() => { const query = search.trim().toLowerCase(); return specs.filter((spec) => !query || [spec.pipe_size, spec.weight_ppf, spec.grade, spec.connection, spec.source_document?.title, spec.source_document?.document_number].some((item) => String(item ?? "").toLowerCase().includes(query))); }, [search, specs]);

  async function send(body: Record<string, unknown>) {
    setSaving(true); setMessage("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const request = await fetch("/api/dti/tubular-specs", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token || ""}` }, body: JSON.stringify(body) });
      const result = await request.json() as { error?: string };
      if (!request.ok) throw new Error(result.error || "TITAN could not save this specification.");
      setForm(null); await load(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save this specification."); return false; }
    finally { setSaving(false); }
  }

  async function archive(spec: Spec) {
    if (!window.confirm(`Archive ${spec.pipe_size} / ${spec.weight_ppf} / ${spec.grade} / ${spec.connection}?`)) return;
    await send({ action: "archive", id: spec.id });
  }

  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}><div className={styles.title}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI</span><h1>Tubular Specifications</h1></div></div><div className={styles.actions}><button type="button" onClick={() => goBackOrFallback("/service-lines/dti")}>Back</button><Link href="/dti/documents">Documents</Link><button type="button" onClick={() => void load()}>Refresh</button></div></header>
    <section className={styles.toolbar}><label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Size, weight, grade, connection, or source..." /></label><button type="button" onClick={() => setForm({ ...emptyForm })}>Add Controlled Specification</button></section>
    {message ? <div className={styles.message}>{message}</div> : null}
    <section className={styles.tablePanel}><div className={styles.count}>{visible.length} active specifications</div><div className={styles.tableWrap}><table><thead><tr><th>Size</th><th>Weight #/ft</th><th>Grade</th><th>Connection</th><th>New Wall</th><th>Premium Min Wall</th><th>Class 2 Min Wall</th><th>TJ OD Min</th><th>TJ ID Max</th><th>Bevel Min-Max</th><th>Tong Space Min</th><th>Source</th><th></th></tr></thead><tbody>{visible.map((spec) => <tr key={spec.id}><td>{spec.pipe_size}</td><td>{spec.weight_ppf}</td><td>{spec.grade}</td><td>{spec.connection}</td><td>{value(spec.new_wall_inches)}</td><td>{value(spec.premium_min_wall_inches)}</td><td>{value(spec.class_2_min_wall_inches)}</td><td>{value(spec.tj_od_min_premium_inches)}</td><td>{value(spec.tj_id_max_inches)}</td><td>{value(spec.bevel_diameter_min_inches)} - {value(spec.bevel_diameter_max_inches)}</td><td>{value(spec.tong_space_min_inches)}</td><td>{spec.source_document ? `${spec.source_document.document_number || "Document"} / ${spec.source_document.title}` : "Controlled document"}</td><td><button type="button" onClick={() => setForm(editForm(spec))}>Edit</button><button type="button" onClick={() => void archive(spec)}>Archive</button></td></tr>)}{!visible.length ? <tr><td colSpan={13}>No controlled specification rows are loaded.</td></tr> : null}</tbody></table></div></section>
    {form ? <div className={styles.backdrop}><section className={styles.modal} role="dialog" aria-modal="true"><div className={styles.modalHead}><div><span>Controlled Source Required</span><h2>{form.id ? "Edit Specification" : "Add Specification"}</h2></div><button type="button" onClick={() => setForm(null)} aria-label="Close">X</button></div><div className={styles.formGrid}>{([['pipeSize','Pipe Size'],['weightPpf','Weight (#/ft)'],['grade','Grade'],['connection','Connection'],['newWall','New Wall (in)'],['premiumMinWall','Premium Min Wall'],['class2MinWall','Class 2 Min Wall'],['tjOdMin','TJ OD Min (Premium)'],['tjIdMax','TJ ID Max'],['bevelMin','Bevel Diameter Min'],['bevelMax','Bevel Diameter Max'],['tongSpaceMin','Tong Space Min']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type={['pipeSize','grade','connection'].includes(key) ? "text" : "number"} step="any" min={['pipeSize','grade','connection'].includes(key) ? undefined : "0.0001"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<label className={styles.full}><span>Approved Source Document</span><select value={form.sourceDocumentId} onChange={(event) => setForm({ ...form, sourceDocumentId: event.target.value })}><option value="">Select controlled document</option>{(data?.documents ?? []).map((document) => <option key={document.id} value={document.id}>{document.document_number ? `${document.document_number} / ` : ""}{document.title}</option>)}</select></label><label className={styles.full}><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div><div className={styles.modalActions}><button type="button" onClick={() => setForm(null)}>Cancel</button><button type="button" disabled={saving || !form.pipeSize || !form.weightPpf || !form.grade || !form.connection || !form.sourceDocumentId} onClick={() => void send(form)}>{saving ? "Saving..." : "Save Specification"}</button></div></section></div> : null}
  </main>;
}
