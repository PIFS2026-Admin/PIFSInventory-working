import { createClient } from "@supabase/supabase-js";
import { authorizeDtiAccess } from "../../../../lib/serverDtiAccess";

export const runtime = "nodejs";

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeDtiAccess(request, admin);
    if ("error" in authorization) return authorization.error;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action).toLowerCase();
    const laneId = clean(body.laneId);
    if (action !== "complete") return Response.json({ error: "Select a supported lane action." }, { status: 400 });
    if (!validUuid(laneId)) return Response.json({ error: "Select a valid DTI job lane." }, { status: 400 });

    const result = await admin.rpc("complete_titan_dti_operations_lane", {
      p_lane_id: laneId,
      p_actor_id: authorization.userId,
      p_actor_name: authorization.fullName,
    });
    if (result.error) {
      const missingFunction = result.error.code === "PGRST202" || errorMessage(result.error).toLowerCase().includes("schema cache");
      return Response.json({
        error: missingFunction
          ? "Run supabase/titan_dti_operations_job_lanes.sql to activate linked job lanes."
          : result.error.message,
      }, { status: 409 });
    }

    return Response.json(result.data ?? { ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
