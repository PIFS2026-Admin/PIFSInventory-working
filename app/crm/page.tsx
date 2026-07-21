"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import NotificationCenter from "../../components/NotificationCenter";
import { supabase } from "../../lib/supabase";
import styles from "./crm.module.css";

type DiscoveryColumn = {
  id: string;
  title: string;
  type: string;
  description?: string;
  settings_str?: string;
  archived?: boolean;
};

type DiscoveryGroup = {
  id: string;
  title: string;
  archived?: boolean;
  deleted?: boolean;
};

type DiscoveryItem = {
  id: string;
  name: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
  group?: { id: string; title: string } | null;
  column_values?: Array<{ id: string; type: string; text: string; value: string | null }>;
};

type DiscoveryBoard = {
  id: string;
  name: string;
  description?: string;
  state?: string;
  type?: string;
  permissions?: string;
  items_count?: number;
  groups?: DiscoveryGroup[];
  columns?: DiscoveryColumn[];
  owners?: Array<{ id: string; name: string; email?: string }>;
  subscribers?: Array<{ id: string; name: string; email?: string }>;
  items_page?: {
    cursor?: string;
    items?: DiscoveryItem[];
  };
};

type DiscoveryResult = {
  configured?: boolean;
  message?: string;
  boards?: DiscoveryBoard[];
  generatedAt?: string;
  error?: string;
};

type AccessState = {
  loading: boolean;
  allowed: boolean;
  message: string;
  role: string;
};

type PermissionProfile = {
  email?: unknown;
  fullName?: unknown;
};

type TargetEntity = "account" | "contact" | "opportunity" | "activity" | "task" | "custom_field" | "ignored";
type MappingStatus = "Needs Review" | "Mapped" | "Ignored";

type ColumnMapping = {
  mondayColumnId: string;
  mondayColumnTitle: string;
  mondayColumnType: string;
  titanEntityType: TargetEntity;
  titanFieldKey: string;
  mappingStatus: MappingStatus;
  isCustomField: boolean;
  notes: string;
};

type BoardMapping = {
  boardId: string;
  boardName: string;
  included: boolean;
  boardPurpose: TargetEntity;
  columns: ColumnMapping[];
};

type PreviewRecord = {
  key: string;
  boardId: string;
  boardName: string;
  entity: TargetEntity;
  mondayItemId: string;
  mondayItemName: string;
  groupName: string;
  primaryValue: string;
  mappedFields: Array<{ label: string; value: string }>;
  warnings: string[];
};

type StageResponse = {
  ok?: boolean;
  batchId?: string;
  boardSnapshots?: number;
  columnMappings?: number;
  error?: string;
};

type DryRunAction = "create" | "update_existing" | "possible_duplicate" | "skip";

type DryRunRow = {
  key: string;
  action: DryRunAction;
  entityType: TargetEntity | string;
  boardName: string;
  mondayItemId: string;
  mondayItemName: string;
  primaryValue: string;
  matchedRecordId: string | null;
  matchedBy: string | null;
  fieldValues: Record<string, string>;
  metadata: Record<string, string>;
  warnings: string[];
};

type DryRunResponse = {
  ok?: boolean;
  batchId?: string;
  batchName?: string;
  summary?: {
    total: number;
    create: number;
    update_existing: number;
    possible_duplicate: number;
    skip: number;
    warnings: number;
  };
  rows?: DryRunRow[];
  error?: string;
};

