"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabase";
import type { TubularSpec } from "./DtiDimensionalPanel";
import styles from "./jobExecution.module.css";

type Rack = { id: string; rack_number: number; rack_name: string | null };
type JobDocument = { id: string; display_name: string; document_type: string };
export type ConnectionRefacing = { id: string; record_number: string; joint_ids: string; quantity: number; component_end: string; connection_type: string; condition: string; route: string; method: string; operator_name: string; created_at: string };
type Props = { jobId: string; runId: string; racks: Rack[]; specs: TubularSpec[]; documents: JobDocument[]; records: ConnectionRefacing[]; onSaved: () => void };

const blank = { rackId: "", specId: "", jointIds: "", quantity: "1", componentEnd: "Pin", connectionType: "API", identificationBasis: "Markings and controlled specification", manufacturerDrawingDocumentId: "", condition: "Light Seal / Shoulder Damage", method: "Sandpaper - API", removalInches: "", pinBenchmarkToSealInches: "", boxBenchmarkInches: "", postRefaceBevelInches: "", squarenessVerified: false, copperSulfateVerified: false, samssTrainedOperator: false, operatorName: "", notes: "" };
const shopConditions = ["Over Faced", "Short Box", "Long Pin", "Swelled Box", "Post-Lathe Benchmark Out of Spec", "Severe Seal / Shoulder Damage"];
const rejectConditions = ["Confirmed Crack", "Thread Damage Beyond Field Repair"];
function expectedRoute(condition: string) { return rejectConditions.includes(condition) ? "Reject" : shopConditions.includes(condition) ? "Machine Shop" : "Field Reface"; }

