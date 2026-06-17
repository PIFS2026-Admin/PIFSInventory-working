"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Job = {
  id: string;
  jobNumber: string;
  company: string;
  jobDate: string;
  fieldTicketNumber: string;
  inspectionType: string;
  inspectionCompany: string;
  rig: string;
  operator: string;
  leadInspector: string;
  fieldSuperintendent: string;
  padLocation: string;
  crewLead: string;
  reviewedBy: string;
  reviewDate: string;
  reviewerSignature: string;
  status: string;
  overallResult: string;
  notes: string;
  closedAt: string;
};

type ResponseRow = {
  id: string;
  section: string;
  category: string;
  requirement: string;
  definition: string;
  priority: string;
  weight: number | null;
  score: number | null;
  notes: string;
  redFlag: boolean;
  sortOrder: number;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function getCompanyName(value: unknown) {
  const readName = (item: unknown) => {
    if (!item || typeof item !== "object" || !("name" in item)) return "";
    const name = (item as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  };

  if (Array.isArray(value)) return readName(value[0]);
  return readName(value);
}

function scoreLabel(score: number | null) {
  if (!score) return "N/A";
  if (score >= 5) return "Excellent";
  if (score === 4) return "Good";
  if (score === 3) return "Acceptable";
  if (score === 2) return "Needs Attention";
  return "Critical";
}

function sectionGroups(rows: ResponseRow[]) {
  return ["Pre-Job", "Field Inspection", "Crew Scorecard", "Summary"].map((section) => ({
    section,
    rows: rows.filter((row) => row.section === section).sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export default function DtiPrintPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [message, setMessage] = useState("Loading DTI report...");

  const metrics = useMemo(() => {
    const scored = responses.filter((row) => row.score);
    const average = scored.length
      ? scored.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / scored.length
      : 0;

    return {
      scored: scored.length,
      total: responses.length,
      average: average ? average.toFixed(1) : "-",
      redFlags: responses.filter((row) => row.redFlag || (row.score !== null && row.score <= 2)).length,
    };
  }, [responses]);

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
      setMessage("Missing DTI job id.");
      return;
    }

    const { data: jobData, error: jobError } = await supabase
      .from("dti_jobs")
      .select(`
        id,
        job_number,
        job_date,
        field_ticket_number,
        inspection_type,
        inspection_company,
        rig,
        operator,
        lead_inspector,
        field_superintendent,
        pad_location,
        crew_lead,
        reviewed_by,
        review_date,
        reviewer_signature,
        status,
        overall_result,
        notes,
        closed_at,
        companies(name)
      `)
      .eq("id", id)
      .single();

    if (jobError || !jobData) {
      setMessage(jobError?.message ?? "DTI job not found.");
      return;
    }

    const { data: responseData, error: responseError } = await supabase
      .from("dti_checklist_responses")
      .select(`
        id,
        section,
        category,
        requirement,
        definition,
        priority,
        weight,
        score,
        notes,
        red_flag,
        sort_order
      `)
      .eq("dti_job_id", id)
      .order("sort_order", { ascending: true });

    if (responseError) {
      setMessage(responseError.message);
      return;
    }

    setJob({
      id: jobData.id,
      jobNumber: jobData.job_number ?? "",
      company: getCompanyName((jobData as any).companies) || "Unknown",
      jobDate: formatDate(jobData.job_date),
      fieldTicketNumber: jobData.field_ticket_number ?? "",
      inspectionType: jobData.inspection_type ?? "",
      inspectionCompany: jobData.inspection_company ?? "",
      rig: jobData.rig ?? "",
      operator: jobData.operator ?? "",
      leadInspector: jobData.lead_inspector ?? "",
      fieldSuperintendent: jobData.field_superintendent ?? "",
      padLocation: jobData.pad_location ?? "",
      crewLead: jobData.crew_lead ?? "",
      reviewedBy: jobData.reviewed_by ?? "",
      reviewDate: formatDate(jobData.review_date),
      reviewerSignature: jobData.reviewer_signature ?? "",
      status: jobData.status ?? "",
      overallResult: jobData.overall_result ?? "",
      notes: jobData.notes ?? "",
      closedAt: formatDate(jobData.closed_at),
    });

    setResponses(
      (responseData ?? []).map((row: any) => ({
        id: row.id,
        section: row.section ?? "",
        category: row.category ?? "",
        requirement: row.requirement ?? "",
        definition: row.definition ?? "",
        priority: row.priority ?? "",
        weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
        score: row.score === null || row.score === undefined ? null : Number(row.score),
        notes: row.notes ?? "",
        redFlag: Boolean(row.red_flag),
        sortOrder: Number(row.sort_order ?? 0),
      }))
    );

    setMessage("");
  }

  function goBack() {
    window.location.href = "/dti";
  }

  if (!job) {
    return (
      <main className="print-shell">
        <section className="ticket-print-page">{message}</section>
      </main>
    );
  }

  return (
    <main className="print-shell dti-print-shell">
      <div className="print-actions no-print">
        <button className="button" onClick={goBack}>Back</button>
        <button className="button primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <section className="ticket-print-page dti-report-page">
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
            <h2>DTI Management Report</h2>
            <p>{job.jobNumber}</p>
          </div>
          <div className="ticket-date-box">
            <span>Date</span>
            <strong>{job.jobDate || "-"}</strong>
            <span>Status</span>
            <strong>{job.status}</strong>
          </div>
        </div>

        <div className="ticket-info-grid">
          <div><span>Company</span><strong>{job.company}</strong></div>
          <div><span>Field Ticket #</span><strong>{job.fieldTicketNumber || "-"}</strong></div>
          <div><span>Inspection Type</span><strong>{job.inspectionType || "-"}</strong></div>
          <div><span>Inspection Company</span><strong>{job.inspectionCompany || "-"}</strong></div>
          <div><span>Rig</span><strong>{job.rig || "-"}</strong></div>
          <div><span>Operator</span><strong>{job.operator || "-"}</strong></div>
          <div><span>Lead Inspector</span><strong>{job.leadInspector || "-"}</strong></div>
          <div><span>Field ERS / Superintendent</span><strong>{job.fieldSuperintendent || "-"}</strong></div>
          <div><span>Pad / Location</span><strong>{job.padLocation || "-"}</strong></div>
          <div><span>Crew Lead</span><strong>{job.crewLead || "-"}</strong></div>
        </div>

        <div className="hardband-summary-grid">
          <div><span>Checklist Items</span><strong>{metrics.total}</strong></div>
          <div><span>Scored Items</span><strong>{metrics.scored}</strong></div>
          <div><span>Average Score</span><strong>{metrics.average}</strong></div>
          <div><span>Red Flags</span><strong>{metrics.redFlags}</strong></div>
          <div><span>Overall Result</span><strong>{job.overallResult || "-"}</strong></div>
        </div>

        {sectionGroups(responses).map((group) => (
          <section key={group.section} className="dti-print-section">
            <h3>{group.section}</h3>
            <table className="print-ticket-table dti-report-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Requirement</th>
                  <th>Definition</th>
                  <th>Priority</th>
                  <th>Score</th>
                  <th>Flag</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.category}</td>
                    <td>{row.requirement}</td>
                    <td>{row.definition}</td>
                    <td>{row.priority}{row.weight !== null ? ` / ${(row.weight * 100).toFixed(0)}%` : ""}</td>
                    <td>{row.score ? `${row.score} - ${scoreLabel(row.score)}` : "-"}</td>
                    <td>{row.redFlag || (row.score !== null && row.score <= 2) ? "Yes" : "-"}</td>
                    <td>{row.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <section className="ticket-notes">
          <h3>Job Notes</h3>
          <p>{job.notes || "No notes."}</p>
        </section>

        <section className="signature-grid">
          <div>
            <span>
              {job.reviewerSignature && (
                <img className="printed-signature-img" src={job.reviewerSignature} alt="Reviewer signature" />
              )}
            </span>
            <strong className="printed-signer-name">{job.reviewedBy || "-"}</strong>
            <p>Manager Signature</p>
          </div>
          <div>
            <span>{job.reviewDate || job.closedAt || "-"}</span>
            <p>Review Date</p>
          </div>
          <div>
            <span>{job.status}</span>
            <p>Final Status</p>
          </div>
        </section>
      </section>
    </main>
  );
}
