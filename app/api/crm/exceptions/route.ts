import { createClient } from "@supabase/supabase-js";

type TitanProfile = {
  role?: string | null;
  is_disabled?: boolean | null;
  full_name?: string | null;
  email?: string | null;
};

type ExceptionAction = "ignore" | "resolve" | "import_anyway";

type ExceptionRequestBody = {
  id?: unknown;
  action?: unknown;
};

type CrmExceptionRow = {
  id: string;
  batch_id: string;
  entity_type: string;
  monday_board_id: string | null;
  monday_item_id: string | null;
  monday_item_name: string | null;
  action: string;
  reason: string;
  matched_record_id: string | null;
  matched_by: string | null;
  field_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  status: string;
};

const wadeCrmEmail = "wade@pathfinderinspections.com";
const accountStatuses = new Set(["Active", "Inactive", "Prospect", "Do Not Use"]);
const contactStatuses = new Set(["Active", "Inactive", "Do Not Contact"]);
const opportunityStatuses = new Set(["Open", "Won", "Lost", "Cancelled", "Archived"]);
const activityTypes = new Set(["Note", "Call", "Email", "Meeting", "Task", "Status Change", "Import"]);

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

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function isWadeProfile(profile: TitanProfile, authEmail: string | null | undefined) {
  return normalizeText(profile.full_name) === "wade wisenor" || normalizeText(profile.email) === wadeCrmEmail || normalizeText(authEmail) === wadeCrmEmail;
}

async function authorizeWade(request: Request, adminSupabase: ReturnType<typeof configuredSupabase>) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { error: Response.json({ error: "You must be signed in to manage CRM exceptions." }, { status: 401 }) };
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
    return { error: Response.json({ error: "CRM exceptions are restricted to Wade." }, { status: 403 }) };
  }

  return { userId: userData.user.id };
}

function safeAction(value: unknown): ExceptionAction | null {
  const action = cleanText(value);
  if (action === "ignore" || action === "resolve" || action === "import_anyway") return action;
  return null;
}

function safeStatus(value: unknown, allowed: Set<string>, fallback: string) {
  const status = cleanText(value);
  return allowed.has(status) ? status : fallback;
}

function fieldValue(fields: Record<string, unknown>, key: string) {
  return cleanText(fields[key]);
}

