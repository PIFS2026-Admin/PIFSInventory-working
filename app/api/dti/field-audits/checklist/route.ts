import { createClient } from "@supabase/supabase-js";
import { authorizeDtiAccess } from "../../../../../lib/serverDtiAccess";

type ChecklistBody = {
  originalItemCode?: unknown;
  itemCode?: unknown;
  sectionCode?: unknown;
  sectionTitle?: unknown;
  itemText?: unknown;
  referenceText?: unknown;
  isCritical?: unknown;
  sortOrder?: unknown;
};

function configuredSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function clean(value: unknown) { return String(value ?? "").trim(); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error); }

async function authorize(request: Request, admin: ReturnType<typeof configuredSupabase>) {
  return authorizeDtiAccess(request, admin);
}

function validatedItem(body: ChecklistBody) {
  const itemCode = clean(body.itemCode).toUpperCase();
  const sectionCode = clean(body.sectionCode).toUpperCase();
  const sectionTitle = clean(body.sectionTitle);
  const itemText = clean(body.itemText);
  const referenceText = clean(body.referenceText);
  const sortOrder = Number(body.sortOrder);
  if (!/^[A-H][A-Z0-9-]{0,9}$/.test(itemCode)) throw new Error("Item code must begin with its A-H section letter.");
  if (!/^[A-H]$/.test(sectionCode) || !itemCode.startsWith(sectionCode)) throw new Error("Item code and section must use the same A-H section letter.");
  if (!sectionTitle) throw new Error("Enter the section title.");
  if (!itemText) throw new Error("Enter the checklist requirement.");
  if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 9999) throw new Error("Sort order must be a whole number from 1 to 9999.");
  return { item_code: itemCode, section_code: sectionCode, section_title: sectionTitle, item_text: itemText, reference_text: referenceText || null, is_critical: Boolean(body.isCritical), sort_order: sortOrder, is_active: true };
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorize(request, admin);
    if ("error" in authorization) return authorization.error;
    const item = validatedItem((await request.json().catch(() => ({}))) as ChecklistBody);
    const { data: existing, error: existingError } = await admin.from("titan_field_audit_checklist").select("item_code,is_active").eq("item_code", item.item_code).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.is_active) return Response.json({ error: `${item.item_code} already exists.` }, { status: 409 });
    const query = existing
      ? admin.from("titan_field_audit_checklist").update(item).eq("item_code", item.item_code)
      : admin.from("titan_field_audit_checklist").insert(item);
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorize(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = (await request.json().catch(() => ({}))) as ChecklistBody;
    const originalItemCode = clean(body.originalItemCode).toUpperCase();
    if (!originalItemCode) return Response.json({ error: "Select a checklist item to edit." }, { status: 400 });
    const item = validatedItem(body);
    const { data, error } = await admin.from("titan_field_audit_checklist").update(item).eq("item_code", originalItemCode).eq("is_active", true).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "This checklist item was not found." }, { status: 404 });
    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = configuredSupabase();
    const authorization = await authorize(request, admin);
    if ("error" in authorization) return authorization.error;
    const body = (await request.json().catch(() => ({}))) as ChecklistBody;
    const itemCode = clean(body.originalItemCode || body.itemCode).toUpperCase();
    if (!itemCode) return Response.json({ error: "Select a checklist item to remove." }, { status: 400 });
    const { count, error: countError } = await admin.from("titan_field_audit_checklist").select("item_code", { count: "exact", head: true }).eq("is_active", true);
    if (countError) throw countError;
    if ((count ?? 0) <= 1) return Response.json({ error: "The checklist must keep at least one active item." }, { status: 409 });
    const { data, error } = await admin.from("titan_field_audit_checklist").update({ is_active: false }).eq("item_code", itemCode).eq("is_active", true).select("item_code").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "This checklist item was not found." }, { status: 404 });
    return Response.json({ ok: true, itemCode });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}
