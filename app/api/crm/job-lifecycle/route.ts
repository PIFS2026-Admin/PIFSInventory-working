import { createClient } from "@supabase/supabase-js";

type TitanProfile = {
  full_name?: string | null;
  email?: string | null;
  is_disabled?: boolean | null;
};

type LifecycleRow = {
  id: string;
  job_number: string;
  crm_opportunity_id: string | null;
  title: string;
  service_line: string;
  lifecycle_status: string;
  status_changed_at: string;
  customer_name: string | null;
  operator_name: string | null;
  rig_name: string | null;
  contact_name: string | null;
  location_name: string | null;
  state: string | null;
  county: string | null;
  salesperson_name: string | null;
  lead_name: string | null;
  job_type: string | null;
  requested_on: string | null;
  scheduled_start: string | null;
  linked_record_count: number | null;
  latest_event_type: string | null;
  latest_event_summary: string | null;
  latest_event_at: string | null;
  updated_at: string;
};

type ConnectionBody = {
  jobId?: unknown;
  mode?: unknown;
};

type IntelligenceBody = {
  action?: unknown;
  jobId?: unknown;
  deviationId?: unknown;
  component?: unknown;
  jointIds?: unknown;
  quantity?: unknown;
  defectType?: unknown;
  locationOnComponent?: unknown;
  measurements?: unknown;
  controllingCriteria?: unknown;
  justification?: unknown;
  operationalRisk?: unknown;
  inspectorRecommendation?: unknown;
  communicationMethod?: unknown;
  writtenConfirmation?: unknown;
  confirmationDocumentId?: unknown;
  specCandidate?: unknown;
  voidReason?: unknown;
  onPlan?: unknown;
  stationBehind?: unknown;
  varianceDriver?: unknown;
  wentWell?: unknown;
  slowedBy?: unknown;
  safetyObservations?: unknown;
  grayAreaSummary?: unknown;
  borderlineCount?: unknown;
  customerFeedback?: unknown;
  repeatIssue?: unknown;
  repeatNote?: unknown;
  lessonsLearned?: unknown;
  actionOwnerName?: unknown;
};

