import { createClient } from "@supabase/supabase-js";
import { normalizeRole } from "../../../../lib/modulePermissions";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email?: string | null;
  role: string | null;
  department?: string | null;
  is_disabled?: boolean | null;
};

type YardRow = {
  id: string;
  name: string;
  code: string;
  is_active?: boolean | null;
};

type AuthUserRow = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
};

const departmentFallbacks = ["Yard", "Inventory", "Purchase Orders", "DTI", "Hardband", "Safety", "Management"];
const requiredAlertChannels = [
  {
    key: "announcement:all-employees",
    name: "Company Wide",
    topic: "Company-wide TITAN alerts for every internal employee.",
    yardCodes: [],
  },
  {
    key: "announcement:yard:pathfinder-wtx",
    name: "Pathfinder WTX Yard",
    topic: "Pathfinder WTX Yard alerts and urgent yard-wide updates.",
    yardCodes: ["PIFS", "WTX", "PATHFINDER"],
  },
  {
    key: "announcement:yard:gillette",
    name: "Gillette Yard",
    topic: "Gillette Yard alerts and urgent yard-wide updates.",
    yardCodes: ["GILLETTE"],
  },
  {
    key: "announcement:yard:casper",
    name: "Casper Yard",
    topic: "Casper Yard alerts and urgent yard-wide updates.",
    yardCodes: ["CASPER"],
  },
  {
    key: "announcement:yard:dickinson",
    name: "Dickinson Yard",
    topic: "Dickinson Yard alerts and urgent yard-wide updates.",
    yardCodes: ["DICKINSON"],
  },
];

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

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortByName<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name));
}

function displayName(profile: ProfileRow) {
  return profile.full_name || profile.email || "TITAN User";
}

