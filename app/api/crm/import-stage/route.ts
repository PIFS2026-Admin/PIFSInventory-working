import { createClient } from "@supabase/supabase-js";

type TitanProfile = {
  role?: string | null;
  is_disabled?: boolean | null;
  full_name?: string | null;
  email?: string | null;
};

type StageBoard = {
  id?: unknown;
  name?: unknown;
  items_count?: unknown;
  groups?: unknown;
  columns?: unknown;
};

type StageColumnMapping = {
  mondayColumnId?: unknown;
  mondayColumnTitle?: unknown;
  mondayColumnType?: unknown;
  titanEntityType?: unknown;
  titanFieldKey?: unknown;
  mappingStatus?: unknown;
  isCustomField?: unknown;
  notes?: unknown;
};

type StageBoardMapping = {
  boardId?: unknown;
  boardName?: unknown;
  included?: unknown;
  columns?: StageColumnMapping[];
};

type StageRequestBody = {
  boards?: StageBoard[];
  mappings?: StageBoardMapping[];
  summary?: unknown;
};

const wadeCrmEmail = "wade@pathfinderinspections.com";
const allowedEntityTypes = new Set(["account", "contact", "opportunity", "activity", "task", "custom_field", "ignored"]);
const allowedMappingStatuses = new Set(["Needs Review", "Mapped", "Ignored"]);

function errorMessage(error: unknown) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }

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
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function isWadeProfile(profile: TitanProfile, authEmail: string | null | undefined) {
  return normalizeText(profile.full_name) === "wade wisenor" || normalizeText(profile.email) === wadeCrmEmail || normalizeText(authEmail) === wadeCrmEmail;
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function safeEntityType(value: unknown) {
  const entity = cleanText(value);
  return allowedEntityTypes.has(entity) ? entity : "custom_field";
}

function safeMappingStatus(value: unknown) {
  const status = cleanText(value);
  return allowedMappingStatuses.has(status) ? status : "Needs Review";
}

function missingCrmTables(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("crm_import_batches") || message.includes("crm_import_board_snapshots") || message.includes("crm_import_column_mappings");
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return Response.json({ error: "You must be signed in to stage CRM mappings." }, { status: 401 });
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
      return Response.json({ error: "CRM import staging is restricted to Wade." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as StageRequestBody;
    const boards = Array.isArray(body.boards) ? body.boards : [];
    const mappings = Array.isArray(body.mappings) ? body.mappings : [];
    const includedMappings = mappings.filter((mapping) => Boolean(mapping.included));

    if (boards.length === 0 || includedMappings.length === 0) {
      return Response.json({ error: "Run discovery and include at least one board before staging." }, { status: 400 });
    }

    const summary = typeof body.summary === "object" && body.summary !== null ? body.summary : {};
    const batchName = `Monday CRM Mapping ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })}`;

    const { data: batch, error: batchError } = await adminSupabase
      .from("crm_import_batches")
      .insert({
        source_system: "monday",
        status: "Mapped",
        name: batchName,
        requested_by: userData.user.id,
        started_at: new Date().toISOString(),
        summary,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      if (missingCrmTables(batchError)) {
        return Response.json({ error: "CRM import tables are missing. Run supabase/titan_crm_foundation.sql in Supabase, then try again." }, { status: 400 });
      }
      throw batchError;
    }

    const batchId = String(batch.id);
    const boardRows = includedMappings.map((mapping) => {
      const boardId = cleanText(mapping.boardId);
      const board = boards.find((entry) => cleanText(entry.id) === boardId);

      return {
        batch_id: batchId,
        monday_board_id: boardId,
        board_name: cleanText(mapping.boardName) || cleanText(board?.name) || "Unnamed Monday board",
        item_count: Number(board?.items_count ?? 0) || 0,
        group_count: countArray(board?.groups),
        column_count: countArray(board?.columns),
        raw_snapshot: board ?? {},
      };
    });

    const { error: boardError } = await adminSupabase.from("crm_import_board_snapshots").insert(boardRows);
    if (boardError) throw boardError;

    const columnRows = includedMappings.flatMap((mapping) => {
      const boardId = cleanText(mapping.boardId);
      const columns = Array.isArray(mapping.columns) ? mapping.columns : [];

      return columns.map((column) => {
        const entityType = safeEntityType(column.titanEntityType);
        const fieldKey = cleanText(column.titanFieldKey);
        const status = entityType === "ignored" || !fieldKey ? "Ignored" : safeMappingStatus(column.mappingStatus);

        return {
          batch_id: batchId,
          monday_board_id: boardId,
          monday_column_id: cleanText(column.mondayColumnId),
          monday_column_title: cleanText(column.mondayColumnTitle) || "Unnamed column",
          monday_column_type: cleanText(column.mondayColumnType) || "unknown",
          titan_entity_type: entityType,
          titan_field_key: fieldKey || null,
          is_custom_field: Boolean(column.isCustomField) || fieldKey === "metadata",
          mapping_status: status,
          notes: cleanText(column.notes) || null,
        };
      });
    });

    const { error: columnError } = await adminSupabase.from("crm_import_column_mappings").insert(columnRows);
    if (columnError) throw columnError;

    await adminSupabase.from("crm_audit_log").insert({
      entity_type: "crm_import_batch",
      entity_id: batchId,
      action: "crm_mapping_staged",
      user_id: userData.user.id,
      after_value: {
        batchId,
        boards: boardRows.length,
        columns: columnRows.length,
        summary,
      },
    });

    return Response.json({
      ok: true,
      batchId,
      boardSnapshots: boardRows.length,
      columnMappings: columnRows.length,
    });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
