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
  bentTube: string;
  damageOther: string;
  damageNotes: string;
  totalDbr: string;
  minTongBox: string;
  minTongPin: string;
  emi: string;
  damagedTube: string;
  minWall: string;
  dbrOther: string;
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
};

const editableRoles: Role[] = ["admin", "employee", "dti_superintendent", "dti_inspector"];
const readableRoles: Role[] = ["admin", "employee", "sales", "dti_superintendent", "dti_inspector"];

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
    operator: profileName,
    contractor: "",
    location: "Pathfinder Yard (TX)",
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
    bentTube: "",
    damageOther: "",
    damageNotes: "",
    totalDbr: "",
    minTongBox: "",
    minTongPin: "",
    emi: "",
    damagedTube: "",
    minWall: "",
    dbrOther: "",
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
    bentTube: readNumber(row.bent_tube),
    damageOther: readText(row.damage_other),
    damageNotes: readText(row.damage_notes),
    totalDbr: readNumber(row.total_dbr),
    minTongBox: readNumber(row.min_tong_box),
    minTongPin: readNumber(row.min_tong_pin),
    emi: readNumber(row.emi),
    damagedTube: readNumber(row.damaged_tube),
    minWall: readNumber(row.min_wall),
    dbrOther: readText(row.dbr_other),
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
    short_box: numberValue(form.shortBox),
    bent_tube: numberValue(form.bentTube),
    damage_other: form.damageOther || null,
    damage_notes: form.damageNotes || null,
    total_dbr: numberValue(form.totalDbr),
    min_tong_box: numberValue(form.minTongBox),
    min_tong_pin: numberValue(form.minTongPin),
    emi: numberValue(form.emi),
    damaged_tube: numberValue(form.damagedTube),
    min_wall: numberValue(form.minWall),
    dbr_other: form.dbrOther || null,
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
    created_by: profileId,
    updated_at: new Date().toISOString(),
  };
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  return (
    <label className="summary-line-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} disabled={readOnly} />
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
  const [form, setForm] = useState<SummaryForm>(blankForm());
  const [message, setMessage] = useState("Loading DTI daily summaries...");
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const canEdit = profile ? editableRoles.includes(profile.role) : false;
  const selectedId = form.id;

  const totals = useMemo(() => {
    return {
      damageTotal: numberValue(form.damageSeatBox) + numberValue(form.damageSeatPin) + numberValue(form.damageThreadsBox) + numberValue(form.damageThreadsPin) + numberValue(form.shortBox) + numberValue(form.bentTube),
      dbrTotal: numberValue(form.minTongBox) + numberValue(form.minTongPin) + numberValue(form.emi) + numberValue(form.damagedTube) + numberValue(form.minWall),
      refaceTotal: numberValue(form.refacePin) + numberValue(form.refaceBox),
      hardbandTotal: numberValue(form.hardbandPin) + numberValue(form.hardbandBox),
    };
  }, [form]);

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
    await loadSummaries();
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
    setMessage("");
  }

  async function saveSummary() {
    if (!profile || !canEdit || saving) return;
    if (!form.summaryDate) {
      setMessage("Date is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const summaryNumber = form.summaryNumber || (await makeSummaryNumber(form.summaryDate));
      const payload = buildPayload(
        {
          ...form,
          totalDamages: form.totalDamages || String(totals.damageTotal),
          totalDbr: form.totalDbr || String(totals.dbrTotal),
          totalRefaces: form.totalRefaces || String(totals.refaceTotal),
          totalHardbands: form.totalHardbands || String(totals.hardbandTotal),
        },
        profile.id,
        summaryNumber
      );

      if (form.id) {
        const { error } = await supabase
          .from("dti_daily_summaries")
          .update(payload)
          .eq("id", form.id);

        if (error) throw error;
        setForm((current) => ({ ...current, summaryNumber }));
      } else {
        const { data, error } = await supabase
          .from("dti_daily_summaries")
          .insert(payload)
          .select("*")
          .single();

        if (error) throw error;
        setForm(mapRow(data));
      }

      await loadSummaries();
      setMessage(`Daily summary ${summaryNumber} saved.`);
    } catch (error: any) {
      setMessage(`Save failed: ${error.message}`);
    } finally {
      setSaving(false);
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
          <button className="button primary" onClick={saveSummary} disabled={!canEdit || saving}>{saving ? "Saving..." : "Save Summary"}</button>
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
                onClick={() => setForm(summary)}
              >
                <strong>{summary.summaryNumber}</strong>
                <span>{summary.summaryDate} / {summary.contractor || "No contractor"}</span>
                <small>{summary.totalJointsInspected || "0"} joints / {summary.status}</small>
              </button>
            ))}
            {summaries.length === 0 && <p className="muted-text">No daily summaries yet.</p>}
          </div>
        </aside>

        <section className="inspection-summary-wrap">
          <div className="inspection-summary-sheet">
            <header className="summary-letterhead">
              <img src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" />
              <div className="summary-title-block">
                <h1>Inspection Summary</h1>
                <TextLine label="Date" value={form.summaryDate} onChange={(value) => updateForm({ summaryDate: value })} readOnly={readOnly} />
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
                <NumberLine label="Total Damages" value={form.totalDamages || String(totals.damageTotal || "")} onChange={(value) => updateForm({ totalDamages: value })} readOnly={readOnly} />
                <div className="summary-split-row">
                  <span>Damage Seat</span>
                  <NumberLine label="Box" value={form.damageSeatBox} onChange={(value) => updateForm({ damageSeatBox: value })} readOnly={readOnly} />
                  <NumberLine label="Pin" value={form.damageSeatPin} onChange={(value) => updateForm({ damageSeatPin: value })} readOnly={readOnly} />
                </div>
                <div className="summary-split-row">
                  <span>Damage Threads</span>
                  <NumberLine label="Box" value={form.damageThreadsBox} onChange={(value) => updateForm({ damageThreadsBox: value })} readOnly={readOnly} />
                  <NumberLine label="Pin" value={form.damageThreadsPin} onChange={(value) => updateForm({ damageThreadsPin: value })} readOnly={readOnly} />
                </div>
                <NumberLine label="Short Box" value={form.shortBox} onChange={(value) => updateForm({ shortBox: value })} readOnly={readOnly} />
                <NumberLine label="Bent Tube" value={form.bentTube} onChange={(value) => updateForm({ bentTube: value })} readOnly={readOnly} />
                <TextLine label="Other" value={form.damageOther} onChange={(value) => updateForm({ damageOther: value })} readOnly={readOnly} />
                <textarea className="summary-note-lines" value={form.damageNotes} onChange={(event) => updateForm({ damageNotes: event.target.value })} disabled={readOnly} placeholder="Additional damage notes" />
              </div>

              <div className="summary-count-box">
                <NumberLine label="Total DBR" value={form.totalDbr || String(totals.dbrTotal || "")} onChange={(value) => updateForm({ totalDbr: value })} readOnly={readOnly} />
                <div className="summary-split-row">
                  <span>Min Tong</span>
                  <NumberLine label="Box" value={form.minTongBox} onChange={(value) => updateForm({ minTongBox: value })} readOnly={readOnly} />
                  <NumberLine label="Pin" value={form.minTongPin} onChange={(value) => updateForm({ minTongPin: value })} readOnly={readOnly} />
                </div>
                <NumberLine label="EMI" value={form.emi} onChange={(value) => updateForm({ emi: value })} readOnly={readOnly} />
                <NumberLine label="Damaged Tube" value={form.damagedTube} onChange={(value) => updateForm({ damagedTube: value })} readOnly={readOnly} />
                <NumberLine label="MIN Wall" value={form.minWall} onChange={(value) => updateForm({ minWall: value })} readOnly={readOnly} />
                <TextLine label="Other" value={form.dbrOther} onChange={(value) => updateForm({ dbrOther: value })} readOnly={readOnly} />
                <textarea className="summary-note-lines" value={form.dbrNotes} onChange={(event) => updateForm({ dbrNotes: event.target.value })} disabled={readOnly} placeholder="Additional DBR notes" />
              </div>

              <div className="summary-count-box compact">
                <NumberLine label="Total Refaces" value={form.totalRefaces || String(totals.refaceTotal || "")} onChange={(value) => updateForm({ totalRefaces: value })} readOnly={readOnly} />
                <NumberLine label="Pin" value={form.refacePin} onChange={(value) => updateForm({ refacePin: value })} readOnly={readOnly} />
                <NumberLine label="Box" value={form.refaceBox} onChange={(value) => updateForm({ refaceBox: value })} readOnly={readOnly} />
              </div>

              <div className="summary-count-box compact">
                <NumberLine label="Total Hardbands" value={form.totalHardbands || String(totals.hardbandTotal || "")} onChange={(value) => updateForm({ totalHardbands: value })} readOnly={readOnly} />
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
