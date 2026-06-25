import { createClient } from "@supabase/supabase-js";
import { defaultModulesForRole } from "../../../lib/modulePermissions";

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

function missingPermissionsTable(error: any) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("user_module_permissions") &&
    (message.includes("does not exist") ||
      message.includes("could not find the table") ||
      message.includes("schema cache"))
  );
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

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const role = String(profile?.role ?? "customer").toLowerCase();

    if (role === "admin") {
      return Response.json({ role, moduleKeys: defaultModulesForRole(role), usedDefaults: true });
    }

    const { data, error } = await adminSupabase
      .from("user_module_permissions")
      .select("module_key, can_access")
      .eq("user_id", userData.user.id)
      .eq("can_access", true);

    if (error) {
      if (missingPermissionsTable(error)) {
        return Response.json({
          role,
          moduleKeys: defaultModulesForRole(role),
          setupRequired: true,
          usedDefaults: true,
        });
      }

      throw error;
    }

    const moduleKeys = (data ?? []).map((row) => row.module_key).filter(Boolean);
    return Response.json({
      role,
      moduleKeys: moduleKeys.length > 0 ? moduleKeys : defaultModulesForRole(role),
      usedDefaults: moduleKeys.length === 0,
    });
  } catch (error: any) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
