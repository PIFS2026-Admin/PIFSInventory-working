import { createClient } from "@supabase/supabase-js";

type TitanProfile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
type AttentionItem = {
  id: string;
  kind: string;
  severity: "High" | "Medium";
  title: string;
  detail: string;
  href: string;
  occurredAt: string | null;
};

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function text(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return text(value).toLowerCase(); }
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
}

async function authorizeWade(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data: profile, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !profile) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const row = profile as TitanProfile;
  const isWade = normalized(row.full_name) === "wade wisenor"
    || normalized(row.email || userData.user.email) === "wade@pathfinderinspections.com";
  if (row.is_disabled || !isWade) return { error: Response.json({ error: "The DTI operational snapshot is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;

    const [jobsResult, linksResult] = await Promise.all([
      admin.from("titan_jobs").select("id,job_number,title,service_line,lifecycle_status,customer_name,rig_name,lead_name,scheduled_start,updated_at").is("archived_at", null).order("updated_at", { ascending: false }).limit(2000),
      admin.from("titan_job_links").select("job_id,module_key").eq("module_key", "dti").is("archived_at", null).limit(2000),
    ]);
    if (jobsResult.error) throw jobsResult.error;
    if (linksResult.error) throw linksResult.error;

    const linkedIds = new Set((linksResult.data ?? []).map((row) => row.job_id));
    const jobs = (jobsResult.data ?? []).filter((job) => normalized(job.service_line) === "dti" || linkedIds.has(job.id));
    const jobIds = jobs.map((job) => job.id);
    const empty = { data: [], error: null };

    const [debriefsResult, deviationsResult, auditsResult, findingsResult, candidatesResult, specsResult, gapsResult, eventsResult] = await Promise.all([
      jobIds.length ? admin.from("titan_job_debriefs").select("id,job_id,status").in("job_id", jobIds).neq("status", "Voided") : empty,
      jobIds.length ? admin.from("titan_job_deviations").select("id,deviation_number,job_id,defect_type,written_confirmation,status,updated_at").in("job_id", jobIds).neq("status", "Voided") : empty,
      jobIds.length ? admin.from("titan_field_audits").select("id,audit_number,job_id,status_band,audit_date,crew_lead_name").in("job_id", jobIds).eq("status", "Filed") : empty,
      jobIds.length ? admin.from("titan_audit_findings").select("id,finding_number,job_id,severity,finding_text,due_date,finding_status,created_at").in("job_id", jobIds).neq("finding_status", "Closed") : empty,
      admin.from("titan_spec_candidates").select("id,candidate_number,job_id,customer_name,trigger_text,review_status,updated_at").ilike("service_line", "DTI").in("review_status", ["Pending", "Under Review"]).order("updated_at", { ascending: false }).limit(300),
      admin.from("titan_customer_specifications").select("id,customer_name,service_line,scope,status").eq("status", "Active").limit(2000),
      admin.from("titan_training_gaps").select("id,inspector_id,priority,gap_text,due_date,owner_name,gap_status,updated_at").in("gap_status", ["Planned", "In Progress"]).order("updated_at", { ascending: false }).limit(300),
      jobIds.length ? admin.from("titan_job_events").select("id,job_id,event_type,summary,created_at").in("job_id", jobIds).order("created_at", { ascending: false }).limit(30) : empty,
    ]);

    for (const result of [debriefsResult, deviationsResult, auditsResult, findingsResult, candidatesResult, specsResult, gapsResult, eventsResult]) {
      if (result.error) throw result.error;
    }

    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const debriefJobIds = new Set((debriefsResult.data ?? []).map((row) => row.job_id));
    const terminalStatuses = new Set(["complete", "invoiced"]);
    const activeJobs = jobs.filter((job) => !["complete", "invoiced", "cancelled"].includes(normalized(job.lifecycle_status)));
    const customerSpecs = specsResult.data ?? [];
    const attention: AttentionItem[] = [];

    jobs.filter((job) => terminalStatuses.has(normalized(job.lifecycle_status)) && !debriefJobIds.has(job.id)).forEach((job) => {
      attention.push({ id: `debrief-${job.id}`, kind: "Missing Debrief", severity: "High", title: `${job.job_number} / ${job.title}`, detail: `${job.customer_name || "No customer"} / ${job.rig_name || "No rig"}`, href: `/crm/jobs/${job.id}`, occurredAt: job.updated_at });
    });

    (deviationsResult.data ?? []).filter((row) => !row.written_confirmation).forEach((row) => {
      const job = jobById.get(row.job_id);
      attention.push({ id: `deviation-${row.id}`, kind: "Written Confirmation", severity: "High", title: `${row.deviation_number} / ${row.defect_type}`, detail: job ? `${job.job_number} / ${job.customer_name || job.title}` : "DTI deviation", href: "/dti/deviations", occurredAt: row.updated_at });
    });

    (auditsResult.data ?? []).filter((row) => row.status_band === "Action Required").forEach((row) => {
      const job = jobById.get(row.job_id);
      attention.push({ id: `audit-${row.id}`, kind: "Audit Action Required", severity: "High", title: `${row.audit_number} / ${row.crew_lead_name}`, detail: job ? `${job.job_number} / ${job.title}` : "DTI field audit", href: "/dti?view=audits", occurredAt: row.audit_date });
    });

    (findingsResult.data ?? []).forEach((row) => {
      const job = jobById.get(row.job_id);
      attention.push({ id: `finding-${row.id}`, kind: row.due_date && row.due_date < new Date().toISOString().slice(0, 10) ? "Overdue Finding" : "Open Finding", severity: row.severity === "NC" ? "High" : "Medium", title: `${row.finding_number} / ${row.finding_text}`, detail: job ? `${job.job_number} / ${job.title}` : "DTI field audit", href: "/dti?view=findings", occurredAt: row.created_at });
    });

    (candidatesResult.data ?? []).forEach((row) => {
      attention.push({ id: `candidate-${row.id}`, kind: "Specification Review", severity: "Medium", title: `${row.candidate_number} / ${row.trigger_text || "Field lesson"}`, detail: row.customer_name || "Company specification", href: "/dti/intelligence", occurredAt: row.updated_at });
    });

    activeJobs.filter((job) => job.customer_name && !customerSpecs.some((spec) => normalized(spec.customer_name) === normalized(job.customer_name) && ["dti", "all"].includes(normalized(spec.service_line)))).forEach((job) => {
      attention.push({ id: `spec-${job.id}`, kind: "Missing Customer Specification", severity: "Medium", title: `${job.job_number} / ${job.title}`, detail: `${job.customer_name} / ${job.rig_name || "No rig"}`, href: "/dti/intelligence", occurredAt: job.updated_at });
    });

    (gapsResult.data ?? []).filter((row) => row.priority === "High").forEach((row) => {
      attention.push({ id: `gap-${row.id}`, kind: "High Competency Gap", severity: "High", title: row.gap_text, detail: `${row.owner_name} / Due ${row.due_date}`, href: "/dti/competency", occurredAt: row.updated_at });
    });

    attention.sort((a, b) => (a.severity === b.severity ? text(b.occurredAt).localeCompare(text(a.occurredAt)) : a.severity === "High" ? -1 : 1));

    return Response.json({
      ok: true,
      metrics: {
        activeJobs: activeJobs.length,
        needsAttention: attention.length,
        unresolvedDeviations: (deviationsResult.data ?? []).filter((row) => row.status !== "Approved").length,
        actionRequiredAudits: (auditsResult.data ?? []).filter((row) => row.status_band === "Action Required").length,
        openHighGaps: (gapsResult.data ?? []).filter((row) => row.priority === "High").length,
      },
      attention: attention.slice(0, 60),
      activity: (eventsResult.data ?? []).map((event) => ({ ...event, job: jobById.get(event.job_id) ?? null })),
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
