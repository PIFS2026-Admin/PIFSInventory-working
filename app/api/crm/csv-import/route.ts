import { createClient } from "@supabase/supabase-js";

type TitanProfile = {
  role?: string | null;
  is_disabled?: boolean | null;
  full_name?: string | null;
  email?: string | null;
};

type CsvEntityType = "account" | "contact" | "opportunity" | "activity" | "task";

type CsvMapping = {
  csvHeader?: unknown;
  titanFieldKey?: unknown;
  mappingStatus?: unknown;
};

type CsvImportRequestBody = {
  entityType?: unknown;
  sourceLabel?: unknown;
  fileName?: unknown;
  rows?: unknown;
  mappings?: unknown;
};

type CsvRow = Record<string, string>;

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

type ImportAction = "create" | "update_existing" | "possible_duplicate" | "skip";

type ImportRow = {
  key: string;
  action: ImportAction;
  entityType: CsvEntityType;
  sourceKey: string;
  sourceLabel: string;
  sourceRowId: string;
  sourceRowName: string;
  externalId: string;
  primaryValue: string;
  matchedRecordId: string | null;
  matchedBy: string | null;
  fieldValues: Record<string, string>;
  metadata: Record<string, string>;
  warnings: string[];
};

const wadeCrmEmail = "wade@pathfinderinspections.com";
const csvEntityTypes = new Set<CsvEntityType>(["account", "contact", "opportunity", "activity", "task"]);
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

function slugText(value: unknown) {
  const slug = normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || "csv";
}

function isWadeProfile(profile: TitanProfile, authEmail: string | null | undefined) {
  return normalizeText(profile.full_name) === "wade wisenor" || normalizeText(profile.email) === wadeCrmEmail || normalizeText(authEmail) === wadeCrmEmail;
}

async function authorizeWade(request: Request, adminSupabase: ReturnType<typeof configuredSupabase>) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { error: Response.json({ error: "You must be signed in to import CRM CSV files." }, { status: 401 }) };
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
    return { error: Response.json({ error: "CRM CSV import is restricted to Wade." }, { status: 403 }) };
  }

  return { userId: userData.user.id };
}

function coerceRows(value: unknown): CsvRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) =>
      Object.fromEntries(
        Object.entries(entry).map(([key, rowValue]) => [cleanText(key), cleanText(rowValue)]),
      ),
    )
    .filter((entry) => Object.values(entry).some((rowValue) => cleanText(rowValue)));
}

function coerceMappings(value: unknown): Array<{ csvHeader: string; titanFieldKey: string; mappingStatus: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is CsvMapping => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      csvHeader: cleanText(entry.csvHeader),
      titanFieldKey: cleanText(entry.titanFieldKey),
      mappingStatus: cleanText(entry.mappingStatus),
    }))
    .filter((entry) => entry.csvHeader && entry.mappingStatus !== "Ignored" && entry.titanFieldKey);
}

function rowIdentifier(row: CsvRow, index: number) {
  const idEntry = Object.entries(row).find(([header, value]) => {
    const normalizedHeader = normalizeText(header);
    return value && ["id", "item id", "item_id", "pulse id", "pulse_id", "monday id", "monday_item_id"].includes(normalizedHeader);
  });

  return cleanText(idEntry?.[1]) || `row-${index + 1}`;
}

function sourceRowName(row: CsvRow, fieldValues: Record<string, string>, entityType: CsvEntityType, index: number) {
  const namedHeader = Object.entries(row).find(([header, value]) => {
    const normalizedHeader = normalizeText(header);
    return value && ["name", "item", "item name", "company", "customer", "contact", "lead", "opportunity"].includes(normalizedHeader);
  });

  return (
    fieldValues.account_name ||
    fieldValues.full_name ||
    fieldValues.opportunity_name ||
    fieldValues.subject ||
    cleanText(namedHeader?.[1]) ||
    `${entityType} row ${index + 1}`
  );
}

