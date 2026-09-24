"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Download, Eye, FilePlus2, Plus, RefreshCw, RotateCcw, Save, Search, Trash2, Upload } from "lucide-react";
import { InvoiceExtraction, readInvoiceDocument } from "../../lib/invoiceDocumentReader";
import { supabase } from "../../lib/supabase";
import styles from "./invoice-approvals.module.css";

type InvoiceStatus = "awaiting_approval" | "returned_to_ap" | "disputed" | "approved";
type Invoice = {
  id: string; yard_id: string | null; vendor_id: string | null; vendor_name: string; invoice_number: string;
  invoice_date: string; due_date: string | null; total_amount: number | string; notes: string | null; approver_notes: string | null;
  status: InvoiceStatus; assigned_approver_id: string; assigned_approver_name: string; uploaded_by_name: string;
  uploaded_at: string; dispute_reason: string | null; return_reason: string | null;
};
type CodingLine = { id?: string; invoice_id?: string; accounting_code_id: string; accounting_code?: string; accounting_code_description?: string; accounting_code_search?: string; amount: string | number; cost_center: string; department: string; job_number: string; description: string };
type AccountingCode = { id: string; code: string; description: string; active: boolean };
type Person = { id: string; full_name: string | null; email: string | null; role: string };
type Vendor = { id: string; vendor_name: string; yard_id: string | null };
type Yard = { id: string; name: string; code: string };
type StoredFile = { id: string; invoice_id: string; file_kind: string; version_number: number; is_current: boolean; original_file_name: string; mime_type: string; file_size: number; uploaded_by_name: string; uploaded_at: string };
type Approval = { id: string; invoice_id: string; approver_name: string; approver_id: string; approved_at: string; approved_total: number; approval_statement: string; signature_version: string };
type Activity = { id: string; invoice_id: string; action: string; actor_name: string; note: string | null; created_at: string };
type Permissions = { view: boolean; create: boolean; edit: boolean; approve: boolean; export: boolean; manageSettings: boolean; isAp: boolean; isAdmin: boolean };
type Data = { setupRequired: boolean; error?: string; actor?: { id: string; fullName: string }; permissions?: Permissions; invoices: Invoice[]; codingLines: CodingLine[]; accountingCodes: AccountingCode[]; approvers: Person[]; vendors: Vendor[]; yards: Yard[]; files: StoredFile[]; approvals: Approval[]; activity: Activity[]; approvalStatement: string };
type Tab = "mine" | "awaiting" | "returned" | "disputed" | "approved" | "all" | "codes";

const emptyData: Data = { setupRequired: false, invoices: [], codingLines: [], accountingCodes: [], approvers: [], vendors: [], yards: [], files: [], approvals: [], activity: [], approvalStatement: "" };
const emptyLine = (): CodingLine => ({ accounting_code_id: "", accounting_code_search: "", amount: "", cost_center: "", department: "", job_number: "", description: "" });
const today = new Date().toISOString().slice(0, 10);

