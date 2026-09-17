import { createClient } from "@supabase/supabase-js";
import { dtiComponentLabel, dtiInspectionFields, type DtiComponentType } from "../../../../lib/dtiInspectionReport";

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

type CreateJobBody = {
  title?: unknown;
  groupName?: unknown;
  contact?: unknown;
  operator?: unknown;
  rig?: unknown;
  contractor?: unknown;
  rigNumber?: unknown;
  jobDateTime?: unknown;
  state?: unknown;
  county?: unknown;
  salesperson?: unknown;
  serviceLine?: unknown;
  jobType?: unknown;
  lead?: unknown;
  description?: unknown;
  inspectionItems?: unknown;
};

type DtiScheduleInspectionItem = {
  id: string;
  componentType: "Drill Pipe" | "HWDP" | "Subs";
  jointCount: number | null;
  pipeSize: string;
  weight: string;
  grade: string;
  connection: string;
  inspectionCategory: string;
  setupStatus: "Ready" | "Setup Required";
};

type GeneratedDtiReport = {
  id: string;
  reportNumber: string;
  componentType: DtiComponentType;
  rowCount: number;
  criteriaMatched: boolean;
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

function cleanDtiInspectionItems(value: unknown): DtiScheduleInspectionItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((raw, index) => {
    if (!isObject(raw)) return [];
    const componentType = cleanText(raw.componentType);
    if (!(["Drill Pipe", "HWDP", "Subs"] as const).includes(componentType as DtiScheduleInspectionItem["componentType"])) return [];
    const countValue = cleanText(raw.jointCount);
    const jointCount = countValue && Number.isInteger(Number(countValue)) && Number(countValue) > 0 && Number(countValue) <= 2000
      ? Number(countValue)
      : null;
    const item = {
      id: cleanText(raw.id) || `inspection-item-${index + 1}`,
      componentType: componentType as DtiScheduleInspectionItem["componentType"],
      jointCount,
      pipeSize: cleanText(raw.pipeSize),
      weight: cleanText(raw.weight),
      grade: cleanText(raw.grade),
      connection: cleanText(raw.connection),
      inspectionCategory: cleanText(raw.inspectionCategory),
    };
    const ready = Boolean(item.jointCount && item.pipeSize && item.weight && item.grade && item.connection && item.inspectionCategory);
    return [{ ...item, setupStatus: ready ? "Ready" as const : "Setup Required" as const }];
  });
}

function specKey(value: unknown) {
  return cleanText(value).toLowerCase().replace(/\b(inches|inch|in)\b/g, "").replace(/[^a-z0-9./]+/g, "");
}

function managedCriteriaIdentity(name: unknown) {
  const parts = cleanText(name).split("|").map((part) => part.trim());
  if (parts.length < 5 || parts[0] !== "DS-1 Premium") return null;
  const weight = Number(parts[2]);
  if (!Number.isFinite(weight)) return null;
  return { pipeSize: parts[1], weight, grade: parts[3], connection: parts.slice(4).join(" | ") };
}

function itemMatchesCriteria(item: DtiScheduleInspectionItem, identity: ReturnType<typeof managedCriteriaIdentity>) {
  if (!identity) return false;
  return specKey(item.pipeSize) === specKey(identity.pipeSize)
    && Number(item.weight) === identity.weight
    && specKey(item.grade) === specKey(identity.grade)
    && specKey(item.connection) === specKey(identity.connection);
}