function parseMoney(value: unknown) {
  const numeric = Number(cleanText(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseProbability(value: unknown) {
  const numeric = Math.round(parseMoney(value));
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function parseDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseDateTime(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function exceptionExternalId(exception: CrmExceptionRow) {
  return `${cleanText(exception.monday_board_id)}:${cleanText(exception.monday_item_id)}:${cleanText(exception.entity_type)}`;
}

function exceptionMetadata(exception: CrmExceptionRow) {
  return {
    ...(exception.metadata ?? {}),
    exceptionId: exception.id,
    importedFromException: true,
    duplicateMatchedRecordId: exception.matched_record_id,
    duplicateMatchedBy: exception.matched_by,
  };
}

async function importExceptionRecord(adminSupabase: ReturnType<typeof configuredSupabase>, exception: CrmExceptionRow, userId: string) {
  const fields = exception.field_values ?? {};
  const entityType = cleanText(exception.entity_type);
  const externalId = exceptionExternalId(exception);
  const itemName = cleanText(exception.monday_item_name);
  const metadata = exceptionMetadata(exception);

  if (!cleanText(exception.monday_board_id) || !cleanText(exception.monday_item_id)) {
    throw new Error("This exception does not have a Monday board and item ID, so it cannot be imported automatically.");
  }

  if (entityType === "account") {
    const payload = {
      account_name: fieldValue(fields, "account_name") || itemName || "Unnamed account",
      account_number: fieldValue(fields, "account_number") || null,
      status: safeStatus(fields.status, accountStatuses, "Active"),
      industry: fieldValue(fields, "industry") || null,
      phone: fieldValue(fields, "phone") || null,
      website: fieldValue(fields, "website") || null,
      billing_address: fieldValue(fields, "billing_address") || null,
      shipping_address: fieldValue(fields, "shipping_address") || null,
      notes: fieldValue(fields, "notes") || null,
      source_system: "monday",
      external_id: externalId,
      metadata,
      created_by: userId,
    };

    const { data, error } = await adminSupabase.from("crm_accounts").upsert(payload, { onConflict: "source_system,external_id" }).select("id").single();
    if (error) throw error;
    return { entityType, id: String(data?.id ?? "") };
  }

  if (entityType === "contact") {
    const payload = {
      full_name: fieldValue(fields, "full_name") || itemName || "Unnamed contact",
      title: fieldValue(fields, "title") || null,
      email: fieldValue(fields, "email") || null,
      phone: fieldValue(fields, "phone") || null,
      mobile: fieldValue(fields, "mobile") || null,
      status: safeStatus(fields.status, contactStatuses, "Active"),
      source_system: "monday",
      external_id: externalId,
      metadata,
      created_by: userId,
    };

    const { data, error } = await adminSupabase.from("crm_contacts").upsert(payload, { onConflict: "source_system,external_id" }).select("id").single();
    if (error) throw error;
    return { entityType, id: String(data?.id ?? "") };
  }

  if (entityType === "opportunity") {
    const payload = {
      opportunity_name: fieldValue(fields, "opportunity_name") || itemName || "Unnamed opportunity",
      pipeline_name: fieldValue(fields, "pipeline_name") || "Sales Pipeline",
      stage: fieldValue(fields, "stage") || "New",
      status: safeStatus(fields.status, opportunityStatuses, "Open"),
      estimated_value: parseMoney(fields.estimated_value),
      probability: parseProbability(fields.probability),
      expected_close_date: parseDate(fields.expected_close_date),
      source_system: "monday",
      external_id: externalId,
      metadata,
      created_by: userId,
    };

    const { data, error } = await adminSupabase.from("crm_opportunities").upsert(payload, { onConflict: "source_system,external_id" }).select("id").single();
    if (error) throw error;
    return { entityType, id: String(data?.id ?? "") };
  }

  if (entityType === "activity" || entityType === "task") {
    const defaultType = entityType === "task" ? "Task" : "Import";
    const requestedType = fieldValue(fields, "activity_type") || fieldValue(fields, "type") || defaultType;
    const payload = {
      activity_type: safeStatus(requestedType, activityTypes, defaultType),
      subject: fieldValue(fields, "subject") || itemName || "Unnamed activity",
      body: fieldValue(fields, "body") || fieldValue(fields, "notes") || null,
      due_at: parseDateTime(fieldValue(fields, "due_at") || fieldValue(fields, "due_date")),
      completed_at: parseDateTime(fieldValue(fields, "completed_at") || fieldValue(fields, "completed_date")),
      source_system: "monday",
      external_id: externalId,
      metadata,
      created_by: userId,
    };

    const { data, error } = await adminSupabase.from("crm_activities").upsert(payload, { onConflict: "source_system,external_id" }).select("id").single();
    if (error) throw error;
    return { entityType: "activity", id: String(data?.id ?? "") };
  }

  throw new Error(`CRM exception entity type ${entityType || "unknown"} cannot be imported automatically.`);
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const body = (await request.json().catch(() => ({}))) as ExceptionRequestBody;
    const id = cleanText(body.id);
    const action = safeAction(body.action);

    if (!id || !action) {
      return Response.json({ error: "Exception ID and action are required." }, { status: 400 });
    }

    const { data: exception, error: exceptionError } = await adminSupabase
      .from("crm_import_exceptions")
      .select("id, batch_id, entity_type, monday_board_id, monday_item_id, monday_item_name, action, reason, matched_record_id, matched_by, field_values, metadata, status")
      .eq("id", id)
      .maybeSingle();

    if (exceptionError) throw exceptionError;
    if (!exception) return Response.json({ error: "CRM exception was not found." }, { status: 404 });

    const exceptionRow = exception as CrmExceptionRow;
    let importedRecord: { entityType: string; id: string } | null = null;
    let nextStatus = "Resolved";

    if (action === "ignore") nextStatus = "Ignored";
    if (action === "import_anyway") importedRecord = await importExceptionRecord(adminSupabase, exceptionRow, authorization.userId);

    const nextMetadata = {
      ...(exceptionRow.metadata ?? {}),
      lastAction: action,
      importedRecord,
      handledBy: authorization.userId,
      handledAt: new Date().toISOString(),
    };

    const { error: updateError } = await adminSupabase
      .from("crm_import_exceptions")
      .update({
        status: nextStatus,
        metadata: nextMetadata,
      })
      .eq("id", id);

    if (updateError) throw updateError;

    await adminSupabase.from("crm_audit_log").insert({
      entity_type: "crm_import_exception",
      entity_id: id,
      action: `crm_exception_${action}`,
      user_id: authorization.userId,
      before_value: exceptionRow,
      after_value: {
        status: nextStatus,
        importedRecord,
      },
    });

    return Response.json({
      ok: true,
      id,
      status: nextStatus,
      importedRecord,
    });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
