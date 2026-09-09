import { createClient } from "@supabase/supabase-js";

type Body = Record<string, unknown>;

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function text(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function missing(error: unknown) { const value = lower(errorMessage(error)); return value.includes("titan_inspector") || value.includes("titan_competency") || value.includes("schema cache"); }

async function authorizeWade(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data: profile } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  const isWade = lower(profile?.full_name) === "wade wisenor" || lower(profile?.email || userData.user.email) === "wade@pathfinderinspections.com";
  if (!profile || profile.is_disabled || !isWade) return { error: Response.json({ error: "The Competency Matrix is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}

async function activeProfile(admin: ReturnType<typeof configuredSupabase>, id: string) {
  if (!uuid(id)) return null;
  const { data, error } = await admin.from("profiles").select("id,full_name,email,role,department,is_disabled").eq("id", id).maybeSingle();
  if (error) throw error;
  return data && !data.is_disabled ? data : null;
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase();
    const auth = await authorizeWade(request, admin);
    if ("error" in auth) return auth.error;
    const [inspectors, skills, ratings, qualifications, certifications, gaps, profiles, documents] = await Promise.all([
      admin.from("titan_inspectors").select("*").order("created_at"),
      admin.from("titan_competency_skills").select("*").eq("is_active", true).order("sort_order"),
      admin.from("titan_skill_ratings").select("*").eq("is_current", true),
      admin.from("titan_ds1_qualifications").select("*").eq("is_current", true),
      admin.from("titan_asnt_certifications").select("*").order("method"),
      admin.from("titan_training_gaps").select("*").neq("gap_status", "Voided").order("created_at", { ascending: false }),
      admin.from("profiles").select("id,full_name,email,role,department,is_disabled").order("full_name"),
      admin.from("documents").select("id,document_number,title,category,related_employee_id,related_employee,document_status,expiration_date").neq("document_status", "Archived").order("updated_at", { ascending: false }).limit(1000),
    ]);
    for (const result of [inspectors, skills, ratings, qualifications, certifications, gaps, profiles, documents]) if (result.error) throw result.error;
    const people = (profiles.data ?? []).filter((row) => !row.is_disabled && !["customer", "operator"].includes(lower(row.role)));
    const names = new Map(people.map((row) => [row.id, row]));
    const inspectorRows = (inspectors.data ?? []).map((row) => ({ ...row, profile: names.get(row.profile_id) ?? null }));
    const today = new Date().toISOString().slice(0, 10);
    const active = inspectorRows.filter((row) => row.status === "Active");
    const openGaps = (gaps.data ?? []).filter((row) => row.gap_status !== "Complete");
    return Response.json({
      ok: true, inspectors: inspectorRows, skills: skills.data ?? [], ratings: ratings.data ?? [],
      qualifications: qualifications.data ?? [], certifications: certifications.data ?? [], gaps: gaps.data ?? [], people,
      documents: documents.data ?? [],
      metrics: {
        activeInspectors: active.length,
        averageFieldScore: active.length ? Math.round(active.reduce((sum, row) => sum + Number(row.field_score ?? 0), 0) / active.length) : 0,
        fieldReady: active.filter((row) => Number(row.field_score ?? 0) >= 80).length,
        highGaps: openGaps.filter((row) => row.priority === "High").length,
        expiringCerts: (certifications.data ?? []).filter((row) => row.status === "Active" && row.expires_on && row.expires_on >= today && row.expires_on <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)).length,
      },
    });
  } catch (error) {
    return Response.json({ error: missing(error) ? "Run supabase/titan_competency_matrix.sql before opening the Competency Matrix." : errorMessage(error) }, { status: missing(error) ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase();
    const auth = await authorizeWade(request, admin);
    if ("error" in auth) return auth.error;
    const body = await request.json().catch(() => ({})) as Body;
    const action = lower(body.action);
    const inspectorId = text(body.inspectorId);

    if (action === "create_inspector") {
      const profile = await activeProfile(admin, text(body.profileId));
      if (!profile) return Response.json({ error: "Select an active employee." }, { status: 400 });
      const { data, error } = await admin.from("titan_inspectors").insert({ profile_id: profile.id, iom_level: text(body.iomLevel) || "Level 1 - Entry/Support", title: text(body.title) || null, created_by: auth.userId, updated_by: auth.userId }).select().single();
      if (error) throw error;
      return Response.json({ ok: true, inspector: data });
    }
    if (!uuid(inspectorId)) return Response.json({ error: "Select a valid inspector." }, { status: 400 });

    if (action === "save_rating") {
      const rating = Number(body.rating);
      const witnessId = text(body.witnessId);
      const { data, error } = await admin.rpc("save_titan_skill_rating", { p_inspector_id: inspectorId, p_skill_code: text(body.skillCode), p_rating: rating, p_witnessed_by: uuid(witnessId) ? witnessId : null, p_effective_date: text(body.effectiveDate) || null, p_note: text(body.note) || null, p_actor_id: auth.userId });
      if (error) throw error;
      return Response.json(data);
    }
    if (action === "save_qualification") {
      const witnessId = text(body.witnessId);
      const { data, error } = await admin.rpc("save_titan_ds1_qualification", { p_inspector_id: inspectorId, p_category: text(body.category), p_status: text(body.status), p_witnessed_by: uuid(witnessId) ? witnessId : null, p_effective_date: text(body.effectiveDate) || null, p_note: text(body.note) || null, p_actor_id: auth.userId });
      if (error) throw error;
      return Response.json(data);
    }
    if (action === "save_certification") {
      const method = text(body.method);
      if (!["VT","UT","MT","ET","PT"].includes(method)) return Response.json({ error: "Select a certification method." }, { status: 400 });
      const payload = { inspector_id: inspectorId, method, certification_level: text(body.level) || "None", certificate_number: text(body.certificateNumber) || null, issued_date: text(body.issuedDate) || null, expires_on: text(body.expiresOn) || null, status: text(body.status) || "Active", evidence_document_id: uuid(text(body.evidenceDocumentId)) ? text(body.evidenceDocumentId) : null, updated_by: auth.userId };
      const { data, error } = await admin.from("titan_asnt_certifications").upsert({ ...payload, created_by: auth.userId }, { onConflict: "inspector_id,method" }).select().single();
      if (error) throw error;
      return Response.json({ ok: true, certification: data });
    }
    if (action === "create_gap") {
      const owner = await activeProfile(admin, text(body.ownerId));
      if (!owner) return Response.json({ error: "Select an active training owner." }, { status: 400 });
      if (!text(body.gapText) || !text(body.targetState) || !text(body.trainingAction) || !text(body.dueDate)) return Response.json({ error: "Gap, target, training action, and due date are required." }, { status: 400 });
      const { data, error } = await admin.from("titan_training_gaps").insert({ inspector_id: inspectorId, priority: text(body.priority) || "Medium", gap_text: text(body.gapText), scope_category: text(body.scopeCategory) || null, current_state: text(body.currentState) || null, target_state: text(body.targetState), training_action: text(body.trainingAction), due_date: text(body.dueDate), owner_id: owner.id, owner_name: owner.full_name, gap_status: "Planned", created_by: auth.userId, updated_by: auth.userId }).select().single();
      if (error) throw error;
      return Response.json({ ok: true, gap: data });
    }
    return Response.json({ error: "Unsupported competency action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: missing(error) ? "Run supabase/titan_competency_matrix.sql before saving competency records." : errorMessage(error) }, { status: missing(error) ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = configuredSupabase();
    const auth = await authorizeWade(request, admin);
    if ("error" in auth) return auth.error;
    const body = await request.json().catch(() => ({})) as Body;
    const gapId = text(body.gapId);
    const action = lower(body.action);
    if (!uuid(gapId)) return Response.json({ error: "Select a valid training gap." }, { status: 400 });
    const { data: current, error: currentError } = await admin.from("titan_training_gaps").select("*").eq("id", gapId).single();
    if (currentError) throw currentError;
    if (current.gap_status === "Complete" || current.gap_status === "Voided") return Response.json({ error: "This training gap is already finalized." }, { status: 409 });
    let updates: Record<string, unknown> = { updated_by: auth.userId };
    if (action === "start_gap") updates.gap_status = "In Progress";
    else if (action === "complete_gap") {
      const evidenceId = text(body.evidenceDocumentId);
      if (!uuid(evidenceId)) return Response.json({ error: "Select completion evidence from Document Control." }, { status: 400 });
      const { data: evidence } = await admin.from("documents").select("id").eq("id", evidenceId).neq("document_status", "Archived").maybeSingle();
      if (!evidence) return Response.json({ error: "The selected completion evidence is unavailable." }, { status: 400 });
      updates = { ...updates, gap_status: "Complete", completion_evidence_document_id: evidenceId, completed_by: auth.userId, completed_at: new Date().toISOString() };
    } else if (action === "void_gap") {
      const reason = text(body.reason);
      if (!reason) return Response.json({ error: "Enter a reason for voiding this gap." }, { status: 400 });
      updates = { ...updates, gap_status: "Voided", void_reason: reason };
    } else return Response.json({ error: "Unsupported training-gap action." }, { status: 400 });
    const { data, error } = await admin.from("titan_training_gaps").update(updates).eq("id", gapId).select().single();
    if (error) throw error;
    return Response.json({ ok: true, gap: data });
  } catch (error) {
    return Response.json({ error: missing(error) ? "Run supabase/titan_competency_matrix.sql before updating training gaps." : errorMessage(error) }, { status: missing(error) ? 409 : 500 });
  }
}
