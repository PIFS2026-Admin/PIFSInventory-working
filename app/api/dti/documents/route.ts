import { createClient } from "@supabase/supabase-js";

type TitanProfile = { full_name?: string | null; email?: string | null; is_disabled?: boolean | null };
type DocumentRow = Record<string, unknown> & { id: string };

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function text(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return text(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
}

function isDtiDocument(document: DocumentRow) {
  const serviceLine = normalized(document.department);
  const approval = normalized(document.approval_status);
  const status = normalized(document.document_status || document.status);
  return approval === "approved"
    && ["", "active"].includes(status)
    && ["", "dti", "operations", "all", "company", "companywide"].includes(serviceLine);
}

async function authorizeWade(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  const { data: profile, error } = await admin.from("profiles").select("full_name,email,is_disabled").eq("id", userData.user.id).maybeSingle();
  if (error || !profile) return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  const row = profile as TitanProfile;
  const isWade = normalized(row.full_name) === "wadewisenor"
    || normalized(row.email || userData.user.email) === "wadepathfinderinspectionscom";
  if (row.is_disabled || !isWade) return { error: Response.json({ error: "The DTI Document Library is currently restricted to Wade." }, { status: 403 }) };
  return { userId: userData.user.id };
}

function viewModel(document: DocumentRow) {
  return {
    id: document.id,
    documentNumber: text(document.document_number),
    title: text(document.title) || "Untitled document",
    category: text(document.category) || "Other",
    serviceLine: text(document.department) || "Company-wide",
    issueDate: text(document.issue_date),
    expirationDate: text(document.expiration_date),
    fileName: text(document.file_name),
    notes: text(document.notes),
    updatedAt: text(document.updated_at || document.uploaded_date || document.created_at),
  };
}

function pathFromPublicUrl(value: string) {
  const match = value.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/i);
  return match ? { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) } : null;
}

async function signedDocumentUrl(admin: ReturnType<typeof configuredSupabase>, document: DocumentRow) {
  const filePath = text(document.file_path).replace(/^\/+/, "");
  const fileUrl = text(document.file_url);
  const parsed = pathFromPublicUrl(fileUrl);
  const candidates = parsed
    ? [parsed]
    : filePath
      ? [{ bucket: "document-control", path: filePath }, { bucket: "documents", path: filePath }]
      : [];

  for (const candidate of candidates) {
    const { data, error } = await admin.storage.from(candidate.bucket).createSignedUrl(candidate.path, 300);
    if (!error && data?.signedUrl) return data.signedUrl;
  }

  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  throw new Error("This document does not have an available file.");
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorizeWade(request, admin);
    if ("error" in authorization) return authorization.error;

    const searchParams = new URL(request.url).searchParams;
    const documentId = text(searchParams.get("documentId"));
    const documentNumber = text(searchParams.get("documentNumber"));
    if (documentId || documentNumber) {
      let documentQuery = admin.from("documents").select("*");
      documentQuery = documentId ? documentQuery.eq("id", documentId) : documentQuery.eq("document_number", documentNumber);
      const { data, error } = await documentQuery.maybeSingle();
      if (error) throw error;
      const document = data as DocumentRow | null;
      if (!document || !isDtiDocument(document)) return Response.json({ error: "This approved DTI document is not available." }, { status: 404 });
      return Response.json({ ok: true, url: await signedDocumentUrl(admin, document) });
    }

    const { data, error } = await admin.from("documents").select("*").limit(2000);
    if (error) throw error;
    const documents = ((data ?? []) as DocumentRow[])
      .filter(isDtiDocument)
      .map(viewModel)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return Response.json({ ok: true, documents });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
