"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Role = "admin" | "employee" | "sales" | "customer" | "operator" | "dti_superintendent" | "dti_inspector";

type Profile = {
  id: string;
  fullName: string;
  role: Role;
};

type SummaryForm = {
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
  totalJointsInspected: string;
  totalDamages: string;
  damageSeatBox: string;
  damageSeatPin: string;
  damageThreadsBox: string;
  damageThreadsPin: string;
  shortBox: string;
  damagedHardbandBox: string;
  damagedHardbandPin: string;
  bentTube: string;
  damageOther: string;
  damageOtherDescription: string;
  damageOtherQuantity: string;
  damageNotes: string;
  totalDbr: string;
  minTongBox: string;
  minTongPin: string;
  tstrBox: string;
  tstrPin: string;
  emi: string;
  damagedTube: string;
  minWall: string;
  dbrOther: string;
  dbrOtherDescription: string;
  dbrOtherQuantity: string;
  dbrNotes: string;
  totalRefaces: string;
  refacePin: string;
  refaceBox: string;
  totalHardbands: string;
  hardbandPin: string;
  hardbandBox: string;
  repairJoints: string;
  dbrJoints: string;
  hbJoints: string;
  repairHbJoints: string;
  remarks: string;
  inspectedBy: string;
  status: string;
  inspectionReportName: string;
  inspectionReportUrl: string;
};

type JobStatus = "Open" | "In Progress" | "Review" | "Closed";

type DtiJob = {
  id: string;
  jobNumber: string;
  operator: string;
  leadInspector: string;
  status: JobStatus;
};

type ChecklistResponse = {
  id: string;
  dtiJobId: string;
  section: string;
  category: string;
  score: number | null;
  redFlag: boolean;
};

