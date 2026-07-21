"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    async function loadAccess() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        window.location.href = "/login";
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

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.href = "/login";
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

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.href = "/login";
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
                  Mapping staged as batch {stageResult.batchId}. Saved {stageResult.boardSnapshots} board snapshots and {stageResult.columnMappings} column mappings.
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
    </main>
  );
}
