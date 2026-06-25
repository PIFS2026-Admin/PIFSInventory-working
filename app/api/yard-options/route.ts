import { createClient } from "@supabase/supabase-js";

type YardRow = {
  id: string;
  name: string;
  code: string;
  is_active?: boolean | null;
};

const defaultYards = [
  { name: "Pathfinder Yard WTX", code: "PIFS" },
  { name: "Gillette Yard", code: "GILLETTE" },
  { name: "Casper Yard", code: "CASPER" },
  { name: "Dickinson Yard", code: "DICKINSON" },
];

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase yard route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function errorMessage(error: any) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function sortYards(yards: YardRow[]) {
  return [...yards].sort((left, right) => {
    if (left.code === "PIFS") return -1;
    if (right.code === "PIFS") return 1;
    return left.name.localeCompare(right.name);
  });
}

function missingInventoryYardsTable(error: any) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("inventory_user_yards") &&
    (message.includes("does not exist") ||
      message.includes("could not find the table") ||
      message.includes("schema cache"))
  );
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

    await adminSupabase
      .from("yards")
      .upsert(defaultYards, { onConflict: "code" });

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const role = String(profile?.role ?? "").toLowerCase();
    const email = String(userData.user.email ?? "").toLowerCase();
    const isWade = email === "wade@pathfinderinspections.com";
    const canSeeAllYards = isWade || role === "admin";

    const { data: activeYards, error: yardsError } = await adminSupabase
      .from("yards")
      .select("id, name, code, is_active")
      .eq("is_active", true);

    if (yardsError) throw yardsError;

    const yards = (activeYards ?? []) as YardRow[];

    if (canSeeAllYards) {
      return Response.json({ yards: sortYards(yards) });
    }

    const pifsYard = yards.find((yard) => yard.code === "PIFS");
    const allowedYardIds = new Set<string>();
    if (pifsYard) allowedYardIds.add(pifsYard.id);

    const { data: assignments, error: assignmentsError } = await adminSupabase
      .from("inventory_user_yards")
      .select("yard_id")
      .eq("user_id", userData.user.id);

    if (assignmentsError && !missingInventoryYardsTable(assignmentsError)) {
      throw assignmentsError;
    }

    for (const assignment of assignments ?? []) {
      if (assignment.yard_id) allowedYardIds.add(String(assignment.yard_id));
    }

    const visibleYards = yards.filter((yard) => allowedYardIds.has(yard.id));
    return Response.json({ yards: sortYards(visibleYards.length > 0 ? visibleYards : yards) });
  } catch (error: any) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
