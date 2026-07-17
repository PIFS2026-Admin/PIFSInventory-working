import { createClient } from "@supabase/supabase-js";
import { normalizeRole } from "../../../../../lib/modulePermissions";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  deleted_at: string | null;
};

type MemberRow = {
  is_admin: boolean | null;
  removed_at: string | null;
};

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Communications route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function errorMessage(error: unknown) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message.trim()) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

export async function DELETE(request: Request, context: { params: { id: string } }) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    const messageId = context.params.id;

    if (!token) {
      return Response.json({ error: "Missing user session." }, { status: 401 });
    }

    const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);

    if (userError || !userData.user) {
      return Response.json({ error: "Invalid user session." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role, is_disabled")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const role = normalizeRole(profile?.role);
    const isTitanAdmin = ["admin", "owner"].includes(role);

    if (role === "customer" || Boolean(profile?.is_disabled)) {
      return Response.json({ error: "Communications is only available to internal TITAN users." }, { status: 403 });
    }

    const { data: message, error: messageError } = await adminSupabase
      .from("messages")
      .select("id, conversation_id, sender_id, deleted_at")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError) throw messageError;
    if (!message) return Response.json({ error: "Message was not found." }, { status: 404 });

    const messageRow = message as MessageRow;

    const { data: member, error: memberError } = await adminSupabase
      .from("conversation_members")
      .select("is_admin, removed_at")
      .eq("conversation_id", messageRow.conversation_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (memberError) throw memberError;

    const memberRow = member as MemberRow | null;
    const isConversationAdmin = Boolean(memberRow?.is_admin && !memberRow.removed_at);
    const isSender = messageRow.sender_id === userData.user.id;

    if (!isSender && !isTitanAdmin && !isConversationAdmin) {
      return Response.json({ error: "Only admins or the sender can delete messages." }, { status: 403 });
    }

    if (messageRow.deleted_at) {
      return Response.json({ ok: true });
    }

    const { error: updateError } = await adminSupabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString(), body: "Message deleted." })
      .eq("id", messageId);

    if (updateError) throw updateError;

    return Response.json({ ok: true });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
