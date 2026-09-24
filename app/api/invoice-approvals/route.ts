import { createHash, randomUUID } from "crypto";
import {
  applyPermissionOverrides,
  canApprove,
  canView,
  getDefaultPermissionsForRole,
  normalizeRole,
} from "../../../lib/modulePermissions";
import {
  invoiceCanView,
  invoiceErrorResponse,
  invoiceRequestContext,
  invoiceSchemaMissing,
  InvoiceRequestContext,
} from "../../../lib/serverInvoiceApprovals";
import { notifyInvoiceWorkflow } from "../../../lib/invoiceApprovalNotifications";

export const runtime = "nodejs";

const bucket = "titan-ap-invoices";
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const approvalStatement = "I approve this invoice and its accounting coding and electronically sign it using my authenticated TITAN account.";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : NaN;
}

function normalizedInvoice(value: unknown) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedVendor(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "invoice";
}

function capturedSignature(value: unknown) {
  const match = text(value).match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Draw your signature before approving this invoice.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 500 || bytes.length > 500_000) throw new Error("The captured signature is invalid or too large.");
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(pngHeader) || bytes.length < 24) throw new Error("The captured signature must be a PNG image.");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 100 || height < 40 || width > 2_000 || height > 1_000) throw new Error("The captured signature dimensions are invalid.");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function ensureBucket(context: InvoiceRequestContext) {
  const current = await context.admin.storage.getBucket(bucket);
  if (!current.error) return;
  const created = await context.admin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: Array.from(allowedTypes),
  });
  if (created.error && !created.error.message.toLowerCase().includes("already exists")) throw created.error;
}

