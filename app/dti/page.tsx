"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type UserRole = "admin" | "employee" | "sales" | "customer" | "operator" | "dti_superintendent" | "dti_inspector";
type JobStatus = "Open" | "In Progress" | "Review" | "Closed";

type Company = {
  id: string;
  name: string;
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

const statusOptions: JobStatus[] = ["Open", "In Progress", "Review", "Closed"];

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

function normalizeRole(value: unknown): UserRole {
  const role = String(value ?? "customer");
  if (
    role === "admin" ||
    role === "employee" ||
    role === "sales" ||
    role === "customer" ||
    role === "operator" ||
    role === "dti_superintendent" ||
    role === "dti_inspector"
  ) {
    return role;
  }
  return "customer";
}

function scoreLabel(score: number | null) {
  if (!score) return "Not scored";
  if (score >= 5) return "Excellent";
  if (score === 4) return "Good";
  if (score === 3) return "Acceptable";
  if (score === 2) return "Needs Attention";
  return "Critical";
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
        <span>Superintendent Signature</span>
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
  const [jobs, setJobs] = useState<DtiJob[]>([]);
  const [responses, setResponses] = useState<ChecklistResponse[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobForm, setJobForm] = useState<JobForm>(emptyJobForm);
  const [closeForm, setCloseForm] = useState<CloseForm>({
    reviewedBy: "",
    reviewDate: new Date().toISOString().slice(0, 10),
    signature: "",
  });
  const [statusFilter, setStatusFilter] = useState("Active");
  const [sectionFilter, setSectionFilter] = useState("All Sections");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading DTI management...");
  const [saving, setSaving] = useState(false);

  const canEdit = profile
    ? ["admin", "employee", "dti_superintendent", "dti_inspector"].includes(profile.role)
    : false;
  const canClose = profile ? ["admin", "employee", "dti_superintendent"].includes(profile.role) : false;

  const selectedJob = useMemo(() => {
    return jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null;
  }, [jobs, selectedJobId]);

  const selectedResponses = useMemo(() => {
    if (!selectedJob) return [];
    return responses
      .filter((response) => response.dtiJobId === selectedJob.id)
      .filter((response) => sectionFilter === "All Sections" || response.section === sectionFilter)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [responses, selectedJob, sectionFilter]);

  const filteredJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return jobs.filter((job) => {
      const statusMatch =
        statusFilter === "All" ||
        (statusFilter === "Active" && job.status !== "Closed") ||
        job.status === statusFilter;

      const text = [
        job.jobNumber,
        job.company,
        job.rig,
        job.operator,
        job.fieldTicketNumber,
        job.leadInspector,
        job.fieldSuperintendent,
      ]
        .join(" ")
        .toLowerCase();

      return statusMatch && (!needle || text.includes(needle));
    });
  }, [jobs, search, statusFilter]);

  const metrics = useMemo(() => {
    const activeJobs = jobs.filter((job) => job.status !== "Closed");
    const redFlags = responses.filter((response) => response.redFlag).length;
    const scored = responses.filter((response) => response.score);
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
    };
  }, [jobs, responses]);

  useEffect(() => {
    loadPage();
  }, []);

  async function loadPage() {
    setMessage("Loading DTI management...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.href = "/login";
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
      window.location.href = "/customer";
      return;
    }

    setProfile(loadedProfile);
    setCloseForm((current) => ({
      ...current,
      reviewedBy: current.reviewedBy || loadedProfile.fullName,
    }));

    await Promise.all([loadCompanies(), loadJobs()]);
    setMessage("");
  }

  async function loadCompanies() {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Companies failed: ${error.message}`);
      return;
    }

    setCompanies((data ?? []).map((company: any) => ({ id: company.id, name: company.name ?? "" })));
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

    const jobIds = (jobData ?? []).map((job: any) => job.id);

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

    const mappedJobs: DtiJob[] = (jobData ?? []).map((job: any) => ({
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
      status: (statusOptions.includes(job.status) ? job.status : "Open") as JobStatus,
      overallResult: job.overall_result ?? "Review",
      notes: job.notes ?? "",
      closedAt: job.closed_at ?? "",
      createdAt: formatDate(job.created_at),
    }));

    setJobs(mappedJobs);
    setResponses(
      (responseData ?? []).map((response: any) => ({
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

    if (!selectedJobId && mappedJobs[0]) {
      setSelectedJobId(mappedJobs[0].id);
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

  async function makeDtiJobNumber(jobDate: string) {
    const date = jobDate ? new Date(`${jobDate}T12:00:00`) : new Date();
    const base = `DTI-${ticketDateStamp(date)}`;
    const { data } = await supabase
      .from("dti_jobs")
      .select("job_number")
      .ilike("job_number", `${base}%`);

    return `${base}${sequenceLetter(data?.length ?? 0)}`;
  }

  async function createJob() {
    if (!canEdit || !profile) return;

    if (!jobForm.customer.trim()) {
      setMessage("Customer is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const companyId = await findOrCreateCompany(jobForm.customer);
      const jobNumber = await makeDtiJobNumber(jobForm.jobDate);

      const { data: job, error } = await supabase
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

      if (error) throw error;

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

      await supabase.from("dti_status_history").insert({
        dti_job_id: job.id,
        status: "Open",
        comment: "DTI job created.",
        created_by: profile.id,
      });

      setJobForm(emptyJobForm);
      await loadJobs();
      setSelectedJobId(job.id);
      setMessage(`${jobNumber} created.`);
    } catch (error: any) {
      setMessage(`Create DTI job failed: ${error.message}`);
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
          red_flag: response.redFlag || Number(response.score ?? 0) <= 2,
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
      const redFlagCount = jobResponses.filter((response) => response.redFlag || Number(response.score ?? 0) <= 2).length;
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
    } catch (error: any) {
      setMessage(`Save checklist failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: JobStatus) {
    if (!selectedJob || !canEdit || !profile) return;
    if (selectedJob.status === "Closed") {
      setMessage("Closed DTI jobs are locked. Print or export the report from history.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("dti_jobs")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", selectedJob.id);

      if (error) throw error;

      await supabase.from("dti_status_history").insert({
        dti_job_id: selectedJob.id,
        status,
        comment: `Status changed to ${status}.`,
        created_by: profile.id,
      });

      await loadJobs();
      setMessage(`${selectedJob.jobNumber} status changed to ${status}.`);
    } catch (error: any) {
      setMessage(`Status failed: ${error.message}`);
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
      setMessage("Superintendent signature is required to close the DTI job.");
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
    } catch (error: any) {
      setMessage(`Close DTI job failed: ${error.message}`);
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
    window.open(`/dti/print?id=${selectedJob.id}`, "_blank");
  }

  return (
    <main className="dashboard-shell dti-shell">
      <header className="dashboard-header">
        <div className="brand compact">
          <img className="brand-logo-img" src="/titan-logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">DTI Management</div>
            <div className="brand-subtitle">Field inspection work orders and scorecards</div>
          </div>
        </div>

        <div className="dashboard-actions">
          <button className="button" onClick={loadPage}>Refresh</button>
          <button className="button" onClick={() => (window.location.href = "/")}>Yard View</button>
          <button className="button" onClick={() => (window.location.href = "/dashboard")}>Dashboard</button>
          <button className="button" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}>
            Sign Out
          </button>
        </div>
      </header>

      {message && <div className="modal-message">{message}</div>}

      <section className="dashboard-hero">
        <span>Welcome</span>
        <h1>{profile?.fullName ?? "DTI"}</h1>
        <p>Track field inspection readiness, safety, quality checks, scorecards, red flags, and customer-ready reports.</p>
      </section>

      <section className="dashboard-metrics">
        <div className="dashboard-card"><span>{metrics.activeJobs}</span><p>Active DTI Jobs</p></div>
        <div className="dashboard-card"><span>{metrics.reviewNeeded}</span><p>Needs Review</p></div>
        <div className="dashboard-card"><span>{metrics.closedThisWeek}</span><p>Closed This Week</p></div>
        <div className="dashboard-card"><span>{metrics.averageScore}</span><p>Average Score</p></div>
        <div className="dashboard-card"><span>{metrics.redFlags}</span><p>Open Red Flags</p></div>
      </section>

      <section className="dashboard-grid dti-main-grid">
        <section className="dashboard-card">
          <h2>Create DTI Job</h2>
          <div className="form-grid dti-create-grid">
            <label>
              Customer
              <input
                list="dti-company-list"
                value={jobForm.customer}
                onChange={(event) => setJobForm({ ...jobForm, customer: event.target.value })}
                placeholder="Customer name"
                disabled={!canEdit}
              />
              <datalist id="dti-company-list">
                {companies.map((company) => <option key={company.id} value={company.name} />)}
              </datalist>
            </label>

            <label>
              Date
              <input
                type="date"
                value={jobForm.jobDate}
                onChange={(event) => setJobForm({ ...jobForm, jobDate: event.target.value })}
                disabled={!canEdit}
              />
            </label>

            <label>
              Field Ticket #
              <input value={jobForm.fieldTicketNumber} onChange={(event) => setJobForm({ ...jobForm, fieldTicketNumber: event.target.value })} disabled={!canEdit} />
            </label>

            <label>
              Inspection Type
              <select value={jobForm.inspectionType} onChange={(event) => setJobForm({ ...jobForm, inspectionType: event.target.value })} disabled={!canEdit}>
                <option>DTI Field Inspection</option>
                <option>Cat 3 Inspection</option>
                <option>Cat 4 Inspection</option>
                <option>Cat 5 Inspection</option>
                <option>BHA Inspection</option>
                <option>Customer Audit</option>
              </select>
            </label>

            <label>
              Inspection Company
              <input value={jobForm.inspectionCompany} onChange={(event) => setJobForm({ ...jobForm, inspectionCompany: event.target.value })} disabled={!canEdit} />
            </label>

            <label>
              Rig
              <input value={jobForm.rig} onChange={(event) => setJobForm({ ...jobForm, rig: event.target.value })} disabled={!canEdit} />
            </label>

            <label>
              Operator
              <input value={jobForm.operator} onChange={(event) => setJobForm({ ...jobForm, operator: event.target.value })} disabled={!canEdit} />
            </label>

            <label>
              Lead Inspector
              <input value={jobForm.leadInspector} onChange={(event) => setJobForm({ ...jobForm, leadInspector: event.target.value })} disabled={!canEdit} />
            </label>

            <label>
              Field ERS / Superintendent
              <input value={jobForm.fieldSuperintendent} onChange={(event) => setJobForm({ ...jobForm, fieldSuperintendent: event.target.value })} disabled={!canEdit} />
            </label>

            <label>
              Pad / Location
              <input value={jobForm.padLocation} onChange={(event) => setJobForm({ ...jobForm, padLocation: event.target.value })} disabled={!canEdit} />
            </label>

            <label>
              Crew Lead
              <input value={jobForm.crewLead} onChange={(event) => setJobForm({ ...jobForm, crewLead: event.target.value })} disabled={!canEdit} />
            </label>

            <label className="full">
              Notes
              <textarea value={jobForm.notes} onChange={(event) => setJobForm({ ...jobForm, notes: event.target.value })} disabled={!canEdit} />
            </label>
          </div>

          <button className="button primary" onClick={createJob} disabled={!canEdit || saving}>
            {saving ? "Saving..." : "Create DTI Job"}
          </button>
        </section>

        <section className="dashboard-card">
          <h2>DTI Jobs</h2>
          <div className="hardband-filter-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs, rig, customer..." />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>Active</option>
              <option>All</option>
              {statusOptions.map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>

          <div className="hardband-job-list tall">
            {filteredJobs.map((job) => {
              const jobResponses = responses.filter((response) => response.dtiJobId === job.id);
              const redCount = jobResponses.filter((response) => response.redFlag || Number(response.score ?? 0) <= 2).length;
              const scoredCount = jobResponses.filter((response) => response.score).length;

              return (
                <button
                  key={job.id}
                  className={`hardband-job-button ${selectedJob?.id === job.id ? "active" : ""}`}
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <strong>{job.jobNumber}</strong>
                  <span>{job.company} / {job.status}</span>
                  <small>{job.jobDate || job.createdAt} / {scoredCount} scored / {redCount} red flags</small>
                </button>
              );
            })}

            {filteredJobs.length === 0 && <p className="muted-text">No DTI jobs match this view.</p>}
          </div>
        </section>
      </section>

      {selectedJob && (
        <section className="dashboard-card wide dti-detail-card">
          <div className="hardband-detail-header">
            <div>
              <h2>{selectedJob.jobNumber}</h2>
              <p>{selectedJob.company} / {selectedJob.status} / {selectedJob.overallResult}</p>
            </div>
            <div className="hardband-detail-actions">
              <select value={selectedJob.status} disabled={!canEdit || selectedJob.status === "Closed"} onChange={(event) => changeStatus(event.target.value as JobStatus)}>
                {statusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
              <button className="button" onClick={saveChecklist} disabled={!canEdit || selectedJob.status === "Closed" || saving}>Save Checklist</button>
              <button className="button" onClick={openPrint}>Print / PDF</button>
              <button className="button" onClick={exportCsv}>Export CSV</button>
            </div>
          </div>

          <div className="transfer-summary">
            <div><strong>Date</strong><span>{selectedJob.jobDate || "-"}</span></div>
            <div><strong>Field Ticket #</strong><span>{selectedJob.fieldTicketNumber || "-"}</span></div>
            <div><strong>Inspection Type</strong><span>{selectedJob.inspectionType || "-"}</span></div>
            <div><strong>Inspection Company</strong><span>{selectedJob.inspectionCompany || "-"}</span></div>
            <div><strong>Rig</strong><span>{selectedJob.rig || "-"}</span></div>
            <div><strong>Operator</strong><span>{selectedJob.operator || "-"}</span></div>
            <div><strong>Lead Inspector</strong><span>{selectedJob.leadInspector || "-"}</span></div>
            <div><strong>Field ERS / Superintendent</strong><span>{selectedJob.fieldSuperintendent || "-"}</span></div>
            <div><strong>Pad / Location</strong><span>{selectedJob.padLocation || "-"}</span></div>
            <div><strong>Crew Lead</strong><span>{selectedJob.crewLead || "-"}</span></div>
          </div>

          <div className="hardband-filter-row">
            <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
              <option>All Sections</option>
              <option>Pre-Job</option>
              <option>Field Inspection</option>
              <option>Crew Scorecard</option>
              <option>Summary</option>
            </select>
          </div>

          <div className="dti-checklist-list">
            {selectedResponses.map((response) => (
              <article key={response.id} className={`dti-check-row ${response.redFlag ? "red-flag" : ""}`}>
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
                  Reviewed By
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
