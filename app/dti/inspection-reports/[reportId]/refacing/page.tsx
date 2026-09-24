"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dtiComponentLabel, resolveDtiReportComponentType, type DtiComponentType } from "../../../../../lib/dtiInspectionReport";
import { dtiRefacingFields as fields, getDtiRefacingData as refacingData, getDtiRefacingRows } from "../../../../../lib/dtiRefacingReport";
import { getValidAccessToken, redirectToLogin } from "../../../../../lib/clientSession";
import { getDtiOfflineSnapshot, saveDtiOfflineSnapshot, sendOrQueueDtiMutation } from "../../../../../lib/dtiOfflineQueue";
import { goBackOrFallback } from "../../../../../lib/navigation";
import styles from "../../reports.module.css";

type Report = {
  id: string;
  report_number: string;
  operator_name: string;
  contractor_name: string | null;
  rig_number: string | null;
  report_date: string;
  field_invoice: string | null;
  inspection_crew: string | null;
  connection_size: string | null;
  connection_type: string | null;
  grade: string | null;
  state: string | null;
  inspection_scope: Record<string, unknown>;
  status: string;
};
type Item = {
  id: string;
  report_id: string;
  component_type: DtiComponentType;
  sequence_number: number;
  row_data: Record<string, unknown>;
  grading_result?: { areas?: { Final?: { classification?: string | null } } } | null;
};
type ApiData = { report?: Report; items?: Item[]; error?: string };

const endpoint = "/api/dti/inspection-reports";
function text(value: unknown) { return String(value ?? "").trim(); }
function display(value: unknown) { return text(value) || "-"; }

