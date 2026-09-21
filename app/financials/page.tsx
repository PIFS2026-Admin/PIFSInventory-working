"use client";

import { useEffect, useMemo, useState } from "react";
import { financialLineNames, FinancialLine } from "../../lib/financialKpi";
import { supabase } from "../../lib/supabase";
import styles from "./financials.module.css";

type TabKey = "overview" | "trackers" | "kpis" | "cost-basis";
type Yard = { id: string; name: string; code: string };
type PermissionSet = { view: boolean; create: boolean; edit: boolean; approve: boolean; export: boolean; manageSettings: boolean };
type FinancialJob = {
  id: string;
  yard_id: string;
  service_line: FinancialLine;
  job_date: string;
  category_code: string;
  operator: string | null;
  rig: string | null;
  lead: string | null;
  invoice: string | null;
  revenue: number | string | null;
  manhours: number | string | null;
  inputs: Record<string, unknown>;
  computed: Record<string, unknown>;
  rates_used: Record<string, unknown>;
  source: string;
  status: string;
};
type Category = { id: string; service_line: string; code: string; label: string };
type Rate = { id: string; service_line: FinancialLine; rate_key: string; label: string; rate_value: number | string };
type RatePeriod = { id: string; service_line: FinancialLine; rate_key: string; effective_from: string; minimum_quantity: number | string; rate_value: number | string };
type Target = { id: string; service_line: FinancialLine; yard_id: string | null; category_code: string; metric_key: string; direction: "above" | "below"; target_value: number | string; unit: string; label: string };
type Field = { key: string; label: string; kind?: "text" | "number" | "date" | "textarea" };

const lines = Object.keys(financialLineNames) as FinancialLine[];
const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;
const emptyPermissions: PermissionSet = { view: false, create: false, edit: false, approve: false, export: false, manageSettings: false };

const commonIdentityFields: Field[] = [
  { key: "invoice", label: "Invoice" }, { key: "operator", label: "Operator" },
  { key: "rig", label: "Rig or Yard" }, { key: "lead", label: "Crew Lead" },
  { key: "state", label: "State" },
];