function metadataText(user: AuthUserRow | undefined, key: string) {
  const value = user?.user_metadata?.[key] ?? user?.app_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function roleFromProfileOrAuth(profile: ProfileRow | undefined, user: AuthUserRow | undefined) {
  const profileRole = String(profile?.role ?? "").trim();
  const authRole = metadataText(user, "role") || metadataText(user, "user_role");
  return normalizeRole(profileRole || authRole || "employee");
}

function nameFromProfileOrAuth(profile: ProfileRow | undefined, user: AuthUserRow | undefined) {
  return (
    profile?.full_name ||
    metadataText(user, "full_name") ||
    metadataText(user, "name") ||
    profile?.email ||
    user?.email ||
    "TITAN User"
  );
}

function emailFromProfileOrAuth(profile: ProfileRow | undefined, user: AuthUserRow | undefined) {
  return profile?.email || user?.email || "";
}

function departmentFromProfileOrAuth(profile: ProfileRow | undefined, user: AuthUserRow | undefined) {
  return profile?.department || metadataText(user, "department") || "";
}

async function listAuthUsers(adminSupabase: ReturnType<typeof configuredSupabase>) {
  const users: AuthUserRow[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    users.push(...((data.users ?? []) as AuthUserRow[]));
    if ((data.users ?? []).length < 1000) break;
  }

  return users;
}

function buildInternalUsers(profileRows: ProfileRow[], authUsers: AuthUserRow[]) {
  const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const ids = Array.from(new Set([...profileById.keys(), ...authById.keys()]));

  return ids
    .map((id) => {
      const profile = profileById.get(id);
      const authUser = authById.get(id);
      const role = roleFromProfileOrAuth(profile, authUser);

      return {
        id,
        full_name: nameFromProfileOrAuth(profile, authUser),
        email: emailFromProfileOrAuth(profile, authUser),
        role,
        department: departmentFromProfileOrAuth(profile, authUser),
        is_disabled: Boolean(profile?.is_disabled),
      } satisfies ProfileRow;
    })
    .filter((row) => !row.is_disabled && normalizeRole(row.role) !== "customer");
}

async function insertMembers(adminSupabase: ReturnType<typeof configuredSupabase>, conversationId: string, userIds: string[], adminIds: Set<string>) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return;

  const { data: existingMembers, error: existingError } = await adminSupabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .in("user_id", uniqueUserIds);

  if (existingError) throw existingError;

  const existingUserIds = new Set(((existingMembers ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
  const newUserIds = uniqueUserIds.filter((userId) => !existingUserIds.has(userId));

  for (const userId of uniqueUserIds.filter((id) => existingUserIds.has(id))) {
    const { error: updateError } = await adminSupabase
      .from("conversation_members")
      .update({
        is_admin: adminIds.has(userId),
        removed_at: null,
      })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    if (updateError) throw updateError;
  }

  if (newUserIds.length === 0) return;

  const { error: insertError } = await adminSupabase.from("conversation_members").insert(
    newUserIds.map((userId) => ({
      conversation_id: conversationId,
      user_id: userId,
      is_admin: adminIds.has(userId),
      removed_at: null,
    }))
  );

  if (!insertError) return;

  const isDuplicateError =
    insertError.code === "23505" ||
    String(insertError.message ?? "").toLowerCase().includes("duplicate key");

  if (!isDuplicateError) throw insertError;
}

function findYardForAlert(yards: YardRow[], yardCodes: string[]) {
  if (yardCodes.length === 0) return null;
  const normalizedCodes = yardCodes.map((item) => item.toLowerCase());

  return (
    yards.find((yard) => normalizedCodes.includes(String(yard.code ?? "").toLowerCase())) ??
    yards.find((yard) => {
      const haystack = `${yard.name} ${yard.code}`.toLowerCase();
      return normalizedCodes.some((code) => haystack.includes(code));
    }) ??
    null
  );
}

async function ensureAlertChannels(
  adminSupabase: ReturnType<typeof configuredSupabase>,
  profiles: ProfileRow[],
  yards: YardRow[],
  assignments: Array<{ user_id: string; yard_id: string }>,
  adminIds: Set<string>,
  createdBy: string
) {
  for (const channel of requiredAlertChannels) {
    const yard = findYardForAlert(yards, channel.yardCodes);
    const conversationId = await upsertConversation(adminSupabase, {
      conversation_key: channel.key,
      name: channel.name,
      conversation_type: "announcement",
      topic: channel.topic,
      color: channel.yardCodes.length === 0 ? "green" : "orange",
      yard_id: yard?.id ?? null,
      created_by: createdBy,
    });

    const memberIds =
      channel.yardCodes.length === 0
        ? profiles.map((row) => row.id)
        : [
            ...assignments.filter((row) => row.yard_id === yard?.id).map((row) => row.user_id),
            ...Array.from(adminIds),
          ];

    await insertMembers(adminSupabase, conversationId, memberIds, adminIds);
  }
}

async function upsertConversation(
  adminSupabase: ReturnType<typeof configuredSupabase>,
  values: {
    conversation_key: string;
    name: string;
    conversation_type: string;
    topic: string;
    color: string;
    yard_id?: string | null;
    department?: string | null;
    created_by: string;
  }
) {
  const { data, error } = await adminSupabase
    .from("conversations")
    .upsert(values, { onConflict: "conversation_key" })
    .select("id")
    .single();

  if (error || !data) throw error ?? new Error("Conversation could not be created.");
  return String(data.id);
}

export async function GET(request: Request) {
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
      .select("id, full_name, email, role, department, is_disabled")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 });

    const currentAuthUser = userData.user as AuthUserRow;
    const role = roleFromProfileOrAuth(profile as ProfileRow, currentAuthUser);

    if (role === "customer" || Boolean(profile.is_disabled)) {
      return Response.json({ error: "Communications is only available to internal TITAN users." }, { status: 403 });
    }

    const [profilesResult, yardsResult, assignmentsResult, authUsers] = await Promise.all([
      adminSupabase
        .from("profiles")
        .select("id, full_name, email, role, department, is_disabled")
        .order("full_name", { ascending: true }),
      adminSupabase.from("yards").select("id, name, code, is_active").eq("is_active", true),
      adminSupabase.from("inventory_user_yards").select("user_id, yard_id"),
      listAuthUsers(adminSupabase),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (yardsResult.error) throw yardsResult.error;

    const profiles = buildInternalUsers((profilesResult.data ?? []) as ProfileRow[], authUsers);
    const yards = ((yardsResult.data ?? []) as YardRow[]).filter((yard) => yard.is_active !== false);
    const assignments = assignmentsResult.error ? [] : ((assignmentsResult.data ?? []) as Array<{ user_id: string; yard_id: string }>);
    const adminIds = new Set(profiles.filter((row) => ["admin", "owner"].includes(normalizeRole(row.role))).map((row) => row.id));
    const currentIsAdmin = adminIds.has(userData.user.id);
    const currentAssignedYardIds = new Set(assignments.filter((row) => row.user_id === userData.user.id).map((row) => row.yard_id));
    const visibleYards = currentIsAdmin ? yards : yards.filter((yard) => currentAssignedYardIds.has(yard.id));

    const { count: conversationCount, error: countError } = await adminSupabase
      .from("conversations")
      .select("id", { count: "exact", head: true });

    if (countError) throw countError;

    const shouldSeedDefaultChannels = process.env.COMMUNICATIONS_SEED_DEFAULT_CHANNELS === "true";

    await ensureAlertChannels(adminSupabase, profiles, yards, assignments, adminIds, userData.user.id);

    if (shouldSeedDefaultChannels && (conversationCount ?? 0) === 0) {
      for (const yard of yards) {
        const yardConversationId = await upsertConversation(adminSupabase, {
          conversation_key: `yard:${yard.id}`,
          name: `${yard.name}`,
          conversation_type: "yard",
          topic: "Yard operations, loader moves, rack questions, and dispatch coordination.",
          color: "orange",
          yard_id: yard.id,
          created_by: userData.user.id,
        });
        const assignedUserIds = assignments.filter((row) => row.yard_id === yard.id).map((row) => row.user_id);
        await insertMembers(adminSupabase, yardConversationId, [...assignedUserIds, ...Array.from(adminIds)], adminIds);
      }

      const departments = Array.from(
        new Set(
          [
            ...departmentFallbacks,
            ...profiles.map((row) => String(row.department ?? "").trim()).filter(Boolean),
          ].filter(Boolean)
        )
      );

      for (const department of departments) {
        const departmentConversationId = await upsertConversation(adminSupabase, {
          conversation_key: `department:${slug(department)}`,
          name: `${department} Team`,
          conversation_type: "department",
          topic: `${department} service-line and department coordination.`,
          color: department.toLowerCase().includes("inventory") ? "green" : "steel",
          department,
          created_by: userData.user.id,
        });
        const departmentUsers = profiles
          .filter((row) => String(row.department ?? "").trim().toLowerCase() === department.toLowerCase())
          .map((row) => row.id);
        await insertMembers(adminSupabase, departmentConversationId, [...departmentUsers, ...Array.from(adminIds)], adminIds);
      }
    }

    return Response.json({
      currentUser: {
        id: userData.user.id,
        name: displayName(profile as ProfileRow),
        email: profile.email ?? userData.user.email ?? "",
        role,
        department: profile.department ?? "",
      },
      contacts: sortByName(
        profiles.map((row) => ({
          id: row.id,
          name: displayName(row),
          email: row.email ?? "",
          role: normalizeRole(row.role),
          department: row.department ?? "",
          branch: "all",
          account: "employee",
        }))
      ),
      yards: visibleYards.map((yard) => ({
        id: yard.id,
        name: yard.name,
        code: yard.code,
      })),
    });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
