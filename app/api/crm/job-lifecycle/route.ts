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

export async function GET(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

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

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
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