function mappedValues(row: CsvRow, mappings: Array<{ csvHeader: string; titanFieldKey: string }>) {
  const fieldValues: Record<string, string> = {};
  const metadata: Record<string, string> = {};

  mappings.forEach((mapping) => {
    const value = cleanText(row[mapping.csvHeader]);
    if (!value) return;

    if (mapping.titanFieldKey === "metadata") {
      metadata[mapping.csvHeader] = value;
      return;
    }

    if (!fieldValues[mapping.titanFieldKey]) fieldValues[mapping.titanFieldKey] = value;
    else metadata[mapping.csvHeader] = value;
  });

  return { fieldValues, metadata };
}

function validateRow(entityType: CsvEntityType, rowName: string, fieldValues: Record<string, string>) {
  const warnings: string[] = [];

  if (entityType === "account" && !fieldValues.account_name) {
    fieldValues.account_name = rowName;
    warnings.push("Used CSV row name as account name");
  }

  if (entityType === "contact" && !fieldValues.full_name) {
    fieldValues.full_name = rowName;
    warnings.push("Used CSV row name as contact name");
  }

  if (entityType === "opportunity" && !fieldValues.opportunity_name) {
    fieldValues.opportunity_name = rowName;
    warnings.push("Used CSV row name as opportunity name");
  }

  if ((entityType === "activity" || entityType === "task") && !fieldValues.subject) {
    fieldValues.subject = rowName;
    warnings.push("Used CSV row name as subject");
  }

  if (entityType === "contact" && !fieldValues.email && !fieldValues.phone && !fieldValues.mobile) {
    warnings.push("Contact has no email or phone");
  }

  if (entityType === "opportunity" && !fieldValues.account_name) {
    warnings.push("Opportunity has no related account mapping");
  }

  return warnings;
}

function matchAccount(fieldValues: Record<string, string>, external: string, accounts: ExistingAccount[]) {
  const externalMatch = accounts.find((account) => account.source_system === "monday_csv" && account.external_id === external);
  if (externalMatch) return { action: "update_existing" as ImportAction, matchedRecordId: externalMatch.id, matchedBy: "CSV external ID" };

  const accountName = normalizeText(fieldValues.account_name);
  if (accountName) {
    const nameMatch = accounts.find((account) => normalizeText(account.account_name) === accountName);
    if (nameMatch) return { action: "possible_duplicate" as ImportAction, matchedRecordId: nameMatch.id, matchedBy: "Account name" };
  }

  return { action: "create" as ImportAction, matchedRecordId: null, matchedBy: null };
}

function matchContact(fieldValues: Record<string, string>, external: string, contacts: ExistingContact[]) {
  const externalMatch = contacts.find((contact) => contact.source_system === "monday_csv" && contact.external_id === external);
  if (externalMatch) return { action: "update_existing" as ImportAction, matchedRecordId: externalMatch.id, matchedBy: "CSV external ID" };

  const email = normalizeText(fieldValues.email);
  if (email) {
    const emailMatch = contacts.find((contact) => normalizeText(contact.email) === email);
    if (emailMatch) return { action: "possible_duplicate" as ImportAction, matchedRecordId: emailMatch.id, matchedBy: "Email" };
  }

  const phone = normalizeText(fieldValues.phone || fieldValues.mobile);
  const name = normalizeText(fieldValues.full_name);
  if (name && phone) {
    const phoneMatch = contacts.find((contact) => normalizeText(contact.full_name) === name && [contact.phone, contact.mobile].some((value) => normalizeText(value) === phone));
    if (phoneMatch) return { action: "possible_duplicate" as ImportAction, matchedRecordId: phoneMatch.id, matchedBy: "Name and phone" };
  }

  return { action: "create" as ImportAction, matchedRecordId: null, matchedBy: null };
}

