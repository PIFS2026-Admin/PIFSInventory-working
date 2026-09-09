import { createClient } from "@supabase/supabase-js";

type Profile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
type Row = Record<string, unknown>;
type ProcedureSection = { heading: string; text: string };
type IndexedProcedure = { documentNumber: string; title: string; sections: ProcedureSection[] };
type ResultType = "Document" | "Tubular Specification" | "Customer Requirement" | "Field Lesson";
type SearchResult = {
  id: string;
  type: ResultType;
  title: string;
  reference: string;
  summary: string;
  context: string;
  href: string;
  documentId?: string;
  updatedAt: string;
  score: number;
};

let procedureIndexCache: { loadedAt: number; documents: IndexedProcedure[] } | null = null;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function text(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }
function normalized(value: unknown) { return lower(value).replace(/[^a-z0-9]/g, ""); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function isDti(value: unknown) { return ["", "dti", "all", "company", "companywide", "operations"].includes(normalized(value)); }

async function authorize(request: Request, admin: ReturnType<typeof adminClient>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  const profile = data as Profile | null;
  if (error || !profile) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const isWade = normalized(profile.full_name) === "wadewisenor"
    || normalized(profile.email || userData.user.email) === "wadepathfinderinspectionscom";
  if (profile.is_disabled || !isWade) return { error: Response.json({ error: "Ask TITAN is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}

function searchable(values: unknown[]) { return values.map(text).filter(Boolean).join(" | "); }

async function loadProcedureIndex(admin: ReturnType<typeof adminClient>) {
  if (procedureIndexCache && Date.now() - procedureIndexCache.loadedAt < 5 * 60 * 1000) return procedureIndexCache.documents;
  const { data, error } = await admin.storage.from("document-control").download("dti/search/procedure-index-v1.json");
  if (error || !data) return [];
  try {
    const parsed = JSON.parse(await data.text()) as { documents?: IndexedProcedure[] };
    const documents = Array.isArray(parsed.documents) ? parsed.documents : [];
    procedureIndexCache = { loadedAt: Date.now(), documents };
    return documents;
  } catch { return []; }
}

function excerpt(body: string, query: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= 420) return compact;
  const phrase = lower(query);
  const tokens = phrase.split(/\s+/).filter((token) => token.length > 1);
  let position = lower(compact).indexOf(phrase);
  if (position < 0) position = tokens.map((token) => lower(compact).indexOf(token)).find((value) => value >= 0) ?? 0;
  const start = Math.max(0, position - 110);
  const end = Math.min(compact.length, start + 420);
  return `${start > 0 ? "..." : ""}${compact.slice(start, end).trim()}${end < compact.length ? "..." : ""}`;
}

function rank(query: string, title: string, reference: string, body: string) {
  const phrase = lower(query);
  const tokens = [...new Set(phrase.split(/\s+/).map((token) => token.replace(/[^a-z0-9.#/-]/g, "")).filter((token) => token.length > 1))];
  const titleText = lower(title);
  const referenceText = lower(reference);
  const bodyText = lower(body);
  let score = 0;
  if (titleText.includes(phrase)) score += 80;
  if (referenceText.includes(phrase)) score += 65;
  if (bodyText.includes(phrase)) score += 40;
  for (const token of tokens) {
    if (titleText.includes(token)) score += 15;
    if (referenceText.includes(token)) score += 12;
    if (bodyText.includes(token)) score += 5;
  }
  return score;
}

function addRanked(results: SearchResult[], query: string, result: Omit<SearchResult, "score">, searchText: string) {
  const score = rank(query, result.title, result.reference, searchText);
  if (score > 0) results.push({ ...result, score });
}

export async function GET(request: Request) {
  try {
    const admin = adminClient();
    const authorization = await authorize(request, admin);
    if ("error" in authorization) return authorization.error;

    const query = text(new URL(request.url).searchParams.get("q"));
    if (query.length < 2) return Response.json({ ok: true, query, results: [], counts: {} });

    const [documentsResult, specsResult, requirementsResult, debriefsResult, deviationsResult] = await Promise.all([
      admin.from("documents").select("*").limit(2000),
      admin.from("titan_dti_tubular_specs").select("*").is("archived_at", null).limit(2000),
      admin.from("titan_customer_specifications").select("*").eq("status", "Active").limit(2000),
      admin.from("titan_job_debriefs").select("*").eq("status", "Active").limit(2000),
      admin.from("titan_job_deviations").select("*").in("status", ["Submitted", "Approved"]).limit(2000),
    ]);
    for (const source of [documentsResult, specsResult, requirementsResult, debriefsResult, deviationsResult]) {
      if (source.error) throw source.error;
    }

    const debriefs = (debriefsResult.data ?? []) as Row[];
    const deviations = (deviationsResult.data ?? []) as Row[];
    const jobIds = [...new Set([...debriefs, ...deviations].map((row) => text(row.job_id)).filter(Boolean))];
    const jobsResult = jobIds.length
      ? await admin.from("titan_jobs").select("id,job_number,title,customer_name,operator_name,rig_name,service_line,lifecycle_status").in("id", jobIds)
      : { data: [], error: null };
    if (jobsResult.error) throw jobsResult.error;
    const jobs = new Map(((jobsResult.data ?? []) as Row[]).filter((job) => normalized(job.service_line) === "dti").map((job) => [text(job.id), job]));

    const results: SearchResult[] = [];
    const activeDocuments = ((documentsResult.data ?? []) as Row[]).filter((document) => {
      const approval = normalized(document.approval_status);
      const status = normalized(document.document_status || document.status);
      return approval === "approved" && ["", "active"].includes(status) && isDti(document.department);
    });
    const documentsByNumber = new Map(activeDocuments.map((document) => [text(document.document_number), document]));
    const procedureIndex = await loadProcedureIndex(admin);
    for (const indexedDocument of procedureIndex) {
      const document = documentsByNumber.get(indexedDocument.documentNumber);
      if (!document) continue;
      const sectionMatches = indexedDocument.sections.map((section, index) => ({
        section, index, score: rank(query, section.heading, "", section.text),
      })).filter((match) => match.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      for (const match of sectionMatches) {
        results.push({
          id: `procedure:${text(document.id)}:${match.index}`,
          type: "Document",
          title: `${indexedDocument.title} / ${match.section.heading}`,
          reference: indexedDocument.documentNumber,
          summary: excerpt(match.section.text, query),
          context: "Approved controlled procedure",
          href: "/dti/documents",
          documentId: text(document.id),
          updatedAt: text(document.updated_at || document.created_at),
          score: match.score + 20,
        });
      }
    }

    for (const document of activeDocuments) {
      const title = text(document.title) || "Untitled controlled document";
      const reference = text(document.document_number) || text(document.category) || "Controlled document";
      const body = searchable([document.category, document.department, document.notes, document.file_name]);
      addRanked(results, query, {
        id: `document:${text(document.id)}`, type: "Document", title, reference,
        summary: text(document.notes) || text(document.file_name) || "Approved controlled document",
        context: [text(document.category), text(document.department) || "Company-wide"].filter(Boolean).join(" / "),
        href: "/dti/documents", documentId: text(document.id), updatedAt: text(document.updated_at || document.created_at),
      }, body);
    }

    for (const spec of (specsResult.data ?? []) as Row[]) {
      const title = [text(spec.pipe_size), text(spec.weight_ppf) && `${text(spec.weight_ppf)} lb/ft`, text(spec.grade), text(spec.connection)].filter(Boolean).join(" / ");
      const details = [
        text(spec.new_wall_inches) && `New wall ${text(spec.new_wall_inches)} in`,
        text(spec.premium_min_wall_inches) && `Premium min ${text(spec.premium_min_wall_inches)} in`,
        text(spec.class_2_min_wall_inches) && `Class 2 min ${text(spec.class_2_min_wall_inches)} in`,
        text(spec.notes),
      ].filter(Boolean).join("; ");
      addRanked(results, query, {
        id: `spec:${text(spec.id)}`, type: "Tubular Specification", title, reference: "Controlled tubular specification",
        summary: details || "Dimensional acceptance values", context: "DTI Tubular Specifications",
        href: "/dti/tubular-specs", updatedAt: text(spec.updated_at || spec.created_at),
      }, searchable([title, details]));
    }

    for (const requirement of (requirementsResult.data ?? []) as Row[]) {
      if (!isDti(requirement.service_line)) continue;
      const title = text(requirement.title) || "Customer requirement";
      const customer = text(requirement.customer_name) || text(requirement.scope) || "Company";
      const body = searchable([requirement.requirement_text, customer, requirement.service_line, requirement.specification_number]);
      addRanked(results, query, {
        id: `requirement:${text(requirement.id)}`, type: "Customer Requirement", title,
        reference: text(requirement.specification_number) || "Active requirement", summary: text(requirement.requirement_text),
        context: `${customer} / ${text(requirement.service_line) || "All service lines"}`, href: "/dti/intelligence",
        updatedAt: text(requirement.updated_at || requirement.effective_date),
      }, body);
    }

    for (const debrief of debriefs) {
      const job = jobs.get(text(debrief.job_id));
      if (!job) continue;
      const summary = searchable([debrief.lessons_learned, debrief.repeat_note, debrief.gray_area_summary, debrief.safety_observations, debrief.customer_feedback]);
      if (!summary) continue;
      const title = `${text(job.job_number)} / ${text(job.title)}`;
      addRanked(results, query, {
        id: `debrief:${text(debrief.id)}`, type: "Field Lesson", title,
        reference: text(debrief.debrief_number) || "Job debrief", summary, context: searchable([job.customer_name, job.rig_name, "Debrief"]),
        href: `/crm/jobs/${text(job.id)}`, updatedAt: text(debrief.updated_at || debrief.created_at),
      }, searchable([summary, job.customer_name, job.operator_name, job.rig_name, job.title, job.job_number]));
    }

    for (const deviation of deviations) {
      const job = jobs.get(text(deviation.job_id));
      if (!job) continue;
      const summary = searchable([deviation.defect_type, deviation.controlling_criteria, deviation.justification, deviation.operational_risk, deviation.inspector_recommendation]);
      const title = `${text(job.job_number)} / ${text(deviation.defect_type) || "Field deviation"}`;
      addRanked(results, query, {
        id: `deviation:${text(deviation.id)}`, type: "Field Lesson", title,
        reference: text(deviation.deviation_number) || "Job deviation", summary, context: searchable([job.customer_name, job.rig_name, deviation.component]),
        href: `/crm/jobs/${text(job.id)}`, updatedAt: text(deviation.updated_at || deviation.created_at),
      }, searchable([summary, deviation.component, deviation.joint_ids, job.title, job.job_number, job.customer_name, job.operator_name, job.rig_name]));
    }

    results.sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt));
    const limited = results.slice(0, 60);
    const counts = limited.reduce<Record<string, number>>((totals, result) => {
      totals[result.type] = (totals[result.type] ?? 0) + 1;
      return totals;
    }, {});
    return Response.json({ ok: true, query, results: limited, counts });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
