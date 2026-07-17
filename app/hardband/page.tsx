"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { shouldShowPageMessage } from "../../lib/pageMessages";

type PipeRange = "Range 2" | "Range 3";

type Company = {
  id: string;
  name: string;
};

type Profile = {
  fullName: string;
  role: string;
};

type HardbandJob = {
  id: string;
  jobNumber: string;
  jobSource: string;
  companyId: string;
  company: string;
  machineShopWorkOrder: string;
  fieldTicketNumber: string;
  rigNumber: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: PipeRange;
  condition: string;
  totalJoints: number;
  totalFootage: number;
  fromLocation: string;
  toLocation: string;
  wireType: string;
  operatorName: string;
  operatorSignature: string;
  status: string;
  notes: string;
  closedAt: string;
  createdAt: string;
};

type HardbandLine = {
  id: string;
  hardbandJobId: string;
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
  createdAt: string;
};

type JobForm = {
  jobSource: string;
  machineShopWorkOrder: string;
  fieldTicketNumber: string;
  customer: string;
  rigNumber: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: PipeRange;
  condition: string;
  totalJoints: string;
  wireType: string;
  status: string;
  notes: string;
};

type LineForm = {
  serialNumber: string;
  flushGrindBox: boolean;
  flushGrindPin: boolean;
  grindOutBox: boolean;
  grindOutPin: boolean;
  hardbandBox: boolean;
  hardbandPin: boolean;
  wireType: string;
  notes: string;
};

const emptyJobForm: JobForm = {
  jobSource: "field_machine_shop",
  machineShopWorkOrder: "",
  fieldTicketNumber: "",
  customer: "",
  rigNumber: "",
  afe: "",
  partNumber: "",
  size: "",
  grade: "",
  connection: "",
  pipeRange: "Range 2",
  condition: "Used",
  totalJoints: "",
  wireType: "",
  status: "Open",
  notes: "",
};

const emptyLineForm: LineForm = {
  serialNumber: "",
  flushGrindBox: false,
  flushGrindPin: false,
  grindOutBox: false,
  grindOutPin: false,
  hardbandBox: false,
  hardbandPin: false,
  wireType: "",
  notes: "",
};

const statusOptions = ["Open", "In Progress", "On Hold", "Complete", "Closed"];

function normalizePipeRange(value: string | null | undefined): PipeRange {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

function rangeFootage(joints: number, pipeRange: PipeRange) {
  return Number((joints * (pipeRange === "Range 3" ? 43.5 : 31.5)).toFixed(2));
}

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
    if (!canvas) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    const point = getPoint(event);
    if (!context) return;
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
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
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
        <span>Operator Signature</span>
        <button className="button" type="button" onClick={clear}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  );
}

