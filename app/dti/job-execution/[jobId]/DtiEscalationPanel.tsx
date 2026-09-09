"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabase";
import styles from "./jobExecution.module.css";

type Rack = { id: string; rack_number: number; rack_name: string | null };
type Escalation = { id: string; escalation_number: string; rack_run_id: string | null; component_ids: string; condition_type: string; component_location: string; operational_risk: string; inspector_recommendation: string; customer_decision: string | null; status: string; deviation_id: string | null; created_at: string };
type Document = { id: string; document_number: string | null; title: string | null; file_name: string | null; document_type: string | null };
type Props = { jobId: string; runId: string; racks: Rack[]; escalations: Escalation[]; documents: Document[]; onSaved: () => void };

const today = new Date().toISOString().slice(0, 10);
const blank = { rackId: "", componentIds: "", quantity: "1", conditionType: "", conditionDescription: "", componentLocation: "", measurements: "", serviceCategory: "", criticalArea: false, repeatedCondition: false, controllingCriteria: "", operationalRisk: "Moderate", inspectorRecommendation: "Further Evaluation", leadInspectorName: "", customerDecision: "", customerRepName: "", customerCompany: "", customerContactedOn: today, communicationMethod: "Email", confirmationDocumentId: "", decisionNotes: "" };

export default function DtiEscalationPanel({ jobId, runId, racks, escalations, documents, onSaved }: Props) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState(blank); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const update = (changes: Partial<typeof blank>) => setForm((current) => ({ ...current, ...changes }));
  async function save() {
    if (saving) return; setSaving(true); setMessage("");
    try {
      const { data: auth } = await supabase.auth.getSession(); const token = auth.session?.access_token; if (!token) return window.location.assign("/login");
      const response = await fetch("/api/dti/job-execution", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-escalation", jobId, runId, ...form }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "TITAN could not save the escalation.");
      setForm(blank); setOpen(false); setMessage("Borderline escalation recorded."); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save the escalation."); } finally { setSaving(false); }
  }
  return <section className={styles.escalations}>
    <div className={styles.panelHead}><div><span>OMS-109</span><h2>Borderline Decisions</h2></div><div className={styles.rowActions}><strong>{escalations.filter((item) => item.status !== "Resolved").length} open</strong><button className={styles.primary} type="button" onClick={() => setOpen((value) => !value)}>{open ? "Cancel" : "Flag Condition"}</button></div></div>
    {message ? <div className={message.includes("recorded") ? styles.onTrack : styles.message}>{message}</div> : null}
    {open ? <div className={styles.escalationForm}>
      <div className={styles.escalationNotice}><strong>Stop and verify before disposition.</strong><span>Safety takes priority. Confirm the indication, evaluate location and trend, then document the decision.</span></div>
      <div className={styles.formGrid}>
        <label><span>Affected Rack</span><select value={form.rackId} onChange={(e) => update({ rackId: e.target.value })}><option value="">Whole job / no rack</option>{racks.map((rack) => <option key={rack.id} value={rack.id}>Rack {rack.rack_number} / {rack.rack_name || "Unnamed"}</option>)}</select></label>
        <label><span>Joint / Component IDs</span><input value={form.componentIds} onChange={(e) => update({ componentIds: e.target.value })} /></label>
        <label><span>Quantity</span><input type="number" min="1" value={form.quantity} onChange={(e) => update({ quantity: e.target.value })} /></label>
        <label><span>Service Category</span><select value={form.serviceCategory} onChange={(e) => update({ serviceCategory: e.target.value })}><option value="">Select</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>HDLS</option></select></label>
        <label><span>Condition Type</span><select value={form.conditionType} onChange={(e) => update({ conditionType: e.target.value })}><option value="">Select</option><option>General Wall Loss</option><option>Pitting</option><option>Gouge / Cut</option><option>Slip / Tong Damage</option><option>Thread Damage</option><option>Dimensional</option><option>Hardband</option><option>Drift</option><option>Crack</option><option>Other</option></select></label>
        <label><span>Component Location</span><select value={form.componentLocation} onChange={(e) => update({ componentLocation: e.target.value })}><option value="">Select</option><option>Tube Body</option><option>Slip Area</option><option>Upset / Transition</option><option>Tool Joint / Threads</option><option>Seal / Shoulder</option><option>BHA High-Load</option><option>Other</option></select></label>
        <label className={styles.wide}><span>Condition Found</span><textarea value={form.conditionDescription} onChange={(e) => update({ conditionDescription: e.target.value })} /></label>
        <label className={styles.wide}><span>Measurements / Remaining Body Wall</span><textarea value={form.measurements} onChange={(e) => update({ measurements: e.target.value })} /></label>
        <label className={styles.wide}><span>Controlling Criteria</span><input value={form.controllingCriteria} onChange={(e) => update({ controllingCriteria: e.target.value })} placeholder="Customer specification / DS-1 / API section" /></label>
        <label className={styles.checkLabel}><input type="checkbox" checked={form.criticalArea} onChange={(e) => update({ criticalArea: e.target.checked })} /><span>Critical area</span></label>
        <label className={styles.checkLabel}><input type="checkbox" checked={form.repeatedCondition} onChange={(e) => update({ repeatedCondition: e.target.checked })} /><span>Repeated across multiple joints</span></label>
        <label><span>Operational Risk</span><select value={form.operationalRisk} onChange={(e) => update({ operationalRisk: e.target.value })}><option>Low</option><option>Moderate</option><option>High</option></select></label>
        <label><span>Inspector Recommendation</span><select value={form.inspectorRecommendation} onChange={(e) => update({ inspectorRecommendation: e.target.value })}><option>Reject</option><option>Accept with Deviation</option><option>Further Evaluation</option></select></label>
        <label><span>Lead Inspector</span><input value={form.leadInspectorName} onChange={(e) => update({ leadInspectorName: e.target.value })} /></label>
        <label><span>Customer Decision</span><select value={form.customerDecision} onChange={(e) => update({ customerDecision: e.target.value })}><option value="">Pending</option><option>Accept with Deviation</option><option>Reject</option><option>Modify Criteria</option><option>Further Evaluation</option></select></label>
        {form.customerDecision ? <><label><span>Customer Representative</span><input value={form.customerRepName} onChange={(e) => update({ customerRepName: e.target.value })} /></label><label><span>Customer Company</span><input value={form.customerCompany} onChange={(e) => update({ customerCompany: e.target.value })} /></label><label><span>Contact Date</span><input type="date" value={form.customerContactedOn} onChange={(e) => update({ customerContactedOn: e.target.value })} /></label><label><span>Communication Method</span><select value={form.communicationMethod} onChange={(e) => update({ communicationMethod: e.target.value })}><option>Email</option><option>Written Approval</option><option>Other Written Form</option></select></label></> : null}
        {form.customerDecision === "Accept with Deviation" ? <label className={styles.wide}><span>Written Confirmation Attachment</span><select value={form.confirmationDocumentId} onChange={(e) => update({ confirmationDocumentId: e.target.value })}><option value="">Select attached job document</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.document_number || document.document_type || "Document"} / {document.title || document.file_name}</option>)}</select><small>Attach the written approval to the connected job before accepting a deviation.</small></label> : null}
        <label className={styles.wide}><span>Decision Notes</span><textarea value={form.decisionNotes} onChange={(e) => update({ decisionNotes: e.target.value })} /></label>
      </div><button className={styles.primary} type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Record Escalation"}</button>
    </div> : null}
    <div className={styles.escalationList}>{escalations.map((item) => <article key={item.id} data-status={item.status}><div><span>{item.escalation_number}</span><strong>{item.condition_type} / {item.component_location}</strong><small>{item.component_ids} / {item.operational_risk} risk</small></div><div><span>Recommendation</span><strong>{item.inspector_recommendation}</strong><small>{item.customer_decision || "Customer decision pending"}</small></div><b>{item.deviation_id ? "OMS-202 Created" : item.status}</b></article>)}</div>
    {!escalations.length ? <div className={styles.empty}>No borderline conditions recorded for this run.</div> : null}
  </section>;
}
