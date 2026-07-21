import { createClient } from "@supabase/supabase-js";

type TitanProfile = {
  role?: string | null;
  is_disabled?: boolean | null;
  full_name?: string | null;
  email?: string | null;
};

type CrmMetadata = {
  monday?: {
    boardId?: string;
    boardName?: string;
    itemId?: string;
    itemName?: string;
  };
  [key: string]: unknown;
};

type CrmReviewRecord = {
  id: string;
  entityType: "account" | "contact" | "opportunity" | "activity";
  title: string;
  subtitle: string;
  status: string;
  sourceBoard: string;
  mondayItem: string;
  externalId: string;
  updatedAt: string;
};

const wadeCrmEmail = "wade@pathfinderinspections.com";

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
    return { error: Response.json({ error: "You must be signed in to review CRM imports." }, { status: 401 }) };
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
    return { error: Response.json({ error: "CRM review is restricted to Wade." }, { status: 403 }) };
  }

  return { userId: userData.user.id };
}

function metadataSource(metadata: unknown) {
  const parsed = (metadata && typeof metadata === "object" ? metadata : {}) as CrmMetadata;
  return {
    boardName: cleanText(parsed.monday?.boardName) || "Manual / unknown",
    itemName: cleanText(parsed.monday?.itemName),
  };
}

function formatMoney(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric === 0) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numeric);
}

function countByBoard(records: CrmReviewRecord[]) {
  const counts = new Map<string, number>();
  records.forEach((record) => counts.set(record.sourceBoard, (counts.get(record.sourceBoard) ?? 0) + 1));

  return Array.from(counts.entries())
    .map(([boardName, count]) => ({ boardName, count }))
    .sort((a, b) => b.count - a.count || a.boardName.localeCompare(b.boardName))
    .slice(0, 25);
}

export async function GET(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const [accountsResult, contactsResult, opportunitiesResult, activitiesResult, exceptionsResult, batchesResult] = await Promise.all([
      adminSupabase
        .from("crm_accounts")
        .select("id, account_name, status, industry, phone, website, source_system, external_id, metadata, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(250),
      adminSupabase
        .from("crm_contacts")
        .select("id, full_name, title, email, phone, mobile, status, source_system, external_id, metadata, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(250),
      adminSupabase
        .from("crm_opportunities")
        .select("id, opportunity_name, pipeline_name, stage, status, estimated_value, probability, source_system, external_id, metadata, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(250),
      adminSupabase
        .from("crm_activities")
        .select("id, activity_type, subject, body, due_at, completed_at, source_system, external_id, metadata, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(250),
      adminSupabase
        .from("crm_import_exceptions")
        .select("id, batch_id, entity_type, monday_board_id, monday_item_id, monday_item_name, action, reason, matched_record_id, matched_by, field_values, metadata, status, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(250),
      adminSupabase
        .from("crm_import_batches")
        .select("id, name, status, completed_at, summary, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    if (accountsResult.error) throw accountsResult.error;
    if (contactsResult.error) throw contactsResult.error;
    if (opportunitiesResult.error) throw opportunitiesResult.error;
    if (activitiesResult.error) throw activitiesResult.error;
    if (exceptionsResult.error) throw exceptionsResult.error;
    if (batchesResult.error) throw batchesResult.error;

    const accountRecords: CrmReviewRecord[] = (accountsResult.data ?? []).map((account) => {
      const source = metadataSource(account.metadata);
      return {
        id: String(account.id),
        entityType: "account",
        title: cleanText(account.account_name) || "Unnamed account",
        subtitle: [account.industry, account.phone, account.website].map(cleanText).filter(Boolean).join(" / ") || "No account details",
        status: cleanText(account.status) || "Active",
        sourceBoard: source.boardName,
        mondayItem: source.itemName,
        externalId: cleanText(account.external_id),
        updatedAt: cleanText(account.updated_at || account.created_at),
      };
    });

    const contactRecords: CrmReviewRecord[] = (contactsResult.data ?? []).map((contact) => {
      const source = metadataSource(contact.metadata);
      return {
        id: String(contact.id),
        entityType: "contact",
        title: cleanText(contact.full_name) || "Unnamed contact",
        subtitle: [contact.title, contact.email, contact.phone || contact.mobile].map(cleanText).filter(Boolean).join(" / ") || "No contact details",
        status: cleanText(contact.status) || "Active",
        sourceBoard: source.boardName,
        mondayItem: source.itemName,
        externalId: cleanText(contact.external_id),
        updatedAt: cleanText(contact.updated_at || contact.created_at),
      };
    });

    const opportunityRecords: CrmReviewRecord[] = (opportunitiesResult.data ?? []).map((opportunity) => {
      const source = metadataSource(opportunity.metadata);
      return {
        id: String(opportunity.id),
        entityType: "opportunity",
        title: cleanText(opportunity.opportunity_name) || "Unnamed opportunity",
        subtitle: [opportunity.pipeline_name, opportunity.stage, formatMoney(opportunity.estimated_value)].map(cleanText).filter(Boolean).join(" / ") || "No opportunity details",
        status: cleanText(opportunity.status) || "Open",
        sourceBoard: source.boardName,
        mondayItem: source.itemName,
        externalId: cleanText(opportunity.external_id),
        updatedAt: cleanText(opportunity.updated_at || opportunity.created_at),
      };
    });

    const activityRecords: CrmReviewRecord[] = (activitiesResult.data ?? []).map((activity) => {
      const source = metadataSource(activity.metadata);
      return {
        id: String(activity.id),
        entityType: "activity",
        title: cleanText(activity.subject) || "Unnamed activity",
        subtitle: [activity.activity_type, activity.due_at ? `Due ${activity.due_at}` : "", cleanText(activity.body).slice(0, 90)].map(cleanText).filter(Boolean).join(" / ") || "No activity details",
        status: activity.completed_at ? "Completed" : "Open",
        sourceBoard: source.boardName,
        mondayItem: source.itemName,
        externalId: cleanText(activity.external_id),
        updatedAt: cleanText(activity.updated_at || activity.created_at),
      };
    });

    const records = [...accountRecords, ...contactRecords, ...opportunityRecords, ...activityRecords].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const exceptions = exceptionsResult.data ?? [];
    const openExceptions = exceptions.filter((exception) => cleanText(exception.status) === "Open");

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      metrics: {
        accounts: accountRecords.length,
        contacts: contactRecords.length,
        opportunities: opportunityRecords.length,
        activities: activityRecords.length,
        openExceptions: openExceptions.length,
      },
      boardCounts: countByBoard(records),
      records,
      exceptions,
      batches: batchesResult.data ?? [],
    });
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
