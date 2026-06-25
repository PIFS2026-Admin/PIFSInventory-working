import { createClient } from "@supabase/supabase-js";
import { cleanModuleKeys, defaultModulesForRole } from "../../../lib/modulePermissions";

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin module permission route is not configured.");
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

async function requireAdmin(request: Request) {
  const adminSupabase = configuredSupabase();
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { adminSupabase, error: Response.json({ error: "Missing user session." }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { adminSupabase, error: Response.json({ error: "Invalid user session." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const role = String(profile?.role ?? "").toLowerCase();

  if (!["admin", "employee"].includes(role)) {
    return { adminSupabase, error: Response.json({ error: "Admin access is required." }, { status: 403 }) };
  }

  return { adminSupabase, userId: userData.user.id, role };
}

async function listPermissions(adminSupabase: ReturnType<typeof configuredSupabase>) {
  const { data, error } = await adminSupabase
    .from("user_module_permissions")
    .select("id, user_id, module_key, can_access")
    .order("module_key", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin(request);
    if ("error" in access && access.error) return access.error;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "list");
    const adminSupabase = access.adminSupabase;

    if (action === "list") {
      try {
        return Response.json({ permissions: await listPermissions(adminSupabase) });
      } catch (error: any) {
        if (missingPermissionsTable(error)) {
          return Response.json({
            permissions: [],
            setupRequired: true,
            setupMessage:
              "User module permissions table is missing. Run supabase/user_module_permissions.sql in Supabase SQL Editor, then refresh this page.",
          });
        }

        throw error;
      }
    }

    if (action === "save-user-modules") {
      const targetUserId = String(body.userId ?? "").trim();
      const requestedModuleKeys = cleanModuleKeys(Array.isArray(body.moduleKeys) ? body.moduleKeys : []);

      if (!targetUserId) {
        return Response.json({ error: "User id is required." }, { status: 400 });
      }

      const { data: targetProfile } = await adminSupabase
        .from("profiles")
        .select("role")
        .eq("id", targetUserId)
        .maybeSingle();

      const moduleKeys =
        requestedModuleKeys.length > 0
          ? requestedModuleKeys
          : defaultModulesForRole(String(targetProfile?.role ?? "customer"));

      const { error: deleteError } = await adminSupabase
        .from("user_module_permissions")
        .delete()
        .eq("user_id", targetUserId);

      if (deleteError) throw deleteError;

      if (moduleKeys.length > 0) {
        const { error: insertError } = await adminSupabase.from("user_module_permissions").insert(
          moduleKeys.map((moduleKey) => ({
            user_id: targetUserId,
            module_key: moduleKey,
            can_access: true,
          }))
        );

        if (insertError) throw insertError;
      }

      return Response.json({ permissions: await listPermissions(adminSupabase) });
    }

    return Response.json({ error: "Unknown module permission action." }, { status: 400 });
  } catch (error: any) {
    const status = missingPermissionsTable(error) ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
