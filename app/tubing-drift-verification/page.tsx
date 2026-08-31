"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";
import { goBackOrFallback } from "../../lib/navigation";
import { shouldShowPageMessage } from "../../lib/pageMessages";
import { supabase } from "../../lib/supabase";
import styles from "./drift-verification.module.css";

type Result = "" | "Pass" | "Fail";

type Verification = {
  id: string;
  verificationNumber: string;
  verificationDate: string;
  driftSerialNumber: string;
  checkedOutBy: string;
  signatureData: string;
  ftTuNumber: string;
  endA0Diameter: string;
  endA0Result: Result;
  endA90Diameter: string;
  endA90Result: Result;
  center0Diameter: string;
  center0Result: Result;
  center90Diameter: string;
  center90Result: Result;
  endB0Diameter: string;
  endB0Result: Result;
  endB90Diameter: string;
  endB90Result: Result;
  overallLength: string;
  overallResult: Result;
  comments: string;
  status: "Draft" | "Completed";
};

type MeasurementDefinition = {
  label: string;
  diameterKey: keyof Pick<Verification, "endA0Diameter" | "endA90Diameter" | "center0Diameter" | "center90Diameter" | "endB0Diameter" | "endB90Diameter">;
  resultKey: keyof Pick<Verification, "endA0Result" | "endA90Result" | "center0Result" | "center90Result" | "endB0Result" | "endB90Result">;
};

const measurements: MeasurementDefinition[] = [
  { label: "1. End A - 0 degrees", diameterKey: "endA0Diameter", resultKey: "endA0Result" },
  { label: "2. End A - 90 degrees", diameterKey: "endA90Diameter", resultKey: "endA90Result" },
  { label: "3. Center - 0 degrees", diameterKey: "center0Diameter", resultKey: "center0Result" },
  { label: "4. Center - 90 degrees", diameterKey: "center90Diameter", resultKey: "center90Result" },
  { label: "5. End B - 0 degrees", diameterKey: "endB0Diameter", resultKey: "endB0Result" },
  { label: "6. End B - 90 degrees", diameterKey: "endB90Diameter", resultKey: "endB90Result" },
];

const legend = [
  ["2 7/8 OD, 7.9 lb", "2.229 to 2.234"],
  ["2 3/8 OD, 5.95 lb", "1.773 to 1.778"],
  ["2 7/8 OD, 6.5 lb", "2.347 to 2.352"],
  ["2 3/8 OD, 4.7 lb", "1.901 to 1.906"],
  ["2 7/8 OD, FSS265 connection", "1.938 to 1.943"],
];

