"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabase";
import styles from "./jobExecution.module.css";

type Rack = { id: string; rack_number: number; rack_name: string | null };
export type TubularSpec = { id: string; pipe_size: string; weight_ppf: number; grade: string; connection: string };
export type DimensionalReading = { id: string; reading_number: string; joint_id: string; measurement_type: string; component_end: string; reading_a_inches: number; reading_b_inches: number | null; recorded_value_inches: number; minimum_inches: number | null; maximum_inches: number | null; result: string; instrument: string; inspector_name: string };
type Props = { jobId: string; runId: string; racks: Rack[]; specs: TubularSpec[]; readings: DimensionalReading[]; onSaved: () => void };
const blank = { rackId: "", specId: "", jointId: "", measurementType: "Tool Joint OD", componentEnd: "Box", readingA: "", readingB: "", instrument: "Digital Calipers", inspectorName: "", notes: "" };
function limits(item: DimensionalReading) { if (item.minimum_inches !== null && item.maximum_inches !== null) return `${item.minimum_inches} - ${item.maximum_inches}`; if (item.minimum_inches !== null) return `Min ${item.minimum_inches}`; if (item.maximum_inches !== null) return `Max ${item.maximum_inches}`; return "Recorded only"; }

export default function DtiDimensionalPanel({ jobId, runId, racks, specs, readings, onSaved }: Props) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState(blank); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const update = (changes: Partial<typeof blank>) => setForm((current) => ({ ...current, ...changes }));
  async function save() { if (saving) return; setSaving(true); setMessage(""); try { const { data: auth } = await supabase.auth.getSession(); const token = auth.session?.access_token; if (!token) return window.location.assign("/login"); const response = await fetch("/api/dti/job-execution", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-dimensional", jobId, runId, ...form }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "TITAN could not save the dimensional reading."); setForm({ ...blank, specId: form.specId, instrument: form.instrument, inspectorName: form.inspectorName }); setOpen(false); setMessage("Dimensional reading recorded and evaluated."); onSaved(); } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save the dimensional reading."); } finally { setSaving(false); } }
  const needsTwo = ["Tool Joint OD", "Tool Joint ID"].includes(form.measurementType);
  return <section className={styles.dimensions}>
    <div className={styles.panelHead}><div><span>OMS-106</span><h2>Dimensional Readings</h2></div><div className={styles.rowActions}><strong>{readings.length} readings</strong><button className={styles.primary} type="button" onClick={() => setOpen((value) => !value)}>{open ? "Cancel" : "Add Reading"}</button></div></div>
    {message ? <div className={message.includes("recorded") ? styles.onTrack : styles.message}>{message}</div> : null}
    {open ? <div className={styles.dimensionForm}><div className={styles.dimensionRule}>{needsTwo ? "Take two readings 90 degrees apart. Titan records the controlling value." : "Record the measured value against the controlled specification."}</div><div className={styles.formGrid}>
      <label className={styles.wide}><span>Controlled Tubular Specification</span><select value={form.specId} onChange={(e) => update({ specId: e.target.value })}><option value="">Select size / weight / grade / connection</option>{specs.map((spec) => <option key={spec.id} value={spec.id}>{spec.pipe_size} / {spec.weight_ppf} #/ft / {spec.grade} / {spec.connection}</option>)}</select></label>
      <label><span>Rack</span><select value={form.rackId} onChange={(e) => update({ rackId: e.target.value })}><option value="">Whole job / no rack</option>{racks.map((rack) => <option key={rack.id} value={rack.id}>Rack {rack.rack_number} / {rack.rack_name || "Unnamed"}</option>)}</select></label>
      <label><span>Joint / Component ID</span><input value={form.jointId} onChange={(e) => update({ jointId: e.target.value })} /></label>
      <label><span>Measurement</span><select value={form.measurementType} onChange={(e) => update({ measurementType: e.target.value, readingB: "" })}><option>Tool Joint OD</option><option>Tool Joint ID</option><option>Counterbore Diameter</option><option>Counterbore Depth</option><option>Thread Stretch</option><option>Bevel Diameter</option><option>Tong Space</option></select></label>
      <label><span>Component End</span><select value={form.componentEnd} onChange={(e) => update({ componentEnd: e.target.value })}><option>Pin</option><option>Box</option><option>Tube</option><option>N/A</option></select></label>
      <label><span>Reading A (inches)</span><input type="number" min="0" step="0.0001" value={form.readingA} onChange={(e) => update({ readingA: e.target.value })} /></label>
      {needsTwo ? <label><span>Reading B, 90 degrees (inches)</span><input type="number" min="0" step="0.0001" value={form.readingB} onChange={(e) => update({ readingB: e.target.value })} /></label> : null}
      <label><span>Instrument</span><input value={form.instrument} onChange={(e) => update({ instrument: e.target.value })} /></label>
      <label><span>Inspector</span><input value={form.inspectorName} onChange={(e) => update({ inspectorName: e.target.value })} /></label>
      <label className={styles.wide}><span>Notes</span><input value={form.notes} onChange={(e) => update({ notes: e.target.value })} /></label>
    </div><div className={styles.dimensionActions}><span>Borderline and rejected readings require an OMS-105 decision record.</span><button className={styles.primary} type="button" onClick={() => void save()} disabled={saving}>{saving ? "Evaluating..." : "Save & Evaluate"}</button></div></div> : null}
    <div className={styles.dimensionList}>{readings.map((item) => <article key={item.id} data-result={item.result}><div><span>{item.reading_number}</span><strong>{item.joint_id} / {item.component_end}</strong><small>{item.measurement_type}</small></div><div><span>Readings</span><strong>{item.reading_a_inches}{item.reading_b_inches === null ? "" : ` / ${item.reading_b_inches}`}</strong><small>Recorded {item.recorded_value_inches}</small></div><div><span>Limit</span><strong>{limits(item)}</strong><small>{item.instrument}</small></div><b>{item.result}</b></article>)}</div>
    {!readings.length ? <div className={styles.empty}>No dimensional readings recorded for this run.</div> : null}
  </section>;
}
