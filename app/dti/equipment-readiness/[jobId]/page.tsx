"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import DtiProcedureMenu from "../../../components/DtiProcedureMenu";
import { goBackOrFallback } from "../../../../lib/navigation";
import { supabase } from "../../../../lib/supabase";
import styles from "./equipmentReadiness.module.css";

type Job = { id: string; job_number: string; title: string; lifecycle_status: string; customer_name: string | null; rig_name: string | null; scheduled_start: string | null };
type Requirement = { code: string; label: string; reference: string; defaultRequired: boolean };
type Asset = { id: string; equipment_name: string; equipment_number: string; equipment_type: string; department: string; serial_number: string | null; requires_calibration: boolean; current_assignment: string | null };
type Calibration = { id: string; equipment_asset_id: string; calibration_type: string; calibrated_on: string; expires_on: string; result: "Pass" | "Fail"; performed_by_name: string | null; certificate_document_id: string | null; certificate_name: string | null };
type Assignment = { id: string; requirement_code: string; requirement_label: string; equipment_asset_id: string; is_required: boolean; verification_status: "Assigned" | "Verified" | "Out of Service"; notes: string | null; asset: Asset; latest_calibration: Calibration | null; readiness: "Ready" | "Needs Attention" | "Blocked"; readiness_reason: string };
type DocumentOption = { id: string; document_number: string | null; title: string };
type Readiness = { status: "Ready" | "Needs Attention" | "Blocked"; blocked: number; attention: number; missing: string[]; required: string[]; assignments: Assignment[] };
type ApiResponse = { ok?: boolean; job?: Job; requirements?: Requirement[]; assets?: Asset[]; documents?: DocumentOption[]; readiness?: Readiness; error?: string };

const today = () => new Date().toISOString().slice(0, 10);
const nextYear = () => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10); };
const emptyAssignment = { requirementCode: "", assetId: "", verificationStatus: "Assigned", isRequired: true, notes: "" };
const emptyAsset = { equipmentName: "", equipmentNumber: "", equipmentType: "", serialNumber: "", requiresCalibration: true, calibrationFrequencyDays: "365" };
const emptyCalibration = { assetId: "", calibrationType: "Calibration / Verification", calibratedOn: today(), expiresOn: nextYear(), result: "Pass", performedByName: "", certificateDocumentId: "", certificateName: "", notes: "" };

function displayDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(`${value}${value.length === 10 ? "T12:00:00" : ""}`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export default function EquipmentReadinessPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = String(params.jobId ?? "");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [message, setMessage] = useState("Loading equipment readiness...");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [assignment, setAssignment] = useState(emptyAssignment);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [calibration, setCalibration] = useState(emptyCalibration);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);

  const load = useCallback(async () => {
    setMessage("Loading equipment readiness...");
    try {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch(`/api/dti/equipment-readiness?jobId=${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as ApiResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not load equipment readiness.");
      setData(body); setMessage("");
      const firstMissing = body.readiness?.missing?.[0] || body.requirements?.[0]?.code || "";
      setAssignment((current) => ({ ...current, requirementCode: current.requirementCode || firstMissing }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not load equipment readiness."); }
  }, [jobId]);

  useEffect(() => { if (!jobId) return; const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [jobId, load]);

  const assets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.assets ?? []).filter((asset) => !term || [asset.equipment_name, asset.equipment_number, asset.equipment_type, asset.serial_number, asset.department].some((value) => String(value ?? "").toLowerCase().includes(term))).sort((left, right) => Number(right.department === "DTI") - Number(left.department === "DTI") || left.equipment_type.localeCompare(right.equipment_type));
  }, [data?.assets, search]);

  async function send(payload: Record<string, unknown>, success: string) {
    if (saving) return false;
    setSaving(true); setMessage("");
    try {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      if (!token) { window.location.assign("/login"); return false; }
      const request = await fetch("/api/dti/equipment-readiness", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobId, ...payload }) });
      const body = await request.json() as ApiResponse;
      if (!request.ok) throw new Error(body.error || "TITAN could not save this equipment record.");
      setData((current) => ({ ...current, ...body })); setMessage(success); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save this equipment record."); return false; }
    finally { setSaving(false); }
  }

  async function assignEquipment() {
    if (await send({ action: "assign", ...assignment }, "Equipment assignment saved.")) setAssignment({ ...emptyAssignment, requirementCode: data?.readiness?.missing?.[0] || "" });
  }

  async function saveAsset() {
    if (await send({ action: "save-asset", ...assetForm }, "Equipment added to the TITAN master list.")) { setAssetForm(emptyAsset); setShowAssetForm(false); }
  }

  function beginCalibration(assetId: string) {
    setCalibration({ ...emptyCalibration, assetId }); setShowCalibration(true); setMessage("");
  }

  async function saveCalibration() {
    const certificate = (data?.documents ?? []).find((document) => document.id === calibration.certificateDocumentId);
    if (await send({ action: "calibrate", ...calibration, certificateName: certificate ? `${certificate.document_number || "Document"} / ${certificate.title}` : "" }, "Calibration record saved.")) { setCalibration(emptyCalibration); setShowCalibration(false); }
  }

  async function openCertificate(documentId: string) {
    const popup = window.open("about:blank", "_blank");
    try {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      const request = await fetch(`/api/dti/documents?documentId=${encodeURIComponent(documentId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as { url?: string; error?: string };
      if (!request.ok || !body.url) throw new Error(body.error || "TITAN could not open this certificate.");
      if (popup) popup.location.href = body.url; else window.location.assign(body.url);
    } catch (error) { popup?.close(); setMessage(error instanceof Error ? error.message : "TITAN could not open this certificate."); }
  }

  const readiness = data?.readiness;
  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}><div className={styles.title}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI / OMS-103 / OMS-108</span><h1>Equipment Readiness</h1></div></div><div className={styles.headerActions}><button type="button" onClick={() => goBackOrFallback("/dti?view=jobs")}>Back</button>{data?.job ? <><Link href={`/dti/pre-job/${encodeURIComponent(data.job.id)}`}>Pre-Job Checklist</Link><Link href={`/dti/job-execution/${encodeURIComponent(data.job.id)}`}>Job Execution</Link></> : null}<DtiProcedureMenu procedures={[{ documentNumber: "OMS-103", label: "Equipment Setup Guide" }, { documentNumber: "OMS-108", label: "EMI and UT Calibration" }, { documentNumber: "PFIS-IOM-001", label: "Inspection Operations Manual" }]} /><button type="button" onClick={() => void load()}>Refresh</button></div></header>

    {data?.job ? <section className={styles.jobBand}><div><span>{data.job.job_number} / {data.job.lifecycle_status}</span><h2>{data.job.title}</h2><small>{data.job.customer_name || "No customer"} / {data.job.rig_name || "No rig"} / {displayDate(data.job.scheduled_start)}</small></div><b data-status={readiness?.status}>{readiness?.status || "Loading"}</b></section> : null}
    {readiness ? <section className={styles.metrics}><article><span>Required Types</span><strong>{readiness.required.length}</strong></article><article><span>Assigned Assets</span><strong>{readiness.assignments.length}</strong></article><article data-tone="attention"><span>Needs Attention</span><strong>{readiness.attention}</strong></article><article data-tone="blocked"><span>Blocked</span><strong>{readiness.blocked}</strong></article></section> : null}
    {message ? <div className={message.includes("saved") || message.includes("added") ? styles.success : styles.message}>{message}</div> : null}

    {readiness?.missing.length ? <section className={styles.missing}><div><span>Required Equipment Missing</span><strong>Assign at least one verified asset for each requirement.</strong></div><div>{readiness.missing.map((code) => { const requirement = data?.requirements?.find((item) => item.code === code); return <button type="button" key={code} onClick={() => setAssignment((current) => ({ ...current, requirementCode: code }))}>{requirement?.label || code}</button>; })}</div></section> : null}

    {data ? <section className={styles.assignPanel}><div className={styles.panelHead}><div><span>Job Equipment</span><h2>Assign and Verify</h2></div><button type="button" onClick={() => setShowAssetForm((value) => !value)}>{showAssetForm ? "Close Equipment Form" : "Add Equipment"}</button></div>
      {showAssetForm ? <div className={styles.assetForm}><label><span>Equipment Name</span><input value={assetForm.equipmentName} onChange={(event) => setAssetForm({ ...assetForm, equipmentName: event.target.value })} /></label><label><span>Equipment Number</span><input value={assetForm.equipmentNumber} onChange={(event) => setAssetForm({ ...assetForm, equipmentNumber: event.target.value })} /></label><label><span>Equipment Type</span><input value={assetForm.equipmentType} onChange={(event) => setAssetForm({ ...assetForm, equipmentType: event.target.value })} /></label><label><span>Serial Number</span><input value={assetForm.serialNumber} onChange={(event) => setAssetForm({ ...assetForm, serialNumber: event.target.value })} /></label><label className={styles.checkLabel}><input type="checkbox" checked={assetForm.requiresCalibration} onChange={(event) => setAssetForm({ ...assetForm, requiresCalibration: event.target.checked })} /><span>Calibration required</span></label><label><span>Calibration Frequency Days</span><input type="number" min="1" value={assetForm.calibrationFrequencyDays} onChange={(event) => setAssetForm({ ...assetForm, calibrationFrequencyDays: event.target.value })} /></label><button className={styles.primary} type="button" onClick={() => void saveAsset()} disabled={saving}>Save Equipment</button></div> : null}
      <div className={styles.assignmentForm}><label><span>Requirement</span><select value={assignment.requirementCode} onChange={(event) => setAssignment({ ...assignment, requirementCode: event.target.value })}><option value="">Select requirement</option>{data.requirements?.map((item) => <option key={item.code} value={item.code}>{item.label} / {item.reference}</option>)}</select></label><label><span>Find Equipment</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, number, type, serial..." /></label><label className={styles.assetSelect}><span>Equipment Asset</span><select value={assignment.assetId} onChange={(event) => setAssignment({ ...assignment, assetId: event.target.value })}><option value="">Select equipment</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.equipment_number} / {asset.equipment_name} / {asset.equipment_type}{asset.serial_number ? ` / S/N ${asset.serial_number}` : ""}</option>)}</select></label><label><span>Verification</span><select value={assignment.verificationStatus} onChange={(event) => setAssignment({ ...assignment, verificationStatus: event.target.value })}><option>Assigned</option><option>Verified</option><option>Out of Service</option></select></label><label className={styles.notes}><span>Notes</span><input value={assignment.notes} onChange={(event) => setAssignment({ ...assignment, notes: event.target.value })} /></label><label className={styles.checkLabel}><input type="checkbox" checked={assignment.isRequired} onChange={(event) => setAssignment({ ...assignment, isRequired: event.target.checked })} /><span>Required for this job</span></label><button className={styles.primary} type="button" onClick={() => void assignEquipment()} disabled={saving}>Assign Equipment</button></div>
    </section> : null}

    {readiness ? <section className={styles.assignmentList}><div className={styles.panelHead}><div><span>OMS-108 Control</span><h2>Assigned Equipment</h2></div><strong>{readiness.assignments.length} assets</strong></div>{readiness.assignments.map((item) => <article key={item.id} data-status={item.readiness}><div className={styles.assetIdentity}><span>{item.requirement_label}</span><strong>{item.asset.equipment_number} / {item.asset.equipment_name}</strong><small>{item.asset.equipment_type}{item.asset.serial_number ? ` / S/N ${item.asset.serial_number}` : ""}</small></div><div className={styles.calibration}><span>Calibration</span>{item.asset.requires_calibration ? item.latest_calibration ? <><strong>{item.latest_calibration.result} / expires {displayDate(item.latest_calibration.expires_on)}</strong>{item.latest_calibration.certificate_document_id ? <button type="button" onClick={() => void openCertificate(item.latest_calibration!.certificate_document_id!)}>Open Certificate</button> : <small>No certificate linked</small>}</> : <strong>No calibration record</strong> : <strong>Not required</strong>}</div><div className={styles.status}><b>{item.readiness}</b><small>{item.readiness_reason}</small></div><div className={styles.rowActions}><button type="button" onClick={() => beginCalibration(item.asset.id)}>Add Calibration</button><button type="button" onClick={() => setAssignment({ requirementCode: item.requirement_code, assetId: item.asset.id, verificationStatus: item.verification_status, isRequired: item.is_required, notes: item.notes || "" })}>Edit</button><button type="button" onClick={() => void send({ action: "remove-assignment", assignmentId: item.id }, "Equipment assignment removed.")}>Remove</button></div></article>)}{!readiness.assignments.length ? <div className={styles.empty}>No equipment has been assigned to this job.</div> : null}</section> : null}

    {showCalibration ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowCalibration(false); }}><section className={styles.modal} role="dialog" aria-modal="true"><div className={styles.modalHead}><div><span>OMS-108</span><h2>Add Calibration Record</h2></div><button type="button" onClick={() => setShowCalibration(false)} aria-label="Close">X</button></div><div className={styles.calibrationForm}><label><span>Calibration Type</span><input value={calibration.calibrationType} onChange={(event) => setCalibration({ ...calibration, calibrationType: event.target.value })} /></label><label><span>Result</span><select value={calibration.result} onChange={(event) => setCalibration({ ...calibration, result: event.target.value })}><option>Pass</option><option>Fail</option></select></label><label><span>Calibrated On</span><input type="date" value={calibration.calibratedOn} onChange={(event) => setCalibration({ ...calibration, calibratedOn: event.target.value })} /></label><label><span>Expires On</span><input type="date" value={calibration.expiresOn} onChange={(event) => setCalibration({ ...calibration, expiresOn: event.target.value })} /></label><label><span>Performed By</span><input value={calibration.performedByName} onChange={(event) => setCalibration({ ...calibration, performedByName: event.target.value })} /></label><label><span>Certificate Document</span><select value={calibration.certificateDocumentId} onChange={(event) => setCalibration({ ...calibration, certificateDocumentId: event.target.value })}><option value="">No certificate selected</option>{data?.documents?.map((document) => <option key={document.id} value={document.id}>{document.document_number || "Document"} / {document.title}</option>)}</select></label><label className={styles.full}><span>Notes</span><textarea value={calibration.notes} onChange={(event) => setCalibration({ ...calibration, notes: event.target.value })} /></label></div><div className={styles.modalActions}><button type="button" onClick={() => setShowCalibration(false)}>Cancel</button><button className={styles.primary} type="button" onClick={() => void saveCalibration()} disabled={saving}>{saving ? "Saving..." : "Save Calibration"}</button></div></section></div> : null}
  </main>;
}
