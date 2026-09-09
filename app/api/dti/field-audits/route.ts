import { createClient } from "@supabase/supabase-js";

type TitanProfile = {
  full_name?: string | null;
  email?: string | null;
  is_disabled?: boolean | null;
};

type AuditBody = {
  action?: unknown;
  jobId?: unknown;
  auditDate?: unknown;
  crewLeadId?: unknown;
  notes?: unknown;
  items?: unknown;
  findingId?: unknown;
  correctiveAction?: unknown;
  ownerId?: unknown;
  dueDate?: unknown;
  evidenceDocumentId?: unknown;
};

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function cleanText(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return cleanText(value).toLowerCase(); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error ?? "Unknown error.");
}
function migrationMissing(error: unknown) {
  const message = normalized(errorMessage(error));
  return message.includes("titan_field_audit") || message.includes("titan_audit_finding") || message.includes("schema cache");
}

async function authorizeWade(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data: profile, error } = await admin.from("profiles").select("full_name, email, is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !profile) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const row = profile as TitanProfile;
  const isWade = normalized(row.full_name) === "wade wisenor"
    || normalized(row.email) === "wade@pathfinderinspections.com"
    || normalized(userData.user.email) === "wade@pathfinderinspections.com";
  if (row.is_disabled || !isWade) return { error: Response.json({ error: "Field Audits are currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id, fullName: cleanText(row.full_name) || "Wade Wisenor" };
}

async function activeProfile(admin: ReturnType<typeof configuredSupabase>, profileId: string) {
  if (!validUuid(profileId)) return null;
  const { data, error } = await admin.from("profiles").select("id, full_name, role, department, is_disabled").eq("id", profileId).maybeSingle();
  if (error) throw error;
  return data && !data.is_disabled ? data : null;
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;

    const [checklistResult, auditsResult, findingsResult, jobsResult, profilesResult] = await Promise.all([
      admin.from("titan_field_audit_checklist").select("item_code, section_code, section_title, item_text, reference_text, is_critical, sort_order").eq("is_active", true).order("sort_order"),
      admin.from("titan_field_audits").select("*").eq("status", "Filed").order("audit_date", { ascending: false }).limit(300),
      admin.from("titan_audit_findings").select("*").order("created_at", { ascending: false }).limit(1000),
      admin.from("titan_jobs").select("id, job_number, title, service_line, lifecycle_status, customer_name, operator_name, rig_name, scheduled_start").eq("service_line", "DTI").is("archived_at", null).order("scheduled_start", { ascending: false, nullsFirst: false }).limit(2000),
      admin.from("profiles").select("id, full_name, email, role, department, is_disabled").order("full_name"),
    ]);
    if (checklistResult.error) throw checklistResult.error;
    if (auditsResult.error) throw auditsResult.error;
    if (findingsResult.error) throw findingsResult.error;
    if (jobsResult.error) throw jobsResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const audits = auditsResult.data ?? [];
    const auditIds = audits.map((audit) => audit.id);
    const itemsResult = auditIds.length
      ? await admin.from("titan_field_audit_items").select("*").in("field_audit_id", auditIds).order("item_code")
      : { data: [], error: null };
    if (itemsResult.error) throw itemsResult.error;

    const findings = findingsResult.data ?? [];
    const findingJobIds = [...new Set(findings.map((finding) => finding.job_id))];
    const documentsResult = findingJobIds.length
      ? await admin.from("titan_job_documents").select("id, job_id, document_type, display_name, created_at").in("job_id", findingJobIds).is("archived_at", null).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (documentsResult.error) throw documentsResult.error;

    const today = new Date().toISOString().slice(0, 10);
    return Response.json({
      ok: true,
      metrics: {
        audits: audits.length,
        actionRequired: audits.filter((audit) => audit.status_band === "Action Required").length,
        openFindings: findings.filter((finding) => finding.finding_status !== "Closed").length,
        overdue: findings.filter((finding) => finding.finding_status !== "Closed" && finding.due_date && finding.due_date < today).length,
      },
      checklist: checklistResult.data ?? [],
      audits: audits.map((audit) => ({ ...audit, items: (itemsResult.data ?? []).filter((item) => item.field_audit_id === audit.id) })),
      findings,
      jobs: jobsResult.data ?? [],
      people: (profilesResult.data ?? []).filter((profile) => !profile.is_disabled && !["customer", "operator"].includes(normalized(profile.role))),
      documents: documentsResult.data ?? [],
    });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_field_audits.sql before opening Field Audits." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = (await request.json().catch(() => ({}))) as AuditBody;
    const jobId = cleanText(body.jobId);
    const crewLeadId = cleanText(body.crewLeadId);
    if (!validUuid(jobId)) return Response.json({ error: "Select a connected job." }, { status: 400 });
    const crewLead = await activeProfile(admin, crewLeadId);
    if (!crewLead) return Response.json({ error: "Select an active crew lead." }, { status: 400 });
    const auditDate = cleanText(body.auditDate);
    if (auditDate && !/^\d{4}-\d{2}-\d{2}$/.test(auditDate)) return Response.json({ error: "Enter a valid audit date." }, { status: 400 });
    if (!Array.isArray(body.items)) return Response.json({ error: "Complete the audit checklist." }, { status: 400 });

    const { data, error } = await admin.rpc("create_titan_field_audit", {
      p_job_id: jobId,
      p_audit_date: auditDate || new Date().toISOString().slice(0, 10),
      p_crew_lead_id: crewLead.id,
      p_crew_lead_name: crewLead.full_name,
      p_auditor_id: authorization.userId,
      p_auditor_name: authorization.fullName,
      p_notes: cleanText(body.notes) || null,
      p_items: body.items,
    });
    if (error) throw error;
    return Response.json(data ?? { ok: true });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_field_audits.sql before filing an audit." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = (await request.json().catch(() => ({}))) as AuditBody;
    const action = normalized(body.action);
    const findingId = cleanText(body.findingId);
    if (!validUuid(findingId)) return Response.json({ error: "Select a valid audit finding." }, { status: 400 });

    let owner = null;
    const ownerId = cleanText(body.ownerId);
    if (action === "assign") {
      owner = await activeProfile(admin, ownerId);
      if (!owner) return Response.json({ error: "Select an active corrective-action owner." }, { status: 400 });
    }

    const evidenceDocumentId = cleanText(body.evidenceDocumentId);
    if (action === "close" && !validUuid(evidenceDocumentId)) return Response.json({ error: "Select closure evidence from the job documents." }, { status: 400 });
    const { data, error } = await admin.rpc("update_titan_audit_finding", {
      p_finding_id: findingId,
      p_action: action,
      p_corrective_action: cleanText(body.correctiveAction) || null,
      p_owner_id: owner?.id ?? null,
      p_owner_name: owner?.full_name ?? null,
      p_due_date: cleanText(body.dueDate) || null,
      p_evidence_document_id: evidenceDocumentId || null,
      p_actor_id: authorization.userId,
    });
    if (error) throw error;
    return Response.json(data ?? { ok: true });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_field_audits.sql before updating findings." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