function matchOpportunity(fieldValues: Record<string, string>, external: string, opportunities: ExistingOpportunity[]) {
  const externalMatch = opportunities.find((opportunity) => opportunity.source_system === "monday_csv" && opportunity.external_id === external);
  if (externalMatch) return { action: "update_existing" as ImportAction, matchedRecordId: externalMatch.id, matchedBy: "CSV external ID" };

  const opportunityName = normalizeText(fieldValues.opportunity_name);
  if (opportunityName) {
    const nameMatch = opportunities.find((opportunity) => normalizeText(opportunity.opportunity_name) === opportunityName);
    if (nameMatch) return { action: "possible_duplicate" as ImportAction, matchedRecordId: nameMatch.id, matchedBy: "Opportunity name" };
  }

  return { action: "create" as ImportAction, matchedRecordId: null, matchedBy: null };
}

function matchActivity(fieldValues: Record<string, string>, external: string, activities: ExistingActivity[]) {
  const externalMatch = activities.find((activity) => activity.source_system === "monday_csv" && activity.external_id === external);
  if (externalMatch) return { action: "update_existing" as ImportAction, matchedRecordId: externalMatch.id, matchedBy: "CSV external ID" };

  const subject = normalizeText(fieldValues.subject);
  if (subject) {
    const subjectMatch = activities.find((activity) => normalizeText(activity.subject) === subject);
    if (subjectMatch) return { action: "possible_duplicate" as ImportAction, matchedRecordId: subjectMatch.id, matchedBy: "Activity subject" };
  }

  return { action: "create" as ImportAction, matchedRecordId: null, matchedBy: null };
}

function applyUploadDuplicateChecks(rows: ImportRow[]) {
  const seen = new Map<string, ImportRow>();

  return rows.map((row) => {
    const duplicateKey =
      row.entityType === "account"
        ? `account:${normalizeText(row.fieldValues.account_name)}`
        : row.entityType === "contact"
          ? `contact:${normalizeText(row.fieldValues.email || `${row.fieldValues.full_name}:${row.fieldValues.phone || row.fieldValues.mobile}`)}`
          : row.entityType === "opportunity"
            ? `opportunity:${normalizeText(row.fieldValues.opportunity_name)}`
            : `activity:${normalizeText(row.fieldValues.subject)}`;

    if (!duplicateKey.endsWith(":") && seen.has(duplicateKey) && row.action === "create") {
      const original = seen.get(duplicateKey);
      return {
        ...row,
        action: "possible_duplicate" as ImportAction,
        matchedRecordId: original?.matchedRecordId ?? null,
        matchedBy: "Duplicate inside CSV upload",
      };
    }

    if (!duplicateKey.endsWith(":")) seen.set(duplicateKey, row);
    return row;
  });
}

function buildImportRows(
  entityType: CsvEntityType,
  sourceKey: string,
  sourceLabel: string,
  rows: CsvRow[],
  mappings: Array<{ csvHeader: string; titanFieldKey: string }>,
  existing: {
    accounts: ExistingAccount[];
    contacts: ExistingContact[];
    opportunities: ExistingOpportunity[];
    activities: ExistingActivity[];
  },
) {
  const importRows = rows.map((row, index) => {
    const sourceRowId = rowIdentifier(row, index);
    const csvExternalId = `${sourceKey}:${sourceRowId}:${entityType}`;
    const { fieldValues, metadata } = mappedValues(row, mappings);
    const rowName = sourceRowName(row, fieldValues, entityType, index);
    const warnings = validateRow(entityType, rowName, fieldValues);
    let match = { action: "create" as ImportAction, matchedRecordId: null as string | null, matchedBy: null as string | null };

    if (entityType === "account") match = matchAccount(fieldValues, csvExternalId, existing.accounts);
    if (entityType === "contact") match = matchContact(fieldValues, csvExternalId, existing.contacts);
    if (entityType === "opportunity") match = matchOpportunity(fieldValues, csvExternalId, existing.opportunities);
    if (entityType === "activity" || entityType === "task") match = matchActivity(fieldValues, csvExternalId, existing.activities);

    const primaryValue =
      fieldValues.account_name ||
      fieldValues.full_name ||
      fieldValues.opportunity_name ||
      fieldValues.subject ||
      rowName ||
      csvExternalId;

    return {
      key: csvExternalId,
      action: match.action,
      entityType,
      sourceKey,
      sourceLabel,
      sourceRowId,
      sourceRowName: rowName,
      externalId: csvExternalId,
      primaryValue,
      matchedRecordId: match.matchedRecordId,
      matchedBy: match.matchedBy,
      fieldValues,
      metadata,
      warnings,
    };
  });

  return applyUploadDuplicateChecks(importRows);
}

