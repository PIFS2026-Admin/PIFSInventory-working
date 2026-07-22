import { createClient } from "@supabase/supabase-js";

type TitanProfile = {
  role?: string | null;
  is_disabled?: boolean | null;
  full_name?: string | null;
  email?: string | null;
};

type DryRunRequestBody = {
  batchId?: unknown;
};

type SnapshotRow = {
  id: string;
  batch_id: string;
  monday_board_id: string;
  board_name: string;
  raw_snapshot: MondayBoardSnapshot;
};

type MappingRow = {
  id: string;
  batch_id: string;
  monday_board_id: string;
  monday_column_id: string;
  monday_column_title: string;
  titan_entity_type: string;
  titan_field_key: string | null;
  mapping_status: string;
};

type MondayBoardSnapshot = {
  id?: string;
  name?: string;
  items_page?: {
    items?: MondayItem[];
  };
};

type MondayItem = {
  id?: string;
  name?: string;
  group?: { id?: string; title?: string } | null;
  column_values?: Array<{ id?: string; text?: string | null }>;
};

type ExistingAccount = {
  id: string;
  account_name: string | null;
  source_system: string | null;
  external_id: string | null;
};

type ExistingContact = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  source_system: string | null;
  external_id: string | null;
};

type ExistingOpportunity = {
  id: string;
  opportunity_name: string | null;
  source_system: string | null;
  external_id: string | null;
};

type ExistingActivity = {
  id: string;
  subject: string | null;
  source_system: string | null;
  external_id: string | null;
};

type DryRunAction = "create" | "update_existing" | "possible_duplicate" | "skip";

type DryRunRow = {
  key: string;
  action: DryRunAction;
  entityType: string;
  boardName: string;
  mondayBoardId: string;
  mondayItemId: string;
  mondayItemName: string;
  mondayGroupName: string;
  externalId: string;
  primaryValue: string;
  matchedRecordId: string | null;
  matchedBy: string | null;
  fieldValues: Record<string, string>;
  metadata: Record<string, string>;
  warnings: string[];
};

const wadeCrmEmail = "wade@pathfinderinspections.com";
const importEntityTypes = new Set(["account", "contact", "opportunity", "activity", "task"]);

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
    return { error: Response.json({ error: "You must be signed in to dry-run CRM imports." }, { status: 401 }) };
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
    return { error: Response.json({ error: "CRM import dry-run is restricted to Wade." }, { status: 403 }) };
  }

  return { userId: userData.user.id };
}

function itemColumnText(item: MondayItem, columnId: string) {
  return cleanText(item.column_values?.find((column) => column.id === columnId)?.text);
}

function externalId(boardId: string, itemId: string, entityType: string) {
  return `${boardId}:${itemId}:${entityType}`;
}

function mappedValues(item: MondayItem, mappings: MappingRow[]) {
  const fieldValues: Record<string, string> = {};
  const metadata: Record<string, string> = {};

  mappings.forEach((mapping) => {
    const value = itemColumnText(item, mapping.monday_column_id);
    if (!value) return;

    const fieldKey = cleanText(mapping.titan_field_key);
    if (!fieldKey || fieldKey === "metadata") {
      metadata[mapping.monday_column_title] = value;
      return;
    }

    if (!fieldValues[fieldKey]) fieldValues[fieldKey] = value;
    else metadata[mapping.monday_column_title] = value;
  });

  return { fieldValues, metadata };
}

function matchAccount(fieldValues: Record<string, string>, external: string, accounts: ExistingAccount[]) {
  const externalMatch = accounts.find((account) => account.source_system === "monday" && account.external_id === external);
  if (externalMatch) return { action: "update_existing" as DryRunAction, matchedRecordId: externalMatch.id, matchedBy: "Monday external ID" };

  const accountName = normalizeText(fieldValues.account_name);
  if (accountName) {
    const nameMatch = accounts.find((account) => normalizeText(account.account_name) === accountName);
    if (nameMatch) return { action: "possible_duplicate" as DryRunAction, matchedRecordId: nameMatch.id, matchedBy: "Account name" };
  }

  return { action: "create" as DryRunAction, matchedRecordId: null, matchedBy: null };
}

