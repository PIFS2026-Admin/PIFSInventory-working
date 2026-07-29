"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { shouldShowPageMessage } from "../../../lib/pageMessages";
import { goBackOrFallback } from "../../../lib/navigation";
import { DtiManagementStyles } from "../DtiManagementStyles";

type UserRole =
  | "admin"
  | "employee"
  | "sales"
  | "customer"
  | "operator"
  | "dti_superintendent"
  | "dti_lead"
  | "dti_inspector";

type InspectorRole = "lead_inspector" | "level_2_inspector" | "crew_lead" | "both";

type Profile = {
  id: string;
  fullName: string;
  role: UserRole;
};

type Company = {
  id: string;
  name: string;
};

type Inspector = {
  id: string;
  fullName: string;
  role: InspectorRole;
  isActive: boolean;
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

type TemplateRow = {
  section: string;
  category: string;
  requirement: string;
  definition: string;
  priority: string;
  weight: number | null;
  sortOrder: number;
};

type DbRecord = Record<string, unknown>;

const DTI_MANAGEMENT_ROLES: UserRole[] = ["admin", "employee", "dti_superintendent", "dti_lead"];

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

const fallbackTemplateRows: TemplateRow[] = [
  {
    section: "Pre-Job",
    category: "Job Confirmation",
    requirement: "Job confirmed with Operator / CM",
    definition: "Scope, timing, location, and joint count verified before crew arrival.",
    priority: "High",
    weight: null,
    sortOrder: 1,
  },
  {
    section: "Pre-Job",
    category: "Crew Readiness",
    requirement: "Crew confirmed",
    definition: "Lead inspector, crew count, and start time confirmed.",
    priority: "High",
    weight: null,
    sortOrder: 2,
  },
  {
    section: "Field Inspection",
    category: "Safety",
    requirement: "JSA completed",
    definition: "JSA signed by all crew before work starts.",
    priority: "High",
    weight: null,
    sortOrder: 3,
  },
  {
    section: "Summary",
    category: "Closeout",
    requirement: "Final review complete",
    definition: "Superintendent reviewed checklist, red flags, scorecard, and customer concerns.",
    priority: "High",
    weight: null,
    sortOrder: 4,
  },
];

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

function templateKey(row: TemplateRow) {
  return `${row.section}::${row.category}::${row.requirement}`.toLowerCase();
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function CreateDtiJobPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>(fallbackTemplateRows);
  const [jobForm, setJobForm] = useState<JobForm>(emptyJobForm);
  const [jobNumberPreview, setJobNumberPreview] = useState("");
  const [message, setMessage] = useState("Loading DTI job form...");
  const [saving, setSaving] = useState(false);

  const canEdit = profile ? DTI_MANAGEMENT_ROLES.includes(profile.role) : false;
  const showPageMessage = shouldShowPageMessage(message);

  const leadInspectorOptions = useMemo(
    () =>
      inspectors.filter(
        (inspector) => inspector.isActive && (inspector.role === "lead_inspector" || inspector.role === "both")
      ),
    [inspectors]
  );

  const crewLeadOptions = useMemo(
    () =>
      inspectors.filter(
        (inspector) =>
          inspector.isActive &&
          (inspector.role === "level_2_inspector" || inspector.role === "crew_lead" || inspector.role === "both")
      ),
    [inspectors]
  );

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    updateJobNumberPreview();
  }, [jobForm.jobDate]);

  async function loadPage() {
    setMessage("Loading DTI job form...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role")
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
    };

    if (loadedProfile.role === "customer") {
      window.location.href = "/customer";
      return;
    }

    if (loadedProfile.role === "dti_inspector") {
      window.location.href = "/dti-summary";
      return;
    }

    if (!DTI_MANAGEMENT_ROLES.includes(loadedProfile.role)) {
      window.location.href = "/home";
      return;
    }

    setProfile(loadedProfile);
    await Promise.all([loadCompanies(), loadInspectors(), loadTemplateRows()]);
    setMessage("");
  }

  async function loadCompanies() {
    const { data, error } = await supabase.from("companies").select("id, name").order("name", { ascending: true });
    if (error) {
      setMessage(`Companies failed: ${error.message}`);
      return;
    }
    setCompanies(
      ((data ?? []) as DbRecord[]).map((company) => ({
        id: textValue(company.id),
        name: textValue(company.name),
      }))
    );
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

    setInspectors(
      ((data ?? []) as DbRecord[]).map((inspector) => ({
        id: textValue(inspector.id),
        fullName: textValue(inspector.full_name),
        role: (textValue(inspector.role) || "lead_inspector") as InspectorRole,
        isActive: Boolean(inspector.is_active),
      }))
    );
  }

  async function loadTemplateRows() {
    const { data: configuredRows, error: configuredError } = await supabase
      .from("dti_grading_items")
      .select("section, category, requirement, definition, priority, weight, display_order, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (!configuredError && configuredRows?.length) {
      setTemplateRows(
        (configuredRows as DbRecord[]).map((row, index: number) => ({
          section: textValue(row.section) || "General",
          category: textValue(row.category),
          requirement: textValue(row.requirement) || "Checklist item",
          definition: textValue(row.definition),
          priority: textValue(row.priority) || "Standard",
          weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
          sortOrder: Number(row.display_order ?? index + 1),
        }))
      );
      return;
    }

    const { data: responseRows } = await supabase
      .from("dti_checklist_responses")
      .select("section, category, requirement, definition, priority, weight, sort_order")
      .order("sort_order", { ascending: true })
      .limit(1000);

    const deduped = new Map<string, TemplateRow>();
    ((responseRows ?? []) as DbRecord[]).forEach((row, index: number) => {
      const templateRow: TemplateRow = {
        section: textValue(row.section) || "General",
        category: textValue(row.category),
        requirement: textValue(row.requirement) || "Checklist item",
        definition: textValue(row.definition),
        priority: textValue(row.priority) || "Standard",
        weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
        sortOrder: Number(row.sort_order ?? index + 1),
      };
      if (!deduped.has(templateKey(templateRow))) deduped.set(templateKey(templateRow), templateRow);
    });

    if (deduped.size) {
      setTemplateRows([...deduped.values()].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  }

  async function updateJobNumberPreview() {
    try {
      setJobNumberPreview(await makeDtiJobNumber(jobForm.jobDate));
    } catch {
      setJobNumberPreview("Will assign on save");
    }
  }

  async function findOrCreateCompany(name: string) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Customer is required.");

    const existing = companies.find((company) => company.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) return existing.id;

    const { data, error } = await supabase.from("companies").insert({ name: cleanName }).select("id, name").single();
    if (error) throw error;
    await loadCompanies();
    return data.id as string;
  }

  async function makeDtiJobNumber(jobDate: string, blockedJobNumbers = new Set<string>()) {
    const date = jobDate ? new Date(`${jobDate}T12:00:00`) : new Date();
    const base = `DTI-${ticketDateStamp(date)}`;
    const { data, error } = await supabase.from("dti_jobs").select("job_number").ilike("job_number", `${base}%`);
    if (error) throw error;

    const usedJobNumbers = new Set(
      [...(data ?? []).map((row) => String(row.job_number ?? "")), ...Array.from(blockedJobNumbers)].filter(
        (jobNumber) => jobNumber.startsWith(base)
      )
    );

    for (let index = 0; index < 702; index += 1) {
      const candidate = `${base}${sequenceLetter(index)}`;
      if (!usedJobNumbers.has(candidate)) return candidate;
    }

    throw new Error(`No DTI job number remains available for ${base}.`);
  }

  async function createJob() {
    if (!canEdit || !profile || saving) return;

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
      const rows = templateRows.map((item, index) => ({
        dti_job_id: job.id,
        section: item.section,
        category: item.category,
        requirement: item.requirement,
        definition: item.definition,
        priority: item.priority,
        weight: item.weight,
        sort_order: item.sortOrder || index + 1,
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

      window.location.href = `/dti?job=${job.id}`;
    } catch (error: unknown) {
      if (createdJobId) await supabase.from("dti_jobs").delete().eq("id", createdJobId);
      setMessage(`Create DTI job failed while ${stage}: ${errorMessage(error)}`);
      setSaving(false);
    }
  }

  return (
    <main className="dashboard-shell dti-shell">
      <DtiManagementStyles />
      <header className="dashboard-header titan-page-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">Create DTI Job</div>
            <div className="brand-subtitle">DTI Management</div>
          </div>
        </button>

        <div className="dashboard-actions">
          <button className="button" type="button" onClick={() => goBackOrFallback("/dti")}>Back to DTI Management</button>
          <button className="button" type="button" onClick={() => (window.location.href = "/home")}>TITAN Home</button>
        </div>
      </header>

      {showPageMessage && <div className="modal-message">{message}</div>}

      <section className="dashboard-hero">
        <span>DTI Management</span>
        <h1>Create DTI Job</h1>
        <p>Open the field job, assign the inspectors, and seed the scorecard in one clean step.</p>
      </section>

      <section className="dashboard-card wide dti-create-page-card">
        <div className="section-heading">
          <div>
            <h2>Job Setup</h2>
            <p>Generated job number: <strong>{jobNumberPreview || "Loading..."}</strong></p>
          </div>
          <span className="dti-pill">{templateRows.length} scorecard items</span>
        </div>

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
            <input type="date" value={jobForm.jobDate} onChange={(event) => setJobForm({ ...jobForm, jobDate: event.target.value })} disabled={!canEdit} />
          </label>

          <label>
            Field Ticket Number
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
            <select value={jobForm.leadInspector} onChange={(event) => setJobForm({ ...jobForm, leadInspector: event.target.value })} disabled={!canEdit}>
              <option value="">Select lead inspector</option>
              {leadInspectorOptions.map((inspector) => <option key={inspector.id} value={inspector.fullName}>{inspector.fullName}</option>)}
            </select>
          </label>

          <label>
            Field Engineer / Superintendent
            <input value={jobForm.fieldSuperintendent} onChange={(event) => setJobForm({ ...jobForm, fieldSuperintendent: event.target.value })} disabled={!canEdit} />
          </label>

          <label>
            Pad / Location
            <input value={jobForm.padLocation} onChange={(event) => setJobForm({ ...jobForm, padLocation: event.target.value })} disabled={!canEdit} />
          </label>

          <label>
            Level 2 Inspector
            <select value={jobForm.crewLead} onChange={(event) => setJobForm({ ...jobForm, crewLead: event.target.value })} disabled={!canEdit}>
              <option value="">Select Level 2 Inspector</option>
              {crewLeadOptions.map((inspector) => <option key={inspector.id} value={inspector.fullName}>{inspector.fullName}</option>)}
            </select>
          </label>

          <label>
            Status
            <input value="Open" disabled />
          </label>

          <label className="full">
            Notes
            <textarea value={jobForm.notes} onChange={(event) => setJobForm({ ...jobForm, notes: event.target.value })} disabled={!canEdit} />
          </label>
        </div>

        <div className="dashboard-actions dti-create-actions">
          <button className="button" type="button" onClick={() => (window.location.href = "/dti")}>Cancel</button>
          <button className="button primary" type="button" onClick={createJob} disabled={!canEdit || saving}>
            {saving ? "Saving..." : "Create DTI Job"}
          </button>
        </div>
      </section>
    </main>
  );
}
