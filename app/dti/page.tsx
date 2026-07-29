"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { shouldShowPageMessage } from "../../lib/pageMessages";
import { DtiManagementStyles } from "./DtiManagementStyles";

type UserRole =
  | "admin"
  | "employee"
  | "sales"
  | "customer"
  | "operator"
  | "dti_superintendent"
  | "dti_lead"
  | "dti_inspector";
type JobStatus = "Open" | "In Progress" | "Review" | "Closed";

const DTI_MANAGEMENT_ROLES: UserRole[] = ["admin", "employee", "dti_superintendent", "dti_lead"];

type Company = {
  id: string;
  name: string;
};

type InspectorRole = "lead_inspector" | "level_2_inspector" | "crew_lead" | "both";

type Inspector = {
  id: string;
  fullName: string;
  role: InspectorRole;
  isActive: boolean;
};

type CompanyRow = {
  id: string;
  name: string | null;
};

type InspectorRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
};

type DtiJobRow = {
  id: string;
  job_number: string | null;
  company_id: string | null;
  job_date: string | null;
  field_ticket_number: string | null;
  inspection_type: string | null;
  inspection_company: string | null;
  rig: string | null;
  operator: string | null;
  lead_inspector: string | null;
  field_superintendent: string | null;
  pad_location: string | null;
  crew_lead: string | null;
  reviewed_by: string | null;
  review_date: string | null;
  reviewer_signature: string | null;
  status: string | null;
  overall_result: string | null;
  notes: string | null;
  closed_at: string | null;
  created_at: string | null;
  companies: unknown;
};

type DtiChecklistResponseRow = {
  id: string;
  dti_job_id: string | null;
  section: string | null;
  category: string | null;
  requirement: string | null;
  definition: string | null;
  priority: string | null;
  weight: number | string | null;
  score: number | string | null;
  notes: string | null;
  red_flag: boolean | null;
  sort_order: number | string | null;
};

type Profile = {
  id: string;
  fullName: string;
  role: UserRole;
  companyId: string | null;
};

type DtiJob = {
  id: string;
  jobNumber: string;
  companyId: string;
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
  status: JobStatus;
  overallResult: string;
  notes: string;
  closedAt: string;
  createdAt: string;
};

