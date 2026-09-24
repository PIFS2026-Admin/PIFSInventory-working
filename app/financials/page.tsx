"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { financialLineNames, financialLineRateKeys, FinancialLine } from "../../lib/financialKpi";
import { supabase } from "../../lib/supabase";
import styles from "./financials.module.css";

type TabKey = "overview" | "trackers" | "kpis" | "analytics" | "market" | "reviews" | "cost-basis";
type AnalyticsPage = "financials" | "production" | "lead" | "trends";
type ViewLine = FinancialLine | "tu" | "all";
type ConfigurationLine = FinancialLine | "tu";
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
type PickListValue = { id: string; service_line: ConfigurationLine; list_key: string; list_value: string };
type TubingWeek = { id: string; week_start: string; manhours: number | string | null };
type TubingEntry = { id: string; week_start: string; customer: string; joints: number | null; jobs: number | null; trucks_in: number | null; trucks_out: number | null };
type TubingRevenue = { id: string; revenue_month: string; customer: string | null; amount: number | string; source: string };
type FinancialReview = {
  id: string;
  yard_id: string;
  service_line: FinancialLine;
  quarter: string | null;
  range_start: string;
  range_end: string;
  compare_mode: "prior" | "year";
  status: "open" | "final";
  highlights: string | null;
  lowlights: string | null;
  goals: string | null;
  facts: Record<string, string>;
  snapshot: Record<string, unknown> | null;
  finalized_at: string | null;
};
type FinancialReviewSnapshot = {
  id: string;
  review_id: string;
  snapshot: Record<string, unknown>;
  finalized_at: string;
};
type ReviewSectionKind = "metric" | "chart" | "narrative" | "manual_metric" | "photo" | "rig_movement";
type FinancialReviewSection = {
  id: string;
  review_id: string;
  position: number;
  kind: ReviewSectionKind;
  title: string | null;
  config: Record<string, unknown>;
  body: string | null;
  snapshot: Record<string, unknown> | null;
  computed: Record<string, unknown> | null;
};
type FinancialReviewPhoto = {
  id: string;
  section_id: string;
  caption: string | null;
  file_name: string;
  url: string;
};
type MarketKind = "pf" | "shared" | "comp" | "unknown" | "na";
type MarketService = { id: string; service_key: string; name: string; sort_order: number };
type MarketRig = { id: string; rig_name: string; operator: string; segment: string };
type MarketCell = { id: string; rig_id: string; service_id: string; kind: MarketKind; holder_name: string | null; effective_date: string };
type MarketCompetitor = { id: string; canonical_name: string; is_pathfinder: boolean };
type MarketTrend = { id: string; service_key: string; quarter: string; won_pct: number | string; shared_pct: number | string | null };
type RigMovement = { rig_name: string; operator: string; change: "gained" | "lost" };
type MarketData = {
  setupRequired: boolean;
  services: MarketService[];
  rigs: MarketRig[];
  cells: MarketCell[];
  competitors: MarketCompetitor[];
  trend: MarketTrend[];
};
type Field = { key: string; label: string; kind?: "text" | "number" | "date" | "textarea" };

const lines = Object.keys(financialLineNames) as FinancialLine[];
const configurationLines: ConfigurationLine[] = [...lines, "tu"];
const configurationLineNames: Record<ConfigurationLine, string> = { ...financialLineNames, tu: "Tubing" };
const pickListLabels: Record<string, string> = {
  operator: "Operators", state: "States", size: "Pipe Sizes", connection: "Connections",
  casing_section: "Casing Sections", job_type: "Job Types", items: "Items Washed",
  customer: "Customers", lead: "Crew Leads", band: "Band Thicknesses",
  insp_type: "Inspection Types", reface_type: "Reface Types",
};
const pickListKeys: Record<ConfigurationLine, string[]> = {
  dti: ["operator", "lead", "state", "size", "connection", "casing_section", "insp_type", "reface_type"],
  cdt: ["operator", "lead", "state", "size", "connection", "casing_section"],
  hb: ["operator", "lead", "state", "size", "connection", "casing_section", "band"],
  trs: ["operator", "lead", "state", "size", "connection", "casing_section", "job_type"],
  wash: ["operator", "lead", "items"],
  tu: ["customer"],
};
const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;
const emptyPermissions: PermissionSet = { view: false, create: false, edit: false, approve: false, export: false, manageSettings: false };
const emptyMarket: MarketData = { setupRequired: false, services: [], rigs: [], cells: [], competitors: [], trend: [] };
const reviewFactFields = [
  { key: "writeups", label: "Write-ups", kind: "number" },
  { key: "mocs", label: "MOCs", kind: "number" },
  { key: "suspensions", label: "Suspensions", kind: "number" },
  { key: "downtime", label: "Downtime Hours", kind: "number" },
  { key: "downtime_jobs", label: "Jobs with Downtime", kind: "number" },
  { key: "dvir", label: "DVIR Compliance", kind: "text" },
  { key: "headcount", label: "Headcount", kind: "number" },
  { key: "shop_hours", label: "Shop Hours", kind: "number" },
] as const;

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

