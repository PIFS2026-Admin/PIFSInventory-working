import { createClient } from "@supabase/supabase-js";

const mondayEndpoint = "https://api.monday.com/v2";

type MondayGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string; path?: unknown[]; extensions?: Record<string, unknown> }>;
};

type TitanProfile = {
  role?: string | null;
  is_disabled?: boolean | null;
  full_name?: string | null;
  email?: string | null;
};

type DiscoveryRequestBody = {
  boardIds?: unknown;
  itemLimit?: unknown;
  boardLimit?: unknown;
};

const wadeCrmEmail = "wade@pathfinderinspections.com";

function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function errorMessage(error: unknown) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (hasMessage(error) && error.message.trim()) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function isWadeProfile(profile: TitanProfile, authEmail: string | null | undefined) {
  const fullName = String(profile.full_name ?? "")
    .trim()
    .toLowerCase();
  const profileEmail = String(profile.email ?? "")
    .trim()
    .toLowerCase();
  const email = String(authEmail ?? "")
    .trim()
    .toLowerCase();

  return fullName === "wade wisenor" || profileEmail === wadeCrmEmail || email === wadeCrmEmail;
}

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function mondayToken() {
  return (
    process.env.MONDAY_API_TOKEN ||
    process.env.MONDAY_CRM_API_TOKEN ||
    process.env.MONDAY_TOKEN ||
    ""
  ).trim();
}

function parseBoardIds(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  return String(value ?? "")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildDiscoveryQuery(hasBoardIds: boolean) {
  const boardArgs = hasBoardIds ? "ids: $boardIds" : "limit: $boardLimit";

  return `
    query TitanMondayCrmDiscovery(${hasBoardIds ? "$boardIds: [ID!], " : ""}$boardLimit: Int!, $itemLimit: Int!) {
      boards(${boardArgs}) {
        id
        name
        description
        state
        type
        permissions
        items_count
        owners {
          id
          name
          email
        }
        subscribers {
          id
          name
          email
        }
        groups {
          id
          title
          archived
          deleted
        }
        columns {
          id
          title
          type
          description
          settings_str
          archived
        }
        items_page(limit: $itemLimit) {
          cursor
          items {
            id
            name
            state
            created_at
            updated_at
            group {
              id
              title
            }
            column_values {
              id
              type
              text
              value
            }
          }
        }
      }
    }
  `;
}

async function runMondayDiscovery(options: {
  boardIds: string[];
  boardLimit: number;
  itemLimit: number;
}) {
  const token = mondayToken();

  if (!token) {
    return {
      configured: false,
      message: "MONDAY_API_TOKEN is not configured on the server yet.",
      boards: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const hasBoardIds = options.boardIds.length > 0;
  const query = buildDiscoveryQuery(hasBoardIds);
  const variables: Record<string, unknown> = {
    boardLimit: Math.min(Math.max(options.boardLimit || 25, 1), 100),
    itemLimit: Math.min(Math.max(options.itemLimit || 25, 1), 100),
  };

  if (hasBoardIds) variables.boardIds = options.boardIds;

  const response = await fetch(mondayEndpoint, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      "API-Version": process.env.MONDAY_API_VERSION || "2026-07",
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = (await response.json().catch(() => null)) as MondayGraphqlResponse<{ boards: unknown[] }> | null;

  if (!response.ok) {
    throw new Error(result?.errors?.[0]?.message || `Monday API returned ${response.status}.`);
  }

  if (result?.errors?.length) {
    throw new Error(result.errors.map((error) => error.message || "Monday API error.").join(" | "));
  }

  return {
    configured: true,
    message: "Read-only discovery completed. No TITAN records were created or changed.",
    boards: result?.data?.boards ?? [],
    generatedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return Response.json({ error: "You must be signed in to run CRM discovery." }, { status: 401 });
    }

    const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);
    if (userError || !userData.user) {
      return Response.json({ error: "Your session could not be verified." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role, is_disabled, full_name, email")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 });
    }

    const profileRow = profile as TitanProfile;

    if (Boolean(profileRow.is_disabled)) {
      return Response.json({ error: "This TITAN account is disabled." }, { status: 403 });
    }

    if (!isWadeProfile(profileRow, userData.user.email)) {
      return Response.json({ error: "Monday CRM discovery is restricted to Wade." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as DiscoveryRequestBody;
    const boardIds = parseBoardIds(body.boardIds);
    const itemLimit = Number(body.itemLimit ?? 25);
    const boardLimit = Number(body.boardLimit ?? 25);

    const discovery = await runMondayDiscovery({ boardIds, itemLimit, boardLimit });
    return Response.json(discovery);
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
