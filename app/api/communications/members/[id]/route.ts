import { createClient } from "@supabase/supabase-js";
import { normalizeRole } from "../../../../../lib/modulePermissions";

type MemberRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  is_admin: boolean | null;
  removed_at: string | null;
  conversations: {
    id: string;
    conversation_type: string;
    created_by: string | null;
  } | null;
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
    const memberId = context.params.id;

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
    const canModerateCommunications = [
      "admin",
      "owner",
      "service_line_manager",
      "dti_superintendent",
      "yard_manager",
      "inventory_manager",
      "office_admin",
    ].includes(role);

    if (role === "customer" || Boolean(profile?.is_disabled)) {
      return Response.json({ error: "Communications is only available to internal TITAN users." }, { status: 403 });
    }

    const { data: member, error: memberError } = await adminSupabase
      .from("conversation_members")
      .select("id, conversation_id, user_id, is_admin, removed_at, conversations(id, conversation_type, created_by)")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member) return Response.json({ error: "Member was not found." }, { status: 404 });

    const memberRow = member as unknown as MemberRow;

    if (memberRow.user_id === userData.user.id) {
      return Response.json({ error: "Use Leave to remove yourself from a group." }, { status: 400 });
    }

    if (memberRow.conversations?.conversation_type === "direct") {
      return Response.json({ error: "Direct messages do not support member removal." }, { status: 400 });
    }

    const { data: requesterMember, error: requesterMemberError } = await adminSupabase
      .from("conversation_members")
      .select("is_admin, removed_at")
      .eq("conversation_id", memberRow.conversation_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (requesterMemberError) throw requesterMemberError;

    const canRemove =
      canModerateCommunications ||
      memberRow.conversations?.created_by === userData.user.id ||
      (Boolean(requesterMember?.is_admin) && !requesterMember?.removed_at);

    if (!canRemove) {
      return Response.json({ error: "Only group admins or TITAN managers can remove members." }, { status: 403 });
    }

    const { error: updateError } = await adminSupabase
      .from("conversation_members")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", memberId);

    if (updateError) throw updateError;

    return Response.json({ ok: true });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
