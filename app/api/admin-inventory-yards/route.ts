import { createClient } from "@supabase/supabase-js";

const defaultInventoryYards = [
  { name: "Pathfinder Yard WTX", code: "PIFS" },
  { name: "Gillette Yard", code: "GILLETTE" },
  { name: "Casper Yard", code: "CASPER" },
  { name: "Dickinson Yard", code: "DICKINSON" },
];

const yardAssignmentSetupMessage =
  "Inventory yard access table is missing. Run supabase/fix_inventory_yard_access.sql in Supabase SQL Editor, then refresh this page.";

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin yard route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function getErrorMessage(error: any) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error_description === "string" && error.error_description.trim()) {
    return error.error_description;
  }
  if (typeof error.error === "string" && error.error.trim()) return error.error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function isMissingTableError(error: any) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("inventory_user_yards") &&
    (message.includes("does not exist") ||
      message.includes("could not find the table") ||
      message.includes("schema cache"))
  );
}

async function ensureDefaultYards(adminSupabase: ReturnType<typeof configuredSupabase>) {
  const { error: upsertError } = await adminSupabase
    .from("yards")
    .upsert(defaultInventoryYards, { onConflict: "code" });

  if (upsertError) throw upsertError;

  const { data: yards, error: yardError } = await adminSupabase
    .from("yards")
    .select("id, name, code, is_active")
    .order("name", { ascending: true });

  if (yardError) throw yardError;

  return yards ?? [];
}

function normalizeYardCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

async function listAssignments(adminSupabase: ReturnType<typeof configuredSupabase>) {
  const { data, error } = await adminSupabase
    .from("inventory_user_yards")
    .select("id, user_id, yard_id");

  if (error) {
    if (isMissingTableError(error)) {
      return {
        assignments: [],
        setupRequired: true,
        setupMessage: yardAssignmentSetupMessage,
      };
    }

    throw error;
  }

  return {
    assignments: data ?? [],
    setupRequired: false,
    setupMessage: "",
  };
}

async function saveAssignments(
  adminSupabase: ReturnType<typeof configuredSupabase>,
  userId: string,
  yardIds: string[]
) {
  const { error: deleteError } = await adminSupabase
    .from("inventory_user_yards")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    if (isMissingTableError(deleteError)) {
      return {
        ok: false,
        setupRequired: true,
        setupMessage: yardAssignmentSetupMessage,
        error: yardAssignmentSetupMessage,
      };
    }

    throw deleteError;
  }

  const cleanYardIds = Array.from(new Set(yardIds.filter(Boolean)));

  if (cleanYardIds.length > 0) {
    const { error: insertError } = await adminSupabase.from("inventory_user_yards").insert(
      cleanYardIds.map((yardId) => ({
        user_id: userId,
        yard_id: yardId,
      }))
    );

    if (insertError) {
      if (isMissingTableError(insertError)) {
        return {
          ok: false,
          setupRequired: true,
          setupMessage: yardAssignmentSetupMessage,
          error: yardAssignmentSetupMessage,
        };
      }

      throw insertError;
    }
  }

  return {
    ok: true,
    setupRequired: false,
    setupMessage: "",
    error: "",
  };
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "list").trim();
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
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile || !["admin", "employee", "owner"].includes(profile.role)) {
      return Response.json({ error: "You do not have access to yard setup." }, { status: 403 });
    }

    const yards = await ensureDefaultYards(adminSupabase);

    if (action === "create-yard") {
      const name = String(body.name ?? "").trim();
      const code = normalizeYardCode(body.code || name);

      if (!name || !code) {
        return Response.json({ error: "Yard name and code are required." }, { status: 400 });
      }

      const { data: createdYard, error: createError } = await adminSupabase
        .from("yards")
        .insert({ name, code, is_active: true })
        .select("id, name, code, is_active")
        .single();

      if (createError) {
        const message = getErrorMessage(createError);
        const duplicate = message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique");
        return Response.json(
          { error: duplicate ? `A yard with code ${code} already exists.` : message },
          { status: 400 }
        );
      }

      const listResult = await listAssignments(adminSupabase);
      const refreshedYards = await ensureDefaultYards(adminSupabase);
      return Response.json({
        ok: true,
        yard: createdYard,
        yards: refreshedYards,
        assignments: listResult.assignments,
      });
    }

    if (action === "set-yard-active") {
      const yardId = String(body.yardId ?? "").trim();
      const isActive = body.isActive !== false;

      if (!yardId) {
        return Response.json({ error: "Yard is required." }, { status: 400 });
      }

      const { error: updateError } = await adminSupabase
        .from("yards")
        .update({ is_active: isActive })
        .eq("id", yardId);

      if (updateError) throw updateError;

      const listResult = await listAssignments(adminSupabase);
      const refreshedYards = await ensureDefaultYards(adminSupabase);
      return Response.json({
        ok: true,
        yards: refreshedYards,
        assignments: listResult.assignments,
      });
    }

    if (action === "save-user-yards") {
      const userId = String(body.userId ?? "").trim();
      const yardIds = Array.isArray(body.yardIds) ? body.yardIds.map((value: unknown) => String(value)) : [];

      if (!userId) {
        return Response.json({ error: "User is required before saving yard access." }, { status: 400 });
      }

      const saveResult = await saveAssignments(adminSupabase, userId, yardIds);
      const listResult = await listAssignments(adminSupabase);

      return Response.json({
        yards,
        assignments: listResult.assignments,
        ok: saveResult.ok,
        setupRequired: saveResult.setupRequired || listResult.setupRequired,
        setupMessage: saveResult.setupMessage || listResult.setupMessage,
        error: saveResult.error,
      }, { status: saveResult.ok ? 200 : 500 });
    }

    const listResult = await listAssignments(adminSupabase);

    return Response.json({
      yards,
      assignments: listResult.assignments,
      setupRequired: listResult.setupRequired,
      setupMessage: listResult.setupMessage,
    });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