type JobDocumentRow = {
  id: string;
  job_id: string;
  document_type: string;
  display_name: string;
  storage_url: string;
  source_module: string;
  source_column: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const terminalStatuses = new Set(["complete", "completed", "invoiced", "cancelled", "canceled", "void", "voided"]);

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function booleanValue(value: unknown) {
  return value === true || normalized(value) === "true";
}

function nullableText(value: unknown) {
  return cleanText(value) || null;
}

function nonnegativeInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a whole number of zero or more.`);
  return parsed;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error ?? "Unknown error.");
}

async function authorizeWade(request: Request, adminSupabase: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };

  const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("full_name, email, is_disabled")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  }

  const row = profile as TitanProfile;
  const isWade = normalized(row.full_name) === "wade wisenor"
    || normalized(row.email) === "wade@pathfinderinspections.com"
    || normalized(userData.user.email) === "wade@pathfinderinspections.com";

  if (row.is_disabled || !isWade) {
    return { error: Response.json({ error: "Connected Jobs is currently restricted to Wade." }, { status: 403 }) };
  }

  return { userId: userData.user.id };
}

function isTerminalStatus(status: string) {
  return terminalStatuses.has(normalized(status));
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function missingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST205" || normalized(error?.message).includes("schema cache");
}

async function secureDocumentUrl(
  adminSupabase: ReturnType<typeof configuredSupabase>,
  document: JobDocumentRow,
) {
  if (/^https?:\/\//i.test(document.storage_url)) return document.storage_url;

  const match = document.storage_url.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (!match) throw new Error("This document does not have a valid TITAN file location.");

  const [, bucket, path] = match;
  const { data, error } = await adminSupabase.storage.from(bucket).createSignedUrl(path, 120);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("TITAN could not create a secure document link.");
  return data.signedUrl;
}

async function loadJobDetail(
  adminSupabase: ReturnType<typeof configuredSupabase>,
  jobId: string,
) {
  const [jobResult, linksResult, eventsResult, documentsResult, deviationsResult, debriefResult, auditsResult, findingsResult] = await Promise.all([
    adminSupabase.from("titan_jobs").select("*").eq("id", jobId).is("archived_at", null).maybeSingle(),
    adminSupabase
      .from("titan_job_links")
      .select("id, module_key, record_type, record_id, relationship_type, is_primary, metadata, created_at, updated_at")
      .eq("job_id", jobId)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    adminSupabase
      .from("titan_job_events")
      .select("id, event_type, source_module, from_status, to_status, summary, before_value, after_value, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(250),
    adminSupabase
      .from("titan_job_documents")
      .select("id, job_id, document_type, display_name, storage_url, source_module, source_column, metadata, created_at")
      .eq("job_id", jobId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    adminSupabase
      .from("titan_job_deviations")
      .select("id, deviation_number, component, joint_ids, quantity, defect_type, location_on_component, measurements, controlling_criteria, justification, operational_risk, inspector_recommendation, communication_method, written_confirmation, confirmation_document_id, spec_candidate, status, approved_at, void_reason, row_version, created_at, updated_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    adminSupabase
      .from("titan_job_debriefs")
      .select("id, debrief_number, on_plan, station_behind, variance_driver, went_well, slowed_by, safety_observations, gray_area_summary, borderline_count, customer_feedback, repeat_issue, repeat_note, lessons_learned, action_owner_name, status, void_reason, created_at, updated_at")
      .eq("job_id", jobId)
      .maybeSingle(),
    adminSupabase
      .from("titan_field_audits")
      .select("id, audit_number, audit_date, crew_lead_name, auditor_name, overall_percent, critical_nc_count, status_band")
      .eq("job_id", jobId)
      .eq("status", "Filed")
      .order("audit_date", { ascending: false }),
    adminSupabase
      .from("titan_audit_findings")
      .select("id, finding_number, field_audit_id, severity, finding_text, corrective_action, owner_name, due_date, finding_status, closure_evidence_document_id, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
  ]);

  if (jobResult.error) throw jobResult.error;
  if (!jobResult.data) return Response.json({ error: "Connected job was not found." }, { status: 404 });
  if (linksResult.error) throw linksResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const registryReady = !documentsResult.error;
  if (documentsResult.error && !missingRelation(documentsResult.error)) throw documentsResult.error;
  const intelligenceReady = !deviationsResult.error && !debriefResult.error;
  if (deviationsResult.error && !missingRelation(deviationsResult.error)) throw deviationsResult.error;
  if (debriefResult.error && !missingRelation(debriefResult.error)) throw debriefResult.error;
  const fieldAuditsReady = !auditsResult.error && !findingsResult.error;
  if (auditsResult.error && !missingRelation(auditsResult.error)) throw auditsResult.error;
  if (findingsResult.error && !missingRelation(findingsResult.error)) throw findingsResult.error;

  const [specificationsResult, candidatesResult] = await Promise.all([
    adminSupabase
      .from("titan_customer_specifications")
      .select("id, specification_number, customer_name, scope, service_line, title, requirement_text, effective_date, status")
      .eq("status", "Active")
      .order("effective_date", { ascending: false })
      .limit(1000),
    adminSupabase
      .from("titan_spec_candidates")
      .select("id, candidate_number, job_id, source_type, customer_name, service_line, candidate_type, trigger_text, requirement_text, confidence, review_status, decision, updated_at")
      .in("review_status", ["Pending", "Under Review", "Decided"])
      .order("updated_at", { ascending: false })
      .limit(1000),
  ]);
  const specIntelligenceReady = !specificationsResult.error && !candidatesResult.error;
  if (specificationsResult.error && !missingRelation(specificationsResult.error)) throw specificationsResult.error;
  if (candidatesResult.error && !missingRelation(candidatesResult.error)) throw candidatesResult.error;

  const job = jobResult.data;
  const sameServiceLine = (value: unknown) => {
    const key = normalized(value);
    return key === "all" || key === normalized(job.service_line);
  };
  const sameCustomer = (value: unknown) => Boolean(normalized(job.customer_name))
    && normalized(value) === normalized(job.customer_name);
  const specifications = specIntelligenceReady
    ? (specificationsResult.data ?? []).filter((specification) => sameServiceLine(specification.service_line)
      && (specification.scope === "Company" || sameCustomer(specification.customer_name)))
    : [];
  const relatedCandidates = specIntelligenceReady
    ? (candidatesResult.data ?? []).filter((candidate) => candidate.job_id !== job.id
      && sameServiceLine(candidate.service_line)
      && sameCustomer(candidate.customer_name))
    : [];
  const openSignals = relatedCandidates
    .filter((candidate) => candidate.review_status === "Pending" || candidate.review_status === "Under Review")
    .slice(0, 8);
  const jobSpecificLessons = relatedCandidates
    .filter((candidate) => candidate.review_status === "Decided" && candidate.decision === "Job-Specific")
    .slice(0, 8);

  return Response.json({
    ok: true,
    job: jobResult.data,
    links: linksResult.data ?? [],
    events: eventsResult.data ?? [],
    documents: registryReady ? documentsResult.data ?? [] : [],
    documentRegistryReady: registryReady,
    deviations: intelligenceReady ? deviationsResult.data ?? [] : [],
    debrief: intelligenceReady ? debriefResult.data ?? null : null,
    intelligenceReady,
    preJobBrief: { specifications, openSignals, jobSpecificLessons },
    specIntelligenceReady,
    fieldAudits: fieldAuditsReady ? auditsResult.data ?? [] : [],
    auditFindings: fieldAuditsReady ? findingsResult.data ?? [] : [],
    fieldAuditsReady,
  });
}

export async function GET(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const url = new URL(request.url);
    const jobId = String(url.searchParams.get("jobId") ?? "").trim();
    const documentId = String(url.searchParams.get("documentId") ?? "").trim();

    if (documentId) {
      if (!validUuid(documentId)) {
        return Response.json({ error: "A valid job document is required." }, { status: 400 });
      }

      const { data, error } = await adminSupabase
        .from("titan_job_documents")
        .select("id, job_id, document_type, display_name, storage_url, source_module, source_column, metadata, created_at")
        .eq("id", documentId)
        .is("archived_at", null)
        .maybeSingle();

      if (error) {
        if (missingRelation(error)) {
          return Response.json({ error: "Run supabase/titan_job_document_registry.sql before opening job documents." }, { status: 409 });
        }
        throw error;
      }
      if (!data) return Response.json({ error: "Job document was not found." }, { status: 404 });

      return Response.json({ ok: true, url: await secureDocumentUrl(adminSupabase, data as JobDocumentRow) });
    }

    if (jobId) {
      if (!validUuid(jobId)) return Response.json({ error: "A valid TITAN job is required." }, { status: 400 });
      return loadJobDetail(adminSupabase, jobId);
    }

    const jobs: LifecycleRow[] = [];
    const pageSize = 1000;

    for (let start = 0; ; start += pageSize) {
      const { data, error } = await adminSupabase
        .from("titan_job_lifecycle_overview")
        .select([
          "id",
          "job_number",
          "crm_opportunity_id",
          "title",
          "service_line",
          "lifecycle_status",
          "status_changed_at",
          "customer_name",
          "operator_name",
          "rig_name",
          "contact_name",
          "location_name",
          "state",
          "county",
          "salesperson_name",
          "lead_name",
          "job_type",
          "requested_on",
          "scheduled_start",
          "linked_record_count",
          "latest_event_type",
          "latest_event_summary",
          "latest_event_at",
          "updated_at",
        ].join(","))
        .order("scheduled_start", { ascending: false, nullsFirst: false })
        .range(start, start + pageSize - 1);

      if (error) throw error;
      const page = (data ?? []) as unknown as LifecycleRow[];
      jobs.push(...page);
      if (page.length < pageSize) break;
    }

    const { count: syncFailureCount, error: failureError } = await adminSupabase
      .from("titan_job_sync_failures")
      .select("id", { count: "exact", head: true });
    if (failureError) throw failureError;

    const serviceLineCounts = jobs.reduce<Record<string, number>>((counts, job) => {
      const key = job.service_line || "Unassigned";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      metrics: {
        total: jobs.length,
        active: jobs.filter((job) => !isTerminalStatus(job.lifecycle_status)).length,
        linked: jobs.filter((job) => Number(job.linked_record_count ?? 0) > 0).length,
        unlinked: jobs.filter((job) => Number(job.linked_record_count ?? 0) === 0).length,
        syncFailures: syncFailureCount ?? 0,
      },
      serviceLineCounts,
      jobs,
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const body = (await request.json().catch(() => ({}))) as ConnectionBody;
    const jobId = String(body.jobId ?? "").trim();
    const mode = String(body.mode ?? "preview").trim().toLowerCase();

    if (!validUuid(jobId)) {
      return Response.json({ error: "A valid TITAN job is required." }, { status: 400 });
    }

    if (mode !== "preview" && mode !== "connect") {
      return Response.json({ error: "The connection mode must be preview or connect." }, { status: 400 });
    }

    const { data, error } = await adminSupabase.rpc("connect_titan_job_to_service_board", {
      p_job_id: jobId,
      p_preview_only: mode === "preview",
      p_actor_id: authorization.userId,
    });

    if (error) {
      const missingFunction = error.code === "PGRST202" || normalized(error.message).includes("schema cache");
      return Response.json({
        error: missingFunction
          ? "Run supabase/titan_job_board_connections.sql in Supabase before connecting jobs."
          : error.message,
      }, { status: 400 });
    }

    return Response.json(data ?? { ok: false, canConnect: false, reason: "No connection result was returned." });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const body = (await request.json().catch(() => ({}))) as IntelligenceBody;
    const action = normalized(body.action);
    const jobId = cleanText(body.jobId);
    if (!validUuid(jobId)) return Response.json({ error: "A valid TITAN job is required." }, { status: 400 });

    const { data: job, error: jobError } = await adminSupabase
      .from("titan_jobs")
      .select("id, job_number, title, archived_at")
      .eq("id", jobId)
      .is("archived_at", null)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return Response.json({ error: "Connected job was not found." }, { status: 404 });

    if (action === "save_deviation") {
      const deviationId = cleanText(body.deviationId);
      const defectType = cleanText(body.defectType);
      if (!defectType) return Response.json({ error: "Defect or deviation type is required." }, { status: 400 });

      const confirmationDocumentId = cleanText(body.confirmationDocumentId) || null;
      if (confirmationDocumentId && !validUuid(confirmationDocumentId)) {
        return Response.json({ error: "Select a valid written-confirmation document." }, { status: 400 });
      }
      if (confirmationDocumentId) {
        const { data: evidence, error: evidenceError } = await adminSupabase
          .from("titan_job_documents")
          .select("id")
          .eq("id", confirmationDocumentId)
          .eq("job_id", jobId)
          .is("archived_at", null)
          .maybeSingle();
        if (evidenceError) throw evidenceError;
        if (!evidence) return Response.json({ error: "The confirmation document must belong to this job." }, { status: 400 });
      }

      const writtenConfirmation = booleanValue(body.writtenConfirmation);
      if (writtenConfirmation && !confirmationDocumentId) {
        return Response.json({ error: "Select the written confirmation document before marking confirmation received." }, { status: 400 });
      }

      const payload = {
        job_id: jobId,
        component: nullableText(body.component),
        joint_ids: nullableText(body.jointIds),
        quantity: nonnegativeInteger(body.quantity, "Quantity"),
        defect_type: defectType,
        location_on_component: nullableText(body.locationOnComponent),
        measurements: nullableText(body.measurements),
        controlling_criteria: nullableText(body.controllingCriteria),
        justification: nullableText(body.justification),
        operational_risk: nullableText(body.operationalRisk),
        inspector_recommendation: nullableText(body.inspectorRecommendation),
        communication_method: nullableText(body.communicationMethod),
        written_confirmation: writtenConfirmation,
        confirmation_document_id: confirmationDocumentId,
        spec_candidate: booleanValue(body.specCandidate),
        updated_by: authorization.userId,
      };

      let saved;
      if (deviationId) {
        if (!validUuid(deviationId)) return Response.json({ error: "A valid deviation is required." }, { status: 400 });
        const { data: current, error: currentError } = await adminSupabase
          .from("titan_job_deviations")
          .select("id, status")
          .eq("id", deviationId)
          .eq("job_id", jobId)
          .maybeSingle();
        if (currentError) throw currentError;
        if (!current) return Response.json({ error: "Deviation was not found." }, { status: 404 });
        if (current.status !== "Draft") return Response.json({ error: "Only Draft deviations can be edited." }, { status: 409 });

        const { data, error } = await adminSupabase
          .from("titan_job_deviations")
          .update(payload)
          .eq("id", deviationId)
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await adminSupabase
          .from("titan_job_deviations")
          .insert({ ...payload, created_by: authorization.userId })
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      }

      await adminSupabase.from("titan_job_events").insert({
        job_id: jobId,
        event_type: deviationId ? "deviation_updated" : "deviation_created",
        source_module: "job_intelligence",
        from_status: null,
        to_status: saved.status,
        summary: `${saved.deviation_number} ${deviationId ? "updated" : "created"}.`,
        after_value: saved,
        actor_id: authorization.userId,
      });

      return Response.json({ ok: true, deviation: saved });
    }

    if (["submit_deviation", "approve_deviation", "void_deviation"].includes(action)) {
      const deviationId = cleanText(body.deviationId);
      if (!validUuid(deviationId)) return Response.json({ error: "A valid deviation is required." }, { status: 400 });

      const { data: deviation, error: deviationError } = await adminSupabase
        .from("titan_job_deviations")
        .select("*")
        .eq("id", deviationId)
        .eq("job_id", jobId)
        .maybeSingle();
      if (deviationError) throw deviationError;
      if (!deviation) return Response.json({ error: "Deviation was not found." }, { status: 404 });

      let nextStatus = "";
      const updates: Record<string, unknown> = { updated_by: authorization.userId };
      if (action === "submit_deviation") {
        if (deviation.status !== "Draft") return Response.json({ error: "Only a Draft deviation can be submitted." }, { status: 409 });
        nextStatus = "Submitted";
      } else if (action === "approve_deviation") {
        if (deviation.status !== "Submitted") return Response.json({ error: "Only a Submitted deviation can be approved." }, { status: 409 });
        if (!deviation.written_confirmation || !deviation.confirmation_document_id) {
          return Response.json({ error: "Approval requires written confirmation and its attached evidence. Verbal approval alone is not sufficient." }, { status: 422 });
        }
        nextStatus = "Approved";
        updates.approved_by = authorization.userId;
        updates.approved_at = new Date().toISOString();
      } else {
        const voidReason = cleanText(body.voidReason);
        if (!voidReason) return Response.json({ error: "A reason is required to void a deviation." }, { status: 400 });
        if (deviation.status === "Voided") return Response.json({ error: "This deviation is already voided." }, { status: 409 });
        nextStatus = "Voided";
        updates.void_reason = voidReason;
      }
      updates.status = nextStatus;

      const { data: saved, error: saveError } = await adminSupabase
        .from("titan_job_deviations")
        .update(updates)
        .eq("id", deviationId)
        .select("*")
        .single();
      if (saveError) throw saveError;

      await adminSupabase.from("titan_job_events").insert({
        job_id: jobId,
        event_type: `deviation_${nextStatus.toLowerCase()}`,
        source_module: "job_intelligence",
        from_status: deviation.status,
        to_status: nextStatus,
        summary: `${deviation.deviation_number} changed from ${deviation.status} to ${nextStatus}.`,
        before_value: deviation,
        after_value: saved,
        actor_id: authorization.userId,
      });

      return Response.json({ ok: true, deviation: saved });
    }

    if (action === "save_debrief") {
      const repeatIssue = booleanValue(body.repeatIssue);
      const repeatNote = cleanText(body.repeatNote);
      if (repeatIssue && !repeatNote) {
        return Response.json({ error: "Describe the repeated issue before saving the debrief." }, { status: 400 });
      }

      const hasSubstantiveDebrief = [
        body.stationBehind,
        body.varianceDriver,
        body.wentWell,
        body.slowedBy,
        body.safetyObservations,
        body.grayAreaSummary,
        body.customerFeedback,
        body.repeatNote,
        body.lessonsLearned,
      ].some((value) => cleanText(value));
      if (!hasSubstantiveDebrief) {
        return Response.json({ error: "Record at least one meaningful closeout observation before saving the debrief." }, { status: 400 });
      }

      const payload = {
        job_id: jobId,
        on_plan: body.onPlan === null || body.onPlan === undefined || body.onPlan === "" ? null : booleanValue(body.onPlan),
        station_behind: nullableText(body.stationBehind),
        variance_driver: nullableText(body.varianceDriver),
        went_well: nullableText(body.wentWell),
        slowed_by: nullableText(body.slowedBy),
        safety_observations: nullableText(body.safetyObservations),
        gray_area_summary: nullableText(body.grayAreaSummary),
        borderline_count: nonnegativeInteger(body.borderlineCount, "Borderline count") ?? 0,
        customer_feedback: nullableText(body.customerFeedback),
        repeat_issue: repeatIssue,
        repeat_note: repeatIssue ? repeatNote : null,
        lessons_learned: nullableText(body.lessonsLearned),
        action_owner_name: nullableText(body.actionOwnerName),
        updated_by: authorization.userId,
      };

      const { data: existing, error: existingError } = await adminSupabase
        .from("titan_job_debriefs")
        .select("id, debrief_number, status")
        .eq("job_id", jobId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.status === "Voided") return Response.json({ error: "A voided debrief cannot be edited." }, { status: 409 });

      let saved;
      if (existing) {
        const { data, error } = await adminSupabase.from("titan_job_debriefs").update(payload).eq("id", existing.id).select("*").single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await adminSupabase
          .from("titan_job_debriefs")
          .insert({ ...payload, created_by: authorization.userId })
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      }

      await adminSupabase.from("titan_job_events").insert({
        job_id: jobId,
        event_type: existing ? "debrief_updated" : "debrief_created",
        source_module: "job_intelligence",
        summary: `${saved.debrief_number} ${existing ? "updated" : "created"}.`,
        after_value: saved,
        actor_id: authorization.userId,
      });

      return Response.json({ ok: true, debrief: saved });
    }

    return Response.json({ error: "Unsupported Job Intelligence action." }, { status: 400 });
  } catch (error) {
    const message = errorMessage(error);
    const migrationMissing = normalized(message).includes("titan_job_deviations")
      || normalized(message).includes("titan_job_debriefs")
      || normalized(message).includes("schema cache");
    return Response.json({
      error: migrationMissing
        ? "Run supabase/titan_job_intelligence.sql before using deviations or debriefs."
        : message,
    }, { status: migrationMissing ? 409 : 500 });
  }
}