type FinalizeResponse = {
  ok?: boolean;
  batchId?: string;
  batchName?: string;
  result?: {
    total: number;
    created: number;
    updated: number;
    exceptions: number;
    skipped: number;
    warnings: number;
  };
  error?: string;
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

type CrmImportException = {
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
  field_values: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

type CrmReviewResponse = {
  ok?: boolean;
  generatedAt?: string;
  metrics?: {
    accounts: number;
    contacts: number;
    opportunities: number;
    activities: number;
    openExceptions: number;
  };
  boardCounts?: Array<{ boardName: string; count: number }>;
  records?: CrmReviewRecord[];
  exceptions?: CrmImportException[];
  error?: string;
};

type CrmReviewView = "all" | "account" | "contact" | "opportunity" | "activity" | "exceptions";
type CrmExceptionAction = "ignore" | "resolve" | "import_anyway";
type CrmWorkspaceView = "pipeline" | "accounts" | "contacts" | "activities" | "automations";
type CsvImportEntity = "account" | "contact" | "opportunity" | "activity" | "task";

type CsvColumnMapping = {
  csvHeader: string;
  titanFieldKey: string;
  mappingStatus: MappingStatus;
};

type CsvParseResult = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

type CsvImportResponse = {
  ok?: boolean;
  batchId?: string;
  batchName?: string;
  result?: {
    total: number;
    created: number;
    updated: number;
    exceptions: number;
    skipped: number;
    warnings: number;
  };
  error?: string;
};

type FullMondayImportResponse = {
  ok?: boolean;
  batchId?: string;
  batchName?: string;
  sourceBatchId?: string;
  result?: {
    total: number;
    created: number;
    updated: number;
    exceptions: number;
    skipped: number;
    warnings: number;
  };
  error?: string;
};

const wadeCrmEmail = "wade@pathfinderinspections.com";

const targetEntityOptions: Array<{ value: TargetEntity; label: string }> = [
  { value: "account", label: "Company / Account" },
  { value: "contact", label: "Contact" },
  { value: "opportunity", label: "Lead / Opportunity" },
  { value: "activity", label: "Activity / Note" },
  { value: "task", label: "Task / Follow-up" },
  { value: "custom_field", label: "Custom field" },
  { value: "ignored", label: "Ignore" },
];

const csvEntityOptions: Array<{ value: CsvImportEntity; label: string }> = [
  { value: "account", label: "Companies / Accounts" },
  { value: "contact", label: "Contacts" },
  { value: "opportunity", label: "Leads / Opportunities" },
  { value: "activity", label: "Activities / Notes" },
  { value: "task", label: "Tasks / Follow-ups" },
];

const crmWorkspaceViews: Array<{ value: CrmWorkspaceView; label: string }> = [
  { value: "pipeline", label: "Pipeline" },
  { value: "accounts", label: "Accounts" },
  { value: "contacts", label: "Contacts" },
  { value: "activities", label: "Activity" },
  { value: "automations", label: "Automations" },
];

const crmAutomationRecipes = [
  { name: "New Lead Follow-Up", trigger: "New opportunity", action: "Create follow-up task for owner", status: "Ready" },
  { name: "Stale Lead Alert", trigger: "No activity in 7 days", action: "Flag owner and send reminder", status: "Ready" },
  { name: "Won Deal Handoff", trigger: "Stage changes to Won", action: "Create kickoff activity", status: "Ready" },
  { name: "Missing Contact Check", trigger: "Account has no contact", action: "Add CRM exception for cleanup", status: "Ready" },
  { name: "Import Exception Review", trigger: "Duplicate found", action: "Hold row in exception queue", status: "Live" },
];

const targetFieldOptions: Record<TargetEntity, Array<{ value: string; label: string }>> = {
  account: [
    { value: "account_name", label: "Account Name" },
    { value: "account_number", label: "Account Number" },
    { value: "status", label: "Status" },
    { value: "phone", label: "Phone" },
    { value: "website", label: "Website" },
    { value: "industry", label: "Industry" },
    { value: "billing_address", label: "Billing Address" },
    { value: "shipping_address", label: "Shipping Address" },
    { value: "notes", label: "Notes" },
    { value: "metadata", label: "Custom Metadata" },
  ],
  contact: [
    { value: "full_name", label: "Full Name" },
    { value: "title", label: "Title" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "mobile", label: "Mobile" },
    { value: "status", label: "Status" },
    { value: "account_name", label: "Related Account" },
    { value: "metadata", label: "Custom Metadata" },
  ],
  opportunity: [
    { value: "opportunity_name", label: "Opportunity Name" },
    { value: "pipeline_name", label: "Pipeline" },
    { value: "stage", label: "Stage" },
    { value: "status", label: "Status" },
    { value: "estimated_value", label: "Estimated Value" },
    { value: "probability", label: "Probability" },
    { value: "expected_close_date", label: "Expected Close Date" },
    { value: "account_name", label: "Related Account" },
    { value: "contact_name", label: "Related Contact" },
    { value: "metadata", label: "Custom Metadata" },
  ],
  activity: [
    { value: "activity_type", label: "Activity Type" },
    { value: "subject", label: "Subject" },
    { value: "body", label: "Body" },
    { value: "due_at", label: "Due Date" },
    { value: "completed_at", label: "Completed Date" },
    { value: "account_name", label: "Related Account" },
    { value: "contact_name", label: "Related Contact" },
    { value: "metadata", label: "Custom Metadata" },
  ],
  task: [
    { value: "subject", label: "Subject" },
    { value: "body", label: "Description" },
    { value: "due_at", label: "Due Date" },
    { value: "assigned_to", label: "Assigned To" },
    { value: "status", label: "Status" },
    { value: "metadata", label: "Custom Metadata" },
  ],
  custom_field: [{ value: "metadata", label: "Custom Metadata" }],
  ignored: [{ value: "", label: "Skip this column" }],
};

function countActive<T extends { archived?: boolean; deleted?: boolean }>(rows?: T[]) {
  return (rows ?? []).filter((row) => !row.archived && !row.deleted).length;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function titleHas(title: string, terms: string[]) {
  return terms.some((term) => title.includes(term));
}

function readableEntity(entity: TargetEntity) {
  return targetEntityOptions.find((option) => option.value === entity)?.label ?? entity;
}

function readableField(entity: TargetEntity, fieldKey: string) {
  return (targetFieldOptions[entity]?.find((field) => field.value === fieldKey)?.label ?? fieldKey) || "Skipped";
}

function fieldTypeCounts(boards: DiscoveryBoard[]) {
  const counts = new Map<string, number>();

  boards.forEach((board) => {
    (board.columns ?? []).forEach((column) => {
      if (column.archived) return;
      counts.set(column.type || "unknown", (counts.get(column.type || "unknown") ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function sampleValues(board: DiscoveryBoard, columnId: string) {
  const values = (board.items_page?.items ?? [])
    .map((item) => item.column_values?.find((column) => column.id === columnId)?.text?.trim())
    .filter(Boolean) as string[];

  return Array.from(new Set(values)).slice(0, 3).join(" / ") || "-";
}

function isWadeProfile(profile: PermissionProfile | null | undefined) {
  const fullName = normalizeText(profile?.fullName);
  const email = normalizeText(profile?.email);

  return fullName === "wade wisenor" || email === wadeCrmEmail;
}

function moduleCanOpen(moduleKeys: unknown[], profile: PermissionProfile | null | undefined) {
  return isWadeProfile(profile) && moduleKeys.map(String).includes("crm");
}

function inferBoardPurpose(board: DiscoveryBoard): TargetEntity {
  const name = normalizeText(`${board.name} ${board.description ?? ""}`);

  if (titleHas(name, ["contact", "people", "person", "directory"])) return "contact";
  if (titleHas(name, ["lead", "opportunit", "deal", "pipeline", "quote", "bid", "sales"])) return "opportunity";
  if (titleHas(name, ["activity", "follow", "task", "call", "meeting", "note"])) return "activity";
  if (titleHas(name, ["customer", "company", "account", "client", "operator"])) return "account";

  return "custom_field";
}

function mapped(entity: TargetEntity, fieldKey: string, notes = ""): ColumnMapping {
  return {
    mondayColumnId: "",
    mondayColumnTitle: "",
    mondayColumnType: "",
    titanEntityType: entity,
    titanFieldKey: fieldKey,
    mappingStatus: entity === "ignored" ? "Ignored" : fieldKey === "metadata" ? "Needs Review" : "Mapped",
    isCustomField: fieldKey === "metadata",
    notes,
  };
}

function inferColumnMapping(boardPurpose: TargetEntity, column: DiscoveryColumn): ColumnMapping {
  const title = normalizeText(column.title);
  const type = normalizeText(column.type);
  let guess = mapped("custom_field", "metadata", "Review this Monday column before import.");

  if (titleHas(title, ["email"])) guess = mapped("contact", "email");
  else if (titleHas(title, ["mobile", "cell"])) guess = mapped("contact", "mobile");
  else if (titleHas(title, ["phone", "telephone"])) guess = mapped("contact", "phone");
  else if (titleHas(title, ["website", "web site", "url"])) guess = mapped("account", "website");
  else if (titleHas(title, ["company", "customer", "client", "operator", "account"])) guess = mapped("account", "account_name");
  else if (titleHas(title, ["contact", "person", "full name"])) guess = mapped("contact", "full_name");
  else if (titleHas(title, ["job title", "position", "role"])) guess = mapped("contact", "title");
  else if (titleHas(title, ["amount", "value", "revenue", "price", "quote", "dollar"])) guess = mapped("opportunity", "estimated_value");
  else if (titleHas(title, ["probability", "percent"])) guess = mapped("opportunity", "probability");
  else if (titleHas(title, ["close date", "closing date", "expected close"])) guess = mapped("opportunity", "expected_close_date");
  else if (titleHas(title, ["stage"])) guess = mapped("opportunity", "stage");
  else if (titleHas(title, ["status"])) guess = mapped(boardPurpose === "custom_field" ? "opportunity" : boardPurpose, boardPurpose === "opportunity" ? "stage" : "status");
  else if (titleHas(title, ["address", "location"])) guess = mapped("account", "billing_address");
  else if (titleHas(title, ["industry", "market"])) guess = mapped("account", "industry");
  else if (titleHas(title, ["note", "comment", "description"])) {
    if (boardPurpose === "activity" || boardPurpose === "task") guess = mapped(boardPurpose, "body");
    else guess = mapped("account", "notes");
  } else if (titleHas(title, ["date", "due"])) {
    guess = mapped(boardPurpose === "task" ? "task" : "activity", "due_at");
  } else if (title === "name" || title === "item" || title === "item name") {
    if (boardPurpose === "account") guess = mapped("account", "account_name");
    else if (boardPurpose === "contact") guess = mapped("contact", "full_name");
    else if (boardPurpose === "opportunity") guess = mapped("opportunity", "opportunity_name");
    else if (boardPurpose === "activity") guess = mapped("activity", "subject");
    else if (boardPurpose === "task") guess = mapped("task", "subject");
  } else if (type === "subtasks" || type === "dependency") {
    guess = mapped("ignored", "", "Monday control column.");
  }

  return {
    ...guess,
    mondayColumnId: column.id,
    mondayColumnTitle: column.title,
    mondayColumnType: column.type,
  };
}

function parseCsvText(text: string): CsvParseResult {
  const rows: string[][] = [];
  const source = text.replace(/^\uFEFF/, "");
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cleanText(cell))) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  row.push(field);
  if (row.some((cell) => cleanText(cell))) rows.push(row);

  const headers = (rows[0] ?? []).map((header, index) => cleanText(header) || `Column ${index + 1}`);
  const dataRows = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cleanText(cells[index]);
    });
    return record;
  }).filter((record) => Object.values(record).some((value) => cleanText(value)));

  return { headers, rows: dataRows };
}

function primaryCsvField(entity: CsvImportEntity) {
  if (entity === "account") return "account_name";
  if (entity === "contact") return "full_name";
  if (entity === "opportunity") return "opportunity_name";
  return "subject";
}

function inferCsvColumnMapping(entity: CsvImportEntity, header: string): CsvColumnMapping {
  const normalizedHeader = normalizeText(header);
  const inferred = inferColumnMapping(entity, {
    id: header,
    title: header,
    type: "text",
  });
  const allowedFields = targetFieldOptions[entity].map((field) => field.value);
  let titanFieldKey = allowedFields.includes(inferred.titanFieldKey) ? inferred.titanFieldKey : "metadata";

  if (["id", "item id", "item_id", "pulse id", "pulse_id", "monday id"].includes(normalizedHeader)) titanFieldKey = "metadata";
  if (["name", "item", "item name", "record", "record name"].includes(normalizedHeader)) titanFieldKey = primaryCsvField(entity);

  return {
    csvHeader: header,
    titanFieldKey,
    mappingStatus: titanFieldKey === "metadata" ? "Needs Review" : "Mapped",
  };
}

function buildCsvMappings(headers: string[], entity: CsvImportEntity) {
  return headers.map((header) => inferCsvColumnMapping(entity, header));
}

function buildInitialMappings(boards: DiscoveryBoard[]) {
  return boards.map((board) => {
    const boardPurpose = inferBoardPurpose(board);
    return {
      boardId: board.id,
      boardName: board.name,
      included: boardPurpose !== "custom_field",
      boardPurpose,
      columns: (board.columns ?? [])
        .filter((column) => !column.archived)
        .map((column) => inferColumnMapping(boardPurpose, column)),
    };
  });
}

function itemColumnText(item: DiscoveryItem, columnId: string) {
  return item.column_values?.find((column) => column.id === columnId)?.text?.trim() ?? "";
}

function buildPreviewRecords(boards: DiscoveryBoard[], mappings: BoardMapping[]) {
  const records: PreviewRecord[] = [];

  mappings
    .filter((mapping) => mapping.included)
    .forEach((mapping) => {
      const board = boards.find((entry) => entry.id === mapping.boardId);
      if (!board) return;

      const mappedColumns = mapping.columns.filter((column) => column.mappingStatus !== "Ignored" && column.titanEntityType !== "ignored");
      const items = board.items_page?.items ?? [];

      items.slice(0, 12).forEach((item) => {
        const entity = mapping.boardPurpose === "custom_field" ? mappedColumns[0]?.titanEntityType ?? "custom_field" : mapping.boardPurpose;
        const sameEntityFields = mappedColumns.filter((column) => column.titanEntityType === entity);
        const primaryField = sameEntityFields.find((column) => column.titanFieldKey !== "metadata") ?? sameEntityFields[0];
        const primaryValue = primaryField ? itemColumnText(item, primaryField.mondayColumnId) || item.name : item.name;
        const warnings: string[] = [];

        if (mappedColumns.length === 0) warnings.push("No mapped columns");
        if (entity === "account" && !sameEntityFields.some((column) => column.titanFieldKey === "account_name")) warnings.push("Missing account name mapping");
        if (entity === "contact" && !sameEntityFields.some((column) => ["full_name", "email", "phone", "mobile"].includes(column.titanFieldKey))) warnings.push("Missing contact identifier");
        if (entity === "opportunity" && !sameEntityFields.some((column) => ["opportunity_name", "stage", "estimated_value"].includes(column.titanFieldKey))) warnings.push("Weak opportunity mapping");

        records.push({
          key: `${board.id}-${item.id}`,
          boardId: board.id,
          boardName: board.name,
          entity,
          mondayItemId: item.id,
          mondayItemName: item.name,
          groupName: item.group?.title ?? "No group",
          primaryValue,
          mappedFields: mappedColumns
            .slice(0, 8)
            .map((column) => ({
              label: `${readableEntity(column.titanEntityType)} / ${readableField(column.titanEntityType, column.titanFieldKey)}`,
              value: itemColumnText(item, column.mondayColumnId) || "-",
            })),
          warnings,
        });
      });

      if (items.length === 0) {
        records.push({
          key: `${board.id}-empty`,
          boardId: board.id,
          boardName: board.name,
          entity: mapping.boardPurpose,
          mondayItemId: "-",
          mondayItemName: "No sample records returned",
          groupName: "-",
          primaryValue: "-",
          mappedFields: [],
          warnings: ["Run discovery with a larger sample or confirm this board is empty"],
        });
      }
    });

  return records;
}

function mappingNeedsReview(mapping: BoardMapping) {
  return mapping.columns.filter((column) => column.mappingStatus === "Needs Review").length;
}

function mappingMappedCount(mapping: BoardMapping) {
  return mapping.columns.filter((column) => column.mappingStatus === "Mapped").length;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function exceptionFieldPreview(exception: CrmImportException) {
  return Object.entries(exception.field_values ?? {})
    .filter(([, value]) => String(value ?? "").trim())
    .slice(0, 4)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`)
    .join(" / ");
}

function recordInitials(value: string) {
  const words = cleanText(value).split(/\s+/).filter(Boolean);
  if (words.length === 0) return "CRM";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function subtitleParts(value: string) {
  return value.split(" / ").map(cleanText).filter(Boolean);
}

function opportunityStage(record: CrmReviewRecord) {
  return subtitleParts(record.subtitle)[1] || record.status || "Open";
}

function uniqueOrdered(values: string[], fallback: string[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];

  [...fallback, ...values].forEach((value) => {
    const cleaned = cleanText(value);
    if (!cleaned || seen.has(normalizeText(cleaned))) return;
    seen.add(normalizeText(cleaned));
    ordered.push(cleaned);
  });

  return ordered;
}

export default function CrmPage() {
  const [access, setAccess] = useState<AccessState>({
    loading: true,
    allowed: false,
    message: "Checking CRM access...",
    role: "",
  });
  const [boardIds, setBoardIds] = useState("");
  const [itemLimit, setItemLimit] = useState("25");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [boardMappings, setBoardMappings] = useState<BoardMapping[]>([]);
  const [activeBoardId, setActiveBoardId] = useState("");
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [staging, setStaging] = useState(false);
  const [stageResult, setStageResult] = useState<StageResponse | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResponse | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<CrmReviewResponse | null>(null);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewView, setReviewView] = useState<CrmReviewView>("all");
  const [exceptionActionId, setExceptionActionId] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [csvEntity, setCsvEntity] = useState<CsvImportEntity>("account");
  const [csvSourceLabel, setCsvSourceLabel] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [csvMappings, setCsvMappings] = useState<CsvColumnMapping[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<CsvImportResponse | null>(null);
  const [csvError, setCsvError] = useState("");
  const [fullImporting, setFullImporting] = useState(false);
  const [fullImportResult, setFullImportResult] = useState<FullMondayImportResponse | null>(null);
  const [fullImportError, setFullImportError] = useState("");
  const [workspaceView, setWorkspaceView] = useState<CrmWorkspaceView>("pipeline");

  const boards = useMemo(() => result?.boards ?? [], [result?.boards]);
  const previewRecords = useMemo(() => buildPreviewRecords(boards, boardMappings), [boards, boardMappings]);
  const activeMapping = useMemo(() => boardMappings.find((mapping) => mapping.boardId === activeBoardId) ?? boardMappings[0], [activeBoardId, boardMappings]);
  const totals = useMemo(() => {
    return {
      boards: boards.length,
      groups: boards.reduce((sum, board) => sum + countActive(board.groups), 0),
      columns: boards.reduce((sum, board) => sum + countActive(board.columns), 0),
      items: boards.reduce((sum, board) => sum + Number(board.items_count ?? board.items_page?.items?.length ?? 0), 0),
    };
  }, [boards]);
  const mappingTotals = useMemo(() => {
    return {
      includedBoards: boardMappings.filter((mapping) => mapping.included).length,
      mappedColumns: boardMappings.reduce((sum, mapping) => sum + mappingMappedCount(mapping), 0),
      needsReview: boardMappings.reduce((sum, mapping) => sum + mappingNeedsReview(mapping), 0),
      ignoredColumns: boardMappings.reduce((sum, mapping) => sum + mapping.columns.filter((column) => column.mappingStatus === "Ignored").length, 0),
      warnings: previewRecords.reduce((sum, record) => sum + record.warnings.length, 0),
    };
  }, [boardMappings, previewRecords]);
  const columnTypeCounts = useMemo(() => fieldTypeCounts(boards), [boards]);
  const filteredReviewRecords = useMemo(() => {
    const query = normalizeText(reviewSearch);
    return (reviewResult?.records ?? []).filter((record) => {
      const typeMatches = reviewView === "all" || record.entityType === reviewView;
      const queryMatches =
        !query ||
        [record.title, record.subtitle, record.status, record.sourceBoard, record.mondayItem, record.externalId]
          .map(normalizeText)
          .some((value) => value.includes(query));

      return typeMatches && queryMatches;
    });
  }, [reviewResult?.records, reviewSearch, reviewView]);
  const filteredExceptions = useMemo(() => {
    const query = normalizeText(reviewSearch);
    return (reviewResult?.exceptions ?? []).filter((exception) => {
      if (!query) return true;
      return [
        exception.entity_type,
        exception.monday_item_name,
        exception.reason,
        exception.matched_by,
        exception.matched_record_id,
        exceptionFieldPreview(exception),
      ]
        .map(normalizeText)
        .some((value) => value.includes(query));
    });
  }, [reviewResult?.exceptions, reviewSearch]);
  const csvPreviewRows = useMemo(() => csvRows.slice(0, 8), [csvRows]);
  const csvMappedColumns = useMemo(
    () => csvMappings.filter((mapping) => mapping.mappingStatus !== "Ignored" && mapping.titanFieldKey).length,
    [csvMappings],
  );
  const crmRecords = useMemo(() => reviewResult?.records ?? [], [reviewResult?.records]);
  const crmAccounts = useMemo(() => crmRecords.filter((record) => record.entityType === "account"), [crmRecords]);
  const crmContacts = useMemo(() => crmRecords.filter((record) => record.entityType === "contact"), [crmRecords]);
  const crmOpportunities = useMemo(() => crmRecords.filter((record) => record.entityType === "opportunity"), [crmRecords]);
  const crmActivities = useMemo(() => crmRecords.filter((record) => record.entityType === "activity"), [crmRecords]);
  const pipelineColumns = useMemo(
    () => uniqueOrdered(crmOpportunities.map(opportunityStage), ["New", "Working", "Quoted", "Open", "Won", "Lost"]),
    [crmOpportunities],
  );
  const accountColumns = useMemo(
    () => uniqueOrdered(crmAccounts.map((record) => record.status), ["Active", "Prospect", "Inactive"]),
    [crmAccounts],
  );

  const loadCrmReview = useCallback(async () => {
    setReviewLoading(true);
    setReviewError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.assign("/login");
      return;
    }

    const response = await fetch("/api/crm/review", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      setReviewResult(payload);
    } else {
      setReviewError(payload.error || "CRM review could not be loaded.");
    }

    setReviewLoading(false);
  }, []);

  useEffect(() => {
    async function loadAccess() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        window.location.assign("/login");
        return;
      }

      const response = await fetch("/api/my-module-permissions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAccess({
          loading: false,
          allowed: false,
          message: payload.error || "CRM access could not be checked.",
          role: "",
        });
        return;
      }

      const role = String(payload.role ?? "");
      const allowed = moduleCanOpen(payload.moduleKeys ?? [], payload.profile);
      setAccess({
        loading: false,
        allowed,
        message: allowed ? "" : "CRM migration access is restricted to Wade.",
        role,
      });
    }

    loadAccess();
  }, []);

  useEffect(() => {
    if (!access.loading && access.allowed) {
      const timer = window.setTimeout(() => {
        loadCrmReview();
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [access.allowed, access.loading, loadCrmReview]);

  function updateBoardMapping(boardId: string, patch: Partial<BoardMapping>) {
    setBoardMappings((current) =>
      current.map((mapping) => {
        if (mapping.boardId !== boardId) return mapping;
        const nextPurpose = patch.boardPurpose ?? mapping.boardPurpose;
        const purposeChanged = patch.boardPurpose && patch.boardPurpose !== mapping.boardPurpose;

        return {
          ...mapping,
          ...patch,
          columns: purposeChanged
            ? mapping.columns.map((column) => inferColumnMapping(nextPurpose, {
                id: column.mondayColumnId,
                title: column.mondayColumnTitle,
                type: column.mondayColumnType,
              }))
            : mapping.columns,
        };
      }),
    );
  }

  function updateColumnMapping(boardId: string, columnId: string, patch: Partial<ColumnMapping>) {
    setBoardMappings((current) =>
      current.map((mapping) => {
        if (mapping.boardId !== boardId) return mapping;

        return {
          ...mapping,
          columns: mapping.columns.map((column) => {
            if (column.mondayColumnId !== columnId) return column;

            const nextEntity = patch.titanEntityType ?? column.titanEntityType;
            const options = targetFieldOptions[nextEntity] ?? [];
            const nextField =
              patch.titanFieldKey !== undefined
                ? patch.titanFieldKey
                : options.some((option) => option.value === column.titanFieldKey)
                  ? column.titanFieldKey
                  : options[0]?.value ?? "";
            const nextStatus: MappingStatus =
              nextEntity === "ignored" || nextField === ""
                ? "Ignored"
                : nextField === "metadata"
                  ? "Needs Review"
                  : patch.mappingStatus ?? "Mapped";

            return {
              ...column,
              ...patch,
              titanEntityType: nextEntity,
              titanFieldKey: nextField,
              mappingStatus: nextStatus,
              isCustomField: nextField === "metadata",
            };
          }),
        };
      }),
    );
  }

  async function runDiscovery() {
    setRunningDiscovery(true);
    setResult(null);
    setBoardMappings([]);
    setActiveBoardId("");
    setStageResult(null);
    setDryRunResult(null);
    setFinalizeResult(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.assign("/login");
      return;
    }

    const response = await fetch("/api/monday/discovery", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        boardIds,
        itemLimit: Number(itemLimit || 25),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    const nextResult = response.ok ? payload : { error: payload.error || "Monday discovery failed." };
    setResult(nextResult);

    if (response.ok && Array.isArray(payload.boards)) {
      const nextMappings = buildInitialMappings(payload.boards);
      setBoardMappings(nextMappings);
      setActiveBoardId(nextMappings[0]?.boardId ?? "");
    }

    setRunningDiscovery(false);
  }

  async function stageMapping() {
    setStaging(true);
    setStageResult(null);
    setDryRunResult(null);
    setFinalizeResult(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.assign("/login");
      return;
    }

    const response = await fetch("/api/crm/import-stage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        boards,
        mappings: boardMappings,
        summary: {
          discovered: totals,
          mapping: mappingTotals,
          generatedAt: result?.generatedAt ?? new Date().toISOString(),
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    setStageResult(response.ok ? payload : { error: payload.error || "CRM mapping staging failed." });
    setStaging(false);
  }

  async function runDryRun(batchId: string) {
    setDryRunning(true);
    setDryRunResult(null);
    setFinalizeResult(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.assign("/login");
      return;
    }

    const response = await fetch("/api/crm/import-dry-run", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batchId }),
    });

    const payload = await response.json().catch(() => ({}));
    setDryRunResult(response.ok ? payload : { error: payload.error || "CRM dry-run failed." });
    setDryRunning(false);
  }

  async function finalizeImport(batchId: string) {
    setFinalizing(true);
    setFinalizeResult(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.assign("/login");
      return;
    }

    const response = await fetch("/api/crm/import-finalize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batchId }),
    });

    const payload = await response.json().catch(() => ({}));
    setFinalizeResult(response.ok ? payload : { error: payload.error || "CRM final import failed." });
    if (response.ok) {
      loadCrmReview();
    }
    setFinalizing(false);
  }

  async function handleExceptionAction(id: string, action: CrmExceptionAction) {
    setExceptionActionId(`${id}-${action}`);
    setReviewError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.assign("/login");
      return;
    }

    const response = await fetch("/api/crm/exceptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, action }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setReviewError(payload.error || "CRM exception action failed.");
    } else {
      await loadCrmReview();
    }

    setExceptionActionId("");
  }

  async function handleCsvFile(file: File | null) {
    setCsvImportResult(null);
    setCsvError("");

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvError("Choose a CSV export from Monday.");
      return;
    }

    const text = await file.text();
    const parsed = parseCsvText(text);

    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setCsvFileName(file.name);
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvMappings([]);
      setCsvError("This CSV did not contain any rows to import.");
      return;
    }

    setCsvFileName(file.name);
    setCsvSourceLabel((current) => current || file.name.replace(/\.csv$/i, ""));
    setCsvHeaders(parsed.headers);
    setCsvRows(parsed.rows);
    setCsvMappings(buildCsvMappings(parsed.headers, csvEntity));
  }

  function updateCsvEntity(nextEntity: CsvImportEntity) {
    setCsvEntity(nextEntity);
    setCsvImportResult(null);
    if (csvHeaders.length) setCsvMappings(buildCsvMappings(csvHeaders, nextEntity));
  }

  function updateCsvMapping(csvHeader: string, patch: Partial<CsvColumnMapping>) {
    setCsvMappings((current) =>
      current.map((mapping) => {
        if (mapping.csvHeader !== csvHeader) return mapping;

        const nextField = patch.titanFieldKey ?? mapping.titanFieldKey;
        const nextStatus: MappingStatus =
          nextField === "" ? "Ignored" : nextField === "metadata" ? "Needs Review" : patch.mappingStatus ?? "Mapped";

        return {
          ...mapping,
          ...patch,
          titanFieldKey: nextField,
          mappingStatus: patch.mappingStatus ?? nextStatus,
        };
      }),
    );
  }

  async function importCsv() {
    setCsvImporting(true);
    setCsvImportResult(null);
    setCsvError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.assign("/login");
      return;
    }

    const response = await fetch("/api/crm/csv-import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entityType: csvEntity,
        sourceLabel: csvSourceLabel || csvFileName || "Monday CSV Import",
        fileName: csvFileName,
        rows: csvRows,
        mappings: csvMappings,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setCsvError(payload.error || "CSV import failed.");
    } else {
      setCsvImportResult(payload);
      await loadCrmReview();
    }

    setCsvImporting(false);
  }

  async function runFullMondayImport() {
    setFullImporting(true);
    setFullImportResult(null);
    setFullImportError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.assign("/login");
      return;
    }

    const response = await fetch("/api/crm/full-monday-import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setFullImportError(payload.error || "Full Monday import failed.");
    } else {
      setFullImportResult(payload);
      await loadCrmReview();
    }

    setFullImporting(false);
  }

  if (access.loading) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>CRM</span>
          <h1>Loading CRM...</h1>
        </section>
      </main>
    );
  }

  if (!access.allowed) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>CRM</span>
          <h1>CRM Access Needed</h1>
          <p>{access.message}</p>
          <button className="button" type="button" onClick={() => (window.location.href = "/home")}>
            Back to Home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <button className={styles.brand} type="button" onClick={() => (window.location.href = "/home")}>
          <img src="/titan_logo.jpg" alt="" />
          <span>TITAN by Pathfinder Inspections</span>
        </button>
        <div className={styles.headerActions}>
          <NotificationCenter />
          <button className="button" type="button" onClick={() => (window.location.href = "/home")}>
            Home
          </button>
        </div>
      </header>

      <section className={styles.crmHero}>
        <div>
          <span className={styles.eyebrow}>TITAN CRM</span>
          <h1>Company pipeline, customers, contacts, and follow-ups.</h1>
          <p>Monday-style CRM workspace with imported records, exception review, and automation cards in one place.</p>
        </div>
        <div className={styles.crmHeroActions}>
          <button className="button" type="button" onClick={loadCrmReview} disabled={reviewLoading}>
            {reviewLoading ? "Refreshing..." : "Refresh CRM"}
          </button>
          <button className="button primary" type="button" onClick={runFullMondayImport} disabled={fullImporting}>
            {fullImporting ? "Syncing..." : "Sync Monday"}
          </button>
        </div>
      </section>

      {fullImportError && <section className={styles.errorBox}>{fullImportError}</section>}
      {fullImportResult?.ok && fullImportResult.result && (
        <section className={styles.finalizeBox}>
          <div>
            <strong>Monday sync complete.</strong>
            <span>Batch {fullImportResult.batchId} reused mapping batch {fullImportResult.sourceBatchId}.</span>
          </div>
          <div className={styles.finalizeMetrics}>
            <span>Total {fullImportResult.result.total}</span>
            <span>Created {fullImportResult.result.created}</span>
            <span>Updated {fullImportResult.result.updated}</span>
            <span>Exceptions {fullImportResult.result.exceptions}</span>
          </div>
        </section>
      )}

      <section className={styles.crmMetrics}>
        <article>
          <span>Accounts</span>
          <strong>{reviewResult?.metrics?.accounts ?? 0}</strong>
        </article>
        <article>
          <span>Contacts</span>
          <strong>{reviewResult?.metrics?.contacts ?? 0}</strong>
        </article>
        <article>
          <span>Opportunities</span>
          <strong>{reviewResult?.metrics?.opportunities ?? 0}</strong>
        </article>
        <article>
          <span>Activities</span>
          <strong>{reviewResult?.metrics?.activities ?? 0}</strong>
        </article>
        <article>
          <span>Exceptions</span>
          <strong>{reviewResult?.metrics?.openExceptions ?? 0}</strong>
        </article>
      </section>

      <section className={styles.crmWorkspace}>
        <div className={styles.crmWorkspaceHeader}>
          <div>
            <span className={styles.eyebrow}>Workspace</span>
            <h2>CRM Board</h2>
          </div>
          <div className={styles.crmViewTabs}>
            {crmWorkspaceViews.map((view) => (
              <button
                key={view.value}
                className={workspaceView === view.value ? styles.crmViewTabActive : ""}
                type="button"
                onClick={() => setWorkspaceView(view.value)}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>

        {reviewLoading && !reviewResult ? (
          <div className={styles.reviewEmpty}>Loading CRM workspace...</div>
        ) : (
          <>
            {workspaceView === "pipeline" && (
              <div className={styles.crmBoard}>
                {pipelineColumns.map((column) => {
                  const columnRecords = crmOpportunities.filter((record) => normalizeText(opportunityStage(record)) === normalizeText(column));
                  return (
                    <article key={column} className={styles.crmLane}>
                      <header>
                        <strong>{column}</strong>
                        <span>{columnRecords.length}</span>
                      </header>
                      <div className={styles.crmCardStack}>
                        {columnRecords.length === 0 ? (
                          <div className={styles.emptyLane}>No cards</div>
                        ) : (
                          columnRecords.slice(0, 20).map((record) => (
                            <button key={record.id} className={styles.crmRecordCard} type="button">
                              <span className={styles.crmAvatar}>{recordInitials(record.title)}</span>
                              <strong>{record.title}</strong>
                              <small>{record.subtitle}</small>
                            </button>
                          ))
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {workspaceView === "accounts" && (
              <div className={styles.crmBoard}>
                {accountColumns.map((column) => {
                  const columnRecords = crmAccounts.filter((record) => normalizeText(record.status) === normalizeText(column));
                  return (
                    <article key={column} className={styles.crmLane}>
                      <header>
                        <strong>{column}</strong>
                        <span>{columnRecords.length}</span>
                      </header>
                      <div className={styles.crmCardStack}>
                        {columnRecords.length === 0 ? (
                          <div className={styles.emptyLane}>No accounts</div>
                        ) : (
                          columnRecords.slice(0, 24).map((record) => (
                            <button key={record.id} className={styles.crmRecordCard} type="button">
                              <span className={styles.crmAvatar}>{recordInitials(record.title)}</span>
                              <strong>{record.title}</strong>
                              <small>{record.subtitle}</small>
                            </button>
                          ))
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {workspaceView === "contacts" && (
              <div className={styles.crmDirectory}>
                {crmContacts.length === 0 ? (
                  <div className={styles.reviewEmpty}>No contacts imported yet.</div>
                ) : (
                  crmContacts.slice(0, 120).map((record) => (
                    <button key={record.id} className={styles.crmDirectoryRow} type="button">
                      <span className={styles.crmAvatar}>{recordInitials(record.title)}</span>
                      <span>
                        <strong>{record.title}</strong>
                        <small>{record.subtitle}</small>
                      </span>
                      <span className={styles.statusPill}>{record.status}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {workspaceView === "activities" && (
              <div className={styles.crmDirectory}>
                {crmActivities.length === 0 ? (
                  <div className={styles.reviewEmpty}>No activity imported yet.</div>
                ) : (
                  crmActivities.slice(0, 120).map((record) => (
                    <button key={record.id} className={styles.crmDirectoryRow} type="button">
                      <span className={styles.crmAvatar}>{recordInitials(record.title)}</span>
                      <span>
                        <strong>{record.title}</strong>
                        <small>{record.subtitle}</small>
                      </span>
                      <span className={styles.statusPill}>{record.status}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {workspaceView === "automations" && (
              <div className={styles.automationGrid}>
                {crmAutomationRecipes.map((recipe) => (
                  <article key={recipe.name} className={styles.automationCard}>
                    <div>
                      <span className={`${styles.statusPill} ${recipe.status === "Live" ? "" : styles.statusWarn}`}>{recipe.status}</span>
                      <h3>{recipe.name}</h3>
                    </div>
                    <p><strong>When:</strong> {recipe.trigger}</p>
                    <p><strong>Then:</strong> {recipe.action}</p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <details className={styles.migrationDrawer}>
        <summary>Migration and import tools</summary>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>CRM Migration Command Center</span>
          <h1>Map Monday into TITAN before anything touches live CRM records.</h1>
          <p>
            Discover boards, approve column mapping, inspect sample records, and stage a reviewed import batch. Actual account/contact imports stay locked behind a later approval step.
          </p>
        </div>
        <div className={styles.safeBox}>
          <strong>Safe staging mode</strong>
          <span>Staging saves board snapshots and mapping decisions only. It does not create customers, contacts, leads, or opportunities.</span>
        </div>
      </section>

      <section className={styles.reviewPanel}>
        <div className={styles.reviewHeader}>
          <div>
            <span className={styles.eyebrow}>CRM Review</span>
            <h2>Imported CRM records and exceptions</h2>
            <p>
              Confirm what came in from Monday, search the imported CRM records, and handle protected duplicate/skipped rows.
            </p>
          </div>
          <button className="button" type="button" onClick={loadCrmReview} disabled={reviewLoading}>
            {reviewLoading ? "Refreshing..." : "Refresh Review"}
          </button>
        </div>

        {reviewError && <div className={styles.errorBox}>{reviewError}</div>}

        {reviewLoading && !reviewResult && (
          <div className={styles.reviewEmpty}>Loading imported CRM records...</div>
        )}

        {reviewResult?.metrics && (
          <>
            <div className={styles.reviewMetrics}>
              <article>
                <span>Accounts</span>
                <strong>{reviewResult.metrics.accounts}</strong>
              </article>
              <article>
                <span>Contacts</span>
                <strong>{reviewResult.metrics.contacts}</strong>
              </article>
              <article>
                <span>Opportunities</span>
                <strong>{reviewResult.metrics.opportunities}</strong>
              </article>
              <article>
                <span>Activities</span>
                <strong>{reviewResult.metrics.activities}</strong>
              </article>
              <article>
                <span>Open Exceptions</span>
                <strong>{reviewResult.metrics.openExceptions}</strong>
              </article>
            </div>

            {(reviewResult.boardCounts ?? []).length > 0 && (
              <div className={styles.sourceBoardRow}>
                {(reviewResult.boardCounts ?? []).slice(0, 12).map((board) => (
                  <span key={board.boardName}>{board.boardName}: {board.count}</span>
                ))}
              </div>
            )}

            <div className={styles.reviewToolbar}>
              <input
                value={reviewSearch}
                onChange={(event) => setReviewSearch(event.target.value)}
                placeholder="Search imported CRM records, boards, Monday items, or exceptions..."
              />
              <div className={styles.reviewTabs}>
                {[
                  ["all", "All"],
                  ["account", "Accounts"],
                  ["contact", "Contacts"],
                  ["opportunity", "Opportunities"],
                  ["activity", "Activities"],
                  ["exceptions", `Exceptions (${reviewResult.metrics.openExceptions})`],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={reviewView === value ? styles.reviewTabActive : ""}
                    type="button"
                    onClick={() => setReviewView(value as CrmReviewView)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {reviewView === "exceptions" ? (
              <div className={styles.exceptionList}>
                {filteredExceptions.length === 0 ? (
                  <div className={styles.reviewEmpty}>No CRM exceptions match this view.</div>
                ) : (
                  filteredExceptions.map((exception) => {
                    const isOpen = exception.status === "Open";
                    return (
                      <article key={exception.id} className={styles.exceptionCard}>
                        <div>
                          <div className={styles.exceptionTitleRow}>
                            <span className={`${styles.statusPill} ${isOpen ? styles.statusWarn : styles.statusMuted}`}>
                              {exception.status}
                            </span>
                            <strong>{exception.monday_item_name || "Unnamed Monday item"}</strong>
                          </div>
                          <p>{exception.reason}</p>
                          <small>
                            {readableEntity(exception.entity_type as TargetEntity)} / {exception.matched_by || "No match reason"} / {exception.matched_record_id || "No matched record"}
                          </small>
                          {exceptionFieldPreview(exception) && <small>{exceptionFieldPreview(exception)}</small>}
                        </div>
                        <div className={styles.exceptionActions}>
                          <button
                            className="button"
                            type="button"
                            onClick={() => handleExceptionAction(exception.id, "resolve")}
                            disabled={!isOpen || Boolean(exceptionActionId)}
                          >
                            {exceptionActionId === `${exception.id}-resolve` ? "Saving..." : "Mark Resolved"}
                          </button>
                          <button
                            className="button"
                            type="button"
                            onClick={() => handleExceptionAction(exception.id, "ignore")}
                            disabled={!isOpen || Boolean(exceptionActionId)}
                          >
                            {exceptionActionId === `${exception.id}-ignore` ? "Saving..." : "Ignore"}
                          </button>
                          <button
                            className="button primary"
                            type="button"
                            onClick={() => handleExceptionAction(exception.id, "import_anyway")}
                            disabled={!isOpen || Boolean(exceptionActionId)}
                          >
                            {exceptionActionId === `${exception.id}-import_anyway` ? "Importing..." : "Import Anyway"}
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Record</th>
                      <th>Status</th>
                      <th>Source Board</th>
                      <th>Monday Item</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReviewRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No imported CRM records match this view.</td>
                      </tr>
                    ) : (
                      filteredReviewRecords.slice(0, 160).map((record) => (
                        <tr key={`${record.entityType}-${record.id}`}>
                          <td>{readableEntity(record.entityType as TargetEntity)}</td>
                          <td>
                            <strong>{record.title}</strong>
                            <small>{record.subtitle}</small>
                          </td>
                          <td><span className={styles.statusPill}>{record.status}</span></td>
                          <td>{record.sourceBoard}</td>
                          <td>
                            <strong>{record.mondayItem || "-"}</strong>
                            <small>{record.externalId || "-"}</small>
                          </td>
                          <td>{formatDateTime(record.updatedAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.fullImportPanel}>
        <div className={styles.reviewHeader}>
          <div>
            <span className={styles.eyebrow}>Full Monday Import</span>
            <h2>Let TITAN pull the missing Monday records for you</h2>
            <p>
              This reuses the latest CRM mapping you already saved, pulls every item from those Monday boards with pagination, and imports the clean records. Possible duplicates still go to exceptions.
            </p>
          </div>
          <button className="button primary" type="button" onClick={runFullMondayImport} disabled={fullImporting}>
            {fullImporting ? "Pulling Monday Records..." : "Run Full Monday Import"}
          </button>
        </div>

        {fullImportError && <div className={styles.errorBox}>{fullImportError}</div>}

        {fullImportResult?.ok && fullImportResult.result && (
          <div className={styles.finalizeBox}>
            <div>
              <strong>Full Monday import complete.</strong>
              <span>Batch {fullImportResult.batchId} reused mapping batch {fullImportResult.sourceBatchId}.</span>
            </div>
            <div className={styles.finalizeMetrics}>
              <span>Total {fullImportResult.result.total}</span>
              <span>Created {fullImportResult.result.created}</span>
              <span>Updated {fullImportResult.result.updated}</span>
              <span>Exceptions {fullImportResult.result.exceptions}</span>
            </div>
          </div>
        )}
      </section>

      <section className={styles.csvPanel}>
        <div className={styles.reviewHeader}>
          <div>
            <span className={styles.eyebrow}>CSV Import</span>
            <h2>Import full Monday exports into TITAN</h2>
            <p>
              Export a board from Monday as CSV, upload it here, map the columns, and post complete records into TITAN CRM. Possible duplicates are held in the exceptions queue.
            </p>
          </div>
          <span className={styles.statusPill}>{csvRows.length} rows loaded</span>
        </div>

        {csvError && <div className={styles.errorBox}>{csvError}</div>}

        <div className={styles.csvSetupGrid}>
          <label className={styles.field}>
            <span>CSV file</span>
            <input type="file" accept=".csv,text/csv" onChange={(event) => handleCsvFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className={styles.field}>
            <span>What this CSV creates</span>
            <select value={csvEntity} onChange={(event) => updateCsvEntity(event.target.value as CsvImportEntity)}>
              {csvEntityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Import label</span>
            <input
              value={csvSourceLabel}
              onChange={(event) => setCsvSourceLabel(event.target.value)}
              placeholder="Example: Monday Job Schedule full export"
            />
          </label>
        </div>

        {csvHeaders.length > 0 && (
          <>
            <div className={styles.csvSummaryRow}>
              <article>
                <span>File</span>
                <strong>{csvFileName}</strong>
              </article>
              <article>
                <span>Columns</span>
                <strong>{csvHeaders.length}</strong>
              </article>
              <article>
                <span>Mapped</span>
                <strong>{csvMappedColumns}</strong>
              </article>
              <article>
                <span>Preview</span>
                <strong>{csvPreviewRows.length}</strong>
              </article>
            </div>

            <div className={styles.csvMappingGrid}>
              <div>
                <div className={styles.cardTitle}>
                  <span className={styles.dot} />
                  <h2>Column Mapping</h2>
                </div>
                <div className={styles.csvMappingList}>
                  {csvMappings.map((mapping) => (
                    <article key={mapping.csvHeader} className={styles.csvMappingRow}>
                      <div>
                        <strong>{mapping.csvHeader}</strong>
                        <small>
                          Sample: {csvRows.find((row) => cleanText(row[mapping.csvHeader]))?.[mapping.csvHeader] || "-"}
                        </small>
                      </div>
                      <select
                        value={mapping.titanFieldKey}
                        onChange={(event) => updateCsvMapping(mapping.csvHeader, { titanFieldKey: event.target.value })}
                      >
                        <option value="">Ignore this column</option>
                        {targetFieldOptions[csvEntity].map((option) => (
                          <option key={option.value || "skip"} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <span className={`${styles.statusPill} ${mapping.mappingStatus === "Needs Review" ? styles.statusWarn : mapping.mappingStatus === "Ignored" ? styles.statusMuted : ""}`}>
                        {mapping.mappingStatus}
                      </span>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <div className={styles.cardTitle}>
                  <span className={styles.dot} />
                  <h2>CSV Preview</h2>
                </div>
                <div className={styles.csvPreviewList}>
                  {csvPreviewRows.map((row, index) => (
                    <article key={`${csvFileName}-${index}`}>
                      <strong>Row {index + 1}</strong>
                      <div className={styles.miniList}>
                        {csvMappings
                          .filter((mapping) => mapping.mappingStatus !== "Ignored" && mapping.titanFieldKey !== "metadata" && cleanText(row[mapping.csvHeader]))
                          .slice(0, 5)
                          .map((mapping) => (
                            <span key={`${index}-${mapping.csvHeader}`}>
                              <strong>{readableField(csvEntity, mapping.titanFieldKey)}</strong> {row[mapping.csvHeader]}
                            </span>
                          ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.importActionBox}>
              <div>
                <strong>Ready to import from CSV</strong>
                <span>
                  Clean rows will create or update TITAN CRM records. Possible duplicates will go to the exceptions queue for review.
                </span>
              </div>
              <button
                className="button primary"
                type="button"
                onClick={importCsv}
                disabled={csvImporting || csvRows.length === 0 || csvMappedColumns === 0}
              >
                {csvImporting ? "Importing CSV..." : "Import CSV"}
              </button>
            </div>

            {csvImportResult?.ok && csvImportResult.result && (
              <div className={styles.finalizeBox}>
                <div>
                  <strong>CSV import complete.</strong>
                  <span>Batch {csvImportResult.batchId} was posted to TITAN CRM.</span>
                </div>
                <div className={styles.finalizeMetrics}>
                  <span>Created {csvImportResult.result.created}</span>
                  <span>Updated {csvImportResult.result.updated}</span>
                  <span>Exceptions {csvImportResult.result.exceptions}</span>
                  <span>Skipped {csvImportResult.result.skipped}</span>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.dot} />
            <h2>Monday Discovery</h2>
          </div>
          <p>
            Enter specific Monday board IDs or leave this blank to pull boards visible to the API token.
          </p>
          <label className={styles.field}>
            <span>Monday board IDs</span>
            <textarea
              value={boardIds}
              onChange={(event) => setBoardIds(event.target.value)}
              placeholder="Example: 1234567890, 9876543210"
              rows={3}
            />
          </label>
          <label className={styles.field}>
            <span>Sample items per board</span>
            <input value={itemLimit} onChange={(event) => setItemLimit(event.target.value)} inputMode="numeric" />
          </label>
          <button className="button primary" type="button" onClick={runDiscovery} disabled={runningDiscovery}>
            {runningDiscovery ? "Running Discovery..." : "Run Discovery"}
          </button>
          {access.role && <small className={styles.muted}>Signed in as {access.role.replace(/_/g, " ")}.</small>}
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.dot} />
            <h2>Import Guardrails</h2>
          </div>
          <ul className={styles.ruleList}>
            <li>Every board must be included or intentionally skipped.</li>
            <li>Columns marked Needs Review are saved but will not be blindly imported.</li>
            <li>Monday IDs are kept so duplicates can be reconciled before import.</li>
            <li>The next phase will be a dry-run import, then final import approval.</li>
          </ul>
        </article>
      </section>

      {result?.error && <section className={styles.errorBox}>{result.error}</section>}

      {result && !result.error && (
        <>
          <section className={styles.metrics}>
            <article>
              <span>Boards</span>
              <strong>{totals.boards}</strong>
            </article>
            <article>
              <span>Included</span>
              <strong>{mappingTotals.includedBoards}</strong>
            </article>
            <article>
              <span>Mapped Fields</span>
              <strong>{mappingTotals.mappedColumns}</strong>
            </article>
            <article>
              <span>Needs Review</span>
              <strong>{mappingTotals.needsReview}</strong>
            </article>
          </section>

          <section className={styles.card}>
            <div className={styles.workflowHeader}>
              <div>
                <div className={styles.cardTitle}>
                  <span className={styles.dot} />
                  <h2>CRM Mapping Workbench</h2>
                </div>
                <p>{result.message}</p>
              </div>
              <div className={styles.stepRail}>
                <span className={styles.stepDone}>1 Discover</span>
                <span className={boardMappings.length ? styles.stepDone : ""}>2 Map</span>
                <span className={previewRecords.length ? styles.stepDone : ""}>3 Preview</span>
                <span className={stageResult?.ok ? styles.stepDone : ""}>4 Stage</span>
                <span className={dryRunResult?.ok ? styles.stepDone : ""}>5 Dry Run</span>
                <span className={finalizeResult?.ok ? styles.stepDone : ""}>6 Import</span>
              </div>
            </div>
            {!result.configured && (
              <p className={styles.warning}>
                Add MONDAY_API_TOKEN to the deployed server environment before running live discovery.
              </p>
            )}
            {columnTypeCounts.length > 0 && (
              <div className={styles.chips}>
                {columnTypeCounts.map(([type, count]) => (
                  <span key={type}>{type}: {count}</span>
                ))}
              </div>
            )}
          </section>

          {boardMappings.length > 0 && (
            <section className={styles.mappingLayout}>
              <div className={styles.boardPicker}>
                <div className={styles.cardTitle}>
                  <span className={styles.dot} />
                  <h2>Boards</h2>
                </div>
                {boardMappings.map((mapping) => (
                  <button
                    key={mapping.boardId}
                    className={`${styles.boardPick} ${activeMapping?.boardId === mapping.boardId ? styles.boardPickActive : ""}`}
                    type="button"
                    onClick={() => setActiveBoardId(mapping.boardId)}
                  >
                    <span>{mapping.boardName}</span>
                    <small>
                      {mapping.included ? readableEntity(mapping.boardPurpose) : "Skipped"} / {mappingMappedCount(mapping)} mapped / {mappingNeedsReview(mapping)} review
                    </small>
                  </button>
                ))}
              </div>

              {activeMapping && (
                <div className={styles.mappingPanel}>
                  <div className={styles.boardHeader}>
                    <div>
                      <span className={styles.eyebrow}>Board {activeMapping.boardId}</span>
                      <h2>{activeMapping.boardName}</h2>
                      <p>
                        Choose what this board represents and review the column mapping before staging.
                      </p>
                    </div>
                    <label className={styles.toggleLine}>
                      <input
                        type="checkbox"
                        checked={activeMapping.included}
                        onChange={(event) => updateBoardMapping(activeMapping.boardId, { included: event.target.checked })}
                      />
                      Include board
                    </label>
                  </div>

                  <div className={styles.mappingControls}>
                    <label className={styles.field}>
                      <span>Board purpose</span>
                      <select
                        value={activeMapping.boardPurpose}
                        onChange={(event) => updateBoardMapping(activeMapping.boardId, { boardPurpose: event.target.value as TargetEntity })}
                      >
                        {targetEntityOptions.filter((option) => option.value !== "ignored").map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.reviewBox}>
                      <strong>{mappingMappedCount(activeMapping)}</strong>
                      <span>mapped fields</span>
                    </div>
                    <div className={styles.reviewBox}>
                      <strong>{mappingNeedsReview(activeMapping)}</strong>
                      <span>need review</span>
                    </div>
                  </div>

                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Monday Column</th>
                          <th>Sample</th>
                          <th>TITAN Area</th>
                          <th>TITAN Field</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMapping.columns.map((column) => {
                          const board = boards.find((entry) => entry.id === activeMapping.boardId);
                          return (
                            <tr key={column.mondayColumnId}>
                              <td>
                                <strong>{column.mondayColumnTitle}</strong>
                                <small>{column.mondayColumnType}</small>
                              </td>
                              <td>{board ? sampleValues(board, column.mondayColumnId) : "-"}</td>
                              <td>
                                <select
                                  value={column.titanEntityType}
                                  onChange={(event) => updateColumnMapping(activeMapping.boardId, column.mondayColumnId, { titanEntityType: event.target.value as TargetEntity })}
                                >
                                  {targetEntityOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={column.titanFieldKey}
                                  onChange={(event) => updateColumnMapping(activeMapping.boardId, column.mondayColumnId, { titanFieldKey: event.target.value })}
                                  disabled={column.titanEntityType === "ignored"}
                                >
                                  {targetFieldOptions[column.titanEntityType].map((option) => (
                                    <option key={option.value || "skip"} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <span className={`${styles.statusPill} ${column.mappingStatus === "Needs Review" ? styles.statusWarn : column.mappingStatus === "Ignored" ? styles.statusMuted : ""}`}>
                                  {column.mappingStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {previewRecords.length > 0 && (
            <section className={styles.boardCard}>
              <div className={styles.boardHeader}>
                <div>
                  <span className={styles.eyebrow}>Safe Import Preview</span>
                  <h2>Sample records TITAN would stage from this mapping</h2>
                  <p>
                    This is still a preview. Use it to catch bad mappings before the later dry-run import.
                  </p>
                </div>
                <button className="button primary" type="button" onClick={stageMapping} disabled={staging || mappingTotals.includedBoards === 0}>
                  {staging ? "Staging..." : "Stage Mapping"}
                </button>
              </div>

              {stageResult?.error && <div className={styles.errorBox}>{stageResult.error}</div>}
              {stageResult?.ok && (
                <div className={styles.successBox}>
                  <div>
                    Mapping staged as batch {stageResult.batchId}. Saved {stageResult.boardSnapshots} board snapshots and {stageResult.columnMappings} column mappings.
                  </div>
                  {stageResult.batchId && (
                    <button className="button" type="button" onClick={() => runDryRun(stageResult.batchId || "")} disabled={dryRunning}>
                      {dryRunning ? "Running Dry Run..." : "Run Dry Run"}
                    </button>
                  )}
                </div>
              )}

              {dryRunResult?.error && <div className={styles.errorBox}>{dryRunResult.error}</div>}
              {dryRunResult?.ok && dryRunResult.summary && (
                <div className={styles.dryRunPanel}>
                  <div className={styles.cardTitle}>
                    <span className={styles.dot} />
                    <h2>Dry Run Results</h2>
                  </div>
                  <p>
                    TITAN compared the staged Monday data against existing CRM records. No customer, contact, lead, or activity records were created.
                  </p>
                  <div className={styles.dryRunMetrics}>
                    <article>
                      <span>Total Rows</span>
                      <strong>{dryRunResult.summary.total}</strong>
                    </article>
                    <article>
                      <span>Create</span>
                      <strong>{dryRunResult.summary.create}</strong>
                    </article>
                    <article>
                      <span>Update</span>
                      <strong>{dryRunResult.summary.update_existing}</strong>
                    </article>
                    <article>
                      <span>Duplicates</span>
                      <strong>{dryRunResult.summary.possible_duplicate}</strong>
                    </article>
                    <article>
                      <span>Warnings</span>
                      <strong>{dryRunResult.summary.warnings}</strong>
                    </article>
                  </div>

                  <div className={styles.importActionBox}>
                    <div>
                      <strong>Ready for Wade approval</strong>
                      <span>
                        Clean create/update rows will import. Possible duplicates and skipped rows will be held in the CRM exceptions queue.
                      </span>
                    </div>
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => finalizeImport(dryRunResult.batchId || "")}
                      disabled={finalizing || !dryRunResult.batchId}
                    >
                      {finalizing ? "Importing..." : "Approve Clean Import"}
                    </button>
                  </div>

                  {finalizeResult?.error && <div className={styles.errorBox}>{finalizeResult.error}</div>}
                  {finalizeResult?.ok && finalizeResult.result && (
                    <div className={styles.finalizeBox}>
                      <div>
                        <strong>Final import complete.</strong>
                        <span>Batch {finalizeResult.batchId} was approved and posted.</span>
                      </div>
                      <div className={styles.finalizeMetrics}>
                        <span>Created {finalizeResult.result.created}</span>
                        <span>Updated {finalizeResult.result.updated}</span>
                        <span>Exceptions {finalizeResult.result.exceptions}</span>
                        <span>Skipped {finalizeResult.result.skipped}</span>
                      </div>
                    </div>
                  )}

                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Entity</th>
                          <th>Board</th>
                          <th>Monday Record</th>
                          <th>Primary Value</th>
                          <th>Match</th>
                          <th>Warnings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dryRunResult.rows ?? []).slice(0, 80).map((row) => (
                          <tr key={row.key}>
                            <td>
                              <span className={`${styles.statusPill} ${row.action === "possible_duplicate" ? styles.statusWarn : row.action === "skip" ? styles.statusMuted : ""}`}>
                                {row.action.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td>{readableEntity(row.entityType as TargetEntity)}</td>
                            <td>{row.boardName}</td>
                            <td>
                              <strong>{row.mondayItemName}</strong>
                              <small>{row.mondayItemId}</small>
                            </td>
                            <td>{row.primaryValue}</td>
                            <td>{row.matchedRecordId ? `${row.matchedBy}: ${row.matchedRecordId}` : "-"}</td>
                            <td>
                              {row.warnings.length ? (
                                <div className={styles.warningList}>
                                  {row.warnings.map((warning) => <span key={`${row.key}-${warning}`}>{warning}</span>)}
                                </div>
                              ) : (
                                <span className={styles.statusPill}>Clean</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Board</th>
                      <th>Entity</th>
                      <th>Monday Item</th>
                      <th>Primary Value</th>
                      <th>Mapped Fields</th>
                      <th>Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRecords.slice(0, 40).map((record) => (
                      <tr key={record.key}>
                        <td>{record.boardName}</td>
                        <td>{readableEntity(record.entity)}</td>
                        <td>
                          <strong>{record.mondayItemName}</strong>
                          <small>{record.groupName} / {record.mondayItemId}</small>
                        </td>
                        <td>{record.primaryValue}</td>
                        <td>
                          <div className={styles.miniList}>
                            {record.mappedFields.slice(0, 4).map((field) => (
                              <span key={`${record.key}-${field.label}`}>
                                <strong>{field.label}</strong> {field.value}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {record.warnings.length ? (
                            <div className={styles.warningList}>
                              {record.warnings.map((warning) => <span key={warning}>{warning}</span>)}
                            </div>
                          ) : (
                            <span className={styles.statusPill}>Clean</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      </details>
    </main>
  );
}