export default function DtiRefacingReportPage() {
  const params = useParams<{ reportId: string }>();
  const reportId = String(params.reportId ?? "");
  const snapshotKey = `inspection-report:${reportId}`;
  const [data, setData] = useState<ApiData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [dirty, setDirty] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("Loading refacing report...");

  const load = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) { redirectToLogin(); return; }
      const response = await fetch(`${endpoint}?reportId=${encodeURIComponent(reportId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json() as ApiData;
      if (!response.ok) throw new Error(body.error || "TITAN could not load the refacing report.");
      setData(body);
      setDrafts(Object.fromEntries((body.items ?? []).map((item) => [item.id, refacingData(item)])));
      setDirty([]);
      setMessage("");
      await saveDtiOfflineSnapshot(snapshotKey, body).catch(() => undefined);
    } catch (error) {
      const cached = await getDtiOfflineSnapshot<ApiData>(snapshotKey).catch(() => null);
      if (cached?.data.report) {
        setData(cached.data);
        setDrafts(Object.fromEntries((cached.data.items ?? []).map((item) => [item.id, refacingData(item)])));
        setMessage("Offline report copy loaded. Saved changes will sync when service returns.");
      } else setMessage(error instanceof Error ? error.message : "TITAN could not load the refacing report.");
    }
  }, [reportId, snapshotKey]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const report = data?.report;
  const componentType = resolveDtiReportComponentType(report?.inspection_scope, data?.items);
  const componentLabel = dtiComponentLabel(componentType);
  const rows = useMemo(() => getDtiRefacingRows(data?.items ?? [], componentType), [componentType, data?.items]);

  function update(itemId: string, key: string, value: string) {
    setDrafts((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? {}), [key]: value } }));
    setDirty((current) => current.includes(itemId) ? current : [...current, itemId]);
  }

  async function saveRows() {
    if (!report || !dirty.length || saving) return;
    setSaving(true); setMessage("");
    try {
      const savedIds = [...dirty];
      let queued = 0;
      for (const itemId of savedIds) {
        const item = rows.find((entry) => entry.id === itemId);
        if (!item) continue;
        const result = await sendOrQueueDtiMutation<ApiData>({ action: "save-item", reportId, itemId, componentType: item.component_type, sequenceNumber: item.sequence_number, rowData: drafts[itemId] }, endpoint);
        if (result.status === "queued") queued += 1;
      }
      const nextData = data ? { ...data, items: (data.items ?? []).map((item) => savedIds.includes(item.id) ? { ...item, row_data: drafts[item.id] } : item) } : data;
      if (nextData) { setData(nextData); await saveDtiOfflineSnapshot(snapshotKey, nextData).catch(() => undefined); }
      setDirty([]);
      setMessage(queued ? `${queued} refacing row${queued === 1 ? "" : "s"} saved offline and waiting to sync.` : "Refacing report saved.");
      if (!queued) await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save the refacing report."); }
    finally { setSaving(false); }
  }

  async function exportExcel() {
    if (!report || exporting) return;
    setExporting(true); setMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) { redirectToLogin(); return; }
      const response = await fetch(`/api/dti/inspection-reports/refacing-export?reportId=${encodeURIComponent(reportId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || "TITAN could not export the refacing report."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${report.report_number}-RFX.xlsx`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setMessage("Refacing report exported to Excel.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not export the refacing report."); }
    finally { setExporting(false); }
  }

  return <main className={styles.page}>
    <div className={styles.screenOnly}>
      <header className={`${styles.header} titan-page-header`}><div className={styles.title}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>{report ? `${report.report_number}-RFX` : "DTI Refacing"}</span><h1>{componentLabel} Refacing Report</h1></div></div><div className={styles.actions}><button type="button" onClick={() => goBackOrFallback(`/dti/inspection-reports/${encodeURIComponent(reportId)}`)}>Back</button><button type="button" onClick={() => void load()}>Refresh</button><button type="button" onClick={() => window.print()} disabled={!report}>Print / PDF</button><button type="button" onClick={() => void exportExcel()} disabled={!report || exporting}>{exporting ? "Exporting" : "Export Excel"}</button><button className={styles.primary} type="button" onClick={() => void saveRows()} disabled={!dirty.length || saving}>{saving ? "Saving" : `Save${dirty.length ? ` (${dirty.length})` : ""}`}</button></div></header>
      {message ? <div className={message.includes("saved") ? styles.saved : styles.message}>{message}</div> : null}
      {report ? <section className={styles.reportBand}>{([['Operator',report.operator_name],['Contractor',report.contractor_name],['Rig Number',report.rig_number],['Report Date',report.report_date],['Field Invoice',report.field_invoice],['Inspection Crew',report.inspection_crew],['Connection',`${report.connection_size || "-"} / ${report.connection_type || "-"}`],['Grade / State',`${report.grade || "-"} / ${report.state || "-"}`]] as const).map(([label,value]) => <div key={label}><span>{label}</span><strong>{value || "-"}</strong></div>)}</section> : null}
      <section className={styles.refacingEditor}><div className={styles.sectionHead}><div><span>Inspection Findings</span><h2>{rows.length} Joint{rows.length === 1 ? "" : "s"} Requiring Reface</h2></div></div>
        <div className={styles.refacingScroll}><table className={styles.refacingTable}><thead><tr><th>No.</th><th>Serial #</th>{fields.map(([,label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((item) => { const row = drafts[item.id] ?? refacingData(item); return <tr key={item.id}><td>{item.sequence_number}</td><td>{display(row.serialNumber)}</td>{fields.map(([key,label]) => <td key={key}><label><span>{label}</span>{["refacePresent","refaceClassReject"].includes(key) ? <select value={text(row[key])} onChange={(event) => update(item.id, key, event.target.value)}><option value="">Select</option><option>Yes</option><option>No</option></select> : <input inputMode={key.includes("Depth") || key.includes("Length") || key.includes("Tong") ? "decimal" : "text"} value={text(row[key])} onChange={(event) => update(item.id, key, event.target.value)} />}</label></td>)}</tr>; })}{!rows.length ? <tr><td colSpan={fields.length + 2}>No box or pin reface findings are currently selected on this inspection report.</td></tr> : null}</tbody></table></div>
      </section>
    </div>

    {report ? <article className={`${styles.printOnly} ${styles.refacingPrint}`}>
      <header className={styles.printLetterhead}><Image src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" width={220} height={70} /><div><strong>Pathfinder Inspections &amp; Field Services</strong><span>7501 Groening St., Odessa, TX 79765</span><span>(432) 233-3600</span></div></header>
      <section className={styles.printTitle}><div><span>{report.report_number}-RFX</span><h1>{componentLabel} Refacing Report</h1></div><div><span>Report Date</span><strong>{report.report_date}</strong><span>Status</span><strong>{report.status}</strong></div></section>
      <section className={styles.printInfo}>{([['Operator',report.operator_name],['Contractor',report.contractor_name],['Rig Number',report.rig_number],['Field Invoice',report.field_invoice],['Inspection Crew',report.inspection_crew],['Connection Size',report.connection_size],['Connection Type',report.connection_type],['Grade',report.grade],['State',report.state]] as const).map(([label,value]) => <div key={label}><span>{label}</span><strong>{value || "-"}</strong></div>)}</section>
      <section className={styles.refacingPrintTable}><table><thead><tr><th rowSpan={2}>No.</th><th rowSpan={2}>Serial #</th><th rowSpan={2}>Present</th><th rowSpan={2}>Initial Class</th><th rowSpan={2}>Final Class</th><th rowSpan={2}>Class Reject</th><th>Box Repair Req.</th><th colSpan={2}>Box Depth</th><th colSpan={2}>Box Tong</th><th>Box</th><th>Pin Repair Req.</th><th colSpan={2}>Pin Length</th><th colSpan={2}>Pin Tong</th><th>Pin</th></tr><tr><th></th><th>Before</th><th>After</th><th>Before</th><th>After</th><th>Results</th><th></th><th>Before</th><th>After</th><th>Before</th><th>After</th><th>Results</th></tr></thead><tbody>{rows.map((item) => { const row = drafts[item.id] ?? refacingData(item); return <tr key={item.id}><td>{item.sequence_number}</td><td>{display(row.serialNumber)}</td>{fields.map(([key]) => <td key={key}>{display(row[key])}</td>)}</tr>; })}{!rows.length ? <tr><td colSpan={18}>No reface findings recorded.</td></tr> : null}</tbody></table></section>
    </article> : null}
  </main>;
}
