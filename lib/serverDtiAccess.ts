import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyPermissionOverrides,
  defaultModulesForRole,
  getDefaultPermissionsForRole,
  moduleKeysFromPermissionMap,
  normalizeRole,
} from "./modulePermissions";

type Profile = {
  role?: unknown;
  full_name?: unknown;
  is_disabled?: unknown;
  access_configured?: unknown;
};

type AccessFailure = { error: Response };
type ModuleAccess = { userId: string; fullName: string; moduleKeys: string[] };

function missingTable(error: unknown, tableName: string) {
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return message.includes(tableName.toLowerCase())
    && (message.includes("does not exist") || message.includes("could not find the table") || message.includes("schema cache"));
}

async function readProfile(admin: SupabaseClient, userId: string) {
  const richProfile = await admin
    .from("profiles")
    .select("role,full_name,is_disabled,access_configured")
    .eq("id", userId)
    .maybeSingle();

  if (!richProfile.error) return richProfile.data as Profile | null;

  const basicProfile = await admin
    .from("profiles")
    .select("role,full_name,is_disabled")
    .eq("id", userId)
    .maybeSingle();

  if (basicProfile.error) throw basicProfile.error;
  return basicProfile.data as Profile | null;
}

async function authorizeModuleAccess(
  request: Request,
  admin: SupabaseClient,
  allowedModules: string[],
): Promise<AccessFailure | ModuleAccess> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: Response.json({ error: "You must be signed in." }, { status: 401 }) };

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  }

  const profile = await readProfile(admin, userData.user.id);
  if (!profile || Boolean(profile.is_disabled)) {
    return { error: Response.json({ error: "Your TITAN profile is unavailable or disabled." }, { status: 403 }) };
  }

  const role = normalizeRole(profile.role ?? "customer");
  let permissions = getDefaultPermissionsForRole(role);

  const overrides = await admin
    .from("user_permission_overrides")
    .select("module_key,action_key,is_allowed")
    .eq("user_id", userData.user.id);

  if (overrides.error && !missingTable(overrides.error, "user_permission_overrides")) throw overrides.error;
  if (!overrides.error) permissions = applyPermissionOverrides(permissions, overrides.data ?? []);

  const moduleRows = await admin
    .from("user_module_permissions")
    .select("module_key,can_access")
    .eq("user_id", userData.user.id)
    .eq("can_access", true);

  if (moduleRows.error && !missingTable(moduleRows.error, "user_module_permissions")) throw moduleRows.error;

  const savedModuleKeys = moduleRows.error
    ? []
    : (moduleRows.data ?? []).map((row) => String(row.module_key ?? "")).filter(Boolean);
  const defaultModuleKeys = moduleKeysFromPermissionMap(permissions);
  const accessConfigured = Boolean(profile.access_configured);
  const moduleKeys = accessConfigured
    ? savedModuleKeys
    : savedModuleKeys.length > 0
      ? savedModuleKeys
      : defaultModuleKeys.length > 0
        ? defaultModuleKeys
        : defaultModulesForRole(role);

  if (!allowedModules.some((moduleKey) => moduleKeys.includes(moduleKey))) {
    return { error: Response.json({ error: "You do not have access to this TITAN module." }, { status: 403 }) };
  }

  return {
    userId: userData.user.id,
    fullName: String(profile.full_name ?? "").trim() || userData.user.email || "TITAN User",
    moduleKeys,
  };
}

export async function authorizeDtiAccess(
  request: Request,
  admin: SupabaseClient,
): Promise<AccessFailure | { userId: string; fullName: string }> {
  const authorization = await authorizeModuleAccess(request, admin, ["dti"]);
  if ("error" in authorization) return authorization;
  return { userId: authorization.userId, fullName: authorization.fullName };
}

export async function authorizeConnectedJobAccess(
  request: Request,
  admin: SupabaseClient,
): Promise<AccessFailure | { userId: string; fullName: string; canAccessDti: boolean; canAccessCrm: boolean }> {
  const authorization = await authorizeModuleAccess(request, admin, ["dti", "crm"]);
  if ("error" in authorization) return authorization;
  return {
    userId: authorization.userId,
    fullName: authorization.fullName,
    canAccessDti: authorization.moduleKeys.includes("dti"),
    canAccessCrm: authorization.moduleKeys.includes("crm"),
  };
}