export default function DtiConnectionRefacingPanel({ jobId, runId, racks, specs, documents, records, onSaved }: Props) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState(blank); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const update = (changes: Partial<typeof blank>) => setForm((current) => ({ ...current, ...changes }));
  const route = expectedRoute(form.condition);
  async function save() {
    if (saving) return; setSaving(true); setMessage("");
    try {
      const { data: auth } = await supabase.auth.getSession(); const token = auth.session?.access_token;
      if (!token) return window.location.assign("/login");
      const response = await fetch("/api/dti/job-execution", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-refacing", jobId, runId, ...form }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "TITAN could not save the connection record.");
      setForm({ ...blank, specId: form.specId, operatorName: form.operatorName }); setOpen(false); setMessage("Connection decision recorded."); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save the connection record."); } finally { setSaving(false); }
  }
  return <section className={styles.refacing}>
    <div className={styles.panelHead}><div><span>OMS-107</span><h2>Connection Identification &amp; Refacing</h2></div><div className={styles.rowActions}><strong>{records.length} records</strong><button className={styles.primary} type="button" onClick={() => setOpen((value) => !value)}>{open ? "Cancel" : "Add Connection Record"}</button></div></div>
    {message ? <div className={message.includes("recorded") ? styles.onTrack : styles.message}>{message}</div> : null}
    {open ? <div className={styles.refacingForm}><div className={styles.routeNotice} data-route={route}><span>Expected Route</span><strong>{route}</strong><small>TITAN verifies measurements and makes the final routing decision when saved.</small></div><div className={styles.formGrid}>
      <label className={styles.wide}><span>Controlled Tubular Specification</span><select value={form.specId} onChange={(e) => update({ specId: e.target.value })}><option value="">Select size / weight / grade / connection</option>{specs.map((spec) => <option key={spec.id} value={spec.id}>{spec.pipe_size} / {spec.weight_ppf} #/ft / {spec.grade} / {spec.connection}</option>)}</select></label>
      <label><span>Rack</span><select value={form.rackId} onChange={(e) => update({ rackId: e.target.value })}><option value="">Whole job / no rack</option>{racks.map((rack) => <option key={rack.id} value={rack.id}>Rack {rack.rack_number} / {rack.rack_name || "Unnamed"}</option>)}</select></label>
      <label><span>Joint / Component IDs</span><input value={form.jointIds} onChange={(e) => update({ jointIds: e.target.value })} /></label>
      <label><span>Quantity</span><input type="number" min="1" value={form.quantity} onChange={(e) => update({ quantity: e.target.value })} /></label>
      <label><span>End</span><select value={form.componentEnd} onChange={(e) => update({ componentEnd: e.target.value })}><option>Pin</option><option>Box</option><option>Both</option></select></label>
      <label><span>Connection Type</span><select value={form.connectionType} onChange={(e) => update({ connectionType: e.target.value, method: e.target.value === "API" ? "Sandpaper - API" : "Sandpaper - DS / Proprietary", manufacturerDrawingDocumentId: e.target.value === "API" ? "" : form.manufacturerDrawingDocumentId })}><option>API</option><option>Double-Shoulder</option><option>Proprietary</option></select></label>
      <label className={styles.wide}><span>Identification Basis</span><input value={form.identificationBasis} onChange={(e) => update({ identificationBasis: e.target.value })} /></label>
      {form.connectionType !== "API" ? <label className={styles.wide}><span>Manufacturer Field Dimension Drawing</span><select value={form.manufacturerDrawingDocumentId} onChange={(e) => update({ manufacturerDrawingDocumentId: e.target.value })}><option value="">Select attached drawing</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.display_name} / {document.document_type}</option>)}</select></label> : null}
      <label className={styles.wide}><span>Observed Condition</span><select value={form.condition} onChange={(e) => update({ condition: e.target.value })}><option>Light Seal / Shoulder Damage</option>{shopConditions.map((item) => <option key={item}>{item}</option>)}{rejectConditions.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Method</span><select value={form.method} onChange={(e) => update({ method: e.target.value })}><option>Sandpaper - API</option><option>Sandpaper - DS / Proprietary</option><option>Samss Lathe</option><option>No Field Reface</option></select></label>
      <label><span>Material Removed (in)</span><input type="number" min="0" step="0.0001" value={form.removalInches} onChange={(e) => update({ removalInches: e.target.value })} /></label>
      <label><span>Pin Benchmark to Seal (in)</span><input type="number" min="0" step="0.0001" value={form.pinBenchmarkToSealInches} onChange={(e) => update({ pinBenchmarkToSealInches: e.target.value })} /></label>
      <label><span>Box Benchmark (in)</span><input type="number" min="0" step="0.0001" value={form.boxBenchmarkInches} onChange={(e) => update({ boxBenchmarkInches: e.target.value })} /></label>
      <label><span>Post-Refacing Bevel (in)</span><input type="number" min="0" step="0.0001" value={form.postRefaceBevelInches} onChange={(e) => update({ postRefaceBevelInches: e.target.value })} /></label>
      <label className={styles.checkLabel}><input type="checkbox" checked={form.squarenessVerified} onChange={(e) => update({ squarenessVerified: e.target.checked })} /><span>Squareness Verified</span></label>
      <label className={styles.checkLabel}><input type="checkbox" checked={form.copperSulfateVerified} onChange={(e) => update({ copperSulfateVerified: e.target.checked })} /><span>Copper Sulfate Passed</span></label>
      {form.method === "Samss Lathe" ? <label className={styles.checkLabel}><input type="checkbox" checked={form.samssTrainedOperator} onChange={(e) => update({ samssTrainedOperator: e.target.checked })} /><span>Trained Samss Operator</span></label> : null}
      <label><span>Operator</span><input value={form.operatorName} onChange={(e) => update({ operatorName: e.target.value })} /></label>
      <label className={styles.wide}><span>Notes</span><input value={form.notes} onChange={(e) => update({ notes: e.target.value })} /></label>
    </div><div className={styles.dimensionActions}><span>DS and proprietary connections require the manufacturer drawing before work.</span><button className={styles.primary} type="button" onClick={() => void save()} disabled={saving}>{saving ? "Checking..." : "Save & Route"}</button></div></div> : null}
    <div className={styles.refacingList}>{records.map((item) => <article key={item.id} data-route={item.route}><div><span>{item.record_number}</span><strong>{item.joint_ids} / {item.component_end}</strong><small>{item.quantity} joint{item.quantity === 1 ? "" : "s"}</small></div><div><span>Connection</span><strong>{item.connection_type}</strong><small>{item.condition}</small></div><div><span>Method</span><strong>{item.method}</strong><small>{item.operator_name}</small></div><b>{item.route}</b></article>)}</div>
    {!records.length ? <div className={styles.empty}>No OMS-107 connection or refacing records for this run.</div> : null}
  </section>;
}
