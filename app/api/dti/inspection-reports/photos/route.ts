import { createClient } from "@supabase/supabase-js";
import { dtiPhotoEvidenceFields, isDtiComponentType } from "../../../../../lib/dtiInspectionReport";
import { authorizeDtiAccess } from "../../../../../lib/serverDtiAccess";

export const runtime = "nodejs";

const bucket = "titan-dti-inspection-photos";
type Row = Record<string, unknown>;

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function text(value: unknown) { return String(value ?? "").trim(); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }
function migrationMissing(error: unknown) { const message = errorMessage(error).toLowerCase(); return message.includes("titan_dti_inspection_photos") || message.includes("bucket not found") || message.includes("schema cache"); }
function safeName(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "photo.jpg"; }

async function ensureBucket(admin: ReturnType<typeof configuredSupabase>) {
  const created = await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: 15 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] });
  if (created.error && !created.error.message.toLowerCase().includes("already exists")) throw created.error;
}

async function photoView(admin: ReturnType<typeof configuredSupabase>, photo: Row) {
  const signed = await admin.storage.from(bucket).createSignedUrl(text(photo.storage_path), 60 * 60);
  if (signed.error) throw signed.error;
  return { ...photo, url: signed.data.signedUrl };
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase(); const authorization = await authorizeDtiAccess(request, admin); if ("error" in authorization) return authorization.error;
    const reportId = text(new URL(request.url).searchParams.get("reportId"));
    if (!validUuid(reportId)) return Response.json({ error: "Select a valid inspection report." }, { status: 400 });
    const result = await admin.from("titan_dti_inspection_photos").select("*").eq("report_id", reportId).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return Response.json({ ok: true, photos: await Promise.all((result.data ?? []).map((photo) => photoView(admin, photo))) });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_inspection_photos.sql before adding report photos." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  let uploadedPath = "";
  try {
    const admin = configuredSupabase(); const authorization = await authorizeDtiAccess(request, admin); if ("error" in authorization) return authorization.error;
    const form = await request.formData(); const reportId = text(form.get("reportId")); const itemId = text(form.get("itemId"));
    const findingKey = text(form.get("findingKey")); const findingLabel = text(form.get("findingLabel")); const file = form.get("file");
    if (!validUuid(reportId) || !validUuid(itemId)) return Response.json({ error: "Save the inspection row before attaching a photo." }, { status: 400 });
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size < 1 || file.size > 15 * 1024 * 1024) return Response.json({ error: "Choose an image no larger than 15 MB." }, { status: 400 });
    const itemResult = await admin.from("titan_dti_inspection_items").select("id,report_id,component_type,sequence_number,row_data").eq("id", itemId).eq("report_id", reportId).maybeSingle();
    if (itemResult.error) throw itemResult.error; if (!itemResult.data) return Response.json({ error: "Inspection row not found." }, { status: 404 });
    const componentType = text(itemResult.data.component_type);
    if (!isDtiComponentType(componentType) || !dtiPhotoEvidenceFields(componentType).some((field) => field.key === findingKey)) return Response.json({ error: "Select a reface or damage finding before taking a photo." }, { status: 400 });
    await ensureBucket(admin);
    uploadedPath = `${reportId}/${itemId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
    const uploaded = await admin.storage.from(bucket).upload(uploadedPath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const rowData = (itemResult.data.row_data && typeof itemResult.data.row_data === "object" ? itemResult.data.row_data : {}) as Row;
    const inserted = await admin.from("titan_dti_inspection_photos").insert({ report_id: reportId, item_id: itemId, component_type: componentType, sequence_number: itemResult.data.sequence_number, joint_number: text(form.get("jointNumber")) || text(rowData.jointNumber) || null, serial_number: text(form.get("serialNumber")) || text(rowData.serialNumber) || null, finding_key: findingKey, finding_label: findingLabel || findingKey, caption: text(form.get("caption")) || null, file_name: file.name || "photo.jpg", storage_path: uploadedPath, mime_type: file.type, file_size: file.size, created_by: authorization.userId }).select("*").single();
    if (inserted.error) throw inserted.error;
    await admin.from("titan_dti_inspection_report_events").insert({ report_id: reportId, entity_type: "Photo", entity_id: inserted.data.id, event_type: "Created", before_value: null, after_value: { itemId, serialNumber: inserted.data.serial_number, findingKey }, actor_id: authorization.userId });
    return Response.json({ ok: true, photo: await photoView(admin, inserted.data) });
  } catch (error) {
    if (uploadedPath) { const admin = configuredSupabase(); await admin.storage.from(bucket).remove([uploadedPath]); }
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_inspection_photos.sql before adding report photos." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = configuredSupabase(); const authorization = await authorizeDtiAccess(request, admin); if ("error" in authorization) return authorization.error;
    const body = await request.json().catch(() => ({})) as Row; const reportId = text(body.reportId); const photoId = text(body.photoId);
    if (!validUuid(reportId) || !validUuid(photoId)) return Response.json({ error: "Select a valid report photo." }, { status: 400 });
    const selected = await admin.from("titan_dti_inspection_photos").select("*").eq("id", photoId).eq("report_id", reportId).maybeSingle();
    if (selected.error) throw selected.error; if (!selected.data) return Response.json({ error: "Photo not found." }, { status: 404 });
    const removed = await admin.storage.from(bucket).remove([text(selected.data.storage_path)]); if (removed.error) throw removed.error;
    const deleted = await admin.from("titan_dti_inspection_photos").delete().eq("id", photoId).eq("report_id", reportId); if (deleted.error) throw deleted.error;
    await admin.from("titan_dti_inspection_report_events").insert({ report_id: reportId, entity_type: "Photo", entity_id: photoId, event_type: "Deleted", before_value: selected.data, after_value: null, actor_id: authorization.userId });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: migrationMissing(error) ? "Run supabase/titan_dti_inspection_photos.sql before managing report photos." : errorMessage(error) }, { status: migrationMissing(error) ? 409 : 500 });
  }
}
