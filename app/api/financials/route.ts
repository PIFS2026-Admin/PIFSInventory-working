import { createClient } from "@supabase/supabase-js";
import {
  applyPermissionOverrides,
  canApprove,
  canCreate,
  canEdit,
  canExport,
  canManageSettings,
  canView,
  getDefaultPermissionsForRole,
  normalizeRole,
} from "../../../lib/modulePermissions";
import {
  computeFinancialJob,
  financialHeadline,
  financialLineRateKeys,
  financialTierQuantity,
  FinancialInputs,
  FinancialLine,
  FinancialRates,
} from "../../../lib/financialKpi";

const financialLines = new Set<FinancialLine>(["dti", "cdt", "hb", "trs", "wash"]);
const configurationLines = new Set(["dti", "cdt", "hb", "trs", "wash", "tu"]);
const financialPickListKeys = new Set(["operator", "state", "size", "connection", "casing_section", "job_type", "items", "customer", "lead", "band", "insp_type", "reface_type"]);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function isMissingFinancialSchema(error: { message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("titan_financial_") && (message.includes("does not exist") || message.includes("schema cache"));
}

function isMissingMarketSchema(error: { message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("titan_financial_market_") && (message.includes("does not exist") || message.includes("schema cache"));
}

function isMissingReviewComposerSchema(error: { message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("titan_financial_review_sections") && (message.includes("does not exist") || message.includes("schema cache"));
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function lineValue(value: unknown): FinancialLine {
  const line = String(value || "") as FinancialLine;
  if (!financialLines.has(line)) throw new Error("Select a valid service line.");
  return line;
}

function configurationLineValue(value: unknown) {
  const line = String(value || "");
  if (!configurationLines.has(line)) throw new Error("Select a valid service line.");
  return line;
}

function cleanInputs(value: unknown): FinancialInputs {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Financial job inputs are required.");
  return value as FinancialInputs;
}

async function requestContext(request: Request) {
  const admin = adminClient();
  const token = bearerToken(request);
  if (!token) throw new Error("You must be signed in.");
  const userResult = await admin.auth.getUser(token);
  if (userResult.error || !userResult.data.user) throw new Error("Your session is no longer valid.");
  const user = userResult.data.user;
  const profileResult = await admin
    .from("profiles")
    .select("id,role,full_name,is_disabled,access_configured")
    .eq("id", user.id)
    .single();
  if (profileResult.error || !profileResult.data) throw new Error("Your TITAN profile could not be loaded.");
  if (profileResult.data.is_disabled) throw new Error("This TITAN account is disabled.");
  const role = normalizeRole(profileResult.data.role);
  let permissions = getDefaultPermissionsForRole(role);
  const overrides = await admin
    .from("user_permission_overrides")
    .select("module_key,action_key,is_allowed")
    .eq("user_id", user.id);
  if (!overrides.error) permissions = applyPermissionOverrides(permissions, overrides.data || []);
  const moduleAccess = await admin
    .from("user_module_permissions")
    .select("can_access")
    .eq("user_id", user.id)
    .eq("module_key", "financials")
    .maybeSingle();
  const explicitModuleAccess = Boolean(moduleAccess.data?.can_access);
  const hasModule = role === "admin" || role === "owner" ||
    (!profileResult.data.access_configured && canView(permissions, "financials")) || explicitModuleAccess;
  return { admin, user, role, permissions, hasModule, profile: profileResult.data };
}

async function assertYardAccess(context: Awaited<ReturnType<typeof requestContext>>, yardId: string) {
  if (!yardId) throw new Error("Select a TITAN yard.");
  if (context.role === "admin" || context.role === "owner") return;
  const assignment = await context.admin
    .from("inventory_user_yards")
    .select("yard_id,can_access")
    .eq("user_id", context.user.id)
    .eq("yard_id", yardId)
    .eq("can_access", true)
    .maybeSingle();
  if (assignment.error || !assignment.data) throw new Error("You do not have access to that yard's financial records.");
}

async function resolveRates(
  admin: ReturnType<typeof adminClient>,
  yardId: string,
  line: FinancialLine,
  jobDate: string,
  inputs: FinancialInputs,
) {
  const baseResult = await admin
    .from("titan_financial_rates")
    .select("rate_key,rate_value")
    .eq("yard_id", yardId)
    .eq("service_line", line)
    .eq("is_active", true);
  if (baseResult.error) throw baseResult.error;
  const rates: FinancialRates = {};
  (baseResult.data || []).forEach((row) => { rates[row.rate_key] = Number(row.rate_value); });
  const quantity = financialTierQuantity(line, inputs);
  const periodResult = await admin
    .from("titan_financial_rate_periods")
    .select("rate_key,rate_value,effective_from,minimum_quantity")
    .eq("yard_id", yardId)
    .eq("service_line", line)
    .eq("is_active", true)
    .lte("effective_from", jobDate)
    .lte("minimum_quantity", quantity)
    .order("effective_from", { ascending: false })
    .order("minimum_quantity", { ascending: false });
  if (periodResult.error) throw periodResult.error;
  const resolved = new Set<string>();
  (periodResult.data || []).forEach((row) => {
    if (resolved.has(row.rate_key)) return;
    rates[row.rate_key] = Number(row.rate_value);
    resolved.add(row.rate_key);
  });
  const missing = financialLineRateKeys[line].filter((key) => !Number.isFinite(rates[key]));
  if (missing.length) throw new Error(`The ${line.toUpperCase()} cost basis is missing: ${missing.join(", ")}.`);
  return rates;
}

async function validateCategory(admin: ReturnType<typeof adminClient>, line: FinancialLine, categoryCode: string) {
  const result = await admin
    .from("titan_financial_categories")
    .select("id")
    .eq("service_line", line)
    .eq("code", categoryCode)
    .eq("is_active", true)
    .maybeSingle();
  if (result.error || !result.data) throw new Error("That job category is not active for the selected service line.");
}

function permissionSummary(context: Awaited<ReturnType<typeof requestContext>>) {
  return {
    view: context.hasModule && canView(context.permissions, "financials"),
    create: context.hasModule && canCreate(context.permissions, "financials"),
    edit: context.hasModule && canEdit(context.permissions, "financials"),
    approve: context.hasModule && canApprove(context.permissions, "financials"),
    export: context.hasModule && canExport(context.permissions, "financials"),
    manageSettings: context.hasModule && canManageSettings(context.permissions, "financials"),
  };
}

function quarterBounds(quarter: string) {
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) throw new Error("Select a valid financial quarter.");
  const year = Number(match[1]);
  const quarterNumber = Number(match[2]);
  const startMonth = (quarterNumber - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function dateValue(value: unknown) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) throw new Error("Select a valid review date range.");
  return text;
}

function addUtcDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function reviewComparisonBounds(start: string, end: string, mode: "prior" | "year") {
  if (mode === "year") {
    const priorStart = new Date(`${start}T00:00:00Z`);
    const priorEnd = new Date(`${end}T00:00:00Z`);
    priorStart.setUTCFullYear(priorStart.getUTCFullYear() - 1);
    priorEnd.setUTCFullYear(priorEnd.getUTCFullYear() - 1);
    return { start: priorStart.toISOString().slice(0, 10), end: priorEnd.toISOString().slice(0, 10) };
  }
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  const priorEnd = addUtcDays(start, -1);
  return { start: addUtcDays(priorEnd, -(days - 1)), end: priorEnd };
}

function summarizeReviewJobs(rows: Array<{ id: string; revenue: number | string | null; manhours: number | string | null; computed: unknown }>) {
  const totals = rows.reduce((summary, job) => {
    const revenue = Number(job.revenue || 0);
    const computed = (job.computed || {}) as Record<string, unknown>;
    summary.revenue += revenue;
    summary.cost += Number(computed.total_cost || 0);
    summary.profit += Number(computed.profit || 0);
    summary.manhours += Number(job.manhours || 0);
    summary.laborDollars += Number(computed.labor_pct || 0) * revenue;
    return summary;
  }, { revenue: 0, cost: 0, profit: 0, manhours: 0, laborDollars: 0 });
  return {
    jobs: rows.length, revenue: totals.revenue, cost: totals.cost, profit: totals.profit,
    margin: totals.revenue ? totals.profit / totals.revenue : 0,
    manhours: totals.manhours, revenue_per_manhour: totals.manhours ? totals.revenue / totals.manhours : 0,
    labor_percent: totals.revenue ? totals.laborDollars / totals.revenue : 0,
    source_job_ids: rows.map((job) => job.id),
  };
}

const reviewMetricKeys = new Set(["jobs", "revenue", "cost", "profit", "margin", "manhours", "revenue_per_manhour", "labor_percent"]);
const reviewChartGroups = new Set(["month", "operator", "lead", "category"]);
const reviewSectionKinds = new Set(["metric", "chart", "narrative", "manual_metric"]);
const standardReviewTemplate = [
  { kind: "narrative", title: "Executive Summary", config: {}, body: null },
  { kind: "metric", title: "Revenue", config: { metric_key: "revenue" }, body: null },
  { kind: "metric", title: "Profit", config: { metric_key: "profit" }, body: null },
  { kind: "metric", title: "Profit Margin", config: { metric_key: "margin" }, body: null },
  { kind: "metric", title: "Revenue per Manhour", config: { metric_key: "revenue_per_manhour" }, body: null },
  { kind: "chart", title: "Revenue by Operator", config: { metric_key: "revenue", group_by: "operator" }, body: null },
  { kind: "narrative", title: "Moving Forward", config: {}, body: null },
] as const;

function reviewMetricValue(summary: ReturnType<typeof summarizeReviewJobs>, metricKey: string) {
  return Number(summary[metricKey as keyof typeof summary] || 0);
}

function reviewChartSeries(rows: Array<Record<string, unknown>>, groupBy: string, metricKey: string) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  rows.forEach((row) => {
    const key = groupBy === "month" ? String(row.job_date || "").slice(0, 7)
      : groupBy === "category" ? String(row.category_code || "standard")
        : String(row[groupBy] || "Unassigned");
    grouped.set(key || "Unassigned", [...(grouped.get(key || "Unassigned") || []), row]);
  });
  return Array.from(grouped, ([label, jobs]) => ({
    label,
    value: reviewMetricValue(summarizeReviewJobs(jobs as Parameters<typeof summarizeReviewJobs>[0]), metricKey),
  })).sort((a, b) => groupBy === "month" ? a.label.localeCompare(b.label) : b.value - a.value);
}

function reviewSectionSnapshot(section: { kind: string; title: string | null; body: string | null; config: Record<string, unknown> }, currentRows: Array<Record<string, unknown>>, comparisonRows: Array<Record<string, unknown>>) {
  const metricKey = String(section.config?.metric_key || "revenue");
  if (section.kind === "narrative") return { kind: section.kind, title: section.title, body: section.body };
  if (section.kind === "manual_metric") return { kind: section.kind, title: section.title, label: section.config?.label || section.title, value: section.config?.value || "" };
  if (section.kind === "chart") {
    const groupBy = String(section.config?.group_by || "month");
    return { kind: section.kind, title: section.title, metric_key: metricKey, group_by: groupBy, current: reviewChartSeries(currentRows, groupBy, metricKey), comparison: reviewChartSeries(comparisonRows, groupBy, metricKey) };
  }
  const current = summarizeReviewJobs(currentRows as Parameters<typeof summarizeReviewJobs>[0]);
  const comparison = summarizeReviewJobs(comparisonRows as Parameters<typeof summarizeReviewJobs>[0]);
  return { kind: "metric", title: section.title, metric_key: metricKey, current: reviewMetricValue(current, metricKey), comparison: reviewMetricValue(comparison, metricKey) };
}

function reviewText(value: unknown) {
  return String(value || "").trim() || null;
}

export async function GET(request: Request) {
  try {
    const context = await requestContext(request);
    const permissions = permissionSummary(context);
    if (!permissions.view) return Response.json({ error: "You do not have access to Financial KPIs." }, { status: 403 });
    const url = new URL(request.url);
    const yardId = url.searchParams.get("yardId") || "";
    const line = url.searchParams.get("line") || "all";
    const dateFrom = url.searchParams.get("from") || `${new Date().getFullYear()}-01-01`;
    const dateTo = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
    const includeVoid = url.searchParams.get("includeVoid") === "true";
    await assertYardAccess(context, yardId);

    let jobsQuery = context.admin
      .from("titan_financial_jobs")
      .select("*")
      .eq("yard_id", yardId)
      .gte("job_date", dateFrom)
      .lte("job_date", dateTo)
      .order("job_date", { ascending: false })
      .limit(5000);
    if (line !== "all") jobsQuery = jobsQuery.eq("service_line", line);
    if (!includeVoid) jobsQuery = jobsQuery.eq("status", "active");

    const [jobs, categories, rates, periods, targets, pickLists, tubingWeeks, tubingEntries, tubingRevenue, reviews] = await Promise.all([
      jobsQuery,
      context.admin.from("titan_financial_categories").select("*").eq("is_active", true).order("service_line").order("sort_order"),
      context.admin.from("titan_financial_rates").select("*").eq("yard_id", yardId).eq("is_active", true).order("service_line").order("sort_order"),
      context.admin.from("titan_financial_rate_periods").select("*").eq("yard_id", yardId).eq("is_active", true).order("effective_from", { ascending: false }),
      context.admin.from("titan_financial_targets").select("*").eq("is_active", true).or(`yard_id.is.null,yard_id.eq.${yardId}`),
      context.admin.from("titan_financial_pick_list_values").select("*").eq("yard_id", yardId).eq("is_active", true).order("service_line").order("list_key").order("sort_order"),
      context.admin.from("titan_financial_tubing_weeks").select("*").eq("yard_id", yardId).eq("is_active", true).gte("week_start", dateFrom).lte("week_start", dateTo).order("week_start", { ascending: false }),
      context.admin.from("titan_financial_tubing_entries").select("*").eq("yard_id", yardId).eq("is_active", true).gte("week_start", dateFrom).lte("week_start", dateTo).order("week_start", { ascending: false }).order("customer"),
      context.admin.from("titan_financial_tubing_revenue").select("*").eq("yard_id", yardId).eq("is_active", true).gte("revenue_month", `${dateFrom.slice(0, 7)}-01`).lte("revenue_month", dateTo).order("revenue_month", { ascending: false }).order("customer"),
      context.admin.from("titan_financial_reviews").select("*").eq("yard_id", yardId).order("quarter", { ascending: false }).order("service_line"),
    ]);
    const firstError = [jobs.error, categories.error, rates.error, periods.error, targets.error, pickLists.error, tubingWeeks.error, tubingEntries.error, tubingRevenue.error, reviews.error].find(Boolean);
    if (firstError) {
      if (isMissingFinancialSchema(firstError)) {
        return Response.json({ error: "Run supabase/titan_financial_kpis.sql before opening Financials.", setupRequired: true }, { status: 503 });
      }
      throw firstError;
    }
    const [marketServices, marketRigs, marketCells, marketCompetitors, marketTrend] = await Promise.all([
      context.admin.from("titan_financial_market_services").select("*").eq("yard_id", yardId).eq("is_active", true).eq("is_visible", true).order("sort_order"),
      context.admin.from("titan_financial_market_rigs").select("*").eq("yard_id", yardId).eq("is_active", true).order("operator").order("rig_name"),
      context.admin.from("titan_financial_market_cells").select("*").eq("yard_id", yardId).order("effective_date", { ascending: false }).limit(10000),
      context.admin.from("titan_financial_market_competitors").select("*").eq("yard_id", yardId).eq("is_active", true).order("canonical_name"),
      context.admin.from("titan_financial_market_trend").select("*").eq("yard_id", yardId).order("quarter"),
    ]);
    const marketError = [marketServices.error, marketRigs.error, marketCells.error, marketCompetitors.error, marketTrend.error].find(Boolean);
    const market = marketError && isMissingMarketSchema(marketError)
      ? { setupRequired: true, services: [], rigs: [], cells: [], competitors: [], trend: [] }
      : marketError
        ? (() => { throw marketError; })()
        : {
            setupRequired: false,
            services: marketServices.data || [],
            rigs: marketRigs.data || [],
            cells: marketCells.data || [],
            competitors: marketCompetitors.data || [],
            trend: marketTrend.data || [],
          };
    const reviewRows = reviews.data || [];
    const reviewIds = reviewRows.map((review) => review.id);
    const [reviewSectionsResult, reviewSnapshotsResult] = await Promise.all([
      reviewRows.length
        ? context.admin.from("titan_financial_review_sections").select("*").in("review_id", reviewIds).eq("is_active", true).order("position").order("created_at")
        : context.admin.from("titan_financial_review_sections").select("id").limit(0),
      reviewRows.length
        ? context.admin.from("titan_financial_review_snapshots").select("*").in("review_id", reviewIds).order("finalized_at", { ascending: false })
        : context.admin.from("titan_financial_review_snapshots").select("id").limit(0),
    ]);
    if (reviewSnapshotsResult.error) throw reviewSnapshotsResult.error;
    const reviewComposer = reviewSectionsResult.error && isMissingReviewComposerSchema(reviewSectionsResult.error)
      ? { setupRequired: true, sections: [] }
      : reviewSectionsResult.error
        ? (() => { throw reviewSectionsResult.error; })()
        : { setupRequired: false, sections: reviewSectionsResult.data || [] };
    return Response.json({
      jobs: jobs.data || [],
      categories: categories.data || [],
      rates: rates.data || [],
      ratePeriods: periods.data || [],
      targets: targets.data || [],
      pickLists: pickLists.data || [],
      tubing: {
        weeks: tubingWeeks.data || [],
        entries: tubingEntries.data || [],
        revenue: tubingRevenue.data || [],
      },
      reviews: reviews.data || [],
      reviewSnapshots: reviewSnapshotsResult.data || [],
      reviewComposer,
      market,
      permissions,
      profile: { fullName: context.profile.full_name, role: context.role },
    });
  } catch (error) {
    return Response.json({ error: errorText(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requestContext(request);
    const permissions = permissionSummary(context);
    if (!permissions.view) return Response.json({ error: "You do not have access to Financial KPIs." }, { status: 403 });
    const body = await request.json();
    const action = String(body.action || "");
    const yardId = String(body.yardId || "");
    await assertYardAccess(context, yardId);

    if (action === "save_base_rate") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage the financial cost basis." }, { status: 403 });
      const line = lineValue(body.line);
      const rateKey = String(body.rateKey || "");
      if (!financialLineRateKeys[line].includes(rateKey)) throw new Error("Select a valid cost item.");
      const rateValue = Number(body.rateValue);
      if (!Number.isFinite(rateValue) || rateValue < 0 || (rateKey === "overhead" && rateValue > 1)) throw new Error("Enter a valid rate value.");
      const existing = await context.admin.from("titan_financial_rates").select("*")
        .eq("yard_id", yardId).eq("service_line", line).eq("rate_key", rateKey).single();
      if (existing.error || !existing.data) throw new Error("The base rate could not be found.");
      const saved = await context.admin.from("titan_financial_rates").update({
        rate_value: rateValue, updated_at: new Date().toISOString(), updated_by: context.user.id,
      }).eq("id", existing.data.id).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_rate", entity_id: existing.data.id, action: "update",
        before_value: existing.data, after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ rate: saved.data });
    }

    if (action === "save_category") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage financial job categories." }, { status: 403 });
      const line = lineValue(body.line);
      const id = String(body.id || "");
      const label = String(body.label || "").trim();
      const code = String(body.code || label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      if (!label || !code) throw new Error("Enter a category name.");
      const existing = id
        ? await context.admin.from("titan_financial_categories").select("*").eq("id", id).single()
        : await context.admin.from("titan_financial_categories").select("*").eq("service_line", line).eq("code", code).maybeSingle();
      if (existing.error || (id && !existing.data)) throw existing.error || new Error("Job category not found.");
      if (existing.data && (existing.data.service_line !== line || existing.data.code !== code)) throw new Error("A category's service line and code cannot be changed.");
      const values = { label, is_active: true, updated_at: new Date().toISOString(), updated_by: context.user.id };
      const saved = existing.data
        ? await context.admin.from("titan_financial_categories").update(values).eq("id", existing.data.id).select("*").single()
        : await context.admin.from("titan_financial_categories").insert({ service_line: line, code, ...values, created_by: context.user.id }).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_category", entity_id: saved.data.id,
        action: existing.data ? "update" : "create", before_value: existing.data, after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ category: saved.data });
    }

    if (action === "deactivate_category") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage financial job categories." }, { status: 403 });
      const id = String(body.id || "");
      const existing = await context.admin.from("titan_financial_categories").select("*").eq("id", id).single();
      if (existing.error || !existing.data) throw new Error("Job category not found.");
      const [jobsUsing, targetsUsing] = await Promise.all([
        context.admin.from("titan_financial_jobs").select("id", { count: "exact", head: true }).eq("service_line", existing.data.service_line).eq("category_code", existing.data.code).eq("status", "active"),
        context.admin.from("titan_financial_targets").select("id", { count: "exact", head: true }).eq("service_line", existing.data.service_line).eq("category_code", existing.data.code).eq("is_active", true),
      ]);
      if ((jobsUsing.count || 0) > 0 || (targetsUsing.count || 0) > 0) throw new Error("This category is still used by active jobs or KPI targets and cannot be deactivated.");
      const saved = await context.admin.from("titan_financial_categories").update({ is_active: false, updated_at: new Date().toISOString(), updated_by: context.user.id }).eq("id", id).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({ yard_id: yardId, entity_type: "financial_category", entity_id: id, action: "deactivate", before_value: existing.data, after_value: saved.data, actor_id: context.user.id });
      return Response.json({ category: saved.data });
    }

    if (action === "save_pick_list_value") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage financial pick lists." }, { status: 403 });
      const line = configurationLineValue(body.line);
      const listKey = String(body.listKey || "");
      const listValue = String(body.listValue || "").trim();
      const id = String(body.id || "");
      if (!financialPickListKeys.has(listKey)) throw new Error("Select a valid pick list.");
      if (!listValue) throw new Error("Enter a list value.");
      const existing = id
        ? await context.admin.from("titan_financial_pick_list_values").select("*").eq("id", id).single()
        : await context.admin.from("titan_financial_pick_list_values").select("*").eq("yard_id", yardId).eq("service_line", line).eq("list_key", listKey).eq("list_value", listValue).maybeSingle();
      if (existing.error || (id && !existing.data)) throw existing.error || new Error("Pick-list value not found.");
      if (existing.data && (existing.data.yard_id !== yardId || existing.data.service_line !== line || existing.data.list_key !== listKey)) throw new Error("A pick-list value cannot move to another list.");
      const values = { list_value: listValue, is_active: true, updated_at: new Date().toISOString(), updated_by: context.user.id };
      const saved = existing.data
        ? await context.admin.from("titan_financial_pick_list_values").update(values).eq("id", existing.data.id).select("*").single()
        : await context.admin.from("titan_financial_pick_list_values").insert({ yard_id: yardId, service_line: line, list_key: listKey, ...values, created_by: context.user.id }).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({ yard_id: yardId, entity_type: "financial_pick_list", entity_id: saved.data.id, action: existing.data ? "update" : "create", before_value: existing.data, after_value: saved.data, actor_id: context.user.id });
      return Response.json({ pickListValue: saved.data });
    }

    if (action === "deactivate_pick_list_value") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage financial pick lists." }, { status: 403 });
      const id = String(body.id || "");
      const existing = await context.admin.from("titan_financial_pick_list_values").select("*").eq("id", id).eq("yard_id", yardId).single();
      if (existing.error || !existing.data) throw new Error("Pick-list value not found.");
      const saved = await context.admin.from("titan_financial_pick_list_values").update({ is_active: false, updated_at: new Date().toISOString(), updated_by: context.user.id }).eq("id", id).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({ yard_id: yardId, entity_type: "financial_pick_list", entity_id: id, action: "deactivate", before_value: existing.data, after_value: saved.data, actor_id: context.user.id });
      return Response.json({ pickListValue: saved.data });
    }

    if (action === "save_rate_period") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage the financial cost basis." }, { status: 403 });
      const line = lineValue(body.line);
      const rateKey = String(body.rateKey || "");
      if (!financialLineRateKeys[line].includes(rateKey)) throw new Error("Select a valid cost item.");
      const effectiveFrom = String(body.effectiveFrom || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new Error("Select a valid effective date.");
      const minimumQuantity = Number(body.minimumQuantity);
      const rateValue = Number(body.rateValue);
      if (!Number.isFinite(minimumQuantity) || minimumQuantity < 0) throw new Error("Minimum quantity must be zero or greater.");
      if (!Number.isFinite(rateValue) || rateValue < 0 || (rateKey === "overhead" && rateValue > 1)) throw new Error("Enter a valid rate value.");
      const existing = await context.admin.from("titan_financial_rate_periods").select("*")
        .eq("yard_id", yardId).eq("service_line", line).eq("rate_key", rateKey)
        .eq("effective_from", effectiveFrom).eq("minimum_quantity", minimumQuantity).maybeSingle();
      if (existing.error) throw existing.error;
      const values = {
        rate_value: rateValue, is_active: true, updated_at: new Date().toISOString(), updated_by: context.user.id,
      };
      const saved = existing.data
        ? await context.admin.from("titan_financial_rate_periods").update(values).eq("id", existing.data.id).select("*").single()
        : await context.admin.from("titan_financial_rate_periods").insert({
          yard_id: yardId, service_line: line, rate_key: rateKey, effective_from: effectiveFrom,
          minimum_quantity: minimumQuantity, ...values, created_by: context.user.id,
        }).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_rate_period", entity_id: saved.data.id,
        action: existing.data ? "update" : "create", before_value: existing.data,
        after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ ratePeriod: saved.data });
    }

    if (action === "deactivate_rate_period") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage the financial cost basis." }, { status: 403 });
      const id = String(body.id || "");
      const existing = await context.admin.from("titan_financial_rate_periods").select("*").eq("id", id).single();
      if (existing.error || !existing.data || existing.data.yard_id !== yardId) throw new Error("Scheduled rate not found.");
      const saved = await context.admin.from("titan_financial_rate_periods").update({
        is_active: false, updated_at: new Date().toISOString(), updated_by: context.user.id,
      }).eq("id", id).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_rate_period", entity_id: id, action: "deactivate",
        before_value: existing.data, after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ ratePeriod: saved.data });
    }

    if (action === "save_target") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage financial KPI targets." }, { status: 403 });
      const line = lineValue(body.line);
      const categoryCode = String(body.categoryCode || "standard");
      await validateCategory(context.admin, line, categoryCode);
      const metricKey = String(body.metricKey || "");
      const metricUnits: Record<string, string> = { labor_pct: "percent", rev_per_mh: "currency", margin: "percent" };
      const unit = metricUnits[metricKey];
      if (!unit) throw new Error("Select a valid KPI metric.");
      const direction = String(body.direction || "");
      if (direction !== "above" && direction !== "below") throw new Error("Select a valid target direction.");
      const targetValue = Number(body.targetValue);
      if (!Number.isFinite(targetValue) || targetValue < 0 || (unit === "percent" && targetValue > 1)) throw new Error("Enter a valid target value.");
      const label = String(body.label || "Target").trim() || "Target";
      const scopeYardId = body.scope === "default" ? null : yardId;
      const id = String(body.id || "");
      let existing;
      if (id) {
        existing = await context.admin.from("titan_financial_targets").select("*").eq("id", id).single();
        if (existing.error || !existing.data) throw new Error("KPI target not found.");
        const scopeMatches = existing.data.yard_id === scopeYardId;
        if (!scopeMatches || existing.data.service_line !== line || existing.data.category_code !== categoryCode || existing.data.metric_key !== metricKey) {
          throw new Error("The target scope and metric cannot be changed after creation.");
        }
      } else {
        let query = context.admin.from("titan_financial_targets").select("*")
          .eq("service_line", line).eq("category_code", categoryCode).eq("metric_key", metricKey);
        query = scopeYardId === null ? query.is("yard_id", null) : query.eq("yard_id", scopeYardId);
        existing = await query.maybeSingle();
        if (existing.error) throw existing.error;
      }
      const values = {
        direction, target_value: targetValue, unit, label, is_active: true,
        updated_at: new Date().toISOString(), updated_by: context.user.id,
      };
      const saved = existing.data
        ? await context.admin.from("titan_financial_targets").update(values).eq("id", existing.data.id).select("*").single()
        : await context.admin.from("titan_financial_targets").insert({
          service_line: line, yard_id: scopeYardId, category_code: categoryCode, metric_key: metricKey,
          ...values, created_by: context.user.id,
        }).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_target", entity_id: saved.data.id,
        action: existing.data ? "update" : "create", before_value: existing.data,
        after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ target: saved.data });
    }

    if (action === "deactivate_target") {
      if (!permissions.manageSettings) return Response.json({ error: "You cannot manage financial KPI targets." }, { status: 403 });
      const id = String(body.id || "");
      const existing = await context.admin.from("titan_financial_targets").select("*").eq("id", id).single();
      if (existing.error || !existing.data || (existing.data.yard_id && existing.data.yard_id !== yardId)) throw new Error("KPI target not found.");
      const saved = await context.admin.from("titan_financial_targets").update({
        is_active: false, updated_at: new Date().toISOString(), updated_by: context.user.id,
      }).eq("id", id).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_target", entity_id: id, action: "deactivate",
        before_value: existing.data, after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ target: saved.data });
    }

    if (action === "save_review") {
      if (!permissions.edit && !permissions.create) return Response.json({ error: "You cannot change financial reviews." }, { status: 403 });
      const line = lineValue(body.line);
      const id = String(body.id || "");
      const quarter = body.quarter ? String(body.quarter) : null;
      const bounds = quarter ? quarterBounds(quarter) : { start: dateValue(body.rangeStart), end: dateValue(body.rangeEnd) };
      if (bounds.end < bounds.start) throw new Error("The review end date cannot be before its start date.");
      const compareMode = String(body.compareMode || "prior") as "prior" | "year";
      if (!new Set(["prior", "year"]).has(compareMode)) throw new Error("Select a valid comparison period.");
      const existing = id
        ? await context.admin.from("titan_financial_reviews").select("*").eq("id", id).eq("yard_id", yardId).maybeSingle()
        : quarter
          ? await context.admin.from("titan_financial_reviews").select("*").eq("yard_id", yardId).eq("service_line", line).eq("quarter", quarter).maybeSingle()
          : await context.admin.from("titan_financial_reviews").select("*").eq("yard_id", yardId).eq("service_line", line).is("quarter", null).eq("range_start", bounds.start).eq("range_end", bounds.end).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.status === "final") throw new Error("A finalized review cannot be changed.");
      const values = {
        highlights: reviewText(body.highlights),
        lowlights: reviewText(body.lowlights),
        goals: reviewText(body.goals),
        compare_mode: compareMode,
        updated_at: new Date().toISOString(),
        updated_by: context.user.id,
      };
      const saved = existing.data
        ? await context.admin.from("titan_financial_reviews").update(values).eq("id", existing.data.id).select("*").single()
        : await context.admin.from("titan_financial_reviews").insert({
          yard_id: yardId, service_line: line, quarter, range_start: bounds.start, range_end: bounds.end, ...values, created_by: context.user.id,
        }).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_review", entity_id: saved.data.id,
        action: existing.data ? "update" : "create", before_value: existing.data,
        after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ review: saved.data });
    }

    if (action === "save_review_section") {
      if (!permissions.edit && !permissions.create) return Response.json({ error: "You cannot change financial reviews." }, { status: 403 });
      const reviewId = String(body.reviewId || "");
      const sectionId = String(body.sectionId || "");
      const review = await context.admin.from("titan_financial_reviews").select("id,status").eq("id", reviewId).eq("yard_id", yardId).single();
      if (review.error || !review.data) throw new Error("Financial review not found.");
      if (review.data.status !== "open") throw new Error("Finalized reviews cannot be changed.");
      const kind = String(body.kind || "");
      if (!reviewSectionKinds.has(kind)) throw new Error("Select a valid review section type.");
      const config = body.config && typeof body.config === "object" && !Array.isArray(body.config) ? body.config as Record<string, unknown> : {};
      if ((kind === "metric" || kind === "chart") && !reviewMetricKeys.has(String(config.metric_key || ""))) throw new Error("Select a valid section metric.");
      if (kind === "chart" && !reviewChartGroups.has(String(config.group_by || ""))) throw new Error("Select a valid chart grouping.");
      const title = reviewText(body.title);
      const values = {
        kind, title, config, body: kind === "narrative" ? reviewText(body.body) : null,
        updated_at: new Date().toISOString(), updated_by: context.user.id,
      };
      const existing = sectionId
        ? await context.admin.from("titan_financial_review_sections").select("*").eq("id", sectionId).eq("review_id", reviewId).eq("is_active", true).maybeSingle()
        : { data: null, error: null };
      if (existing.error) throw existing.error;
      let nextPosition = 10;
      if (!sectionId) {
        const lastPosition = await context.admin.from("titan_financial_review_sections").select("position").eq("review_id", reviewId).eq("is_active", true).order("position", { ascending: false }).limit(1).maybeSingle();
        if (lastPosition.error) throw lastPosition.error;
        nextPosition = Number(lastPosition.data?.position || 0) + 10;
      }
      const saved = existing.data
        ? await context.admin.from("titan_financial_review_sections").update(values).eq("id", sectionId).select("*").single()
        : await context.admin.from("titan_financial_review_sections").insert({ review_id: reviewId, position: nextPosition, ...values, created_by: context.user.id }).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({ yard_id: yardId, entity_type: "financial_review_section", entity_id: saved.data.id, action: existing.data ? "update" : "create", before_value: existing.data, after_value: saved.data, actor_id: context.user.id });
      return Response.json({ section: saved.data });
    }

    if (action === "apply_review_template") {
      if (!permissions.edit && !permissions.create) return Response.json({ error: "You cannot change financial reviews." }, { status: 403 });
      const reviewId = String(body.reviewId || "");
      const review = await context.admin.from("titan_financial_reviews").select("id,status").eq("id", reviewId).eq("yard_id", yardId).single();
      if (review.error || !review.data) throw new Error("Financial review not found.");
      if (review.data.status !== "open") throw new Error("Finalized reviews cannot be changed.");
      const existing = await context.admin.from("titan_financial_review_sections").select("id").eq("review_id", reviewId).eq("is_active", true).limit(1);
      if (existing.error) throw existing.error;
      if (existing.data?.length) throw new Error("The standard template can only be applied to an empty review.");
      const now = new Date().toISOString();
      const created = await context.admin.from("titan_financial_review_sections").insert(standardReviewTemplate.map((section, index) => ({
        review_id: reviewId,
        position: (index + 1) * 10,
        ...section,
        created_by: context.user.id,
        updated_at: now,
        updated_by: context.user.id,
      }))).select("*");
      if (created.error) throw created.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId,
        entity_type: "financial_review",
        entity_id: reviewId,
        action: "apply_standard_template",
        before_value: { section_count: 0 },
        after_value: { section_count: created.data.length, section_ids: created.data.map((section) => section.id) },
        actor_id: context.user.id,
      });
      return Response.json({ sections: created.data });
    }

    if (action === "deactivate_review_section") {
      if (!permissions.edit) return Response.json({ error: "You cannot change financial reviews." }, { status: 403 });
      const sectionId = String(body.sectionId || "");
      const existing = await context.admin.from("titan_financial_review_sections").select("*,titan_financial_reviews!inner(yard_id,status)").eq("id", sectionId).eq("is_active", true).single();
      const parent = existing.data?.titan_financial_reviews as unknown as { yard_id: string; status: string } | undefined;
      if (existing.error || !existing.data || parent?.yard_id !== yardId) throw new Error("Review section not found.");
      if (parent.status !== "open") throw new Error("Finalized reviews cannot be changed.");
      const saved = await context.admin.from("titan_financial_review_sections").update({ is_active: false, updated_at: new Date().toISOString(), updated_by: context.user.id }).eq("id", sectionId).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({ yard_id: yardId, entity_type: "financial_review_section", entity_id: sectionId, action: "deactivate", before_value: existing.data, after_value: saved.data, actor_id: context.user.id });
      return Response.json({ section: saved.data });
    }

    if (action === "reorder_review_sections") {
      if (!permissions.edit) return Response.json({ error: "You cannot change financial reviews." }, { status: 403 });
      const reviewId = String(body.reviewId || "");
      const sectionIds: string[] = Array.isArray(body.sectionIds) ? body.sectionIds.map(String) : [];
      const review = await context.admin.from("titan_financial_reviews").select("id,status").eq("id", reviewId).eq("yard_id", yardId).single();
      if (review.error || !review.data) throw new Error("Financial review not found.");
      if (review.data.status !== "open") throw new Error("Finalized reviews cannot be changed.");
      const sections = await context.admin.from("titan_financial_review_sections").select("id").eq("review_id", reviewId).eq("is_active", true);
      if (sections.error) throw sections.error;
      const expected = new Set((sections.data || []).map((section) => section.id));
      if (sectionIds.length !== expected.size || sectionIds.some((id) => !expected.has(id))) throw new Error("The review section order is incomplete.");
      const updates = await Promise.all(sectionIds.map((id, index) => context.admin.from("titan_financial_review_sections").update({ position: (index + 1) * 10, updated_at: new Date().toISOString(), updated_by: context.user.id }).eq("id", id)));
      const updateError = updates.find((result) => result.error)?.error;
      if (updateError) throw updateError;
      return Response.json({ ok: true });
    }

    if (action === "finalize_review") {
      if (!permissions.approve) return Response.json({ error: "You cannot finalize financial reviews." }, { status: 403 });
      const id = String(body.id || "");
      const review = await context.admin.from("titan_financial_reviews").select("*").eq("id", id).single();
      if (review.error || !review.data || review.data.yard_id !== yardId) throw new Error("Financial review not found.");
      if (review.data.status === "final") throw new Error("This review is already final.");
      const line = lineValue(review.data.service_line);
      const bounds = review.data.range_start && review.data.range_end
        ? { start: String(review.data.range_start).slice(0, 10), end: String(review.data.range_end).slice(0, 10) }
        : quarterBounds(review.data.quarter);
      const compareMode = (review.data.compare_mode || "prior") as "prior" | "year";
      const comparisonBounds = reviewComparisonBounds(bounds.start, bounds.end, compareMode);
      const [source, comparisonSource, sectionSource] = await Promise.all([
        context.admin.from("titan_financial_jobs").select("id,job_date,category_code,operator,lead,revenue,manhours,computed").eq("yard_id", yardId).eq("service_line", line).eq("status", "active").gte("job_date", bounds.start).lte("job_date", bounds.end),
        context.admin.from("titan_financial_jobs").select("id,job_date,category_code,operator,lead,revenue,manhours,computed").eq("yard_id", yardId).eq("service_line", line).eq("status", "active").gte("job_date", comparisonBounds.start).lte("job_date", comparisonBounds.end),
        context.admin.from("titan_financial_review_sections").select("*").eq("review_id", id).eq("is_active", true).order("position"),
      ]);
      if (source.error) throw source.error;
      if (comparisonSource.error) throw comparisonSource.error;
      if (sectionSource.error && !isMissingReviewComposerSchema(sectionSource.error)) throw sectionSource.error;
      const current = summarizeReviewJobs(source.data || []);
      const comparison = summarizeReviewJobs(comparisonSource.data || []);
      const finalizedAt = new Date().toISOString();
      const sectionSnapshots = (sectionSource.data || []).map((section) => ({
        id: section.id,
        snapshot: reviewSectionSnapshot(
          { ...section, config: (section.config || {}) as Record<string, unknown> },
          source.data as unknown as Array<Record<string, unknown>>,
          comparisonSource.data as unknown as Array<Record<string, unknown>>,
        ),
      }));
      const sectionUpdates = await Promise.all(sectionSnapshots.map((section) => context.admin.from("titan_financial_review_sections").update({ snapshot: section.snapshot, updated_at: finalizedAt, updated_by: context.user.id }).eq("id", section.id)));
      const sectionUpdateError = sectionUpdates.find((result) => result.error)?.error;
      if (sectionUpdateError) throw sectionUpdateError;
      const snapshot = {
        quarter: review.data.quarter, service_line: line, period_start: bounds.start, period_end: bounds.end,
        compare_mode: compareMode, comparison_start: comparisonBounds.start, comparison_end: comparisonBounds.end,
        ...current, comparison, section_snapshots: sectionSnapshots, generated_at: finalizedAt,
      };
      const finalized = await context.admin.from("titan_financial_reviews").update({
        status: "final", snapshot, finalized_by: context.user.id, finalized_at: finalizedAt,
        updated_at: finalizedAt, updated_by: context.user.id,
      }).eq("id", id).select("*").single();
      if (finalized.error) throw finalized.error;
      const snapshotInsert = await context.admin.from("titan_financial_review_snapshots").insert({
        review_id: id, snapshot, finalized_by: context.user.id, finalized_at: finalizedAt,
      });
      if (snapshotInsert.error) throw snapshotInsert.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_review", entity_id: id, action: "finalize",
        before_value: review.data, after_value: finalized.data, actor_id: context.user.id,
      });
      return Response.json({ review: finalized.data });
    }

    if (action === "reopen_review") {
      if (!permissions.approve) return Response.json({ error: "You cannot reopen financial reviews." }, { status: 403 });
      const id = String(body.id || "");
      const reason = String(body.reason || "").trim();
      if (reason.length < 8) throw new Error("Enter a clear reason for reopening this review.");
      const review = await context.admin.from("titan_financial_reviews").select("*").eq("id", id).eq("yard_id", yardId).single();
      if (review.error || !review.data) throw new Error("Financial review not found.");
      if (review.data.status !== "final") throw new Error("Only finalized reviews can be reopened.");
      const sectionReset = await context.admin.from("titan_financial_review_sections").update({ snapshot: null, updated_at: new Date().toISOString(), updated_by: context.user.id }).eq("review_id", id).eq("is_active", true);
      if (sectionReset.error && !isMissingReviewComposerSchema(sectionReset.error)) throw sectionReset.error;
      const reopenedAt = new Date().toISOString();
      const reopened = await context.admin.from("titan_financial_reviews").update({
        status: "open",
        snapshot: null,
        finalized_by: null,
        finalized_at: null,
        updated_at: reopenedAt,
        updated_by: context.user.id,
      }).eq("id", id).select("*").single();
      if (reopened.error) throw reopened.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId,
        entity_type: "financial_review",
        entity_id: id,
        action: "reopen",
        before_value: review.data,
        after_value: { ...reopened.data, reopen_reason: reason },
        actor_id: context.user.id,
      });
      return Response.json({ review: reopened.data });
    }

    if (action === "save_tubing_week") {
      if (!permissions.edit && !permissions.create) return Response.json({ error: "You cannot change Tubing financial records." }, { status: 403 });
      const weekStart = String(body.weekStart || "");
      const weekDate = new Date(`${weekStart}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || Number.isNaN(weekDate.getTime()) || weekDate.getUTCDay() !== 0) {
        throw new Error("Tubing weeks must start on a Sunday.");
      }
      const manhours = body.manhours === null || body.manhours === "" ? null : Number(body.manhours);
      if (manhours !== null && (!Number.isFinite(manhours) || manhours < 0)) throw new Error("Enter valid whole-week manhours.");
      const entries = Array.isArray(body.entries) ? body.entries : [];
      const cleanedEntries = entries.map((entry: Record<string, unknown>) => {
        const customer = String(entry.customer || "").trim();
        if (!customer) throw new Error("Every Tubing activity row needs a customer.");
        const values = Object.fromEntries(["joints", "jobs", "trucks_in", "trucks_out"].map((key) => {
          const raw = entry[key];
          if (raw === null || raw === undefined || raw === "") return [key, null];
          const value = Number(raw);
          if (!Number.isInteger(value) || value < 0) throw new Error(`${key.replaceAll("_", " ")} must be a whole number or blank.`);
          return [key, value];
        }));
        return { yard_id: yardId, week_start: weekStart, customer, ...values, is_active: true, updated_at: new Date().toISOString(), updated_by: context.user.id };
      });
      const before = await context.admin.from("titan_financial_tubing_weeks").select("*").eq("yard_id", yardId).eq("week_start", weekStart).maybeSingle();
      if (before.error) throw before.error;
      const week = await context.admin.from("titan_financial_tubing_weeks").upsert({
        yard_id: yardId, week_start: weekStart, manhours, is_active: true,
        updated_at: new Date().toISOString(), updated_by: context.user.id,
        ...(before.data ? {} : { created_by: context.user.id }),
      }, { onConflict: "yard_id,week_start" }).select("*").single();
      if (week.error) throw week.error;
      if (cleanedEntries.length) {
        const savedEntries = await context.admin.from("titan_financial_tubing_entries").upsert(
          cleanedEntries,
          { onConflict: "yard_id,week_start,customer" },
        );
        if (savedEntries.error) throw savedEntries.error;
      }
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_tubing_week", entity_id: week.data.id,
        action: before.data ? "update" : "create", before_value: before.data,
        after_value: { week: week.data, entries: cleanedEntries }, actor_id: context.user.id,
      });
      return Response.json({ week: week.data });
    }

    if (action === "save_tubing_revenue") {
      if (!permissions.edit && !permissions.create) return Response.json({ error: "You cannot change Tubing financial records." }, { status: 403 });
      const revenueMonth = String(body.revenueMonth || "");
      if (!/^\d{4}-\d{2}-01$/.test(revenueMonth)) throw new Error("Select a valid revenue month.");
      const customer = String(body.customer || "").trim() || null;
      const amount = Number(body.amount);
      if (!Number.isFinite(amount)) throw new Error("Enter a valid revenue amount.");
      let existingQuery = context.admin.from("titan_financial_tubing_revenue").select("*").eq("yard_id", yardId).eq("revenue_month", revenueMonth);
      existingQuery = customer === null ? existingQuery.is("customer", null) : existingQuery.eq("customer", customer);
      const existing = await existingQuery.maybeSingle();
      if (existing.error) throw existing.error;
      const values = { amount, source: "entered", is_active: true, updated_at: new Date().toISOString(), updated_by: context.user.id };
      const saved = existing.data
        ? await context.admin.from("titan_financial_tubing_revenue").update(values).eq("id", existing.data.id).select("*").single()
        : await context.admin.from("titan_financial_tubing_revenue").insert({ yard_id: yardId, revenue_month: revenueMonth, customer, ...values, created_by: context.user.id }).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_tubing_revenue", entity_id: saved.data.id,
        action: existing.data ? "update" : "create", before_value: existing.data, after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ revenue: saved.data });
    }

    if (action === "preview" || action === "create") {
      if (action === "create" && !permissions.create) return Response.json({ error: "You cannot add financial jobs." }, { status: 403 });
      const line = lineValue(body.line);
      const jobDate = String(body.jobDate || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) throw new Error("Enter a valid job date.");
      const categoryCode = String(body.categoryCode || "standard");
      const inputs = cleanInputs(body.inputs);
      await validateCategory(context.admin, line, categoryCode);
      const rates = await resolveRates(context.admin, yardId, line, jobDate, inputs);
      const computed = computeFinancialJob(line, inputs, rates);
      if (action === "preview") return Response.json({ computed, ratesUsed: rates });
      const headline = financialHeadline(line, inputs);
      const insert = await context.admin.from("titan_financial_jobs").insert({
        yard_id: yardId,
        service_line: line,
        job_date: jobDate,
        category_code: categoryCode,
        operator: inputs.operator || null,
        rig: inputs.rig || null,
        lead: inputs.lead || null,
        state: inputs.state || null,
        invoice: inputs.invoice || null,
        revenue: headline.revenue,
        crew: inputs.crew || null,
        manhours: headline.manhours,
        comments: inputs.comments || null,
        inputs,
        computed,
        rates_used: rates,
        source: "entered",
        created_by: context.user.id,
        updated_by: context.user.id,
      }).select("*").single();
      if (insert.error) throw insert.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_job", entity_id: insert.data.id,
        action: "create", after_value: insert.data, actor_id: context.user.id,
      });
      return Response.json({ job: insert.data });
    }

    if (action === "update") {
      if (!permissions.edit) return Response.json({ error: "You cannot change financial jobs." }, { status: 403 });
      const id = String(body.id || "");
      const existing = await context.admin.from("titan_financial_jobs").select("*").eq("id", id).single();
      if (existing.error || !existing.data) throw new Error("Financial job not found.");
      if (existing.data.yard_id !== yardId) throw new Error("The selected yard does not match this job.");
      if (existing.data.status === "void") throw new Error("A voided financial job cannot be changed.");
      const line = lineValue(existing.data.service_line);
      const jobDate = String(body.jobDate || existing.data.job_date).slice(0, 10);
      const categoryCode = String(body.categoryCode || existing.data.category_code || "standard");
      const inputs = cleanInputs(body.inputs);
      await validateCategory(context.admin, line, categoryCode);
      const frozenRates = existing.data.rates_used as FinancialRates;
      const completeSnapshot = financialLineRateKeys[line].every((key) => Number.isFinite(Number(frozenRates?.[key])));
      const rates = completeSnapshot ? frozenRates : await resolveRates(context.admin, yardId, line, jobDate, inputs);
      const computed = computeFinancialJob(line, inputs, rates);
      const headline = financialHeadline(line, inputs);
      const update = await context.admin.from("titan_financial_jobs").update({
        job_date: jobDate,
        category_code: categoryCode,
        operator: inputs.operator || null,
        rig: inputs.rig || null,
        lead: inputs.lead || null,
        state: inputs.state || null,
        invoice: inputs.invoice || null,
        revenue: headline.revenue,
        crew: inputs.crew || null,
        manhours: headline.manhours,
        comments: inputs.comments || null,
        inputs,
        computed,
        rates_used: rates,
        updated_at: new Date().toISOString(),
        updated_by: context.user.id,
      }).eq("id", id).select("*").single();
      if (update.error) throw update.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_job", entity_id: id,
        action: "update", before_value: existing.data, after_value: update.data, actor_id: context.user.id,
      });
      return Response.json({ job: update.data });
    }

    if (action === "void") {
      if (!permissions.edit) return Response.json({ error: "You cannot void financial jobs." }, { status: 403 });
      const id = String(body.id || "");
      const reason = String(body.reason || "").trim();
      if (!reason) throw new Error("Enter a reason for voiding this job.");
      const existing = await context.admin.from("titan_financial_jobs").select("*").eq("id", id).single();
      if (existing.error || !existing.data || existing.data.yard_id !== yardId) throw new Error("Financial job not found.");
      const update = await context.admin.from("titan_financial_jobs").update({
        status: "void", void_reason: reason, updated_at: new Date().toISOString(), updated_by: context.user.id,
      }).eq("id", id).select("*").single();
      if (update.error) throw update.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_job", entity_id: id,
        action: "void", before_value: existing.data, after_value: update.data, actor_id: context.user.id,
      });
      return Response.json({ job: update.data });
    }

    return Response.json({ error: "Unknown financial action." }, { status: 400 });
  } catch (error) {
    const message = errorText(error);
    const status = message.includes("signed in") || message.includes("session") ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