function reviewRigMovement(review: FinancialReview, market: MarketData): RigMovement[] {
  const heldAt = (asOf: string) => {
    const latest = new Map<string, MarketCell>();
    market.cells.forEach((cell) => {
      const date = cell.effective_date.slice(0, 10);
      if (date > asOf) return;
      const key = `${cell.rig_id}:${cell.service_id}`;
      const existing = latest.get(key);
      if (!existing || existing.effective_date.slice(0, 10) < date) latest.set(key, cell);
    });
    const held = new Set<string>();
    latest.forEach((cell) => { if (cell.kind === "pf" || cell.kind === "shared") held.add(cell.rig_id); });
    return held;
  };
  const endDate = new Date(`${review.range_end.slice(0, 10)}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const before = heldAt(review.range_start.slice(0, 10));
  const after = heldAt(endDate.toISOString().slice(0, 10));
  return market.rigs.flatMap((rig): RigMovement[] => {
    if (!before.has(rig.id) && after.has(rig.id)) return [{ rig_name: rig.rig_name, operator: rig.operator, change: "gained" }];
    if (before.has(rig.id) && !after.has(rig.id)) return [{ rig_name: rig.rig_name, operator: rig.operator, change: "lost" }];
    return [];
  }).sort((a, b) => a.change.localeCompare(b.change) || a.operator.localeCompare(b.operator) || a.rig_name.localeCompare(b.rig_name));
}

function money(value: unknown) {
  return numberValue(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function percent(value: unknown) {
  return `${(numberValue(value) * 100).toFixed(1)}%`;
}

function matchesNumberFilter(value: unknown, expression = "", percentValue = false) {
  const query = expression.trim().replaceAll(",", "").replaceAll("$", "").replaceAll("%", "");
  if (!query) return true;
  const actual = numberValue(value) * (percentValue ? 100 : 1);
  const range = query.match(/^(-?\d*\.?\d+)\s*-\s*(-?\d*\.?\d+)$/);
  if (range) {
    const minimum = Number(range[1]);
    const maximum = Number(range[2]);
    return actual >= Math.min(minimum, maximum) && actual <= Math.max(minimum, maximum);
  }
  const comparison = query.match(/^(>=|<=|>|<|=)?\s*(-?\d*\.?\d+)$/);
  if (!comparison) return false;
  const expected = Number(comparison[2]);
  if (comparison[1] === ">") return actual > expected;
  if (comparison[1] === ">=") return actual >= expected;
  if (comparison[1] === "<") return actual < expected;
  if (comparison[1] === "<=") return actual <= expected;
  return actual === expected;
}

function matchesTextFilter(value: unknown, query = "") {
  return !query.trim() || String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

function financialCategoryLabel(job: FinancialJob, categories: Category[]) {
  return categories.find((category) => category.service_line === job.service_line && category.code === job.category_code)?.label || job.category_code;
}

function jobQuarter(job: FinancialJob) {
  const month = Number(job.job_date.slice(5, 7));
  return `${job.job_date.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
}

function jobState(job: FinancialJob) {
  return String(job.inputs.state || "");
}

function jobSize(job: FinancialJob) {
  return String(job.inputs.casing_size || job.inputs.size || "");
}

function jobQuantity(job: FinancialJob) {
  if (job.service_line === "dti") return numberValue(job.inputs.joints);
  if (job.service_line === "cdt" || job.service_line === "trs" || job.service_line === "wash") return numberValue(job.inputs.footage);
  return ["dp_box", "dp_pin", "hw_box", "hw_pin", "tub_box", "tub_pin"]
    .reduce((sum, key) => sum + numberValue(job.inputs[key]), 0);
}

function filterSlicedJobs(rows: FinancialJob[], filters: Record<string, string>, categories: Category[], includeCategory = true) {
  return rows.filter((job) =>
    (!filters.month || job.job_date.slice(0, 7) === filters.month) &&
    (!filters.quarter || jobQuarter(job) === filters.quarter) &&
    matchesTextFilter(jobState(job), filters.state) &&
    matchesTextFilter(jobSize(job), filters.size) &&
    matchesTextFilter(job.operator, filters.operator) &&
    matchesTextFilter(job.lead, filters.lead) &&
    (!includeCategory || matchesTextFilter(financialCategoryLabel(job, categories), filters.category)) &&
    matchesNumberFilter(jobQuantity(job), filters.quantity)
  );
}

function summarizeJobs(rows: FinancialJob[]) {
  const summary = rows.reduce((values, job) => {
    const revenue = numberValue(job.revenue);
    values.jobs += 1;
    values.revenue += revenue;
    values.cost += numberValue(job.computed.total_cost);
    values.profit += numberValue(job.computed.profit);
    values.manhours += numberValue(job.manhours);
    values.laborDollars += numberValue(job.computed.labor_pct) * revenue;
    values.quantity += jobQuantity(job);
    return values;
  }, { jobs: 0, revenue: 0, cost: 0, profit: 0, manhours: 0, laborDollars: 0, quantity: 0 });
  return {
    ...summary,
    averageJob: summary.jobs ? summary.revenue / summary.jobs : 0,
    margin: summary.revenue ? summary.profit / summary.revenue : 0,
    laborPercent: summary.revenue ? summary.laborDollars / summary.revenue : 0,
    revenuePerMh: summary.manhours ? summary.revenue / summary.manhours : 0,
    quantityPerMh: summary.manhours ? summary.quantity / summary.manhours : 0,
  };
}

function metricValue(metricKey: string, rows: FinancialJob[]) {
  const revenue = rows.reduce((sum, job) => sum + numberValue(job.revenue), 0);
  const manhours = rows.reduce((sum, job) => sum + numberValue(job.manhours), 0);
  const profit = rows.reduce((sum, job) => sum + numberValue(job.computed.profit), 0);
  if (metricKey === "labor_pct") {
    const laborDollars = rows.reduce((sum, job) => sum + numberValue(job.computed.labor_pct) * numberValue(job.revenue), 0);
    return revenue ? laborDollars / revenue : null;
  }
  if (metricKey === "rev_per_mh") return manhours ? revenue / manhours : null;
  if (metricKey === "margin") return revenue ? profit / revenue : null;
  return null;
}

function formatTargetValue(value: unknown, unit: string) {
  if (unit === "percent") return percent(value);
  if (unit === "currency") return money(value);
  return numberValue(value).toLocaleString();
}

function kpiVerdict(actual: number | null, target: Target | null, met: boolean | null) {
  if (actual === null) return "No matching job data";
  if (!target) return "No target applied";
  const targetValue = numberValue(target.target_value);
  const gap = Math.abs(actual - targetValue);
  if (gap < 0.0000001) return "On target";
  if (met) return `${formatTargetValue(gap, target.unit)} better than target`;
  return target.direction === "below"
    ? `${formatTargetValue(gap, target.unit)} over target`
    : `${formatTargetValue(gap, target.unit)} short of target`;
}

function formatReviewMetric(metricKey: string, value: unknown) {
  if (["revenue", "cost", "profit", "revenue_per_manhour"].includes(metricKey)) return money(value);
  if (["margin", "labor_percent"].includes(metricKey)) return percent(value);
  return numberValue(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function quarterForDate(date: Date) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

const quarterOptions = Array.from({ length: 12 }, (_, index) => {
  const date = new Date();
  date.setMonth(date.getMonth() - index * 3);
  return quarterForDate(date);
});
const targetMetrics = [
  { key: "labor_pct", label: "Labor % Revenue", unit: "percent" },
  { key: "rev_per_mh", label: "Revenue / Manhour", unit: "currency" },
  { key: "margin", label: "Profit Margin", unit: "percent" },
] as const;
const reviewMetrics = [
  { key: "revenue", label: "Revenue" }, { key: "jobs", label: "Jobs" }, { key: "profit", label: "Profit" },
  { key: "margin", label: "Profit Margin" }, { key: "cost", label: "Total Cost" }, { key: "manhours", label: "Manhours" },
  { key: "revenue_per_manhour", label: "Revenue / Manhour" }, { key: "labor_percent", label: "Labor % Revenue" },
] as const;
const reviewChartGroups = [
  { key: "month", label: "Month" }, { key: "operator", label: "Operator" }, { key: "lead", label: "Crew Lead" }, { key: "category", label: "Job Category" },
] as const;

function csvValue(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function initialInputs(line: FinancialLine) {
  return lineFields[line].reduce<Record<string, string>>((values, field) => ({ ...values, [field.key]: "" }), {});
}

function pickListKeyForField(fieldKey: string) {
  if (fieldKey === "casing_size") return "size";
  return ["operator", "state", "size", "connection", "casing_section", "job_type", "items", "lead", "band", "insp_type", "reface_type"].includes(fieldKey) ? fieldKey : "";
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
  const [pickLists, setPickLists] = useState<PickListValue[]>([]);
  const [tubingWeeks, setTubingWeeks] = useState<TubingWeek[]>([]);
  const [tubingEntries, setTubingEntries] = useState<TubingEntry[]>([]);
  const [tubingRevenue, setTubingRevenue] = useState<TubingRevenue[]>([]);
  const [reviews, setReviews] = useState<FinancialReview[]>([]);
  const [reviewSnapshots, setReviewSnapshots] = useState<FinancialReviewSnapshot[]>([]);
  const [reviewSections, setReviewSections] = useState<FinancialReviewSection[]>([]);
  const [reviewComposerSetupRequired, setReviewComposerSetupRequired] = useState(false);
  const [reviewPhotos, setReviewPhotos] = useState<FinancialReviewPhoto[]>([]);
  const [reviewPhotosSetupRequired, setReviewPhotosSetupRequired] = useState(false);
  const [reviewRigMovementSetupRequired, setReviewRigMovementSetupRequired] = useState(false);
  const [market, setMarket] = useState<MarketData>(emptyMarket);
  const [marketAsOf, setMarketAsOf] = useState("");
  const [marketFilters, setMarketFilters] = useState({ operator: "", segment: "" });
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
  const [exporting, setExporting] = useState(false);
  const [showTubingWeekForm, setShowTubingWeekForm] = useState(false);
  const [tubingWeekStart, setTubingWeekStart] = useState("");
  const [tubingManhours, setTubingManhours] = useState("");
  const [tubingWeekValues, setTubingWeekValues] = useState<Record<string, Record<string, string>>>({});
  const [newTubingCustomer, setNewTubingCustomer] = useState("");
  const [showTubingRevenueForm, setShowTubingRevenueForm] = useState(false);
  const [tubingRevenueMonth, setTubingRevenueMonth] = useState(today.slice(0, 7));
  const [tubingRevenueCustomer, setTubingRevenueCustomer] = useState("");
  const [tubingRevenueAmount, setTubingRevenueAmount] = useState("");
  const [jobFilters, setJobFilters] = useState<Record<string, string>>({});
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewId, setReviewId] = useState("");
  const [reviewLine, setReviewLine] = useState<FinancialLine>("dti");
  const [reviewQuarter, setReviewQuarter] = useState(quarterOptions[0]);
  const [reviewPeriodType, setReviewPeriodType] = useState<"quarter" | "custom">("quarter");
  const [reviewRangeStart, setReviewRangeStart] = useState(yearStart);
  const [reviewRangeEnd, setReviewRangeEnd] = useState(today);
  const [reviewCompareMode, setReviewCompareMode] = useState<"prior" | "year">("prior");
  const [sectionEditorReviewId, setSectionEditorReviewId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [sectionKind, setSectionKind] = useState<ReviewSectionKind>("metric");
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionMetric, setSectionMetric] = useState("revenue");
  const [sectionGroup, setSectionGroup] = useState("month");
  const [sectionBody, setSectionBody] = useState("");
  const [sectionManualLabel, setSectionManualLabel] = useState("");
  const [sectionManualValue, setSectionManualValue] = useState("");
  const [reviewHighlights, setReviewHighlights] = useState("");
  const [reviewLowlights, setReviewLowlights] = useState("");
  const [reviewGoals, setReviewGoals] = useState("");
  const [reviewFacts, setReviewFacts] = useState<Record<string, string>>({});
  const [rateEditorType, setRateEditorType] = useState<"base" | "period" | "">("");
  const [rateLine, setRateLine] = useState<FinancialLine>("dti");
  const [rateKey, setRateKey] = useState(financialLineRateKeys.dti[0]);
  const [rateValue, setRateValue] = useState("");
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState(today);
  const [rateMinimumQuantity, setRateMinimumQuantity] = useState("0");
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [targetLine, setTargetLine] = useState<FinancialLine>("dti");
  const [targetCategory, setTargetCategory] = useState("standard");
  const [targetMetric, setTargetMetric] = useState("margin");
  const [targetDirection, setTargetDirection] = useState<"above" | "below">("above");
  const [targetValue, setTargetValue] = useState("");
  const [targetLabel, setTargetLabel] = useState("Goal");
  const [targetScope, setTargetScope] = useState<"yard" | "default">("yard");
  const [analyticsPage, setAnalyticsPage] = useState<AnalyticsPage>("financials");
  const [analyticsFilters, setAnalyticsFilters] = useState<Record<string, string>>({});
  const [kpiComparison, setKpiComparison] = useState<"slice" | "standard">("slice");
  const [settingsEditor, setSettingsEditor] = useState<"category" | "pick-list" | "">("");
  const [settingsId, setSettingsId] = useState("");
  const [settingsLine, setSettingsLine] = useState<ConfigurationLine>("dti");
  const [settingsKey, setSettingsKey] = useState("operator");
  const [settingsCode, setSettingsCode] = useState("");
  const [settingsValue, setSettingsValue] = useState("");

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
    setPickLists(result.pickLists || []);
    setTubingWeeks(result.tubing?.weeks || []);
    setTubingEntries(result.tubing?.entries || []);
    setTubingRevenue(result.tubing?.revenue || []);
    setReviews(result.reviews || []);
    setReviewSnapshots(result.reviewSnapshots || []);
    setReviewSections(result.reviewComposer?.sections || []);
    setReviewComposerSetupRequired(Boolean(result.reviewComposer?.setupRequired));
    setReviewPhotos(result.reviewPhotos?.photos || []);
    setReviewPhotosSetupRequired(Boolean(result.reviewPhotos?.setupRequired));
    setReviewRigMovementSetupRequired(Boolean(result.reviewRigMovement?.setupRequired));
    setMarket(result.market || emptyMarket);
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

  const effectiveTargets = useMemo(() => {
    const effective = new Map<string, Target>();
    activeTargets.forEach((target) => {
      const key = `${target.service_line}:${target.category_code}:${target.metric_key}`;
      const current = effective.get(key);
      if (!current || target.yard_id) effective.set(key, target);
    });
    return Array.from(effective.values()).sort((a, b) => financialLineNames[a.service_line].localeCompare(financialLineNames[b.service_line]) || a.metric_key.localeCompare(b.metric_key));
  }, [activeTargets]);

  const slicedJobs = useMemo(() => filterSlicedJobs(jobs, analyticsFilters, categories), [jobs, analyticsFilters, categories]);
  const kpiJobs = useMemo(() => kpiComparison === "standard"
    ? filterSlicedJobs(jobs, analyticsFilters, categories, false).filter((job) => job.category_code === "standard")
    : slicedJobs, [jobs, analyticsFilters, categories, kpiComparison, slicedJobs]);
  const kpiTotals = useMemo(() => summarizeJobs(kpiJobs), [kpiJobs]);
  const kpiScorecards = useMemo(() => {
    const scorecardLines = (line === "all"
      ? lines.filter((serviceLine) => kpiJobs.some((job) => job.service_line === serviceLine))
      : [line]) as FinancialLine[];
    const targetByKey = new Map(effectiveTargets.map((target) => [`${target.service_line}:${target.category_code}:${target.metric_key}`, target]));
    return scorecardLines.flatMap((serviceLine) => {
      const lineJobs = kpiJobs.filter((job) => job.service_line === serviceLine);
      const categoryCodes = Array.from(new Set(lineJobs.map((job) => job.category_code)));
      const targetCategory = kpiComparison === "standard" ? "standard" : categoryCodes.length === 1 ? categoryCodes[0] : null;
      const categoryLabel = targetCategory
        ? categories.find((category) => category.service_line === serviceLine && category.code === targetCategory)?.label || targetCategory
        : "Mixed categories";
      return targetMetrics.map((metric) => {
        const target = targetCategory ? targetByKey.get(`${serviceLine}:${targetCategory}:${metric.key}`) || null : null;
        const actual = metricValue(metric.key, lineJobs);
        const targetValue = target ? numberValue(target.target_value) : null;
        const met = actual === null || !target ? null : target.direction === "above" ? actual >= targetValue! : actual <= targetValue!;
        const monthlyJobs = new Map<string, FinancialJob[]>();
        lineJobs.forEach((job) => {
          const month = job.job_date.slice(0, 7);
          monthlyJobs.set(month, [...(monthlyJobs.get(month) || []), job]);
        });
        const trend = Array.from(monthlyJobs, ([month, rows]) => {
          const value = metricValue(metric.key, rows);
          return {
            month,
            value,
            met: value === null || !target ? null : target.direction === "above" ? value >= targetValue! : value <= targetValue!,
          };
        }).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
        const trendMaximum = Math.max(targetValue || 0, ...trend.map((point) => point.value || 0), 0) * 1.1;
        const targetHeight = targetValue === null || trendMaximum <= 0 ? null : Math.min(100, Math.max(0, targetValue / trendMaximum * 100));
        const directionalVariance = actual === null || targetValue === null || targetValue === 0
          ? null
          : (actual - targetValue) / Math.abs(targetValue) * (target?.direction === "below" ? -1 : 1);
        const targetPosition = directionalVariance === null ? null : 50 + Math.min(1, Math.max(-1, directionalVariance / 0.35)) * 50;
        return { serviceLine, metric, categoryLabel, target, actual, met, jobCount: lineJobs.length, trend, trendMaximum, targetHeight, targetPosition };
      });
    });
  }, [categories, effectiveTargets, kpiComparison, kpiJobs, line]);

  const monthlyPerformance = useMemo(() => {
    const grouped = new Map<string, { jobs: number; revenue: number; cost: number; profit: number; manhours: number; laborDollars: number }>();
    kpiJobs.forEach((job) => {
      const month = job.job_date.slice(0, 7);
      const current = grouped.get(month) || { jobs: 0, revenue: 0, cost: 0, profit: 0, manhours: 0, laborDollars: 0 };
      current.jobs += 1;
      current.revenue += numberValue(job.revenue);
      current.cost += numberValue(job.computed.total_cost);
      current.profit += numberValue(job.computed.profit);
      current.manhours += numberValue(job.manhours);
      current.laborDollars += numberValue(job.computed.labor_pct) * numberValue(job.revenue);
      grouped.set(month, current);
    });
    return Array.from(grouped, ([month, values]) => ({
      month,
      ...values,
      margin: values.revenue ? values.profit / values.revenue : 0,
      laborPercent: values.revenue ? values.laborDollars / values.revenue : 0,
      revenuePerMh: values.manhours ? values.revenue / values.manhours : 0,
    })).sort((a, b) => b.month.localeCompare(a.month));
  }, [kpiJobs]);

  const filteredJobs = useMemo(() => jobs.filter((job) =>
    matchesTextFilter(financialCategoryLabel(job, categories), jobFilters.category) &&
    matchesTextFilter(job.invoice, jobFilters.invoice) &&
    matchesTextFilter(job.operator, jobFilters.operator) &&
    matchesTextFilter(job.rig, jobFilters.rig) &&
    matchesTextFilter(job.lead, jobFilters.lead) &&
    matchesTextFilter(job.source, jobFilters.source) &&
    matchesNumberFilter(job.revenue, jobFilters.revenue) &&
    matchesNumberFilter(job.computed.total_cost, jobFilters.cost) &&
    matchesNumberFilter(job.computed.profit, jobFilters.profit) &&
    matchesNumberFilter(job.computed.margin, jobFilters.margin, true) &&
    matchesNumberFilter(job.manhours, jobFilters.manhours)
  ), [jobs, jobFilters, categories]);
  const filteredTotals = useMemo(() => {
    const values = filteredJobs.reduce((summary, job) => ({
      revenue: summary.revenue + numberValue(job.revenue),
      cost: summary.cost + numberValue(job.computed.total_cost),
      profit: summary.profit + numberValue(job.computed.profit),
      manhours: summary.manhours + numberValue(job.manhours),
    }), { revenue: 0, cost: 0, profit: 0, manhours: 0 });
    return { ...values, margin: values.revenue ? values.profit / values.revenue : 0 };
  }, [filteredJobs]);
  const filterOptions = useMemo(() => ({
    category: Array.from(new Set(jobs.map((job) => financialCategoryLabel(job, categories)))).sort(),
    invoice: Array.from(new Set(jobs.map((job) => job.invoice).filter(Boolean) as string[])).sort(),
    operator: Array.from(new Set(jobs.map((job) => job.operator).filter(Boolean) as string[])).sort(),
    rig: Array.from(new Set(jobs.map((job) => job.rig).filter(Boolean) as string[])).sort(),
    lead: Array.from(new Set(jobs.map((job) => job.lead).filter(Boolean) as string[])).sort(),
    source: Array.from(new Set(jobs.map((job) => job.source).filter(Boolean))).sort(),
  }), [jobs, categories]);

  const tubingCustomers = useMemo(() => Array.from(new Set([
    ...tubingEntries.map((entry) => entry.customer),
    ...pickLists.filter((value) => value.service_line === "tu" && value.list_key === "customer").map((value) => value.list_value),
  ])).sort(), [tubingEntries, pickLists]);
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

  const visibleReviews = useMemo(() => reviews.filter((review) => line === "all" || review.service_line === line), [reviews, line]);

  const analyticsOptions = useMemo(() => ({
    month: Array.from(new Set(jobs.map((job) => job.job_date.slice(0, 7)))).sort().reverse(),
    quarter: Array.from(new Set(jobs.map(jobQuarter))).sort().reverse(),
    state: Array.from(new Set(jobs.map(jobState).filter(Boolean))).sort(),
    size: Array.from(new Set(jobs.map(jobSize).filter(Boolean))).sort(),
    operator: Array.from(new Set(jobs.map((job) => job.operator).filter(Boolean) as string[])).sort(),
    lead: Array.from(new Set(jobs.map((job) => job.lead).filter(Boolean) as string[])).sort(),
    category: Array.from(new Set(jobs.map((job) => financialCategoryLabel(job, categories)))).sort(),
  }), [jobs, categories]);

  const analyticsJobs = slicedJobs;

  const analyticsTotals = useMemo(() => summarizeJobs(analyticsJobs), [analyticsJobs]);
  const analyticsMonthly = useMemo(() => {
    const grouped = new Map<string, FinancialJob[]>();
    analyticsJobs.forEach((job) => grouped.set(job.job_date.slice(0, 7), [...(grouped.get(job.job_date.slice(0, 7)) || []), job]));
    return Array.from(grouped, ([period, rows]) => ({ period, ...summarizeJobs(rows) })).sort((a, b) => a.period.localeCompare(b.period));
  }, [analyticsJobs]);
  const analyticsQuarterly = useMemo(() => {
    const grouped = new Map<string, FinancialJob[]>();
    analyticsJobs.forEach((job) => grouped.set(jobQuarter(job), [...(grouped.get(jobQuarter(job)) || []), job]));
    return Array.from(grouped, ([period, rows]) => ({ period, ...summarizeJobs(rows) })).sort((a, b) => a.period.localeCompare(b.period));
  }, [analyticsJobs]);
  const analyticsOperators = useMemo(() => {
    const grouped = new Map<string, FinancialJob[]>();
    analyticsJobs.forEach((job) => { const key = job.operator || "Unassigned"; grouped.set(key, [...(grouped.get(key) || []), job]); });
    return Array.from(grouped, ([name, rows]) => ({ name, ...summarizeJobs(rows) })).sort((a, b) => b.revenue - a.revenue);
  }, [analyticsJobs]);
  const analyticsLeads = useMemo(() => {
    const grouped = new Map<string, FinancialJob[]>();
    analyticsJobs.forEach((job) => { const key = job.lead || "Unassigned"; grouped.set(key, [...(grouped.get(key) || []), job]); });
    return Array.from(grouped, ([name, rows]) => ({ name, ...summarizeJobs(rows) })).sort((a, b) => b.revenue - a.revenue);
  }, [analyticsJobs]);
  const analyticsBarMax = Math.max(1, ...analyticsMonthly.map((row) => row.revenue));
  const analyticsQuantityLabel = line === "dti" ? "Joints" : line === "hb" ? "Ends" : line === "all" ? "Production" : "Feet";

  const marketDates = useMemo(() => Array.from(new Set(market.cells.map((cell) => cell.effective_date.slice(0, 10)))).sort().reverse(), [market.cells]);
  const selectedMarketDate = marketAsOf && marketDates.includes(marketAsOf) ? marketAsOf : marketDates[0] || "";
  const marketOperators = useMemo(() => Array.from(new Set(market.rigs.map((rig) => rig.operator).filter(Boolean))).sort(), [market.rigs]);
  const marketSegments = useMemo(() => Array.from(new Set(market.rigs.map((rig) => rig.segment).filter(Boolean))).sort(), [market.rigs]);
  const visibleMarketRigs = useMemo(() => market.rigs.filter((rig) =>
    (!marketFilters.operator || rig.operator === marketFilters.operator) &&
    (!marketFilters.segment || rig.segment === marketFilters.segment)
  ), [market.rigs, marketFilters]);
  const marketCellMap = useMemo(() => {
    const values = new Map<string, MarketCell>();
    market.cells.forEach((cell) => {
      if (selectedMarketDate && cell.effective_date.slice(0, 10) > selectedMarketDate) return;
      const key = `${cell.rig_id}:${cell.service_id}`;
      const current = values.get(key);
      if (!current || current.effective_date < cell.effective_date) values.set(key, cell);
    });
    return values;
  }, [market.cells, selectedMarketDate]);
  const marketShare = useMemo(() => market.services.map((service) => {
    const cells = visibleMarketRigs.map((rig) => marketCellMap.get(`${rig.id}:${service.id}`)).filter(Boolean) as MarketCell[];
    const counts = cells.reduce((sum, cell) => ({ ...sum, [cell.kind]: sum[cell.kind] + 1 }), { pf: 0, shared: 0, comp: 0, unknown: 0, na: 0 } as Record<MarketKind, number>);
    const inPlay = counts.pf + counts.shared + counts.comp + counts.unknown;
    return { ...service, ...counts, inPlay, wonPct: inPlay ? counts.pf / inPlay : 0, sharedPct: inPlay ? counts.shared / inPlay : 0 };
  }), [market.services, visibleMarketRigs, marketCellMap]);
  const marketTotals = useMemo(() => marketShare.reduce((sum, row) => ({
    owned: sum.owned + row.pf, shared: sum.shared + row.shared, competitor: sum.competitor + row.comp, unknown: sum.unknown + row.unknown, inPlay: sum.inPlay + row.inPlay,
  }), { owned: 0, shared: 0, competitor: 0, unknown: 0, inPlay: 0 }), [marketShare]);
  const marketTrendQuarters = useMemo(() => Array.from(new Set(market.trend.map((row) => row.quarter))).sort(), [market.trend]);

  function resetForm(nextLine: FinancialLine = formLine) {
    setEditingId("");
    setFormLine(nextLine);
    setJobDate(today);
    setCategoryCode("standard");
    setInputs(initialInputs(nextLine));
    setPreview(null);
  }

  function updateJobFilter(key: string, value: string) {
    setJobFilters((current) => ({ ...current, [key]: value }));
  }

  function openReview(review?: FinancialReview) {
    const nextLine = review?.service_line || (line === "all" || line === "tu" ? "dti" : line);
    setReviewId(review?.id || "");
    setReviewLine(nextLine);
    setReviewQuarter(review?.quarter || quarterOptions[0]);
    setReviewPeriodType(review ? (review.quarter ? "quarter" : "custom") : "quarter");
    setReviewRangeStart(review?.range_start?.slice(0, 10) || yearStart);
    setReviewRangeEnd(review?.range_end?.slice(0, 10) || today);
    setReviewCompareMode(review?.compare_mode || "prior");
    setReviewHighlights(review?.highlights || "");
    setReviewLowlights(review?.lowlights || "");
    setReviewGoals(review?.goals || "");
    setReviewFacts(review?.facts || {});
    setShowReviewForm(true);
  }

  function openReviewSection(reviewId: string, section?: FinancialReviewSection) {
    setSectionEditorReviewId(reviewId);
    setSectionId(section?.id || "");
    setSectionKind(section?.kind || "metric");
    setSectionTitle(section?.title || "");
    setSectionMetric(String(section?.config?.metric_key || "revenue"));
    setSectionGroup(String(section?.config?.group_by || "month"));
    setSectionBody(section?.body || "");
    setSectionManualLabel(String(section?.config?.label || ""));
    setSectionManualValue(String(section?.config?.value || ""));
  }

  function openBaseRate(rate: Rate) {
    setRateEditorType("base");
    setRateLine(rate.service_line);
    setRateKey(rate.rate_key);
    setRateValue(String(rate.rate_key === "overhead" ? numberValue(rate.rate_value) * 100 : rate.rate_value));
  }

  function openRatePeriod() {
    const nextLine = line === "all" || line === "tu" ? "dti" : line;
    setRateEditorType("period");
    setRateLine(nextLine);
    setRateKey(financialLineRateKeys[nextLine][0]);
    setRateValue("");
    setRateEffectiveFrom(today);
    setRateMinimumQuantity("0");
  }

  function changeRateLine(nextLine: FinancialLine) {
    setRateLine(nextLine);
    setRateKey(financialLineRateKeys[nextLine][0]);
  }

  async function saveRate() {
    setSaving(true);
    setMessage("");
    const storedValue = rateKey === "overhead" ? Number(rateValue) / 100 : Number(rateValue);
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: rateEditorType === "base" ? "save_base_rate" : "save_rate_period",
        yardId, line: rateLine, rateKey, rateValue: storedValue,
        effectiveFrom: rateEffectiveFrom, minimumQuantity: rateMinimumQuantity,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "The financial rate could not be saved.");
      return;
    }
    setRateEditorType("");
    setMessage(rateEditorType === "base" ? "Everyday rate updated. Existing jobs retained their frozen rates." : "Scheduled rate saved for future matching jobs.");
    await loadFinancials();
  }

  async function deactivateRatePeriod(period: RatePeriod) {
    if (!window.confirm(`Deactivate the ${period.rate_key} schedule effective ${period.effective_from}?`)) return;
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate_rate_period", yardId, id: period.id }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Scheduled rate deactivated. Existing jobs were not changed." : result.error || "The scheduled rate could not be deactivated.");
    if (response.ok) await loadFinancials();
  }

  function openTarget(target?: Target) {
    const nextLine = target?.service_line || (line === "all" || line === "tu" ? "dti" : line);
    const unit = targetMetrics.find((metric) => metric.key === target?.metric_key)?.unit;
    setTargetId(target?.id || "");
    setTargetLine(nextLine);
    setTargetCategory(target?.category_code || categories.find((category) => category.service_line === nextLine)?.code || "standard");
    setTargetMetric(target?.metric_key || "margin");
    setTargetDirection(target?.direction || "above");
    setTargetValue(target ? String(unit === "percent" ? numberValue(target.target_value) * 100 : target.target_value) : "");
    setTargetLabel(target?.label || "Goal");
    setTargetScope(target?.yard_id ? "yard" : target ? "default" : "yard");
    setShowTargetForm(true);
  }

  function changeTargetLine(nextLine: FinancialLine) {
    setTargetLine(nextLine);
    setTargetCategory(categories.find((category) => category.service_line === nextLine)?.code || "standard");
  }

  function openCategory(category?: Category) {
    const nextLine = (category?.service_line || (line === "all" || line === "tu" ? "dti" : line)) as FinancialLine;
    setSettingsEditor("category");
    setSettingsId(category?.id || "");
    setSettingsLine(nextLine);
    setSettingsCode(category?.code || "");
    setSettingsValue(category?.label || "");
  }

  function openPickList(value?: PickListValue) {
    const nextLine = value?.service_line || (line === "all" ? "dti" : line);
    setSettingsEditor("pick-list");
    setSettingsId(value?.id || "");
    setSettingsLine(nextLine);
    setSettingsKey(value?.list_key || pickListKeys[nextLine][0]);
    setSettingsValue(value?.list_value || "");
    setSettingsCode("");
  }

  function changeSettingsLine(nextLine: ConfigurationLine) {
    setSettingsLine(nextLine);
    if (settingsEditor === "pick-list") setSettingsKey(pickListKeys[nextLine][0]);
  }

  async function saveSetting() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(settingsEditor === "category"
        ? { action: "save_category", yardId, id: settingsId || undefined, line: settingsLine, code: settingsCode || undefined, label: settingsValue }
        : { action: "save_pick_list_value", yardId, id: settingsId || undefined, line: settingsLine, listKey: settingsKey, listValue: settingsValue }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "The financial setting could not be saved.");
      return;
    }
    setSettingsEditor("");
    setMessage(settingsEditor === "category" ? "Job category saved." : "Pick-list value saved.");
    await loadFinancials();
  }

  async function deactivateSetting(kind: "category" | "pick-list", id: string, label: string) {
    if (!window.confirm(`Deactivate ${label}? Existing historical rows will remain unchanged.`)) return;
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: kind === "category" ? "deactivate_category" : "deactivate_pick_list_value", yardId, id }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? `${kind === "category" ? "Category" : "Pick-list value"} deactivated.` : result.error || "The setting could not be deactivated.");
    if (response.ok) await loadFinancials();
  }

  async function saveTarget() {
    setSaving(true);
    setMessage("");
    const unit = targetMetrics.find((metric) => metric.key === targetMetric)?.unit;
    const storedValue = unit === "percent" ? Number(targetValue) / 100 : Number(targetValue);
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_target", id: targetId || undefined, yardId, line: targetLine, categoryCode: targetCategory, metricKey: targetMetric, direction: targetDirection, targetValue: storedValue, label: targetLabel, scope: targetScope }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "The KPI target could not be saved.");
      return;
    }
    setShowTargetForm(false);
    setMessage(targetScope === "yard" ? "Yard KPI target saved." : "Company-default KPI target saved.");
    await loadFinancials();
  }

  async function deactivateTarget(target: Target) {
    if (!window.confirm(`Deactivate the ${target.metric_key.replaceAll("_", " ")} target for ${financialLineNames[target.service_line]}?`)) return;
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate_target", yardId, id: target.id }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "KPI target deactivated." : result.error || "The KPI target could not be deactivated.");
    if (response.ok) await loadFinancials();
  }

  async function saveReview() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_review", yardId, id: reviewId, line: reviewLine, quarter: reviewPeriodType === "quarter" ? reviewQuarter : null, rangeStart: reviewPeriodType === "custom" ? reviewRangeStart : null, rangeEnd: reviewPeriodType === "custom" ? reviewRangeEnd : null, compareMode: reviewCompareMode, highlights: reviewHighlights, lowlights: reviewLowlights, goals: reviewGoals, facts: reviewFacts }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "The financial review could not be saved.");
      return;
    }
    setShowReviewForm(false);
    setReviewId("");
    setMessage("Financial review saved as open.");
    await loadFinancials();
  }

  async function saveReviewSection() {
    setSaving(true);
    setMessage("");
    const config = sectionKind === "manual_metric"
      ? { label: sectionManualLabel.trim(), value: sectionManualValue.trim() }
      : sectionKind === "chart"
        ? { metric_key: sectionMetric, group_by: sectionGroup }
        : sectionKind === "metric" ? { metric_key: sectionMetric } : {};
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_review_section", yardId, reviewId: sectionEditorReviewId, sectionId, kind: sectionKind, title: sectionTitle, body: sectionBody, config }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "The review section could not be saved.");
      return;
    }
    setSectionEditorReviewId("");
    setMessage("Review section saved.");
    await loadFinancials();
  }

  async function deactivateReviewSection(section: FinancialReviewSection) {
    if (!window.confirm(`Remove ${section.title || "this section"} from the open review?`)) return;
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate_review_section", yardId, sectionId: section.id }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Review section removed." : result.error || "The review section could not be removed.");
    if (response.ok) await loadFinancials();
  }

  async function uploadReviewPhoto(section: FinancialReviewSection, file: File | null) {
    if (!file) return;
    setSaving(true);
    setMessage("");
    const form = new FormData();
    form.set("yardId", yardId);
    form.set("sectionId", section.id);
    form.set("caption", section.body || section.title || "");
    form.set("file", file);
    const response = await fetch("/api/financials", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    setMessage(response.ok ? "Review photo added." : result.error || "The review photo could not be added.");
    if (response.ok) await loadFinancials();
  }

  async function removeReviewPhoto(photo: FinancialReviewPhoto) {
    if (!window.confirm(`Remove ${photo.file_name} from this review? The audit record will be retained.`)) return;
    const response = await fetch("/api/financials", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ yardId, photoId: photo.id }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Review photo removed." : result.error || "The review photo could not be removed.");
    if (response.ok) await loadFinancials();
  }

  async function applyReviewTemplate(review: FinancialReview) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply_review_template", yardId, reviewId: review.id }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "The standard review template could not be added.");
      return;
    }
    setMessage("Standard management review template added. Every section remains editable.");
    await loadFinancials();
  }

  async function moveReviewSection(reviewId: string, sectionIdToMove: string, direction: -1 | 1) {
    const ordered = reviewSections.filter((section) => section.review_id === reviewId).sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((section) => section.id === sectionIdToMove);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder_review_sections", yardId, reviewId, sectionIds: ordered.map((section) => section.id) }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Review sections reordered." : result.error || "The review sections could not be reordered.");
    if (response.ok) await loadFinancials();
  }

  async function finalizeReview(review: FinancialReview) {
    const periodLabel = review.quarter || `${review.range_start.slice(0, 10)} to ${review.range_end.slice(0, 10)}`;
    if (!window.confirm(`Finalize ${periodLabel} for ${financialLineNames[review.service_line]}? The KPI snapshot will be locked.`)) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finalize_review", yardId, id: review.id }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    setMessage(response.ok ? `${periodLabel} review finalized with a frozen KPI snapshot.` : result.error || "The review could not be finalized.");
    if (response.ok) await loadFinancials();
  }

  async function reopenReview(review: FinancialReview) {
    const reason = window.prompt("Why is this finalized review being reopened? The prior snapshot will remain in history.");
    if (reason === null) return;
    if (reason.trim().length < 8) {
      setMessage("Enter a clear reason of at least 8 characters before reopening the review.");
      return;
    }
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/financials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen_review", yardId, id: review.id, reason: reason.trim() }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    setMessage(response.ok ? "Review reopened. The prior finalized snapshot remains in history." : result.error || "The review could not be reopened.");
    if (response.ok) await loadFinancials();
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

  async function exportJobs() {
    if (tab === "market") {
      const headers = ["As Of", "Operator", "Rig", "Standing", ...market.services.map((service) => service.name)];
      const rows = visibleMarketRigs.map((rig) => [selectedMarketDate, rig.operator, rig.rig_name, rig.segment, ...market.services.map((service) => {
        const cell = marketCellMap.get(`${rig.id}:${service.id}`);
        if (!cell) return "No record";
        const status = { pf: "Pathfinder", shared: "Shared", comp: "Competitor", unknown: "Unknown", na: "Not applicable" }[cell.kind];
        return cell.holder_name ? `${status}: ${cell.holder_name}` : status;
      })]);
      const csv = [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      link.download = `titan-market-share-${selectedMarketDate || "current"}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
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
    if (!filteredJobs.length) {
      setMessage("No visible tracker rows are available to export.");
      return;
    }
    setExporting(true);
    setMessage("");
    const filterLabels: Record<string, string> = { category: "Category", invoice: "Invoice", operator: "Operator", rig: "Rig / Yard", lead: "Lead", revenue: "Revenue", cost: "Cost", profit: "Profit", margin: "Margin", manhours: "Manhours", source: "Source" };
    const filterSummary = Object.entries(jobFilters).filter(([, value]) => value.trim()).map(([key, value]) => `${filterLabels[key] || key}: ${value}`).join(" | ");
    try {
      const response = await fetch("/api/financials", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export_tracker", yardId, line, dateFrom, dateTo, jobIds: filteredJobs.map((job) => job.id), filterSummary }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "The tracker workbook could not be created.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `titan-financial-tracker-${dateFrom}-${dateTo}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`${filteredJobs.length} filtered tracker row${filteredJobs.length === 1 ? "" : "s"} exported to Excel.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The tracker workbook could not be created.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>KPI / Financial</span><h1>Financial Performance</h1><p>Controlled job-cost reporting with frozen historical calculations.</p></div>
        <div className={styles.headerActions}>
          {permissions.export && <button type="button" disabled={exporting} onClick={() => void exportJobs()}>{exporting ? "Exporting..." : tab === "market" || line === "tu" ? "Export CSV" : "Export Excel"}</button>}
          {permissions.create && line === "tu" && tab !== "market" && <button type="button" className={styles.primary} onClick={() => { setTab("trackers"); openTubingWeek(); }}>Add Week</button>}
          {permissions.create && line !== "tu" && tab === "reviews" && <button type="button" className={styles.primary} onClick={() => openReview()}>New Review</button>}
          {permissions.create && line !== "tu" && ["overview", "trackers"].includes(tab) && <button type="button" className={styles.primary} onClick={() => { resetForm(line === "all" ? "dti" : line); setShowJobForm(true); }}>Add Job</button>}
        </div>
      </header>

      <section className={styles.filters} aria-label="Financial filters">
        <label><span>Yard</span><select value={yardId} onChange={(event) => { setJobFilters({}); setAnalyticsFilters({}); setYardId(event.target.value); window.localStorage.setItem("titan_financial_yard_id", event.target.value); }}>{yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.name}</option>)}</select></label>
        {tab !== "market" && <><label><span>Service Line</span><select value={line} onChange={(event) => { setJobFilters({}); setAnalyticsFilters({}); setLine(event.target.value as ViewLine); }}><option value="all">All Service Lines</option>{lines.map((item) => <option key={item} value={item}>{financialLineNames[item]}</option>)}<option value="tu">Tubing</option></select></label>
        <label><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></>}
        {tab === "market" && <><label><span>Market Snapshot</span><select value={selectedMarketDate} onChange={(event) => setMarketAsOf(event.target.value)}>{marketDates.map((date) => <option key={date} value={date}>{new Date(`${date}T00:00:00`).toLocaleDateString()}</option>)}</select></label><label><span>Operator</span><select value={marketFilters.operator} onChange={(event) => setMarketFilters((current) => ({ ...current, operator: event.target.value }))}><option value="">All Operators</option>{marketOperators.map((operator) => <option key={operator}>{operator}</option>)}</select></label><label><span>Standing</span><select value={marketFilters.segment} onChange={(event) => setMarketFilters((current) => ({ ...current, segment: event.target.value }))}><option value="">All Standings</option>{marketSegments.map((segment) => <option key={segment}>{segment}</option>)}</select></label></>}
      </section>

      <nav className={styles.tabs} aria-label="Financial views">
        {(["overview", "trackers", "kpis", "analytics", "market", "reviews", "cost-basis"] as TabKey[]).map((item) => <button key={item} type="button" className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>{item === "cost-basis" ? "Cost Basis" : item === "market" ? "Market Share" : item[0].toUpperCase() + item.slice(1)}</button>)}
      </nav>

      {message && <div className={styles.notice}>{message}</div>}

      {showJobForm && (
        <section className={styles.jobForm}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>{editingId ? "Change Existing Row" : "New Tracker Row"}</span><h2>{editingId ? "Edit Financial Job" : "Add Financial Job"}</h2></div><button type="button" onClick={() => { setShowJobForm(false); resetForm(formLine); }}>Close</button></div>
          <div className={styles.formGrid}>
            <label><span>Service Line</span><select value={formLine} disabled={Boolean(editingId)} onChange={(event) => changeFormLine(event.target.value as FinancialLine)}>{lines.map((item) => <option key={item} value={item}>{financialLineNames[item]}</option>)}</select></label>
            <label><span>Job Date</span><input type="date" value={jobDate} onChange={(event) => setJobDate(event.target.value)} /></label>
            <label><span>Job Category</span><select value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)}>{selectedCategories.map((category) => <option key={category.id} value={category.code}>{category.label}</option>)}</select></label>
            {lineFields[formLine].map((field) => {
              const listKey = pickListKeyForField(field.key);
              const options = listKey ? pickLists.filter((value) => value.service_line === formLine && value.list_key === listKey) : [];
              const listId = options.length ? `financial-entry-${formLine}-${field.key}` : undefined;
              return <label key={field.key} className={field.kind === "textarea" ? styles.wideField : ""}><span>{field.label}</span>{field.kind === "textarea" ? <textarea value={inputs[field.key] || ""} onChange={(event) => setInputs({ ...inputs, [field.key]: event.target.value })} /> : <><input list={listId} type={field.kind === "number" ? "number" : "text"} step={field.kind === "number" ? "any" : undefined} value={inputs[field.key] || ""} onChange={(event) => setInputs({ ...inputs, [field.key]: event.target.value })} />{listId && <datalist id={listId}>{options.map((option) => <option key={option.id} value={option.list_value} />)}</datalist>}</>}</label>;
            })}
          </div>
          {preview && <div className={styles.preview}><div><span>Total Cost</span><strong>{money(preview.total_cost)}</strong></div><div><span>Profit</span><strong>{money(preview.profit)}</strong></div><div><span>Margin</span><strong>{percent(preview.margin)}</strong></div><div><span>Revenue / Manhour</span><strong>{money(preview.rev_per_mh)}</strong></div></div>}
          <div className={styles.formActions}><button type="button" disabled={saving} onClick={() => void runJobAction("preview")}>Preview Cost Math</button><button type="button" disabled={saving} className={styles.primary} onClick={() => void runJobAction(editingId ? "update" : "create")}>{saving ? "Saving..." : editingId ? "Save Changes" : "Add Job"}</button></div>
        </section>
      )}

      {showReviewForm && (
        <section className={styles.jobForm}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>{reviewId ? "Open Review" : "Review Window"}</span><h2>{reviewId ? "Edit Financial Review" : "Start Financial Review"}</h2></div><button type="button" onClick={() => setShowReviewForm(false)}>Close</button></div>
          <div className={styles.formGrid}>
            <label><span>Service Line</span><select value={reviewLine} disabled={Boolean(reviewId)} onChange={(event) => setReviewLine(event.target.value as FinancialLine)}>{lines.map((item) => <option key={item} value={item}>{financialLineNames[item]}</option>)}</select></label>
            <label><span>Review Period</span><select value={reviewPeriodType} disabled={Boolean(reviewId)} onChange={(event) => setReviewPeriodType(event.target.value as "quarter" | "custom")}><option value="quarter">Standard Quarter</option><option value="custom">Custom Date Window</option></select></label>
            {reviewPeriodType === "quarter" ? <label><span>Quarter</span><select value={reviewQuarter} disabled={Boolean(reviewId)} onChange={(event) => setReviewQuarter(event.target.value)}>{quarterOptions.map((quarter) => <option key={quarter} value={quarter}>{quarter}</option>)}</select></label> : <><label><span>From</span><input type="date" value={reviewRangeStart} disabled={Boolean(reviewId)} onChange={(event) => setReviewRangeStart(event.target.value)} /></label><label><span>Through</span><input type="date" value={reviewRangeEnd} disabled={Boolean(reviewId)} onChange={(event) => setReviewRangeEnd(event.target.value)} /></label></>}
            <label><span>Compare Against</span><select value={reviewCompareMode} onChange={(event) => setReviewCompareMode(event.target.value as "prior" | "year")}><option value="prior">Immediately prior period</option><option value="year">Same dates last year</option></select></label>
            <label className={styles.reviewNarrative}><span>Highlights</span><textarea value={reviewHighlights} onChange={(event) => setReviewHighlights(event.target.value)} placeholder="What performed well?" /></label>
            <label className={styles.reviewNarrative}><span>Lowlights</span><textarea value={reviewLowlights} onChange={(event) => setReviewLowlights(event.target.value)} placeholder="What missed expectations?" /></label>
            <label className={styles.reviewNarrative}><span>Goals</span><textarea value={reviewGoals} onChange={(event) => setReviewGoals(event.target.value)} placeholder="What should improve next quarter?" /></label>
            <div className={styles.reviewFactsEditor}>
              <div><span className={styles.eyebrow}>Review Facts</span><p>Operational figures not held in the financial tracker.</p></div>
              <div>{reviewFactFields.map((field) => <label key={field.key}><span>{field.label}</span><input type={field.kind} min={field.kind === "number" ? "0" : undefined} step={field.kind === "number" ? "any" : undefined} value={reviewFacts[field.key] || ""} onChange={(event) => setReviewFacts((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}</div>
              <label><span>Other Facts Worth Recording</span><textarea value={reviewFacts.other || ""} onChange={(event) => setReviewFacts((current) => ({ ...current, other: event.target.value }))} placeholder="Optional context for the management record" /></label>
            </div>
          </div>
          <div className={styles.formActions}><button type="button" disabled={saving} className={styles.primary} onClick={() => void saveReview()}>{saving ? "Saving..." : "Save Open Review"}</button></div>
        </section>
      )}

      {sectionEditorReviewId && (
        <section className={styles.jobForm}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Review Composer</span><h2>{sectionId ? "Edit Review Section" : "Add Review Section"}</h2></div><button type="button" onClick={() => setSectionEditorReviewId("")}>Close</button></div>
          <div className={styles.formGrid}>
            <label><span>Section Type</span><select value={sectionKind} disabled={Boolean(sectionId)} onChange={(event) => setSectionKind(event.target.value as ReviewSectionKind)}><option value="metric">Metric Comparison</option><option value="chart">Chart</option><option value="rig_movement" disabled={reviewRigMovementSetupRequired}>Rigs Gained / Lost</option><option value="narrative">Narrative</option><option value="manual_metric">Manual Value</option><option value="photo" disabled={reviewPhotosSetupRequired}>Photo Gallery</option></select></label>
            <label><span>Section Title</span><input value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} placeholder="Optional heading" /></label>
            {(sectionKind === "metric" || sectionKind === "chart") && <label><span>Metric</span><select value={sectionMetric} onChange={(event) => setSectionMetric(event.target.value)}>{reviewMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label>}
            {sectionKind === "chart" && <label><span>Group By</span><select value={sectionGroup} onChange={(event) => setSectionGroup(event.target.value)}>{reviewChartGroups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label>}
            {sectionKind === "narrative" && <label className={styles.reviewNarrative}><span>Narrative</span><textarea value={sectionBody} onChange={(event) => setSectionBody(event.target.value)} placeholder="Review commentary" /></label>}
            {sectionKind === "photo" && <label className={styles.reviewNarrative}><span>Gallery Caption</span><textarea value={sectionBody} onChange={(event) => setSectionBody(event.target.value)} placeholder="What do these photos document?" /></label>}
            {sectionKind === "manual_metric" && <><label><span>Label</span><input value={sectionManualLabel} onChange={(event) => setSectionManualLabel(event.target.value)} placeholder="Headcount, downtime, delivered joints..." /></label><label><span>Value</span><input value={sectionManualValue} onChange={(event) => setSectionManualValue(event.target.value)} /></label></>}
          </div>
          <div className={styles.rateWarning}>Computed sections use the review window and comparison setting. Their values freeze when the review is finalized.</div>
          <div className={styles.formActions}><button type="button" disabled={saving || (sectionKind === "narrative" && !sectionBody.trim()) || (sectionKind === "manual_metric" && !sectionManualLabel.trim())} className={styles.primary} onClick={() => void saveReviewSection()}>{saving ? "Saving..." : "Save Section"}</button></div>
        </section>
      )}

      {rateEditorType && (
        <section className={styles.jobForm}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Controlled Cost Basis</span><h2>{rateEditorType === "base" ? "Edit Everyday Rate" : "Add Scheduled Rate"}</h2></div><button type="button" onClick={() => setRateEditorType("")}>Close</button></div>
          <div className={styles.formGrid}>
            <label><span>Service Line</span><select value={rateLine} disabled={rateEditorType === "base"} onChange={(event) => changeRateLine(event.target.value as FinancialLine)}>{lines.map((item) => <option key={item} value={item}>{financialLineNames[item]}</option>)}</select></label>
            <label><span>Cost Item</span><select value={rateKey} disabled={rateEditorType === "base"} onChange={(event) => setRateKey(event.target.value)}>{financialLineRateKeys[rateLine].map((key) => <option key={key} value={key}>{rates.find((rate) => rate.service_line === rateLine && rate.rate_key === key)?.label || key.replaceAll("_", " ")}</option>)}</select></label>
            {rateEditorType === "period" ? <><label><span>Effective From</span><input type="date" value={rateEffectiveFrom} onChange={(event) => setRateEffectiveFrom(event.target.value)} /></label><label><span>Minimum Job Quantity</span><input type="number" min="0" step="any" value={rateMinimumQuantity} onChange={(event) => setRateMinimumQuantity(event.target.value)} /></label></> : null}
            <label><span>{rateKey === "overhead" ? "Rate Percent" : "Rate Value"}</span><input type="number" min="0" step="any" value={rateValue} onChange={(event) => setRateValue(event.target.value)} /></label>
          </div>
          <div className={styles.rateWarning}>Saved jobs retain their original cost basis. This change applies only when a future job is added or previewed.</div>
          <div className={styles.formActions}><button type="button" disabled={saving || rateValue === ""} className={styles.primary} onClick={() => void saveRate()}>{saving ? "Saving..." : "Save Rate"}</button></div>
        </section>
      )}

      {settingsEditor && (
        <section className={styles.jobForm}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Controlled Configuration</span><h2>{settingsId ? "Edit" : "Add"} {settingsEditor === "category" ? "Job Category" : "Pick-List Value"}</h2></div><button type="button" onClick={() => setSettingsEditor("")}>Close</button></div>
          <div className={styles.formGrid}>
            <label><span>Service Line</span><select value={settingsLine} disabled={Boolean(settingsId)} onChange={(event) => changeSettingsLine(event.target.value as ConfigurationLine)}>{configurationLines.filter((item) => settingsEditor === "pick-list" || item !== "tu").map((item) => <option key={item} value={item}>{configurationLineNames[item]}</option>)}</select></label>
            {settingsEditor === "category" && <label><span>Code</span><input value={settingsCode} disabled={Boolean(settingsId)} placeholder="Created automatically" onChange={(event) => setSettingsCode(event.target.value)} /></label>}
            {settingsEditor === "pick-list" && <label><span>List</span><select value={settingsKey} disabled={Boolean(settingsId)} onChange={(event) => setSettingsKey(event.target.value)}>{pickListKeys[settingsLine].map((key) => <option key={key} value={key}>{pickListLabels[key]}</option>)}</select></label>}
            <label><span>{settingsEditor === "category" ? "Category Name" : "Value"}</span><input value={settingsValue} onChange={(event) => setSettingsValue(event.target.value)} /></label>
          </div>
          <div className={styles.rateWarning}>Changes apply to future entry choices. Existing financial rows keep their original saved values and calculations.</div>
          <div className={styles.formActions}><button type="button" disabled={saving || !settingsValue.trim()} className={styles.primary} onClick={() => void saveSetting()}>{saving ? "Saving..." : "Save"}</button></div>
        </section>
      )}

      {showTargetForm && (
        <section className={styles.jobForm}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Controlled KPI</span><h2>{targetId ? "Edit KPI Target" : "Add KPI Target"}</h2></div><button type="button" onClick={() => setShowTargetForm(false)}>Close</button></div>
          <div className={styles.formGrid}>
            <label><span>Service Line</span><select value={targetLine} disabled={Boolean(targetId)} onChange={(event) => changeTargetLine(event.target.value as FinancialLine)}>{lines.map((item) => <option key={item} value={item}>{financialLineNames[item]}</option>)}</select></label>
            <label><span>Category</span><select value={targetCategory} disabled={Boolean(targetId)} onChange={(event) => setTargetCategory(event.target.value)}>{categories.filter((category) => category.service_line === targetLine).map((category) => <option key={category.id} value={category.code}>{category.label}</option>)}</select></label>
            <label><span>Metric</span><select value={targetMetric} disabled={Boolean(targetId)} onChange={(event) => setTargetMetric(event.target.value)}>{targetMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label>
            <label><span>Direction</span><select value={targetDirection} onChange={(event) => setTargetDirection(event.target.value as "above" | "below")}><option value="above">At or above</option><option value="below">At or below</option></select></label>
            <label><span>{targetMetrics.find((metric) => metric.key === targetMetric)?.unit === "percent" ? "Target Percent" : "Target Value"}</span><input type="number" min="0" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} /></label>
            <label><span>Label</span><input type="text" value={targetLabel} onChange={(event) => setTargetLabel(event.target.value)} /></label>
            <label><span>Scope</span><select value={targetScope} disabled={Boolean(targetId)} onChange={(event) => setTargetScope(event.target.value as "yard" | "default")}><option value="yard">This yard</option><option value="default">Company default</option></select></label>
          </div>
          <div className={styles.rateWarning}>{targetScope === "yard" ? "This target overrides the company default for the selected yard." : "This target becomes the default for every yard that does not have its own override."}</div>
          <div className={styles.formActions}><button type="button" disabled={saving || targetValue === ""} className={styles.primary} onClick={() => void saveTarget()}>{saving ? "Saving..." : "Save Target"}</button></div>
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

      {!loading && tab === "analytics" && line !== "tu" && <>
        <section className={styles.analyticsControls}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>Shared Analysis</span><h2>Financial and Production Analytics</h2></div>
            <div className={styles.headerActions}><strong>{analyticsJobs.length} of {jobs.length} jobs</strong>{Object.values(analyticsFilters).some(Boolean) && <button type="button" onClick={() => setAnalyticsFilters({})}>Clear Slicers</button>}</div>
          </div>
          <div className={styles.analyticsFilters}>
            <label><span>Year / Month</span><select value={analyticsFilters.month || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, month: event.target.value, quarter: "" }))}><option value="">All months</option>{analyticsOptions.month.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Year / Quarter</span><select value={analyticsFilters.quarter || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, quarter: event.target.value, month: "" }))}><option value="">All quarters</option>{analyticsOptions.quarter.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>State</span><select value={analyticsFilters.state || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, state: event.target.value }))}><option value="">All states</option>{analyticsOptions.state.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>{analyticsQuantityLabel}</span><input value={analyticsFilters.quantity || ""} placeholder=">200 or 100-500" onChange={(event) => setAnalyticsFilters((current) => ({ ...current, quantity: event.target.value }))} /></label>
            <label><span>{line === "dti" ? "Pipe Size" : "Size"}</span><select value={analyticsFilters.size || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, size: event.target.value }))}><option value="">All sizes</option>{analyticsOptions.size.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Operator</span><select value={analyticsFilters.operator || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, operator: event.target.value }))}><option value="">All operators</option>{analyticsOptions.operator.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Crew Lead</span><select value={analyticsFilters.lead || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, lead: event.target.value }))}><option value="">All leads</option>{analyticsOptions.lead.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Job Category</span><select value={analyticsFilters.category || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, category: event.target.value }))}><option value="">All categories</option>{analyticsOptions.category.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <div className={styles.analyticsPages}>{(["financials", "production", "lead", "trends"] as AnalyticsPage[]).map((item) => <button key={item} type="button" className={analyticsPage === item ? styles.primary : ""} onClick={() => setAnalyticsPage(item)}>{item === "lead" ? "Lead Production" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        </section>

        {analyticsPage === "financials" && <>
          <section className={styles.metrics}>
            <div><span>Total Income</span><strong>{money(analyticsTotals.revenue)}</strong></div><div><span>Average / Job</span><strong>{money(analyticsTotals.averageJob)}</strong></div>
            <div><span>Revenue / Manhour</span><strong>{money(analyticsTotals.revenuePerMh)}</strong></div><div><span>Labor % Revenue</span><strong>{percent(analyticsTotals.laborPercent)}</strong></div>
            <div><span>Gross Profit Margin</span><strong>{percent(analyticsTotals.margin)}</strong></div><div><span>Jobs</span><strong>{analyticsTotals.jobs.toLocaleString()}</strong></div>
          </section>
          <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Monthly Income</span><h2>Invoice Amount by Month</h2></div></div><div className={styles.barChart}>{analyticsMonthly.map((row) => <div className={styles.barRow} key={row.period}><span>{new Date(`${row.period}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</span><div><i style={{ width: `${Math.max(1, row.revenue / analyticsBarMax * 100)}%` }} /></div><strong>{money(row.revenue)}</strong></div>)}{!analyticsMonthly.length && <div className={styles.emptyState}>No jobs match these slicers.</div>}</div></section>
        </>}

        {(analyticsPage === "production" || analyticsPage === "lead") && (() => {
          const rows = analyticsPage === "production" ? analyticsOperators : analyticsLeads;
          const label = analyticsPage === "production" ? "Operator" : "Crew Lead";
          return <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Production Comparison</span><h2>{label} Performance</h2></div><span>Ranked by revenue</span></div><div className={styles.tableWrap}><table><thead><tr><th>{label}</th><th>Jobs</th><th>Revenue</th><th>Manhours</th>{line !== "all" && <th>{analyticsQuantityLabel}</th>}{line !== "all" && <th>{analyticsQuantityLabel} / MH</th>}<th>Revenue / MH</th><th>Labor %</th><th>Margin</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.jobs}</td><td>{money(row.revenue)}</td><td>{row.manhours.toLocaleString()}</td>{line !== "all" && <td>{row.quantity.toLocaleString()}</td>}{line !== "all" && <td>{row.quantityPerMh.toFixed(2)}</td>}<td>{money(row.revenuePerMh)}</td><td>{percent(row.laborPercent)}</td><td>{percent(row.margin)}</td></tr>)}{!rows.length && <tr><td colSpan={line === "all" ? 7 : 9}>No jobs match these slicers.</td></tr>}</tbody></table></div></section>;
        })()}

        {analyticsPage === "trends" && <>
          <section className={styles.metrics}>
            <div><span>Selected Jobs</span><strong>{analyticsTotals.jobs.toLocaleString()}</strong></div><div><span>Total Income</span><strong>{money(analyticsTotals.revenue)}</strong></div>
            <div><span>Profit</span><strong>{money(analyticsTotals.profit)}</strong></div><div><span>Margin</span><strong>{percent(analyticsTotals.margin)}</strong></div>
            <div><span>Revenue / Manhour</span><strong>{money(analyticsTotals.revenuePerMh)}</strong></div><div><span>Reporting Quarters</span><strong>{analyticsQuarterly.length}</strong></div>
          </section>
          <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Quarterly Trend</span><h2>Financial and Production Movement</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Quarter</th><th>Jobs</th><th>Revenue</th><th>Profit</th><th>Margin</th><th>Manhours</th><th>Revenue / MH</th>{line !== "all" && <th>{analyticsQuantityLabel} / MH</th>}</tr></thead><tbody>{analyticsQuarterly.map((row) => <tr key={row.period}><td>{row.period}</td><td>{row.jobs}</td><td>{money(row.revenue)}</td><td>{money(row.profit)}</td><td>{percent(row.margin)}</td><td>{row.manhours.toLocaleString()}</td><td>{money(row.revenuePerMh)}</td>{line !== "all" && <td>{row.quantityPerMh.toFixed(2)}</td>}</tr>)}{!analyticsQuarterly.length && <tr><td colSpan={line === "all" ? 7 : 8}>No jobs match these slicers.</td></tr>}</tbody></table></div></section>
        </>}
      </>}

      {!loading && tab === "analytics" && line === "tu" && <div className={styles.emptyState}>Tubing uses weekly production and monthly revenue rather than job-cost analytics. Its complete analysis remains on Overview and Trackers.</div>}

      {!loading && tab === "market" && market.setupRequired && <section className={styles.tableSection}>
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>One-Time Setup</span><h2>Market Share Database</h2></div></div>
        <div className={styles.emptyState}>Run <strong>supabase/titan_financial_market.sql</strong>, then load the verified Compass market snapshot.</div>
      </section>}

      {!loading && tab === "market" && !market.setupRequired && <>
        <section className={styles.metrics}>
          <div><span>Active Rigs</span><strong>{visibleMarketRigs.length.toLocaleString()}</strong></div>
          <div><span>Services Tracked</span><strong>{market.services.length.toLocaleString()}</strong></div>
          <div><span>Pathfinder Positions</span><strong>{marketTotals.owned.toLocaleString()}</strong></div>
          <div><span>Shared Positions</span><strong>{marketTotals.shared.toLocaleString()}</strong></div>
          <div><span>Competitor Positions</span><strong>{marketTotals.competitor.toLocaleString()}</strong></div>
          <div><span>Unknown Positions</span><strong>{marketTotals.unknown.toLocaleString()}</strong></div>
        </section>

        <section className={styles.tableSection}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Service Position</span><h2>Share by Service</h2></div><span>{selectedMarketDate ? `Snapshot ${new Date(`${selectedMarketDate}T00:00:00`).toLocaleDateString()}` : "No snapshot loaded"}</span></div>
          <div className={styles.marketShareList}>{marketShare.map((service) => <article className={styles.marketShareRow} key={service.id}>
            <div><strong>{service.name}</strong><span>{service.inPlay} addressable rig{service.inPlay === 1 ? "" : "s"}</span></div>
            <div className={styles.marketBar} aria-label={`${service.name}: ${percent(service.wonPct)} Pathfinder, ${percent(service.sharedPct)} shared`}>
              <i className={styles.marketPf} style={{ width: `${service.wonPct * 100}%` }} />
              <i className={styles.marketShared} style={{ width: `${service.sharedPct * 100}%` }} />
              <i className={styles.marketComp} style={{ width: `${service.inPlay ? service.comp / service.inPlay * 100 : 0}%` }} />
              <i className={styles.marketUnknown} style={{ width: `${service.inPlay ? service.unknown / service.inPlay * 100 : 0}%` }} />
            </div>
            <div className={styles.marketShareValues}><b>{percent(service.wonPct)} won</b><span>{service.pf} owned</span><span>{service.shared} shared</span><span>{service.comp} competitor</span><span>{service.unknown} unknown</span></div>
          </article>)}</div>
          {!marketShare.length && <div className={styles.emptyState}>No market services have been loaded for this yard.</div>}
        </section>

        <section className={styles.tableSection}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Rig Battlefield</span><h2>Provider Position by Rig and Service</h2></div><div className={styles.marketLegend}><span className={styles.marketPf}>Pathfinder</span><span className={styles.marketShared}>Shared</span><span className={styles.marketComp}>Competitor</span><span className={styles.marketUnknown}>Unknown</span></div></div>
          <div className={styles.tableWrap}><table className={styles.marketTable}><thead><tr><th>Operator</th><th>Rig</th><th>Standing</th>{market.services.map((service) => <th key={service.id}>{service.name}</th>)}</tr></thead><tbody>{visibleMarketRigs.map((rig) => <tr key={rig.id}><td>{rig.operator || "-"}</td><td><strong>{rig.rig_name || "Spud rig"}</strong></td><td>{rig.segment || "-"}</td>{market.services.map((service) => {
            const cell = marketCellMap.get(`${rig.id}:${service.id}`);
            const label = cell?.kind === "pf" ? "Pathfinder" : cell?.kind === "shared" ? "Shared" : cell?.kind === "comp" ? "Competitor" : cell?.kind === "na" ? "N/A" : "Unknown";
            const className = cell?.kind === "pf" ? styles.marketPf : cell?.kind === "shared" ? styles.marketShared : cell?.kind === "comp" ? styles.marketComp : styles.marketUnknown;
            return <td key={service.id}><span className={`${styles.marketCell} ${className}`}><b>{label}</b>{cell?.holder_name && cell.holder_name !== label ? <small>{cell.holder_name}</small> : null}</span></td>;
          })}</tr>)}{!visibleMarketRigs.length && <tr><td colSpan={market.services.length + 3}>No rigs match these filters.</td></tr>}</tbody></table></div>
        </section>

        <section className={styles.twoColumn}>
          <div className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Historical Movement</span><h2>Won Share by Quarter</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Quarter</th>{market.services.map((service) => <th key={service.id}>{service.name}</th>)}</tr></thead><tbody>{marketTrendQuarters.map((quarter) => <tr key={quarter}><td>{quarter}</td>{market.services.map((service) => { const row = market.trend.find((item) => item.quarter === quarter && item.service_key === service.service_key); return <td key={service.id}>{row ? percent(row.won_pct) : "-"}</td>; })}</tr>)}{!marketTrendQuarters.length && <tr><td colSpan={market.services.length + 1}>No historical trend points are loaded.</td></tr>}</tbody></table></div></div>
          <div className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Provider Directory</span><h2>Known Market Providers</h2></div><strong>{market.competitors.length}</strong></div><div className={styles.providerList}>{market.competitors.map((provider) => <div key={provider.id}><span className={provider.is_pathfinder ? styles.marketPf : styles.marketComp}>{provider.is_pathfinder ? "TITAN" : "MARKET"}</span><strong>{provider.canonical_name}</strong></div>)}{!market.competitors.length && <div className={styles.emptyState}>No providers are loaded.</div>}</div></div>
        </section>
      </>}

      {!loading && tab === "trackers" && line !== "tu" && <section className={styles.tableSection}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>Source of Truth</span><h2>Job Cost Tracker</h2></div>
          <div className={styles.headerActions}><strong>{filteredJobs.length} of {jobs.length} rows</strong>{Object.values(jobFilters).some(Boolean) && <button type="button" onClick={() => setJobFilters({})}>Clear Filters</button>}</div>
        </div>
        {Object.entries(filterOptions).map(([key, options]) => <datalist key={key} id={`financial-${key}-options`}>{options.map((option) => <option key={option} value={option} />)}</datalist>)}
        <div className={styles.tableWrap}><table className={styles.trackerTable}>
          <thead>
            <tr><th>Date</th><th>Line</th><th>Category</th><th>Invoice</th><th>Operator</th><th>Rig / Yard</th><th>Lead</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th><th>Manhours</th><th>Source</th><th></th></tr>
            <tr className={styles.filterRow}>
              <th><span>{dateFrom}<br />to {dateTo}</span></th><th><span>{line === "all" ? "All" : financialLineNames[line]}</span></th>
              {(["category", "invoice", "operator", "rig", "lead"] as const).map((key) => <th key={key}><input aria-label={`Filter ${key}`} list={`financial-${key}-options`} value={jobFilters[key] || ""} onChange={(event) => updateJobFilter(key, event.target.value)} /></th>)}
              {(["revenue", "cost", "profit", "margin", "manhours"] as const).map((key) => <th key={key}><input aria-label={`Filter ${key}`} placeholder={key === "margin" ? ">30" : ">200"} value={jobFilters[key] || ""} onChange={(event) => updateJobFilter(key, event.target.value)} /></th>)}
              <th><input aria-label="Filter source" list="financial-source-options" value={jobFilters.source || ""} onChange={(event) => updateJobFilter("source", event.target.value)} /></th><th></th>
            </tr>
          </thead>
          <tbody>{filteredJobs.map((job) => <tr key={job.id}><td>{job.job_date.slice(0, 10)}</td><td>{financialLineNames[job.service_line]}</td><td>{financialCategoryLabel(job, categories)}</td><td>{job.invoice || "-"}</td><td>{job.operator || "-"}</td><td>{job.rig || "-"}</td><td>{job.lead || "-"}</td><td>{money(job.revenue)}</td><td>{money(job.computed.total_cost)}</td><td>{money(job.computed.profit)}</td><td>{percent(job.computed.margin)}</td><td>{numberValue(job.manhours).toLocaleString()}</td><td>{job.source}</td><td className={styles.rowActions}>{permissions.edit && <><button type="button" onClick={() => beginEdit(job)}>Change</button><button type="button" onClick={() => void voidJob(job)}>Void</button></>}</td></tr>)}{!filteredJobs.length && <tr><td colSpan={14}>No tracker rows match these filters.</td></tr>}</tbody>
          {!!filteredJobs.length && <tfoot><tr><th colSpan={7}>Filtered totals</th><th>{money(filteredTotals.revenue)}</th><th>{money(filteredTotals.cost)}</th><th>{money(filteredTotals.profit)}</th><th>{percent(filteredTotals.margin)}</th><th>{filteredTotals.manhours.toLocaleString()}</th><th colSpan={2}></th></tr></tfoot>}
        </table></div>
      </section>}

      {!loading && tab === "trackers" && line === "tu" && <>
        {showTubingWeekForm && <section className={styles.jobForm}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Tubing Production</span><h2>{tubingWeeks.some((week) => week.week_start.slice(0, 10) === tubingWeekStart) ? "Change Weekly Activity" : "Add Weekly Activity"}</h2></div><button type="button" onClick={() => setShowTubingWeekForm(false)}>Close</button></div><div className={styles.formGrid}><label><span>Week Starting Sunday</span><input type="date" value={tubingWeekStart} onChange={(event) => setTubingWeekStart(event.target.value)} /></label><label><span>Whole-week Manhours</span><input type="number" min="0" step="any" value={tubingManhours} onChange={(event) => setTubingManhours(event.target.value)} /></label><label><span>Add Customer</span><input value={newTubingCustomer} onChange={(event) => setNewTubingCustomer(event.target.value)} /></label><div className={styles.inlineAction}><button type="button" onClick={addTubingCustomer}>Add Customer</button></div></div><div className={styles.tableWrap}><table><thead><tr><th>Customer</th><th>Joints</th><th>Jobs</th><th>Trucks In</th><th>Trucks Out</th></tr></thead><tbody>{Object.entries(tubingWeekValues).map(([customer, values]) => <tr key={customer}><td><strong>{customer}</strong></td>{(["joints", "jobs", "trucks_in", "trucks_out"] as const).map((field) => <td key={field}><input className={styles.cellInput} type="number" min="0" step="1" value={values[field] || ""} onChange={(event) => setTubingWeekValues((current) => ({ ...current, [customer]: { ...current[customer], [field]: event.target.value } }))} /></td>)}</tr>)}{!Object.keys(tubingWeekValues).length && <tr><td colSpan={5}>Add a customer to begin this week.</td></tr>}</tbody></table></div><div className={styles.formActions}><button type="button" disabled={saving || !tubingWeekStart} className={styles.primary} onClick={() => void saveTubingWeek()}>{saving ? "Saving..." : "Save Week"}</button></div></section>}
        {showTubingRevenueForm && <section className={styles.jobForm}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Tubing Financials</span><h2>Add or Update Monthly Revenue</h2></div><button type="button" onClick={() => setShowTubingRevenueForm(false)}>Close</button></div><div className={styles.formGrid}><label><span>Month</span><input type="month" value={tubingRevenueMonth} onChange={(event) => setTubingRevenueMonth(event.target.value)} /></label><label><span>Customer</span><input list="tubing-customers" value={tubingRevenueCustomer} onChange={(event) => setTubingRevenueCustomer(event.target.value)} /><datalist id="tubing-customers">{tubingCustomers.map((customer) => <option key={customer} value={customer} />)}</datalist></label><label><span>Revenue</span><input type="number" step="0.01" value={tubingRevenueAmount} onChange={(event) => setTubingRevenueAmount(event.target.value)} /></label></div><div className={styles.formActions}><button type="button" disabled={saving || !tubingRevenueMonth || !tubingRevenueAmount} className={styles.primary} onClick={() => void saveTubingRevenue()}>{saving ? "Saving..." : "Save Revenue"}</button></div></section>}
        <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Source of Truth</span><h2>Tubing Weekly Activity</h2></div><div className={styles.headerActions}>{(permissions.create || permissions.edit) && <button type="button" onClick={() => openTubingWeek()}>Add Week</button>}<strong>{tubingWeeklyRows.length} weeks</strong></div></div><div className={styles.tableWrap}><table><thead><tr><th>Week</th><th>Joints</th><th>Jobs</th><th>Trucks In</th><th>Trucks Out</th><th>Manhours</th><th>Joints / MH</th><th></th></tr></thead><tbody>{tubingWeeklyRows.map((week) => <tr key={week.id}><td>{week.week_start.slice(0, 10)}</td><td>{week.joints.toLocaleString()}</td><td>{week.jobs}</td><td>{week.trucksIn}</td><td>{week.trucksOut}</td><td>{week.manhours.toLocaleString()}</td><td>{week.jointsPerMh ? week.jointsPerMh.toFixed(2) : "-"}</td><td>{permissions.edit && <button type="button" onClick={() => openTubingWeek(week)}>Change</button>}</td></tr>)}{!tubingWeeklyRows.length && <tr><td colSpan={8}>No Tubing weeks match these filters.</td></tr>}</tbody></table></div></section>
        <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Revenue Ledger</span><h2>Tubing Monthly Revenue</h2></div>{(permissions.create || permissions.edit) && <button type="button" onClick={() => setShowTubingRevenueForm(true)}>Add Revenue</button>}</div><div className={styles.tableWrap}><table><thead><tr><th>Month</th><th>Customer</th><th>Amount</th><th>Source</th><th></th></tr></thead><tbody>{tubingRevenue.map((row) => <tr key={row.id}><td>{row.revenue_month.slice(0, 7)}</td><td>{row.customer || "(whole month)"}</td><td>{money(row.amount)}</td><td>{row.source}</td><td>{permissions.edit && <button type="button" onClick={() => { setTubingRevenueMonth(row.revenue_month.slice(0, 7)); setTubingRevenueCustomer(row.customer || ""); setTubingRevenueAmount(String(row.amount)); setShowTubingRevenueForm(true); }}>Change</button>}</td></tr>)}{!tubingRevenue.length && <tr><td colSpan={5}>No Tubing revenue matches these filters.</td></tr>}</tbody></table></div></section>
      </>}

      {!loading && tab === "kpis" && line !== "tu" && <>
        <section className={styles.analyticsControls}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>KPI Slice</span><h2>Performance Filters</h2></div>
            <div className={styles.headerActions}><strong>{kpiJobs.length} of {jobs.length} jobs</strong>{Object.values(analyticsFilters).some(Boolean) && <button type="button" onClick={() => setAnalyticsFilters({})}>Clear Slicers</button>}</div>
          </div>
          <div className={styles.analyticsFilters}>
            <label><span>Year / Month</span><select value={analyticsFilters.month || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, month: event.target.value, quarter: "" }))}><option value="">All months</option>{analyticsOptions.month.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Year / Quarter</span><select value={analyticsFilters.quarter || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, quarter: event.target.value, month: "" }))}><option value="">All quarters</option>{analyticsOptions.quarter.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>State</span><select value={analyticsFilters.state || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, state: event.target.value }))}><option value="">All states</option>{analyticsOptions.state.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>{analyticsQuantityLabel}</span><input value={analyticsFilters.quantity || ""} placeholder=">200 or 100-500" onChange={(event) => setAnalyticsFilters((current) => ({ ...current, quantity: event.target.value }))} /></label>
            <label><span>{line === "dti" ? "Pipe Size" : "Size"}</span><select value={analyticsFilters.size || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, size: event.target.value }))}><option value="">All sizes</option>{analyticsOptions.size.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Operator</span><select value={analyticsFilters.operator || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, operator: event.target.value }))}><option value="">All operators</option>{analyticsOptions.operator.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Crew Lead</span><select value={analyticsFilters.lead || ""} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, lead: event.target.value }))}><option value="">All leads</option>{analyticsOptions.lead.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Job Category</span><select value={analyticsFilters.category || ""} disabled={kpiComparison === "standard"} onChange={(event) => setAnalyticsFilters((current) => ({ ...current, category: event.target.value }))}><option value="">All categories</option>{analyticsOptions.category.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          <div className={styles.kpiCompare} aria-label="KPI comparison basis"><span>Compare Against</span><div><button type="button" className={kpiComparison === "slice" ? styles.primary : ""} onClick={() => setKpiComparison("slice")}>This Slice</button><button type="button" className={kpiComparison === "standard" ? styles.primary : ""} onClick={() => setKpiComparison("standard")}>Standard Book</button></div><p>{kpiComparison === "standard" ? "Uses Standard-category jobs under every active slicer except Job Category." : "Uses exactly the jobs selected above. Mixed categories show actuals without a target band."}</p></div>
        </section>
        <section className={styles.metrics}>
          <div><span>Labor % Revenue</span><strong>{percent(kpiTotals.laborPercent)}</strong></div>
          <div><span>Revenue / Manhour</span><strong>{money(kpiTotals.revenuePerMh)}</strong></div>
          <div><span>Profit Margin</span><strong>{percent(kpiTotals.margin)}</strong></div>
          <div><span>Jobs Evaluated</span><strong>{kpiTotals.jobs.toLocaleString()}</strong></div>
          <div><span>Targets Met</span><strong>{kpiScorecards.filter((card) => card.met === true).length} / {kpiScorecards.filter((card) => card.target && card.actual !== null).length}</strong></div>
          <div><span>Reporting Months</span><strong>{monthlyPerformance.length}</strong></div>
        </section>
        <section className={styles.tableSection}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Live Scorecard</span><h2>Actual Performance vs Target</h2></div><span>{kpiComparison === "standard" ? "Standard book" : "This slice"}</span></div>
          {kpiScorecards.length ? <div className={styles.kpiGrid}>{kpiScorecards.map((card) => <article key={`${card.serviceLine}:${card.metric.key}`} className={styles.kpiCard} data-status={!card.target || card.actual === null ? "no-data" : card.met ? "met" : "missed"}>
            <div className={styles.kpiCardHead}><div><span>{financialLineNames[card.serviceLine]}</span><strong>{card.metric.label}</strong></div><b>{!card.target ? "No target" : card.actual === null ? "No data" : card.met ? "Met" : "Missed"}</b></div>
            <div className={styles.kpiValues}><div><span>Actual</span><strong>{card.actual === null ? "-" : formatTargetValue(card.actual, card.metric.unit)}</strong></div><div><span>Target</span><strong>{card.target ? `${card.target.direction === "above" ? ">= " : "<= "}${formatTargetValue(card.target.target_value, card.target.unit)}` : "Not applied"}</strong></div></div>
            <strong className={styles.kpiVerdict}>{kpiVerdict(card.actual, card.target, card.met)}</strong>
            <div className={styles.kpiTargetScale} data-enabled={card.targetPosition !== null} role="img" aria-label={card.target ? `${card.target.direction === "below" ? "Lower" : "Higher"} is better. Current result is ${kpiVerdict(card.actual, card.target, card.met)}.` : "No target applied."}>
              <div><span>Worse</span><span>Target</span><span>Better</span></div>
              <i><b />{card.targetPosition !== null && <em style={{ left: `${card.targetPosition}%` }} />}</i>
              <small>{card.target ? `${card.target.direction === "below" ? "Lower" : "Higher"} is better` : "Select one category or Standard Book to apply a target"}</small>
            </div>
            <div className={styles.kpiTrend}>
              <div className={styles.kpiTrendHead}><span>Last 12 Months</span><small>{card.target ? "Dashed line is target" : "No target line"}</small></div>
              {card.trend.length ? <div className={styles.kpiTrendPlot} role="img" aria-label={`${card.metric.label} monthly trend`}>
                {card.targetHeight !== null && <i className={styles.kpiTrendTarget} style={{ bottom: `${card.targetHeight}%` }} />}
                <div className={styles.kpiTrendBars} style={{ gridTemplateColumns: `repeat(${card.trend.length}, minmax(12px, 1fr))` }}>{card.trend.map((point) => {
                  const height = point.value === null || card.trendMaximum <= 0 ? 0 : point.value / card.trendMaximum * 100;
                  const monthLabel = new Date(`${point.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
                  const valueLabel = point.value === null ? "No data" : formatTargetValue(point.value, card.metric.unit);
                  return <div key={point.month} className={styles.kpiTrendMonth} data-status={point.met === null ? "neutral" : point.met ? "met" : "missed"} title={`${monthLabel}: ${valueLabel}`}><div><b style={{ height: `${Math.max(height, point.value === null ? 0 : 3)}%` }} /></div><span>{monthLabel}</span></div>;
                })}</div>
              </div> : <div className={styles.kpiTrendEmpty}>No monthly data in this period</div>}
            </div>
            <p>{card.jobCount} jobs · {card.categoryLabel}{card.target ? ` · ${card.target.yard_id ? "Yard override" : "Line default"}` : ""}</p>
          </article>)}</div> : <div className={styles.emptyState}>No controlled targets are configured for this selection. Actual KPIs and monthly performance remain available.</div>}
        </section>
        <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Period Trend</span><h2>Monthly Financial Performance</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Month</th><th>Jobs</th><th>Revenue</th><th>Total Cost</th><th>Profit</th><th>Labor %</th><th>Margin</th><th>Manhours</th><th>Revenue / Manhour</th></tr></thead><tbody>{monthlyPerformance.map((row) => <tr key={row.month}><td>{new Date(`${row.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</td><td>{row.jobs}</td><td>{money(row.revenue)}</td><td>{money(row.cost)}</td><td>{money(row.profit)}</td><td>{percent(row.laborPercent)}</td><td>{percent(row.margin)}</td><td>{row.manhours.toLocaleString()}</td><td>{money(row.revenuePerMh)}</td></tr>)}{!monthlyPerformance.length && <tr><td colSpan={9}>No jobs match this period.</td></tr>}</tbody></table></div></section>
        <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Controlled Targets</span><h2>Target Definitions</h2></div>{permissions.manageSettings ? <button type="button" className={styles.primary} onClick={() => openTarget()}>Add Target</button> : null}</div><div className={styles.tableWrap}><table><thead><tr><th>Service Line</th><th>Category</th><th>Metric</th><th>Direction</th><th>Target</th><th>Scope</th><th></th></tr></thead><tbody>{effectiveTargets.map((target) => <tr key={target.id}><td>{financialLineNames[target.service_line]}</td><td>{target.category_code}</td><td>{target.metric_key.replaceAll("_", " ")}</td><td>{target.direction === "above" ? "At or above" : "At or below"}</td><td>{formatTargetValue(target.target_value, target.unit)}</td><td>{target.yard_id ? "Yard override" : "Line default"}</td><td>{permissions.manageSettings ? <div className={styles.rowActions}><button type="button" onClick={() => openTarget(target)}>Edit</button><button type="button" onClick={() => void deactivateTarget(target)}>Deactivate</button></div> : null}</td></tr>)}{!effectiveTargets.length && <tr><td colSpan={7}>No targets are configured for this selection.</td></tr>}</tbody></table></div></section>
      </>}

      {!loading && tab === "reviews" && line !== "tu" && <section className={styles.tableSection}>
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Controlled Review</span><h2>Financial Reviews</h2></div><span>Quarterly or custom windows. Final reviews retain their captured KPI values.</span></div>
        {reviewComposerSetupRequired && <div className={styles.rateWarning}>Run <strong>supabase/titan_financial_review_sections.sql</strong> to enable configurable review sections.</div>}
        {reviewPhotosSetupRequired && <div className={styles.rateWarning}>Run <strong>supabase/titan_financial_review_photos.sql</strong> to enable secure review photo galleries.</div>}
        {reviewRigMovementSetupRequired && <div className={styles.rateWarning}>Run <strong>supabase/titan_financial_review_rig_movement.sql</strong> to enable dated rigs gained and lost sections.</div>}
        {visibleReviews.length ? <div className={styles.reviewGrid}>{visibleReviews.map((review) => {
          const savedSnapshots = reviewSnapshots.filter((item) => item.review_id === review.id).sort((a, b) => b.finalized_at.localeCompare(a.finalized_at));
          return <article key={review.id} className={styles.reviewCard} data-status={review.status}>
          <div className={styles.reviewCardHead}><div><span>{financialLineNames[review.service_line]} · {review.compare_mode === "year" ? "vs last year" : "vs prior period"}</span><h3>{review.quarter || `${new Date(`${review.range_start.slice(0, 10)}T00:00:00`).toLocaleDateString()} - ${new Date(`${review.range_end.slice(0, 10)}T00:00:00`).toLocaleDateString()}`}</h3></div><b>{review.status}</b></div>
          {review.status === "final" && review.snapshot ? <div className={styles.reviewMetrics}><div><span>Jobs</span><strong>{numberValue(review.snapshot.jobs).toLocaleString()}</strong></div><div><span>Revenue</span><strong>{money(review.snapshot.revenue)}</strong></div><div><span>Profit</span><strong>{money(review.snapshot.profit)}</strong></div><div><span>Margin</span><strong>{percent(review.snapshot.margin)}</strong></div></div> : <p className={styles.openReviewNote}>Open review. KPI values will be captured when it is finalized.</p>}
          {review.status === "final" && Boolean(review.snapshot?.comparison) && <div className={styles.reviewComparison}><span>Comparison</span><strong>{numberValue((review.snapshot?.comparison as Record<string, unknown>).jobs).toLocaleString()} jobs · {money((review.snapshot?.comparison as Record<string, unknown>).revenue)} revenue · {percent((review.snapshot?.comparison as Record<string, unknown>).margin)} margin</strong></div>}
          <div className={styles.reviewNarratives}><div><span>Highlights</span><p>{review.highlights || "-"}</p></div><div><span>Lowlights</span><p>{review.lowlights || "-"}</p></div><div><span>Goals</span><p>{review.goals || "-"}</p></div></div>
          {Object.keys(review.facts || {}).length > 0 && <div className={styles.reviewFacts}><span>Review Facts</span><div>{reviewFactFields.filter((field) => review.facts?.[field.key]).map((field) => <div key={field.key}><b>{review.facts[field.key]}</b><small>{field.label}</small></div>)}</div>{review.facts.other && <p>{review.facts.other}</p>}</div>}
          {savedSnapshots.length > 0 && <details className={styles.reviewHistory}><summary>Finalized Snapshot History ({savedSnapshots.length})</summary><div>{savedSnapshots.map((item, index) => <div key={item.id}><span>Version {savedSnapshots.length - index} · {new Date(item.finalized_at).toLocaleString()}</span><strong>{numberValue(item.snapshot.jobs).toLocaleString()} jobs · {money(item.snapshot.revenue)} revenue · {money(item.snapshot.profit)} profit · {percent(item.snapshot.margin)} margin</strong></div>)}</div></details>}
          {!reviewComposerSetupRequired && <div className={styles.reviewSections}>{reviewSections.filter((section) => section.review_id === review.id).sort((a, b) => a.position - b.position).map((section, index, ordered) => {
            const snapshot = section.snapshot || section.computed || {};
            const isLiveCalculation = !section.snapshot && Boolean(section.computed);
            const metricKey = String(snapshot.metric_key || section.config.metric_key || "revenue");
            const chartRows = Array.isArray(snapshot.current) ? snapshot.current as Array<{ label: string; value: number }> : [];
            const chartMax = Math.max(1, ...chartRows.map((row) => Math.abs(numberValue(row.value))));
            const movementRows = section.kind === "rig_movement"
              ? (Array.isArray(snapshot.changes) ? snapshot.changes as RigMovement[] : reviewRigMovement(review, market))
              : [];
            return <section key={section.id} className={styles.reviewSection}>
              <div className={styles.reviewSectionHead}><div><span>{section.kind.replaceAll("_", " ")}</span><strong>{section.title || (section.kind === "rig_movement" ? "Rigs Gained / Lost" : section.kind === "narrative" ? "Narrative" : reviewMetrics.find((metric) => metric.key === metricKey)?.label || "Review Section")}</strong></div>{review.status === "open" && permissions.edit && <div className={styles.rowActions}><button type="button" disabled={index === 0} onClick={() => void moveReviewSection(review.id, section.id, -1)}>Move Up</button><button type="button" disabled={index === ordered.length - 1} onClick={() => void moveReviewSection(review.id, section.id, 1)}>Move Down</button><button type="button" onClick={() => openReviewSection(review.id, section)}>Edit</button><button type="button" onClick={() => void deactivateReviewSection(section)}>Remove</button></div>}</div>
              {section.kind === "narrative" && <p>{section.body}</p>}
              {section.kind === "manual_metric" && <div className={styles.reviewManual}><span>{String(section.config.label || section.title || "Value")}</span><strong>{String(section.config.value || "-")}</strong></div>}
              {section.kind === "photo" && <><p>{section.body || "Photo evidence"}</p><div className={styles.reviewPhotoGrid}>{reviewPhotos.filter((photo) => photo.section_id === section.id).map((photo) => <figure key={photo.id}><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.caption || photo.file_name} /></a><figcaption>{photo.caption || photo.file_name}</figcaption>{review.status === "open" && permissions.edit && <button type="button" onClick={() => void removeReviewPhoto(photo)}>Remove</button>}</figure>)}</div>{review.status === "open" && permissions.edit && !reviewPhotosSetupRequired && <label className={styles.photoUploadButton}>Add Photo<input type="file" accept="image/*" capture="environment" disabled={saving} onChange={(event) => { const file = event.target.files?.[0] || null; event.target.value = ""; void uploadReviewPhoto(section, file); }} /></label>}</>}
              {section.kind === "rig_movement" && (movementRows.length ? <div className={styles.rigMovementList}>{movementRows.map((row) => <div key={`${row.rig_name}:${row.operator}:${row.change}`} data-change={row.change}><div><strong>{row.rig_name || "Unnamed Rig"}</strong><span>{row.operator || "Operator not recorded"}</span></div><b>{row.change === "gained" ? "Gained" : "Lost"}</b></div>)}</div> : <p className={styles.openReviewNote}>No rigs changed Pathfinder-held status during this review window.</p>)}
              {section.kind === "metric" && (section.snapshot || section.computed ? <><div className={styles.reviewMetricCompare}><div><span>Review Window</span><strong>{formatReviewMetric(metricKey, snapshot.current)}</strong></div><div><span>{review.compare_mode === "year" ? "Last Year" : "Prior Period"}</span><strong>{formatReviewMetric(metricKey, snapshot.comparison)}</strong></div></div>{isLiveCalculation && <p className={styles.liveReviewStatus}>Live from job records · freezes at finalization</p>}</> : <p className={styles.openReviewNote}>No calculation is available for this section.</p>)}
              {section.kind === "chart" && (chartRows.length ? <><div className={styles.reviewChart}>{chartRows.map((row) => <div key={row.label}><span>{row.label}</span><i><b style={{ width: `${Math.abs(numberValue(row.value)) / chartMax * 100}%` }} /></i><strong>{formatReviewMetric(metricKey, row.value)}</strong></div>)}</div>{isLiveCalculation && <p className={styles.liveReviewStatus}>Live from job records · freezes at finalization</p>}</> : <p className={styles.openReviewNote}>No matching job records in this review window.</p>)}
            </section>;
          })}{review.status === "open" && permissions.edit && <div className={styles.reviewComposerActions}><button type="button" onClick={() => openReviewSection(review.id)}>Add Section</button>{!reviewSections.some((section) => section.review_id === review.id) && <button type="button" className={styles.primary} disabled={saving} onClick={() => void applyReviewTemplate(review)}>Use Standard Template</button>}</div>}</div>}
          <div className={styles.reviewActions}>{review.status === "open" && permissions.edit ? <button type="button" onClick={() => openReview(review)}>Edit</button> : null}{review.status === "open" && permissions.approve ? <button type="button" className={styles.primary} disabled={saving} onClick={() => void finalizeReview(review)}>Finalize Snapshot</button> : null}{review.status === "final" && permissions.export ? <button type="button" className={styles.primary} onClick={() => window.open(`/financials/reviews/${encodeURIComponent(review.id)}/print?yardId=${encodeURIComponent(yardId)}`, "_blank")}>Print / PDF</button> : null}{review.status === "final" && permissions.approve ? <button type="button" disabled={saving} onClick={() => void reopenReview(review)}>Reopen Review</button> : null}{review.finalized_at ? <span>Finalized {new Date(review.finalized_at).toLocaleDateString()}</span> : null}</div>
        </article>})}</div> : <div className={styles.emptyState}>No financial reviews have been started for this selection.</div>}
      </section>}

      {!loading && tab === "reviews" && line === "tu" && <div className={styles.emptyState}>Tubing reviews will be added with its dedicated production targets. Select another service line to manage financial reviews.</div>}
      {!loading && tab === "kpis" && line === "tu" && <section className={styles.metrics}><div><span>Joints</span><strong>{tubingTotals.joints.toLocaleString()}</strong></div><div><span>Joints / Manhour</span><strong>{tubingTotals.jointsPerMh.toFixed(2)}</strong></div><div><span>Jobs</span><strong>{tubingTotals.jobs.toLocaleString()}</strong></div><div><span>Revenue</span><strong>{money(tubingTotals.revenue)}</strong></div></section>}

      {!loading && tab === "cost-basis" && line !== "tu" && <><section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Frozen Cost Basis</span><h2>Everyday Rates</h2></div><span>New rates affect future saves only.</span></div><div className={styles.rateGrid}>{rates.filter((rate) => line === "all" || rate.service_line === line).map((rate) => <div key={rate.id}><span>{financialLineNames[rate.service_line]}</span><strong>{rate.label}</strong><b>{rate.rate_key === "overhead" ? percent(rate.rate_value) : money(rate.rate_value)}</b>{permissions.manageSettings ? <button type="button" onClick={() => openBaseRate(rate)}>Edit</button> : null}</div>)}</div></section><section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Changes Over Time</span><h2>Effective-Dated and Job-Size Rates</h2></div>{permissions.manageSettings ? <button type="button" className={styles.primary} onClick={openRatePeriod}>Add Scheduled Rate</button> : null}</div><div className={styles.tableWrap}><table><thead><tr><th>Service Line</th><th>Cost Item</th><th>Effective From</th><th>Minimum Quantity</th><th>Value</th><th></th></tr></thead><tbody>{ratePeriods.filter((period) => line === "all" || period.service_line === line).map((period) => <tr key={period.id}><td>{financialLineNames[period.service_line]}</td><td>{rates.find((rate) => rate.service_line === period.service_line && rate.rate_key === period.rate_key)?.label || period.rate_key.replaceAll("_", " ")}</td><td>{period.effective_from}</td><td>{period.minimum_quantity}</td><td>{period.rate_key === "overhead" ? percent(period.rate_value) : money(period.rate_value)}</td><td>{permissions.manageSettings ? <button type="button" onClick={() => void deactivateRatePeriod(period)}>Deactivate</button> : null}</td></tr>)}{!ratePeriods.length && <tr><td colSpan={6}>No dated or tiered rates have been added.</td></tr>}</tbody></table></div></section></>}
      {!loading && tab === "cost-basis" && line === "tu" && <section className={styles.tableSection}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Throughput Only</span><h2>Tubing Cost Basis</h2></div></div><div className={styles.emptyState}>Tubing records weekly production and monthly revenue without job-level cost calculations. Its customer choices are managed below.</div></section>}

      {!loading && tab === "cost-basis" && line !== "tu" && <section className={styles.tableSection}>
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Governed Classification</span><h2>Job Categories</h2></div>{permissions.manageSettings ? <button type="button" className={styles.primary} onClick={() => openCategory()}>Add Category</button> : null}</div>
        <div className={styles.tableWrap}><table><thead><tr><th>Service Line</th><th>Code</th><th>Category</th><th></th></tr></thead><tbody>{categories.filter((category) => line === "all" || category.service_line === line).map((category) => <tr key={category.id}><td>{configurationLineNames[category.service_line as ConfigurationLine]}</td><td>{category.code}</td><td>{category.label}</td><td>{permissions.manageSettings ? <div className={styles.rowActions}><button type="button" onClick={() => openCategory(category)}>Edit</button><button type="button" onClick={() => void deactivateSetting("category", category.id, category.label)}>Deactivate</button></div> : null}</td></tr>)}{!categories.length && <tr><td colSpan={4}>No active categories are configured.</td></tr>}</tbody></table></div>
      </section>}

      {!loading && tab === "cost-basis" && <section className={styles.tableSection}>
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Field Entry Choices</span><h2>Pick Lists</h2></div>{permissions.manageSettings ? <button type="button" className={styles.primary} onClick={() => openPickList()}>Add Value</button> : null}</div>
        <div className={styles.tableWrap}><table><thead><tr><th>Service Line</th><th>List</th><th>Value</th><th></th></tr></thead><tbody>{pickLists.filter((value) => line === "all" || value.service_line === line).map((value) => <tr key={value.id}><td>{configurationLineNames[value.service_line]}</td><td>{pickListLabels[value.list_key] || value.list_key}</td><td>{value.list_value}</td><td>{permissions.manageSettings ? <div className={styles.rowActions}><button type="button" onClick={() => openPickList(value)}>Edit</button><button type="button" onClick={() => void deactivateSetting("pick-list", value.id, value.list_value)}>Deactivate</button></div> : null}</td></tr>)}{!pickLists.filter((value) => line === "all" || value.service_line === line).length && <tr><td colSpan={4}>No active pick-list values are configured for this selection.</td></tr>}</tbody></table></div>
      </section>}
    </main>
  );
}
