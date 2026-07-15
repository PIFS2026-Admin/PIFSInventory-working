"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NotificationCenter from "../../components/NotificationCenter";
import {
  canApprove,
  canCreate,
  canDelete,
  canExport,
  canManageSettings,
  canView,
  defaultModulesForRole,
} from "../../lib/modulePermissions";
import type { PermissionMap } from "../../lib/modulePermissions";
import { supabase } from "../../lib/supabase";

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
};

type Contact = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  branch: string;
  account: "employee";
};

type Yard = {
  id: string;
  name: string;
  code: string;
};

type ConversationType = "group" | "direct" | "announcement" | "yard" | "department";
type Priority = "normal" | "important" | "urgent";
type ModeKey = "groups" | "directs" | "announcements";

type Conversation = {
  id: string;
  conversation_key: string | null;
  name: string;
  conversation_type: ConversationType;
  yard_id: string | null;
  department: string | null;
  topic: string | null;
  color: string;
  priority: string;
  is_archived: boolean;
  is_locked: boolean;
  created_by: string | null;
  updated_at: string;
};

type Member = {
  id: string;
  conversation_id: string;
  user_id: string;
  is_admin: boolean;
  muted: boolean;
  urgent_only: boolean;
  safety_override: boolean;
  last_read_at: string | null;
  removed_at: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  priority: Priority;
  reply_to_message_id: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
};

type Attachment = {
  id: string;
  message_id: string;
  conversation_id: string;
  uploaded_by: string;
  storage_bucket: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
};

type Reaction = {
  message_id: string;
  user_id: string;
  reaction: string;
};

type Acknowledgement = {
  message_id: string;
  user_id: string;
};

type CommunicationTask = {
  id: string;
  source_message_id: string;
  conversation_id: string;
  owner_id: string | null;
  title: string;
  status: string;
};

const modes: Array<{ key: ModeKey; label: string; types: ConversationType[] }> = [
  { key: "groups", label: "Groups", types: ["group", "yard", "department"] },
  { key: "directs", label: "DMs", types: ["direct"] },
  { key: "announcements", label: "Alerts", types: ["announcement"] },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

function displayRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
}