type ChecklistResponse = {
  id: string;
  dtiJobId: string;
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

type ChecklistTemplateItem = {
  section: string;
  category: string;
  requirement: string;
  definition: string;
  priority: string;
  weight: number | null;
};

type JobForm = {
  customer: string;
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
  notes: string;
};

type CloseForm = {
  reviewedBy: string;
  reviewDate: string;
  signature: string;
};

type DtiFilters = {
  keyword: string;
  rig: string;
  jobType: string;
  customer: string;
  jobNumber: string;
  fieldTicketNumber: string;
  status: string;
  leadInspector: string;
  level2Inspector: string;
  startDate: string;
  endDate: string;
};

const statusOptions: JobStatus[] = ["Open", "In Progress", "Review", "Closed"];

const emptyFilters: DtiFilters = {
  keyword: "",
  rig: "",
  jobType: "",
  customer: "",
  jobNumber: "",
  fieldTicketNumber: "",
  status: "Active",
  leadInspector: "",
  level2Inspector: "",
  startDate: "",
  endDate: "",
};

const jobsPerPage = 25;

const emptyJobForm: JobForm = {
  customer: "",
  jobDate: new Date().toISOString().slice(0, 10),
  fieldTicketNumber: "",
  inspectionType: "DTI Field Inspection",
  inspectionCompany: "Pathfinder Inspections & Field Services",
  rig: "",
  operator: "",
  leadInspector: "",
  fieldSuperintendent: "",
  padLocation: "",
  crewLead: "",
  notes: "",
};

const checklistTemplate: ChecklistTemplateItem[] = [
  {
    section: "Pre-Job",
    category: "Job Confirmation",
    requirement: "Job confirmed with Operator / CM",
    definition: "Scope, timing, location, and joint count verified before crew arrival.",
    priority: "High",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Scope Control",
    requirement: "Inspection scope verified",
    definition: "Cat 3 / Cat 4 / Cat 5 / BHA requirements are clear and documented.",
    priority: "High",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Customer Requirements",
    requirement: "Color codes verified",
    definition: "Operator / monitor color-code expectations confirmed.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Customer Requirements",
    requirement: "Third-party monitor notified",
    definition: "ERS / TH Hill / STI / customer monitor aligned before inspection starts.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Crew Readiness",
    requirement: "Crew confirmed",
    definition: "Lead inspector, crew count, and start time confirmed.",
    priority: "High",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Crew Readiness",
    requirement: "NDE company has adequate personnel",
    definition: "Crew size fits job size and inspection scope.",
    priority: "High",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Equipment Readiness",
    requirement: "NDE company has correct equipment",
    definition: "Tube size / connection OD gauge, profile gauge, and refacing gear verified.",
    priority: "High",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Procedure Control",
    requirement: "Access to procedures and acceptance criteria",
    definition: "DS-1, GP, TSC, field inspection drawings, and job-specific criteria available.",
    priority: "High",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Communication",
    requirement: "Field ERS notified prior to inspection",
    definition: "Field ERS / superintendent notified before start of inspection.",
    priority: "High",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Documentation",
    requirement: "Pre-job checklist submitted",
    definition: "Checklist submitted to Field ERS before inspection starts.",
    priority: "High",
    weight: null,
  },
  {
    section: "Pre-Job",
    category: "Calibration",
    requirement: "Inspection equipment calibrated",
    definition: "Equipment calibrated per DS-1 requirements before work begins.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Safety",
    requirement: "JSA completed",
    definition: "JSA signed by all crew before work starts.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Safety",
    requirement: "PPE verified",
    definition: "FR, gloves, safety glasses, boots, hard hats, and hearing protection verified as needed.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Safety",
    requirement: "Gas monitor bump test completed",
    definition: "Monitor tested and documented.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Safety",
    requirement: "Fire extinguishers inspected",
    definition: "Extinguishers accessible and within inspection date.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Safety",
    requirement: "Emergency plan reviewed",
    definition: "Muster point, nearest medical help, and communication plan reviewed.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Safety",
    requirement: "Good catch / near miss discussed",
    definition: "Crew reminded of reporting expectations.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Equipment",
    requirement: "EMI cal-in verified",
    definition: "Calibration hits DS-1 threshold / 15 mils where applicable.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Equipment",
    requirement: "EMI cal-out verified",
    definition: "Calibration confirmed after run / shift.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Equipment",
    requirement: "Pressure washer ready",
    definition: "Hot/cold availability matches job cleaning needs.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Inspection Quality",
    requirement: "Pipe cleaned and ready",
    definition: "OD/ID clean enough for inspection; OBM addressed.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Inspection Quality",
    requirement: "Lighting adequate",
    definition: "Inspection area has proper visibility.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Inspection Quality",
    requirement: "DS-1 criteria verified",
    definition: "Applicable DS-1 sections reviewed by lead/superintendent.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Inspection Quality",
    requirement: "Visual inspection completed",
    definition: "Visual criteria followed consistently.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Inspection Quality",
    requirement: "Rejects verified to standard",
    definition: "Reject calls validated before customer communication.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Defect Control",
    requirement: "DBR categorized",
    definition: "Low wall, heat checking, cracks, TSR, and EMI rejects separated.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Defect Control",
    requirement: "IPC rejects marked",
    definition: "Mid-tube marks / bands applied per spec.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Traceability",
    requirement: "Joint traceability maintained",
    definition: "Inspection results correlate to joint numbers.",
    priority: "High",
    weight: null,
  },
  {
    section: "Field Inspection",
    category: "Traceability",
    requirement: "Color coding applied correctly",
    definition: "Banding and markings match operator/customer spec.",
    priority: "Standard",
    weight: null,
  },
  {
    section: "Crew Scorecard",
    category: "Attendance & Reliability",
    requirement: "On-time arrival",
    definition: "Crew arrived ready to work at the agreed start time.",
    priority: "Weighted",
    weight: 0.08,
  },
  {
    section: "Crew Scorecard",
    category: "Attendance & Reliability",
    requirement: "Crew size maintained",
    definition: "Crew count stayed aligned with job requirements.",
    priority: "Weighted",
    weight: 0.06,
  },
  {
    section: "Crew Scorecard",
    category: "Attendance & Reliability",
    requirement: "No same-day no-shows",
    definition: "No unplanned crew absences impacted the job.",
    priority: "Weighted",
    weight: 0.06,
  },
  {
    section: "Crew Scorecard",
    category: "Safety & Compliance",
    requirement: "JSA / PPE compliance",
    definition: "Crew followed JSA and PPE expectations throughout work.",
    priority: "Weighted",
    weight: 0.1,
  },
  {
    section: "Crew Scorecard",
    category: "Safety & Compliance",
    requirement: "KPA / good catch discipline",
    definition: "Crew maintained reporting discipline and jobsite awareness.",
    priority: "Weighted",
    weight: 0.05,
  },
  {
    section: "Crew Scorecard",
    category: "Equipment Readiness",
    requirement: "EMI / laptop / Vedaq ready",
    definition: "Critical inspection electronics were ready and functioning.",
    priority: "Weighted",
    weight: 0.1,
  },
  {
    section: "Crew Scorecard",
    category: "Equipment Readiness",
    requirement: "Power / UPS / compressor ready",
    definition: "Supporting power and air equipment were ready.",
    priority: "Weighted",
    weight: 0.05,
  },
  {
    section: "Crew Scorecard",
    category: "Equipment Readiness",
    requirement: "Tools / gauges ready",
    definition: "Required tools and gauges were available and serviceable.",
    priority: "Weighted",
    weight: 0.05,
  },
  {
    section: "Crew Scorecard",
    category: "Quality Control",
    requirement: "Calibration / prove-up control",
    definition: "Calibration and prove-up process stayed controlled and documented.",
    priority: "Weighted",
    weight: 0.1,
  },
  {
    section: "Crew Scorecard",
    category: "Documentation",
    requirement: "DFR / job notes complete",
    definition: "Daily field report and job notes are complete.",
    priority: "Weighted",
    weight: 0.06,
  },
  {
    section: "Crew Scorecard",
    category: "Customer Communication",
    requirement: "Customer / monitor updates clear",
    definition: "Customer, monitor, and superintendent communication stayed timely and clear.",
    priority: "Weighted",
    weight: 0.08,
  },
  {
    section: "Crew Scorecard",
    category: "Customer Communication",
    requirement: "Issues escalated quickly",
    definition: "Problems, rejects, equipment delays, and manpower concerns were escalated promptly.",
    priority: "Weighted",
    weight: 0.08,
  },
  {
    section: "Crew Scorecard",
    category: "Overall Performance",
    requirement: "Professionalism and housekeeping",
    definition: "Crew represented Pathfinder professionally and kept the work area organized.",
    priority: "Weighted",
    weight: 0.13,
  },
  {
    section: "Summary",
    category: "Closeout",
    requirement: "Final review complete",
    definition: "Superintendent reviewed checklist, red flags, scorecard, and customer concerns.",
    priority: "High",
    weight: null,
  },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function ticketDateStamp(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}-${dd}-${yy}`;
}

function sequenceLetter(index: number) {
  let value = "";
  let number = index + 1;

  while (number > 0) {
    number -= 1;
    value = String.fromCharCode(65 + (number % 26)) + value;
    number = Math.floor(number / 26);
  }

  return value;
}

function isDuplicateDtiJobNumberError(error: unknown) {
  const pgError = error as { code?: string; message?: string; details?: string };
  const text = `${pgError.code ?? ""} ${pgError.message ?? ""} ${pgError.details ?? ""}`.toLowerCase();
  return pgError.code === "23505" && text.includes("dti_jobs_job_number_key");
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected DTI error.";
}

function uniqueJobValues(jobs: DtiJob[], pick: (job: DtiJob) => string) {
  return [...new Set(jobs.map(pick).map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function normalizeRole(value: unknown): UserRole {
  const role = String(value ?? "customer");
  if (
    role === "admin" ||
    role === "employee" ||
    role === "sales" ||
    role === "customer" ||
    role === "operator" ||
    role === "dti_superintendent" ||
    role === "dti_lead" ||
    role === "dti_inspector"
  ) {
    return role;
  }
  return "customer";
}

function scoreLabel(score: number | null) {
  if (!score) return "N/A";
  if (score >= 5) return "Excellent";
  if (score === 4) return "Good";
  if (score === 3) return "Acceptable";
  if (score === 2) return "Needs Attention";
  return "Critical";
}

function letterGrade(score: number | string | null) {
  const numeric = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(numeric) || numeric <= 0) return "N/A";

  const rounded = Math.round(numeric);
  if (rounded >= 5) return "A";
  if (rounded === 4) return "B";
  if (rounded === 3) return "C";
  if (rounded === 2) return "D";
  return "F";
}

function scoreSummary(rows: ChecklistResponse[]) {
  const scored = rows.filter((row) => row.score !== null);
  const average = scored.length
    ? scored.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / scored.length
    : 0;

  return {
    scoredCount: scored.length,
    redCount: rows.filter((row) => row.redFlag || (row.score !== null && row.score <= 2)).length,
    average,
    averageText: average ? average.toFixed(1) : "-",
    grade: letterGrade(average),
  };
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  function getPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const point = getPoint(event);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    onChange(canvas.toDataURL("image/png"));
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(event.pointerId);
      onChange(canvas.toDataURL("image/png"));
    }
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !value) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  return (
    <div className="signature-box">
      <div className="signature-header">
        <span>Manager Signature</span>
        <button className="button" type="button" onClick={clear}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={680}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  );
}

export default function DtiPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [jobs, setJobs] = useState<DtiJob[]>([]);
  const [responses, setResponses] = useState<ChecklistResponse[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobForm, setJobForm] = useState<JobForm>(emptyJobForm);
  const [closeForm, setCloseForm] = useState<CloseForm>({
    reviewedBy: "",
    reviewDate: new Date().toISOString().slice(0, 10),
    signature: "",
  });
  const [filters, setFilters] = useState<DtiFilters>(emptyFilters);
  const [sortBy, setSortBy] = useState("Newest");
  const [page, setPage] = useState(1);
  const [sectionFilter, setSectionFilter] = useState("All Sections");
  const [printSection, setPrintSection] = useState("All Sections");
  const [message, setMessage] = useState("Loading DTI management...");
  const [saving, setSaving] = useState(false);
  const [emailingReport, setEmailingReport] = useState(false);
  const [showRedFlagList, setShowRedFlagList] = useState(false);

  const canEdit = profile ? DTI_MANAGEMENT_ROLES.includes(profile.role) : false;
  const canClose = profile ? DTI_MANAGEMENT_ROLES.includes(profile.role) : false;

  const selectedJob = useMemo(() => {
    return jobs.find((job) => job.id === selectedJobId) ?? null;
  }, [jobs, selectedJobId]);

  const selectedResponses = useMemo(() => {
    if (!selectedJob) return [];
    return responses
      .filter((response) => response.dtiJobId === selectedJob.id)
      .filter((response) => sectionFilter === "All Sections" || response.section === sectionFilter)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [responses, selectedJob, sectionFilter]);

  const filterOptions = useMemo(
    () => ({
      customers: uniqueJobValues(jobs, (job) => job.company),
      rigs: uniqueJobValues(jobs, (job) => job.rig),
      jobTypes: uniqueJobValues(jobs, (job) => job.inspectionType),
      leadInspectors: uniqueJobValues(jobs, (job) => job.leadInspector),
      level2Inspectors: uniqueJobValues(jobs, (job) => job.crewLead),
    }),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    const jobNumberNeedle = filters.jobNumber.trim().toLowerCase();
    const ticketNeedle = filters.fieldTicketNumber.trim().toLowerCase();

    const nextJobs = jobs.filter((job) => {
      const statusMatch =
        filters.status === "All" ||
        (filters.status === "Active" && job.status !== "Closed") ||
        job.status === filters.status;

      const dateMatch =
        (!filters.startDate || job.jobDate >= filters.startDate) &&
        (!filters.endDate || job.jobDate <= filters.endDate);

      const text = [
        job.jobNumber,
        job.company,
        job.rig,
        job.operator,
        job.fieldTicketNumber,
        job.inspectionType,
        job.leadInspector,
        job.fieldSuperintendent,
        job.crewLead,
        job.padLocation,
      ]
        .join(" ")
        .toLowerCase();

      return (
        statusMatch &&
        dateMatch &&
        (!keyword || text.includes(keyword)) &&
        (!filters.rig || job.rig === filters.rig) &&
        (!filters.jobType || job.inspectionType === filters.jobType) &&
        (!filters.customer || job.company === filters.customer) &&
        (!jobNumberNeedle || job.jobNumber.toLowerCase().includes(jobNumberNeedle)) &&
        (!ticketNeedle || job.fieldTicketNumber.toLowerCase().includes(ticketNeedle)) &&
        (!filters.leadInspector || job.leadInspector === filters.leadInspector) &&
        (!filters.level2Inspector || job.crewLead === filters.level2Inspector)
      );
    });

    return [...nextJobs].sort((a, b) => {
      if (sortBy === "Oldest") return a.createdAt.localeCompare(b.createdAt);
      if (sortBy === "Date") return b.jobDate.localeCompare(a.jobDate);
      if (sortBy === "Customer") return a.company.localeCompare(b.company);
      if (sortBy === "Rig") return a.rig.localeCompare(b.rig);
      if (sortBy === "Status") return a.status.localeCompare(b.status);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [filters, jobs, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / jobsPerPage));
  const pagedJobs = filteredJobs.slice((page - 1) * jobsPerPage, page * jobsPerPage);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof DtiFilters; label: string }> = [];
    if (filters.keyword) chips.push({ key: "keyword", label: `Search: ${filters.keyword}` });
    if (filters.rig) chips.push({ key: "rig", label: `Rig: ${filters.rig}` });
    if (filters.jobType) chips.push({ key: "jobType", label: `Type: ${filters.jobType}` });
    if (filters.customer) chips.push({ key: "customer", label: `Customer: ${filters.customer}` });
    if (filters.jobNumber) chips.push({ key: "jobNumber", label: `Job #: ${filters.jobNumber}` });
    if (filters.fieldTicketNumber) chips.push({ key: "fieldTicketNumber", label: `Ticket #: ${filters.fieldTicketNumber}` });
    if (filters.status !== "Active") chips.push({ key: "status", label: `Status: ${filters.status}` });
    if (filters.leadInspector) chips.push({ key: "leadInspector", label: `Lead: ${filters.leadInspector}` });
    if (filters.level2Inspector) chips.push({ key: "level2Inspector", label: `Level 2: ${filters.level2Inspector}` });
    if (filters.startDate) chips.push({ key: "startDate", label: `From: ${filters.startDate}` });
    if (filters.endDate) chips.push({ key: "endDate", label: `To: ${filters.endDate}` });
    return chips;
  }, [filters]);

  const metrics = useMemo(() => {
    const activeJobs = jobs.filter((job) => job.status !== "Closed");
    const redFlags = responses.filter((response) => response.redFlag || (response.score !== null && response.score <= 2)).length;
    const scored = responses.filter((response) => response.score !== null);
    const averageScore = scored.length
      ? scored.reduce((sum, response) => sum + Number(response.score ?? 0), 0) / scored.length
      : 0;
    const reviewNeeded = jobs.filter(
      (job) =>
        job.status === "Review" ||
        responses.some((response) => response.dtiJobId === job.id && response.redFlag)
    ).length;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const closedThisWeek = jobs.filter(
      (job) => job.status === "Closed" && job.closedAt && new Date(job.closedAt) >= weekAgo
    ).length;

    return {
      activeJobs: activeJobs.length,
      reviewNeeded,
      closedThisWeek,
      redFlags,
      averageScore: averageScore ? averageScore.toFixed(1) : "-",
      averageGrade: letterGrade(averageScore),
    };
  }, [jobs, responses]);

  const redFlagItems = useMemo(() => {
    return responses
      .filter((response) => response.redFlag || (response.score !== null && response.score <= 2))
      .map((response) => ({
        ...response,
        job: jobs.find((job) => job.id === response.dtiJobId) ?? null,
      }))
      .sort((a, b) => {
        const jobCompare = (a.job?.jobNumber ?? "").localeCompare(b.job?.jobNumber ?? "");
        return jobCompare || a.sortOrder - b.sortOrder;
      });
  }, [jobs, responses]);

  const leadInspectorPerformance = useMemo(() => {
    const byLead = new Map<string, DtiJob[]>();
    jobs.forEach((job) => {
      const lead = job.leadInspector || "Unassigned";
      byLead.set(lead, [...(byLead.get(lead) ?? []), job]);
    });

    return [...byLead.entries()]
      .map(([lead, leadJobs]) => {
        const jobIds = new Set(leadJobs.map((job) => job.id));
        const leadResponses = responses.filter((response) => jobIds.has(response.dtiJobId));
        const scored = leadResponses.filter((response) => response.score !== null);
        const average = scored.length
          ? scored.reduce((sum, response) => sum + Number(response.score ?? 0), 0) / scored.length
          : 0;

        const redFlags = leadResponses.filter(
          (response) => response.redFlag || (response.score !== null && response.score <= 2)
        ).length;

        const categoryMap = new Map<string, number[]>();
        scored.forEach((response) => {
          const key = response.category || response.section || "General";
          categoryMap.set(key, [...(categoryMap.get(key) ?? []), Number(response.score)]);
        });

        const categoryAverages = [...categoryMap.entries()]
          .map(([label, values]) => ({
            label,
            average: values.reduce((sum, value) => sum + value, 0) / values.length,
          }))
          .sort((a, b) => b.average - a.average);

        const operatorMap = new Map<string, { scores: number[]; jobs: number }>();
        leadJobs.forEach((job) => {
          const jobScores = responses
            .filter((response) => response.dtiJobId === job.id && response.score !== null)
            .map((response) => Number(response.score));
          const key = job.operator || "Unassigned";
          const current = operatorMap.get(key) ?? { scores: [], jobs: 0 };
          current.scores.push(...jobScores);
          current.jobs += 1;
          operatorMap.set(key, current);
        });

        const bestOperator = [...operatorMap.entries()]
          .map(([operator, item]) => ({
            operator,
            jobs: item.jobs,
            average: item.scores.length
              ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
              : 0,
          }))
          .sort((a, b) => b.average - a.average || b.jobs - a.jobs)[0];

        return {
          lead,
          jobs: leadJobs.length,
          closedJobs: leadJobs.filter((job) => job.status === "Closed").length,
          average,
          grade: letterGrade(average),
          redFlags,
          strength: categoryAverages[0]?.label ?? "No scored categories yet",
          weakness: categoryAverages[categoryAverages.length - 1]?.label ?? "No scored categories yet",
          bestOperator: bestOperator ? `${bestOperator.operator} (${bestOperator.average.toFixed(1)})` : "No operator data yet",
        };
      })
      .sort((a, b) => b.average - a.average || b.jobs - a.jobs || a.lead.localeCompare(b.lead));
  }, [jobs, responses]);

  async function loadPage() {
    setMessage("Loading DTI management...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.assign("/login");
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, company_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      setMessage(profileError?.message ?? "Profile not found.");
      return;
    }

    const loadedProfile: Profile = {
      id: profileData.id,
      fullName: profileData.full_name ?? user.email ?? "User",
      role: normalizeRole(profileData.role),
      companyId: profileData.company_id ?? null,
    };

    if (loadedProfile.role === "customer") {
      window.location.assign("/customer");
      return;
    }

    if (loadedProfile.role === "dti_inspector") {
      window.location.assign("/dti-summary");
      return;
    }

    if (!DTI_MANAGEMENT_ROLES.includes(loadedProfile.role)) {
      window.location.assign("/home");
      return;
    }

    setProfile(loadedProfile);
    setCloseForm((current) => ({
      ...current,
      reviewedBy: current.reviewedBy || loadedProfile.fullName,
    }));

    await Promise.all([loadCompanies(), loadInspectors(), loadJobs()]);
    setMessage("");
  }

  useEffect(() => {
    void Promise.resolve().then(loadPage);
  }, []);

  async function loadCompanies() {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Companies failed: ${error.message}`);
      return;
    }

    const companyRows = (data ?? []) as CompanyRow[];
    setCompanies(companyRows.map((company) => ({ id: company.id, name: company.name ?? "" })));
  }

  async function loadInspectors() {
    const { data, error } = await supabase
      .from("inspectors")
      .select("id, full_name, role, is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) {
      setMessage(`Inspectors failed: ${error.message}`);
      return;
    }

    const inspectorRows = (data ?? []) as InspectorRow[];
    setInspectors(
      inspectorRows.map((inspector) => ({
        id: inspector.id,
        fullName: inspector.full_name ?? "",
        role: (inspector.role ?? "lead_inspector") as InspectorRole,
        isActive: Boolean(inspector.is_active),
      }))
    );
  }

  async function loadJobs() {
    const { data: jobData, error: jobError } = await supabase
      .from("dti_jobs")
      .select(`
        id,
        job_number,
        company_id,
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
        created_at,
        companies(name)
      `)
      .order("created_at", { ascending: false });

    if (jobError) {
      setMessage(`DTI jobs failed: ${jobError.message}`);
      return;
    }

    const jobRows = (jobData ?? []) as DtiJobRow[];
    const jobIds = jobRows.map((job) => job.id);

    const { data: responseData, error: responseError } = jobIds.length
      ? await supabase
          .from("dti_checklist_responses")
          .select(`
            id,
            dti_job_id,
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
          .in("dti_job_id", jobIds)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };

    if (responseError) {
      setMessage(`DTI checklist failed: ${responseError.message}`);
      return;
    }

    const mappedJobs: DtiJob[] = jobRows.map((job) => ({
      id: job.id,
      jobNumber: job.job_number ?? "",
      companyId: job.company_id ?? "",
      company: getCompanyName(job.companies) || "Unknown",
      jobDate: formatDate(job.job_date),
      fieldTicketNumber: job.field_ticket_number ?? "",
      inspectionType: job.inspection_type ?? "",
      inspectionCompany: job.inspection_company ?? "",
      rig: job.rig ?? "",
      operator: job.operator ?? "",
      leadInspector: job.lead_inspector ?? "",
      fieldSuperintendent: job.field_superintendent ?? "",
      padLocation: job.pad_location ?? "",
      crewLead: job.crew_lead ?? "",
      reviewedBy: job.reviewed_by ?? "",
      reviewDate: formatDate(job.review_date),
      reviewerSignature: job.reviewer_signature ?? "",
      status: statusOptions.includes(job.status as JobStatus) ? (job.status as JobStatus) : "Open",
      overallResult: job.overall_result ?? "Review",
      notes: job.notes ?? "",
      closedAt: job.closed_at ?? "",
      createdAt: formatDate(job.created_at),
    }));

    setJobs(mappedJobs);
    setResponses(
      ((responseData ?? []) as DtiChecklistResponseRow[]).map((response) => ({
        id: response.id,
        dtiJobId: response.dti_job_id ?? "",
        section: response.section ?? "",
        category: response.category ?? "",
        requirement: response.requirement ?? "",
        definition: response.definition ?? "",
        priority: response.priority ?? "",
        weight: response.weight === null || response.weight === undefined ? null : Number(response.weight),
        score: response.score === null || response.score === undefined ? null : Number(response.score),
        notes: response.notes ?? "",
        redFlag: Boolean(response.red_flag),
        sortOrder: Number(response.sort_order ?? 0),
      }))
    );

    if (selectedJobId && !mappedJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId("");
    }

    const requestedJobId = new URLSearchParams(window.location.search).get("job");
    if (!selectedJobId && requestedJobId && mappedJobs.some((job) => job.id === requestedJobId)) {
      setSelectedJobId(requestedJobId);
    }
  }

  async function findOrCreateCompany(name: string) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Customer is required.");

    const existing = companies.find((company) => company.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("companies")
      .insert({ name: cleanName })
      .select("id, name")
      .single();

    if (error) throw error;
    await loadCompanies();
    return data.id as string;
  }

  async function makeDtiJobNumber(jobDate: string, blockedJobNumbers = new Set<string>()) {
    const date = jobDate ? new Date(`${jobDate}T12:00:00`) : new Date();
    const base = `DTI-${ticketDateStamp(date)}`;
    const { data, error } = await supabase
      .from("dti_jobs")
      .select("job_number")
      .ilike("job_number", `${base}%`);

    if (error) throw error;

    const usedJobNumbers = new Set(
      [
        ...(data ?? []).map((row) => String(row.job_number ?? "")),
        ...Array.from(blockedJobNumbers),
      ].filter((jobNumber) => jobNumber.startsWith(base))
    );

    for (let index = 0; index < 702; index += 1) {
      const candidate = `${base}${sequenceLetter(index)}`;
      if (!usedJobNumbers.has(candidate)) return candidate;
    }

    throw new Error(`No DTI job number remains available for ${base}.`);
  }

  async function createJob() {
    if (!canEdit || !profile) return;

    if (!jobForm.customer.trim()) {
      setMessage("Customer is required.");
      return;
    }

    if (!jobForm.leadInspector.trim()) {
      setMessage("Lead Inspector is required. Add inspectors in Admin if the list is empty.");
      return;
    }

    if (!jobForm.crewLead.trim()) {
      setMessage("Level 2 Inspector is required. Add inspectors in Admin if the list is empty.");
      return;
    }

    setSaving(true);
    setMessage("");

    let createdJobId = "";
    let jobNumber = "";
    let stage = "creating DTI job";

    try {
      const companyId = await findOrCreateCompany(jobForm.customer);
      const blockedJobNumbers = new Set<string>();
      let job: { id: string } | null = null;

      for (let attempt = 0; attempt < 10; attempt += 1) {
        jobNumber = await makeDtiJobNumber(jobForm.jobDate, blockedJobNumbers);
        stage = attempt ? "retrying DTI job number" : "saving DTI job";

        const { data, error } = await supabase
          .from("dti_jobs")
          .insert({
            job_number: jobNumber,
            company_id: companyId,
            job_date: jobForm.jobDate || new Date().toISOString().slice(0, 10),
            field_ticket_number: jobForm.fieldTicketNumber || null,
            inspection_type: jobForm.inspectionType || null,
            inspection_company: jobForm.inspectionCompany || null,
            rig: jobForm.rig || null,
            operator: jobForm.operator || null,
            lead_inspector: jobForm.leadInspector || null,
            field_superintendent: jobForm.fieldSuperintendent || null,
            pad_location: jobForm.padLocation || null,
            crew_lead: jobForm.crewLead || null,
            status: "Open",
            notes: jobForm.notes || null,
            created_by: profile.id,
          })
          .select("id")
          .single();

        if (!error) {
          job = data;
          break;
        }

        if (!isDuplicateDtiJobNumberError(error)) throw error;
        blockedJobNumbers.add(jobNumber);
      }

      if (!job) throw new Error("Could not generate an unused DTI job number. Please try again.");
      createdJobId = job.id;

      stage = "creating checklist responses";
      const rows = checklistTemplate.map((item, index) => ({
        dti_job_id: job.id,
        section: item.section,
        category: item.category,
        requirement: item.requirement,
        definition: item.definition,
        priority: item.priority,
        weight: item.weight,
        sort_order: index + 1,
      }));

      const { error: checklistError } = await supabase.from("dti_checklist_responses").insert(rows);
      if (checklistError) throw checklistError;

      stage = "recording status history";
      const { error: historyError } = await supabase.from("dti_status_history").insert({
        dti_job_id: job.id,
        status: "Open",
        comment: "DTI job created.",
        created_by: profile.id,
      });
      if (historyError) throw historyError;

      setJobForm(emptyJobForm);
      await loadJobs();
      setSelectedJobId(job.id);
      setMessage(`${jobNumber} created.`);
    } catch (error: unknown) {
      if (createdJobId) {
        await supabase.from("dti_jobs").delete().eq("id", createdJobId);
      }

      setMessage(`Create DTI job failed while ${stage}: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  function updateResponse(responseId: string, changes: Partial<ChecklistResponse>) {
    setResponses((current) =>
      current.map((response) => (response.id === responseId ? { ...response, ...changes } : response))
    );
  }

  async function saveChecklist() {
    if (!selectedJob || !canEdit || !profile) return;

    setSaving(true);
    setMessage("");

    try {
      const rows = responses
        .filter((response) => response.dtiJobId === selectedJob.id)
        .map((response) => ({
          id: response.id,
          score: response.score,
          notes: response.notes || null,
          red_flag: response.redFlag || (response.score !== null && response.score <= 2),
          updated_at: new Date().toISOString(),
        }));

      for (const row of rows) {
        const { error } = await supabase
          .from("dti_checklist_responses")
          .update({
            score: row.score,
            notes: row.notes,
            red_flag: row.red_flag,
            updated_at: row.updated_at,
          })
          .eq("id", row.id);

        if (error) throw error;
      }

      const jobResponses = responses.filter((response) => response.dtiJobId === selectedJob.id);
      const redFlagCount = jobResponses.filter((response) => response.redFlag || (response.score !== null && response.score <= 2)).length;
      const nextResult = redFlagCount > 0 ? "Needs Review" : "Acceptable";

      const { error: jobError } = await supabase
        .from("dti_jobs")
        .update({
          overall_result: nextResult,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedJob.id);

      if (jobError) throw jobError;

      await loadJobs();
      setMessage(`${selectedJob.jobNumber} checklist saved.`);
    } catch (error: unknown) {
      setMessage(`Save checklist failed: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: JobStatus) {
    if (!selectedJob || !canEdit || !profile) return;

    setSaving(true);
    setMessage("");

    try {
      const reopeningJob = selectedJob.status === "Closed" && status !== "Closed";
      const statusUpdate =
        reopeningJob
          ? {
              status,
              reviewed_by: null,
              review_date: null,
              reviewer_signature: null,
              closed_at: null,
              closed_by: null,
              updated_at: new Date().toISOString(),
            }
          : { status, updated_at: new Date().toISOString() };

      const { error } = await supabase
        .from("dti_jobs")
        .update(statusUpdate)
        .eq("id", selectedJob.id);

      if (error) throw error;

      await supabase.from("dti_status_history").insert({
        dti_job_id: selectedJob.id,
        status,
        comment: reopeningJob ? `Reopened and changed to ${status}.` : `Status changed to ${status}.`,
        created_by: profile.id,
      });

      await loadJobs();
      setMessage(`${selectedJob.jobNumber} status changed to ${status}.`);
    } catch (error: unknown) {
      setMessage(`Status failed: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function closeJob() {
    if (!selectedJob || !canClose || !profile) return;

    if (!closeForm.reviewedBy.trim()) {
      setMessage("Printed reviewer name is required to close the DTI job.");
      return;
    }

    if (!closeForm.signature) {
      setMessage("Manager signature is required to close the DTI job.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("dti_jobs")
        .update({
          status: "Closed",
          reviewed_by: closeForm.reviewedBy.trim(),
          review_date: closeForm.reviewDate || new Date().toISOString().slice(0, 10),
          reviewer_signature: closeForm.signature,
          closed_at: now,
          closed_by: profile.id,
          updated_at: now,
        })
        .eq("id", selectedJob.id);

      if (error) throw error;

      await supabase.from("dti_status_history").insert({
        dti_job_id: selectedJob.id,
        status: "Closed",
        comment: `Closed by ${closeForm.reviewedBy.trim()}.`,
        created_by: profile.id,
      });

      await loadJobs();
      setMessage(`${selectedJob.jobNumber} closed and locked.`);
    } catch (error: unknown) {
      setMessage(`Close DTI job failed: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!selectedJob) return;

    const header = [
      "Job Number",
      "Customer",
      "Date",
      "Status",
      "Section",
      "Category",
      "Requirement",
      "Definition",
      "Priority",
      "Weight",
      "Score",
      "Score Label",
      "Red Flag",
      "Notes",
    ];

    const rows = responses
      .filter((response) => response.dtiJobId === selectedJob.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((response) => [
        selectedJob.jobNumber,
        selectedJob.company,
        selectedJob.jobDate,
        selectedJob.status,
        response.section,
        response.category,
        response.requirement,
        response.definition,
        response.priority,
        response.weight ?? "",
        response.score ?? "",
        scoreLabel(response.score),
        response.redFlag ? "Yes" : "No",
        response.notes,
      ]);

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedJob.jobNumber}-dti-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openPrint() {
    if (!selectedJob) return;
    const section = encodeURIComponent(printSection);
    window.open(`/dti/print?id=${selectedJob.id}&section=${section}`, "_blank");
  }

  async function emailDtiReport() {
    if (!selectedJob || emailingReport) return;

    const recipientEmail = window.prompt("Email DTI report to:");
    if (!recipientEmail?.trim()) return;

    const note = window.prompt("Optional message for the email:") ?? "";

    setEmailingReport(true);
    setMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error("Your login session expired. Please sign in again.");
      }

      const response = await fetch("/api/dti-report-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: selectedJob.id,
          section: printSection,
          recipientEmail: recipientEmail.trim(),
          note,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error ?? "DTI report email failed.");
      }

      setMessage(`DTI report emailed to ${recipientEmail.trim()}.`);
    } catch (error: unknown) {
      setMessage(`Email DTI report failed: ${getErrorMessage(error)}`);
    } finally {
      setEmailingReport(false);
    }
  }

  async function deleteDtiJob(job: DtiJob) {
    if (!canClose || saving) return;

    const confirmed = window.confirm(
      `Delete DTI job ${job.jobNumber}? This removes the job, checklist scores, notes, and status history.`
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    try {
      const { error: responseError } = await supabase
        .from("dti_checklist_responses")
        .delete()
        .eq("dti_job_id", job.id);

      if (responseError) throw responseError;

      const { error: historyError } = await supabase
        .from("dti_status_history")
        .delete()
        .eq("dti_job_id", job.id);

      if (historyError) throw historyError;

      const { error: jobError } = await supabase
        .from("dti_jobs")
        .delete()
        .eq("id", job.id);

      if (jobError) throw jobError;

      if (selectedJobId === job.id) setSelectedJobId("");

      await loadJobs();
      setMessage(`${job.jobNumber} deleted.`);
    } catch (error: unknown) {
      setMessage(`Delete DTI job failed: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  const showPageMessage = shouldShowPageMessage(message);

  return (
    <main className="dashboard-shell dti-shell">
      <DtiManagementStyles />
      <header className="dashboard-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">DTI Management</div>
            <div className="brand-subtitle">Field inspection work orders and scorecards</div>
          </div>
        </button>

        <div className="dashboard-actions">
          <button className="button primary" onClick={() => (window.location.href = "/dti/create")}>Create DTI Job</button>
          <button className="button" onClick={() => (window.location.href = "/dti/grading-setup")}>Grading Setup</button>
          <button className="button" onClick={loadPage}>Refresh</button>
          <button className="button" onClick={() => (window.location.href = "/")}>Yard View</button>
          <button className="button" onClick={() => (window.location.href = "/dashboard")}>Command Center</button>
          <button className="button" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}>
            Sign Out
          </button>
        </div>
      </header>

      {showPageMessage && <div className="modal-message">{message}</div>}

      <section className="dashboard-hero">
        <span>Welcome</span>
        <h1>{profile?.fullName ?? "DTI"}</h1>
        <p>Track field inspection readiness, safety, quality checks, scorecards, red flags, and customer-ready reports.</p>
      </section>

      <section className="dashboard-metrics">
        <div className="dashboard-card"><span>{metrics.activeJobs}</span><p>Active DTI Jobs</p></div>
        <div className="dashboard-card"><span>{metrics.reviewNeeded}</span><p>Needs Review</p></div>
        <div className="dashboard-card"><span>{metrics.closedThisWeek}</span><p>Closed This Week</p></div>
        <div className="dashboard-card">
          <span>{metrics.averageScore}</span>
          <p>Average Score</p>
          <small>Grade {metrics.averageGrade}</small>
        </div>
        <button
          type="button"
          className="dashboard-card metric-button"
          onClick={() => setShowRedFlagList((current) => !current)}
        >
          <span>{metrics.redFlags}</span>
          <p>Open Red Flags</p>
        </button>
      </section>

      {showRedFlagList && (
        <section className="dashboard-card dti-red-flag-list">
          <div className="section-heading">
            <div>
              <h2>Red Flags / Needs Improvement</h2>
              <p>{redFlagItems.length} checklist items need attention.</p>
            </div>
            <button className="button" type="button" onClick={() => setShowRedFlagList(false)}>Close</button>
          </div>
          {redFlagItems.length === 0 ? (
            <p className="muted-text">No red flags or low scores are currently open.</p>
          ) : (
            <div className="dti-red-flag-items">
              {redFlagItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="dti-red-flag-item"
                  onClick={() => {
                    if (item.job) setSelectedJobId(item.job.id);
                    setSectionFilter(item.section);
                    document.querySelector(".dti-detail-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <strong>{item.job?.jobNumber ?? "DTI Job"}: {item.requirement}</strong>
                  <span>{item.section} / {item.category} / {scoreLabel(item.score)}</span>
                  <small>{item.notes || item.definition}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="dashboard-card wide">
        <h2>Lead Inspector Performance</h2>
        <p className="muted-text">
          Rankings are based on DTI scorecards. Strengths and focus areas come from checklist category averages.
        </p>

        {leadInspectorPerformance.length === 0 ? (
          <p className="muted-text">No DTI scorecard data found yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Lead Inspector</th>
                  <th>Jobs</th>
                  <th>Closed</th>
                  <th>Average</th>
                  <th>Grade</th>
                  <th>Red Flags</th>
                  <th>Strongest Operator</th>
                  <th>Strength</th>
                  <th>Focus Area</th>
                </tr>
              </thead>
              <tbody>
                {leadInspectorPerformance.map((lead, index) => (
                  <tr key={lead.lead}>
                    <td>{index + 1}</td>
                    <td>{lead.lead}</td>
                    <td>{lead.jobs}</td>
                    <td>{lead.closedJobs}</td>
                    <td>{lead.average.toFixed(1)}</td>
                    <td>{lead.grade}</td>
                    <td>{lead.redFlags}</td>
                    <td>{lead.bestOperator}</td>
                    <td>{lead.strength}</td>
                    <td>{lead.weakness}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-card wide dti-job-register">
        <div className="section-heading dti-register-heading">
          <div>
            <h2>DTI Jobs</h2>
            <p>
              {filteredJobs.length} of {jobs.length} jobs shown
              {filteredJobs.length > jobsPerPage ? ` / page ${page} of ${totalPages}` : ""}
            </p>
          </div>
          <div className="dashboard-actions">
            <button className="button primary" type="button" onClick={() => (window.location.href = "/dti/create")}>
              Create DTI Job
            </button>
            <button className="button" type="button" onClick={() => (window.location.href = "/dti/grading-setup")}>
              Grading Setup
            </button>
          </div>
        </div>

        <div className="dti-filter-toolbar">
          <label>
            Lookup
            <input
              value={filters.keyword}
              onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
              placeholder="Customer, rig, inspector, ticket, notes..."
            />
          </label>
          <label>
            Customer
            <select value={filters.customer} onChange={(event) => setFilters({ ...filters, customer: event.target.value })}>
              <option value="">All customers</option>
              {filterOptions.customers.map((customer) => <option key={customer}>{customer}</option>)}
            </select>
          </label>
          <label>
            Rig
            <select value={filters.rig} onChange={(event) => setFilters({ ...filters, rig: event.target.value })}>
              <option value="">All rigs</option>
              {filterOptions.rigs.map((rig) => <option key={rig}>{rig}</option>)}
            </select>
          </label>
          <label>
            Job Type
            <select value={filters.jobType} onChange={(event) => setFilters({ ...filters, jobType: event.target.value })}>
              <option value="">All types</option>
              {filterOptions.jobTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>
            Job Number
            <input
              value={filters.jobNumber}
              onChange={(event) => setFilters({ ...filters, jobNumber: event.target.value })}
              placeholder="DTI-..."
            />
          </label>
          <label>
            Field Ticket
            <input
              value={filters.fieldTicketNumber}
              onChange={(event) => setFilters({ ...filters, fieldTicketNumber: event.target.value })}
              placeholder="Ticket #"
            />
          </label>
          <label>
            Status
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option>Active</option>
              <option>All</option>
              {statusOptions.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label>
            Lead Inspector
            <select value={filters.leadInspector} onChange={(event) => setFilters({ ...filters, leadInspector: event.target.value })}>
              <option value="">All leads</option>
              {filterOptions.leadInspectors.map((lead) => <option key={lead}>{lead}</option>)}
            </select>
          </label>
          <label>
            Level 2 Inspector
            <select value={filters.level2Inspector} onChange={(event) => setFilters({ ...filters, level2Inspector: event.target.value })}>
              <option value="">All Level 2</option>
              {filterOptions.level2Inspectors.map((inspector) => <option key={inspector}>{inspector}</option>)}
            </select>
          </label>
          <label>
            Start Date
            <input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
          </label>
          <label>
            End Date
            <input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </label>
          <label>
            Sort
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option>Newest</option>
              <option>Oldest</option>
              <option>Date</option>
              <option>Customer</option>
              <option>Rig</option>
              <option>Status</option>
            </select>
          </label>
        </div>

        <div className="dti-active-filters">
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilters({ ...filters, [chip.key]: chip.key === "status" ? "Active" : "" })}
            >
              {chip.label} x
            </button>
          ))}
          {activeFilterChips.length > 0 && (
            <button type="button" className="clear" onClick={() => setFilters(emptyFilters)}>
              Clear filters
            </button>
          )}
        </div>

        {filteredJobs.length === 0 ? (
          <div className="dti-empty-state">
            <h3>No DTI jobs match this view.</h3>
            <p>Clear filters or create a new DTI job to start a scorecard.</p>
          </div>
        ) : (
          <div className="table-wrap dti-job-table-wrap">
            <table className="dti-job-table">
              <thead>
                <tr>
                  <th>Job #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Rig</th>
                  <th>Inspection Type</th>
                  <th>Lead Inspector</th>
                  <th>Level 2</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Grade</th>
                  <th>Scored</th>
                  <th>Red Flags</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedJobs.map((job) => {
                  const jobResponses = responses.filter((response) => response.dtiJobId === job.id);
                  const summary = scoreSummary(jobResponses);

                  return (
                    <tr key={job.id} className={selectedJob?.id === job.id ? "selected" : ""}>
                      <td>
                        <button className="dti-table-open" type="button" onClick={() => setSelectedJobId(job.id)}>
                          {job.jobNumber}
                        </button>
                      </td>
                      <td>{job.jobDate || job.createdAt}</td>
                      <td>{job.company}</td>
                      <td>{job.rig || "-"}</td>
                      <td>{job.inspectionType || "-"}</td>
                      <td>{job.leadInspector || "-"}</td>
                      <td>{job.crewLead || "-"}</td>
                      <td><span className="dti-pill">{job.status}</span></td>
                      <td>{summary.averageText}</td>
                      <td>{summary.grade}</td>
                      <td>{summary.scoredCount}</td>
                      <td>{summary.redCount}</td>
                      <td>
                        <div className="dti-row-actions">
                          <button type="button" className="button mini" onClick={() => setSelectedJobId(job.id)}>View</button>
                          <button type="button" className="button mini" onClick={() => setSelectedJobId(job.id)}>Grade</button>
                          <button type="button" className="button mini" onClick={() => window.open(`/dti/print?id=${job.id}&section=All%20Sections`, "_blank")}>Print</button>
                          {canClose && (
                            <button type="button" className="button mini danger" disabled={saving} onClick={() => deleteDtiJob(job)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredJobs.length > jobsPerPage && (
          <div className="dti-pagination">
            <button className="button" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button className="button" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
              Next
            </button>
          </div>
        )}
      </section>

      {!selectedJob && (
        <section className="dashboard-card wide dti-empty-detail">
          <h2>Select a DTI Job</h2>
          <p className="muted-text">Click a job card to open the checklist, enter scores, print reports, or close the job.</p>
        </section>
      )}

      {selectedJob && (
        <section className="dashboard-card wide dti-detail-card">
          <div className="hardband-detail-header">
            <div>
              <h2>{selectedJob.jobNumber}</h2>
              <p>{selectedJob.company} / {selectedJob.status} / {selectedJob.overallResult}</p>
            </div>
            <div className="hardband-detail-actions">
              <select value={selectedJob.status} disabled={!canEdit || saving} onChange={(event) => changeStatus(event.target.value as JobStatus)}>
                {statusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
              <button className="button" onClick={saveChecklist} disabled={!canEdit || selectedJob.status === "Closed" || saving}>Save Checklist</button>
              <button className="button" onClick={openPrint}>Print / PDF</button>
              <button className="button" onClick={emailDtiReport} disabled={emailingReport}>
                {emailingReport ? "Emailing..." : "Email Report"}
              </button>
              <button className="button" onClick={exportCsv}>Export CSV</button>
            </div>
          </div>

          <div className="transfer-summary dti-job-facts">
            <div><strong>Date:</strong> <span>{selectedJob.jobDate || "-"}</span></div>
            <div><strong>Field Ticket #:</strong> <span>{selectedJob.fieldTicketNumber || "-"}</span></div>
            <div><strong>Inspection Type:</strong> <span>{selectedJob.inspectionType || "-"}</span></div>
            <div><strong>Inspection Company:</strong> <span>{selectedJob.inspectionCompany || "-"}</span></div>
            <div><strong>Rig:</strong> <span>{selectedJob.rig || "-"}</span></div>
            <div><strong>Operator:</strong> <span>{selectedJob.operator || "-"}</span></div>
            <div><strong>Lead Inspector:</strong> <span>{selectedJob.leadInspector || "-"}</span></div>
            <div><strong>Field ERS / Superintendent:</strong> <span>{selectedJob.fieldSuperintendent || "-"}</span></div>
            <div><strong>Pad / Location:</strong> <span>{selectedJob.padLocation || "-"}</span></div>
            <div><strong>Level 2 Inspector:</strong> <span>{selectedJob.crewLead || "-"}</span></div>
          </div>

          <div className="hardband-filter-row">
            <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
              <option>All Sections</option>
              <option>Pre-Job</option>
              <option>Field Inspection</option>
              <option>Crew Scorecard</option>
              <option>Summary</option>
            </select>
            <select value={printSection} onChange={(event) => setPrintSection(event.target.value)}>
              <option>All Sections</option>
              <option>Pre-Job</option>
              <option>Field Inspection</option>
              <option>Crew Scorecard</option>
              <option>Summary</option>
            </select>
          </div>

          <div className="dti-checklist-list">
            {selectedResponses.map((response) => (
              <article key={response.id} className={`dti-check-row ${response.redFlag || (response.score !== null && response.score <= 2) ? "red-flag" : ""}`}>
                <div>
                  <div className="dti-row-kicker">{response.section} / {response.category}</div>
                  <h3>{response.requirement}</h3>
                  <p>{response.definition}</p>
                  <div className="dti-pill-row">
                    <span className="dti-pill">{response.priority}</span>
                    {response.weight !== null && <span className="dti-pill">Weight {(response.weight * 100).toFixed(0)}%</span>}
                    <span className="dti-pill">{scoreLabel(response.score)}</span>
                  </div>
                </div>

                <div className="dti-row-controls">
                  <div className="dti-score-buttons">
                    <button
                      type="button"
                      className={response.score === null ? "active" : ""}
                      disabled={!canEdit || selectedJob.status === "Closed"}
                      onClick={() => updateResponse(response.id, { score: null, redFlag: false })}
                    >
                      N/A
                    </button>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        className={response.score === score ? "active" : ""}
                        disabled={!canEdit || selectedJob.status === "Closed"}
                        onClick={() => updateResponse(response.id, { score, redFlag: score <= 2 })}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                  <label className="dti-red-toggle">
                    <input
                      type="checkbox"
                      checked={response.redFlag}
                      disabled={!canEdit || selectedJob.status === "Closed"}
                      onChange={(event) => updateResponse(response.id, { redFlag: event.target.checked })}
                    />
                    Red flag
                  </label>
                  <textarea
                    value={response.notes}
                    disabled={!canEdit || selectedJob.status === "Closed"}
                    onChange={(event) => updateResponse(response.id, { notes: event.target.value })}
                    placeholder="Notes / corrective action"
                  />
                </div>
              </article>
            ))}
          </div>

          {selectedJob.status !== "Closed" && canClose && (
            <section className="ticket-card dti-close-card">
              <h3>Close DTI Job</h3>
              <div className="form-grid">
                <label>
                  Manager Name
                  <input value={closeForm.reviewedBy} onChange={(event) => setCloseForm({ ...closeForm, reviewedBy: event.target.value })} />
                </label>
                <label>
                  Review Date
                  <input type="date" value={closeForm.reviewDate} onChange={(event) => setCloseForm({ ...closeForm, reviewDate: event.target.value })} />
                </label>
                <div className="full">
                  <SignaturePad value={closeForm.signature} onChange={(signature) => setCloseForm({ ...closeForm, signature })} />
                </div>
              </div>
              <button className="button primary" onClick={closeJob} disabled={saving}>
                Close Job
              </button>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
