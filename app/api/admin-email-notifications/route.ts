import { createClient } from "@supabase/supabase-js";

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin email notification route is not configured.");
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

function missingEmailTables(error: any) {
  const message = errorMessage(error).toLowerCase();
  return (
    (message.includes("email_notification_types") || message.includes("email_notification_recipients")) &&
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

  if (!["admin", "administrator"].includes(role)) {
    return { adminSupabase, error: Response.json({ error: "Admin access is required." }, { status: 403 }) };
  }

  return { adminSupabase, userId: userData.user.id, role };
}

async function listSettings(adminSupabase: ReturnType<typeof configuredSupabase>) {
  const { data: notificationTypes, error: typeError } = await adminSupabase
    .from("email_notification_types")
    .select("id, notification_key, name, description, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (typeError) throw typeError;

  const { data: notificationRecipients, error: recipientError } = await adminSupabase
    .from("email_notification_recipients")
    .select("id, notification_type_id, user_id, enabled");

  if (recipientError) throw recipientError;

  const { data: profiles, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, full_name, email, role")
    .order("full_name", { ascending: true });

  if (profileError) throw profileError;

  const users = (profiles ?? []).map((profile: any) => ({
    id: profile.id,
    full_name: profile.full_name ?? "",
    email: profile.email ?? "",
    role: profile.role ?? "",
  }));

  return {
    notificationTypes: notificationTypes ?? [],
    notificationRecipients: notificationRecipients ?? [],
    users,
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
      try {
        return Response.json(await listSettings(adminSupabase));
      } catch (error: any) {
        if (missingEmailTables(error)) {
          return Response.json({
            notificationTypes: [],
            notificationRecipients: [],
            users: [],
            setupRequired: true,
            setupMessage:
              "Admin email notification tables are missing. Run supabase/admin_security_and_notifications.sql in Supabase SQL Editor, then refresh this page.",
          });
        }

        throw error;
      }
    }

    if (action === "save-recipients") {
      const notificationTypeId = String(body.notificationTypeId ?? "").trim();
      const userIds: string[] = Array.isArray(body.userIds)
        ? body.userIds.map((userId: unknown) => String(userId).trim()).filter(Boolean)
        : [];

      if (!notificationTypeId) {
        return Response.json({ error: "Notification type is required." }, { status: 400 });
      }

      const { error: deleteError } = await adminSupabase
        .from("email_notification_recipients")
        .delete()
        .eq("notification_type_id", notificationTypeId);

      if (deleteError) throw deleteError;

      if (userIds.length > 0) {
        const { error: insertError } = await adminSupabase
          .from("email_notification_recipients")
          .insert(
            userIds.map((userId) => ({
              notification_type_id: notificationTypeId,
              user_id: userId,
              enabled: true,
            })),
          );

        if (insertError) throw insertError;
      }

      return Response.json(await listSettings(adminSupabase));
    }

    return Response.json({ error: "Unknown email notification action." }, { status: 400 });
  } catch (error: any) {
    const status = missingEmailTables(error) ? 400 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