function safeStatus(value: unknown, allowed: Set<string>, fallback: string) {
  const status = cleanText(value);
  return allowed.has(status) ? status : fallback;
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

function baseMetadata(row: ImportRow) {
  return {
    ...row.metadata,
    mondayCsv: {
      sourceKey: row.sourceKey,
      sourceLabel: row.sourceLabel,
      rowId: row.sourceRowId,
      rowName: row.sourceRowName,
    },
    monday: {
      boardId: row.sourceKey,
      boardName: row.sourceLabel,
      itemId: row.sourceRowId,
      itemName: row.sourceRowName,
    },
    unmappedFieldValues: row.fieldValues,
    warnings: row.warnings,
  };
}

function accountPayload(row: ImportRow, userId: string) {
  return {
    account_name: row.fieldValues.account_name || row.sourceRowName || row.primaryValue,
    account_number: row.fieldValues.account_number || null,
    status: safeStatus(row.fieldValues.status, accountStatuses, "Active"),
    industry: row.fieldValues.industry || null,
    phone: row.fieldValues.phone || null,
    website: row.fieldValues.website || null,
    billing_address: row.fieldValues.billing_address || null,
    shipping_address: row.fieldValues.shipping_address || null,
    notes: row.fieldValues.notes || null,
    source_system: "monday_csv",
    external_id: row.externalId,
    metadata: baseMetadata(row),
    created_by: userId,
  };
}

function contactPayload(row: ImportRow, userId: string) {
  return {
    full_name: row.fieldValues.full_name || row.sourceRowName || row.primaryValue,
    title: row.fieldValues.title || null,
    email: row.fieldValues.email || null,
    phone: row.fieldValues.phone || null,
    mobile: row.fieldValues.mobile || null,
    status: safeStatus(row.fieldValues.status, contactStatuses, "Active"),
    source_system: "monday_csv",
    external_id: row.externalId,
    metadata: {
      ...baseMetadata(row),
      relatedAccountName: row.fieldValues.account_name || null,
    },
    created_by: userId,
  };
}

function opportunityPayload(row: ImportRow, userId: string) {
  return {
    opportunity_name: row.fieldValues.opportunity_name || row.sourceRowName || row.primaryValue,
    pipeline_name: row.fieldValues.pipeline_name || "Sales Pipeline",
    stage: row.fieldValues.stage || "New",
    status: safeStatus(row.fieldValues.status, opportunityStatuses, "Open"),
    estimated_value: parseMoney(row.fieldValues.estimated_value),
    probability: parseProbability(row.fieldValues.probability),
    expected_close_date: parseDate(row.fieldValues.expected_close_date),
    source_system: "monday_csv",
    external_id: row.externalId,
    metadata: {
      ...baseMetadata(row),
      relatedAccountName: row.fieldValues.account_name || null,
      relatedContactName: row.fieldValues.contact_name || null,
    },
    created_by: userId,
  };
}

function activityPayload(row: ImportRow, userId: string) {
  const defaultType = row.entityType === "task" ? "Task" : "Import";
  const requestedType = row.fieldValues.activity_type || row.fieldValues.type;

  return {
    activity_type: safeStatus(requestedType || defaultType, activityTypes, defaultType),
    subject: row.fieldValues.subject || row.sourceRowName || row.primaryValue,
    body: row.fieldValues.body || row.fieldValues.notes || null,
    due_at: parseDateTime(row.fieldValues.due_at || row.fieldValues.due_date),
    completed_at: parseDateTime(row.fieldValues.completed_at || row.fieldValues.completed_date),
    source_system: "monday_csv",
    external_id: row.externalId,
    metadata: {
      ...baseMetadata(row),
      relatedAccountName: row.fieldValues.account_name || null,
      relatedContactName: row.fieldValues.contact_name || null,
      relatedOpportunityName: row.fieldValues.opportunity_name || null,
    },
    created_by: userId,
  };
}

async function insertException(adminSupabase: ReturnType<typeof configuredSupabase>, row: ImportRow, batchId: string, userId: string, reason: string) {
  const { error } = await adminSupabase.from("crm_import_exceptions").insert({
    batch_id: batchId,
    source_system: "monday_csv",
    entity_type: row.entityType,
    monday_board_id: row.sourceKey,
    monday_item_id: row.sourceRowId,
    monday_item_name: row.sourceRowName,
    action: row.action,
    reason,
    matched_record_id: row.matchedRecordId,
    matched_by: row.matchedBy,
    field_values: row.fieldValues,
    metadata: {
      ...row.metadata,
      sourceLabel: row.sourceLabel,
      primaryValue: row.primaryValue,
      warnings: row.warnings,
    },
    created_by: userId,
  });

  if (error) throw error;
}

async function createOrUpdateRow(adminSupabase: ReturnType<typeof configuredSupabase>, row: ImportRow, userId: string) {
  if (row.entityType === "account") {
    const payload = accountPayload(row, userId);
    if (row.action === "update_existing" && row.matchedRecordId) {
      const { data, error } = await adminSupabase.from("crm_accounts").update(payload).eq("id", row.matchedRecordId).select("id").single();
      if (error) throw error;
      return { skipped: false, id: String(data?.id ?? row.matchedRecordId) };
    }

    const { data, error } = await adminSupabase.from("crm_accounts").upsert(payload, { onConflict: "source_system,external_id" }).select("id").single();
    if (error) throw error;
    return { skipped: false, id: String(data?.id ?? "") };
  }

  if (row.entityType === "contact") {
    const payload = contactPayload(row, userId);
    if (row.action === "update_existing" && row.matchedRecordId) {
      const { data, error } = await adminSupabase.from("crm_contacts").update(payload).eq("id", row.matchedRecordId).select("id").single();
      if (error) throw error;
      return { skipped: false, id: String(data?.id ?? row.matchedRecordId) };
    }

    const { data, error } = await adminSupabase.from("crm_contacts").upsert(payload, { onConflict: "source_system,external_id" }).select("id").single();
    if (error) throw error;
    return { skipped: false, id: String(data?.id ?? "") };
  }

  if (row.entityType === "opportunity") {
    const payload = opportunityPayload(row, userId);
    if (row.action === "update_existing" && row.matchedRecordId) {
      const { data, error } = await adminSupabase.from("crm_opportunities").update(payload).eq("id", row.matchedRecordId).select("id").single();
      if (error) throw error;
      return { skipped: false, id: String(data?.id ?? row.matchedRecordId) };
    }

    const { data, error } = await adminSupabase.from("crm_opportunities").upsert(payload, { onConflict: "source_system,external_id" }).select("id").single();
    if (error) throw error;
    return { skipped: false, id: String(data?.id ?? "") };
  }

  const payload = activityPayload(row, userId);
  if (row.action === "update_existing" && row.matchedRecordId) {
    const { data, error } = await adminSupabase.from("crm_activities").update(payload).eq("id", row.matchedRecordId).select("id").single();
    if (error) throw error;
    return { skipped: false, id: String(data?.id ?? row.matchedRecordId) };
  }

  const { data, error } = await adminSupabase.from("crm_activities").upsert(payload, { onConflict: "source_system,external_id" }).select("id").single();
  if (error) throw error;
  return { skipped: false, id: String(data?.id ?? "") };
}

function summarize(rows: ImportRow[]) {
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

    const body = (await request.json().catch(() => ({}))) as CsvImportRequestBody;
    const entityType = cleanText(body.entityType) as CsvEntityType;
    const rows = coerceRows(body.rows);
    const mappings = coerceMappings(body.mappings);
    const sourceLabel = cleanText(body.sourceLabel) || cleanText(body.fileName) || "Monday CSV Import";
    const sourceKey = slugText(`${sourceLabel}-${cleanText(body.fileName) || "upload"}`);

    if (!csvEntityTypes.has(entityType)) {
      return Response.json({ error: "Choose what kind of CRM records this CSV should create." }, { status: 400 });
    }

    if (rows.length === 0) {
      return Response.json({ error: "No usable CSV rows were received." }, { status: 400 });
    }

    if (rows.length > 10000) {
      return Response.json({ error: "This CSV has more than 10,000 rows. Split it into smaller uploads so it can be reviewed safely." }, { status: 400 });
    }

    if (mappings.length === 0) {
      return Response.json({ error: "Map at least one CSV column before importing." }, { status: 400 });
    }

    const [{ data: accounts }, { data: contacts }, { data: opportunities }, { data: activities }] = await Promise.all([
      adminSupabase.from("crm_accounts").select("id, account_name, source_system, external_id"),
      adminSupabase.from("crm_contacts").select("id, full_name, email, phone, mobile, source_system, external_id"),
      adminSupabase.from("crm_opportunities").select("id, opportunity_name, source_system, external_id"),
      adminSupabase.from("crm_activities").select("id, subject, source_system, external_id"),
    ]);

    const importRows = buildImportRows(entityType, sourceKey, sourceLabel, rows, mappings, {
      accounts: (accounts ?? []) as ExistingAccount[],
      contacts: (contacts ?? []) as ExistingContact[],
      opportunities: (opportunities ?? []) as ExistingOpportunity[],
      activities: (activities ?? []) as ExistingActivity[],
    });
    const dryRunSummary = summarize(importRows);

    const { data: batch, error: batchError } = await adminSupabase
      .from("crm_import_batches")
      .insert({
        source_system: "monday_csv",
        status: "Imported",
        name: sourceLabel,
        requested_by: authorization.userId,
        started_at: new Date().toISOString(),
        summary: {
          sourceLabel,
          fileName: cleanText(body.fileName),
          entityType,
          csvRows: rows.length,
          mappedColumns: mappings.length,
          dryRun: dryRunSummary,
        },
      })
      .select("id, name")
      .single();

    if (batchError) throw batchError;

    const result = {
      total: importRows.length,
      created: 0,
      updated: 0,
      exceptions: 0,
      skipped: 0,
      warnings: dryRunSummary.warnings,
    };
    const importedRecords: Array<{ entityType: string; id: string | null; externalId: string; action: ImportAction }> = [];

    for (const row of importRows) {
      if (row.action === "possible_duplicate") {
        await insertException(adminSupabase, row, String(batch.id), authorization.userId, `Possible duplicate matched by ${row.matchedBy || "existing CRM data"}.`);
        result.exceptions += 1;
        continue;
      }

      if (row.action === "skip") {
        await insertException(adminSupabase, row, String(batch.id), authorization.userId, "Skipped because the mapped CSV row is not ready to import.");
        result.skipped += 1;
        continue;
      }

      const imported = await createOrUpdateRow(adminSupabase, row, authorization.userId);
      if (row.action === "update_existing") result.updated += 1;
      else result.created += 1;

      importedRecords.push({
        entityType: row.entityType,
        id: imported.id,
        externalId: row.externalId,
        action: row.action,
      });
    }

    await adminSupabase
      .from("crm_import_batches")
      .update({
        status: "Imported",
        completed_at: new Date().toISOString(),
        summary: {
          sourceLabel,
          fileName: cleanText(body.fileName),
          entityType,
          csvRows: rows.length,
          mappedColumns: mappings.length,
          dryRun: dryRunSummary,
          finalImport: result,
        },
      })
      .eq("id", String(batch.id));

    await adminSupabase.from("crm_audit_log").insert({
      entity_type: "crm_import_batch",
      entity_id: String(batch.id),
      action: "crm_csv_import_finalized",
      user_id: authorization.userId,
      after_value: {
        sourceLabel,
        fileName: cleanText(body.fileName),
        entityType,
        result,
        importedRecords: importedRecords.slice(0, 100),
      },
    });

    return Response.json({
      ok: true,
      batchId: String(batch.id),
      batchName: String(batch.name),
      result,
      importedRecords: importedRecords.slice(0, 200),
    });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
