"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Summary = {
  id: string;
  summaryNumber: string;
  operator: string;
  contractor: string;
  location: string;
  summaryDate: string;
  fieldInvoice: string;
  pageNumber: string;
  pageTotal: string;
  inspectionType: string;
  connectionSizeType: string;
  totalJointsInspected: number;
  totalDamages: number;
  damageSeatBox: number;
  damageSeatPin: number;
  damageThreadsBox: number;
  damageThreadsPin: number;
  shortBox: number;
  bentTube: number;
  damageOther: string;
  damageNotes: string;
  totalDbr: number;
  minTongBox: number;
  minTongPin: number;
  tstrBox: number;
  tstrPin: number;
  emi: number;
  damagedTube: number;
  minWall: number;
  dbrOther: string;
  dbrNotes: string;
  totalRefaces: number;
  refacePin: number;
  refaceBox: number;
  totalHardbands: number;
  hardbandPin: number;
  hardbandBox: number;
  repairJoints: number;
  dbrJoints: number;
  hbJoints: number;
  repairHbJoints: number;
  remarks: string;
  inspectedBy: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function count(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric !== 0 ? numeric : 0;
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function mapRow(row: any): Summary {
  return {
    id: text(row.id),
    summaryNumber: text(row.summary_number),
    operator: text(row.operator),
    contractor: text(row.contractor),
    location: text(row.location),
    summaryDate: text(row.summary_date),
    fieldInvoice: text(row.field_invoice),
    pageNumber: text(row.page_number),
    pageTotal: text(row.page_total),
    inspectionType: text(row.inspection_type),
    connectionSizeType: text(row.connection_size_type),
    totalJointsInspected: count(row.total_joints_inspected),
    totalDamages: count(row.total_damages),
    damageSeatBox: count(row.damage_seat_box),
    damageSeatPin: count(row.damage_seat_pin),
    damageThreadsBox: count(row.damage_threads_box),
    damageThreadsPin: count(row.damage_threads_pin),
    shortBox: count(row.short_box),
    bentTube: count(row.bent_tube),
    damageOther: text(row.damage_other),
    damageNotes: text(row.damage_notes),
    totalDbr: count(row.total_dbr),
    minTongBox: count(row.min_tong_box),
    minTongPin: count(row.min_tong_pin),
    tstrBox: count(row.tstr_box),
    tstrPin: count(row.tstr_pin),
    emi: count(row.emi),
    damagedTube: count(row.damaged_tube),
    minWall: count(row.min_wall),
    dbrOther: text(row.dbr_other),
    dbrNotes: text(row.dbr_notes),
    totalRefaces: count(row.total_refaces),
    refacePin: count(row.reface_pin),
    refaceBox: count(row.reface_box),
    totalHardbands: count(row.total_hardbands),
    hardbandPin: count(row.hardband_pin),
    hardbandBox: count(row.hardband_box),
    repairJoints: count(row.repair_joints),
    dbrJoints: count(row.dbr_joints),
    hbJoints: count(row.hb_joints),
    repairHbJoints: count(row.repair_hb_joints),
    remarks: text(row.remarks),
    inspectedBy: text(row.inspected_by),
  };
}

function Line({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="summary-print-line">
      <span>{label}</span>
      <strong>{display(value)}</strong>
    </div>
  );
}

function CountLine({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="summary-print-count">
      <span>{label}</span>
      <strong>{display(value) || "-"}</strong>
    </div>
  );
}

export default function DtiDailySummaryPrintPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState("Loading daily summary...");

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadSummary() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
      setMessage("Missing daily summary id.");
      return;
    }

    const { data, error } = await supabase
      .from("dti_daily_summaries")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      setMessage(error?.message ?? "Daily summary not found.");
      return;
    }

    setSummary(mapRow(data));
    setMessage("");
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "/dti-summary";
  }

  if (!summary) {
    return (
      <main className="print-page summary-print-shell">
        <section className="inspection-summary-sheet">{message}</section>
      </main>
    );
  }

  return (
    <main className="print-page summary-print-shell">
      <div className="print-actions no-print">
        <button className="button" onClick={goBack}>Back</button>
        <button className="button primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <section className="inspection-summary-sheet print-version">
        <header className="summary-letterhead">
          <img src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" />
          <div className="summary-title-block">
            <h1>Inspection Summary</h1>
            <Line label="Date" value={summary.summaryDate} />
            <Line label="Field Invoice" value={summary.fieldInvoice} />
            <div className="summary-print-page-count">
              <Line label="Page" value={summary.pageNumber} />
              <Line label="of" value={summary.pageTotal} />
            </div>
          </div>
        </header>

        <section className="summary-top-fields print">
          <Line label="Operator" value={summary.operator} />
          <Line label="Contractor" value={summary.contractor} />
          <Line label="Location" value={summary.location} />
        </section>

        <section className="summary-long-lines print">
          <Line label="Type of Inspection" value={summary.inspectionType} />
          <Line label="Connection Size and Type" value={summary.connectionSizeType} />
          <Line label="Total # of Joints Inspected" value={summary.totalJointsInspected} />
        </section>

        <section className="summary-box-grid">
          <div className="summary-count-box">
            <CountLine label="Total Damages" value={summary.totalDamages} />
            <div className="summary-split-row print"><span>Damage Seal</span><CountLine label="Box" value={summary.damageSeatBox} /><CountLine label="Pin" value={summary.damageSeatPin} /></div>
            <div className="summary-split-row print"><span>Damage Threads</span><CountLine label="Box" value={summary.damageThreadsBox} /><CountLine label="Pin" value={summary.damageThreadsPin} /></div>
            <CountLine label="Short Box" value={summary.shortBox} />
            <CountLine label="Bent Tube" value={summary.bentTube} />
            <Line label="Other" value={summary.damageOther} />
            <div className="summary-print-notes">{summary.damageNotes}</div>
          </div>

          <div className="summary-count-box">
            <CountLine label="Total DBR" value={summary.totalDbr || summary.minTongBox + summary.minTongPin + summary.tstrBox + summary.tstrPin + summary.emi + summary.damagedTube + summary.minWall} />
            <div className="summary-split-row print"><span>Min Tong</span><CountLine label="Box" value={summary.minTongBox} /><CountLine label="Pin" value={summary.minTongPin} /></div>
            <div className="summary-split-row print"><span>TSTR</span><CountLine label="Box" value={summary.tstrBox} /><CountLine label="Pin" value={summary.tstrPin} /></div>
            <CountLine label="EMI" value={summary.emi} />
            <CountLine label="Damaged Tube" value={summary.damagedTube} />
            <CountLine label="MIN Wall" value={summary.minWall} />
            <Line label="Other" value={summary.dbrOther} />
            <div className="summary-print-notes">{summary.dbrNotes}</div>
          </div>

          <div className="summary-count-box compact">
            <CountLine label="Total Refaces" value={summary.totalRefaces} />
            <CountLine label="Pin" value={summary.refacePin} />
            <CountLine label="Box" value={summary.refaceBox} />
          </div>

          <div className="summary-count-box compact">
            <CountLine label="Total Hardbands" value={summary.totalHardbands} />
            <CountLine label="Pin" value={summary.hardbandPin} />
            <CountLine label="Box" value={summary.hardbandBox} />
          </div>
        </section>

        <section className="summary-bottom-counts print">
          <CountLine label="Repair Joints" value={summary.repairJoints} />
          <CountLine label="DBR Joints" value={summary.dbrJoints} />
          <CountLine label="HB Joints" value={summary.hbJoints} />
          <CountLine label="Repair / HB Joints" value={summary.repairHbJoints} />
        </section>

        <section className="summary-remarks print">
          <span>Remarks</span>
          <p>{summary.remarks || ""}</p>
        </section>

        <footer className="summary-footer print">
          <p>Inspections done per TH-Hill DS-1 5th Edition</p>
          <Line label="Inspected by" value={summary.inspectedBy} />
          <strong>* All damages marked in yellow with stencil or damaged at upset.</strong>
        </footer>
      </section>
    </main>
  );
}