function dollars(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dateText(value: unknown, time = false) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

function statusLabel(status: InvoiceStatus) {
  return ({ awaiting_approval: "Awaiting Signature", returned_to_ap: "Returned to AP", disputed: "Disputed", approved: "Approved" })[status];
}

function accountingCodeLabel(code: Pick<AccountingCode, "code" | "description">) {
  return [code.code, code.description].filter(Boolean).join(" · ");
}

async function authHeaders(json = true) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("Sign in to TITAN to continue.");
  return { Authorization: `Bearer ${token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function api(body: Record<string, unknown>) {
  const response = await fetch("/api/invoice-approvals", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "The invoice action failed.") as Error & { payload?: unknown };
    error.payload = payload;
    throw error;
  }
  return payload;
}

export default function InvoiceApprovalsPage() {
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("mine");
  const [selectedId, setSelectedId] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [approverFilter, setApproverFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [coding, setCoding] = useState<CodingLine[]>([emptyLine()]);
  const [approverNotes, setApproverNotes] = useState("");
  const [reason, setReason] = useState("");
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [newApprover, setNewApprover] = useState("");
  const [codeForm, setCodeForm] = useState({ id: "", code: "", description: "", active: true });
  const [uploadForm, setUploadForm] = useState({ vendorId: "", vendorName: "", invoiceNumber: "", invoiceDate: today, dueDate: "", totalAmount: "", yardId: "", approverId: "", notes: "", duplicateAcknowledged: false, duplicateNote: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState("");
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<Invoice[]>([]);
  const [editDuplicateMatches, setEditDuplicateMatches] = useState<Invoice[]>([]);
  const [editForm, setEditForm] = useState({ vendorId: "", vendorName: "", invoiceNumber: "", invoiceDate: "", dueDate: "", totalAmount: "", yardId: "", notes: "", duplicateAcknowledged: false, duplicateNote: "" });

  const load = async (keepNotice = false) => {
    setLoading(true);
    if (!keepNotice) setNotice("");
    try {
      const response = await fetch("/api/invoice-approvals", { headers: await authHeaders(false), cache: "no-store" });
      const payload = await response.json();
      if (!response.ok && !payload.setupRequired) throw new Error(payload.error || "Invoice Approvals could not be loaded.");
      setData({ ...emptyData, ...payload });
      if (payload.permissions?.isAp && tab === "mine") setTab("awaiting");
      const linkedInvoiceId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invoice") || "" : "";
      if (linkedInvoiceId && (payload.invoices || []).some((invoice: Invoice) => invoice.id === linkedInvoiceId)) setSelectedId(linkedInvoiceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = data.invoices.find((invoice) => invoice.id === selectedId) || null;
  const selectedFiles = data.files.filter((file) => file.invoice_id === selectedId);
  const selectedApproval = data.approvals.find((approval) => approval.invoice_id === selectedId);
  const selectedActivity = data.activity.filter((item) => item.invoice_id === selectedId);
  const currentUserId = data.actor?.id || "";
  const canAct = Boolean(selected && selected.status === "awaiting_approval" && selected.assigned_approver_id === currentUserId && data.permissions?.approve);

  useEffect(() => {
    if (!selected) return;
    const existing = data.codingLines.filter((line) => line.invoice_id === selected.id).map((line) => {
      const code = data.accountingCodes.find((item) => item.id === line.accounting_code_id);
      return {
        ...line,
        accounting_code_search: code ? accountingCodeLabel(code) : accountingCodeLabel({ code: line.accounting_code || "", description: line.accounting_code_description || "" }),
        amount: String(line.amount ?? ""),
      };
    });
    setCoding(existing.length ? existing : [emptyLine()]);
    setApproverNotes(selected.approver_notes || "");
    setNewApprover(selected.assigned_approver_id);
    setReason("");
    setSignatureConfirmed(false);
    setEditDuplicateMatches([]);
    setEditForm({ vendorId: selected.vendor_id || "", vendorName: selected.vendor_name, invoiceNumber: selected.invoice_number, invoiceDate: selected.invoice_date, dueDate: selected.due_date || "", totalAmount: String(selected.total_amount), yardId: selected.yard_id || "", notes: selected.notes || "", duplicateAcknowledged: false, duplicateNote: "" });
  }, [selectedId, data.codingLines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    mine: data.invoices.filter((invoice) => invoice.status === "awaiting_approval" && invoice.assigned_approver_id === currentUserId).length,
    awaiting: data.invoices.filter((invoice) => invoice.status === "awaiting_approval").length,
    returned: data.invoices.filter((invoice) => invoice.status === "returned_to_ap").length,
    disputed: data.invoices.filter((invoice) => invoice.status === "disputed").length,
    approved: data.invoices.filter((invoice) => invoice.status === "approved").length,
    all: data.invoices.length,
  }), [data.invoices, currentUserId]);

  const filtered = useMemo(() => data.invoices.filter((invoice) => {
    if (tab === "mine" && !(invoice.status === "awaiting_approval" && invoice.assigned_approver_id === currentUserId)) return false;
    if (tab === "awaiting" && invoice.status !== "awaiting_approval") return false;
    if (tab === "returned" && invoice.status !== "returned_to_ap") return false;
    if (tab === "disputed" && invoice.status !== "disputed") return false;
    if (tab === "approved" && invoice.status !== "approved") return false;
    const haystack = `${invoice.vendor_name} ${invoice.invoice_number} ${invoice.assigned_approver_name}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (approverFilter && invoice.assigned_approver_id !== approverFilter) return false;
    if (fromDate && invoice.invoice_date < fromDate) return false;
    if (toDate && invoice.invoice_date > toDate) return false;
    return true;
  }), [data.invoices, tab, currentUserId, search, approverFilter, fromDate, toDate]);

  const codingTotal = coding.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const codingDifference = selected ? Number(selected.total_amount) - codingTotal : 0;
  const codingHasUnknownCode = coding.some((line) => !line.accounting_code_id);

  const updateCodingLine = (index: number, updates: Partial<CodingLine>) => {
    setCoding((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...updates } : row));
  };

  const updateAccountingCode = (index: number, value: string) => {
    const normalized = value.trim().toLowerCase();
    const match = data.accountingCodes.find((code) => {
      const label = accountingCodeLabel(code).toLowerCase();
      return code.code.toLowerCase() === normalized || label === normalized;
    });
    updateCodingLine(index, { accounting_code_search: value, accounting_code_id: match?.id || "" });
  };

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await work() as { notificationWarning?: string } | undefined;
      setNotice([success, result?.notificationWarning].filter(Boolean).join(" "));
      await load(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const submitUpload = async () => {
    if (!uploadFile) return setNotice("Select the invoice PDF or image.");
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("action", "create_invoice");
      Object.entries(uploadForm).forEach(([key, value]) => form.set(key, String(value)));
      form.set("file", uploadFile);
      const response = await fetch("/api/invoice-approvals", { method: "POST", headers: await authHeaders(false), body: form });
      const payload = await response.json();
      if (response.status === 409 && payload.duplicateWarning) {
        setDuplicateMatches(payload.matches || []);
        setNotice("Possible duplicate found. Review it, add a note, and confirm before uploading.");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Invoice upload failed.");
      setShowUpload(false);
      setDuplicateMatches([]);
      setUploadFile(null);
      setExtraction(null);
      setExtractionMessage("");
      setUploadForm({ vendorId: "", vendorName: "", invoiceNumber: "", invoiceDate: today, dueDate: "", totalAmount: "", yardId: "", approverId: "", notes: "", duplicateAcknowledged: false, duplicateNote: "" });
      setSelectedId(payload.invoiceId);
      setNotice(["Invoice uploaded and assigned.", payload.notificationWarning].filter(Boolean).join(" "));
      await load(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const selectInvoiceFile = async (file: File | null) => {
    setUploadFile(file);
    setExtraction(null);
    setExtractionMessage("");
    setDuplicateMatches([]);
    if (!file) return;
    setExtracting(true);
    try {
      const result = await readInvoiceDocument(file, data.vendors, setExtractionMessage);
      setExtraction(result);
      setUploadForm((form) => ({
        ...form,
        vendorId: result.vendorId || form.vendorId,
        vendorName: result.vendorName || form.vendorName,
        invoiceNumber: result.invoiceNumber || form.invoiceNumber,
        invoiceDate: result.invoiceDate || form.invoiceDate,
        dueDate: result.dueDate || form.dueDate,
        totalAmount: result.totalAmount || form.totalAmount,
        duplicateAcknowledged: false,
      }));
      const found = [result.vendorName, result.invoiceNumber, result.invoiceDate, result.dueDate, result.totalAmount].filter(Boolean).length;
      setExtractionMessage(found ? `TITAN found ${found} of 5 invoice fields. Review the values before uploading.` : "TITAN could not confidently identify invoice fields. Enter them manually before uploading.");
    } catch (error) {
      setExtractionMessage(error instanceof Error ? `${error.message} Enter the invoice details manually.` : "Invoice reading failed. Enter the details manually.");
    } finally {
      setExtracting(false);
    }
  };

  const viewFile = async (file: StoredFile) => {
    try {
      const response = await fetch(`/api/invoice-approvals?fileId=${encodeURIComponent(file.id)}`, { headers: await authHeaders(false) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "File could not be opened.");
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };

  const downloadPacket = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/invoice-approvals/packet?invoiceId=${encodeURIComponent(selected.id)}`, { headers: await authHeaders(false) });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Approved packet could not be generated.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Approved-${selected.vendor_name}-${selected.invoice_number}.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "-");
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const saveInvoiceDetails = async () => {
    if (!selected) return;
    setBusy(true);
    setNotice("");
    try {
      await api({ action: "update_invoice", invoiceId: selected.id, ...editForm });
      setEditDuplicateMatches([]);
      setNotice("Invoice details updated.");
      await load(true);
    } catch (error) {
      const typed = error as Error & { payload?: { duplicateWarning?: boolean; matches?: Invoice[] } };
      if (typed.payload?.duplicateWarning) {
        setEditDuplicateMatches(typed.payload.matches || []);
        setNotice("Possible duplicate found. Review and acknowledge it before saving.");
      } else setNotice(typed.message || String(error));
    } finally { setBusy(false); }
  };

  if (data.setupRequired) return <main className={styles.page}><section className={styles.setup}><AlertTriangle /><div><span>DATABASE SETUP REQUIRED</span><h1>Invoice Approvals</h1><p>{data.error}</p><code>supabase/titan_invoice_approval.sql</code></div></section></main>;

  if (selected) return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>Invoice Approval and Coding</span><h1>{selected.vendor_name}</h1><p>Invoice {selected.invoice_number}</p></div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => setSelectedId("")}><ArrowLeft size={16} /> Back to Queue</button>
          {selected.status === "approved" && data.permissions?.export && <button className={styles.primary} type="button" onClick={downloadPacket} disabled={busy}><Download size={16} /> Approved Packet</button>}
        </div>
      </header>
      {notice && <div className={styles.notice}>{notice}</div>}
      <section className={styles.detailGrid}>
        <div className={styles.documentPanel}>
          <div className={styles.sectionHeading}><div><span>ORIGINAL DOCUMENT</span><h2>Invoice files</h2></div></div>
          <div className={styles.fileList}>{selectedFiles.map((file) => <button key={file.id} type="button" onClick={() => viewFile(file)}><Eye size={18} /><span><strong>{file.original_file_name}</strong><small>Version {file.version_number} · {file.is_current ? "Current" : "Preserved original"} · {dateText(file.uploaded_at, true)}</small></span></button>)}</div>
          {data.permissions?.isAp && selected.status !== "approved" && <label className={styles.replaceFile}><Upload size={16} /><span>Upload corrected invoice</span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void run(async () => { const form = new FormData(); form.set("action", "replace_file"); form.set("invoiceId", selected.id); form.set("file", file); const response = await fetch("/api/invoice-approvals", { method: "POST", headers: await authHeaders(false), body: form }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); }, "Corrected invoice preserved as the current version."); }} /></label>}
        </div>
        <div className={styles.summaryPanel}>
          <div className={styles.statusRow}><span className={`${styles.status} ${styles[selected.status]}`}>{statusLabel(selected.status)}</span><strong>{dollars(selected.total_amount)}</strong></div>
          <dl className={styles.summaryGrid}>
            <div><dt>Invoice date</dt><dd>{dateText(selected.invoice_date)}</dd></div><div><dt>Due date</dt><dd>{dateText(selected.due_date)}</dd></div>
            <div><dt>Approver</dt><dd>{selected.assigned_approver_name}</dd></div><div><dt>Uploaded by</dt><dd>{selected.uploaded_by_name}</dd></div>
            <div><dt>AP notes</dt><dd>{selected.notes || "-"}</dd></div><div><dt>Approver notes</dt><dd>{selected.approver_notes || "-"}</dd></div>
          </dl>
          {(selected.dispute_reason || selected.return_reason) && <div className={styles.reasonBox}><AlertTriangle size={18} /><div><strong>{selected.dispute_reason ? "Dispute reason" : "Return reason"}</strong><p>{selected.dispute_reason || selected.return_reason}</p></div></div>}
          {data.permissions?.isAp && selected.status !== "approved" && <div className={styles.reassign}><label><span>Assign or reassign</span><select value={newApprover} onChange={(event) => setNewApprover(event.target.value)}>{data.approvers.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label><button type="button" onClick={() => run(() => api({ action: "reassign", invoiceId: selected.id, approverId: newApprover }), "Invoice assigned and returned to the approval queue.")} disabled={busy || !newApprover}><RotateCcw size={15} /> Assign</button></div>}
        </div>
      </section>

      {data.permissions?.isAp && selected.status !== "approved" && <section className={styles.editPanel}>
        <div className={styles.sectionHeading}><div><span>AP CORRECTION</span><h2>Edit invoice details</h2></div></div>
        <div className={styles.formGrid}>
          <label><span>Existing vendor</span><select value={editForm.vendorId} onChange={(event) => { const vendor = data.vendors.find((item) => item.id === event.target.value); setEditForm((form) => ({ ...form, vendorId: event.target.value, vendorName: vendor?.vendor_name || form.vendorName, duplicateAcknowledged: false })); }}><option value="">Manual vendor</option>{data.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendor_name}</option>)}</select></label>
          <label><span>Vendor</span><input value={editForm.vendorName} onChange={(event) => setEditForm((form) => ({ ...form, vendorName: event.target.value, vendorId: "", duplicateAcknowledged: false }))} /></label>
          <label><span>Invoice number</span><input value={editForm.invoiceNumber} onChange={(event) => setEditForm((form) => ({ ...form, invoiceNumber: event.target.value, duplicateAcknowledged: false }))} /></label>
          <label><span>Amount</span><input inputMode="decimal" value={editForm.totalAmount} onChange={(event) => setEditForm((form) => ({ ...form, totalAmount: event.target.value }))} /></label>
          <label><span>Invoice date</span><input type="date" value={editForm.invoiceDate} onChange={(event) => setEditForm((form) => ({ ...form, invoiceDate: event.target.value }))} /></label>
          <label><span>Due date</span><input type="date" value={editForm.dueDate} onChange={(event) => setEditForm((form) => ({ ...form, dueDate: event.target.value }))} /></label>
          <label><span>Location</span><select value={editForm.yardId} onChange={(event) => setEditForm((form) => ({ ...form, yardId: event.target.value }))}><option value="">Company-wide</option>{data.yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.name}</option>)}</select></label>
          <label><span>AP notes</span><input value={editForm.notes} onChange={(event) => setEditForm((form) => ({ ...form, notes: event.target.value }))} /></label>
          {editDuplicateMatches.length > 0 && <div className={styles.duplicate}><AlertTriangle size={20} /><div><strong>Possible duplicate</strong>{editDuplicateMatches.map((item) => <p key={item.id}>{item.vendor_name} · {item.invoice_number} · {dollars(item.total_amount)}</p>)}<label><span>Review note</span><input value={editForm.duplicateNote} onChange={(event) => setEditForm((form) => ({ ...form, duplicateNote: event.target.value }))} /></label><label className={styles.confirm}><input type="checkbox" checked={editForm.duplicateAcknowledged} onChange={(event) => setEditForm((form) => ({ ...form, duplicateAcknowledged: event.target.checked }))} /><span>I reviewed this warning and want to save these details.</span></label></div></div>}
        </div>
        <div className={styles.formActions}><button className={styles.primary} onClick={saveInvoiceDetails} disabled={busy || (editDuplicateMatches.length > 0 && !editForm.duplicateAcknowledged)}><Save size={16} /> Save Details</button></div>
      </section>}

      <section className={styles.codingPanel}>
        <div className={styles.sectionHeading}><div><span>ACCOUNTING</span><h2>Coding lines</h2></div><div className={styles.totals}><span>Invoice {dollars(selected.total_amount)}</span><span>Coded {dollars(codingTotal)}</span><strong className={Math.abs(codingDifference) < .005 ? styles.balanced : styles.unbalanced}>Difference {dollars(codingDifference)}</strong></div></div>
        <datalist id="invoice-accounting-code-options">{data.accountingCodes.filter((code) => code.active).map((code) => <option key={code.id} value={accountingCodeLabel(code)} />)}</datalist>
        <div className={styles.codingTable}>
          <div className={styles.codingHeader}><span>Code</span><span>Amount</span><span>Cost center</span><span>Department</span><span>Job / project</span><span>Description</span><span></span></div>
          {coding.map((line, index) => <div className={styles.codingRow} key={`${line.id || "new"}-${index}`}>
            <label className={`${styles.codingField} ${styles.codeField}`}><span>Accounting code</span><input disabled={!canAct} list="invoice-accounting-code-options" placeholder="Search code or description" autoComplete="off" value={line.accounting_code_search || ""} onChange={(event) => updateAccountingCode(index, event.target.value)} />{line.accounting_code_search && !line.accounting_code_id && <small>Select an exact code from the results.</small>}</label>
            <label className={styles.codingField}><span>Amount</span><input disabled={!canAct} inputMode="decimal" placeholder="0.00" value={line.amount} onChange={(event) => updateCodingLine(index, { amount: event.target.value })} /></label>
            <label className={styles.codingField}><span>Cost center</span><input disabled={!canAct} value={line.cost_center || ""} onChange={(event) => updateCodingLine(index, { cost_center: event.target.value })} /></label>
            <label className={styles.codingField}><span>Department</span><input disabled={!canAct} value={line.department || ""} onChange={(event) => updateCodingLine(index, { department: event.target.value })} /></label>
            <label className={styles.codingField}><span>Job / project</span><input disabled={!canAct} value={line.job_number || ""} onChange={(event) => updateCodingLine(index, { job_number: event.target.value })} /></label>
            <label className={`${styles.codingField} ${styles.descriptionField}`}><span>Description</span><input disabled={!canAct} value={line.description || ""} onChange={(event) => updateCodingLine(index, { description: event.target.value })} /></label>
            <button type="button" className={styles.removeCoding} title="Remove coding line" aria-label={`Remove coding line ${index + 1}`} disabled={!canAct || coding.length === 1} onClick={() => setCoding((rows) => rows.filter((_, i) => i !== index))}><Trash2 size={15} /><span>Remove</span></button>
          </div>)}
        </div>
        {canAct && <div className={styles.codingActions}><button type="button" onClick={() => setCoding((rows) => [...rows, emptyLine()])}><Plus size={16} /> Add Line</button><label><span>Approver notes</span><textarea value={approverNotes} onChange={(event) => setApproverNotes(event.target.value)} /></label><button className={styles.primary} type="button" onClick={() => run(() => api({ action: "save_coding", invoiceId: selected.id, lines: coding.map((line) => ({ accountingCodeId: line.accounting_code_id, amount: line.amount, costCenter: line.cost_center, department: line.department, jobNumber: line.job_number, description: line.description })), notes: approverNotes }), "Accounting coding saved.")} disabled={busy || codingHasUnknownCode}><Save size={16} /> Save Coding</button></div>}
      </section>

      {canAct && <section className={styles.actionPanel}>
        <div><span>APPROVAL ACTION</span><h2>Complete your review</h2></div>
        <label className={styles.confirm}><input type="checkbox" checked={signatureConfirmed} onChange={(event) => setSignatureConfirmed(event.target.checked)} /><span>{data.approvalStatement}</span></label>
        <textarea placeholder="Reason required for Dispute or Return to AP" value={reason} onChange={(event) => setReason(event.target.value)} />
        <div><button type="button" className={styles.danger} onClick={() => run(() => api({ action: "dispute", invoiceId: selected.id, reason }), "Invoice moved to Disputed.")} disabled={busy || !reason.trim()}><AlertTriangle size={16} /> Dispute</button><button type="button" onClick={() => run(() => api({ action: "return", invoiceId: selected.id, reason }), "Invoice returned to AP.")} disabled={busy || !reason.trim()}><RotateCcw size={16} /> Return to AP</button><button type="button" className={styles.primary} onClick={() => run(() => api({ action: "approve", invoiceId: selected.id, confirmed: signatureConfirmed }), "Invoice approved and electronically signed.")} disabled={busy || !signatureConfirmed || Math.abs(codingDifference) >= .005}><Check size={16} /> Approve &amp; Sign</button></div>
      </section>}

      {selectedApproval && <section className={styles.signature}><Check size={22} /><div><span>AUTHENTICATED ELECTRONIC APPROVAL</span><strong>{selectedApproval.approver_name}</strong><p>{dateText(selectedApproval.approved_at, true)} · User ID {selectedApproval.approver_id}</p></div></section>}
      <section className={styles.activity}><div className={styles.sectionHeading}><div><span>HISTORY</span><h2>Activity</h2></div></div>{selectedActivity.map((item) => <div key={item.id}><span>{item.action.replaceAll("_", " ")}</span><strong>{item.actor_name}</strong><p>{item.note || ""}</p><time>{dateText(item.created_at, true)}</time></div>)}</section>
    </main>
  );

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "mine", label: "Awaiting My Approval", count: counts.mine },
    ...(data.permissions?.isAp ? [{ key: "awaiting" as Tab, label: "Awaiting Signature", count: counts.awaiting }, { key: "returned" as Tab, label: "Returned to AP", count: counts.returned }, { key: "disputed" as Tab, label: "Disputed", count: counts.disputed }] : []),
    { key: "approved", label: "Approved", count: counts.approved },
    ...(data.permissions?.isAp ? [{ key: "all" as Tab, label: "All", count: counts.all }] : []),
    ...(data.permissions?.manageSettings ? [{ key: "codes" as Tab, label: "Accounting Codes" }] : []),
  ];

  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>Accounts Payable</span><h1>Invoice Approval and Coding</h1><p>Upload once, code, approve, and preserve the complete record.</p></div><div className={styles.headerActions}><button title="Refresh" aria-label="Refresh" onClick={() => load()} disabled={loading}><RefreshCw size={17} /></button>{data.permissions?.isAp && <button className={styles.primary} onClick={() => setShowUpload((value) => !value)}><FilePlus2 size={17} /> New Invoice</button>}</div></header>
    {notice && <div className={styles.notice}>{notice}</div>}
    <section className={styles.metrics}><div><span>Awaiting Signature</span><strong>{counts.awaiting}</strong></div><div><span>My Approvals</span><strong>{counts.mine}</strong></div><div><span>Returned to AP</span><strong>{counts.returned}</strong></div><div><span>Disputed</span><strong>{counts.disputed}</strong></div><div><span>Approved</span><strong>{counts.approved}</strong></div></section>

    {showUpload && <section className={styles.uploadPanel}><div className={styles.sectionHeading}><div><span>NEW INVOICE</span><h2>Upload and assign</h2></div></div><div className={styles.formGrid}>
      <label><span>Existing vendor</span><select value={uploadForm.vendorId} onChange={(event) => { const vendor = data.vendors.find((item) => item.id === event.target.value); setUploadForm((form) => ({ ...form, vendorId: event.target.value, vendorName: vendor?.vendor_name || form.vendorName })); }}><option value="">Enter vendor manually</option>{data.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendor_name}</option>)}</select></label>
      <label><span>Vendor</span><input required value={uploadForm.vendorName} onChange={(event) => setUploadForm((form) => ({ ...form, vendorName: event.target.value, vendorId: "" }))} /></label>
      <label><span>Invoice number</span><input required value={uploadForm.invoiceNumber} onChange={(event) => setUploadForm((form) => ({ ...form, invoiceNumber: event.target.value, duplicateAcknowledged: false }))} /></label>
      <label><span>Amount</span><input required inputMode="decimal" value={uploadForm.totalAmount} onChange={(event) => setUploadForm((form) => ({ ...form, totalAmount: event.target.value }))} /></label>
      <label><span>Invoice date</span><input type="date" value={uploadForm.invoiceDate} onChange={(event) => setUploadForm((form) => ({ ...form, invoiceDate: event.target.value }))} /></label>
      <label><span>Due date</span><input type="date" value={uploadForm.dueDate} onChange={(event) => setUploadForm((form) => ({ ...form, dueDate: event.target.value }))} /></label>
      <label><span>Location (optional)</span><select value={uploadForm.yardId} onChange={(event) => setUploadForm((form) => ({ ...form, yardId: event.target.value }))}><option value="">Company-wide</option>{data.yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.name}</option>)}</select></label>
      <label><span>Approver</span><select value={uploadForm.approverId} onChange={(event) => setUploadForm((form) => ({ ...form, approverId: event.target.value }))}><option value="">Select approver</option>{data.approvers.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label>
      <label className={styles.wide}><span>AP notes</span><textarea value={uploadForm.notes} onChange={(event) => setUploadForm((form) => ({ ...form, notes: event.target.value }))} /></label>
      <label className={styles.fileField}><Upload size={18} /><span>{uploadFile?.name || "Select PDF, JPG, or PNG"}</span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => void selectInvoiceFile(event.target.files?.[0] || null)} /></label>
      {(extracting || extractionMessage) && <div className={styles.extractionReview}>
        <RefreshCw className={extracting ? styles.spinning : ""} size={20} />
        <div><strong>{extracting ? "Reading invoice" : "Review extracted data"}</strong><p>{extractionMessage}</p>{extraction && <div><span>{extraction.source === "pdf-text" ? "Digital PDF" : "OCR"}</span>{extraction.confidence !== null && <span>{Math.round(extraction.confidence)}% text confidence</span>}<span>{extraction.vendorName ? "Vendor found" : "Vendor needed"}</span><span>{extraction.invoiceNumber ? "Invoice number found" : "Invoice number needed"}</span><span>{extraction.totalAmount ? "Total found" : "Total needed"}</span></div>}</div>
      </div>}
      {duplicateMatches.length > 0 && <div className={styles.duplicate}><AlertTriangle size={20} /><div><strong>Possible duplicate</strong>{duplicateMatches.map((item) => <p key={item.id}>{item.vendor_name} · {item.invoice_number} · {dollars(item.total_amount)} · {statusLabel(item.status)}</p>)}<label><span>Review note</span><input value={uploadForm.duplicateNote} onChange={(event) => setUploadForm((form) => ({ ...form, duplicateNote: event.target.value }))} /></label><label className={styles.confirm}><input type="checkbox" checked={uploadForm.duplicateAcknowledged} onChange={(event) => setUploadForm((form) => ({ ...form, duplicateAcknowledged: event.target.checked }))} /><span>I reviewed this warning and want to continue.</span></label></div></div>}
    </div><div className={styles.formActions}><button onClick={() => setShowUpload(false)}>Cancel</button><button className={styles.primary} onClick={submitUpload} disabled={busy || extracting || (duplicateMatches.length > 0 && !uploadForm.duplicateAcknowledged)}><Upload size={16} /> Upload and Assign</button></div></section>}

    <nav className={styles.tabs}>{tabs.map((item) => <button key={item.key} className={tab === item.key ? styles.activeTab : ""} onClick={() => setTab(item.key)}>{item.label}{item.count !== undefined && <b>{item.count}</b>}</button>)}</nav>

    {tab === "codes" ? <section className={styles.codesPanel}><div className={styles.sectionHeading}><div><span>CONTROLLED LIST</span><h2>Accounting codes</h2></div></div><div className={styles.codeForm}><input placeholder="Code" value={codeForm.code} onChange={(event) => setCodeForm((form) => ({ ...form, code: event.target.value }))} /><input placeholder="Description" value={codeForm.description} onChange={(event) => setCodeForm((form) => ({ ...form, description: event.target.value }))} /><label className={styles.toggle}><input type="checkbox" checked={codeForm.active} onChange={(event) => setCodeForm((form) => ({ ...form, active: event.target.checked }))} /><span>Active</span></label><button className={styles.primary} onClick={() => run(() => api({ action: "save_code", ...codeForm }), "Accounting code saved.").then(() => setCodeForm({ id: "", code: "", description: "", active: true }))} disabled={busy || !codeForm.code.trim()}><Save size={16} /> Save</button></div><div className={styles.codeList}>{data.accountingCodes.map((code) => <button key={code.id} onClick={() => setCodeForm(code)}><strong>{code.code}</strong><span>{code.description || "No description"}</span><small>{code.active ? "Active" : "Inactive"}</small></button>)}</div></section> : <>
      <section className={styles.filters}><label><Search size={16} /><input placeholder="Vendor, invoice, or approver" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={approverFilter} onChange={(event) => setApproverFilter(event.target.value)}><option value="">All approvers</option>{data.approvers.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select><label><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></section>
      <section className={styles.invoiceList}><div className={styles.listHeader}><span>Vendor / Invoice</span><span>Date / Due</span><span>Approver</span><span>Status</span><span>Amount</span><span></span></div>{loading ? <p className={styles.empty}>Loading invoices...</p> : filtered.length === 0 ? <p className={styles.empty}>No invoices match this view.</p> : filtered.map((invoice) => <button className={styles.invoiceRow} key={invoice.id} onClick={() => setSelectedId(invoice.id)}><span className={styles.invoicePrimary}><strong>{invoice.vendor_name}</strong><small>{invoice.invoice_number}</small></span><span className={styles.invoiceDates}><strong>{dateText(invoice.invoice_date)}</strong><small>Due {dateText(invoice.due_date)}</small></span><span className={styles.invoiceApprover} data-label="Approver">{invoice.assigned_approver_name}</span><span className={styles.invoiceStatus} data-label="Status"><i className={`${styles.status} ${styles[invoice.status]}`}>{statusLabel(invoice.status)}</i></span><span className={styles.invoiceAmount} data-label="Amount"><strong>{dollars(invoice.total_amount)}</strong></span><Eye className={styles.invoiceOpen} size={17} /></button>)}</section>
    </>}
  </main>;
}
