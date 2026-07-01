import { createClient } from "@supabase/supabase-js";
import {
  allPermissionModuleKeys,
  normalizeRole,
  permissionActions,
  type PermissionAction,
  type PermissionModuleKey,
} from "../../../lib/modulePermissions";

type NotificationPreferenceRow = {
  module_key: string;
  notification_key: string;
  is_enabled: boolean;
};

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin permission route is not configured.");
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

function missingPermissionTables(error: any) {
  const message = errorMessage(error).toLowerCase();
  return (
    (message.includes("user_permission_overrides") ||
      message.includes("role_notification_preferences") ||
      message.includes("user_notification_preferences")) &&
    (message.includes("does not exist") || message.includes("could not find the table") || message.includes("schema cache"))
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

  const role = normalizeRole(profile?.role ?? "");

  if (!["admin", "owner"].includes(role)) {
    return { adminSupabase, error: Response.json({ error: "Admin access is required." }, { status: 403 }) };
  }

  return { adminSupabase, userId: userData.user.id };
}

function cleanOverrides(values: unknown[]) {
  const modules = new Set<string>(allPermissionModuleKeys);
  const actions = new Set<string>(permissionActions);

  return values
    .map((value: any) => ({
      module_key: String(value?.module_key ?? value?.moduleKey ?? ""),
      action_key: String(value?.action_key ?? value?.actionKey ?? ""),
      is_allowed: Boolean(value?.is_allowed ?? value?.isAllowed),
    }))
    .filter(
      (value): value is { module_key: PermissionModuleKey; action_key: PermissionAction; is_allowed: boolean } =>
        modules.has(value.module_key) && actions.has(value.action_key)
    );
}

async function listAll(adminSupabase: ReturnType<typeof configuredSupabase>) {
  const [overrides, roleNotifications, userNotifications] = await Promise.all([
    adminSupabase.from("user_permission_overrides").select("user_id, module_key, action_key, is_allowed, updated_at"),
    adminSupabase.from("role_notification_preferences").select("role_key, module_key, notification_key, is_enabled"),
    adminSupabase.from("user_notification_preferences").select("user_id, module_key, notification_key, is_enabled, updated_at"),
  ]);

  if (overrides.error) throw overrides.error;
  if (roleNotifications.error) throw roleNotifications.error;
  if (userNotifications.error) throw userNotifications.error;

  return {
    overrides: overrides.data ?? [],
    roleNotifications: roleNotifications.data ?? [],
    userNotifications: userNotifications.data ?? [],
  };
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin(request);
    if ("error" in access && access.error) return access.error;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "list");
    const adminSupabase = access.adminSupabase;

    if (action === "list") {
      return Response.json(await listAll(adminSupabase));
    }

    if (action === "save-user-permissions") {
      const targetUserId = String(body.userId ?? "").trim();
      const overrides = cleanOverrides(Array.isArray(body.overrides) ? body.overrides : []);

      if (!targetUserId) {
        return Response.json({ error: "User id is required." }, { status: 400 });
      }

      const { error: deleteError } = await adminSupabase
        .from("user_permission_overrides")
        .delete()
        .eq("user_id", targetUserId);

      if (deleteError) throw deleteError;

      if (overrides.length > 0) {
        const { error: insertError } = await adminSupabase.from("user_permission_overrides").insert(
          overrides.map((override) => ({
            user_id: targetUserId,
            module_key: override.module_key,
            action_key: override.action_key,
            is_allowed: override.is_allowed,
            updated_by: access.userId,
          }))
        );

        if (insertError) throw insertError;
      }

      return Response.json(await listAll(adminSupabase));
    }

    if (action === "save-role-notifications") {
      const roleKey = String(body.roleKey ?? "").trim();
      const preferences = Array.isArray(body.preferences) ? body.preferences : [];

      if (!roleKey) {
        return Response.json({ error: "Role is required." }, { status: 400 });
      }

      const rows: Array<NotificationPreferenceRow & { role_key: string }> = preferences
        .map((preference: any) => ({
          role_key: roleKey,
          module_key: String(preference?.module_key ?? preference?.moduleKey ?? ""),
          notification_key: String(preference?.notification_key ?? preference?.notificationKey ?? ""),
          is_enabled: Boolean(preference?.is_enabled ?? preference?.isEnabled),
        }))
        .filter((preference: NotificationPreferenceRow) => preference.module_key && preference.notification_key);

      const { error: deleteError } = await adminSupabase
        .from("role_notification_preferences")
        .delete()
        .eq("role_key", roleKey);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const { error: insertError } = await adminSupabase.from("role_notification_preferences").insert(rows);
        if (insertError) throw insertError;
      }

      return Response.json(await listAll(adminSupabase));
    }

    if (action === "save-user-notifications") {
      const targetUserId = String(body.userId ?? "").trim();
      const preferences = Array.isArray(body.preferences) ? body.preferences : [];

      if (!targetUserId) {
        return Response.json({ error: "User id is required." }, { status: 400 });
      }

      const rows: Array<NotificationPreferenceRow & { user_id: string }> = preferences
        .map((preference: any) => ({
          user_id: targetUserId,
          module_key: String(preference?.module_key ?? preference?.moduleKey ?? ""),
          notification_key: String(preference?.notification_key ?? preference?.notificationKey ?? ""),
          is_enabled: Boolean(preference?.is_enabled ?? preference?.isEnabled),
        }))
        .filter((preference: NotificationPreferenceRow) => preference.module_key && preference.notification_key);

      const { error: deleteError } = await adminSupabase
        .from("user_notification_preferences")
        .delete()
        .eq("user_id", targetUserId);

      if (deleteError) throw deleteError;

      if (rows.length > 0) {
        const { error: insertError } = await adminSupabase.from("user_notification_preferences").insert(rows);
        if (insertError) throw insertError;
      }

      return Response.json(await listAll(adminSupabase));
    }

    return Response.json({ error: "Unknown permission action." }, { status: 400 });
  } catch (error: any) {
    if (missingPermissionTables(error)) {
      return Response.json(
        {
          error:
            "Permission tables are missing. Run supabase/role_permission_system.sql in Supabase SQL Editor, then refresh.",
          setupRequired: true,
        },
        { status: 400 }
      );
    }

    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