const editableRoles: Role[] = ["admin", "dti_superintendent", "dti_inspector"];
const readableRoles: Role[] = ["admin", "dti_superintendent", "dti_inspector"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeRole(role: unknown): Role {
  const value = typeof role === "string" ? role.toLowerCase() : "customer";
  if (value === "admin" || value === "employee" || value === "sales" || value === "operator" || value === "dti_superintendent" || value === "dti_inspector") {
    return value;
  }
  return "customer";
}

function blankForm(profileName = ""): SummaryForm {
  return {
    id: "",
    summaryNumber: "",
    operator: "",
    contractor: "",
    location: "",
    summaryDate: today(),
    fieldInvoice: "",
    pageNumber: "1",
    pageTotal: "1",
    inspectionType: "",
    connectionSizeType: "",
    totalJointsInspected: "",
    totalDamages: "",
    damageSeatBox: "",
    damageSeatPin: "",
    damageThreadsBox: "",
    damageThreadsPin: "",
    shortBox: "",
    damagedHardbandBox: "",
    damagedHardbandPin: "",
    bentTube: "",
    damageOther: "",
    damageOtherDescription: "",
    damageOtherQuantity: "",
    damageNotes: "",
    totalDbr: "",
    minTongBox: "",
    minTongPin: "",
    tstrBox: "",
    tstrPin: "",
    emi: "",
    damagedTube: "",
    minWall: "",
    dbrOther: "",
    dbrOtherDescription: "",
    dbrOtherQuantity: "",
    dbrNotes: "",
    totalRefaces: "",
    refacePin: "",
    refaceBox: "",
    totalHardbands: "",
    hardbandPin: "",
    hardbandBox: "",
    repairJoints: "",
    dbrJoints: "",
    hbJoints: "",
    repairHbJoints: "",
    remarks: "",
    inspectedBy: profileName,
    status: "Draft",
    inspectionReportName: "",
    inspectionReportUrl: "",
  };
}

function readText(value: unknown) {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function readNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function mapRow(row: any): SummaryForm {
  return {
    id: readText(row.id),
    summaryNumber: readText(row.summary_number),
    operator: readText(row.operator),
    contractor: readText(row.contractor),
    location: readText(row.location),
    summaryDate: readText(row.summary_date) || today(),
    fieldInvoice: readText(row.field_invoice),
    pageNumber: readText(row.page_number),
    pageTotal: readText(row.page_total),
    inspectionType: readText(row.inspection_type),
    connectionSizeType: readText(row.connection_size_type),
    totalJointsInspected: readNumber(row.total_joints_inspected),
    totalDamages: readNumber(row.total_damages),
    damageSeatBox: readNumber(row.damage_seat_box),
    damageSeatPin: readNumber(row.damage_seat_pin),
    damageThreadsBox: readNumber(row.damage_threads_box),
    damageThreadsPin: readNumber(row.damage_threads_pin),
    shortBox: readNumber(row.short_box),
    damagedHardbandBox: readNumber(row.damaged_hardband_box ?? row.short_box),
    damagedHardbandPin: readNumber(row.damaged_hardband_pin),
    bentTube: readNumber(row.bent_tube),
    damageOther: readText(row.damage_other),
    damageOtherDescription: readText(row.damage_other_description ?? row.damage_other),
    damageOtherQuantity: readNumber(row.damage_other_quantity),
    damageNotes: readText(row.damage_notes),
    totalDbr: readNumber(row.total_dbr),
    minTongBox: readNumber(row.min_tong_box),
    minTongPin: readNumber(row.min_tong_pin),
    tstrBox: readNumber(row.tstr_box),
    tstrPin: readNumber(row.tstr_pin),
    emi: readNumber(row.emi),
    damagedTube: readNumber(row.damaged_tube),
    minWall: readNumber(row.min_wall),
    dbrOther: readText(row.dbr_other),
    dbrOtherDescription: readText(row.dbr_other_description ?? row.dbr_other),
    dbrOtherQuantity: readNumber(row.dbr_other_quantity),
    dbrNotes: readText(row.dbr_notes),
    totalRefaces: readNumber(row.total_refaces),
    refacePin: readNumber(row.reface_pin),
    refaceBox: readNumber(row.reface_box),
    totalHardbands: readNumber(row.total_hardbands),
    hardbandPin: readNumber(row.hardband_pin),
    hardbandBox: readNumber(row.hardband_box),
    repairJoints: readNumber(row.repair_joints),
    dbrJoints: readNumber(row.dbr_joints),
    hbJoints: readNumber(row.hb_joints),
    repairHbJoints: readNumber(row.repair_hb_joints),
    remarks: readText(row.remarks),
    inspectedBy: readText(row.inspected_by),
    status: readText(row.status) || "Draft",
    inspectionReportName: readText(row.inspection_report_name),
    inspectionReportUrl: readText(row.inspection_report_url),
  };
}

function buildPayload(form: SummaryForm, profileId: string, summaryNumber: string) {
  return {
    summary_number: summaryNumber,
    operator: form.operator || null,
    contractor: form.contractor || null,
    location: form.location || null,
    summary_date: form.summaryDate || today(),
    field_invoice: form.fieldInvoice || null,
    page_number: form.pageNumber || null,
    page_total: form.pageTotal || null,
    inspection_type: form.inspectionType || null,
    connection_size_type: form.connectionSizeType || null,
    total_joints_inspected: numberValue(form.totalJointsInspected),
    total_damages: numberValue(form.totalDamages),
    damage_seat_box: numberValue(form.damageSeatBox),
    damage_seat_pin: numberValue(form.damageSeatPin),
    damage_threads_box: numberValue(form.damageThreadsBox),
    damage_threads_pin: numberValue(form.damageThreadsPin),
    short_box: numberValue(form.damagedHardbandBox || form.shortBox),
    damaged_hardband_box: numberValue(form.damagedHardbandBox || form.shortBox),
    damaged_hardband_pin: numberValue(form.damagedHardbandPin),
    bent_tube: numberValue(form.bentTube),
    damage_other: form.damageOtherDescription || form.damageOther || null,
    damage_other_description: form.damageOtherDescription || form.damageOther || null,
    damage_other_quantity: numberValue(form.damageOtherQuantity),
    damage_notes: form.damageNotes || null,
    total_dbr: numberValue(form.totalDbr),
    min_tong_box: numberValue(form.minTongBox),
    min_tong_pin: numberValue(form.minTongPin),
    tstr_box: numberValue(form.tstrBox),
    tstr_pin: numberValue(form.tstrPin),
    emi: numberValue(form.emi),
    damaged_tube: numberValue(form.damagedTube),
    min_wall: numberValue(form.minWall),
    dbr_other: form.dbrOtherDescription || form.dbrOther || null,
    dbr_other_description: form.dbrOtherDescription || form.dbrOther || null,
    dbr_other_quantity: numberValue(form.dbrOtherQuantity),
    dbr_notes: form.dbrNotes || null,
    total_refaces: numberValue(form.totalRefaces),
    reface_pin: numberValue(form.refacePin),
    reface_box: numberValue(form.refaceBox),
    total_hardbands: numberValue(form.totalHardbands),
    hardband_pin: numberValue(form.hardbandPin),
    hardband_box: numberValue(form.hardbandBox),
    repair_joints: numberValue(form.repairJoints),
    dbr_joints: numberValue(form.dbrJoints),
    hb_joints: numberValue(form.hbJoints),
    repair_hb_joints: numberValue(form.repairHbJoints),
    remarks: form.remarks || null,
    inspected_by: form.inspectedBy || null,
    status: form.status || "Draft",
    inspection_report_name: form.inspectionReportName || null,
    inspection_report_url: form.inspectionReportUrl || null,
    created_by: profileId,
    updated_at: new Date().toISOString(),
  };
}

function safeFileName(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 140) || "inspection-report"
  );
}

