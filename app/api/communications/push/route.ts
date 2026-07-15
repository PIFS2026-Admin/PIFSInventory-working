import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { normalizeRole } from "../../../../lib/modulePermissions";

export const runtime = "nodejs";

type Priority = "normal" | "important" | "urgent";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  priority: Priority;
};

type ConversationRow = {
  id: string;
  name: string;
  conversation_type: string;
};

type MemberRow = {
  user_id: string;
  muted: boolean | null;
  urgent_only: boolean | null;
  removed_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_disabled: boolean | null;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string | null;
  auth_secret: string | null;
};

type WebPushFailure = Error & {
  statusCode?: number;
};

const defaultVapidSubject = "mailto:notifications@pifstitan.com";

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
    throw new Error("Supabase communications push route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function validVapidSubject(value: string) {
  const subject = value.trim();
  if (/^(mailto:|https?:\/\/)/i.test(subject)) return subject;
  return defaultVapidSubject;
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = validVapidSubject(process.env.VAPID_SUBJECT || defaultVapidSubject);

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
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

  return data.user;
}

function senderName(profile: ProfileRow | null, fallbackEmail: string | undefined) {
  return profile?.full_name || profile?.email || fallbackEmail || "TITAN user";
}

function bodyPreview(message: MessageRow, hasAttachment: boolean) {
  const text = String(message.body ?? "").trim();
  if (text) return text.slice(0, 180);
  return hasAttachment ? "Sent an attachment." : "Sent a message.";
}

function recipientAllowed(member: MemberRow, profile: ProfileRow | undefined, priority: Priority) {
  if (!profile || Boolean(profile.is_disabled)) return false;
  if (normalizeRole(profile.role) === "customer") return false;
  if (member.muted) return false;
  if (member.urgent_only && !["important", "urgent"].includes(priority)) return false;
  return true;
}

export async function POST(request: Request) {
  try {
    const adminClient = configuredSupabase();
    const user = await getVerifiedUser(request, adminClient);
    const body = await request.json().catch(() => ({}));
    const messageId = String((body as { messageId?: unknown }).messageId ?? "").trim();

    if (!messageId) {
      return Response.json({ error: "Message id is required." }, { status: 400 });
    }

    if (!configureWebPush()) {
      return Response.json({
        ok: true,
        configured: false,
        sent: 0,
        warning: "VAPID keys are not configured.",
      });
    }

    const { data: message, error: messageError } = await adminClient
      .from("messages")
      .select("id, conversation_id, sender_id, body, priority")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError) throw messageError;
    if (!message) {
      return Response.json({ error: "Message was not found." }, { status: 404 });
    }

    const messageRow = message as MessageRow;
    if (messageRow.sender_id !== user.id) {
      return Response.json({ error: "You can only send push notifications for your own messages." }, { status: 403 });
    }

    const [conversationResult, senderProfileResult, attachmentResult, memberResult] = await Promise.all([
      adminClient
        .from("conversations")
        .select("id, name, conversation_type")
        .eq("id", messageRow.conversation_id)
        .maybeSingle(),
      adminClient.from("profiles").select("id, full_name, email, role, is_disabled").eq("id", user.id).maybeSingle(),
      adminClient.from("message_attachments").select("id", { count: "exact", head: true }).eq("message_id", messageRow.id),
      adminClient
        .from("conversation_members")
        .select("user_id, muted, urgent_only, removed_at")
        .eq("conversation_id", messageRow.conversation_id)
        .is("removed_at", null)
        .neq("user_id", user.id),
    ]);

    if (conversationResult.error) throw conversationResult.error;
    if (senderProfileResult.error) throw senderProfileResult.error;
    if (attachmentResult.error) throw attachmentResult.error;
    if (memberResult.error) throw memberResult.error;

    const conversation = conversationResult.data as ConversationRow | null;
    const senderProfile = senderProfileResult.data as ProfileRow | null;
    const members = (memberResult.data ?? []) as MemberRow[];

    if (!conversation) {
      return Response.json({ error: "Conversation was not found." }, { status: 404 });
    }

    if (!senderProfile || Boolean(senderProfile.is_disabled) || normalizeRole(senderProfile.role) === "customer") {
      return Response.json({ error: "Communications push is only available to internal TITAN users." }, { status: 403 });
    }

    const memberIds = Array.from(new Set(members.map((member) => member.user_id).filter(Boolean)));
    if (memberIds.length === 0) {
      return Response.json({ ok: true, configured: true, attempted: 0, sent: 0, expired: 0 });
    }

    const [profilesResult, subscriptionResult] = await Promise.all([
      adminClient.from("profiles").select("id, full_name, email, role, is_disabled").in("id", memberIds),
      adminClient
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth_secret")
        .in("user_id", memberIds)
        .eq("is_active", true),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (subscriptionResult.error) throw subscriptionResult.error;

    const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile as ProfileRow]));
    const allowedRecipientIds = new Set(
      members
        .filter((member) => recipientAllowed(member, profilesById.get(member.user_id), messageRow.priority))
        .map((member) => member.user_id)
    );

    const subscriptions = ((subscriptionResult.data ?? []) as PushSubscriptionRow[]).filter((subscription) => {
      return allowedRecipientIds.has(subscription.user_id) && subscription.endpoint && subscription.p256dh && subscription.auth_secret;
    });

    if (subscriptions.length === 0) {
      return Response.json({ ok: true, configured: true, attempted: 0, sent: 0, expired: 0 });
    }

    const payload = JSON.stringify({
      title: conversation.name || "TITAN Communications",
      body: `${senderName(senderProfile, user.email)}: ${bodyPreview(messageRow, Number(attachmentResult.count ?? 0) > 0)}`,
      url: `/communications?conversation=${encodeURIComponent(conversation.id)}`,
      tag: `communications-${conversation.id}`,
      conversationId: conversation.id,
      messageId: messageRow.id,
      priority: messageRow.priority,
    });

    let sent = 0;
    const expiredIds: string[] = [];

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh ?? "",
                auth: subscription.auth_secret ?? "",
              },
            },
            payload,
            {
              TTL: 60 * 60 * 8,
              urgency: messageRow.priority === "urgent" ? "high" : "normal",
            }
          );
          sent += 1;
        } catch (error: unknown) {
          const failure = error as WebPushFailure;
          if (failure.statusCode === 404 || failure.statusCode === 410) {
            expiredIds.push(subscription.id);
          }
        }
      })
    );

    if (expiredIds.length > 0) {
      await adminClient
        .from("push_subscriptions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", expiredIds);
    }

    return Response.json({
      ok: true,
      configured: true,
      attempted: subscriptions.length,
      sent,
      expired: expiredIds.length,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const status = message.toLowerCase().includes("session") ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