async function activeApprovers(context: InvoiceRequestContext) {
  const [profilesResult, accessResult, overridesResult] = await Promise.all([
    context.admin.from("profiles").select("id,full_name,email,role,is_disabled").eq("is_disabled", false).order("full_name"),
    context.admin.from("user_module_permissions").select("user_id,can_access").eq("module_key", "invoice_approvals"),
    context.admin.from("user_permission_overrides").select("user_id,module_key,action_key,is_allowed").eq("module_key", "invoice_approvals"),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  const access = new Map((accessResult.data || []).map((row) => [row.user_id, Boolean(row.can_access)]));
  const overridesByUser = new Map<string, typeof overridesResult.data>();
  (overridesResult.data || []).forEach((row) => {
    const rows = overridesByUser.get(row.user_id) || [];
    rows.push(row);
    overridesByUser.set(row.user_id, rows);
  });
  return (profilesResult.data || []).filter((profile) => {
    const role = normalizeRole(profile.role);
    if (role === "customer" || role === "operator") return false;
    const permissions = applyPermissionOverrides(getDefaultPermissionsForRole(role), overridesByUser.get(profile.id) || []);
    return (role === "admin" || role === "owner" || access.get(profile.id) === true || canView(permissions, "invoice_approvals"))
      && canApprove(permissions, "invoice_approvals");
  });
}

async function assertApprover(context: InvoiceRequestContext, approverId: string) {
  const approvers = await activeApprovers(context);
  const approver = approvers.find((row) => row.id === approverId);
  if (!approver) throw new Error("Select an active TITAN user with Invoice Approval permission.");
  return approver;
}

async function getInvoice(context: InvoiceRequestContext, invoiceId: string) {
  const result = await context.admin.from("titan_ap_invoices").select("*").eq("id", invoiceId).single();
  if (result.error || !result.data) throw new Error(result.error?.message || "Invoice not found.");
  if (!invoiceCanView(context, result.data)) throw new Error("You do not have access to this invoice.");
  return result.data;
}

async function activity(context: InvoiceRequestContext, invoiceId: string, action: string, fromStatus: string | null, toStatus: string | null, note?: string, details?: Record<string, unknown>) {
  const result = await context.admin.from("titan_ap_invoice_activity").insert({
    invoice_id: invoiceId,
    action,
    actor_id: context.actor.id,
    actor_name: context.actor.fullName,
    from_status: fromStatus,
    to_status: toStatus,
    note: note || null,
    details: details || {},
  });
  if (result.error) throw result.error;
}

async function workflowNotificationWarning(
  context: InvoiceRequestContext,
  invoice: Record<string, unknown> & { id: string },
  kind: "assigned" | "reassigned" | "returned" | "disputed" | "approved",
  reason = "",
) {
  try {
    const result = await notifyInvoiceWorkflow({
      admin: context.admin,
      invoice,
      kind,
      actorId: context.actor.id,
      actorName: context.actor.fullName,
      reason,
    });
    return result.warnings.join(" ");
  } catch (error) {
    console.error(`Invoice ${kind} notification failed`, error);
    return "The invoice was saved, but one or more notifications could not be delivered.";
  }
}

async function duplicateMatches(context: InvoiceRequestContext, vendorName: string, invoiceNumber: string, excludeId = "") {
  const result = await context.admin
    .from("titan_ap_invoices")
    .select("id,vendor_name,invoice_number,invoice_date,total_amount,status,created_at")
    .ilike("vendor_name", vendorName)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data || []).filter((row) => row.id !== excludeId && normalizedVendor(row.vendor_name) === normalizedVendor(vendorName) && normalizedInvoice(row.invoice_number) === normalizedInvoice(invoiceNumber));
}

async function uploadFile(context: InvoiceRequestContext, invoiceId: string, file: File, kind: "original" | "corrected") {
  if (!allowedTypes.has(file.type)) throw new Error("Upload a PDF, JPG, or PNG invoice.");
  if (file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error("Invoice files must be between 1 byte and 25 MB.");
  await ensureBucket(context);
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const current = await context.admin.from("titan_ap_invoice_files").select("id,version_number").eq("invoice_id", invoiceId).order("version_number", { ascending: false }).limit(1);
  if (current.error) throw current.error;
  const version = Number(current.data?.[0]?.version_number || 0) + 1;
  const path = `${invoiceId}/v${version}-${randomUUID()}-${safeFileName(file.name)}`;
  const stored = await context.admin.storage.from(bucket).upload(path, bytes, { contentType: file.type, upsert: false });
  if (stored.error) throw stored.error;

  const unset = await context.admin.from("titan_ap_invoice_files").update({ is_current: false }).eq("invoice_id", invoiceId).eq("is_current", true);
  if (unset.error) throw unset.error;
  const inserted = await context.admin.from("titan_ap_invoice_files").insert({
    invoice_id: invoiceId,
    file_kind: kind,
    version_number: version,
    is_current: true,
    storage_bucket: bucket,
    storage_path: path,
    original_file_name: file.name,
    mime_type: file.type,
    file_size: file.size,
    sha256,
    uploaded_by: context.actor.id,
    uploaded_by_name: context.actor.fullName,
  }).select("*").single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

export async function GET(request: Request) {
  try {
    const context = await invoiceRequestContext(request);
    const url = new URL(request.url);
    const invoiceId = text(url.searchParams.get("invoiceId"));
    const fileId = text(url.searchParams.get("fileId"));
    const signatureApprovalId = text(url.searchParams.get("signatureApprovalId"));

    if (signatureApprovalId) {
      const approvalResult = await context.admin.from("titan_ap_invoice_approvals").select("id,invoice_id,signature_storage_bucket,signature_storage_path").eq("id", signatureApprovalId).single();
      if (approvalResult.error || !approvalResult.data?.signature_storage_path) throw new Error("Approval signature not found.");
      await getInvoice(context, approvalResult.data.invoice_id);
      const signed = await context.admin.storage.from(approvalResult.data.signature_storage_bucket || bucket).createSignedUrl(approvalResult.data.signature_storage_path, 300);
      if (signed.error) throw signed.error;
      return Response.json({ url: signed.data.signedUrl });
    }

    if (fileId) {
      const fileResult = await context.admin.from("titan_ap_invoice_files").select("*").eq("id", fileId).single();
      if (fileResult.error || !fileResult.data) throw new Error("Invoice file not found.");
      await getInvoice(context, fileResult.data.invoice_id);
      const signed = await context.admin.storage.from(fileResult.data.storage_bucket).createSignedUrl(fileResult.data.storage_path, 300);
      if (signed.error) throw signed.error;
      return Response.json({ url: signed.data.signedUrl, file: fileResult.data });
    }

    let invoiceQuery = context.admin.from("titan_ap_invoices").select("*").order("created_at", { ascending: false });
    if (!context.isAp && !context.isAdmin) invoiceQuery = invoiceQuery.eq("assigned_approver_id", context.actor.id);
    if (invoiceId) invoiceQuery = invoiceQuery.eq("id", invoiceId);

    const [invoiceResult, vendorResult, yardResult, codeResult, approvers] = await Promise.all([
      invoiceQuery,
      context.admin.from("inventory_vendors").select("id,vendor_name,active,yard_id").eq("active", true).order("vendor_name"),
      context.admin.from("yards").select("id,name,code").order("name"),
      context.admin.from("titan_ap_accounting_codes").select("*").order("code"),
      activeApprovers(context),
    ]);
    if (invoiceResult.error) throw invoiceResult.error;
    if (codeResult.error) throw codeResult.error;

    const invoices = invoiceResult.data || [];
    const ids = invoices.map((row) => row.id);
    const profileIds = Array.from(new Set(invoices.flatMap((row) => [row.assigned_approver_id, row.uploaded_by]).filter(Boolean)));
    const [coding, files, approvals, activityRows, profiles] = ids.length ? await Promise.all([
      context.admin.from("titan_ap_invoice_coding_lines").select("*").in("invoice_id", ids).order("line_number"),
      context.admin.from("titan_ap_invoice_files").select("id,invoice_id,file_kind,version_number,is_current,original_file_name,mime_type,file_size,sha256,uploaded_by_name,uploaded_at").in("invoice_id", ids).order("version_number", { ascending: false }),
      context.admin.from("titan_ap_invoice_approvals").select("*").in("invoice_id", ids),
      context.admin.from("titan_ap_invoice_activity").select("*").in("invoice_id", ids).order("created_at", { ascending: false }),
      profileIds.length ? context.admin.from("profiles").select("id,full_name,email").in("id", profileIds) : Promise.resolve({ data: [], error: null }),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    for (const result of [coding, files, approvals, activityRows, profiles]) if (result.error) throw result.error;
    const names = Object.fromEntries((profiles.data || []).map((row) => [row.id, row.full_name || row.email || "TITAN User"]));

    return Response.json({
      setupRequired: false,
      actor: context.actor,
      permissions: { ...context.invoicePermissions, isAp: context.isAp, isAdmin: context.isAdmin },
      invoices: invoices.map((row) => ({ ...row, assigned_approver_name: names[row.assigned_approver_id] || "Unknown", uploaded_by_name: row.uploaded_by_name || names[row.uploaded_by] || "Unknown" })),
      codingLines: coding.data || [],
      files: files.data || [],
      approvals: approvals.data || [],
      activity: activityRows.data || [],
      vendors: vendorResult.data || [],
      yards: yardResult.data || [],
      accountingCodes: codeResult.data || [],
      approvers,
      approvalStatement,
    });
  } catch (error) {
    if (invoiceSchemaMissing(error)) return Response.json({ setupRequired: true, error: "Run supabase/titan_invoice_approval.sql to enable Invoice Approvals." });
    return invoiceErrorResponse(error);
  }
}

async function createInvoice(request: Request, context: InvoiceRequestContext, form: FormData) {
  if (!context.isAp || !context.invoicePermissions.create) throw new Error("Only AP can upload invoices.");
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Select the invoice PDF or image.");
  const vendorId = text(form.get("vendorId"));
  let vendorName = text(form.get("vendorName"));
  if (vendorId) {
    const vendor = await context.admin.from("inventory_vendors").select("vendor_name").eq("id", vendorId).single();
    if (vendor.error || !vendor.data) throw new Error("Select a valid vendor.");
    vendorName = vendor.data.vendor_name;
  }
  const invoiceNumber = text(form.get("invoiceNumber"));
  const invoiceDate = text(form.get("invoiceDate"));
  const totalAmount = money(form.get("totalAmount"));
  const approverId = text(form.get("approverId"));
  if (!vendorName || !invoiceNumber || !invoiceDate || !approverId || !Number.isFinite(totalAmount) || totalAmount < 0) throw new Error("Vendor, invoice number, invoice date, amount, and approver are required.");
  await assertApprover(context, approverId);
  const matches = await duplicateMatches(context, vendorName, invoiceNumber);
  const acknowledged = text(form.get("duplicateAcknowledged")) === "true";
  if (matches.length && !acknowledged) return Response.json({ duplicateWarning: true, matches }, { status: 409 });

  const inserted = await context.admin.from("titan_ap_invoices").insert({
    yard_id: text(form.get("yardId")) || null,
    vendor_id: vendorId || null,
    vendor_name: vendorName,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    due_date: text(form.get("dueDate")) || null,
    total_amount: totalAmount,
    notes: text(form.get("notes")) || null,
    assigned_approver_id: approverId,
    assigned_by: context.actor.id,
    uploaded_by: context.actor.id,
    uploaded_by_name: context.actor.fullName,
    duplicate_acknowledged_by: matches.length ? context.actor.id : null,
    duplicate_acknowledged_at: matches.length ? new Date().toISOString() : null,
    duplicate_acknowledgment_note: matches.length ? text(form.get("duplicateNote")) || "AP reviewed the possible duplicate warning." : null,
  }).select("*").single();
  if (inserted.error || !inserted.data) throw inserted.error || new Error("Invoice could not be created.");
  try {
    await uploadFile(context, inserted.data.id, file, "original");
    await activity(context, inserted.data.id, "uploaded", null, "awaiting_approval", text(form.get("notes")), { invoice_number: invoiceNumber, vendor_name: vendorName, total_amount: totalAmount });
    await activity(context, inserted.data.id, "assigned", "awaiting_approval", "awaiting_approval", undefined, { approver_id: approverId });
    if (matches.length) await activity(context, inserted.data.id, "duplicate_acknowledged", "awaiting_approval", "awaiting_approval", text(form.get("duplicateNote")), { matching_invoice_ids: matches.map((row) => row.id) });
  } catch (error) {
    await context.admin.from("titan_ap_invoices").delete().eq("id", inserted.data.id);
    throw error;
  }
  const notificationWarning = await workflowNotificationWarning(context, inserted.data, "assigned");
  return Response.json({ ok: true, invoiceId: inserted.data.id, notificationWarning: notificationWarning || undefined });
}

async function replaceFile(context: InvoiceRequestContext, form: FormData) {
  if (!context.isAp || !context.invoicePermissions.edit) throw new Error("Only AP can replace invoice files.");
  const invoiceId = text(form.get("invoiceId"));
  const invoice = await getInvoice(context, invoiceId);
  if (invoice.status === "approved") throw new Error("Approved invoice files are locked.");
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Select the corrected invoice file.");
  const stored = await uploadFile(context, invoiceId, file, "corrected");
  await activity(context, invoiceId, "file_replaced", invoice.status, invoice.status, text(form.get("note")) || "Corrected invoice uploaded.", { file_id: stored.id, version_number: stored.version_number });
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  try {
    const context = await invoiceRequestContext(request);
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      return text(form.get("action")) === "replace_file" ? replaceFile(context, form) : createInvoice(request, context, form);
    }

    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action);
    const invoiceId = text(body.invoiceId);

    if (action === "save_code") {
      if (!context.invoicePermissions.manageSettings) throw new Error("Only an authorized administrator can manage accounting codes.");
      const code = text(body.code);
      if (!code) throw new Error("Accounting code is required.");
      const payload = { code, description: text(body.description), active: body.active !== false, updated_by: context.actor.id };
      const result = body.id
        ? await context.admin.from("titan_ap_accounting_codes").update(payload).eq("id", text(body.id)).select("*").single()
        : await context.admin.from("titan_ap_accounting_codes").insert({ ...payload, created_by: context.actor.id }).select("*").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, code: result.data });
    }

    if (!invoiceId) throw new Error("Invoice is required.");
    const invoice = await getInvoice(context, invoiceId);

    if (action === "save_coding") {
      if (!context.invoicePermissions.approve) throw new Error("You do not have permission to code invoices.");
      const result = await context.admin.rpc("titan_ap_replace_coding_lines", {
        p_invoice_id: invoiceId,
        p_actor_id: context.actor.id,
        p_actor_name: context.actor.fullName,
        p_lines: Array.isArray(body.lines) ? body.lines : [],
        p_notes: text(body.notes),
      });
      if (result.error) throw result.error;
      return Response.json({ ok: true });
    }

    if (action === "approve") {
      if (!context.invoicePermissions.approve) throw new Error("You do not have permission to approve invoices.");
      if (body.confirmed !== true) throw new Error("Confirm the electronic approval statement before approving.");
      const signature = capturedSignature(body.signatureData);
      await ensureBucket(context);
      const signaturePath = `${invoiceId}/signatures/${randomUUID()}.png`;
      const uploaded = await context.admin.storage.from(bucket).upload(signaturePath, signature.bytes, { contentType: "image/png", upsert: false });
      if (uploaded.error) throw uploaded.error;
      const result = await context.admin.rpc("titan_ap_approve_invoice", {
        p_invoice_id: invoiceId,
        p_actor_id: context.actor.id,
        p_actor_name: context.actor.fullName,
        p_approval_statement: approvalStatement,
        p_signature_bucket: bucket,
        p_signature_path: signaturePath,
        p_signature_sha256: signature.sha256,
      });
      if (result.error) {
        await context.admin.storage.from(bucket).remove([signaturePath]);
        throw result.error;
      }
      const notificationWarning = await workflowNotificationWarning(context, invoice, "approved");
      return Response.json({ ok: true, approvalId: result.data, notificationWarning: notificationWarning || undefined });
    }

    if (action === "dispute" || action === "return") {
      const reason = text(body.reason);
      if (!reason) throw new Error(`A reason is required to ${action === "dispute" ? "dispute" : "return"} an invoice.`);
      if (!context.invoicePermissions.approve || invoice.assigned_approver_id !== context.actor.id || invoice.status !== "awaiting_approval") throw new Error("Only the assigned approver can take this action.");
      const nextStatus = action === "dispute" ? "disputed" : "returned_to_ap";
      const update = await context.admin.from("titan_ap_invoices").update({
        status: nextStatus,
        dispute_reason: action === "dispute" ? reason : null,
        return_reason: action === "return" ? reason : null,
        row_version: Number(invoice.row_version || 0) + 1,
      }).eq("id", invoiceId).eq("status", "awaiting_approval").select("id").maybeSingle();
      if (update.error) throw update.error;
      if (!update.data) throw new Error("This invoice changed before the action completed. Refresh and try again.");
      await activity(context, invoiceId, action === "dispute" ? "disputed" : "returned_to_ap", "awaiting_approval", nextStatus, reason);
      const notificationWarning = await workflowNotificationWarning(context, invoice, action === "dispute" ? "disputed" : "returned", reason);
      return Response.json({ ok: true, notificationWarning: notificationWarning || undefined });
    }

    if (action === "reassign") {
      if (!context.isAp || !context.invoicePermissions.edit) throw new Error("Only AP can assign invoices.");
      if (invoice.status === "approved") throw new Error("Approved invoices cannot be reassigned.");
      const approverId = text(body.approverId);
      await assertApprover(context, approverId);
      const updated = await context.admin.from("titan_ap_invoices").update({
        assigned_approver_id: approverId,
        assigned_by: context.actor.id,
        assigned_at: new Date().toISOString(),
        status: "awaiting_approval",
        dispute_reason: null,
        return_reason: null,
        row_version: Number(invoice.row_version || 0) + 1,
      }).eq("id", invoiceId).neq("status", "approved").select("id").maybeSingle();
      if (updated.error) throw updated.error;
      if (!updated.data) throw new Error("This invoice was approved before reassignment completed.");
      await activity(context, invoiceId, "reassigned", invoice.status, "awaiting_approval", text(body.note), { previous_approver_id: invoice.assigned_approver_id, approver_id: approverId });
      const notificationWarning = await workflowNotificationWarning(context, { ...invoice, assigned_approver_id: approverId }, "reassigned");
      return Response.json({ ok: true, notificationWarning: notificationWarning || undefined });
    }

    if (action === "update_invoice") {
      if (!context.isAp || !context.invoicePermissions.edit) throw new Error("Only AP can edit invoice details.");
      if (invoice.status === "approved") throw new Error("Approved invoices are locked.");
      const vendorName = text(body.vendorName) || invoice.vendor_name;
      const invoiceNumber = text(body.invoiceNumber) || invoice.invoice_number;
      const totalAmount = money(body.totalAmount);
      if (!vendorName || !invoiceNumber || !text(body.invoiceDate) || !Number.isFinite(totalAmount) || totalAmount < 0) throw new Error("Vendor, invoice number, invoice date, and amount are required.");
      const matches = await duplicateMatches(context, vendorName, invoiceNumber, invoiceId);
      if (matches.length && body.duplicateAcknowledged !== true) return Response.json({ duplicateWarning: true, matches }, { status: 409 });
      const update = await context.admin.from("titan_ap_invoices").update({
        yard_id: text(body.yardId) || null,
        vendor_id: text(body.vendorId) || null,
        vendor_name: vendorName,
        invoice_number: invoiceNumber,
        invoice_date: text(body.invoiceDate),
        due_date: text(body.dueDate) || null,
        total_amount: totalAmount,
        notes: text(body.notes) || null,
        duplicate_acknowledged_by: matches.length ? context.actor.id : invoice.duplicate_acknowledged_by,
        duplicate_acknowledged_at: matches.length ? new Date().toISOString() : invoice.duplicate_acknowledged_at,
        duplicate_acknowledgment_note: matches.length ? text(body.duplicateNote) || "AP reviewed the possible duplicate warning." : invoice.duplicate_acknowledgment_note,
        row_version: Number(invoice.row_version || 0) + 1,
      }).eq("id", invoiceId).neq("status", "approved").select("id").maybeSingle();
      if (update.error) throw update.error;
      if (!update.data) throw new Error("This invoice was approved before the edit completed.");
      await activity(context, invoiceId, "invoice_updated", invoice.status, invoice.status, text(body.notes), { invoice_number: invoiceNumber, total_amount: totalAmount });
      return Response.json({ ok: true });
    }

    throw new Error("Unsupported invoice action.");
  } catch (error) {
    if (invoiceSchemaMissing(error)) return Response.json({ setupRequired: true, error: "Run supabase/titan_invoice_approval.sql to enable Invoice Approvals." }, { status: 503 });
    return invoiceErrorResponse(error);
  }
}
