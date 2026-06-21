import { createClient } from "@supabase/supabase-js";

const defaultInventoryYards = [
  { name: "Pathfinder Yard WTX", code: "PIFS" },
  { name: "Gillette Yard", code: "GILLETTE" },
  { name: "Casper Yard", code: "CASPER" },
  { name: "Dickinson Yard", code: "DICKINSON" },
];

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

export async function POST(request: Request) {
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
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile || !["admin", "employee"].includes(profile.role)) {
      return Response.json({ error: "You do not have access to yard setup." }, { status: 403 });
    }

    const { error: upsertError } = await adminSupabase
      .from("yards")
      .upsert(defaultInventoryYards, { onConflict: "code" });

    if (upsertError) {
      return Response.json({ error: getErrorMessage(upsertError) }, { status: 500 });
    }

    const { data: yards, error: yardError } = await adminSupabase
      .from("yards")
      .select("id, name, code");

    if (yardError) {
      return Response.json({ error: getErrorMessage(yardError) }, { status: 500 });
    }

    return Response.json({ yards: yards ?? [] });
  } catch (error: any) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
