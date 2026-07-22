import { createClient } from "@supabase/supabase-js";

type EntityType = "account" | "contact" | "opportunity" | "activity";

type TitanProfile = {
  role?: string | null;
  is_disabled?: boolean | null;
  full_name?: string | null;
  email?: string | null;
};

type CrmMetadata = {
  monday?: Record<string, unknown>;
  unmappedFieldValues?: Record<string, unknown>;
  titanBoardAttachments?: Record<string, Array<Record<string, unknown>>>;
  [key: string]: unknown;
};

type BoardCellBody = {
  recordId?: unknown;
  entityType?: unknown;
  action?: unknown;
  groupName?: unknown;
  column?: unknown;
  value?: unknown;
  fileName?: unknown;
  fileUrl?: unknown;
  source?: unknown;
};

const wadeCrmEmail = "wade@pathfinderinspections.com";
const crmBoardFilesBucket = "crm-board-files";

const crmTables: Record<EntityType, string> = {
  account: "crm_accounts",
  contact: "crm_contacts",
  opportunity: "crm_opportunities",
  activity: "crm_activities",
};

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

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorMessage(error: unknown) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (isObject(error) && typeof error.message === "string") return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function isWadeProfile(profile: TitanProfile, authEmail: string | null | undefined) {
  return normalizeText(profile.full_name) === "wade wisenor" || normalizeText(profile.email) === wadeCrmEmail || normalizeText(authEmail) === wadeCrmEmail;
}

async function authorizeWade(request: Request, adminSupabase: ReturnType<typeof configuredSupabase>) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { error: Response.json({ error: "You must be signed in to update CRM boards." }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: Response.json({ error: "Your session could not be verified." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("role, is_disabled, full_name, email")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: Response.json({ error: "Your TITAN profile could not be loaded." }, { status: 403 }) };
  }

  const profileRow = profile as TitanProfile;
  if (Boolean(profileRow.is_disabled)) {
    return { error: Response.json({ error: "This TITAN account is disabled." }, { status: 403 }) };
  }

  if (!isWadeProfile(profileRow, userData.user.email)) {
    return { error: Response.json({ error: "CRM board edits are restricted to Wade." }, { status: 403 }) };
  }

  return { userId: userData.user.id };
}

function statusFromGroup(groupName: string) {
  const normalized = normalizeText(groupName);
  if (normalized.includes("cancel")) return "Cancelled";
  if (normalized === "completed" || normalized.includes("completed")) return "Won";
  return "Open";
}

function metadataWithGroup(metadata: CrmMetadata, groupName: string) {
  const fields = isObject(metadata.unmappedFieldValues) ? { ...metadata.unmappedFieldValues } : {};
  fields.Status = groupName;

  return {
    ...metadata,
    groupName,
    unmappedFieldValues: fields,
    monday: {
      ...(isObject(metadata.monday) ? metadata.monday : {}),
      groupName,
    },
  };
}

function metadataWithCell(metadata: CrmMetadata, column: string, value: string) {
  const fields = isObject(metadata.unmappedFieldValues) ? { ...metadata.unmappedFieldValues } : {};
  fields[column] = value;

  return {
    ...metadata,
    unmappedFieldValues: fields,
    monday: {
      ...(isObject(metadata.monday) ? metadata.monday : {}),
      ...(normalizeText(column) === "name" ? { itemName: value } : {}),
    },
  };
}

function metadataWithFile(metadata: CrmMetadata, column: string, fileName: string, fileUrl: string, source: string, userId: string) {
  const fields = isObject(metadata.unmappedFieldValues) ? { ...metadata.unmappedFieldValues } : {};
  const currentAttachments = isObject(metadata.titanBoardAttachments) ? metadata.titanBoardAttachments : {};
  const currentList = Array.isArray(currentAttachments[column]) ? currentAttachments[column] : [];
  const attachment = {
    name: fileName,
    url: fileUrl,
    source,
    addedAt: new Date().toISOString(),
    addedBy: userId,
  };
  const nextList = [
    ...currentList.filter((item) => cleanText(item.name || item.url) !== fileName && cleanText(item.name || item.url) !== fileUrl),
    attachment,
  ];

  fields[column] = nextList.map((item) => cleanText(item.name || item.url)).filter(Boolean).join(", ");

  return {
    ...metadata,
    unmappedFieldValues: fields,
    titanBoardAttachments: {
      ...currentAttachments,
      [column]: nextList,
    },
  };
}

function safeStorageName(value: string) {
  return cleanText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "file";
}

async function ensureCrmBoardFilesBucket(adminSupabase: ReturnType<typeof configuredSupabase>) {
  const { error } = await adminSupabase.storage.createBucket(crmBoardFilesBucket, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
  });

  if (error && !normalizeText(error.message).includes("already exists")) {
    throw error;
  }
}

