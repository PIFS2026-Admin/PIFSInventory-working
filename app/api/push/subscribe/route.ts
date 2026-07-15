import { createClient } from "@supabase/supabase-js";
import { normalizeRole } from "../../../../lib/modulePermissions";

type BrowserPushSubscription = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

function getErrorMessage(error: unknown) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message.trim()) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase push subscription route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function getVerifiedUser(request: Request, adminClient: ReturnType<typeof configuredSupabase>) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("Missing user session.");
  }

  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid user session.");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, is_disabled")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new Error("Your TITAN profile could not be loaded.");
  if (Boolean(profile.is_disabled) || normalizeRole(profile.role) === "customer") {
    throw new Error("Communications push notifications are only available to internal TITAN users.");
  }

  return data.user;
}

function parseSubscription(value: unknown) {
  const subscription = value as BrowserPushSubscription;
  const endpoint = String(subscription?.endpoint ?? "").trim();
  const p256dh = String(subscription?.keys?.p256dh ?? "").trim();
  const authSecret = String(subscription?.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !authSecret) {
    throw new Error("A valid browser push subscription is required.");
  }

  return { endpoint, p256dh, authSecret };
}

export async function POST(request: Request) {
  try {
    const adminClient = configuredSupabase();
    const user = await getVerifiedUser(request, adminClient);
    const body = await request.json().catch(() => ({}));
    const subscription = parseSubscription((body as { subscription?: unknown }).subscription);
    const userAgent = String((body as { userAgent?: unknown }).userAgent ?? request.headers.get("user-agent") ?? "")
      .trim()
      .slice(0, 500);

    const { error } = await adminClient.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth_secret: subscription.authSecret,
        user_agent: userAgent || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const status = message.toLowerCase().includes("session") ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const adminClient = configuredSupabase();
    const user = await getVerifiedUser(request, adminClient);
    const body = await request.json().catch(() => ({}));
    const endpoint = String((body as { endpoint?: unknown }).endpoint ?? "").trim();

    if (!endpoint) {
      return Response.json({ error: "Subscription endpoint is required." }, { status: 400 });
    }

    const { error } = await adminClient
      .from("push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const status = message.toLowerCase().includes("session") ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
