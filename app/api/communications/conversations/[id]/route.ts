import { createClient } from "@supabase/supabase-js";
import { normalizeRole } from "../../../../../lib/modulePermissions";

type ConversationRow = {
  id: string;
  conversation_type: string;
  name: string;
  created_by: string | null;
};

type MemberRow = {
  user_id: string;
  is_admin: boolean | null;
  removed_at: string | null;
};

type AttachmentRow = {
  file_path: string;
  storage_bucket: string | null;
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
    const conversationId = context.params.id;

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
    const isSystemAdmin = ["admin", "owner"].includes(role);
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

    const { data: conversation, error: conversationError } = await adminSupabase
      .from("conversations")
      .select("id, conversation_type, name, created_by")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) return Response.json({ error: "Conversation was not found." }, { status: 404 });

    const conversationRow = conversation as ConversationRow;

    if (!canModerateCommunications && !["group", "direct"].includes(conversationRow.conversation_type)) {
      return Response.json({ error: "Only managers can delete system-created channels." }, { status: 400 });
    }

    const { data: member, error: memberError } = await adminSupabase
      .from("conversation_members")
      .select("user_id, is_admin, removed_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (memberError) throw memberError;

    const memberRow = member as MemberRow | null;
    const isActiveMember = Boolean(memberRow && !memberRow.removed_at);

    if (conversationRow.conversation_type === "direct" && !isActiveMember) {
      return Response.json({ error: "Direct messages are only available to their participants." }, { status: 403 });
    }

    const canDelete =
      conversationRow.conversation_type === "direct"
        ? conversationRow.created_by === userData.user.id || Boolean(memberRow?.is_admin)
        : isSystemAdmin ||
          canModerateCommunications ||
          conversationRow.created_by === userData.user.id ||
          (Boolean(memberRow?.is_admin) && isActiveMember);

    if (!canDelete) {
      return Response.json({ error: "Only group admins or TITAN admins can delete this conversation." }, { status: 403 });
    }

    const { data: attachments, error: attachmentError } = await adminSupabase
      .from("message_attachments")
      .select("file_path, storage_bucket")
      .eq("conversation_id", conversationId);

    if (attachmentError) throw attachmentError;

    const filesByBucket = new Map<string, string[]>();
    ((attachments ?? []) as AttachmentRow[]).forEach((attachment) => {
      const bucket = attachment.storage_bucket || "communication-attachments";
      const paths = filesByBucket.get(bucket) ?? [];
      paths.push(attachment.file_path);
      filesByBucket.set(bucket, paths);
    });

    for (const [bucket, paths] of filesByBucket) {
      if (paths.length > 0) {
        await adminSupabase.storage.from(bucket).remove(paths);
      }
    }

    const { error: deleteError } = await adminSupabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (deleteError) throw deleteError;

    return Response.json({ ok: true });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
