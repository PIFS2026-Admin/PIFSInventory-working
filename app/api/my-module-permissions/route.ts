import { createClient } from "@supabase/supabase-js";
import {
  applyPermissionOverrides,
  defaultModulesForRole,
  getDefaultPermissionsForRole,
  moduleKeysFromPermissionMap,
  normalizeRole,
} from "../../../lib/modulePermissions";

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase module permission route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function errorMessage(error: any) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function missingTable(error: any, tableName: string) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes(tableName.toLowerCase()) &&
    (message.includes("does not exist") ||
      message.includes("could not find the table") ||
      message.includes("schema cache"))
  );
}

async function readProfile(adminSupabase: ReturnType<typeof configuredSupabase>, userId: string) {
  const richProfile = await adminSupabase
    .from("profiles")
    .select("role, email, full_name, department, company_id, customer_id, is_disabled")
    .eq("id", userId)
    .maybeSingle();

  if (!richProfile.error) return richProfile.data;

  const basicProfile = await adminSupabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (basicProfile.error) throw basicProfile.error;
  return basicProfile.data;
}

export async function GET(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return Response.json({ error: "Missing user session." }, { status: 401 });
    }

    const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);

    if (userError || !userData.user) {
      return Response.json({ error: "Invalid user session." }, { status: 401 });
    }

    const profile = await readProfile(adminSupabase, userData.user.id);
    const role = normalizeRole(profile?.role ?? "customer");

    if (Boolean((profile as any)?.is_disabled)) {
      return Response.json({ error: "This user account is disabled." }, { status: 403 });
    }

    let permissions = getDefaultPermissionsForRole(role);
    let setupRequired = false;

    const overrides = await adminSupabase
      .from("user_permission_overrides")
      .select("module_key, action_key, is_allowed")
      .eq("user_id", userData.user.id);

    if (overrides.error) {
      setupRequired = missingTable(overrides.error, "user_permission_overrides");
      if (!setupRequired) throw overrides.error;
    } else {
      permissions = applyPermissionOverrides(permissions, overrides.data ?? []);
    }

    const moduleRows = await adminSupabase
      .from("user_module_permissions")
      .select("module_key, can_access")
      .eq("user_id", userData.user.id)
      .eq("can_access", true);

    if (moduleRows.error) {
      setupRequired = setupRequired || missingTable(moduleRows.error, "user_module_permissions");
      if (!setupRequired) throw moduleRows.error;
    }

    const savedModuleKeys = moduleRows.error ? [] : (moduleRows.data ?? []).map((row) => row.module_key).filter(Boolean);
    const defaultModuleKeys = moduleKeysFromPermissionMap(permissions);
    const moduleKeys = savedModuleKeys.length > 0 ? savedModuleKeys : defaultModuleKeys.length > 0 ? defaultModuleKeys : defaultModulesForRole(role);

    return Response.json({
      role,
      moduleKeys,
      permissions,
      profile: {
        email: (profile as any)?.email ?? userData.user.email ?? "",
        fullName: (profile as any)?.full_name ?? "",
        department: (profile as any)?.department ?? "",
        companyId: (profile as any)?.company_id ?? "",
        customerId: (profile as any)?.customer_id ?? (profile as any)?.company_id ?? "",
      },
      setupRequired,
      usedDefaults: savedModuleKeys.length === 0,
    });
  } catch (error: any) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
