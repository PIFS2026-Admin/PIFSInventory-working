import { createClient } from "@supabase/supabase-js";

type Profile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
type Body = Record<string, unknown>;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function text(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }
function numberOrNull(value: unknown) { const valueText = text(value); return valueText ? Number(valueText) : null; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) { const value = lower(errorMessage(error)); return value.includes("titan_dti_tubular_spec") || value.includes("schema cache"); }

async function authorize(request: Request, admin: ReturnType<typeof adminClient>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  const profile = data as Profile | null;
  if (error || !profile) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const isWade = lower(profile.full_name) === "wade wisenor" || lower(profile.email || userData.user.email) === "wade@pathfinderinspections.com";
  if (profile.is_disabled || !isWade) return { error: Response.json({ error: "DTI Tubular Specifications are currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}

export async function GET(request: Request) {
  try {
    const admin = adminClient();
    const authorization = await authorize(request, admin);
    if ("error" in authorization) return authorization.error;
    const [specsResult, documentsResult] = await Promise.all([
      admin.from("titan_dti_tubular_specs").select("*").is("archived_at", null).order("pipe_size").order("weight_ppf").order("grade").order("connection"),
      admin.from("documents").select("*").limit(2000),
    ]);
    if (specsResult.error) throw specsResult.error;
    if (documentsResult.error) throw documentsResult.error;
    const documents = (documentsResult.data ?? []).filter((document) => lower(document.approval_status) === "approved")
      .map((document) => ({ id: document.id, title: text(document.title), document_number: text(document.document_number), department: text(document.department) }))
      .filter((document) => ["", "dti", "operations", "all", "company", "company-wide"].includes(lower(document.department)));
    const documentById = new Map(documents.map((document) => [document.id, document]));
    return Response.json({ ok: true, specs: (specsResult.data ?? []).map((spec) => ({ ...spec, source_document: documentById.get(spec.source_document_id) ?? null })), documents });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_tubular_specs.sql before opening Tubular Specifications." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = adminClient();
    const authorization = await authorize(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = await request.json().catch(() => ({})) as Body;
    if (body.action === "archive") {
      const { data, error } = await admin.rpc("archive_titan_dti_tubular_spec", { p_id: text(body.id), p_actor_id: authorization.userId });
      if (error) throw error;
      return Response.json(data);
    }
    const numericFields = ["weightPpf", "newWall", "premiumMinWall", "class2MinWall", "tjOdMin", "tjIdMax", "bevelMin", "bevelMax", "tongSpaceMin"];
    for (const field of numericFields) {
      const value = numberOrNull(body[field]);
      if (value !== null && (!Number.isFinite(value) || value <= 0)) return Response.json({ error: `${field} must be greater than zero.` }, { status: 400 });
    }
    const { data, error } = await admin.rpc("save_titan_dti_tubular_spec", {
      p_id: text(body.id) || null,
      p_pipe_size: text(body.pipeSize),
      p_weight_ppf: numberOrNull(body.weightPpf),
      p_grade: text(body.grade),
      p_connection: text(body.connection),
      p_new_wall_inches: numberOrNull(body.newWall),
      p_premium_min_wall_inches: numberOrNull(body.premiumMinWall),
      p_class_2_min_wall_inches: numberOrNull(body.class2MinWall),
      p_tj_od_min_premium_inches: numberOrNull(body.tjOdMin),
      p_tj_id_max_inches: numberOrNull(body.tjIdMax),
      p_bevel_diameter_min_inches: numberOrNull(body.bevelMin),
      p_bevel_diameter_max_inches: numberOrNull(body.bevelMax),
      p_tong_space_min_inches: numberOrNull(body.tongSpaceMin),
      p_source_document_id: text(body.sourceDocumentId),
      p_notes: text(body.notes),
      p_actor_id: authorization.userId,
    });
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_tubular_specs.sql before saving Tubular Specifications." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