export default function HardbandPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [jobs, setJobs] = useState<HardbandJob[]>([]);
  const [lines, setLines] = useState<HardbandLine[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobForm, setJobForm] = useState<JobForm>(emptyJobForm);
  const [lineForm, setLineForm] = useState<LineForm>(emptyLineForm);
  const [statusDraft, setStatusDraft] = useState("Open");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingJob, setSavingJob] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeForm, setCloseForm] = useState({ printedName: "", signature: "" });

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "active" && job.status !== "Closed") ||
        job.status === statusFilter;
      const searchMatch =
        !term ||
        [
          job.jobNumber,
          job.company,
          job.machineShopWorkOrder,
          job.fieldTicketNumber,
          job.rigNumber,
          job.partNumber,
          job.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      return statusMatch && searchMatch;
    });
  }, [jobs, search, statusFilter]);

  const selectedJob = useMemo(() => {
    return filteredJobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? null;
  }, [filteredJobs, selectedJobId]);

  const selectedJobClosed = selectedJob?.status === "Closed";

  const selectedLines = useMemo(() => {
    if (!selectedJob) return [];
    return lines
      .filter((line) => line.hardbandJobId === selectedJob.id)
      .sort((a, b) => a.lineNumber - b.lineNumber);
  }, [lines, selectedJob]);

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    if (selectedJob) setStatusDraft(selectedJob.status);
  }, [selectedJob]);

  function openCloseJob() {
    if (!selectedJob) return;
    setMessage("");
    setCloseForm({
      printedName: selectedJob.operatorName || profile?.fullName || "",
      signature: selectedJob.operatorSignature || "",
    });
    setCloseOpen(true);
  }

  async function loadPage() {
    setLoading(true);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (!userId) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();

    if (profileError || !profileData) {
      setMessage("Your profile is missing. Ask an admin to check your user setup.");
      setLoading(false);
      return;
    }

    if (profileData.role === "customer") {
      window.location.href = "/customer";
      return;
    }

    if (!["admin", "employee", "operator"].includes(profileData.role)) {
      setMessage("This user does not have Hardband access.");
      setLoading(false);
      return;
    }

    setProfile({
      fullName: profileData.full_name ?? "Hardband Operator",
      role: profileData.role,
    });

    await Promise.all([loadCompanies(), loadHardbandJobs()]);
    setLoading(false);
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

    setCompanies((data ?? []).map((row: any) => ({ id: row.id, name: row.name ?? "" })));
  }

  async function loadHardbandJobs() {
    const { data: jobData, error: jobError } = await supabase
      .from("hardband_jobs")
      .select(`
        id,
        job_number,
        job_source,
        company_id,
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
        from_location,
        to_location,
        wire_type,
        operator_name,
        operator_signature,
        status,
        notes,
        closed_at,
        created_at,
        companies(name)
      `)
      .order("created_at", { ascending: false });

    if (jobError) {
      setMessage(`Hardband jobs failed: ${jobError.message}`);
      return;
    }

    const jobIds = (jobData ?? []).map((row: any) => row.id);
    const { data: lineData, error: lineError } = jobIds.length
      ? await supabase
          .from("hardband_job_line_items")
          .select(`
            id,
            hardband_job_id,
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
            notes,
            created_at
          `)
          .in("hardband_job_id", jobIds)
          .order("line_number", { ascending: true })
      : { data: [], error: null };

    if (lineError) {
      setMessage(`Hardband line items failed: ${lineError.message}`);
      return;
    }

    const mappedJobs = (jobData ?? []).map((row: any) => {
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const pipeRange = normalizePipeRange(row.pipe_range);
      const totalJoints = Number(row.total_joints ?? 0);

      return {
        id: row.id,
        jobNumber: row.job_number ?? "",
        jobSource: row.job_source ?? "inventory",
        companyId: row.company_id ?? "",
        company: company?.name ?? "Unknown",
        machineShopWorkOrder: row.machine_shop_work_order ?? "",
        fieldTicketNumber: row.field_ticket_number ?? "",
        rigNumber: row.rig_number ?? "",
        afe: row.afe ?? "",
        partNumber: row.part_number ?? "",
        size: row.size ?? "",
        grade: row.grade ?? "",
        connection: row.connection ?? "",
        pipeRange,
        condition: row.condition ?? "",
        totalJoints,
        totalFootage: Number(row.total_footage ?? rangeFootage(totalJoints, pipeRange)),
        fromLocation: row.from_location ?? "",
        toLocation: row.to_location ?? "",
        wireType: row.wire_type ?? "",
        operatorName: row.operator_name ?? "",
        operatorSignature: row.operator_signature ?? "",
        status: row.status ?? "Open",
        notes: row.notes ?? "",
        closedAt: formatDate(row.closed_at),
        createdAt: formatDate(row.created_at),
      };
    });

    setJobs(mappedJobs);
    setLines(
      (lineData ?? []).map((row: any) => ({
        id: row.id,
        hardbandJobId: row.hardband_job_id ?? "",
        lineNumber: Number(row.line_number ?? 0),
        serialNumber: row.serial_number ?? "",
        flushGrindBox: Boolean(row.flush_grind_box),
        flushGrindPin: Boolean(row.flush_grind_pin),
        grindOutBox: Boolean(row.grind_out_box),
        grindOutPin: Boolean(row.grind_out_pin),
        hardbandBox: Boolean(row.hardband_box),
        hardbandPin: Boolean(row.hardband_pin),
        wireType: row.wire_type ?? "",
        operatorName: row.operator_name ?? "",
        notes: row.notes ?? "",
        createdAt: formatDate(row.created_at),
      }))
    );

    if (!selectedJobId && mappedJobs[0]) {
      setSelectedJobId((mappedJobs.find((job: HardbandJob) => job.status !== "Closed") ?? mappedJobs[0]).id);
    }
  }

  async function makeHardbandJobNumber() {
    const base = `HB-${ticketDateStamp()}`;
    const { data, error } = await supabase
      .from("hardband_jobs")
      .select("job_number")
      .ilike("job_number", `${base}%`);

    if (error) throw error;
    return `${base}${sequenceLetter((data ?? []).length)}`;
  }

  async function findOrCreateCompany(name: string) {
    const customerName = name.trim();
    if (!customerName) throw new Error("Customer is required.");

    const existing = companies.find(
      (company) => company.name.toLowerCase() === customerName.toLowerCase()
    );

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("companies")
      .insert({ name: customerName, is_active: true })
      .select("id")
      .single();

    if (error) {
      const { data: retry } = await supabase
        .from("companies")
        .select("id")
        .ilike("name", customerName)
        .maybeSingle();
      if (retry?.id) return retry.id;
      throw error;
    }

    await loadCompanies();
    return data.id as string;
  }

  async function createJob() {
    setMessage("");

    if (!jobForm.customer.trim()) {
      setMessage("Customer is required.");
      return;
    }

    if (!jobForm.partNumber.trim()) {
      setMessage("Part number is required.");
      return;
    }

    const joints = Number(jobForm.totalJoints || 0);
    if (joints <= 0) {
      setMessage("Total joints must be greater than zero.");
      return;
    }

    setSavingJob(true);

    try {
      const companyId = await findOrCreateCompany(jobForm.customer);
      const jobNumber = await makeHardbandJobNumber();
      const footage = rangeFootage(joints, jobForm.pipeRange);

      const { data, error } = await supabase
        .from("hardband_jobs")
        .insert({
          job_number: jobNumber,
          job_source: jobForm.jobSource,
          company_id: companyId,
          machine_shop_work_order: jobForm.machineShopWorkOrder || null,
          field_ticket_number: jobForm.fieldTicketNumber || null,
          rig_number: jobForm.rigNumber || null,
          afe: jobForm.afe || null,
          part_number: jobForm.partNumber.trim(),
          size: jobForm.size || null,
          grade: jobForm.grade || null,
          connection: jobForm.connection || null,
          pipe_range: jobForm.pipeRange,
          condition: jobForm.condition || null,
          total_joints: joints,
          total_footage: footage,
          from_location: jobForm.jobSource === "inventory" ? "TITAN Inventory" : "Field/Machine Shop",
          to_location: "Hardband",
          wire_type: jobForm.wireType || null,
          status: jobForm.status,
          notes: jobForm.notes || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      setJobForm(emptyJobForm);
      await loadHardbandJobs();
      setSelectedJobId(data.id);
      setMessage(`Hardband job ${jobNumber} created.`);
    } catch (error: any) {
      setMessage(`Create job failed: ${error.message}`);
    } finally {
      setSavingJob(false);
    }
  }

  async function updateJobStatus(nextStatus = statusDraft) {
    if (!selectedJob) return;
    setMessage("");

    if (nextStatus === "Closed") {
      openCloseJob();
      return;
    }

    const { error } = await supabase
      .from("hardband_jobs")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedJob.id);

    if (error) {
      setMessage(`Status update failed: ${error.message}`);
      return;
    }

    await loadHardbandJobs();
    setMessage(`${selectedJob.jobNumber} status changed to ${nextStatus}.`);
  }

  async function closeSelectedJob() {
    if (!selectedJob) return;
    setMessage("");

    const printedName = closeForm.printedName.trim();
    if (!printedName) {
      setMessage("Printed operator name is required to close the job.");
      return;
    }

    if (!closeForm.signature) {
      setMessage("Operator signature is required to close the job.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase
      .from("hardband_jobs")
      .update({
        status: "Closed",
        operator_name: printedName,
        operator_signature: closeForm.signature,
        closed_at: new Date().toISOString(),
        closed_by: sessionData.session?.user.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedJob.id);

    if (error) {
      setMessage(`Close job failed: ${error.message}`);
      return;
    }

    setCloseOpen(false);
    await loadHardbandJobs();
    setSelectedJobId("");
    setStatusFilter("active");
    setMessage(`${selectedJob.jobNumber} closed by ${printedName}.`);
  }

  async function addLineItem() {
    if (!selectedJob) return;
    setMessage("");

    if (!lineForm.serialNumber.trim()) {
      setMessage("Serial number is required.");
      return;
    }

    setSavingLine(true);

    try {
      const nextLineNumber =
        selectedLines.length > 0 ? Math.max(...selectedLines.map((line) => line.lineNumber)) + 1 : 1;

      const { error } = await supabase.from("hardband_job_line_items").insert({
        hardband_job_id: selectedJob.id,
        line_number: nextLineNumber,
        serial_number: lineForm.serialNumber.trim(),
        flush_grind_box: lineForm.flushGrindBox,
        flush_grind_pin: lineForm.flushGrindPin,
        grind_out_box: lineForm.grindOutBox,
        grind_out_pin: lineForm.grindOutPin,
        hardband_box: lineForm.hardbandBox,
        hardband_pin: lineForm.hardbandPin,
        wire_type: lineForm.wireType || selectedJob.wireType || null,
        operator_name: profile?.fullName || null,
        notes: lineForm.notes || null,
      });

      if (error) throw error;

      setLineForm(emptyLineForm);
      await loadHardbandJobs();
      setMessage(`Serial number added to ${selectedJob.jobNumber}.`);
    } catch (error: any) {
      setMessage(`Line item failed: ${error.message}`);
    } finally {
      setSavingLine(false);
    }
  }

  function exportSelectedJob() {
    if (!selectedJob) return;

    const rows = [
      [
        "Job Number",
        "Status",
        "Customer",
        "Machine Shop W/O #",
        "Field Ticket #",
        "Rig #",
        "TU#",
        "Part Number",
        "Size",
        "Grade",
        "Connection",
        "Range",
        "Condition",
        "Total Joints",
        "Total Footage",
        "Serial Number",
        "Flush Grind Box",
        "Flush Grind Pin",
        "Grind Out Box",
        "Grind Out Pin",
        "Hardband Box",
        "Hardband Pin",
        "Wire",
        "Operator",
        "Line Notes",
      ],
      ...selectedLines.map((line) => [
        selectedJob.jobNumber,
        selectedJob.status,
        selectedJob.company,
        selectedJob.machineShopWorkOrder,
        selectedJob.fieldTicketNumber,
        selectedJob.rigNumber,
        selectedJob.afe,
        selectedJob.partNumber,
        selectedJob.size,
        selectedJob.grade,
        selectedJob.connection,
        selectedJob.pipeRange,
        selectedJob.condition,
        selectedJob.totalJoints,
        selectedJob.totalFootage,
        line.serialNumber,
        line.flushGrindBox ? "Yes" : "No",
        line.flushGrindPin ? "Yes" : "No",
        line.grindOutBox ? "Yes" : "No",
        line.grindOutPin ? "Yes" : "No",
        line.hardbandBox ? "Yes" : "No",
        line.hardbandPin ? "Yes" : "No",
        line.wireType,
        line.operatorName,
        line.notes,
      ]),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedJob.jobNumber}-hardband-report.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 250);
    setMessage(`${selectedJob.jobNumber} CSV export downloaded.`);
  }

  function openSelectedJobReport() {
    if (!selectedJob) return;
    window.location.href = `/hardband/print?id=${encodeURIComponent(selectedJob.id)}`;
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main className="hardband-shell">
        <section className="ticket-card">Loading Hardband work orders...</section>
      </main>
    );
  }

  const showPageMessage = shouldShowPageMessage(message);

  return (
    <main className="hardband-shell">
      <header className="hardband-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">Hardband Work Orders</div>
            <div className="brand-subtitle">Jobs, serial numbers, status, and customer reports</div>
          </div>
        </button>
        <div className="hardband-header-actions">
          {profile?.role !== "operator" && (
            <button className="button" onClick={() => (window.location.href = "/")}>
              Yard View
            </button>
          )}
          <button className="button" onClick={loadPage}>Refresh</button>
          <button className="button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      <section className="customer-welcome simple-welcome hardband-welcome">
        <span>Welcome</span>
        <h1>{profile?.fullName}</h1>
        <p>Create and close out Hardband jobs with every serial number tied to the work order.</p>
      </section>

      {showPageMessage && <div className="modal-message">{message}</div>}

      <section className="hardband-work-order-grid">
        <section className="ticket-card">
          <h2>Create Job</h2>
          <div className="form-grid">
            <label>
              Job Source
              <select value={jobForm.jobSource} onChange={(event) => setJobForm({ ...jobForm, jobSource: event.target.value })}>
                <option value="field_machine_shop">Field/Machine Shop</option>
                <option value="inventory">TITAN Inventory</option>
              </select>
            </label>

            <label>
              Machine Shop W/O #
              <input value={jobForm.machineShopWorkOrder} onChange={(event) => setJobForm({ ...jobForm, machineShopWorkOrder: event.target.value })} />
            </label>

            <label>
              Field Ticket #
              <input value={jobForm.fieldTicketNumber} onChange={(event) => setJobForm({ ...jobForm, fieldTicketNumber: event.target.value })} />
            </label>

            <label>
              Customer
              <input
                list="hardband-company-options"
                value={jobForm.customer}
                onChange={(event) => setJobForm({ ...jobForm, customer: event.target.value })}
                placeholder="Select or type customer"
              />
              <datalist id="hardband-company-options">
                {companies.map((company) => (
                  <option key={company.id} value={company.name} />
                ))}
              </datalist>
            </label>

            <label>
              Rig #
              <input value={jobForm.rigNumber} onChange={(event) => setJobForm({ ...jobForm, rigNumber: event.target.value })} />
            </label>

            <label>
              TU#
              <input value={jobForm.afe} onChange={(event) => setJobForm({ ...jobForm, afe: event.target.value })} />
            </label>

            <label className="full">
              Part Number
              <input value={jobForm.partNumber} onChange={(event) => setJobForm({ ...jobForm, partNumber: event.target.value })} />
            </label>

            <label>
              Size
              <input value={jobForm.size} onChange={(event) => setJobForm({ ...jobForm, size: event.target.value })} />
            </label>

            <label>
              Grade
              <input value={jobForm.grade} onChange={(event) => setJobForm({ ...jobForm, grade: event.target.value })} />
            </label>

            <label>
              Connection
              <input value={jobForm.connection} onChange={(event) => setJobForm({ ...jobForm, connection: event.target.value })} />
            </label>

            <label>
              Range
              <select value={jobForm.pipeRange} onChange={(event) => setJobForm({ ...jobForm, pipeRange: normalizePipeRange(event.target.value) })}>
                <option>Range 2</option>
                <option>Range 3</option>
              </select>
            </label>

            <label>
              Condition
              <input value={jobForm.condition} onChange={(event) => setJobForm({ ...jobForm, condition: event.target.value })} />
            </label>

            <label>
              Total Joints
              <input type="number" min="0" value={jobForm.totalJoints} onChange={(event) => setJobForm({ ...jobForm, totalJoints: event.target.value })} />
            </label>

            <label>
              Calculated Footage
              <input value={rangeFootage(Number(jobForm.totalJoints || 0), jobForm.pipeRange).toLocaleString()} readOnly />
            </label>

            <label>
              Wire Type
              <input value={jobForm.wireType} onChange={(event) => setJobForm({ ...jobForm, wireType: event.target.value })} placeholder="Example: Arnco 350XT" />
            </label>

            <label>
              Status
              <select value={jobForm.status} onChange={(event) => setJobForm({ ...jobForm, status: event.target.value })}>
                {statusOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="full">
              Notes
              <textarea value={jobForm.notes} onChange={(event) => setJobForm({ ...jobForm, notes: event.target.value })} />
            </label>
          </div>

          <div className="slide-actions">
            <button className="button" onClick={() => setJobForm(emptyJobForm)}>Clear</button>
            <button className="button primary" onClick={createJob} disabled={savingJob}>
              {savingJob ? "Creating..." : "Create Hardband Job"}
            </button>
          </div>
        </section>

        <section className="ticket-card">
          <div className="section-heading">
            <h2>Jobs</h2>
            <p>{filteredJobs.length} visible / {jobs.length} total</p>
          </div>

          <div className="hardband-filter-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, job, W/O, rig, part..." />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="active">Active Jobs</option>
              <option value="all">All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="hardband-job-list tall">
            {filteredJobs.map((job) => (
              <button
                key={job.id}
                className={`hardband-job-button ${selectedJob?.id === job.id ? "active" : ""}`}
                onClick={() => setSelectedJobId(job.id)}
              >
                <strong>{job.jobNumber}</strong>
                <span>{job.company}</span>
                <small>{job.status} / {job.totalJoints.toLocaleString()} joints / {job.partNumber || "No part"}</small>
              </button>
            ))}
            {filteredJobs.length === 0 && <p className="muted-text">No Hardband jobs match the current filters.</p>}
          </div>
        </section>
      </section>

      {selectedJob && (
        <section className="ticket-card hardband-detail-card">
          <div className="hardband-detail-header">
            <div>
              <h2>{selectedJob.jobNumber}</h2>
              <p>{selectedJob.company} / {selectedJob.status} / {selectedLines.length} serial lines</p>
            </div>
            <div className="hardband-detail-actions">
              {!selectedJobClosed && (
                <>
                  <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
                    {statusOptions.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                  <button className="button" onClick={() => updateJobStatus(statusDraft)}>Save Status</button>
                  <button className="button" onClick={openCloseJob}>Close Job</button>
                </>
              )}
              <button className="button" onClick={openSelectedJobReport}>Print / PDF</button>
              <button className="button" onClick={exportSelectedJob}>Export CSV</button>
            </div>
          </div>

          <div className="detail-grid">
            <div><strong>Source</strong><span>{selectedJob.jobSource === "inventory" ? "TITAN Inventory" : "Field/Machine Shop"}</span></div>
            <div><strong>Machine Shop W/O #</strong><span>{selectedJob.machineShopWorkOrder || "-"}</span></div>
            <div><strong>Field Ticket #</strong><span>{selectedJob.fieldTicketNumber || "-"}</span></div>
            <div><strong>Rig #</strong><span>{selectedJob.rigNumber || "-"}</span></div>
            <div><strong>TU#</strong><span>{selectedJob.afe || "-"}</span></div>
            <div><strong>Part Number</strong><span>{selectedJob.partNumber || "-"}</span></div>
            <div><strong>Size</strong><span>{selectedJob.size || "-"}</span></div>
            <div><strong>Grade</strong><span>{selectedJob.grade || "-"}</span></div>
            <div><strong>Connection</strong><span>{selectedJob.connection || "-"}</span></div>
            <div><strong>Range</strong><span>{selectedJob.pipeRange}</span></div>
            <div><strong>Condition</strong><span>{selectedJob.condition || "-"}</span></div>
            <div><strong>Wire</strong><span>{selectedJob.wireType || "-"}</span></div>
            <div><strong>Total Joints</strong><span>{selectedJob.totalJoints.toLocaleString()}</span></div>
            <div><strong>Total Footage</strong><span>{selectedJob.totalFootage.toLocaleString()}</span></div>
            <div><strong>Closed</strong><span>{selectedJob.closedAt || "-"}</span></div>
          </div>

          <section className="nested-card">
            <h3>Serial Number Line Items</h3>
            <div className="table-wrap">
              <table>
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
                  {selectedLines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.lineNumber}</td>
                      <td>{line.serialNumber}</td>
                      <td>{line.flushGrindBox ? "Yes" : "-"}</td>
                      <td>{line.flushGrindPin ? "Yes" : "-"}</td>
                      <td>{line.grindOutBox ? "Yes" : "-"}</td>
                      <td>{line.grindOutPin ? "Yes" : "-"}</td>
                      <td>{line.hardbandBox ? "Yes" : "-"}</td>
                      <td>{line.hardbandPin ? "Yes" : "-"}</td>
                      <td>{line.wireType || "-"}</td>
                      <td>{line.operatorName || "-"}</td>
                      <td>{line.notes || "-"}</td>
                    </tr>
                  ))}
                  {selectedLines.length === 0 && (
                    <tr>
                      <td colSpan={11} className="empty-cell">No serial numbers have been added to this job yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {selectedJobClosed ? (
            <section className="nested-card">
              <h3>Closed Job</h3>
              <p className="muted-text">
                This job is closed and locked from additional serial entry. Use Print / PDF or Export CSV to view the completed record.
              </p>
            </section>
          ) : (
            <section className="nested-card">
              <h3>Add Serial Number</h3>
              <div className="form-grid">
                <label>
                  Serial Number
                  <input value={lineForm.serialNumber} onChange={(event) => setLineForm({ ...lineForm, serialNumber: event.target.value })} />
                </label>

                <label>
                  Wire Type
                  <input value={lineForm.wireType} onChange={(event) => setLineForm({ ...lineForm, wireType: event.target.value })} placeholder={selectedJob.wireType || "Wire used"} />
                </label>

                <label>
                  Operator
                  <input value={profile?.fullName || "Logged-in operator"} readOnly />
                </label>

                <div className="checkbox-grid full">
                  <label><input type="checkbox" checked={lineForm.flushGrindBox} onChange={(event) => setLineForm({ ...lineForm, flushGrindBox: event.target.checked })} /> Flush Grind Box</label>
                  <label><input type="checkbox" checked={lineForm.flushGrindPin} onChange={(event) => setLineForm({ ...lineForm, flushGrindPin: event.target.checked })} /> Flush Grind Pin</label>
                  <label><input type="checkbox" checked={lineForm.grindOutBox} onChange={(event) => setLineForm({ ...lineForm, grindOutBox: event.target.checked })} /> Grind Out Box</label>
                  <label><input type="checkbox" checked={lineForm.grindOutPin} onChange={(event) => setLineForm({ ...lineForm, grindOutPin: event.target.checked })} /> Grind Out Pin</label>
                  <label><input type="checkbox" checked={lineForm.hardbandBox} onChange={(event) => setLineForm({ ...lineForm, hardbandBox: event.target.checked })} /> Hardband Box</label>
                  <label><input type="checkbox" checked={lineForm.hardbandPin} onChange={(event) => setLineForm({ ...lineForm, hardbandPin: event.target.checked })} /> Hardband Pin</label>
                </div>

                <label className="full">
                  Notes
                  <textarea value={lineForm.notes} onChange={(event) => setLineForm({ ...lineForm, notes: event.target.value })} />
                </label>
              </div>

              <div className="slide-actions">
                <button className="button" onClick={() => setLineForm(emptyLineForm)}>Clear</button>
                <button className="button primary" onClick={addLineItem} disabled={savingLine}>
                  {savingLine ? "Saving..." : "Add Serial Line"}
                </button>
              </div>
            </section>
          )}
        </section>
      )}

      {closeOpen && selectedJob && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>Close Hardband Job</h2>
                <p>{selectedJob.jobNumber} / {selectedJob.company}</p>
              </div>
              <button className="icon-button" onClick={() => setCloseOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="form-grid">
              <label className="full">
                Printed Operator Name
                <input
                  value={closeForm.printedName}
                  onChange={(event) => setCloseForm({ ...closeForm, printedName: event.target.value })}
                  placeholder={profile?.fullName || "Operator name"}
                />
              </label>

              <div className="full">
                <SignaturePad
                  value={closeForm.signature}
                  onChange={(value) => setCloseForm({ ...closeForm, signature: value })}
                />
              </div>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => setCloseOpen(false)}>Cancel</button>
              <button className="button primary" onClick={closeSelectedJob}>Close Job</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