async function publishedCriteriaSnapshot(
  admin: ReturnType<typeof configuredSupabase>,
  item: DtiScheduleInspectionItem,
) {
  const setsResult = await admin
    .from("titan_dti_criteria_sets")
    .select("*")
    .eq("component_type", item.componentType)
    .is("archived_at", null)
    .limit(1000);
  if (setsResult.error) throw setsResult.error;
  const criteriaSet = (setsResult.data ?? []).find((row) => itemMatchesCriteria(item, managedCriteriaIdentity(row.name)));
  if (!criteriaSet) return null;

  const versionResult = await admin
    .from("titan_dti_criteria_versions")
    .select("*")
    .eq("criteria_set_id", criteriaSet.id)
    .eq("status", "Published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionResult.error) throw versionResult.error;
  if (!versionResult.data) return null;

  const identity = managedCriteriaIdentity(criteriaSet.name);
  const [rulesResult, documentResult, specResult] = await Promise.all([
    admin.from("titan_dti_criteria_rules").select("*").eq("criteria_version_id", versionResult.data.id).eq("is_active", true).order("display_order"),
    versionResult.data.source_document_id
      ? admin.from("documents").select("id,title,document_number,approval_status,document_status").eq("id", versionResult.data.source_document_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    identity
      ? admin.from("titan_dti_tubular_specs").select("id,pipe_size,weight_ppf,grade,connection,new_wall_inches,premium_min_wall_inches,class_2_min_wall_inches").eq("pipe_size", identity.pipeSize).eq("weight_ppf", identity.weight).eq("grade", identity.grade).eq("connection", identity.connection).is("archived_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (rulesResult.error) throw rulesResult.error;
  if (documentResult.error) throw documentResult.error;
  if (specResult.error) throw specResult.error;
  if (!rulesResult.data?.length) return null;

  return {
    versionId: versionResult.data.id as string,
    nominalWall: Number(specResult.data?.new_wall_inches) || null,
    snapshot: {
      capturedAt: new Date().toISOString(),
      criteriaSet,
      version: versionResult.data,
      sourceDocument: documentResult.data,
      tubularSpec: specResult.data,
      rules: rulesResult.data,
    },
  };
}

function scheduledInspectionRowData(componentType: DtiComponentType, sequenceNumber: number, nominalWall: number | null) {
  const data: Record<string, unknown> = {};
  for (const field of dtiInspectionFields[componentType]) {
    if (field.kind === "flag") data[field.key] = false;
    else if (field.kind === "number" || field.kind === "calculated") data[field.key] = null;
    else data[field.key] = "";
  }
  data.jointNumber = String(sequenceNumber);
  data.boxPassComplete = false;
  data.pinPassComplete = false;
  data.emiProveUp = false;
  data.emiProveUpId = "";
  if (componentType === "Drill Pipe" && nominalWall) data.nominalWallThickness = nominalWall;
  return data;
}

async function createScheduledDtiReports(
  admin: ReturnType<typeof configuredSupabase>,
  crmOpportunityId: string,
  externalId: string,
  body: CreateJobBody,
  items: DtiScheduleInspectionItem[],
  actorId: string,
) {
  const generatedReports: GeneratedDtiReport[] = [];
  const warnings: string[] = [];
  if (normalizeText(body.serviceLine) !== "dti" || !items.length) return { generatedReports, warnings };

  const jobResult = await admin.from("titan_jobs").select("id,job_number").eq("crm_opportunity_id", crmOpportunityId).maybeSingle();
  if (jobResult.error) throw jobResult.error;
  if (!jobResult.data) return { generatedReports, warnings: ["The job was created, but its connected TITAN job is not ready yet."] };

  const existingResult = await admin.from("titan_dti_inspection_reports").select("id,report_number,inspection_scope").eq("job_id", jobResult.data.id).neq("status", "Archived");
  if (existingResult.error) throw existingResult.error;
  const existingReports = existingResult.data ?? [];
  const reportDateText = cleanText(body.jobDateTime);
  const reportDate = /^\d{4}-\d{2}-\d{2}/.test(reportDateText) ? reportDateText.slice(0, 10) : new Date().toISOString().slice(0, 10);

  for (const item of items) {
    const prior = existingReports.find((report) => isObject(report.inspection_scope) && report.inspection_scope.scheduleItemId === item.id);
    if (prior) {
      generatedReports.push({ id: prior.id, reportNumber: prior.report_number, componentType: item.componentType, rowCount: item.jointCount ?? 0, criteriaMatched: Boolean((prior.inspection_scope as Record<string, unknown>).criteriaMatched) });
      continue;
    }

    let criteria: Awaited<ReturnType<typeof publishedCriteriaSnapshot>> = null;
    try {
      criteria = await publishedCriteriaSnapshot(admin, item);
    } catch (error) {
      warnings.push(`${dtiComponentLabel(item.componentType)}: acceptance criteria could not be matched (${errorMessage(error)}).`);
    }
    const inspectionScope = {
      reportComponentType: item.componentType,
      inspectionCategory: item.inspectionCategory,
      criteriaPipeSize: item.pipeSize,
      criteriaWeightPpf: item.weight,
      criteriaGrade: item.grade,
      criteriaConnection: item.connection,
      scheduleItemId: item.id,
      scheduleSourceId: externalId,
      autoCreatedFromSchedule: true,
      criteriaMatched: Boolean(criteria),
      setupStatus: item.setupStatus,
    };
    const reportInsert = await admin.from("titan_dti_inspection_reports").insert({
      job_id: jobResult.data.id,
      operator_name: cleanText(body.operator) || cleanText(body.title) || "Setup Required",
      contractor_name: cleanText(body.contractor) || null,
      rig_number: cleanText(body.rigNumber) || cleanText(body.rig) || null,
      report_date: reportDate,
      connection_size: item.pipeSize || null,
      connection_type: item.connection || null,
      grade: item.grade || null,
      state: cleanText(body.state) || null,
      inspection_scope: inspectionScope,
      status: "Draft",
      criteria_version_id: criteria?.versionId ?? null,
      criteria_snapshot: criteria?.snapshot ?? null,
      created_by: actorId,
      updated_by: actorId,
    }).select("*").single();
    if (reportInsert.error) throw reportInsert.error;

    try {
      const rowCount = item.jointCount ?? 0;
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        report_id: reportInsert.data.id,
        component_type: item.componentType,
        sequence_number: index + 1,
        row_data: scheduledInspectionRowData(item.componentType, index + 1, criteria?.nominalWall ?? null),
        created_by: actorId,
        updated_by: actorId,
      }));
      for (let start = 0; start < rows.length; start += 250) {
        const rowInsert = await admin.from("titan_dti_inspection_items").insert(rows.slice(start, start + 250));
        if (rowInsert.error) throw rowInsert.error;
      }
    } catch (error) {
      await admin.from("titan_dti_inspection_reports").delete().eq("id", reportInsert.data.id);
      throw error;
    }

    const [eventResult, linkResult] = await Promise.all([
      admin.from("titan_dti_inspection_report_events").insert({ report_id: reportInsert.data.id, entity_type: "Report", entity_id: reportInsert.data.id, event_type: "Created", before_value: null, after_value: reportInsert.data, actor_id: actorId }),
      admin.from("titan_job_links").upsert({ job_id: jobResult.data.id, module_key: "dti", record_type: "inspection_report", record_id: reportInsert.data.id, relationship_type: "generated_from_schedule", metadata: { scheduleItemId: item.id, componentType: item.componentType }, created_by: actorId }, { onConflict: "job_id,module_key,record_type,record_id" }),
    ]);
    if (eventResult.error) warnings.push(`${reportInsert.data.report_number}: report audit event was not recorded.`);
    if (linkResult.error) warnings.push(`${reportInsert.data.report_number}: connected-job link was not recorded.`);
    if (!criteria) warnings.push(`${reportInsert.data.report_number}: no exact published criteria match was found; report setup is required.`);
    generatedReports.push({ id: reportInsert.data.id, reportNumber: reportInsert.data.report_number, componentType: item.componentType, rowCount: item.jointCount ?? 0, criteriaMatched: Boolean(criteria) });
  }

  return { generatedReports, warnings };
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

function newJobMetadata(body: CreateJobBody, externalId: string) {
  const groupName = cleanText(body.groupName) || "Requested";
  const title = cleanText(body.title);
  const inspectionItems = cleanText(body.serviceLine).toLowerCase() === "dti" ? cleanDtiInspectionItems(body.inspectionItems) : [];
  const fields: Record<string, string> = {
    Name: title,
    Contacts: cleanText(body.contact),
    Operator: cleanText(body.operator),
    Contractor: cleanText(body.contractor),
    Rig: cleanText(body.rigNumber) || cleanText(body.rig),
    "Job Date/Time": cleanText(body.jobDateTime),
    State: cleanText(body.state),
    County: cleanText(body.county),
    Salesperson: cleanText(body.salesperson),
    "Service Line": cleanText(body.serviceLine),
    Status: groupName,
    "Job Type": cleanText(body.jobType),
    "Job Description": cleanText(body.description),
    Lead: cleanText(body.lead),
    "Date Requested": new Date().toISOString().slice(0, 10),
    "Item ID (auto generated)": externalId,
  };

  return {
    groupName,
    unmappedFieldValues: Object.fromEntries(Object.entries(fields).filter(([, value]) => Boolean(value))),
    monday: {
      boardName: "Job Schedule",
      itemName: title,
      itemId: externalId,
      groupName,
    },
    dtiInspectionItems: inspectionItems,
    createdInTitan: true,
  };
}

function attachmentUrlFromMetadata(metadata: CrmMetadata, column: string, requestedName: string) {
  const attachments = isObject(metadata.titanBoardAttachments) ? metadata.titanBoardAttachments : {};
  const columnAttachments = Array.isArray(attachments[column]) ? attachments[column] : [];
  const requested = normalizeText(requestedName);
  const matchingAttachment = columnAttachments.find((attachment) => {
    const name = normalizeText(attachment.name);
    const url = normalizeText(attachment.url);
    return requested && (name === requested || url === requested);
  });
  const attachment = matchingAttachment ?? columnAttachments[0];
  const attachmentUrl = cleanText(attachment?.url);
  if (attachmentUrl) return attachmentUrl;

  const fields = isObject(metadata.unmappedFieldValues) ? metadata.unmappedFieldValues : {};
  const rawValue = cleanText(fields[column]);
  return /^https?:\/\//i.test(rawValue) ? rawValue : "";
}

async function browserAttachmentUrl(
  adminSupabase: ReturnType<typeof configuredSupabase>,
  storedUrl: string,
) {
  if (/^https?:\/\//i.test(storedUrl)) return storedUrl;

  const storagePrefix = `storage://${crmBoardFilesBucket}/`;
  if (!storedUrl.startsWith(storagePrefix)) {
    throw new Error("This attachment does not have a valid TITAN file location.");
  }

  const path = storedUrl.slice(storagePrefix.length);
  if (!path) throw new Error("This attachment file path is missing.");

  const { data, error } = await adminSupabase.storage.from(crmBoardFilesBucket).createSignedUrl(path, 120);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("TITAN could not create a secure file link.");
  return data.signedUrl;
}

export async function GET(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const url = new URL(request.url);
    const recordId = cleanText(url.searchParams.get("recordId"));
    const entityType = cleanText(url.searchParams.get("entityType")) as EntityType;
    const column = cleanText(url.searchParams.get("column"));
    const fileName = cleanText(url.searchParams.get("fileName"));
    const table = crmTables[entityType];

    if (!recordId || !table || !column) {
      return Response.json({ error: "A valid CRM record and file column are required." }, { status: 400 });
    }

    const { data: row, error: loadError } = await adminSupabase
      .from(table)
      .select("metadata")
      .eq("id", recordId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!row) return Response.json({ error: "CRM record was not found." }, { status: 404 });

    const metadata = isObject(row.metadata) ? (row.metadata as CrmMetadata) : {};
    const storedUrl = attachmentUrlFromMetadata(metadata, column, fileName);
    if (!storedUrl) {
      return Response.json({ error: "This file name was imported without a downloadable file link." }, { status: 404 });
    }

    return Response.json({ url: await browserAttachmentUrl(adminSupabase, storedUrl) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredSupabase();
    const authorization = await authorizeWade(request, adminSupabase);
    if ("error" in authorization) return authorization.error;

    const body = (await request.json().catch(() => ({}))) as CreateJobBody;
    const title = cleanText(body.title);
    const groupName = cleanText(body.groupName) || "Requested";
    const serviceLine = cleanText(body.serviceLine);

    if (!title) {
      return Response.json({ error: "Job name is required." }, { status: 400 });
    }

    const externalId = `TITAN-JOB-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const metadata = newJobMetadata(body, externalId);
    const insertPayload = {
      opportunity_name: title,
      pipeline_name: serviceLine || "Job Schedule",
      stage: groupName,
      status: statusFromGroup(groupName),
      source_system: "titan",
      external_id: externalId,
      metadata,
      created_by: authorization.userId,
    };

    const { data: createdJob, error: insertError } = await adminSupabase
      .from("crm_opportunities")
      .insert(insertPayload)
      .select("id, opportunity_name, pipeline_name, stage, status, external_id, metadata, created_at, updated_at")
      .single();

    if (insertError) throw insertError;

    await adminSupabase.from("crm_audit_log").insert({
      entity_type: "crm_opportunities",
      entity_id: createdJob.id,
      action: "crm_job_created",
      user_id: authorization.userId,
      before_value: null,
      after_value: insertPayload,
    });

    const inspectionItems = cleanDtiInspectionItems(body.inspectionItems);
    const reportResult = await createScheduledDtiReports(
      adminSupabase,
      createdJob.id,
      externalId,
      body,
      inspectionItems,
      authorization.userId,
    );

    if (reportResult.generatedReports.length) {
      const finalMetadata = {
        ...metadata,
        unmappedFieldValues: {
          ...metadata.unmappedFieldValues,
          Report: reportResult.generatedReports.map((report) => report.reportNumber).join(", "),
        },
        dtiGeneratedReports: reportResult.generatedReports,
      };
      const metadataUpdate = await adminSupabase.from("crm_opportunities").update({ metadata: finalMetadata }).eq("id", createdJob.id);
      if (metadataUpdate.error) reportResult.warnings.push("The reports were created, but their numbers could not be written back to Job Schedule.");
    }

    return Response.json({ ok: true, job: createdJob, ...reportResult }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
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