function matchContact(fieldValues: Record<string, string>, external: string, contacts: ExistingContact[]) {
  const externalMatch = contacts.find((contact) => contact.source_system === "monday" && contact.external_id === external);
  if (externalMatch) return { action: "update_existing" as DryRunAction, matchedRecordId: externalMatch.id, matchedBy: "Monday external ID" };

  const email = normalizeText(fieldValues.email);
  if (email) {
    const emailMatch = contacts.find((contact) => normalizeText(contact.email) === email);
    if (emailMatch) return { action: "possible_duplicate" as DryRunAction, matchedRecordId: emailMatch.id, matchedBy: "Email" };
  }

  const phone = normalizeText(fieldValues.phone || fieldValues.mobile);
  const name = normalizeText(fieldValues.full_name);
  if (name && phone) {
    const phoneMatch = contacts.find((contact) => normalizeText(contact.full_name) === name && [contact.phone, contact.mobile].some((value) => normalizeText(value) === phone));
    if (phoneMatch) return { action: "possible_duplicate" as DryRunAction, matchedRecordId: phoneMatch.id, matchedBy: "Name and phone" };
  }

  return { action: "create" as DryRunAction, matchedRecordId: null, matchedBy: null };
}

function matchOpportunity(fieldValues: Record<string, string>, external: string, opportunities: ExistingOpportunity[]) {
  const externalMatch = opportunities.find((opportunity) => opportunity.source_system === "monday" && opportunity.external_id === external);
  if (externalMatch) return { action: "update_existing" as DryRunAction, matchedRecordId: externalMatch.id, matchedBy: "Monday external ID" };

  const opportunityName = normalizeText(fieldValues.opportunity_name);
  if (opportunityName) {
    const nameMatch = opportunities.find((opportunity) => normalizeText(opportunity.opportunity_name) === opportunityName);
    if (nameMatch) return { action: "possible_duplicate" as DryRunAction, matchedRecordId: nameMatch.id, matchedBy: "Opportunity name" };
  }

  return { action: "create" as DryRunAction, matchedRecordId: null, matchedBy: null };
}

function matchActivity(fieldValues: Record<string, string>, external: string, activities: ExistingActivity[]) {
  const externalMatch = activities.find((activity) => activity.source_system === "monday" && activity.external_id === external);
  if (externalMatch) return { action: "update_existing" as DryRunAction, matchedRecordId: externalMatch.id, matchedBy: "Monday external ID" };

  const subject = normalizeText(fieldValues.subject);
  if (subject) {
    const subjectMatch = activities.find((activity) => normalizeText(activity.subject) === subject);
    if (subjectMatch) return { action: "possible_duplicate" as DryRunAction, matchedRecordId: subjectMatch.id, matchedBy: "Activity subject" };
  }

  return { action: "create" as DryRunAction, matchedRecordId: null, matchedBy: null };
}

function validateRow(entityType: string, item: MondayItem, fieldValues: Record<string, string>) {
  const warnings: string[] = [];

  if (entityType === "account" && !fieldValues.account_name) {
    fieldValues.account_name = cleanText(item.name);
    warnings.push("Used Monday item name as account name");
  }

  if (entityType === "contact" && !fieldValues.full_name) {
    fieldValues.full_name = cleanText(item.name);
    warnings.push("Used Monday item name as contact name");
  }

  if (entityType === "opportunity" && !fieldValues.opportunity_name) {
    fieldValues.opportunity_name = cleanText(item.name);
    warnings.push("Used Monday item name as opportunity name");
  }

  if ((entityType === "activity" || entityType === "task") && !fieldValues.subject) {
    fieldValues.subject = cleanText(item.name);
    warnings.push("Used Monday item name as subject");
  }

  if (entityType === "contact" && !fieldValues.email && !fieldValues.phone && !fieldValues.mobile) {
    warnings.push("Contact has no email or phone");
  }

  if (entityType === "opportunity" && !fieldValues.account_name) {
    warnings.push("Opportunity has no related account mapping");
  }

  return warnings;
}

