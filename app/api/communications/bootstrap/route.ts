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

const departmentFallbacks = ["Yard", "Inventory", "Purchase Orders", "DTI", "Hardband", "Safety", "Management"];

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

async function insertMembers(adminSupabase: ReturnType<typeof configuredSupabase>, conversationId: string, userIds: string[], adminIds: Set<string>) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return;

  const { error } = await adminSupabase.from("conversation_members").upsert(
    uniqueUserIds.map((userId) => ({
      conversation_id: conversationId,
      user_id: userId,
      is_admin: adminIds.has(userId),
    })),
    { onConflict: "conversation_id,user_id" }
  );

  if (error) throw error;
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

    const role = normalizeRole(profile.role);

    if (role === "customer" || Boolean(profile.is_disabled)) {
      return Response.json({ error: "Communications is only available to internal TITAN users." }, { status: 403 });
    }

    const [profilesResult, yardsResult, assignmentsResult] = await Promise.all([
      adminSupabase
        .from("profiles")
        .select("id, full_name, email, role, department, is_disabled")
        .neq("role", "customer")
        .order("full_name", { ascending: true }),
      adminSupabase.from("yards").select("id, name, code, is_active").eq("is_active", true),
      adminSupabase.from("inventory_user_yards").select("user_id, yard_id"),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (yardsResult.error) throw yardsResult.error;

    const profiles = ((profilesResult.data ?? []) as ProfileRow[]).filter((row) => !row.is_disabled && normalizeRole(row.role) !== "customer");
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

    if ((conversationCount ?? 0) === 0) {
      const allInternalId = await upsertConversation(adminSupabase, {
        conversation_key: "announcement:all-employees",
        name: "Company Alerts",
        conversation_type: "announcement",
        topic: "All-employee notices, safety alerts, and operating updates.",
        color: "green",
        created_by: userData.user.id,
      });
      await insertMembers(adminSupabase, allInternalId, profiles.map((row) => row.id), adminIds);

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
