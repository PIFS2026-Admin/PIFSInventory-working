import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  applyPermissionOverrides,
  canApprove,
  canCreate,
  canEdit,
  canExport,
  canManageSettings,
  canView,
  getDefaultPermissionsForRole,
  normalizeRole,
  PermissionMap,
  RoleKey,
} from "./modulePermissions";

export type InvoiceActor = {
  id: string;
  email: string;
  fullName: string;
  role: RoleKey;
};

export type InvoicePermissionSet = {
  view: boolean;
  create: boolean;
  edit: boolean;
  approve: boolean;
  export: boolean;
  manageSettings: boolean;
};

export type InvoiceRequestContext = {
  admin: SupabaseClient;
  actor: InvoiceActor;
  permissions: PermissionMap;
  invoicePermissions: InvoicePermissionSet;
  isAp: boolean;
  isAdmin: boolean;
};

export function invoiceAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

export async function invoiceRequestContext(request: Request): Promise<InvoiceRequestContext> {
  const admin = invoiceAdminClient();
  const token = bearerToken(request);
  if (!token) throw new Error("You must be signed in.");

  const userResult = await admin.auth.getUser(token);
  if (userResult.error || !userResult.data.user) throw new Error("Your TITAN session is no longer valid.");

  const user = userResult.data.user;
  const profileResult = await admin
    .from("profiles")
    .select("id,role,full_name,email,is_disabled,access_configured")
    .eq("id", user.id)
    .single();
  if (profileResult.error || !profileResult.data) throw new Error("Your TITAN profile could not be loaded.");
  if (profileResult.data.is_disabled) throw new Error("This TITAN account is disabled.");

  const role = normalizeRole(profileResult.data.role);
  let permissions = getDefaultPermissionsForRole(role);
  const overrides = await admin
    .from("user_permission_overrides")
    .select("module_key,action_key,is_allowed")
    .eq("user_id", user.id);
  if (!overrides.error) permissions = applyPermissionOverrides(permissions, overrides.data || []);

  const moduleAccess = await admin
    .from("user_module_permissions")
    .select("can_access")
    .eq("user_id", user.id)
    .eq("module_key", "invoice_approvals")
    .maybeSingle();
  const isAdmin = role === "admin" || role === "owner";
  const hasModule = isAdmin || Boolean(moduleAccess.data?.can_access) || canView(permissions, "invoice_approvals");
  const invoicePermissions = {
    view: hasModule && canView(permissions, "invoice_approvals"),
    create: hasModule && canCreate(permissions, "invoice_approvals"),
    edit: hasModule && canEdit(permissions, "invoice_approvals"),
    approve: hasModule && canApprove(permissions, "invoice_approvals"),
    export: hasModule && canExport(permissions, "invoice_approvals"),
    manageSettings: hasModule && canManageSettings(permissions, "invoice_approvals"),
  };

  if (!invoicePermissions.view) throw new Error("You do not have access to Invoice Approvals.");

  return {
    admin,
    actor: {
      id: user.id,
      email: String(profileResult.data.email || user.email || ""),
      fullName: String(profileResult.data.full_name || user.email || "TITAN User"),
      role,
    },
    permissions,
    invoicePermissions,
    isAp: isAdmin || (role === "office_admin" && invoicePermissions.create && invoicePermissions.edit),
    isAdmin,
  };
}

export function invoiceCanView(context: InvoiceRequestContext, invoice: Record<string, unknown>) {
  return context.isAp || context.isAdmin || String(invoice.assigned_approver_id || "") === context.actor.id;
}

export function invoiceSchemaMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || error || "");
  const lower = message.toLowerCase();
  return lower.includes("titan_ap_") && (lower.includes("does not exist") || lower.includes("schema cache") || lower.includes("permission denied"));
}

export function invoiceErrorResponse(error: unknown, fallbackStatus = 400) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || error || "Unknown error");
  const lower = message.toLowerCase();
  const status = lower.includes("signed in") || lower.includes("session") ? 401
    : lower.includes("do not have access") || lower.includes("only the assigned") ? 403
      : lower.includes("not found") ? 404
        : fallbackStatus;
  return Response.json({ error: message }, { status });
}