const lineFields: Record<FinancialLine, Field[]> = {
  dti: [
    ...commonIdentityFields, { key: "insp_type", label: "Inspection Type" },
    { key: "revenue", label: "Job Revenue", kind: "number" }, { key: "revenue_net", label: "Revenue Less Subcontractor Rebill", kind: "number" },
    { key: "crew", label: "Crew", kind: "number" }, { key: "days", label: "Days on Job", kind: "number" },
    { key: "total_mh", label: "Total Manhours", kind: "number" }, { key: "reface_mh", label: "Refacing Manhours", kind: "number" },
    { key: "miles", label: "Total Miles Driven", kind: "number" }, { key: "vehicles", label: "Vehicles", kind: "number" },
    { key: "joints", label: "Joints", kind: "number" }, { key: "size", label: "Pipe Size" }, { key: "connection", label: "Connection" },
    { key: "refaces", label: "Total Refaces", kind: "number" }, { key: "reface_type", label: "Reface Type" },
    { key: "msrs", label: "MSRs", kind: "number" }, { key: "dbrs", label: "DBRs", kind: "number" },
    { key: "hotels", label: "Hotels or Per Diem", kind: "number" }, { key: "comments", label: "Comments", kind: "textarea" },
  ],
  cdt: [
    ...commonIdentityFields, { key: "casing_size", label: "Casing Size" }, { key: "footage", label: "Total Footage", kind: "number" },
    { key: "revenue", label: "Invoice Amount", kind: "number" }, { key: "crew", label: "Crew", kind: "number" },
    { key: "total_hrs", label: "Total Hours", kind: "number" }, { key: "miles_rt", label: "Round Trip Miles per Truck", kind: "number" },
    { key: "vehicles", label: "Vehicles", kind: "number" }, { key: "comments", label: "Comments", kind: "textarea" },
  ],
  trs: [
    ...commonIdentityFields, { key: "casing_size", label: "Casing Size" }, { key: "job_type", label: "Job Type" },
    { key: "footage", label: "Total Footage", kind: "number" }, { key: "revenue", label: "Invoice Amount", kind: "number" },
    { key: "crew", label: "Crew", kind: "number" }, { key: "total_hrs", label: "Total Hours", kind: "number" },
    { key: "miles_rt", label: "Round Trip Miles per Truck", kind: "number" }, { key: "vehicles", label: "Vehicles", kind: "number" },
    { key: "comments", label: "Comments", kind: "textarea" },
  ],
  hb: [
    ...commonIdentityFields, { key: "revenue", label: "Job Revenue", kind: "number" }, { key: "size", label: "Size" },
    { key: "connection", label: "Connection" }, { key: "crew", label: "Crew", kind: "number" }, { key: "days", label: "Days on Job", kind: "number" },
    { key: "total_mh", label: "Total Manhours", kind: "number" }, { key: "miles_rt", label: "Round Trip Miles", kind: "number" },
    { key: "vehicles", label: "Vehicles", kind: "number" }, { key: "dp_box", label: "DP Boxes", kind: "number" },
    { key: "dp_pin", label: "DP Pins", kind: "number" }, { key: "hw_box", label: "HWDP Boxes", kind: "number" },
    { key: "hw_pin", label: "HWDP Pins", kind: "number" }, { key: "tub_box", label: "Tubing Boxes", kind: "number" },
    { key: "tub_pin", label: "Tubing Pins", kind: "number" }, { key: "dpass", label: "Double Pass", kind: "number" },
    { key: "removal", label: "Removal", kind: "number" }, { key: "buildup", label: "Build-Up", kind: "number" },
    { key: "other", label: "Other", kind: "number" }, { key: "hotels", label: "Hotels or Per Diem", kind: "number" },
    { key: "band", label: "Band Thickness" }, { key: "amps", label: "Amps", kind: "number" },
    { key: "volts", label: "Volts", kind: "number" }, { key: "osc", label: "Oscillation", kind: "number" },
    { key: "chuck", label: "Chuck Seconds" }, { key: "ph_b", label: "Preheat Box", kind: "number" },
    { key: "ph_p", label: "Preheat Pin", kind: "number" }, { key: "comments", label: "Comments", kind: "textarea" },
  ],
  wash: [
    { key: "lead", label: "Lead" }, { key: "items", label: "Items Washed" }, { key: "operator", label: "Operator" },
    { key: "rig", label: "Rig or Yard" }, { key: "footage", label: "Total Footage", kind: "number" },
    { key: "invoice", label: "Invoice" }, { key: "revenue", label: "Invoice Amount", kind: "number" },
    { key: "crew", label: "Crew", kind: "number" }, { key: "total_hrs", label: "Total Hours", kind: "number" },
    { key: "miles_rt", label: "Round Trip Miles per Truck", kind: "number" }, { key: "comments", label: "Comments", kind: "textarea" },
  ],
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return numberValue(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function percent(value: unknown) {
  return `${(numberValue(value) * 100).toFixed(1)}%`;
}

function csvValue(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function initialInputs(line: FinancialLine) {
  return lineFields[line].reduce<Record<string, string>>((values, field) => ({ ...values, [field.key]: "" }), {});
}

export default function FinancialsPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [token, setToken] = useState("");
  const [yards, setYards] = useState<Yard[]>([]);
  const [yardId, setYardId] = useState("");
  const [line, setLine] = useState<FinancialLine | "all">("all");
  const [dateFrom, setDateFrom] = useState(yearStart);
  const [dateTo, setDateTo] = useState(today);
  const [jobs, setJobs] = useState<FinancialJob[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [ratePeriods, setRatePeriods] = useState<RatePeriod[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [permissions, setPermissions] = useState<PermissionSet>(emptyPermissions);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [formLine, setFormLine] = useState<FinancialLine>("dti");
  const [jobDate, setJobDate] = useState(today);
  const [categoryCode, setCategoryCode] = useState("standard");
  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs("dti"));
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (token && yardId) void loadFinancials();
  }, [token, yardId, line, dateFrom, dateTo]);

  async function initialize() {
    setLoading(true);
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token || "";
    if (!accessToken) {
      window.location.assign("/login");
      return;
    }
    setToken(accessToken);
    const response = await fetch("/api/yard-options", { headers: { Authorization: `Bearer ${accessToken}` } });
    const result = await response.json().catch(() => ({}));
    const available = Array.isArray(result.yards) ? result.yards as Yard[] : [];
    const saved = window.localStorage.getItem("titan_financial_yard_id") || "";
    const next = available.some((yard) => yard.id === saved) ? saved : available[0]?.id || "";
    setYards(available);
    setYardId(next);
    if (!next) {
      setMessage("No TITAN yard access is assigned to your account.");
      setLoading(false);
    }
  }

  async function loadFinancials() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ yardId, line, from: dateFrom, to: dateTo });
    const response = await fetch(`/api/financials?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(result.error || "Financials could not be loaded.");
      setLoading(false);
      return;
    }
    setJobs(result.jobs || []);
    setCategories(result.categories || []);
    setRates(result.rates || []);
    setRatePeriods(result.ratePeriods || []);
    setTargets(result.targets || []);
    setPermissions(result.permissions || emptyPermissions);
    setLoading(false);
  }

  const totals = useMemo(() => {
    const summary = { jobs: jobs.length, revenue: 0, cost: 0, profit: 0, manhours: 0, laborDollars: 0 };
    jobs.forEach((job) => {
      const revenue = numberValue(job.revenue);
      summary.revenue += revenue;
      summary.cost += numberValue(job.computed.total_cost);
      summary.profit += numberValue(job.computed.profit);
      summary.manhours += numberValue(job.manhours);
      summary.laborDollars += numberValue(job.computed.labor_pct) * revenue;
    });
    return {
      ...summary,
      margin: summary.revenue ? summary.profit / summary.revenue : 0,
      laborPercent: summary.revenue ? summary.laborDollars / summary.revenue : 0,
      revenuePerMh: summary.manhours ? summary.revenue / summary.manhours : 0,
    };
  }, [jobs]);

  const operatorRows = useMemo(() => {
    const grouped = new Map<string, { jobs: number; revenue: number; profit: number }>();
    jobs.forEach((job) => {
      const key = job.operator || "Unassigned";
      const row = grouped.get(key) || { jobs: 0, revenue: 0, profit: 0 };
      row.jobs += 1;
      row.revenue += numberValue(job.revenue);
      row.profit += numberValue(job.computed.profit);
      grouped.set(key, row);
    });
    return Array.from(grouped, ([operator, row]) => ({ operator, ...row, margin: row.revenue ? row.profit / row.revenue : 0 }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  }, [jobs]);

  const activeTargets = useMemo(() => targets.filter((target) => line === "all" || target.service_line === line), [line, targets]);
  const selectedCategories = categories.filter((category) => category.service_line === formLine);

  function resetForm(nextLine: FinancialLine = formLine) {
    setEditingId("");
    setFormLine(nextLine);
    setJobDate(today);
    setCategoryCode("standard");
    setInputs(initialInputs(nextLine));
    setPreview(null);
  }

  function changeFormLine(nextLine: FinancialLine) {
    resetForm(nextLine);
  }

  function beginEdit(job: FinancialJob) {
    const values = initialInputs(job.service_line);
    Object.entries(job.inputs || {}).forEach(([key, value]) => { values[key] = value === null || value === undefined ? "" : String(value); });
    setEditingId(job.id);
    setFormLine(job.service_line);
    setJobDate(job.job_date.slice(0, 10));
    setCategoryCode(job.category_code || "standard");
    setInputs(values);
    setPreview(job.computed || null);
    setShowJobForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestInputs() {
    const numericFields = new Set(lineFields[formLine].filter((field) => field.kind === "number").map((field) => field.key));
    return Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, numericFields.has(key) ? (value === "" ? null : Number(value)) : value || null]));
  }

  async function runJobAction(action: "preview" | "create" | "update") {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: editingId || undefined, yardId, line: formLine, jobDate, categoryCode, inputs: requestInputs() }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "The financial job could not be saved.");
      return;
    }
    if (action === "preview") {
      setPreview(result.computed || null);
      return;
    }
    setShowJobForm(false);
    resetForm(formLine);
    setMessage(editingId ? "Financial job updated. Its original saved rates were preserved." : "Financial job added and its cost basis was frozen.");
    await loadFinancials();
  }

  async function voidJob(job: FinancialJob) {
    const reason = window.prompt("Reason for voiding this financial job:");
    if (!reason?.trim()) return;
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void", id: job.id, yardId, reason }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Financial job voided and retained in the audit record." : result.error || "The job could not be voided.");
    if (response.ok) await loadFinancials();
  }

  function exportJobs() {
    const headers = ["Date", "Service Line", "Category", "Invoice", "Operator", "Rig / Yard", "Lead", "Revenue", "Total Cost", "Profit", "Margin", "Manhours", "Source"];
    const rows = jobs.map((job) => [job.job_date, financialLineNames[job.service_line], job.category_code, job.invoice, job.operator, job.rig, job.lead, job.revenue, job.computed.total_cost, job.computed.profit, job.computed.margin, job.manhours, job.source]);
    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `titan-financials-${dateFrom}-${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>KPI / Financial</span><h1>Financial Performance</h1><p>Controlled job-cost reporting with frozen historical calculations.</p></div>
        <div className={styles.headerActions}>
          {permissions.export && <button type="button" onClick={exportJobs}>Export CSV</button>}
          {permissions.create && <button type="button" className={styles.primary} onClick={() => { resetForm(line === "all" ? "dti" : line); setShowJobForm(true); }}>Add Job</button>}
        </div>
      </header>

      <section className={styles.filters} aria-label="Financial filters">
        <label><span>Yard</span><select value={yardId} onChange={(event) => { setYardId(event.target.value); window.localStorage.setItem("titan_financial_yard_id", event.target.value); }}>{yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.name}</option>)}</select></label>
        <label><span>Service Line</span><select value={line} onChange={(event) => setLine(event.target.value as FinancialLine | "all")}><option value="all">All Service Lines</option>{lines.map((item) => <option key={item} value={item}>{financialLineNames[item]}</option>)}</select></label>
        <label><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      </section>

      <nav className={styles.tabs} aria-label="Financial views">
        {(["overview", "trackers", "kpis", "cost-basis"] as TabKey[]).map((item) => <button key={item} type="button" className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>{item === "cost-basis" ? "Cost Basis" : item[0].toUpperCase() + item.slice(1)}</button>)}
      </nav>

      {message && <div className={styles.notice}>{message}</div>}

      {showJobForm && (
        <section className={styles.jobForm}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>{editingId ? "Change Existing Row" : "New Tracker Row"}</span><h2>{editingId ? "Edit Financial Job" : "Add Financial Job"}</h2></div><button type="button" onClick={() => { setShowJobForm(false); resetForm(formLine); }}>Close</button></div>
          <div className={styles.formGrid}>
            <label><span>Service Line</span><select value={formLine} disabled={Boolean(editingId)} onChange={(event) => changeFormLine(event.target.value as FinancialLine)}>{lines.map((item) => <option key={item} value={item}>{financialLineNames[item]}</option>)}</select></label>
            <label><span>Job Date</span><input type="date" value={jobDate} onChange={(event) => setJobDate(event.target.value)} /></label>
            <label><span>Job Category</span><select value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)}>{selectedCategories.map((category) => <option key={category.id} value={category.code}>{category.label}</option>)}</select></label>
            {lineFields[formLine].map((field) => <label key={field.key} className={field.kind === "textarea" ? styles.wideField : ""}><span>{field.label}</span>{field.kind === "textarea" ? <textarea value={inputs[field.key] || ""} onChange={(event) => setInputs({ ...inputs, [field.key]: event.target.value })} /> : <input type={field.kind === "number" ? "number" : "text"} step={field.kind === "number" ? "any" : undefined} value={inputs[field.key] || ""} onChange={(event) => setInputs({ ...inputs, [field.key]: event.target.value })} />}</label>)}
          </div>
          {preview && <div className={styles.preview}><div><span>Total Cost</span><strong>{money(preview.total_cost)}</strong></div><div><span>Profit</span><strong>{money(preview.profit)}</strong></div><div><span>Margin</span><strong>{percent(preview.margin)}</strong></div><div><span>Revenue / Manhour</span><strong>{money(preview.rev_per_mh)}</strong></div></div>}
          <div className={styles.formActions}><button type="button" disabled={saving} onClick={() => void runJobAction("preview")}>Preview Cost Math</button><button type="button" disabled={saving} className={styles.primary} onClick={() => void runJobAction(editingId ? "update" : "create")}>{saving ? "Saving..." : editingId ? "Save Changes" : "Add Job"}</button></div>
        </section>
      )}

      {loading ? <div className={styles.loading}>Loading financial records...</div> : null}

      {!loading && tab === "overview" && (
        <>
          <section className={styles.metrics}>
            <div><span>Jobs</span><strong>{totals.jobs.toLocaleString()}</strong></div><div><span>Revenue</span><strong>{money(totals.revenue)}</strong></div>
            <div><span>Total Cost</span><strong>{money(totals.cost)}</strong></div><div><span>Profit</span><strong>{money(totals.profit)}</strong></div>
            <div><span>Gross Margin</span><strong>{percent(totals.margin)}</strong></div><div><span>Revenue / Manhour</span><strong>{money(totals.revenuePerMh)}</strong></div>
          </section>
          <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Customer Performance</span><h2>Revenue and Margin by Operator</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Operator</th><th>Jobs</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{operatorRows.map((row) => <tr key={row.operator}><td>{row.operator}</td><td>{row.jobs}</td><td>{money(row.revenue)}</td><td>{money(row.profit)}</td><td>{percent(row.margin)}</td></tr>)}{!operatorRows.length && <tr><td colSpan={5}>No jobs match this period.</td></tr>}</tbody></table></div></section>
        </>
      )}

      {!loading && tab === "trackers" && <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Source of Truth</span><h2>Job Cost Tracker</h2></div><strong>{jobs.length} rows</strong></div><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Line</th><th>Category</th><th>Invoice</th><th>Operator</th><th>Rig / Yard</th><th>Lead</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th><th>Source</th><th></th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td>{job.job_date.slice(0, 10)}</td><td>{financialLineNames[job.service_line]}</td><td>{categories.find((category) => category.service_line === job.service_line && category.code === job.category_code)?.label || job.category_code}</td><td>{job.invoice || "-"}</td><td>{job.operator || "-"}</td><td>{job.rig || "-"}</td><td>{job.lead || "-"}</td><td>{money(job.revenue)}</td><td>{money(job.computed.total_cost)}</td><td>{money(job.computed.profit)}</td><td>{percent(job.computed.margin)}</td><td>{job.source}</td><td className={styles.rowActions}>{permissions.edit && <><button type="button" onClick={() => beginEdit(job)}>Change</button><button type="button" onClick={() => void voidJob(job)}>Void</button></>}</td></tr>)}{!jobs.length && <tr><td colSpan={13}>No tracker rows match these filters.</td></tr>}</tbody></table></div></section>}

      {!loading && tab === "kpis" && <><section className={styles.metrics}><div><span>Labor % Revenue</span><strong>{percent(totals.laborPercent)}</strong></div><div><span>Revenue / Manhour</span><strong>{money(totals.revenuePerMh)}</strong></div><div><span>% Profit</span><strong>{percent(totals.margin)}</strong></div></section><section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Controlled Targets</span><h2>Active KPI Targets</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Service Line</th><th>Category</th><th>Metric</th><th>Direction</th><th>Target</th><th>Scope</th></tr></thead><tbody>{activeTargets.map((target) => <tr key={target.id}><td>{financialLineNames[target.service_line]}</td><td>{target.category_code}</td><td>{target.metric_key.replaceAll("_", " ")}</td><td>{target.direction === "above" ? "At or above" : "At or below"}</td><td>{target.unit === "percent" ? percent(target.target_value) : target.unit === "currency" ? money(target.target_value) : target.target_value}</td><td>{target.yard_id ? "Yard override" : "Line default"}</td></tr>)}{!activeTargets.length && <tr><td colSpan={6}>No targets are configured for this selection.</td></tr>}</tbody></table></div></section></>}

      {!loading && tab === "cost-basis" && <><section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Frozen Cost Basis</span><h2>Everyday Rates</h2></div><span>New rates affect future saves only.</span></div><div className={styles.rateGrid}>{rates.filter((rate) => line === "all" || rate.service_line === line).map((rate) => <div key={rate.id}><span>{financialLineNames[rate.service_line]}</span><strong>{rate.label}</strong><b>{rate.rate_key === "overhead" ? percent(rate.rate_value) : money(rate.rate_value)}</b></div>)}</div></section><section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Changes Over Time</span><h2>Effective-Dated and Job-Size Rates</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Service Line</th><th>Cost Item</th><th>Effective From</th><th>Minimum Quantity</th><th>Value</th></tr></thead><tbody>{ratePeriods.filter((period) => line === "all" || period.service_line === line).map((period) => <tr key={period.id}><td>{financialLineNames[period.service_line]}</td><td>{period.rate_key}</td><td>{period.effective_from}</td><td>{period.minimum_quantity}</td><td>{money(period.rate_value)}</td></tr>)}{!ratePeriods.length && <tr><td colSpan={5}>No dated or tiered rates have been added.</td></tr>}</tbody></table></div></section></>}
    </main>
  );
}