function summarize(rows: DryRunRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      summary[row.action] += 1;
      summary.warnings += row.warnings.length;
      return summary;
    },
    {
      total: 0,
      create: 0,
      update_existing: 0,
      possible_duplicate: 0,
      skip: 0,
      warnings: 0,
    },
  );
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const body = (await request.json().catch(() => ({}))) as DryRunRequestBody;
    const batchId = cleanText(body.batchId);

    if (!batchId) {
      return Response.json({ error: "A staged CRM batch ID is required for dry-run." }, { status: 400 });
    }

    const [{ data: batch, error: batchError }, { data: snapshots, error: snapshotsError }, { data: mappings, error: mappingsError }] = await Promise.all([
      adminSupabase.from("crm_import_batches").select("id, status, name, summary").eq("id", batchId).maybeSingle(),
      adminSupabase.from("crm_import_board_snapshots").select("id, batch_id, monday_board_id, board_name, raw_snapshot").eq("batch_id", batchId),
      adminSupabase
        .from("crm_import_column_mappings")
        .select("id, batch_id, monday_board_id, monday_column_id, monday_column_title, titan_entity_type, titan_field_key, mapping_status")
        .eq("batch_id", batchId),
    ]);

    if (batchError) throw batchError;
    if (!batch) return Response.json({ error: "CRM import batch was not found." }, { status: 404 });
    if (snapshotsError) throw snapshotsError;
    if (mappingsError) throw mappingsError;

    const [{ data: accounts }, { data: contacts }, { data: opportunities }, { data: activities }] = await Promise.all([
      adminSupabase.from("crm_accounts").select("id, account_name, source_system, external_id"),
      adminSupabase.from("crm_contacts").select("id, full_name, email, phone, mobile, source_system, external_id"),
      adminSupabase.from("crm_opportunities").select("id, opportunity_name, source_system, external_id"),
      adminSupabase.from("crm_activities").select("id, subject, source_system, external_id"),
    ]);

    const rows: DryRunRow[] = [];
    const mappingRows = ((mappings ?? []) as MappingRow[]).filter((mapping) => mapping.mapping_status !== "Ignored" && importEntityTypes.has(mapping.titan_entity_type));

    ((snapshots ?? []) as SnapshotRow[]).forEach((snapshot) => {
      const boardMappings = mappingRows.filter((mapping) => mapping.monday_board_id === snapshot.monday_board_id);
      const entityTypes = Array.from(new Set(boardMappings.map((mapping) => mapping.titan_entity_type)));
      const items = snapshot.raw_snapshot?.items_page?.items ?? [];

      items.forEach((item) => {
        const itemId = cleanText(item.id);
        if (!itemId) return;

        entityTypes.forEach((entityType) => {
          const entityMappings = boardMappings.filter((mapping) => mapping.titan_entity_type === entityType);
          if (entityMappings.length === 0) return;

          const external = externalId(snapshot.monday_board_id, itemId, entityType);
          const { fieldValues, metadata } = mappedValues(item, entityMappings);
          const warnings = validateRow(entityType, item, fieldValues);
          let match = { action: "create" as DryRunAction, matchedRecordId: null as string | null, matchedBy: null as string | null };

          if (entityType === "account") match = matchAccount(fieldValues, external, (accounts ?? []) as ExistingAccount[]);
          if (entityType === "contact") match = matchContact(fieldValues, external, (contacts ?? []) as ExistingContact[]);
          if (entityType === "opportunity") match = matchOpportunity(fieldValues, external, (opportunities ?? []) as ExistingOpportunity[]);
          if (entityType === "activity" || entityType === "task") match = matchActivity(fieldValues, external, (activities ?? []) as ExistingActivity[]);

          const primaryValue =
            fieldValues.account_name ||
            fieldValues.full_name ||
            fieldValues.opportunity_name ||
            fieldValues.subject ||
            cleanText(item.name) ||
            external;

          rows.push({
            key: external,
            action: warnings.includes("No mapped columns") ? "skip" : match.action,
            entityType,
            boardName: snapshot.board_name,
            mondayBoardId: snapshot.monday_board_id,
            mondayItemId: itemId,
            mondayItemName: cleanText(item.name),
            mondayGroupName: cleanText(item.group?.title),
            externalId: external,
            primaryValue,
            matchedRecordId: match.matchedRecordId,
            matchedBy: match.matchedBy,
            fieldValues,
            metadata,
            warnings,
          });
        });
      });
    });

    const summary = summarize(rows);
    const nextSummary = {
      ...(typeof batch.summary === "object" && batch.summary !== null ? batch.summary : {}),
      dryRun: {
        ...summary,
        generatedAt: new Date().toISOString(),
      },
    };

    await adminSupabase
      .from("crm_import_batches")
      .update({
        status: "Dry Run",
        summary: nextSummary,
        completed_at: null,
      })
      .eq("id", batchId);

    await adminSupabase.from("crm_audit_log").insert({
      entity_type: "crm_import_batch",
      entity_id: batchId,
      action: "crm_import_dry_run",
      user_id: authorization.userId,
      after_value: {
        batchId,
        summary,
      },
    });

    return Response.json({
      ok: true,
      batchId,
      batchName: batch.name,
      summary,
      rows: rows.slice(0, 500),
    });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
