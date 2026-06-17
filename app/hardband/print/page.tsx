"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Job = {
  id: string;
  jobNumber: string;
  jobSource: string;
  company: string;
  machineShopWorkOrder: string;
  fieldTicketNumber: string;
  rigNumber: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: string;
  condition: string;
  totalJoints: number;
  totalFootage: number;
  wireType: string;
  operatorName: string;
  operatorSignature: string;
  status: string;
  notes: string;
  createdAt: string;
  closedAt: string;
};

type Line = {
  id: string;
  lineNumber: number;
  serialNumber: string;
  flushGrindBox: boolean;
  flushGrindPin: boolean;
  grindOutBox: boolean;
  grindOutPin: boolean;
  hardbandBox: boolean;
  hardbandPin: boolean;
  wireType: string;
  operatorName: string;
  notes: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function yes(value: boolean) {
  return value ? "Yes" : "-";
}

export default function HardbandPrintPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState("Loading Hardband report...");

  const totals = useMemo(() => {
    return {
      serials: lines.length,
      flushBox: lines.filter((line) => line.flushGrindBox).length,
      flushPin: lines.filter((line) => line.flushGrindPin).length,
      grindBox: lines.filter((line) => line.grindOutBox).length,
      grindPin: lines.filter((line) => line.grindOutPin).length,
      hardbandBox: lines.filter((line) => line.hardbandBox).length,
      hardbandPin: lines.filter((line) => line.hardbandPin).length,
    };
  }, [lines]);

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
      setMessage("Missing Hardband job id.");
      return;
    }

    const { data: jobData, error: jobError } = await supabase
      .from("hardband_jobs")
      .select(`
        id,
        job_number,
        job_source,
        machine_shop_work_order,
        field_ticket_number,
        rig_number,
        afe,
        part_number,
        size,
        grade,
        connection,
        pipe_range,
        condition,
        total_joints,
        total_footage,
        wire_type,
        operator_name,
        operator_signature,
        status,
        notes,
        created_at,
        closed_at,
        companies(name)
      `)
      .eq("id", id)
      .single();

    if (jobError || !jobData) {
      setMessage(jobError?.message ?? "Hardband job not found.");
      return;
    }

    const { data: lineData, error: lineError } = await supabase
      .from("hardband_job_line_items")
      .select(`
        id,
        line_number,
        serial_number,
        flush_grind_box,
        flush_grind_pin,
        grind_out_box,
        grind_out_pin,
        hardband_box,
        hardband_pin,
        wire_type,
        operator_name,
        notes
      `)
      .eq("hardband_job_id", id)
      .order("line_number", { ascending: true });

    if (lineError) {
      setMessage(lineError.message);
      return;
    }

    const company = Array.isArray((jobData as any).companies)
      ? (jobData as any).companies[0]
      : (jobData as any).companies;

    setJob({
      id: jobData.id,
      jobNumber: jobData.job_number ?? "",
      jobSource: jobData.job_source ?? "inventory",
      company: company?.name ?? "Unknown",
      machineShopWorkOrder: jobData.machine_shop_work_order ?? "",
      fieldTicketNumber: jobData.field_ticket_number ?? "",
      rigNumber: jobData.rig_number ?? "",
      afe: jobData.afe ?? "",
      partNumber: jobData.part_number ?? "",
      size: jobData.size ?? "",
      grade: jobData.grade ?? "",
      connection: jobData.connection ?? "",
      pipeRange: jobData.pipe_range ?? "Range 2",
      condition: jobData.condition ?? "",
      totalJoints: Number(jobData.total_joints ?? 0),
      totalFootage: Number(jobData.total_footage ?? 0),
      wireType: jobData.wire_type ?? "",
      operatorName: jobData.operator_name ?? "",
      operatorSignature: jobData.operator_signature ?? "",
      status: jobData.status ?? "Open",
      notes: jobData.notes ?? "",
      createdAt: formatDate(jobData.created_at),
      closedAt: formatDate(jobData.closed_at),
    });

    setLines(
      (lineData ?? []).map((line: any) => ({
        id: line.id,
        lineNumber: Number(line.line_number ?? 0),
        serialNumber: line.serial_number ?? "",
        flushGrindBox: Boolean(line.flush_grind_box),
        flushGrindPin: Boolean(line.flush_grind_pin),
        grindOutBox: Boolean(line.grind_out_box),
        grindOutPin: Boolean(line.grind_out_pin),
        hardbandBox: Boolean(line.hardband_box),
        hardbandPin: Boolean(line.hardband_pin),
        wireType: line.wire_type ?? "",
        operatorName: line.operator_name ?? "",
        notes: line.notes ?? "",
      }))
    );
    setMessage("");
  }

  function goBack() {
    window.location.href = "/hardband";
  }

  if (!job) {
    return (
      <main className="print-shell">
        <section className="ticket-print-page">{message}</section>
      </main>
    );
  }

  return (
    <main className="print-shell">
      <div className="print-actions no-print">
        <button className="button" onClick={goBack}>Back</button>
        <button className="button primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <section className="ticket-print-page hardband-print-page">
        <header className="ticket-letterhead">
          <img src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" />
          <div>
            <h1>Pathfinder Inspections & Field Services</h1>
            <p>7501 Groening St.<br />Odessa, TX 79765<br />(432) 233-3600</p>
          </div>
        </header>

        <div className="ticket-rule" />

        <div className="ticket-title-row">
          <div>
            <h2>Hardband Work Order Report</h2>
            <p>{job.jobNumber}</p>
          </div>
          <aside>
            <span>Date</span>
            <strong>{job.createdAt}</strong>
            <span>Status</span>
            <strong>{job.status}</strong>
          </aside>
        </div>

        <section className="ticket-info-grid">
          <div><span>Company</span><strong>{job.company}</strong></div>
          <div><span>Machine Shop W/O #</span><strong>{job.machineShopWorkOrder || "-"}</strong></div>
          <div><span>Field Ticket #</span><strong>{job.fieldTicketNumber || "-"}</strong></div>
          <div><span>Rig #</span><strong>{job.rigNumber || "-"}</strong></div>
          <div><span>Source</span><strong>{job.jobSource === "inventory" ? "TITAN Inventory" : "Field/Machine Shop"}</strong></div>
          <div><span>Closed</span><strong>{job.closedAt || "-"}</strong></div>
        </section>

        <section className="ticket-info-grid">
          <div><span>TU#</span><strong>{job.afe || "-"}</strong></div>
          <div><span>Part Number</span><strong>{job.partNumber || "-"}</strong></div>
          <div><span>Size</span><strong>{job.size || "-"}</strong></div>
          <div><span>Grade</span><strong>{job.grade || "-"}</strong></div>
          <div><span>Connection</span><strong>{job.connection || "-"}</strong></div>
          <div><span>Range</span><strong>{job.pipeRange}</strong></div>
          <div><span>Condition</span><strong>{job.condition || "-"}</strong></div>
          <div><span>Wire</span><strong>{job.wireType || "-"}</strong></div>
          <div><span>Total Joints</span><strong>{job.totalJoints.toLocaleString()}</strong></div>
          <div><span>Total Footage</span><strong>{job.totalFootage.toLocaleString()}</strong></div>
        </section>

        <table className="ticket-lines hardband-report-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Serial Number</th>
              <th>Flush Box</th>
              <th>Flush Pin</th>
              <th>Grind Box</th>
              <th>Grind Pin</th>
              <th>HB Box</th>
              <th>HB Pin</th>
              <th>Wire</th>
              <th>Operator</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.lineNumber}</td>
                <td>{line.serialNumber}</td>
                <td>{yes(line.flushGrindBox)}</td>
                <td>{yes(line.flushGrindPin)}</td>
                <td>{yes(line.grindOutBox)}</td>
                <td>{yes(line.grindOutPin)}</td>
                <td>{yes(line.hardbandBox)}</td>
                <td>{yes(line.hardbandPin)}</td>
                <td>{line.wireType || "-"}</td>
                <td>{line.operatorName || "-"}</td>
                <td>{line.notes || "-"}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={11}>No serial-number line items were entered for this job.</td>
              </tr>
            )}
          </tbody>
        </table>

        <section className="ticket-info-grid hardband-summary-grid">
          <div><span>Serial Lines</span><strong>{totals.serials}</strong></div>
          <div><span>Flush Grind Box</span><strong>{totals.flushBox}</strong></div>
          <div><span>Flush Grind Pin</span><strong>{totals.flushPin}</strong></div>
          <div><span>Grind Out Box</span><strong>{totals.grindBox}</strong></div>
          <div><span>Grind Out Pin</span><strong>{totals.grindPin}</strong></div>
          <div><span>Hardband Box</span><strong>{totals.hardbandBox}</strong></div>
          <div><span>Hardband Pin</span><strong>{totals.hardbandPin}</strong></div>
        </section>

        <section className="ticket-notes">
          <h3>Notes</h3>
          <p>{job.notes || "No notes."}</p>
        </section>

        <section className="ticket-notes hardband-closeout">
          <h3>Job Closeout</h3>
          <p><strong>Completed By:</strong> {job.operatorName || "-"}</p>
          {job.operatorSignature ? (
            <img className="printed-job-signature" src={job.operatorSignature} alt="Job closeout signature" />
          ) : (
            <p>No closeout signature captured.</p>
          )}
        </section>
      </section>
    </main>
  );
}