function ticketDateStamp(dateText: string) {
  const date = dateText ? new Date(`${dateText}T12:00:00`) : new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}-${day}-${year}`;
}

function letterForIndex(index: number) {
  let n = index;
  let value = "";
  do {
    value = String.fromCharCode(65 + (n % 26)) + value;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return value;
}

function TextLine({
  label,
  value,
  onChange,
  readOnly,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  type?: string;
}) {
  return (
    <label className="summary-line-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={readOnly} />
    </label>
  );
}

function NumberLine({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  return (
    <label className="summary-inline-count">
      <span>{label}</span>
      <input type="number" inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} disabled={readOnly} />
    </label>
  );
}

export default function DtiDailySummaryPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [summaries, setSummaries] = useState<SummaryForm[]>([]);
  const [jobs, setJobs] = useState<DtiJob[]>([]);
  const [responses, setResponses] = useState<ChecklistResponse[]>([]);
  const [form, setForm] = useState<SummaryForm>(blankForm());
  const [expandedSummaryId, setExpandedSummaryId] = useState("");
  const [message, setMessage] = useState("Loading DTI daily summaries...");
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [inspectionReportFile, setInspectionReportFile] = useState<File | null>(null);

  const canEdit = profile ? editableRoles.includes(profile.role) : false;
  const selectedId = form.id;

  const totals = useMemo(() => {
    return {
      damageTotal:
        numberValue(form.damageSeatBox) +
        numberValue(form.damageSeatPin) +
        numberValue(form.damageThreadsBox) +
        numberValue(form.damageThreadsPin) +
        numberValue(form.damagedHardbandBox || form.shortBox) +
        numberValue(form.damagedHardbandPin) +
        numberValue(form.bentTube) +
        numberValue(form.damageOtherQuantity),
      dbrTotal:
        numberValue(form.minTongBox) +
        numberValue(form.minTongPin) +
        numberValue(form.tstrBox) +
        numberValue(form.tstrPin) +
        numberValue(form.emi) +
        numberValue(form.damagedTube) +
        numberValue(form.minWall) +
        numberValue(form.dbrOtherQuantity),
      refaceTotal: numberValue(form.refacePin) + numberValue(form.refaceBox),
      hardbandTotal: numberValue(form.hardbandPin) + numberValue(form.hardbandBox),
    };
  }, [form]);

  const leadInspectorPerformance = useMemo(() => {
    const jobsByLead = new Map<string, DtiJob[]>();

    jobs.forEach((job) => {
      const lead = job.leadInspector || "Unassigned";
      jobsByLead.set(lead, [...(jobsByLead.get(lead) ?? []), job]);
    });

    return [...jobsByLead.entries()]
      .map(([lead, leadJobs]) => {
        const jobIds = new Set(leadJobs.map((job) => job.id));
        const leadResponses = responses.filter((response) => jobIds.has(response.dtiJobId));
        const scoredResponses = leadResponses.filter((response) => response.score !== null);
        const average = scoredResponses.length
          ? scoredResponses.reduce((sum, response) => sum + Number(response.score ?? 0), 0) / scoredResponses.length
          : 0;
        const redFlags = leadResponses.filter((response) => response.redFlag || (response.score !== null && response.score <= 2)).length;

        const categoryScores = new Map<string, number[]>();
        scoredResponses.forEach((response) => {
          const label = response.category || response.section || "General";
          categoryScores.set(label, [...(categoryScores.get(label) ?? []), Number(response.score)]);
        });

        const categoryAverages = [...categoryScores.entries()]
          .map(([label, scores]) => ({
            label,
            average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
          }))
          .sort((a, b) => b.average - a.average);

        const operatorScores = new Map<string, { scores: number[]; jobs: number }>();
        leadJobs.forEach((job) => {
          const label = job.operator || "Unassigned";
          const jobScores = responses
            .filter((response) => response.dtiJobId === job.id && response.score !== null)
            .map((response) => Number(response.score));
          const current = operatorScores.get(label) ?? { scores: [], jobs: 0 };
          current.scores.push(...jobScores);
          current.jobs += 1;
          operatorScores.set(label, current);
        });

        const bestOperator = [...operatorScores.entries()]
          .map(([operator, item]) => ({
            operator,
            jobs: item.jobs,
            average: item.scores.length ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length : 0,
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

  useEffect(() => {
    loadPage();
  }, []);

  async function loadPage() {
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
      setMessage("Your profile could not be loaded.");
      return;
    }

    const role = normalizeRole(profileData.role);
    if (!readableRoles.includes(role)) {
      window.location.href = role === "customer" ? "/customer" : "/home";
      return;
    }

    const nextProfile = {
      id: profileData.id,
      fullName: profileData.full_name ?? user.email ?? "DTI User",
      role,
    };

    setProfile(nextProfile);
    setForm(blankForm(nextProfile.fullName));
    await Promise.all([loadSummaries(), loadPerformanceData()]);
  }

  async function loadSummaries() {
    const { data, error } = await supabase
      .from("dti_daily_summaries")
      .select("*")
      .order("summary_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setMessage(`Daily summaries failed: ${error.message}`);
      return;
    }

    const mapped = (data ?? []).map(mapRow);
    setSummaries(mapped);
    setMessage("");
  }

  async function loadPerformanceData() {
    const { data: jobData, error: jobError } = await supabase
      .from("dti_jobs")
      .select("id, job_number, operator, lead_inspector, status")
      .order("created_at", { ascending: false });

    if (jobError) {
      setMessage(`Lead inspector performance failed: ${jobError.message}`);
      return;
    }

    const mappedJobs: DtiJob[] = (jobData ?? []).map((job: any) => {
      const status = readText(job.status);
      return {
        id: readText(job.id),
        jobNumber: readText(job.job_number),
        operator: readText(job.operator),
        leadInspector: readText(job.lead_inspector),
        status: (["Open", "In Progress", "Review", "Closed"].includes(status) ? status : "Open") as JobStatus,
      };
    });

    const jobIds = mappedJobs.map((job) => job.id).filter(Boolean);
    if (jobIds.length === 0) {
      setJobs([]);
      setResponses([]);
      return;
    }

    const { data: responseData, error: responseError } = await supabase
      .from("dti_checklist_responses")
      .select("id, dti_job_id, section, category, score, red_flag")
      .in("dti_job_id", jobIds);

    if (responseError) {
      setMessage(`Lead inspector scorecards failed: ${responseError.message}`);
      return;
    }

    setJobs(mappedJobs);
    setResponses((responseData ?? []).map((response: any) => ({
      id: readText(response.id),
      dtiJobId: readText(response.dti_job_id),
      section: readText(response.section),
      category: readText(response.category),
      score: response.score === null || response.score === undefined ? null : Number(response.score),
      redFlag: Boolean(response.red_flag),
    })));
  }

  async function makeSummaryNumber(dateText: string) {
    const base = `DTI-SUM-${ticketDateStamp(dateText)}`;
    const { data } = await supabase
      .from("dti_daily_summaries")
      .select("summary_number")
      .ilike("summary_number", `${base}%`);

    const used = new Set((data ?? []).map((row: any) => String(row.summary_number ?? "")));
    for (let index = 0; index < 702; index += 1) {
      const candidate = `${base}${letterForIndex(index)}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}-${Date.now()}`;
  }

  function updateForm(changes: Partial<SummaryForm>) {
    setForm((current) => ({ ...current, ...changes }));
  }

  function startNewSummary() {
    setForm(blankForm(profile?.fullName ?? ""));
    setExpandedSummaryId("");
    setInspectionReportFile(null);
    setMessage("");
  }

  function selectSummary(summary: SummaryForm) {
    setForm(summary);
    setInspectionReportFile(null);
    setExpandedSummaryId((current) => (current === summary.id ? "" : summary.id));
    setMessage(`Editing ${summary.summaryNumber}. Make corrections, then save.`);
  }

  async function uploadInspectionReport(summaryId: string, summaryNumber: string) {
    if (!inspectionReportFile) return null;

    const filePath = `dti-daily-summaries/${summaryNumber}/${Date.now()}-${safeFileName(inspectionReportFile.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("ticket-attachments")
      .upload(filePath, inspectionReportFile, {
        cacheControl: "3600",
        contentType: inspectionReportFile.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("ticket-attachments")
      .getPublicUrl(filePath);

    const patch = {
      inspection_report_name: inspectionReportFile.name,
      inspection_report_url: publicUrlData.publicUrl,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("dti_daily_summaries")
      .update(patch)
      .eq("id", summaryId);

    if (updateError) throw updateError;

    setInspectionReportFile(null);

    return {
      name: inspectionReportFile.name,
      url: publicUrlData.publicUrl,
    };
  }

  async function postSummaryToGroupMe(summaryId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your login session expired. Sign in again.");

    const response = await fetch("/api/dti-summary-groupme", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ summaryId }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "GroupMe post failed.");
  }

  async function saveSummary(postAfterSave = false) {
    if (!profile || !canEdit || saving) return;
    if (!form.summaryDate) {
      setMessage("Date is required.");
      return;
    }

    setSaving(true);
    setPosting(postAfterSave);
    setMessage("");

    try {
      const summaryNumber = form.summaryNumber || (await makeSummaryNumber(form.summaryDate));
      const payloadForm = {
        ...form,
        status: postAfterSave ? "Posted" : form.status,
        totalDamages: String(totals.damageTotal),
        totalDbr: String(totals.dbrTotal),
        totalRefaces: String(totals.refaceTotal),
        totalHardbands: String(totals.hardbandTotal),
      };
      const payload = buildPayload(
        {
          ...payloadForm,
        },
        profile.id,
        summaryNumber
      );

      let savedSummary: SummaryForm | null = null;

      if (form.id) {
        const { data, error } = await supabase
          .from("dti_daily_summaries")
          .update(payload)
          .eq("id", form.id)
          .select("*")
          .single();

        if (error) throw error;
        savedSummary = mapRow(data);
      } else {
        const { data, error } = await supabase
          .from("dti_daily_summaries")
          .insert(payload)
          .select("*")
          .single();

        if (error) throw error;
        savedSummary = mapRow(data);
      }

      if (!savedSummary) throw new Error("Daily summary was not returned after saving.");

      const uploadedReport = await uploadInspectionReport(savedSummary.id, summaryNumber);
      if (uploadedReport) {
        savedSummary = {
          ...savedSummary,
          inspectionReportName: uploadedReport.name,
          inspectionReportUrl: uploadedReport.url,
        };
      }

      if (postAfterSave) {
        await postSummaryToGroupMe(savedSummary.id);
      }

      setForm(savedSummary);
      await loadSummaries();
      setMessage(`Daily summary ${summaryNumber} ${postAfterSave ? "posted to GroupMe" : "saved"}.`);
    } catch (error: any) {
      setMessage(`Save failed: ${error.message}`);
    } finally {
      setSaving(false);
      setPosting(false);
    }
  }

  function openPrint() {
    if (!form.id) {
      setMessage("Save the daily summary before printing.");
      return;
    }

    window.open(`/dti-summary/print?id=${form.id}`, "_blank");
  }

  async function emailSummary() {
    if (!form.id || emailing) {
      setMessage("Save the daily summary before emailing.");
      return;
    }

    const recipientEmail = window.prompt("Email daily summary to:");
    if (!recipientEmail?.trim()) return;
    const note = window.prompt("Optional message for the email:") ?? "";

    setEmailing(true);
    setMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your login session expired. Sign in again.");

      const response = await fetch("/api/dti-summary-email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summaryId: form.id,
          recipientEmail: recipientEmail.trim(),
          note,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Email failed.");
      setMessage(`Daily summary emailed to ${recipientEmail.trim()}.`);
    } catch (error: any) {
      setMessage(`Email failed: ${error.message}`);
    } finally {
      setEmailing(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const readOnly = !canEdit || saving;

  return (
    <main className="dashboard-shell daily-summary-shell">
      <header className="dashboard-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">DTI Daily Summary</div>
            <div className="brand-subtitle">Inspection summary, email, and print records</div>
          </div>
        </button>

        <div className="dashboard-actions">
          <button className="button" onClick={() => (window.location.href = "/home")}>Home</button>
          <button className="button" onClick={() => (window.location.href = "/dti")}>DTI Jobs</button>
          <button className="button" onClick={openPrint} disabled={!selectedId}>Print / PDF</button>
          <button className="button" onClick={emailSummary} disabled={!selectedId || emailing}>{emailing ? "Emailing..." : "Email"}</button>
          <button className="button primary" onClick={() => saveSummary()} disabled={!canEdit || saving}>{saving && !posting ? "Saving..." : "Save Summary"}</button>
          <button className="button" onClick={() => saveSummary(true)} disabled={!canEdit || saving}>{posting ? "Posting..." : "Post Summary"}</button>
          <button className="button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      <section className="customer-welcome">
        <span>Welcome</span>
        <h1>{profile?.fullName ?? "DTI Daily Summary"}</h1>
        <p>Replace the paper inspection summary with a clean digital form.</p>
      </section>

      {message && <div className="modal-message">{message}</div>}

      <section className="summary-workspace">
        <aside className="summary-list-panel">
          <div className="section-heading">
            <div>
              <h2>Daily Summaries</h2>
              <p>{summaries.length} saved records</p>
            </div>
            <button className="button primary" onClick={startNewSummary} disabled={!canEdit}>New</button>
          </div>

          <div className="summary-list">
            {summaries.map((summary) => (
              <button
                key={summary.id}
                className={`summary-list-button ${summary.id === form.id ? "active" : ""}`}
                type="button"
                aria-expanded={expandedSummaryId === summary.id}
                onClick={() => selectSummary(summary)}
              >
                <strong>{summary.summaryNumber}</strong>
                <span>Operator: {summary.operator || "-"}</span>
                <span>Contractor: {summary.contractor || "-"}</span>
                <span>Field Invoice: {summary.fieldInvoice || "-"}</span>
                {expandedSummaryId === summary.id && (
                  <div className="summary-list-details">
                    <small>Click this card to edit and correct this saved summary.</small>
                    <small>Date: {summary.summaryDate || "-"}</small>
                    <small>Joints: {summary.totalJointsInspected || "0"}</small>
                    <small>Status: {summary.status || "Draft"}</small>
                    <small>Location: {summary.location || "-"}</small>
                    {summary.inspectionReportName && <small>Report: {summary.inspectionReportName}</small>}
                  </div>
                )}
              </button>
            ))}
            {summaries.length === 0 && <p className="muted-text">No daily summaries yet.</p>}
          </div>

          <section className="summary-performance-panel">
            <h3>Lead Inspector Performance</h3>
            <p className="muted-text">Rankings come from scored DTI jobs.</p>
            {leadInspectorPerformance.length === 0 ? (
              <p className="muted-text">No scorecard data yet.</p>
            ) : (
              <div className="summary-performance-list">
                {leadInspectorPerformance.map((lead, index) => (
                  <article key={lead.lead} className="summary-performance-card">
                    <div>
                      <strong>#{index + 1} {lead.lead}</strong>
                      <span>{lead.jobs} jobs / {lead.closedJobs} closed</span>
                    </div>
                    <div>
                      <strong>{lead.average ? lead.average.toFixed(1) : "-"}</strong>
                      <span>Grade {lead.grade}</span>
                    </div>
                    <small>Red Flags: {lead.redFlags}</small>
                    <small>Best Operator: {lead.bestOperator}</small>
                    <small>Strength: {lead.strength}</small>
                    <small>Improve: {lead.weakness}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="inspection-summary-wrap">
          <div className="inspection-summary-sheet">
            <header className="summary-letterhead">
              <img src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" />
              <div className="summary-title-block">
                <h1>Inspection Summary</h1>
                <TextLine type="date" label="Date" value={form.summaryDate} onChange={(value) => updateForm({ summaryDate: value })} readOnly={readOnly} />
                <TextLine label="Field Invoice" value={form.fieldInvoice} onChange={(value) => updateForm({ fieldInvoice: value })} readOnly={readOnly} />
                <div className="summary-page-count">
                  <TextLine label="Page" value={form.pageNumber} onChange={(value) => updateForm({ pageNumber: value })} readOnly={readOnly} />
                  <TextLine label="of" value={form.pageTotal} onChange={(value) => updateForm({ pageTotal: value })} readOnly={readOnly} />
                </div>
              </div>
            </header>

            <section className="summary-top-fields">
              <TextLine label="Operator" value={form.operator} onChange={(value) => updateForm({ operator: value })} readOnly={readOnly} />
              <TextLine label="Contractor" value={form.contractor} onChange={(value) => updateForm({ contractor: value })} readOnly={readOnly} />
              <TextLine label="Location" value={form.location} onChange={(value) => updateForm({ location: value })} readOnly={readOnly} />
            </section>

            <section className="summary-long-lines">
              <TextLine label="Type of Inspection" value={form.inspectionType} onChange={(value) => updateForm({ inspectionType: value })} readOnly={readOnly} />
              <TextLine label="Connection Size and Type" value={form.connectionSizeType} onChange={(value) => updateForm({ connectionSizeType: value })} readOnly={readOnly} />
              <NumberLine label="Total # of Joints Inspected" value={form.totalJointsInspected} onChange={(value) => updateForm({ totalJointsInspected: value })} readOnly={readOnly} />
            </section>

            <section className="summary-box-grid">
              <div className="summary-count-box">
                <NumberLine label="Total Damages" value={String(totals.damageTotal)} onChange={() => {}} readOnly />
                <div className="summary-split-row">
                  <span>Damage Seal</span>
                  <NumberLine label="Box" value={form.damageSeatBox} onChange={(value) => updateForm({ damageSeatBox: value })} readOnly={readOnly} />
                  <NumberLine label="Pin" value={form.damageSeatPin} onChange={(value) => updateForm({ damageSeatPin: value })} readOnly={readOnly} />
                </div>
                <div className="summary-split-row">
                  <span>Damage Threads</span>
                  <NumberLine label="Box" value={form.damageThreadsBox} onChange={(value) => updateForm({ damageThreadsBox: value })} readOnly={readOnly} />
                  <NumberLine label="Pin" value={form.damageThreadsPin} onChange={(value) => updateForm({ damageThreadsPin: value })} readOnly={readOnly} />
                </div>
                <div className="summary-split-row">
                  <span>Damaged Hardband</span>
                  <NumberLine label="Box" value={form.damagedHardbandBox || form.shortBox} onChange={(value) => updateForm({ damagedHardbandBox: value, shortBox: value })} readOnly={readOnly} />
                  <NumberLine label="Pin" value={form.damagedHardbandPin} onChange={(value) => updateForm({ damagedHardbandPin: value })} readOnly={readOnly} />
                </div>
                <NumberLine label="Bent Tube" value={form.bentTube} onChange={(value) => updateForm({ bentTube: value })} readOnly={readOnly} />
                <div className="summary-split-row summary-other-row">
                  <span>Other</span>
                  <TextLine label="Description" value={form.damageOtherDescription || form.damageOther} onChange={(value) => updateForm({ damageOtherDescription: value, damageOther: value })} readOnly={readOnly} />
                  <NumberLine label="Qty" value={form.damageOtherQuantity} onChange={(value) => updateForm({ damageOtherQuantity: value })} readOnly={readOnly} />
                </div>
                <textarea className="summary-note-lines" value={form.damageNotes} onChange={(event) => updateForm({ damageNotes: event.target.value })} disabled={readOnly} placeholder="Additional damage notes" />
              </div>

              <div className="summary-count-box">
                <NumberLine label="Total DBR" value={String(totals.dbrTotal)} onChange={() => {}} readOnly />
                <div className="summary-split-row">
                  <span>Min Tong</span>
                  <NumberLine label="Box" value={form.minTongBox} onChange={(value) => updateForm({ minTongBox: value })} readOnly={readOnly} />
                  <NumberLine label="Pin" value={form.minTongPin} onChange={(value) => updateForm({ minTongPin: value })} readOnly={readOnly} />
                </div>
                <div className="summary-split-row">
                  <span>TSTR</span>
                  <NumberLine label="Box" value={form.tstrBox} onChange={(value) => updateForm({ tstrBox: value })} readOnly={readOnly} />
                  <NumberLine label="Pin" value={form.tstrPin} onChange={(value) => updateForm({ tstrPin: value })} readOnly={readOnly} />
                </div>
                <NumberLine label="EMI" value={form.emi} onChange={(value) => updateForm({ emi: value })} readOnly={readOnly} />
                <NumberLine label="Damaged Tube" value={form.damagedTube} onChange={(value) => updateForm({ damagedTube: value })} readOnly={readOnly} />
                <NumberLine label="MIN Wall" value={form.minWall} onChange={(value) => updateForm({ minWall: value })} readOnly={readOnly} />
                <div className="summary-split-row summary-other-row">
                  <span>Other</span>
                  <TextLine label="Description" value={form.dbrOtherDescription || form.dbrOther} onChange={(value) => updateForm({ dbrOtherDescription: value, dbrOther: value })} readOnly={readOnly} />
                  <NumberLine label="Qty" value={form.dbrOtherQuantity} onChange={(value) => updateForm({ dbrOtherQuantity: value })} readOnly={readOnly} />
                </div>
                <textarea className="summary-note-lines" value={form.dbrNotes} onChange={(event) => updateForm({ dbrNotes: event.target.value })} disabled={readOnly} placeholder="Additional DBR notes" />
              </div>

              <div className="summary-count-box compact">
                <NumberLine label="Total Refaces" value={String(totals.refaceTotal)} onChange={() => {}} readOnly />
                <NumberLine label="Pin" value={form.refacePin} onChange={(value) => updateForm({ refacePin: value })} readOnly={readOnly} />
                <NumberLine label="Box" value={form.refaceBox} onChange={(value) => updateForm({ refaceBox: value })} readOnly={readOnly} />
              </div>

              <div className="summary-count-box compact">
                <NumberLine label="Total Hardbands" value={String(totals.hardbandTotal)} onChange={() => {}} readOnly />
                <NumberLine label="Pin" value={form.hardbandPin} onChange={(value) => updateForm({ hardbandPin: value })} readOnly={readOnly} />
                <NumberLine label="Box" value={form.hardbandBox} onChange={(value) => updateForm({ hardbandBox: value })} readOnly={readOnly} />
              </div>
            </section>

            <section className="summary-bottom-counts">
              <NumberLine label="Repair Joints" value={form.repairJoints} onChange={(value) => updateForm({ repairJoints: value })} readOnly={readOnly} />
              <NumberLine label="DBR Joints" value={form.dbrJoints} onChange={(value) => updateForm({ dbrJoints: value })} readOnly={readOnly} />
              <NumberLine label="HB Joints" value={form.hbJoints} onChange={(value) => updateForm({ hbJoints: value })} readOnly={readOnly} />
              <NumberLine label="Repair / HB Joints" value={form.repairHbJoints} onChange={(value) => updateForm({ repairHbJoints: value })} readOnly={readOnly} />
            </section>

            <label className="summary-remarks">
              <span>Remarks</span>
              <textarea value={form.remarks} onChange={(event) => updateForm({ remarks: event.target.value })} disabled={readOnly} />
            </label>

            <section className="summary-report-upload no-print">
              <label>
                <span>Inspection Report Excel Copy</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={readOnly}
                  onChange={(event) => setInspectionReportFile(event.target.files?.[0] ?? null)}
                />
              </label>
              {inspectionReportFile && <p>Ready to attach: {inspectionReportFile.name}</p>}
              {form.inspectionReportUrl && (
                <p>
                  Attached report: <a href={form.inspectionReportUrl} target="_blank" rel="noreferrer">{form.inspectionReportName || "Open report"}</a>
                </p>
              )}
            </section>

            <footer className="summary-footer">
              <p>Inspections done per TH-Hill DS-1 5th Edition</p>
              <TextLine label="Inspected by" value={form.inspectedBy} onChange={(value) => updateForm({ inspectedBy: value })} readOnly={readOnly} />
              <strong>* All damages marked in yellow with stencil or damaged at upset.</strong>
            </footer>
          </div>
        </section>
      </section>
    </main>
  );
}
