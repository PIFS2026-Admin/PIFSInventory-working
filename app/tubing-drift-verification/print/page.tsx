"use client";

import { useEffect, useState } from "react";
import { goBackOrFallback } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "../drift-verification.module.css";

const measurements = [
  ["1. End A - 0 degrees", "end_a_0_diameter", "end_a_0_result"],
  ["2. End A - 90 degrees", "end_a_90_diameter", "end_a_90_result"],
  ["3. Center - 0 degrees", "center_0_diameter", "center_0_result"],
  ["4. Center - 90 degrees", "center_90_diameter", "center_90_result"],
  ["5. End B - 0 degrees", "end_b_0_diameter", "end_b_0_result"],
  ["6. End B - 90 degrees", "end_b_90_diameter", "end_b_90_result"],
] as const;

const legend = [
  ["2 7/8 OD, 7.9 lb", "2.229 to 2.234"],
  ["2 3/8 OD, 5.95 lb", "1.773 to 1.778"],
  ["2 7/8 OD, 6.5 lb", "2.347 to 2.352"],
  ["2 3/8 OD, 4.7 lb", "1.901 to 1.906"],
  ["2 7/8 OD, FSS265 connection", "1.938 to 1.943"],
];

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function ResultDisplay({ value }: { value: unknown }) {
  return (
    <div className={styles.result}>
      <span>{value === "Pass" ? "[X]" : "[ ]"} Pass</span>
      <span>{value === "Fail" ? "[X]" : "[ ]"} Fail</span>
    </div>
  );
}

export default function TubingDriftVerificationPrintPage() {
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [message, setMessage] = useState("Loading drift verification...");

  useEffect(() => {
    void loadRecord();
  }, []);

  async function loadRecord() {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setMessage("Missing drift verification id.");
      return;
    }
    const { data, error } = await supabase.from("tubing_drift_verifications").select("*").eq("id", id).single();
    if (error || !data) {
      setMessage(error?.message ?? "Drift verification not found.");
      return;
    }
    setRecord(data);
    setMessage("");
  }

  if (!record) return <main className="print-page"><section className={styles.sheet}>{message}</section></main>;

  return (
    <main className={`print-page ${styles.page}`}>
      <div className="print-actions no-print">
        <button className="button" onClick={() => goBackOrFallback("/tubing-drift-verification")}>Back</button>
        <button className="button primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <div className={styles.sheet}>
        <header className={styles.sheetHeader}>
          <img src="/titan_logo.jpg" alt="TITAN" />
          <div><h1>Drift Verification <span>Sign Out Sheet</span></h1><p>For traceability and accuracy</p></div>
        </header>
        <section className={styles.metaGrid}>
          <div className={styles.field}><span>Drift Serial Number</span><strong>{display(record.drift_serial_number)}</strong></div>
          <div className={styles.field}><span>Date</span><strong>{display(record.verification_date)}</strong></div>
          <div className={styles.field}><span>Checked Out By</span><strong>{display(record.checked_out_by)}</strong></div>
          <div className={styles.field}><span>Verification No.</span><strong>{display(record.verification_number)}</strong></div>
          <div className={styles.field}><span>FT# or TU#</span><strong>{display(record.ft_tu_number)}</strong></div>
          <div className={styles.field}><span>Status</span><strong>{display(record.status)}</strong></div>
        </section>
        <div className={styles.sectionTitle}>Drift Dimensional Verification</div>
        <div className={styles.measurementHeader}><span>Measurement Location</span><span>Diameter (inches)</span><span>Pass / Fail</span></div>
        {measurements.map(([label, diameterKey, resultKey]) => (
          <div className={styles.measurement} key={label}>
            <div className={styles.location}>{label}</div>
            <div className={styles.diameter}><strong>{display(record[diameterKey])}</strong><span>inches</span></div>
            <ResultDisplay value={record[resultKey]} />
          </div>
        ))}
        <div className={styles.measurement}>
          <div className={styles.location}>Overall Length (minimum 42.0 in)</div>
          <div className={styles.diameter}><strong>{display(record.overall_length)}</strong><span>inches</span></div>
          <ResultDisplay value={record.overall_result} />
        </div>
        <div className={styles.comments}><label>Comments / Notes</label><p>{record.comments || ""}</p></div>
        <div className={styles.signature}>
          <div className={styles.signatureHeader}><span>Signature</span><strong>{display(record.checked_out_by)}</strong></div>
          {record.signature_data ? <img src={record.signature_data} alt="Verification signature" style={{ width: "100%", height: 76, objectFit: "contain", objectPosition: "left center" }} /> : <div style={{ height: 76 }} />}
        </div>
        <div className={styles.sectionTitle}>Drift Diameter Reference Legend (API 5CT)</div>
        <table className={styles.legend}><thead><tr><th>Description</th><th>Drift Diameter Range (inches)</th></tr></thead><tbody>{legend.map(([description, range]) => <tr key={description}><td>{description}</td><td>{range}</td></tr>)}</tbody></table>
        <p className={styles.footnote}>* If pipe ID is coated, a poly drift must be used after manufacturer specifications have been acquired.</p>
      </div>
    </main>
  );
}