async function uploadCrmBoardFile(adminSupabase: ReturnType<typeof configuredSupabase>, recordId: string, column: string, file: File) {
  await ensureCrmBoardFilesBucket(adminSupabase);

  const extension = safeStorageName(file.name).split(".").pop() ?? "file";
  const path = [
    safeStorageName(recordId),
    safeStorageName(column),
    `${Date.now()}-${crypto.randomUUID()}.${extension}`,
  ].join("/");
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await adminSupabase.storage.from(crmBoardFilesBucket).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) throw error;

  return {
    fileName: file.name,
    fileUrl: `storage://${crmBoardFilesBucket}/${path}`,
    source: "From Computer",
  };
}

async function parseBoardCellBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return {
      body: (await request.json().catch(() => ({}))) as BoardCellBody,
      file: null as File | null,
    };
  }

  const formData = await request.formData();
  const rawFile = formData.get("file");
  const file = rawFile instanceof File ? rawFile : null;
  const body: BoardCellBody = {
    recordId: formData.get("recordId"),
    entityType: formData.get("entityType"),
    action: formData.get("action"),
    groupName: formData.get("groupName"),
    column: formData.get("column"),
    value: formData.get("value"),
    fileName: formData.get("fileName"),
    fileUrl: formData.get("fileUrl"),
    source: formData.get("source"),
  };

  return { body, file };
}

export async function PATCH(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const { body, file } = await parseBoardCellBody(request);
    const recordId = cleanText(body.recordId);
    const entityType = cleanText(body.entityType) as EntityType;
    const action = cleanText(body.action);
    const table = crmTables[entityType];

    if (!recordId || !table) {
      return Response.json({ error: "A valid CRM record is required." }, { status: 400 });
    }

    const { data: row, error: loadError } = await adminSupabase
      .from(table)
      .select("id, metadata")
      .eq("id", recordId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!row) return Response.json({ error: "CRM record was not found." }, { status: 404 });

    const beforeMetadata = isObject(row.metadata) ? (row.metadata as CrmMetadata) : {};
    let nextMetadata: CrmMetadata = { ...beforeMetadata };
    const updatePayload: Record<string, unknown> = {};
    let auditAction = "crm_board_cell_updated";

    if (action === "move_group") {
      const groupName = cleanText(body.groupName);
      if (!groupName) return Response.json({ error: "A target group is required." }, { status: 400 });

      nextMetadata = metadataWithGroup(nextMetadata, groupName);
      updatePayload.metadata = nextMetadata;
      auditAction = "crm_board_row_moved";

      if (entityType === "opportunity") {
        updatePayload.stage = groupName;
        updatePayload.status = statusFromGroup(groupName);
      }
    } else if (action === "set_cell") {
      const column = cleanText(body.column);
      const value = cleanText(body.value);
      const normalizedColumn = normalizeText(column);

      if (!column) {
        return Response.json({ error: "A CRM board column is required." }, { status: 400 });
      }

      nextMetadata = metadataWithCell(nextMetadata, column, value);
      updatePayload.metadata = nextMetadata;
      auditAction = "crm_board_cell_edited";

      if (normalizedColumn === "name") {
        if (entityType === "account") updatePayload.account_name = value || "Untitled account";
        if (entityType === "contact") updatePayload.full_name = value || "Untitled contact";
        if (entityType === "opportunity") updatePayload.opportunity_name = value || "Untitled opportunity";
        if (entityType === "activity") updatePayload.subject = value || "Untitled activity";
      }

      if (normalizedColumn === "status" || normalizedColumn === "stage") {
        if (entityType === "opportunity") {
          updatePayload.stage = value || "Open";
          updatePayload.status = statusFromGroup(value || "Open");
        } else {
          updatePayload.status = value || "Active";
        }
      }

      if (normalizedColumn === "service line" && entityType === "opportunity") {
        updatePayload.pipeline_name = value;
      }
    } else if (action === "set_file") {
      const column = cleanText(body.column);
      const uploaded = file ? await uploadCrmBoardFile(adminSupabase, recordId, column, file) : null;
      const fileName = uploaded?.fileName ?? cleanText(body.fileName);
      const fileUrl = uploaded?.fileUrl ?? cleanText(body.fileUrl);
      const source = (uploaded?.source ?? cleanText(body.source)) || "Manual";

      if (!column || (!fileName && !fileUrl)) {
        return Response.json({ error: "A file column and file name or link are required." }, { status: 400 });
      }

      nextMetadata = metadataWithFile(nextMetadata, column, fileName || fileUrl, fileUrl, source, authorization.userId);
      updatePayload.metadata = nextMetadata;
      auditAction = "crm_board_file_added";
    } else {
      return Response.json({ error: "Unsupported CRM board action." }, { status: 400 });
    }

    const { error: updateError } = await adminSupabase.from(table).update(updatePayload).eq("id", recordId);
    if (updateError) throw updateError;

    await adminSupabase.from("crm_audit_log").insert({
      entity_type: table,
      entity_id: recordId,
      action: auditAction,
      user_id: authorization.userId,
      before_value: beforeMetadata,
      after_value: nextMetadata,
    });

    return Response.json({ ok: true, metadata: nextMetadata, updates: updatePayload });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