function includesText(values: Array<string | null | undefined>, query: string) {
  const haystack = values.join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function modeForConversationType(type: ConversationType): ModeKey {
  if (type === "direct") return "directs";
  if (type === "announcement") return "announcements";
  return "groups";
}

export default function CommunicationsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [activeYardId, setActiveYardId] = useState("");
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [acks, setAcks] = useState<Acknowledgement[]>([]);
  const [tasks, setTasks] = useState<CommunicationTask[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<ModeKey>("groups");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [mentionFilter, setMentionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [newOpen, setNewOpen] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMembers, setNewMembers] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [memberLookup, setMemberLookup] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState<Priority>("normal");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busyConversationId, setBusyConversationId] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canUseCommunications = canView(permissions, "communications");
  const canCreateConversations = canCreate(permissions, "communications");
  const canModerate = canManageSettings(permissions, "communications") || canApprove(permissions, "communications");
  const canExportLogs = canExport(permissions, "communications");
  const canDeleteMessages = canDelete(permissions, "communications");

  const contactById = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((contact) => map.set(contact.id, contact));
    if (currentUser) {
      map.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        department: currentUser.department,
        branch: "all",
        account: "employee",
      });
    }
    return map;
  }, [contacts, currentUser]);

  const membersByConversation = useMemo(() => {
    const map = new Map<string, Member[]>();
    members.forEach((member) => {
      if (member.removed_at) return;
      const list = map.get(member.conversation_id) ?? [];
      list.push(member);
      map.set(member.conversation_id, list);
    });
    return map;
  }, [members]);

  const messagesByConversation = useMemo(() => {
    const map = new Map<string, Message[]>();
    messages
      .filter((item) => !item.deleted_at)
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
      .forEach((item) => {
        const list = map.get(item.conversation_id) ?? [];
        list.push(item);
        map.set(item.conversation_id, list);
      });
    return map;
  }, [messages]);

  const selectedConversation = useMemo(() => {
    return conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0] ?? null;
  }, [conversations, selectedId]);

  const currentMember = useMemo(() => {
    if (!currentUser || !selectedConversation) return null;
    return (
      membersByConversation
        .get(selectedConversation.id)
        ?.find((member) => member.user_id === currentUser.id) ?? null
    );
  }, [currentUser, membersByConversation, selectedConversation]);

  const canManageSelected = Boolean(canModerate || currentMember?.is_admin);

  const unreadForConversation = useCallback(
    (conversation: Conversation) => {
      if (!currentUser) return 0;
      const member = membersByConversation.get(conversation.id)?.find((item) => item.user_id === currentUser.id);
      const lastRead = member?.last_read_at ? new Date(member.last_read_at).getTime() : 0;
      return (messagesByConversation.get(conversation.id) ?? []).filter((item) => {
        return item.sender_id !== currentUser.id && new Date(item.created_at).getTime() > lastRead;
      }).length;
    },
    [currentUser, membersByConversation, messagesByConversation]
  );

  const visibleConversations = useMemo(() => {
    const modeDef = modes.find((item) => item.key === mode) ?? modes[0];
    const query = search.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (!modeDef.types.includes(conversation.conversation_type)) return false;
      if (statusFilter === "active" && conversation.is_archived) return false;
      if (statusFilter === "archived" && !conversation.is_archived) return false;
      if (activeYardId && conversation.yard_id && conversation.yard_id !== activeYardId) return false;

      const convMessages = messagesByConversation.get(conversation.id) ?? [];
      const unread = unreadForConversation(conversation);

      if (priorityFilter !== "all" && !convMessages.some((item) => item.priority === priorityFilter)) return false;
      if (mentionFilter === "unread" && unread === 0) return false;
      if (mentionFilter === "me" && currentUser && !convMessages.some((item) => item.body?.includes(`@${currentUser.name.split(" ")[0]}`))) return false;

      if (!query) return true;
      const memberNames = (membersByConversation.get(conversation.id) ?? [])
        .map((member) => contactById.get(member.user_id)?.name ?? "")
        .join(" ");
      const lastText = convMessages[convMessages.length - 1]?.body ?? "";
      return includesText([conversation.name, conversation.topic, conversation.department, memberNames, lastText], query);
    });
  }, [
    activeYardId,
    contactById,
    conversations,
    currentUser,
    membersByConversation,
    mentionFilter,
    messagesByConversation,
    mode,
    priorityFilter,
    search,
    statusFilter,
    unreadForConversation,
  ]);

  const selectedMessages = useMemo(() => {
    return selectedConversation ? messagesByConversation.get(selectedConversation.id) ?? [] : [];
  }, [messagesByConversation, selectedConversation]);

  const selectedTasks = useMemo(() => {
    if (!selectedConversation) return [];
    return tasks.filter((task) => task.conversation_id === selectedConversation.id);
  }, [selectedConversation, tasks]);

  const conversationAttachments = useMemo(() => {
    const map = new Map<string, Attachment[]>();
    attachments.forEach((attachment) => {
      const list = map.get(attachment.message_id) ?? [];
      list.push(attachment);
      map.set(attachment.message_id, list);
    });
    return map;
  }, [attachments]);

  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    messages.forEach((item) => map.set(item.id, item));
    return map;
  }, [messages]);

  useEffect(() => {
    if (loading || visibleConversations.length === 0) return;
    if (selectedConversation && visibleConversations.some((conversation) => conversation.id === selectedConversation.id)) return;
    const timer = window.setTimeout(() => {
      setSelectedId(visibleConversations[0].id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loading, selectedConversation, visibleConversations]);

  const loadData = useCallback(async () => {
    setMessage("");

    const { data: conversationRows, error: conversationError } = await supabase
      .from("conversations")
      .select("id, conversation_key, name, conversation_type, yard_id, department, topic, color, priority, is_archived, is_locked, created_by, updated_at")
      .order("updated_at", { ascending: false });

    if (conversationError) {
      const text = conversationError.message || "";
      setSetupRequired(text.toLowerCase().includes("conversation"));
      setMessage(text);
      return;
    }

    const conversationList = (conversationRows ?? []) as Conversation[];
    const conversationIds = conversationList.map((conversation) => conversation.id);

    setConversations(conversationList);

    const requestedId =
      typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("conversation") ?? "";
    const requestedConversation = requestedId
      ? conversationList.find((conversation) => conversation.id === requestedId)
      : null;

    if (requestedConversation && requestedConversation.id !== selectedId) {
      setSelectedId(requestedConversation.id);
      setMode(modeForConversationType(requestedConversation.conversation_type));
      setMobileThreadOpen(true);
    } else if (!selectedId && conversationList[0]) {
      setSelectedId(conversationList[0].id);
      setMode(modeForConversationType(conversationList[0].conversation_type));
    }

    if (conversationIds.length === 0) {
      setMembers([]);
      setMessages([]);
      setAttachments([]);
      setReactions([]);
      setAcks([]);
      setTasks([]);
      return;
    }

    const [memberResult, messageResult, taskResult] = await Promise.all([
      supabase
        .from("conversation_members")
        .select("id, conversation_id, user_id, is_admin, muted, urgent_only, safety_override, last_read_at, removed_at")
        .in("conversation_id", conversationIds),
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, priority, reply_to_message_id, status, deleted_at, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true })
        .limit(1000),
      supabase
        .from("communication_tasks")
        .select("id, source_message_id, conversation_id, owner_id, title, status")
        .in("conversation_id", conversationIds),
    ]);

    if (memberResult.error) throw memberResult.error;
    if (messageResult.error) throw messageResult.error;
    if (taskResult.error) throw taskResult.error;

    const messageList = (messageResult.data ?? []) as Message[];
    const messageIds = messageList.map((item) => item.id);

    setMembers((memberResult.data ?? []) as Member[]);
    setMessages(messageList);
    setTasks((taskResult.data ?? []) as CommunicationTask[]);

    if (messageIds.length === 0) {
      setAttachments([]);
      setReactions([]);
      setAcks([]);
      return;
    }

    const [attachmentResult, reactionResult, ackResult] = await Promise.all([
      supabase
        .from("message_attachments")
        .select("id, message_id, conversation_id, uploaded_by, storage_bucket, file_path, file_name, file_type, file_size")
        .in("message_id", messageIds),
      supabase.from("message_reactions").select("message_id, user_id, reaction").in("message_id", messageIds),
      supabase.from("message_acknowledgements").select("message_id, user_id").in("message_id", messageIds),
    ]);

    if (attachmentResult.error) throw attachmentResult.error;
    if (reactionResult.error) throw reactionResult.error;
    if (ackResult.error) throw ackResult.error;

    setAttachments((attachmentResult.data ?? []) as Attachment[]);
    setReactions((reactionResult.data ?? []) as Reaction[]);
    setAcks((ackResult.data ?? []) as Acknowledgement[]);
  }, [selectedId]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setMessage("Loading Communications...");

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      window.location.href = "/login";
      return;
    }

    const accessResponse = await fetch("/api/my-module-permissions", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const accessData = await accessResponse.json().catch(() => ({}));
    const role = String(accessData.role ?? "customer");
    const moduleKeys: string[] = Array.isArray(accessData.moduleKeys)
      ? accessData.moduleKeys
      : defaultModulesForRole(role);
    const permissionMap = (accessData.permissions ?? null) as PermissionMap | null;

    if (!moduleKeys.includes("communications") || !canView(permissionMap, "communications")) {
      setPermissions(permissionMap);
      setMessage("You do not have permission to open Communications.");
      setLoading(false);
      return;
    }

    const bootstrapResponse = await fetch("/api/communications/bootstrap", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const bootstrapData = await bootstrapResponse.json().catch(() => ({}));

    if (!bootstrapResponse.ok) {
      setPermissions(permissionMap);
      setMessage(String(bootstrapData.error ?? "Communications could not be loaded."));
      setLoading(false);
      return;
    }

    setPermissions(permissionMap);
    setCurrentUser(bootstrapData.currentUser);
    setContacts(Array.isArray(bootstrapData.contacts) ? bootstrapData.contacts : []);
    setYards(Array.isArray(bootstrapData.yards) ? bootstrapData.yards : []);
    setActiveYardId(bootstrapData.yards?.[0]?.id ?? "");

    await loadData();
    setMessage("");
    setLoading(false);
  }, [loadData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSession().catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Communications could not be loaded.");
        setLoading(false);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSession]);

  useEffect(() => {
    const ids = conversations.map((conversation) => conversation.id).join(",");
    if (!currentUser || !ids) return;

    const channel = supabase
      .channel(`communications:${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadData().catch((error) => setMessage(error.message));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_attachments" }, () => {
        loadData().catch((error) => setMessage(error.message));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => {
        loadData().catch((error) => setMessage(error.message));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        loadData().catch((error) => setMessage(error.message));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversations, currentUser, loadData]);

  useEffect(() => {
    attachments.forEach((attachment) => {
      if (attachmentUrls[attachment.id]) return;
      supabase.storage
        .from(attachment.storage_bucket || "communication-attachments")
        .createSignedUrl(attachment.file_path, 60 * 60)
        .then(({ data, error }) => {
          if (!error && data?.signedUrl) {
            setAttachmentUrls((current) => ({ ...current, [attachment.id]: data.signedUrl }));
          }
        });
    });
  }, [attachments, attachmentUrls]);

  function selectedMemberNames(conversation: Conversation) {
    return (membersByConversation.get(conversation.id) ?? []).map((member) => contactById.get(member.user_id)?.name ?? "TITAN User");
  }

  function modeUnread(modeKey: ModeKey) {
    const modeDef = modes.find((item) => item.key === modeKey) ?? modes[0];
    return conversations
      .filter((conversation) => modeDef.types.includes(conversation.conversation_type))
      .reduce((sum, conversation) => sum + unreadForConversation(conversation), 0);
  }

  function conversationLabel(conversation: Conversation) {
    if (conversation.conversation_type === "direct") return "Direct message";
    if (conversation.conversation_type === "announcement") return "Announcement";
    if (conversation.conversation_type === "yard") return "Yard channel";
    if (conversation.conversation_type === "department") return "Department";
    return "Group";
  }

  function conversationTitle(conversation: Conversation) {
    if (conversation.conversation_type !== "direct" || !currentUser) return conversation.name;
    const other = membersByConversation
      .get(conversation.id)
      ?.find((member) => member.user_id !== currentUser.id);
    return other ? contactById.get(other.user_id)?.name ?? conversation.name : conversation.name;
  }

  function conversationMeta(conversation: Conversation) {
    const memberCount = membersByConversation.get(conversation.id)?.length ?? 0;
    if (conversation.conversation_type === "direct") return "Direct message";
    if (conversation.yard_id) {
      const yard = yards.find((item) => item.id === conversation.yard_id);
      return `${yard?.name ?? "Yard"} · ${memberCount} members`;
    }
    if (conversation.department) return `${conversation.department} · ${memberCount} members`;
    return `${memberCount} members`;
  }

  function openConversation(conversation: Conversation) {
    setSelectedId(conversation.id);
    setMode(modeForConversationType(conversation.conversation_type));
    setMobileThreadOpen(true);
    setNewOpen(false);
    setReplyToId(null);
    setMembersOpen(false);
    setPrefsOpen(false);
    setAdminOpen(false);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/communications?conversation=${conversation.id}`);
    }
  }

  const markRead = useCallback(async (conversationId: string) => {
    if (!currentUser) return;
    const readAt = new Date().toISOString();
    await supabase
      .from("conversation_members")
      .update({ last_read_at: readAt })
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUser.id);

    const unreadMessages = (messagesByConversation.get(conversationId) ?? []).filter((item) => item.sender_id !== currentUser.id);
    if (unreadMessages.length > 0) {
      await supabase.from("message_read_receipts").upsert(
        unreadMessages.map((item) => ({
          message_id: item.id,
          user_id: currentUser.id,
          read_at: readAt,
        }))
      );
    }

    setMembers((current) =>
      current.map((member) =>
        member.conversation_id === conversationId && member.user_id === currentUser.id
          ? { ...member, last_read_at: readAt }
          : member
      )
    );
  }, [currentUser, messagesByConversation]);

  useEffect(() => {
    if (!selectedConversation || !currentUser) return;
    const timer = window.setTimeout(() => {
      markRead(selectedConversation.id).catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [currentUser, markRead, selectedConversation]);

  function findContact(value: string) {
    const cleaned = value.trim().toLowerCase();
    return contacts.find((contact) => {
      return (
        contact.id === value ||
        contact.name.toLowerCase() === cleaned ||
        contact.email.toLowerCase() === cleaned ||
        `${contact.name} ${displayRole(contact.role)}`.toLowerCase().includes(cleaned)
      );
    });
  }

  function newButtonLabel() {
    if (mode === "directs") return "New DM";
    if (mode === "announcements") return "New Alert";
    return "New";
  }

  async function createConversation(explicitDirectContact?: Contact) {
    if (!currentUser) return;
    if (!canCreateConversations) {
      setMessage("You do not have permission to create conversations.");
      return;
    }

    const name = newName.trim();
    const type: ConversationType = mode === "directs" ? "direct" : mode === "announcements" ? "announcement" : "group";
    let memberIds: string[] = [];
    let conversationName = name;
    let key = "";

    if (type === "direct") {
      const contact = explicitDirectContact ?? findContact(name);
      if (!contact) {
        setMessage("Pick an internal employee to start a direct message.");
        return;
      }
      const pair = [currentUser.id, contact.id].sort();
      key = `direct:${pair[0]}:${pair[1]}`;
      const existing = conversations.find((conversation) => conversation.conversation_key === key);
      if (existing) {
        openConversation(existing);
        return;
      }
      conversationName = `${currentUser.name} / ${contact.name}`;
      memberIds = [currentUser.id, contact.id];
    } else {
      if (!conversationName) {
        setMessage(type === "announcement" ? "Alert title is required." : "Group name is required.");
        return;
      }

      const parsedMembers = newMembers
        .split(",")
        .map((item) => findContact(item))
        .filter((item): item is Contact => Boolean(item));

      memberIds =
        type === "announcement" && parsedMembers.length === 0
          ? contacts.map((contact) => contact.id)
          : parsedMembers.map((contact) => contact.id);
      memberIds.push(currentUser.id);
    }

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        conversation_key: key || null,
        name: conversationName,
        conversation_type: type,
        topic: type === "announcement" ? "TITAN alert thread." : type === "direct" ? "Direct message." : "TITAN group conversation.",
        color: type === "announcement" ? "green" : "orange",
        created_by: currentUser.id,
      })
      .select("id")
      .single();

    if (error || !conversation) {
      setMessage(error?.message ?? "Conversation could not be created.");
      return;
    }

    await supabase.from("conversation_members").insert({
      conversation_id: conversation.id,
      user_id: currentUser.id,
      is_admin: true,
    });

    const otherMembers = Array.from(new Set(memberIds.filter((id) => id && id !== currentUser.id)));
    if (otherMembers.length > 0) {
      const { error: memberError } = await supabase.from("conversation_members").insert(
        otherMembers.map((id) => ({
          conversation_id: conversation.id,
          user_id: id,
          is_admin: false,
        }))
      );
      if (memberError) setMessage(memberError.message);
    }

    setNewOpen(false);
    setNewName("");
    setNewMembers("");
    await loadData();
    openConversation({
      id: conversation.id,
      conversation_key: key || null,
      name: conversationName,
      conversation_type: type,
      yard_id: null,
      department: null,
      topic: type === "announcement" ? "TITAN alert thread." : type === "direct" ? "Direct message." : "TITAN group conversation.",
      color: type === "announcement" ? "green" : "orange",
      priority: "normal",
      is_archived: false,
      is_locked: false,
      created_by: currentUser.id,
      updated_at: new Date().toISOString(),
    });
  }

  async function addMember() {
    if (!selectedConversation) return;
    const contact = findContact(memberLookup);

    if (!contact) {
      setMessage("Pick an employee login before adding a member.");
      return;
    }

    if (selectedConversation.conversation_type === "direct") {
      setMessage("Direct messages stay one-to-one. Create a group to add more employees.");
      return;
    }

    if (membersByConversation.get(selectedConversation.id)?.some((member) => member.user_id === contact.id)) {
      setMessage(`${contact.name} is already in this conversation.`);
      return;
    }

    const { error } = await supabase.from("conversation_members").insert({
      conversation_id: selectedConversation.id,
      user_id: contact.id,
      is_admin: false,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMemberLookup("");
    setMessage(`${contact.name} was added to ${conversationTitle(selectedConversation)}.`);
    await loadData();
  }

  async function removeMember(member: Member) {
    if (!selectedConversation || !canManageSelected) return;
    if (member.user_id === currentUser?.id) {
      setMessage("Use Leave if you want to remove yourself from this group.");
      return;
    }

    const contactName = contactById.get(member.user_id)?.name ?? "this member";
    if (!window.confirm(`Remove ${contactName} from ${conversationTitle(selectedConversation)}?`)) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage("Your session expired. Sign in again before removing members.");
      return;
    }

    const response = await fetch(`/api/communications/members/${member.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(String(payload.error ?? "Member could not be removed."));
      return;
    }

    setMembers((current) =>
      current.map((item) =>
        item.id === member.id ? { ...item, removed_at: new Date().toISOString() } : item
      )
    );
    await loadData();
  }

  async function triggerPushForMessage(messageId: string) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch("/api/communications/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageId }),
    }).catch(() => undefined);
  }

  async function sendMessage() {
    if (!currentUser || !selectedConversation) return;
    const text = draft.trim();

    if (!text && !pendingFile) return;

    const { data: insertedMessage, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: selectedConversation.id,
        sender_id: currentUser.id,
        body: text || null,
        priority: draftPriority,
        reply_to_message_id: replyToId,
        status: "delivered",
      })
      .select("id")
      .single();

    if (error || !insertedMessage) {
      setMessage(error?.message ?? "Message could not be sent.");
      return;
    }

    if (pendingFile) {
      const path = `${selectedConversation.id}/${insertedMessage.id}/${Date.now()}-${safeFileName(pendingFile.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("communication-attachments")
        .upload(path, pendingFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(`Message sent, but attachment failed: ${uploadError.message}`);
      } else {
        const { error: attachmentError } = await supabase.from("message_attachments").insert({
          message_id: insertedMessage.id,
          conversation_id: selectedConversation.id,
          uploaded_by: currentUser.id,
          storage_bucket: "communication-attachments",
          file_path: path,
          file_name: pendingFile.name,
          file_type: pendingFile.type || "file",
          file_size: pendingFile.size,
        });
        if (attachmentError) setMessage(`Attachment uploaded, but metadata failed: ${attachmentError.message}`);
      }
    }

    void triggerPushForMessage(insertedMessage.id);

    setDraft("");
    setReplyToId(null);
    setDraftPriority("normal");
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadData();
  }

  async function toggleReaction(messageId: string) {
    if (!currentUser) return;
    const existing = reactions.find((reaction) => reaction.message_id === messageId && reaction.user_id === currentUser.id && reaction.reaction === "like");

    if (existing) {
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", currentUser.id)
        .eq("reaction", "like");
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: currentUser.id,
        reaction: "like",
      });
    }

    await loadData();
  }

  async function toggleAck(messageId: string) {
    if (!currentUser) return;
    const existing = acks.find((ack) => ack.message_id === messageId && ack.user_id === currentUser.id);

    if (existing) {
      await supabase.from("message_acknowledgements").delete().eq("message_id", messageId).eq("user_id", currentUser.id);
    } else {
      await supabase.from("message_acknowledgements").insert({
        message_id: messageId,
        user_id: currentUser.id,
      });
    }

    await loadData();
  }

  async function createTask(messageId: string) {
    if (!currentUser || !selectedConversation) return;
    const existing = tasks.find((task) => task.source_message_id === messageId);
    if (existing) {
      await supabase.from("communication_tasks").update({ status: "Open" }).eq("id", existing.id);
      await loadData();
      return;
    }

    const source = messageById.get(messageId);
    const title = (source?.body || "Communication handoff").slice(0, 120);
    const { error } = await supabase.from("communication_tasks").insert({
      source_message_id: messageId,
      conversation_id: selectedConversation.id,
      owner_id: currentUser.id,
      title,
      status: "Open",
    });

    if (error) setMessage(error.message);
    await loadData();
  }

  async function toggleMemberPreference(key: "muted" | "urgent_only" | "safety_override") {
    if (!currentMember) return;
    const { error } = await supabase
      .from("conversation_members")
      .update({ [key]: !currentMember[key] })
      .eq("id", currentMember.id);

    if (error) setMessage(error.message);
    await loadData();
  }

  async function toggleLock() {
    if (!selectedConversation || !canManageSelected) return;
    const { error } = await supabase
      .from("conversations")
      .update({ is_locked: !selectedConversation.is_locked })
      .eq("id", selectedConversation.id);
    if (error) setMessage(error.message);
    await loadData();
  }

  async function toggleArchive() {
    if (!selectedConversation || !canManageSelected) return;
    const { error } = await supabase
      .from("conversations")
      .update({ is_archived: !selectedConversation.is_archived })
      .eq("id", selectedConversation.id);
    if (error) setMessage(error.message);
    await loadData();
  }

  async function deleteConversation() {
    if (!currentUser || !selectedConversation) return;

    if (!["group", "direct"].includes(selectedConversation.conversation_type)) {
      setMessage("Yard, department, and alert channels are system channels. Archive them instead of deleting them.");
      return;
    }

    const title = conversationTitle(selectedConversation);
    if (!window.confirm(`Delete ${title}? This removes the conversation and its messages for everyone.`)) return;

    setBusyConversationId(selectedConversation.id);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage("Your session expired. Sign in again before deleting a group.");
      setBusyConversationId("");
      return;
    }

    const response = await fetch(`/api/communications/conversations/${selectedConversation.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(String(payload.error ?? "Conversation could not be deleted."));
      setBusyConversationId("");
      return;
    }

    setConversations((current) => current.filter((conversation) => conversation.id !== selectedConversation.id));
    setMembers((current) => current.filter((member) => member.conversation_id !== selectedConversation.id));
    setMessages((current) => current.filter((item) => item.conversation_id !== selectedConversation.id));
    setAttachments((current) => current.filter((item) => item.conversation_id !== selectedConversation.id));
    setSelectedId("");
    setBusyConversationId("");
    await loadData();
  }

  async function leaveConversation() {
    if (!currentUser || !currentMember || !selectedConversation) return;

    if (selectedConversation.conversation_type === "announcement") {
      setMessage("Alert channels stay available to employees.");
      return;
    }

    const prompt = selectedConversation.conversation_type === "direct" ? "Hide this direct message?" : `Leave ${conversationTitle(selectedConversation)}?`;
    if (!window.confirm(prompt)) return;

    setBusyConversationId(selectedConversation.id);
    setMessage("");

    const { error } = await supabase
      .from("conversation_members")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", currentMember.id);

    if (error) {
      setMessage(error.message);
      setBusyConversationId("");
      return;
    }

    setConversations((current) => current.filter((conversation) => conversation.id !== selectedConversation.id));
    setSelectedId("");
    setBusyConversationId("");
    await loadData();
  }

  async function resetGroups() {
    if (!currentUser || !canModerate) return;
    const confirmed = window.confirm(
      "Start fresh with Communications groups? This deletes every group, yard channel, department channel, and alert thread, but keeps direct messages."
    );
    if (!confirmed) return;

    setBusyConversationId("reset-groups");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage("Your session expired. Sign in again before resetting groups.");
      setBusyConversationId("");
      return;
    }

    const response = await fetch("/api/communications/reset-groups", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(String(payload.error ?? "Groups could not be reset."));
      setBusyConversationId("");
      return;
    }

    setMode("groups");
    setSelectedId("");
    setConversations((current) => current.filter((conversation) => conversation.conversation_type === "direct"));
    setBusyConversationId("");
    setMessage(`Groups reset. ${Number(payload.deleted ?? 0)} group conversations removed.`);
    await loadData();
  }

  async function deleteMessage(messageId: string) {
    if (!currentUser) return;
    const target = messageById.get(messageId);
    if (!target) return;
    if (target.sender_id !== currentUser.id && !canDeleteMessages) return;

    await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString(), body: "Message deleted." })
      .eq("id", messageId);
    await loadData();
  }

  function exportLog() {
    if (!selectedConversation || !canExportLogs) return;
    const rows = [
      "TITAN Communication Export",
      `Conversation: ${conversationTitle(selectedConversation)}`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      ...selectedMessages.map((item) => {
        const sender = contactById.get(item.sender_id)?.name ?? "TITAN User";
        return `[${formatTime(item.created_at)}] ${sender} (${item.priority}): ${item.body ?? ""}`;
      }),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${conversationTitle(selectedConversation).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-communication-log.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function insertMention(name: string) {
    const token = `@${name.split(/\s+/)[0] ?? name}`;
    setDraft((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}${token} `);
  }

  function attachmentView(messageId: string) {
    const items = conversationAttachments.get(messageId) ?? [];
    return items.map((attachment) => {
      const url = attachmentUrls[attachment.id];
      const isImage = String(attachment.file_type ?? "").startsWith("image/");
      return (
        <a
          key={attachment.id}
          className="comm-attachment"
          href={url || undefined}
          target="_blank"
          rel="noreferrer"
        >
          {isImage && url ? <img src={url} alt="" /> : <span className="comm-paperclip">Attachment</span>}
          <span>{attachment.file_name}</span>
        </a>
      );
    });
  }

  function replyCard(messageId: string | null) {
    if (!messageId) return null;
    const source = messageById.get(messageId);
    if (!source) return null;
    return (
      <div className="comm-reply-card">
        <b>{contactById.get(source.sender_id)?.name ?? "TITAN User"}</b>
        <br />
        {source.body || "Attachment"}
      </div>
    );
  }

  function renderNewPanel() {
    if (!newOpen) return null;
    const directMode = mode === "directs";
    const announcementMode = mode === "announcements";

    return (
      <div className="comm-new">
        <div className="sec-label">{directMode ? "Start Direct Message" : announcementMode ? "Create Alert" : "Create Group"}</div>
        <input
          className="comm-input"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          list={directMode ? "comm-contact-options" : undefined}
          placeholder={directMode ? "Type an employee or role name" : announcementMode ? "Alert title" : "Group name"}
        />
        {!directMode && (
          <input
            className="comm-input"
            value={newMembers}
            onChange={(event) => setNewMembers(event.target.value)}
            placeholder={announcementMode ? "Audience, comma separated; blank means all employees" : "Members, comma separated"}
          />
        )}
        <div className="comm-chip-row">
          <button className="comm-btn pri" type="button" onClick={() => createConversation()}>
            {directMode ? "Start DM" : announcementMode ? "Create Alert" : "Create"}
          </button>
          <button className="comm-btn ghost" type="button" onClick={() => setNewOpen(false)}>
            Cancel
          </button>
        </div>
        {directMode && (
          <div className="comm-contact-list">
            {contacts
              .filter((contact) => contact.id !== currentUser?.id)
              .slice(0, 8)
                      .map((contact) => (
                <button
                  key={contact.id}
                  className="comm-contact"
                  type="button"
                  onClick={() => createConversation(contact)}
                >
                  <span className="comm-avatar sm steel">{initials(contact.name)}</span>
                  <span className="comm-contact-main">
                    <b>{contact.name}</b>
                    <span>{displayRole(contact.role)} · {contact.department || "All departments"}</span>
                  </span>
                  <span className="comm-presence on" />
                </button>
              ))}
          </div>
        )}
      </div>
    );
  }

  function renderConversationButton(conversation: Conversation) {
    const convMessages = messagesByConversation.get(conversation.id) ?? [];
    const last = convMessages[convMessages.length - 1];
    const unread = unreadForConversation(conversation);
    const title = conversationTitle(conversation);
    const lastTime = last ? formatTime(last.created_at) : "";
    const lastText = last
      ? `${contactById.get(last.sender_id)?.name ?? "TITAN"}: ${last.body || "Attachment"}`
      : conversation.conversation_type === "direct"
        ? "Start a private conversation"
        : "No messages yet";

    return (
      <button
        key={conversation.id}
        className={`comm-group ${conversation.id === selectedConversation?.id ? "on" : ""}`}
        type="button"
        onClick={() => openConversation(conversation)}
      >
        <span className={`comm-avatar ${conversation.color || "orange"}`}>{initials(title)}</span>
        <span className="comm-group-main">
          <span className="comm-group-title">
            <span>{title}</span>
          </span>
          <span className="comm-group-last">{lastText}</span>
          <span className="comm-group-meta">
            <span className="comm-chip">{conversationLabel(conversation)}</span>
            {conversation.is_archived && <span className="comm-chip">Archived</span>}
            {conversation.is_locked && <span className="comm-chip">Locked</span>}
          </span>
        </span>
        <span className="comm-group-side">
          {lastTime && <span className="comm-group-time">{lastTime}</span>}
          {unread > 0 && <span className="comm-unread">{unread}</span>}
        </span>
      </button>
    );
  }

  function renderMembersPanel(conversation: Conversation) {
    const convMembers = membersByConversation.get(conversation.id) ?? [];
    return (
      <div className="comm-side-panel comm-members-panel">
        <h4>
          {conversation.conversation_type === "direct" ? "People" : "Group Members"} <span className="mono">{convMembers.length}</span>
        </h4>
        {conversation.conversation_type === "direct" ? (
          <div className="comm-status-line">Direct messages stay one-to-one. Create a group to add more employees.</div>
        ) : (
          <div className="comm-member-add">
            <input
              className="comm-input"
              value={memberLookup}
              onChange={(event) => setMemberLookup(event.target.value)}
              list="comm-contact-options"
              placeholder="Search employee logins"
            />
            <button className="comm-btn pri" type="button" onClick={addMember} disabled={!canManageSelected}>
              Add
            </button>
          </div>
        )}
        <div className="comm-status-line">Only employee logins are available here. Customer accounts are excluded from Communication.</div>
        <div className="comm-member-list">
          {convMembers.map((member) => {
            const contact = contactById.get(member.user_id);
            const name = contact?.name ?? "TITAN User";
            return (
              <div key={member.id} className="comm-member">
                <span className={`comm-avatar sm ${conversation.color || "steel"}`}>{initials(name)}</span>
                <div>
                  <b>{name}</b>
                  <span>{member.user_id === currentUser?.id ? "You" : displayRole(contact?.role ?? "employee")}{member.is_admin ? " · Admin" : ""}</span>
                </div>
                {conversation.conversation_type !== "direct" && member.user_id !== currentUser?.id && (
                  <button className="comm-react danger" type="button" onClick={() => removeMember(member)} disabled={!canManageSelected}>
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderThreadTools(conversation: Conversation) {
    const urgentCount = selectedMessages.filter((item) => item.priority === "urgent").length;
    const attachmentCount = attachments.filter((item) => item.conversation_id === conversation.id).length;

    return (
      <>
        <div className="comm-ops-summary">
          <b>Thread Snapshot</b>
          <span>{urgentCount ? `${urgentCount} urgent item${urgentCount === 1 ? "" : "s"} need attention.` : "No urgent messages in this thread."}</span>
          <span>{selectedMessages.length} messages · {selectedTasks.length} handoffs · {attachmentCount} attachments</span>
        </div>

        <h3>Notifications</h3>
        <div className="comm-side-panel">
          <button className="comm-btn ghost" type="button" onClick={() => setPrefsOpen((current) => !current)}>
            Preferences
          </button>
          {prefsOpen && currentMember ? (
            <>
              <div className="comm-side-row">
                <span>Mute thread</span>
                <button className={`comm-react ${currentMember.muted ? "on" : ""}`} type="button" onClick={() => toggleMemberPreference("muted")}>
                  {currentMember.muted ? "On" : "Off"}
                </button>
              </div>
              <div className="comm-side-row">
                <span>Urgent only</span>
                <button className={`comm-react ${currentMember.urgent_only ? "on" : ""}`} type="button" onClick={() => toggleMemberPreference("urgent_only")}>
                  {currentMember.urgent_only ? "On" : "Off"}
                </button>
              </div>
              <div className="comm-side-row">
                <span>Safety override</span>
                <button className={`comm-react ${currentMember.safety_override ? "on" : ""}`} type="button" onClick={() => toggleMemberPreference("safety_override")}>
                  {currentMember.safety_override ? "On" : "Off"}
                </button>
              </div>
            </>
          ) : (
            <div className="comm-status-line">Default: notify normally, force safety and urgent alerts.</div>
          )}
        </div>

        <h3>Admin</h3>
        <div className="comm-side-panel">
          <button className="comm-btn ghost" type="button" onClick={() => setAdminOpen((current) => !current)}>
            Controls
          </button>
          {adminOpen ? (
            <div className="comm-chip-row">
              <button className="comm-btn ghost" type="button" onClick={toggleLock} disabled={!canManageSelected}>
                {conversation.is_locked ? "Unlock" : "Lock"}
              </button>
              <button className="comm-btn ghost" type="button" onClick={toggleArchive} disabled={!canManageSelected}>
                {conversation.is_archived ? "Restore" : "Archive"}
              </button>
              <button className="comm-btn ghost" type="button" onClick={exportLog} disabled={!canExportLogs}>
                Export
              </button>
              {(canModerate || ["group", "direct"].includes(conversation.conversation_type)) && (
                <button
                  className="comm-btn danger"
                  type="button"
                  onClick={deleteConversation}
                  disabled={busyConversationId === conversation.id || !canManageSelected}
                >
                  Delete
                </button>
              )}
              {conversation.conversation_type !== "announcement" && (
                <button
                  className="comm-btn ghost"
                  type="button"
                  onClick={leaveConversation}
                  disabled={busyConversationId === conversation.id}
                >
                  {conversation.conversation_type === "direct" ? "Hide" : "Leave"}
                </button>
              )}
              {canModerate && (
                <button
                  className="comm-btn danger"
                  type="button"
                  onClick={resetGroups}
                  disabled={busyConversationId === "reset-groups"}
                >
                  Reset Groups
                </button>
              )}
            </div>
          ) : (
            <div className="comm-status-line">Lock, archive, leave, export, or delete custom groups from here.</div>
          )}
        </div>

        <h3>Handoffs</h3>
        <div className="comm-side-panel">
          {selectedTasks.length ? (
            selectedTasks.map((task) => (
              <div key={task.id} className="comm-task">
                <b>{task.status}</b>
                {task.title}
                <div className="comm-status-line">Owner: {contactById.get(task.owner_id ?? "")?.name ?? "TITAN"}</div>
              </div>
            ))
          ) : (
            <div className="comm-status-line">No message tasks yet.</div>
          )}
        </div>
      </>
    );
  }

  function renderMessage(item: Message) {
    const own = item.sender_id === currentUser?.id;
    const sender = contactById.get(item.sender_id)?.name ?? "TITAN User";
    const liked = reactions.some((reaction) => reaction.message_id === item.id && reaction.user_id === currentUser?.id);
    const likeCount = reactions.filter((reaction) => reaction.message_id === item.id).length;
    const acked = acks.some((ack) => ack.message_id === item.id && ack.user_id === currentUser?.id);
    const tasked = tasks.some((task) => task.source_message_id === item.id);
    const canDeleteThis = own || canDeleteMessages;

    return (
      <div key={item.id} className={`comm-msg ${own ? "own" : ""}`}>
        <span className={`comm-avatar sm ${selectedConversation?.color || "orange"}`}>{initials(sender)}</span>
        <div className="comm-msg-body">
          <div className="comm-msg-meta">
            <b>{sender}</b> · {formatTime(item.created_at)}
            {item.priority !== "normal" && <span className={`comm-priority ${item.priority}`}>{item.priority}</span>}
          </div>
          {replyCard(item.reply_to_message_id)}
          <div className={`comm-bubble ${item.priority}`}>
            {item.body && <span>{item.body}</span>}
            {attachmentView(item.id)}
          </div>
          <div className="comm-actions">
            <button className={`comm-react ${liked ? "on" : ""}`} type="button" onClick={() => toggleReaction(item.id)}>
              Like {likeCount || ""}
            </button>
            <button className="comm-react" type="button" onClick={() => setReplyToId(item.id)}>
              Reply
            </button>
            <button className={`comm-react ${tasked ? "on" : ""}`} type="button" onClick={() => createTask(item.id)}>
              {tasked ? "Tasked" : "Task"}
            </button>
            {(item.priority === "urgent" || selectedConversation?.conversation_type === "announcement") && (
              <button className={`comm-react ${acked ? "on" : ""}`} type="button" onClick={() => toggleAck(item.id)}>
                {acked ? "Acked" : "Ack"}
              </button>
            )}
            {canDeleteThis && (
              <button className="comm-react" type="button" onClick={() => deleteMessage(item.id)}>
                Delete
              </button>
            )}
          </div>
          <div className="comm-status-line">
            {own ? `${item.status || "Delivered"} · read receipts update when opened` : "Seen"}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="communications-page">
        <section className="module">
          <div className="page-head">
            <button className="brand compact brand-home-link comm-home-brand" type="button" onClick={() => (window.location.href = "/home")}>
              <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
              <div>
                <div className="brand-title">TITAN</div>
                <div className="brand-subtitle">Communications</div>
              </div>
            </button>
            <div className="statusline">
              <span className="pill ok">Opening Chats</span>
            </div>
          </div>

          <div id="commsRoot">
            <div className="comms loading">
              <aside className="comm-sidebar">
                <div className="comm-sidebar-head">
                  <b>Groups</b>
                  <button className="comm-btn ghost" type="button" disabled>
                    + New
                  </button>
                </div>
                <div className="comm-sidebar-note">Loading your TITAN conversations...</div>
                <div className="comm-mode-tabs">
                  {modes.map((item) => (
                    <button key={item.key} className={`comm-mode ${item.key === "groups" ? "on" : ""}`} type="button" disabled>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="comm-group-list">
                  {["Company Alerts", "Yard Operations", "Direct Messages"].map((label) => (
                    <div key={label} className="comm-group skeleton">
                      <span className="comm-avatar orange">{initials(label)}</span>
                      <span className="comm-group-main">
                        <span className="comm-group-title">
                          <span>{label}</span>
                        </span>
                        <span className="comm-group-last">Syncing messages...</span>
                      </span>
                    </div>
                  ))}
                </div>
              </aside>

              <main className="comm-main">
                <div className="comm-thread-head">
                  <div className="comm-thread-title">
                    <span className="comm-avatar orange">T</span>
                    <div>
                      <h2>Opening TITAN Communications</h2>
                      <p>Loading groups, direct messages, and alerts.</p>
                    </div>
                  </div>
                </div>
                <div className="comm-feed">
                  <div className="comm-loading">Getting your chats ready...</div>
                </div>
              </main>

              <aside className="comm-roster">
                <h3>Thread Tools</h3>
                <div className="comm-side-panel">
                  <h4>Notifications</h4>
                  <div className="comm-status-line">Preferences and members appear once the chat opens.</div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!canUseCommunications || !currentUser) {
    return (
      <main className="communications-page">
        <section className="module">
          <div className="page-head">
            <button className="brand compact brand-home-link comm-home-brand" type="button" onClick={() => (window.location.href = "/home")}>
              <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
              <div>
                <div className="brand-title">TITAN</div>
                <div className="brand-subtitle">Communications</div>
              </div>
            </button>
          </div>
          <div className="comm-empty-state">{message || "You do not have access to Communications."}</div>
        </section>
      </main>
    );
  }

  return (
    <main className={`communications-page ${mobileThreadOpen ? "thread-open" : ""}`}>
      <datalist id="comm-contact-options">
        {contacts
          .filter((contact) => contact.id !== currentUser.id)
          .map((contact) => (
            <option key={contact.id} value={contact.name}>
              {displayRole(contact.role)} - {contact.department || "All departments"}
            </option>
          ))}
      </datalist>

      <section className="module">
        <div className="page-head">
          <div className="comm-mobile-app-head">
            <h1>Chat</h1>
            <div className="comm-mobile-head-actions">
              <NotificationCenter />
              <button className="comm-btn ghost comm-mobile-new" type="button" onClick={() => setNewOpen((current) => !current)} disabled={!canCreateConversations}>
                +
              </button>
            </div>
          </div>
          <button className="brand compact brand-home-link comm-home-brand" type="button" onClick={() => (window.location.href = "/home")}>
            <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
            <div>
              <div className="brand-title">TITAN</div>
              <div className="brand-subtitle">Communications</div>
            </div>
          </button>
          <div className="statusline">
            <select className="comm-input branch-select" value={activeYardId} onChange={(event) => setActiveYardId(event.target.value)}>
              <option value="">All yards</option>
              {yards.map((yard) => (
                <option key={yard.id} value={yard.id}>
                  {yard.name}
                </option>
              ))}
            </select>
            <NotificationCenter />
            <span className="pill ok">Live TITAN</span>
          </div>
        </div>

        {message && <div className="modal-message dashboard-message">{message}</div>}
        {setupRequired && (
          <div className="modal-message dashboard-message">
            Communications tables are not available yet. Run <b>supabase/communications.sql</b> in TITAN Supabase, then refresh.
          </div>
        )}

        <div id="commsRoot">
          <div className={`comms ${mobileThreadOpen ? "thread-open" : ""} ${membersOpen ? "members-open" : ""}`}>
            <aside className="comm-sidebar">
              <div className="comm-sidebar-head">
                <b>{modes.find((item) => item.key === mode)?.label ?? "Groups"}</b>
                <button className="comm-btn ghost" type="button" onClick={() => setNewOpen((current) => !current)} disabled={!canCreateConversations}>
                  + {newButtonLabel()}
                </button>
              </div>
              <div className="comm-sidebar-note">Branch-aware conversations for operations, direct messages, and alerts.</div>

              <div className="comm-mode-tabs">
                {modes.map((item) => {
                  const unread = modeUnread(item.key);
                  return (
                    <button
                      key={item.key}
                      className={`comm-mode ${mode === item.key ? "on" : ""}`}
                      type="button"
                      onClick={() => {
                        setMode(item.key);
                        setNewOpen(false);
                      }}
                    >
                      {item.label}
                      {unread > 0 && <span className="comm-unread">{unread}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="comm-toolbar">
                <div className="comm-search">
                  <span>Search</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats and messages" />
                </div>
                <button className="comm-btn ghost" type="button" onClick={() => setFiltersOpen((current) => !current)}>
                  Filter
                </button>
              </div>

              {filtersOpen && (
                <div className="comm-filter-panel">
                  <label>
                    Priority
                    <select className="comm-input" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                      <option value="all">All priorities</option>
                      <option value="normal">Normal</option>
                      <option value="important">Important</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label>
                    Inbox
                    <select className="comm-input" value={mentionFilter} onChange={(event) => setMentionFilter(event.target.value)}>
                      <option value="all">All conversations</option>
                      <option value="me">Mentions me</option>
                      <option value="unread">Unread only</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select className="comm-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                      <option value="all">Active + archived</option>
                    </select>
                  </label>
                </div>
              )}

              {renderNewPanel()}

              <div className="comm-group-list">
                {visibleConversations.length ? (
                  visibleConversations.map(renderConversationButton)
                ) : (
                  <div className="empty">No conversations match this lookup.</div>
                )}
              </div>
            </aside>

            {selectedConversation ? (
              <>
                <main className="comm-main">
                  <div className="comm-thread-head">
                    <button className="comm-mobile-back" type="button" onClick={() => setMobileThreadOpen(false)} aria-label="Back to chats">
                      &lt;
                    </button>
                    <div className="comm-thread-title">
                      <span className={`comm-avatar ${selectedConversation.color || "orange"}`}>{initials(conversationTitle(selectedConversation))}</span>
                      <div>
                        <h2>
                          {conversationTitle(selectedConversation)}
                          {selectedConversation.is_archived && <span className="comm-priority">Archived</span>}
                          {selectedConversation.is_locked && <span className="comm-priority">Locked</span>}
                        </h2>
                        <p>{conversationMeta(selectedConversation)} · {selectedConversation.topic}</p>
                      </div>
                    </div>
                    <div className="comm-thread-actions">
                      <button
                        className={`comm-btn ghost comm-icon-btn ${membersOpen ? "on" : ""}`}
                        type="button"
                        onClick={() => setMembersOpen((current) => !current)}
                        title="Show members"
                        aria-label="Show members"
                      >
                        <svg className="comm-member-svg" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="comm-health">
                    <span className="comm-chip">{conversationLabel(selectedConversation)}</span>
                    <span className="comm-chip">{selectedMemberNames(selectedConversation).length} members</span>
                    <span className="comm-chip">{selectedMessages.length} messages</span>
                    {unreadForConversation(selectedConversation) > 0 && <span className="comm-chip">{unreadForConversation(selectedConversation)} unread</span>}
                    {selectedConversation.is_locked && <span className="comm-chip">Locked</span>}
                  </div>

                  <div className="comm-feed" id="commFeed">
                    {selectedMessages.length ? (
                      <>
                        <div className="comm-day">Today</div>
                        {selectedMessages.map(renderMessage)}
                      </>
                    ) : (
                      <div className="empty">No messages yet.</div>
                    )}
                  </div>

                  {selectedConversation.is_locked && !canManageSelected ? (
                    <div className="comm-composer locked">This thread is locked.</div>
                  ) : (
                    <div className="comm-composer">
                      <label className="comm-attach-label">
                        Attach
                        <input
                          ref={fileInputRef}
                          type="file"
                          onChange={(event) => setPendingFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                      <div>
                        {replyToId && (
                          <div className="comm-replying">
                            <b>Replying to</b>
                            <button className="comm-react" type="button" onClick={() => setReplyToId(null)}>
                              Cancel
                            </button>
                            {replyCard(replyToId)}
                          </div>
                        )}
                        <textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              sendMessage();
                            }
                          }}
                          placeholder={`${selectedConversation.conversation_type === "announcement" ? "Post to" : "Message"} ${conversationTitle(selectedConversation)}`}
                        />
                        {pendingFile && (
                          <div className="comm-attach-preview">
                            <span>{pendingFile.name}</span>
                          </div>
                        )}
                        <div className="comm-compose-tools">
                          <select className="comm-input" value={draftPriority} onChange={(event) => setDraftPriority(event.target.value as Priority)}>
                            <option value="normal">Normal</option>
                            <option value="important">Important</option>
                            <option value="urgent">Urgent</option>
                          </select>
                          <div className="comm-mention-row">
                            {selectedMemberNames(selectedConversation)
                              .filter((name) => name !== currentUser.name)
                              .slice(0, 5)
                              .map((name) => (
                                <button key={name} className="comm-mention-btn" type="button" onClick={() => insertMention(name)}>
                                  @{name.split(/\s+/)[0]}
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>
                      <button className="comm-btn pri" type="button" onClick={sendMessage}>
                        {selectedConversation.conversation_type === "announcement" ? "Post" : "Send"}
                      </button>
                    </div>
                  )}
                </main>

                <aside className="comm-roster">
                  <h3>Thread Tools</h3>
                  {membersOpen && renderMembersPanel(selectedConversation)}
                  <div className="comm-side-panel">
                    <h4>Pinned</h4>
                    <div className="comm-chip-row">
                      <span className="comm-chip">{conversationLabel(selectedConversation)}</span>
                      {selectedConversation.yard_id && <span className="comm-chip">{yards.find((yard) => yard.id === selectedConversation.yard_id)?.name ?? "Yard"}</span>}
                      {selectedConversation.department && <span className="comm-chip">{selectedConversation.department}</span>}
                    </div>
                  </div>
                  {renderThreadTools(selectedConversation)}
                </aside>
              </>
            ) : (
              <main className="comm-main">
                <div className="empty">No conversations available.</div>
              </main>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