const allowedRoles = new Set(["admin", "employee", "service_line_manager", "tubing_lead", "tubing_hand"]);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function blankVerification(name = ""): Verification {
  return {
    id: "",
    verificationNumber: "",
    verificationDate: today(),
    driftSerialNumber: "",
    checkedOutBy: name,
    signatureData: "",
    ftTuNumber: "",
    endA0Diameter: "",
    endA0Result: "",
    endA90Diameter: "",
    endA90Result: "",
    center0Diameter: "",
    center0Result: "",
    center90Diameter: "",
    center90Result: "",
    endB0Diameter: "",
    endB0Result: "",
    endB90Diameter: "",
    endB90Result: "",
    overallLength: "",
    overallResult: "",
    comments: "",
    status: "Draft",
  };
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function result(value: unknown): Result {
  return value === "Pass" || value === "Fail" ? value : "";
}

function mapRow(row: Record<string, unknown>): Verification {
  return {
    id: text(row.id),
    verificationNumber: text(row.verification_number),
    verificationDate: text(row.verification_date) || today(),
    driftSerialNumber: text(row.drift_serial_number),
    checkedOutBy: text(row.checked_out_by),
    signatureData: text(row.signature_data),
    ftTuNumber: text(row.ft_tu_number),
    endA0Diameter: text(row.end_a_0_diameter),
    endA0Result: result(row.end_a_0_result),
    endA90Diameter: text(row.end_a_90_diameter),
    endA90Result: result(row.end_a_90_result),
    center0Diameter: text(row.center_0_diameter),
    center0Result: result(row.center_0_result),
    center90Diameter: text(row.center_90_diameter),
    center90Result: result(row.center_90_result),
    endB0Diameter: text(row.end_b_0_diameter),
    endB0Result: result(row.end_b_0_result),
    endB90Diameter: text(row.end_b_90_diameter),
    endB90Result: result(row.end_b_90_result),
    overallLength: text(row.overall_length),
    overallResult: result(row.overall_result),
    comments: text(row.comments),
    status: row.status === "Completed" ? "Completed" : "Draft",
  };
}

function numericOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPayload(form: Verification, userId: string, verificationNumber: string) {
  return {
    verification_number: verificationNumber,
    verification_date: form.verificationDate,
    drift_serial_number: form.driftSerialNumber.trim() || null,
    checked_out_by: form.checkedOutBy.trim() || null,
    signature_data: form.signatureData || null,
    ft_tu_number: form.ftTuNumber.trim() || null,
    end_a_0_diameter: numericOrNull(form.endA0Diameter),
    end_a_0_result: form.endA0Result || null,
    end_a_90_diameter: numericOrNull(form.endA90Diameter),
    end_a_90_result: form.endA90Result || null,
    center_0_diameter: numericOrNull(form.center0Diameter),
    center_0_result: form.center0Result || null,
    center_90_diameter: numericOrNull(form.center90Diameter),
    center_90_result: form.center90Result || null,
    end_b_0_diameter: numericOrNull(form.endB0Diameter),
    end_b_0_result: form.endB0Result || null,
    end_b_90_diameter: numericOrNull(form.endB90Diameter),
    end_b_90_result: form.endB90Result || null,
    overall_length: numericOrNull(form.overallLength),
    overall_result: form.overallResult || null,
    comments: form.comments.trim() || null,
    status: form.status,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const next = point(event);
    context.strokeStyle = "#111111";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(next.x, next.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !drawing.current) return;
    drawing.current = false;
    canvas.releasePointerCapture(event.pointerId);
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  return (
    <div className={styles.signature}>
      <div className={styles.signatureHeader}>
        <span>Signature</span>
        <button className="button" type="button" onClick={clear}>Clear</button>
      </div>
      <canvas ref={canvasRef} width={760} height={110} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    </div>
  );
}

function ResultControl({ value, onChange }: { value: Result; onChange: (value: Result) => void }) {
  return (
    <div className={styles.result}>
      <button className={value === "Pass" ? styles.passActive : ""} type="button" onClick={() => onChange(value === "Pass" ? "" : "Pass")}>Pass</button>
      <button className={value === "Fail" ? styles.failActive : ""} type="button" onClick={() => onChange(value === "Fail" ? "" : "Fail")}>Fail</button>
    </div>
  );
}

export default function TubingDriftVerificationPage() {
  const [userId, setUserId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [records, setRecords] = useState<Verification[]>([]);
  const [form, setForm] = useState<Verification>(blankVerification());
  const [message, setMessage] = useState("Loading drift verifications...");
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    void loadPage();
  }, []);

  async function loadPage() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profile, error } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();
    const role = text(profile?.role).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (error || !allowedRoles.has(role)) {
      window.location.href = "/service-lines/tubing";
      return;
    }

    const name = text(profile?.full_name) || user.email || "Tubing User";
    setUserId(user.id);
    setProfileName(name);
    setForm(blankVerification(name));
    await loadRecords();
  }

  async function loadRecords() {
    const { data, error } = await supabase.from("tubing_drift_verifications").select("*").order("verification_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
    if (error) {
      setMessage(`Drift verifications failed: ${error.message}`);
      return;
    }
    setRecords((data ?? []).map((row) => mapRow(row)));
    setMessage("");
  }

  function update(changes: Partial<Verification>) {
    setForm((current) => ({ ...current, ...changes }));
  }

  async function makeVerificationNumber(dateText: string) {
    const stamp = dateText.replace(/-/g, "").slice(2);
    const base = `TU-DV-${stamp}`;
    const { data } = await supabase.from("tubing_drift_verifications").select("verification_number").ilike("verification_number", `${base}%`);
    const used = new Set((data ?? []).map((row) => text(row.verification_number)));
    for (let index = 0; index < 702; index += 1) {
      let number = index;
      let suffix = "";
      do {
        suffix = String.fromCharCode(65 + (number % 26)) + suffix;
        number = Math.floor(number / 26) - 1;
      } while (number >= 0);
      if (!used.has(`${base}${suffix}`)) return `${base}${suffix}`;
    }
    return `${base}-${Date.now()}`;
  }

  function startNew() {
    setForm(blankVerification(profileName));
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(status: "Draft" | "Completed" = form.status) {
    if (!userId || saving) return;
    if (!form.verificationDate || !form.driftSerialNumber.trim() || !form.checkedOutBy.trim()) {
      setMessage("Date, drift serial number, and checked-out name are required.");
      return;
    }
    if (status === "Completed" && !form.signatureData) {
      setMessage("A signature is required to complete the verification.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const verificationNumber = form.verificationNumber || await makeVerificationNumber(form.verificationDate);
      const nextForm = { ...form, verificationNumber, status };
      const payload = buildPayload(nextForm, userId, verificationNumber);
      const query = form.id
        ? supabase.from("tubing_drift_verifications").update(payload).eq("id", form.id)
        : supabase.from("tubing_drift_verifications").insert(payload);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      const saved = mapRow(data);
      setForm(saved);
      await loadRecords();
      setMessage(`${saved.verificationNumber} ${status === "Completed" ? "completed" : "saved"}.`);
    } catch (error: any) {
      setMessage(`Save failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function printForm() {
    if (!form.id) {
      setMessage("Save the drift verification before printing.");
      return;
    }
    window.open(`/tubing-drift-verification/print?id=${form.id}`, "_blank");
  }

  async function emailForm() {
    if (!form.id || emailing) {
      setMessage("Save the drift verification before emailing.");
      return;
    }
    const recipientEmail = window.prompt("Email drift verification to:");
    if (!recipientEmail?.trim()) return;
    const note = window.prompt("Optional message for the email:") ?? "";
    setEmailing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your login session expired.");
      const response = await fetch("/api/tubing-drift-verification-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: form.id, recipientEmail: recipientEmail.trim(), note }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Email failed.");
      setMessage(`Drift verification emailed to ${recipientEmail.trim()}.`);
    } catch (error: any) {
      setMessage(`Email failed: ${error.message}`);
    } finally {
      setEmailing(false);
    }
  }

  return (
    <main className={`dashboard-shell ${styles.page}`}>
      <header className="dashboard-header titan-page-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
          <div><div className="brand-title">Tubing Drift Verification</div></div>
        </button>
        <div className="dashboard-actions">
          <button className="button" onClick={() => goBackOrFallback("/service-lines/tubing")}>Back</button>
          <button className="button" onClick={printForm}>Print / PDF</button>
          <button className="button" onClick={emailForm} disabled={emailing}>{emailing ? "Emailing..." : "Email"}</button>
          <button className="button primary" onClick={() => save()} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button className="button" onClick={() => save("Completed")} disabled={saving}>Complete</button>
        </div>
      </header>

      {shouldShowPageMessage(message) && <div className="modal-message">{message}</div>}

      <div className={styles.workspace}>
        <aside className={styles.listPanel}>
          <div className={styles.listHeader}>
            <div><h2>Saved Forms</h2><p>{records.length} records</p></div>
            <button className="button primary" type="button" onClick={startNew}>New</button>
          </div>
          <div className={styles.list}>
            {records.map((record) => (
              <button key={record.id} className={`${styles.record} ${record.id === form.id ? styles.recordActive : ""}`} type="button" onClick={() => setForm(record)}>
                <strong>{record.verificationNumber}</strong>
                <span>Drift: {record.driftSerialNumber || "-"}</span>
                <small>{record.verificationDate} / {record.status}</small>
                <small>FT/TU: {record.ftTuNumber || "-"}</small>
              </button>
            ))}
            {!records.length && <p className="muted-text">No drift verifications yet.</p>}
          </div>
        </aside>

        <section className={styles.formShell}>
          <div className={`${styles.formActions} no-print`}>
            <strong>{form.verificationNumber || "New Drift Verification"}</strong>
            <div>
              <button className="button primary" type="button" onClick={() => save()} disabled={saving}>Save</button>{" "}
              <button className="button" type="button" onClick={printForm}>Print</button>{" "}
              <button className="button" type="button" onClick={emailForm} disabled={emailing}>Email</button>
            </div>
          </div>

          <div className={styles.sheet}>
            <header className={styles.sheetHeader}>
              <img src="/titan_logo.jpg" alt="TITAN" />
              <div><h1>Drift Verification <span>Sign Out Sheet</span></h1><p>For traceability and accuracy</p></div>
            </header>

            <section className={styles.metaGrid}>
              <div className={styles.field}><label>Drift Serial Number</label><input value={form.driftSerialNumber} onChange={(event) => update({ driftSerialNumber: event.target.value })} /></div>
              <div className={styles.field}><label>Date</label><input type="date" value={form.verificationDate} onChange={(event) => update({ verificationDate: event.target.value })} /></div>
              <div className={styles.field}><label>Checked Out By</label><input value={form.checkedOutBy} onChange={(event) => update({ checkedOutBy: event.target.value })} /></div>
              <div className={styles.field}><label>Verification No.</label><input value={form.verificationNumber || "Assigned when saved"} disabled /></div>
              <div className={styles.field}><label>FT# or TU#</label><input value={form.ftTuNumber} onChange={(event) => update({ ftTuNumber: event.target.value })} /></div>
              <div className={styles.field}><label>Status</label><input value={form.status} disabled /></div>
            </section>

            <div className={styles.sectionTitle}>Drift Dimensional Verification</div>
            <div className={styles.measurementHeader}><span>Measurement Location</span><span>Diameter (inches)</span><span>Pass / Fail</span></div>
            {measurements.map((measurement) => (
              <div className={styles.measurement} key={measurement.label}>
                <div className={styles.location}>{measurement.label}</div>
                <div className={styles.diameter}><input type="number" inputMode="decimal" step="0.0001" value={form[measurement.diameterKey]} onChange={(event) => update({ [measurement.diameterKey]: event.target.value })} /><span>inches</span></div>
                <ResultControl value={form[measurement.resultKey]} onChange={(value) => update({ [measurement.resultKey]: value })} />
              </div>
            ))}
            <div className={styles.measurement}>
              <div className={styles.location}>Overall Length (minimum 42.0 in)</div>
              <div className={styles.diameter}><input type="number" inputMode="decimal" step="0.001" value={form.overallLength} onChange={(event) => update({ overallLength: event.target.value })} /><span>inches</span></div>
              <ResultControl value={form.overallResult} onChange={(value) => update({ overallResult: value })} />
            </div>

            <div className={styles.comments}><label>Comments / Notes</label><textarea value={form.comments} onChange={(event) => update({ comments: event.target.value })} /></div>
            <SignaturePad value={form.signatureData} onChange={(signatureData) => update({ signatureData })} />

            <div className={styles.sectionTitle}>Drift Diameter Reference Legend (API 5CT)</div>
            <table className={styles.legend}><thead><tr><th>Description</th><th>Drift Diameter Range (inches)</th></tr></thead><tbody>{legend.map(([description, range]) => <tr key={description}><td>{description}</td><td>{range}</td></tr>)}</tbody></table>
            <p className={styles.footnote}>* If pipe ID is coated, a poly drift must be used after manufacturer specifications have been acquired.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
