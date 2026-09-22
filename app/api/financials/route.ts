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

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function lineValue(value: unknown): FinancialLine {
  const line = String(value || "") as FinancialLine;
  if (!financialLines.has(line)) throw new Error("Select a valid service line.");
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

    const [jobs, categories, rates, periods, targets, tubingWeeks, tubingEntries, tubingRevenue, reviews] = await Promise.all([
      jobsQuery,
      context.admin.from("titan_financial_categories").select("*").eq("is_active", true).order("service_line").order("sort_order"),
      context.admin.from("titan_financial_rates").select("*").eq("yard_id", yardId).eq("is_active", true).order("service_line").order("sort_order"),
      context.admin.from("titan_financial_rate_periods").select("*").eq("yard_id", yardId).eq("is_active", true).order("effective_from", { ascending: false }),
      context.admin.from("titan_financial_targets").select("*").eq("is_active", true).or(`yard_id.is.null,yard_id.eq.${yardId}`),
      context.admin.from("titan_financial_tubing_weeks").select("*").eq("yard_id", yardId).eq("is_active", true).gte("week_start", dateFrom).lte("week_start", dateTo).order("week_start", { ascending: false }),
      context.admin.from("titan_financial_tubing_entries").select("*").eq("yard_id", yardId).eq("is_active", true).gte("week_start", dateFrom).lte("week_start", dateTo).order("week_start", { ascending: false }).order("customer"),
      context.admin.from("titan_financial_tubing_revenue").select("*").eq("yard_id", yardId).eq("is_active", true).gte("revenue_month", `${dateFrom.slice(0, 7)}-01`).lte("revenue_month", dateTo).order("revenue_month", { ascending: false }).order("customer"),
      context.admin.from("titan_financial_reviews").select("*").eq("yard_id", yardId).order("quarter", { ascending: false }).order("service_line"),
    ]);
    const firstError = [jobs.error, categories.error, rates.error, periods.error, targets.error, tubingWeeks.error, tubingEntries.error, tubingRevenue.error, reviews.error].find(Boolean);
    if (firstError) {
      if (isMissingFinancialSchema(firstError)) {
        return Response.json({ error: "Run supabase/titan_financial_kpis.sql before opening Financials.", setupRequired: true }, { status: 503 });
      }
      throw firstError;
    }
    return Response.json({
      jobs: jobs.data || [],
      categories: categories.data || [],
      rates: rates.data || [],
      ratePeriods: periods.data || [],
      targets: targets.data || [],
      tubing: {
        weeks: tubingWeeks.data || [],
        entries: tubingEntries.data || [],
        revenue: tubingRevenue.data || [],
      },
      reviews: reviews.data || [],
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

    if (action === "save_review") {
      if (!permissions.edit && !permissions.create) return Response.json({ error: "You cannot change financial reviews." }, { status: 403 });
      const line = lineValue(body.line);
      const quarter = String(body.quarter || "");
      quarterBounds(quarter);
      const existing = await context.admin.from("titan_financial_reviews").select("*")
        .eq("yard_id", yardId).eq("service_line", line).eq("quarter", quarter).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.status === "final") throw new Error("A finalized review cannot be changed.");
      const values = {
        highlights: reviewText(body.highlights),
        lowlights: reviewText(body.lowlights),
        goals: reviewText(body.goals),
        updated_at: new Date().toISOString(),
        updated_by: context.user.id,
      };
      const saved = existing.data
        ? await context.admin.from("titan_financial_reviews").update(values).eq("id", existing.data.id).select("*").single()
        : await context.admin.from("titan_financial_reviews").insert({
          yard_id: yardId, service_line: line, quarter, ...values, created_by: context.user.id,
        }).select("*").single();
      if (saved.error) throw saved.error;
      await context.admin.from("titan_financial_audit_log").insert({
        yard_id: yardId, entity_type: "financial_review", entity_id: saved.data.id,
        action: existing.data ? "update" : "create", before_value: existing.data,
        after_value: saved.data, actor_id: context.user.id,
      });
      return Response.json({ review: saved.data });
    }

    if (action === "finalize_review") {
      if (!permissions.approve) return Response.json({ error: "You cannot finalize financial reviews." }, { status: 403 });
      const id = String(body.id || "");
      const review = await context.admin.from("titan_financial_reviews").select("*").eq("id", id).single();
      if (review.error || !review.data || review.data.yard_id !== yardId) throw new Error("Financial review not found.");
      if (review.data.status === "final") throw new Error("This review is already final.");
      const line = lineValue(review.data.service_line);
      const bounds = quarterBounds(review.data.quarter);
      const source = await context.admin.from("titan_financial_jobs").select("id,revenue,manhours,computed")
        .eq("yard_id", yardId).eq("service_line", line).eq("status", "active")
        .gte("job_date", bounds.start).lte("job_date", bounds.end);
      if (source.error) throw source.error;
      const sourceJobs = source.data || [];
      const totals = sourceJobs.reduce((summary, job) => {
        const revenue = Number(job.revenue || 0);
        const computed = (job.computed || {}) as Record<string, unknown>;
        summary.revenue += revenue;
        summary.cost += Number(computed.total_cost || 0);
        summary.profit += Number(computed.profit || 0);
        summary.manhours += Number(job.manhours || 0);
        summary.laborDollars += Number(computed.labor_pct || 0) * revenue;
        return summary;
      }, { revenue: 0, cost: 0, profit: 0, manhours: 0, laborDollars: 0 });
      const finalizedAt = new Date().toISOString();
      const snapshot = {
        quarter: review.data.quarter, service_line: line, period_start: bounds.start, period_end: bounds.end,
        jobs: sourceJobs.length, revenue: totals.revenue, cost: totals.cost, profit: totals.profit,
        margin: totals.revenue ? totals.profit / totals.revenue : 0,
        manhours: totals.manhours, revenue_per_manhour: totals.manhours ? totals.revenue / totals.manhours : 0,
        labor_percent: totals.revenue ? totals.laborDollars / totals.revenue : 0,
        source_job_ids: sourceJobs.map((job) => job.id), generated_at: finalizedAt,
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
