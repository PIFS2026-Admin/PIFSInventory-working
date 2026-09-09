import { createClient } from "@supabase/supabase-js";

type TitanProfile = {
  full_name?: string | null;
  email?: string | null;
  is_disabled?: boolean | null;
};

type ReviewBody = {
  action?: unknown;
  candidateId?: unknown;
  decision?: unknown;
  decisionNote?: unknown;
  specificationTitle?: unknown;
  requirementText?: unknown;
  scope?: unknown;
};

const decisions = new Set(["Add to Matrix", "Job-Specific", "Hold", "No Change"]);

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server configuration is missing.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return cleanText(value).toLowerCase();
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error ?? "Unknown error.");
}

function migrationMissing(error: unknown) {
  const message = normalized(errorMessage(error));
  return message.includes("titan_spec_candidates")
    || message.includes("titan_customer_specifications")
    || message.includes("decide_titan_spec_candidate")
    || message.includes("schema cache");
}

async function authorizeWade(request: Request, adminSupabase: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };

  const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("full_name, email, is_disabled")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || !profile) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };

  const row = profile as TitanProfile;
  const isWade = normalized(row.full_name) === "wade wisenor"
    || normalized(row.email) === "wade@pathfinderinspections.com"
    || normalized(userData.user.email) === "wade@pathfinderinspections.com";
  if (row.is_disabled || !isWade) return { error: Response.json({ error: "Job Intelligence is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}

export async function GET(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const [candidateResult, specificationResult] = await Promise.all([
      adminSupabase
        .from("titan_spec_candidates")
        .select("id, candidate_number, job_id, source_deviation_id, source_debrief_id, source_type, customer_name, service_line, candidate_type, trigger_text, requirement_text, confidence, review_status, decision, decision_note, decided_at, row_version, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(2000),
      adminSupabase
        .from("titan_customer_specifications")
        .select("id, specification_number, source_candidate_id, source_job_id, customer_name, scope, service_line, title, requirement_text, effective_date, status, created_at, updated_at")
        .order("effective_date", { ascending: false })
        .limit(2000),
    ]);
    if (candidateResult.error) throw candidateResult.error;
    if (specificationResult.error) throw specificationResult.error;

    const candidates = candidateResult.data ?? [];
    const jobIds = [...new Set(candidates.map((candidate) => candidate.job_id).filter(Boolean))];
    const jobResult = jobIds.length
      ? await adminSupabase
        .from("titan_jobs")
        .select("id, job_number, title, customer_name, operator_name, rig_name, service_line, lifecycle_status")
        .in("id", jobIds)
      : { data: [], error: null };
    if (jobResult.error) throw jobResult.error;

    const jobsById = new Map((jobResult.data ?? []).map((job) => [job.id, job]));
    const hydratedCandidates = candidates.map((candidate) => ({
      ...candidate,
      job: jobsById.get(candidate.job_id) ?? null,
    }));
    const specifications = specificationResult.data ?? [];

    return Response.json({
      ok: true,
      metrics: {
        pending: candidates.filter((candidate) => candidate.review_status === "Pending").length,
        underReview: candidates.filter((candidate) => candidate.review_status === "Under Review").length,
        repeatIssues: candidates.filter((candidate) => candidate.candidate_type === "Repeat Issue" && candidate.review_status !== "Voided").length,
        activeSpecifications: specifications.filter((specification) => specification.status === "Active").length,
      },
      candidates: hydratedCandidates,
      specifications,
    });
  } catch (error) {
    return Response.json({
      error: migrationMissing(error)
        ? "Run supabase/titan_spec_intelligence.sql before opening Job Intelligence."
        : errorMessage(error),
    }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const body = (await request.json().catch(() => ({}))) as ReviewBody;
    const action = normalized(body.action);
    const candidateId = cleanText(body.candidateId);
    if (!validUuid(candidateId)) return Response.json({ error: "Select a valid intelligence candidate." }, { status: 400 });

    const { data: candidate, error: candidateError } = await adminSupabase
      .from("titan_spec_candidates")
      .select("*")
      .eq("id", candidateId)
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidate) return Response.json({ error: "The intelligence candidate was not found." }, { status: 404 });
    if (candidate.review_status === "Voided") return Response.json({ error: "A voided candidate cannot be reviewed." }, { status: 409 });

    if (action === "start_review") {
      if (candidate.review_status !== "Pending") return Response.json({ error: "Only a Pending candidate can begin review." }, { status: 409 });
      const { data: saved, error } = await adminSupabase
        .from("titan_spec_candidates")
        .update({ review_status: "Under Review", updated_by: authorization.userId })
        .eq("id", candidateId)
        .eq("row_version", candidate.row_version)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!saved) return Response.json({ error: "This candidate changed while you were reviewing it. Refresh and try again." }, { status: 409 });
      return Response.json({ ok: true, candidate: saved });
    }

    if (action !== "decide_candidate") return Response.json({ error: "Unsupported intelligence action." }, { status: 400 });

    const decision = cleanText(body.decision);
    const decisionNote = cleanText(body.decisionNote);
    if (!decisions.has(decision)) return Response.json({ error: "Select a valid review decision." }, { status: 400 });
    if (!decisionNote) return Response.json({ error: "Record the reason for this decision." }, { status: 400 });

    const requirementText = cleanText(body.requirementText) || candidate.requirement_text;
    const specificationTitle = cleanText(body.specificationTitle) || candidate.trigger_text || candidate.candidate_type;
    const scope = cleanText(body.scope) === "Company" ? "Company" : "Customer";
    if (decision === "Add to Matrix" && !requirementText) return Response.json({ error: "A specification requirement is required." }, { status: 400 });
    if (decision === "Add to Matrix" && scope === "Customer" && !cleanText(candidate.customer_name)) {
      return Response.json({ error: "This job has no customer. Choose Company scope or correct the connected job first." }, { status: 400 });
    }

    const { data, error } = await adminSupabase.rpc("decide_titan_spec_candidate", {
      p_candidate_id: candidateId,
      p_decision: decision,
      p_decision_note: decisionNote,
      p_specification_title: specificationTitle,
      p_requirement_text: requirementText,
      p_scope: scope,
      p_actor_id: authorization.userId,
    });
    if (error) throw error;
    return Response.json(data ?? { ok: true });
  } catch (error) {
    return Response.json({
      error: migrationMissing(error)
        ? "Run supabase/titan_spec_intelligence.sql before reviewing Job Intelligence."
        : errorMessage(error),
    }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
