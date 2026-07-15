import { createClient } from "@supabase/supabase-js";
import { normalizeRole } from "../../../../lib/modulePermissions";

type ConversationRow = {
  id: string;
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

export async function DELETE(request: Request) {
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
      .select("role, is_disabled")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const role = normalizeRole(profile?.role);
    const canReset = [
      "admin",
      "owner",
      "service_line_manager",
      "dti_superintendent",
      "yard_manager",
      "inventory_manager",
      "office_admin",
    ].includes(role);

    if (!canReset || role === "customer" || Boolean(profile?.is_disabled)) {
      return Response.json({ error: "You do not have permission to reset Communications groups." }, { status: 403 });
    }

    const { data: conversations, error: conversationError } = await adminSupabase
      .from("conversations")
      .select("id")
      .neq("conversation_type", "direct");

    if (conversationError) throw conversationError;

    const conversationIds = ((conversations ?? []) as ConversationRow[]).map((conversation) => conversation.id);

    if (conversationIds.length === 0) {
      return Response.json({ ok: true, deleted: 0 });
    }

    const { data: attachments, error: attachmentError } = await adminSupabase
      .from("message_attachments")
      .select("file_path, storage_bucket")
      .in("conversation_id", conversationIds);

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
      .in("id", conversationIds);

    if (deleteError) throw deleteError;

    return Response.json({ ok: true, deleted: conversationIds.length });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
