"use client";

import { useEffect, useMemo, useState } from "react";
import { financialLineNames, FinancialLine } from "../../lib/financialKpi";
import { supabase } from "../../lib/supabase";
import styles from "./financials.module.css";

type TabKey = "overview" | "trackers" | "kpis" | "cost-basis";
type ViewLine = FinancialLine | "tu" | "all";
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
type TubingWeek = { id: string; week_start: string; manhours: number | string | null };
type TubingEntry = { id: string; week_start: string; customer: string; joints: number | null; jobs: number | null; trucks_in: number | null; trucks_out: number | null };
type TubingRevenue = { id: string; revenue_month: string; customer: string | null; amount: number | string; source: string };
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
  const [line, setLine] = useState<ViewLine>("all");
  const [dateFrom, setDateFrom] = useState(yearStart);
  const [dateTo, setDateTo] = useState(today);
  const [jobs, setJobs] = useState<FinancialJob[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [ratePeriods, setRatePeriods] = useState<RatePeriod[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [tubingWeeks, setTubingWeeks] = useState<TubingWeek[]>([]);
  const [tubingEntries, setTubingEntries] = useState<TubingEntry[]>([]);
  const [tubingRevenue, setTubingRevenue] = useState<TubingRevenue[]>([]);
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
  const [showTubingWeekForm, setShowTubingWeekForm] = useState(false);
  const [tubingWeekStart, setTubingWeekStart] = useState("");
  const [tubingManhours, setTubingManhours] = useState("");
  const [tubingWeekValues, setTubingWeekValues] = useState<Record<string, Record<string, string>>>({});
  const [newTubingCustomer, setNewTubingCustomer] = useState("");
  const [showTubingRevenueForm, setShowTubingRevenueForm] = useState(false);
  const [tubingRevenueMonth, setTubingRevenueMonth] = useState(today.slice(0, 7));
  const [tubingRevenueCustomer, setTubingRevenueCustomer] = useState("");
  const [tubingRevenueAmount, setTubingRevenueAmount] = useState("");

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
    setTubingWeeks(result.tubing?.weeks || []);
    setTubingEntries(result.tubing?.entries || []);
    setTubingRevenue(result.tubing?.revenue || []);
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

  const tubingCustomers = useMemo(() => Array.from(new Set(tubingEntries.map((entry) => entry.customer))).sort(), [tubingEntries]);
  const tubingWeeklyRows = useMemo(() => tubingWeeks.map((week) => {
    const entries = tubingEntries.filter((entry) => entry.week_start.slice(0, 10) === week.week_start.slice(0, 10));
    const joints = entries.reduce((sum, entry) => sum + numberValue(entry.joints), 0);
    const jobs = entries.reduce((sum, entry) => sum + numberValue(entry.jobs), 0);
    const trucksIn = entries.reduce((sum, entry) => sum + numberValue(entry.trucks_in), 0);
    const trucksOut = entries.reduce((sum, entry) => sum + numberValue(entry.trucks_out), 0);
    const manhours = numberValue(week.manhours);
    return { ...week, joints, jobs, trucksIn, trucksOut, manhours, jointsPerMh: manhours ? joints / manhours : 0 };
  }), [tubingWeeks, tubingEntries]);
  const tubingTotals = useMemo(() => {
    const joints = tubingEntries.reduce((sum, entry) => sum + numberValue(entry.joints), 0);
    const jobs = tubingEntries.reduce((sum, entry) => sum + numberValue(entry.jobs), 0);
    const trucksIn = tubingEntries.reduce((sum, entry) => sum + numberValue(entry.trucks_in), 0);
    const trucksOut = tubingEntries.reduce((sum, entry) => sum + numberValue(entry.trucks_out), 0);
    const manhours = tubingWeeks.reduce((sum, week) => sum + numberValue(week.manhours), 0);
    const revenue = tubingRevenue.reduce((sum, row) => sum + numberValue(row.amount), 0);
    return { joints, jobs, trucksIn, trucksOut, manhours, revenue, jointsPerMh: manhours ? joints / manhours : 0 };
  }, [tubingEntries, tubingWeeks, tubingRevenue]);
  const tubingCustomerRows = useMemo(() => tubingCustomers.map((customer) => {
    const rows = tubingEntries.filter((entry) => entry.customer === customer);
    return {
      customer,
      joints: rows.reduce((sum, row) => sum + numberValue(row.joints), 0),
      jobs: rows.reduce((sum, row) => sum + numberValue(row.jobs), 0),
      trucksIn: rows.reduce((sum, row) => sum + numberValue(row.trucks_in), 0),
      trucksOut: rows.reduce((sum, row) => sum + numberValue(row.trucks_out), 0),
    };
  }).sort((a, b) => b.joints - a.joints), [tubingCustomers, tubingEntries]);

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

  function openTubingWeek(week?: TubingWeek) {
    const start = week?.week_start.slice(0, 10) || "";
    const values: Record<string, Record<string, string>> = {};
    tubingCustomers.forEach((customer) => {
      const entry = tubingEntries.find((row) => row.week_start.slice(0, 10) === start && row.customer === customer);
      values[customer] = {
        joints: entry?.joints == null ? "" : String(entry.joints),
        jobs: entry?.jobs == null ? "" : String(entry.jobs),
        trucks_in: entry?.trucks_in == null ? "" : String(entry.trucks_in),
        trucks_out: entry?.trucks_out == null ? "" : String(entry.trucks_out),
      };
    });
    setTubingWeekStart(start);
    setTubingManhours(week?.manhours == null ? "" : String(week.manhours));
    setTubingWeekValues(values);
    setNewTubingCustomer("");
    setShowTubingWeekForm(true);
  }

  function addTubingCustomer() {
    const customer = newTubingCustomer.trim();
    if (!customer) return;
    setTubingWeekValues((current) => current[customer] ? current : { ...current, [customer]: { joints: "", jobs: "", trucks_in: "", trucks_out: "" } });
    setNewTubingCustomer("");
  }

  async function saveTubingWeek() {
    setSaving(true);
    setMessage("");
    const entries = Object.entries(tubingWeekValues).map(([customer, values]) => ({ customer, ...values }));
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_tubing_week", yardId, weekStart: tubingWeekStart, manhours: tubingManhours, entries }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "The Tubing week could not be saved.");
      return;
    }
    setShowTubingWeekForm(false);
    setMessage("Tubing week saved.");
    await loadFinancials();
  }

  async function saveTubingRevenue() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_tubing_revenue", yardId, revenueMonth: `${tubingRevenueMonth}-01`, customer: tubingRevenueCustomer, amount: tubingRevenueAmount }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Tubing revenue could not be saved.");
      return;
    }
    setShowTubingRevenueForm(false);
    setTubingRevenueAmount("");
    setMessage("Tubing revenue saved.");
    await loadFinancials();
  }

  function exportJobs() {
    if (line === "tu") {
      const headers = ["Record Type", "Period", "Customer", "Joints", "Jobs", "Trucks In", "Trucks Out", "Manhours", "Revenue", "Source"];
      const weeklyRows = tubingEntries.map((entry) => ["Weekly Activity", entry.week_start, entry.customer, entry.joints, entry.jobs, entry.trucks_in, entry.trucks_out, tubingWeeks.find((week) => week.week_start.slice(0, 10) === entry.week_start.slice(0, 10))?.manhours, "", ""]);
      const revenueRows = tubingRevenue.map((row) => ["Monthly Revenue", row.revenue_month, row.customer || "(whole month)", "", "", "", "", "", row.amount, row.source]);
      const csv = [headers, ...weeklyRows, ...revenueRows].map((row) => row.map(csvValue).join(",")).join("\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      link.download = `titan-tubing-financials-${dateFrom}-${dateTo}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
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
          {permissions.create && line === "tu" && <button type="button" className={styles.primary} onClick={() => { setTab("trackers"); openTubingWeek(); }}>Add Week</button>}
          {permissions.create && line !== "tu" && <button type="button" className={styles.primary} onClick={() => { resetForm(line === "all" ? "dti" : line); setShowJobForm(true); }}>Add Job</button>}
        </div>
      </header>

      <section className={styles.filters} aria-label="Financial filters">
        <label><span>Yard</span><select value={yardId} onChange={(event) => { setYardId(event.target.value); window.localStorage.setItem("titan_financial_yard_id", event.target.value); }}>{yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.name}</option>)}</select></label>
        <label><span>Service Line</span><select value={line} onChange={(event) => setLine(event.target.value as ViewLine)}><option value="all">All Service Lines</option>{lines.map((item) => <option key={item} value={item}>{financialLineNames[item]}</option>)}<option value="tu">Tubing</option></select></label>
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

      {!loading && tab === "overview" && line !== "tu" && (
        <>
          <section className={styles.metrics}>
            <div><span>Jobs</span><strong>{totals.jobs.toLocaleString()}</strong></div><div><span>Revenue</span><strong>{money(totals.revenue)}</strong></div>
            <div><span>Total Cost</span><strong>{money(totals.cost)}</strong></div><div><span>Profit</span><strong>{money(totals.profit)}</strong></div>
            <div><span>Gross Margin</span><strong>{percent(totals.margin)}</strong></div><div><span>Revenue / Manhour</span><strong>{money(totals.revenuePerMh)}</strong></div>
          </section>
          <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Customer Performance</span><h2>Revenue and Margin by Operator</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Operator</th><th>Jobs</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{operatorRows.map((row) => <tr key={row.operator}><td>{row.operator}</td><td>{row.jobs}</td><td>{money(row.revenue)}</td><td>{money(row.profit)}</td><td>{percent(row.margin)}</td></tr>)}{!operatorRows.length && <tr><td colSpan={5}>No jobs match this period.</td></tr>}</tbody></table></div></section>
        </>
      )}

      {!loading && tab === "overview" && line === "tu" && (
        <>
          <section className={styles.metrics}>
            <div><span>Joints</span><strong>{tubingTotals.joints.toLocaleString()}</strong></div>
            <div><span>Jobs</span><strong>{tubingTotals.jobs.toLocaleString()}</strong></div>
            <div><span>Whole-week Manhours</span><strong>{tubingTotals.manhours.toLocaleString()}</strong></div>
            <div><span>Joints / Manhour</span><strong>{tubingTotals.jointsPerMh.toFixed(2)}</strong></div>
            <div><span>Trucks In / Out</span><strong>{tubingTotals.trucksIn.toLocaleString()} / {tubingTotals.trucksOut.toLocaleString()}</strong></div>
            <div><span>Revenue</span><strong>{money(tubingTotals.revenue)}</strong></div>
          </section>
          <section className={styles.twoColumn}>
            <div className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Weekly Production</span><h2>Tubing Throughput</h2></div><strong>{tubingWeeklyRows.length} weeks</strong></div><div className={styles.tableWrap}><table><thead><tr><th>Week</th><th>Joints</th><th>Jobs</th><th>Trucks In / Out</th><th>Manhours</th><th>Joints / MH</th></tr></thead><tbody>{tubingWeeklyRows.map((week) => <tr key={week.id}><td>{week.week_start.slice(0, 10)}</td><td>{week.joints.toLocaleString()}</td><td>{week.jobs.toLocaleString()}</td><td>{week.trucksIn} / {week.trucksOut}</td><td>{week.manhours.toLocaleString()}</td><td>{week.jointsPerMh ? week.jointsPerMh.toFixed(2) : "-"}</td></tr>)}{!tubingWeeklyRows.length && <tr><td colSpan={6}>No Tubing weeks match this period.</td></tr>}</tbody></table></div></div>
            <div className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Customer Mix</span><h2>Activity by Customer</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Customer</th><th>Joints</th><th>Jobs</th><th>Trucks In / Out</th></tr></thead><tbody>{tubingCustomerRows.map((row) => <tr key={row.customer}><td>{row.customer}</td><td>{row.joints.toLocaleString()}</td><td>{row.jobs.toLocaleString()}</td><td>{row.trucksIn} / {row.trucksOut}</td></tr>)}{!tubingCustomerRows.length && <tr><td colSpan={4}>No customer activity matches this period.</td></tr>}</tbody></table></div></div>
          </section>
        </>
      )}

      {!loading && tab === "trackers" && line !== "tu" && <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Source of Truth</span><h2>Job Cost Tracker</h2></div><strong>{jobs.length} rows</strong></div><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Line</th><th>Category</th><th>Invoice</th><th>Operator</th><th>Rig / Yard</th><th>Lead</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th><th>Source</th><th></th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td>{job.job_date.slice(0, 10)}</td><td>{financialLineNames[job.service_line]}</td><td>{categories.find((category) => category.service_line === job.service_line && category.code === job.category_code)?.label || job.category_code}</td><td>{job.invoice || "-"}</td><td>{job.operator || "-"}</td><td>{job.rig || "-"}</td><td>{job.lead || "-"}</td><td>{money(job.revenue)}</td><td>{money(job.computed.total_cost)}</td><td>{money(job.computed.profit)}</td><td>{percent(job.computed.margin)}</td><td>{job.source}</td><td className={styles.rowActions}>{permissions.edit && <><button type="button" onClick={() => beginEdit(job)}>Change</button><button type="button" onClick={() => void voidJob(job)}>Void</button></>}</td></tr>)}{!jobs.length && <tr><td colSpan={13}>No tracker rows match these filters.</td></tr>}</tbody></table></div></section>}

      {!loading && tab === "trackers" && line === "tu" && <>
        {showTubingWeekForm && <section className={styles.jobForm}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Tubing Production</span><h2>{tubingWeeks.some((week) => week.week_start.slice(0, 10) === tubingWeekStart) ? "Change Weekly Activity" : "Add Weekly Activity"}</h2></div><button type="button" onClick={() => setShowTubingWeekForm(false)}>Close</button></div><div className={styles.formGrid}><label><span>Week Starting Sunday</span><input type="date" value={tubingWeekStart} onChange={(event) => setTubingWeekStart(event.target.value)} /></label><label><span>Whole-week Manhours</span><input type="number" min="0" step="any" value={tubingManhours} onChange={(event) => setTubingManhours(event.target.value)} /></label><label><span>Add Customer</span><input value={newTubingCustomer} onChange={(event) => setNewTubingCustomer(event.target.value)} /></label><div className={styles.inlineAction}><button type="button" onClick={addTubingCustomer}>Add Customer</button></div></div><div className={styles.tableWrap}><table><thead><tr><th>Customer</th><th>Joints</th><th>Jobs</th><th>Trucks In</th><th>Trucks Out</th></tr></thead><tbody>{Object.entries(tubingWeekValues).map(([customer, values]) => <tr key={customer}><td><strong>{customer}</strong></td>{(["joints", "jobs", "trucks_in", "trucks_out"] as const).map((field) => <td key={field}><input className={styles.cellInput} type="number" min="0" step="1" value={values[field] || ""} onChange={(event) => setTubingWeekValues((current) => ({ ...current, [customer]: { ...current[customer], [field]: event.target.value } }))} /></td>)}</tr>)}{!Object.keys(tubingWeekValues).length && <tr><td colSpan={5}>Add a customer to begin this week.</td></tr>}</tbody></table></div><div className={styles.formActions}><button type="button" disabled={saving || !tubingWeekStart} className={styles.primary} onClick={() => void saveTubingWeek()}>{saving ? "Saving..." : "Save Week"}</button></div></section>}
        {showTubingRevenueForm && <section className={styles.jobForm}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Tubing Financials</span><h2>Add or Update Monthly Revenue</h2></div><button type="button" onClick={() => setShowTubingRevenueForm(false)}>Close</button></div><div className={styles.formGrid}><label><span>Month</span><input type="month" value={tubingRevenueMonth} onChange={(event) => setTubingRevenueMonth(event.target.value)} /></label><label><span>Customer</span><input list="tubing-customers" value={tubingRevenueCustomer} onChange={(event) => setTubingRevenueCustomer(event.target.value)} /><datalist id="tubing-customers">{tubingCustomers.map((customer) => <option key={customer} value={customer} />)}</datalist></label><label><span>Revenue</span><input type="number" step="0.01" value={tubingRevenueAmount} onChange={(event) => setTubingRevenueAmount(event.target.value)} /></label></div><div className={styles.formActions}><button type="button" disabled={saving || !tubingRevenueMonth || !tubingRevenueAmount} className={styles.primary} onClick={() => void saveTubingRevenue()}>{saving ? "Saving..." : "Save Revenue"}</button></div></section>}
        <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Source of Truth</span><h2>Tubing Weekly Activity</h2></div><div className={styles.headerActions}>{(permissions.create || permissions.edit) && <button type="button" onClick={() => openTubingWeek()}>Add Week</button>}<strong>{tubingWeeklyRows.length} weeks</strong></div></div><div className={styles.tableWrap}><table><thead><tr><th>Week</th><th>Joints</th><th>Jobs</th><th>Trucks In</th><th>Trucks Out</th><th>Manhours</th><th>Joints / MH</th><th></th></tr></thead><tbody>{tubingWeeklyRows.map((week) => <tr key={week.id}><td>{week.week_start.slice(0, 10)}</td><td>{week.joints.toLocaleString()}</td><td>{week.jobs}</td><td>{week.trucksIn}</td><td>{week.trucksOut}</td><td>{week.manhours.toLocaleString()}</td><td>{week.jointsPerMh ? week.jointsPerMh.toFixed(2) : "-"}</td><td>{permissions.edit && <button type="button" onClick={() => openTubingWeek(week)}>Change</button>}</td></tr>)}{!tubingWeeklyRows.length && <tr><td colSpan={8}>No Tubing weeks match these filters.</td></tr>}</tbody></table></div></section>
        <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Revenue Ledger</span><h2>Tubing Monthly Revenue</h2></div>{(permissions.create || permissions.edit) && <button type="button" onClick={() => setShowTubingRevenueForm(true)}>Add Revenue</button>}</div><div className={styles.tableWrap}><table><thead><tr><th>Month</th><th>Customer</th><th>Amount</th><th>Source</th><th></th></tr></thead><tbody>{tubingRevenue.map((row) => <tr key={row.id}><td>{row.revenue_month.slice(0, 7)}</td><td>{row.customer || "(whole month)"}</td><td>{money(row.amount)}</td><td>{row.source}</td><td>{permissions.edit && <button type="button" onClick={() => { setTubingRevenueMonth(row.revenue_month.slice(0, 7)); setTubingRevenueCustomer(row.customer || ""); setTubingRevenueAmount(String(row.amount)); setShowTubingRevenueForm(true); }}>Change</button>}</td></tr>)}{!tubingRevenue.length && <tr><td colSpan={5}>No Tubing revenue matches these filters.</td></tr>}</tbody></table></div></section>
      </>}

      {!loading && tab === "kpis" && line !== "tu" && <><section className={styles.metrics}><div><span>Labor % Revenue</span><strong>{percent(totals.laborPercent)}</strong></div><div><span>Revenue / Manhour</span><strong>{money(totals.revenuePerMh)}</strong></div><div><span>% Profit</span><strong>{percent(totals.margin)}</strong></div></section><section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Controlled Targets</span><h2>Active KPI Targets</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Service Line</th><th>Category</th><th>Metric</th><th>Direction</th><th>Target</th><th>Scope</th></tr></thead><tbody>{activeTargets.map((target) => <tr key={target.id}><td>{financialLineNames[target.service_line]}</td><td>{target.category_code}</td><td>{target.metric_key.replaceAll("_", " ")}</td><td>{target.direction === "above" ? "At or above" : "At or below"}</td><td>{target.unit === "percent" ? percent(target.target_value) : target.unit === "currency" ? money(target.target_value) : target.target_value}</td><td>{target.yard_id ? "Yard override" : "Line default"}</td></tr>)}{!activeTargets.length && <tr><td colSpan={6}>No targets are configured for this selection.</td></tr>}</tbody></table></div></section></>}
      {!loading && tab === "kpis" && line === "tu" && <section className={styles.metrics}><div><span>Joints</span><strong>{tubingTotals.joints.toLocaleString()}</strong></div><div><span>Joints / Manhour</span><strong>{tubingTotals.jointsPerMh.toFixed(2)}</strong></div><div><span>Jobs</span><strong>{tubingTotals.jobs.toLocaleString()}</strong></div><div><span>Revenue</span><strong>{money(tubingTotals.revenue)}</strong></div></section>}

      {!loading && tab === "cost-basis" && line !== "tu" && <><section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Frozen Cost Basis</span><h2>Everyday Rates</h2></div><span>New rates affect future saves only.</span></div><div className={styles.rateGrid}>{rates.filter((rate) => line === "all" || rate.service_line === line).map((rate) => <div key={rate.id}><span>{financialLineNames[rate.service_line]}</span><strong>{rate.label}</strong><b>{rate.rate_key === "overhead" ? percent(rate.rate_value) : money(rate.rate_value)}</b></div>)}</div></section><section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Changes Over Time</span><h2>Effective-Dated and Job-Size Rates</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Service Line</th><th>Cost Item</th><th>Effective From</th><th>Minimum Quantity</th><th>Value</th></tr></thead><tbody>{ratePeriods.filter((period) => line === "all" || period.service_line === line).map((period) => <tr key={period.id}><td>{financialLineNames[period.service_line]}</td><td>{period.rate_key}</td><td>{period.effective_from}</td><td>{period.minimum_quantity}</td><td>{money(period.rate_value)}</td></tr>)}{!ratePeriods.length && <tr><td colSpan={5}>No dated or tiered rates have been added.</td></tr>}</tbody></table></div></section></>}
      {!loading && tab === "cost-basis" && line === "tu" && <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Throughput Only</span><h2>Tubing Cost Basis</h2></div></div><div className={styles.emptyState}>Tubing currently records weekly production and monthly revenue without job-level cost calculations.</div></section>}
    </main>
  );
}
