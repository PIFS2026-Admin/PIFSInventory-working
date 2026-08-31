"use client";

import { useEffect, useState } from "react";
import { goBackOrFallback } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "../drift-verification.module.css";

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

const resultRows = [
  ["end_a_0_result", "31.9%"],
  ["end_a_90_result", "38.2%"],
  ["center_0_result", "44.5%"],
  ["center_90_result", "50.8%"],
  ["end_b_0_result", "57.1%"],
  ["end_b_90_result", "63.4%"],
] as const;

const diameterRows = [
  ["end_a_0_diameter", "31.7%"],
  ["end_a_90_diameter", "38.0%"],
  ["center_0_diameter", "44.3%"],
  ["center_90_diameter", "50.6%"],
  ["end_b_0_diameter", "56.9%"],
  ["end_b_90_diameter", "63.2%"],
] as const;

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
      <div className={styles.sourcePrintSheet}>
        <img className={styles.sourceTemplate} src="/tubing-drift-verification-template.png" alt="Drift Verification Sign Out Sheet" />
        <strong className={styles.sourceValue} style={{ left: "26.5%", top: "16.1%", width: "28%" }}>{display(record.drift_serial_number)}</strong>
        <strong className={styles.sourceValue} style={{ left: "66.5%", top: "16.1%", width: "26%" }}>{display(record.verification_date)}</strong>
        <strong className={styles.sourceValue} style={{ left: "30.5%", top: "19.5%", width: "25%" }}>{display(record.checked_out_by)}</strong>
        <strong className={styles.sourceValue} style={{ left: "17%", top: "22.8%", width: "38%" }}>{display(record.ft_tu_number)}</strong>

        {record.signature_data && <img className={styles.sourceSignature} src={record.signature_data} alt="Verification signature" />}

        {diameterRows.map(([key, top]) => (
          <strong key={key} className={`${styles.sourceValue} ${styles.sourceDiameter}`} style={{ top }}>{display(record[key])}</strong>
        ))}
        {resultRows.map(([key, top]) => (
          <div key={key}>
            {record[key] === "Pass" && <strong className={styles.sourceMark} style={{ left: "79.1%", top }}>X</strong>}
            {record[key] === "Fail" && <strong className={styles.sourceMark} style={{ left: "90.8%", top }}>X</strong>}
          </div>
        ))}

        <strong className={`${styles.sourceValue} ${styles.sourceDiameter}`} style={{ top: "69.5%" }}>{display(record.overall_length)}</strong>
        {record.overall_result === "Pass" && <strong className={styles.sourceMark} style={{ left: "79.4%", top: "69.7%" }}>X</strong>}
        {record.overall_result === "Fail" && <strong className={styles.sourceMark} style={{ left: "91%", top: "69.7%" }}>X</strong>}
        <div className={styles.sourceComments}>{record.comments || ""}</div>
      </div>
    </main>
  );
}
