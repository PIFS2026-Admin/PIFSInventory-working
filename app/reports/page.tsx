"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import styles from "./reports.module.css";

type ReportSourceKey =
  | "pipe_inventory"
  | "consumables"
  | "issue_tickets"
  | "issue_ticket_lines"
  | "purchase_orders"
  | "work_orders";

type ColumnType = "text" | "number" | "date" | "money";

type ReportColumn = {
  key: string;
  label: string;
  type?: ColumnType;
};

type ReportRow = Record<string, string | number | boolean | null>;

type DbRow = Record<string, unknown>;

type ReportFilters = {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
};

type ReportTemplate = {
  id: string;
  name: string;
  sourceKey: ReportSourceKey;
  selectedColumns: string[];
  filters: ReportFilters;
  groupBy: string;
  createdAt: string;
  storage: "supabase" | "local";
};

type ReportSourceConfig = {
  label: string;
  description: string;
  defaultColumns: string[];
  dateKey?: string;
  statusKey?: string;
  columns: ReportColumn[];
};

const savedReportKey = "titan.customReports.v1";

const emptyFilters: ReportFilters = {
  search: "",
  status: "all",
  dateFrom: "",
  dateTo: "",
};

const sourceConfigs: Record<ReportSourceKey, ReportSourceConfig> = {
  pipe_inventory: {
    label: "Tubular Inventory",
    description: "Customer pipe by rack, work zone, spec, status, joints, and footage.",
    dateKey: "createdAt",
    statusKey: "status",
    defaultColumns: ["company", "location", "partNumber", "size", "grade", "connection", "range", "status", "condition", "joints", "footage"],
    columns: [
      { key: "company", label: "Company" },
      { key: "location", label: "Location" },
      { key: "operator", label: "Operator" },
      { key: "rig", label: "Rig" },
      { key: "partNumber", label: "Part Number" },
      { key: "size", label: "Size" },
      { key: "grade", label: "Grade" },
      { key: "connection", label: "Connection" },
      { key: "range", label: "Range" },
      { key: "status", label: "Status" },
      { key: "condition", label: "Condition" },
      { key: "joints", label: "Joints", type: "number" },
      { key: "footage", label: "Footage", type: "number" },
      { key: "createdAt", label: "Date Created", type: "date" },
    ],
  },
  consumables: {
    label: "Consumables Inventory",
    description: "Item master, on-hand quantity, vendors, bins, reorder targets, and value.",
    statusKey: "stockStatus",
    defaultColumns: ["itemCode", "itemName", "category", "location", "vendor", "qtyOnHand", "minQuantity", "maxQuantity", "unitPrice", "inventoryValue", "stockStatus"],
    columns: [
      { key: "itemCode", label: "SKU" },
      { key: "itemName", label: "Item" },
      { key: "category", label: "Category" },
      { key: "location", label: "Bin" },
      { key: "vendor", label: "Vendor" },
      { key: "barcode", label: "Barcode" },
      { key: "uom", label: "UOM" },
      { key: "qtyOnHand", label: "On Hand", type: "number" },
      { key: "minQuantity", label: "Min", type: "number" },
      { key: "maxQuantity", label: "Max", type: "number" },
      { key: "unitPrice", label: "Unit Cost", type: "money" },
      { key: "inventoryValue", label: "Inventory Value", type: "money" },
      { key: "stockStatus", label: "Stock Status" },
    ],
  },
  issue_tickets: {
    label: "Issue Tickets",
    description: "Issued consumables by ticket, employee, department, unit, status, and spend.",
    dateKey: "issueDate",
    statusKey: "status",
    defaultColumns: ["ticketNumber", "issueDate", "issuedTo", "department", "pickedBy", "unitTruck", "jobNumber", "status", "totalValue"],
    columns: [
      { key: "ticketNumber", label: "Ticket" },
      { key: "issueDate", label: "Issue Date", type: "date" },
      { key: "issuedTo", label: "Issued To" },
      { key: "department", label: "Department" },
      { key: "pickedBy", label: "Picked By" },
      { key: "unitTruck", label: "Unit / Truck" },
      { key: "jobNumber", label: "Job Number" },
      { key: "status", label: "Status" },
      { key: "totalValue", label: "Issued Spend", type: "money" },
      { key: "notes", label: "Notes" },
    ],
  },
  issue_ticket_lines: {
    label: "Issue Ticket Line Items",
    description: "Every issued item line with quantity, unit cost, line value, employee, and department.",
    dateKey: "createdAt",
    statusKey: "lineProcessed",
    defaultColumns: ["ticketNumber", "createdAt", "itemCode", "itemName", "department", "unitTruck", "pickedBy", "qtyIssued", "unitCost", "lineValue"],
    columns: [
      { key: "ticketNumber", label: "Ticket" },
      { key: "createdAt", label: "Created", type: "date" },
      { key: "itemCode", label: "SKU" },
      { key: "itemName", label: "Item" },
      { key: "department", label: "Department" },
      { key: "unitTruck", label: "Unit / Truck" },
      { key: "pickedBy", label: "Picked By" },
      { key: "qtyIssued", label: "Qty", type: "number" },
      { key: "unitCost", label: "Unit Cost", type: "money" },
      { key: "lineValue", label: "Line Value", type: "money" },
      { key: "lineProcessed", label: "Processed" },
    ],
  },
  purchase_orders: {
    label: "Purchase Orders",
    description: "Vendor PO headers with requester, department, cost center, status, and value.",
    dateKey: "orderDate",
    statusKey: "status",
    defaultColumns: ["poNumber", "orderDate", "vendor", "requestedBy", "department", "costCenter", "status", "totalAmount"],
    columns: [
      { key: "poNumber", label: "PO Number" },
      { key: "orderDate", label: "Order Date", type: "date" },
      { key: "vendor", label: "Vendor" },
      { key: "requestedBy", label: "Requester" },
      { key: "department", label: "Department" },
      { key: "budgetCode", label: "Budget Code" },
      { key: "costCenter", label: "Cost Center" },
      { key: "status", label: "Status" },
      { key: "totalAmount", label: "Total", type: "money" },
      { key: "notes", label: "Notes" },
    ],
  },
  work_orders: {
    label: "Equipment Repair Work Orders",
    description: "Repair work orders by equipment, tech, priority, status, time, parts, and total cost.",
    dateKey: "openedAt",
    statusKey: "status",
    defaultColumns: ["workOrderNumber", "openedAt", "equipmentNumber", "equipmentName", "department", "assignedTo", "priority", "status", "laborHours", "totalPartsCost", "totalCost"],
    columns: [
      { key: "workOrderNumber", label: "Work Order" },
      { key: "openedAt", label: "Opened", type: "date" },
      { key: "closedAt", label: "Closed", type: "date" },
      { key: "equipmentNumber", label: "Equipment #" },
      { key: "equipmentName", label: "Equipment" },
      { key: "equipmentType", label: "Type" },
      { key: "department", label: "Department" },
      { key: "assignedTo", label: "Assigned To" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "laborHours", label: "Hours", type: "number" },
      { key: "totalLaborCost", label: "Labor Cost", type: "money" },
      { key: "totalPartsCost", label: "Parts Cost", type: "money" },
      { key: "totalCost", label: "Total Cost", type: "money" },
    ],
  },
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `report-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function numberValue(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function dateValue(value: unknown) {
  const raw = textValue(value);
  if (!raw) return "";
  return raw.slice(0, 10);
}

function relatedObject(value: unknown): DbRow {
  if (Array.isArray(value)) return (value[0] ?? {}) as DbRow;
  return (value ?? {}) as DbRow;
}

function pipeFootage(row: DbRow) {
  const totalFootage = numberValue(row.total_footage);
  if (totalFootage > 0) return totalFootage;
  const bulkFootage = numberValue(row.bulk_footage);
  if (bulkFootage > 0) return bulkFootage;
  const joints = numberValue(row.bulk_joints);
  const range = textValue(row.pipe_range).toLowerCase();
  return joints * (range.includes("3") ? 45 : 31.5);
}

function formatMoney(value: unknown) {
  return numberValue(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function formatNumber(value: unknown) {
  return numberValue(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatCell(value: unknown, type?: ColumnType) {
  if (type === "money") return formatMoney(value);
  if (type === "number") return formatNumber(value);
  if (type === "date") {
    const raw = dateValue(value);
    if (!raw) return "-";
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString();
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return textValue(value) || "-";
}

function downloadCsv(fileName: string, columns: ReportColumn[], rows: ReportRow[]) {
  const escapeCsv = (value: unknown) => `"${textValue(value).replaceAll('"', '""')}"`;
  const csvRows = [
    columns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column.key])).join(",")),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function loadSavedReports(): ReportTemplate[] {
  try {
    const reports = JSON.parse(localStorage.getItem(savedReportKey) || "[]") as Partial<ReportTemplate>[];
    return reports
      .filter((report) => report.id && report.name && report.sourceKey)
      .map((report) => ({
        id: textValue(report.id),
        name: textValue(report.name),
        sourceKey: report.sourceKey as ReportSourceKey,
        selectedColumns: Array.isArray(report.selectedColumns) ? report.selectedColumns.map(textValue) : [],
        filters: normalizeFilters(report.filters),
        groupBy: textValue(report.groupBy),
        createdAt: textValue(report.createdAt) || new Date().toISOString(),
        storage: report.storage || "local",
      }));
  } catch {
    return [];
  }
}

function saveReports(reports: ReportTemplate[]) {
  localStorage.setItem(savedReportKey, JSON.stringify(reports));
}

function normalizeFilters(value: unknown): ReportFilters {
  const raw = (value || {}) as Partial<ReportFilters>;
  return {
    search: textValue(raw.search),
    status: textValue(raw.status) || "all",
    dateFrom: textValue(raw.dateFrom),
    dateTo: textValue(raw.dateTo),
  };
}

function mapSavedReportRow(row: DbRow): ReportTemplate {
  return {
    id: textValue(row.id),
    name: textValue(row.name),
    sourceKey: textValue(row.source_key) as ReportSourceKey,
    selectedColumns: Array.isArray(row.selected_columns) ? row.selected_columns.map(textValue) : [],
    filters: normalizeFilters(row.filters),
    groupBy: textValue(row.group_by),
    createdAt: textValue(row.created_at) || new Date().toISOString(),
    storage: "supabase",
  };
}

async function loadSavedReportsFromSupabase() {
  const { data, error } = await supabase
    .from("custom_reports")
    .select("id, name, source_key, selected_columns, filters, group_by, created_at")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return [];
  return ((data || []) as DbRow[]).map(mapSavedReportRow);
}

export default function ReportsPage() {
  const [sourceKey, setSourceKey] = useState<ReportSourceKey>("pipe_inventory");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(sourceConfigs.pipe_inventory.defaultColumns);
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters);
  const [groupBy, setGroupBy] = useState("");
  const [reportName, setReportName] = useState("My custom report");
  const [savedReports, setSavedReports] = useState<ReportTemplate[]>(() =>
    typeof window === "undefined" ? [] : loadSavedReports()
  );
  const [currentUserId, setCurrentUserId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const config = sourceConfigs[sourceKey];
  const columnMap = useMemo(() => new Map(config.columns.map((column) => [column.key, column])), [config.columns]);

  useEffect(() => {
    let cancelled = false;

    async function loadReportTemplates() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;
      const templates = await loadSavedReportsFromSupabase();
      if (cancelled) return;
      setCurrentUserId(user.id);
      setSavedReports(templates.length ? templates : loadSavedReports());
    }

    void loadReportTemplates();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      setLoading(true);
      setMessage("");

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        window.location.href = "/login";
        return;
      }

      const result = await loadReportRows(sourceKey);
      if (cancelled) return;

      if (result.error) {
        setRows([]);
        setMessage(result.error);
      } else {
        setRows(result.rows);
      }

      setLoading(false);
    }

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  const statusOptions = useMemo(() => {
    if (!config.statusKey) return [];
    return Array.from(new Set(rows.map((row) => textValue(row[config.statusKey || ""]).trim()).filter(Boolean))).sort();
  }, [config.statusKey, rows]);

  const filteredRows = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase();

    return rows.filter((row) => {
      if (searchTerm && !Object.values(row).join(" ").toLowerCase().includes(searchTerm)) return false;

      if (config.statusKey && filters.status !== "all") {
        if (textValue(row[config.statusKey]) !== filters.status) return false;
      }

      if (config.dateKey && filters.dateFrom) {
        if (dateValue(row[config.dateKey]) < filters.dateFrom) return false;
      }

      if (config.dateKey && filters.dateTo) {
        if (dateValue(row[config.dateKey]) > filters.dateTo) return false;
      }

      return true;
    });
  }, [config.dateKey, config.statusKey, filters, rows]);

  const selectedColumnDefs = useMemo(
    () => selectedColumns.map((key) => columnMap.get(key)).filter((column): column is ReportColumn => Boolean(column)),
    [columnMap, selectedColumns]
  );

  const numericColumns = useMemo(
    () => selectedColumnDefs.filter((column) => column.type === "number" || column.type === "money"),
    [selectedColumnDefs]
  );

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const groupColumn = columnMap.get(groupBy);
    if (!groupColumn) return null;

    const groups = new Map<string, ReportRow>();
    filteredRows.forEach((row) => {
      const label = textValue(row[groupBy]) || "Unassigned";
      const current = groups.get(label) || { group: label, records: 0 };
      current.records = numberValue(current.records) + 1;
      numericColumns.forEach((column) => {
        current[column.key] = numberValue(current[column.key]) + numberValue(row[column.key]);
      });
      groups.set(label, current);
    });

    const columns: ReportColumn[] = [
      { key: "group", label: groupColumn.label },
      { key: "records", label: "Records", type: "number" },
      ...numericColumns.filter((column) => column.key !== groupBy),
    ];

    return {
      columns,
      rows: Array.from(groups.values()).sort((a, b) => textValue(a.group).localeCompare(textValue(b.group))),
    };
  }, [columnMap, filteredRows, groupBy, numericColumns]);

  const displayColumns = grouped?.columns || selectedColumnDefs;
  const displayRows = grouped?.rows || filteredRows;

  const kpiColumns = numericColumns.slice(0, 4);

  function setFilter<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function changeSource(nextSourceKey: ReportSourceKey) {
    setSourceKey(nextSourceKey);
    setSelectedColumns(sourceConfigs[nextSourceKey].defaultColumns);
    setFilters(emptyFilters);
    setGroupBy("");
  }

  function toggleColumn(key: string) {
    setSelectedColumns((current) => {
      if (current.includes(key)) {
        const next = current.filter((columnKey) => columnKey !== key);
        return next.length ? next : current;
      }
      return [...current, key];
    });
  }

  async function saveTemplate() {
    const trimmedName = reportName.trim();
    if (!trimmedName) {
      setMessage("Name the report before saving it.");
      return;
    }

    const nextTemplate: ReportTemplate = {
      id: createId(),
      name: trimmedName,
      sourceKey,
      selectedColumns,
      filters,
      groupBy,
      createdAt: new Date().toISOString(),
      storage: currentUserId ? "supabase" : "local",
    };

    let savedTemplate = nextTemplate;

    if (currentUserId) {
      const { data, error } = await supabase
        .from("custom_reports")
        .insert({
          owner_id: currentUserId,
          name: trimmedName,
          source_key: sourceKey,
          selected_columns: selectedColumns,
          filters,
          group_by: groupBy,
          active: true,
        })
        .select("id, name, source_key, selected_columns, filters, group_by, created_at")
        .single();

      if (error) {
        savedTemplate = { ...nextTemplate, storage: "local" };
        setMessage(`Saved locally because custom report table is not ready: ${error.message}`);
      } else if (data) {
        savedTemplate = mapSavedReportRow(data as DbRow);
      }
    }

    const nextReports = [savedTemplate, ...savedReports.filter((report) => report.name !== trimmedName)].slice(0, 30);
    setSavedReports(nextReports);
    saveReports(nextReports);
    setMessage(`Saved custom report: ${trimmedName}`);
  }

  function openTemplate(template: ReportTemplate) {
    setReportName(template.name);
    setSourceKey(template.sourceKey);
    setSelectedColumns(template.selectedColumns);
    setFilters(template.filters);
    setGroupBy(template.groupBy);
    setMessage(`Loaded custom report: ${template.name}`);
  }

  async function deleteTemplate(templateId: string) {
    const nextReports = savedReports.filter((report) => report.id !== templateId);
    setSavedReports(nextReports);
    saveReports(nextReports);

    const template = savedReports.find((report) => report.id === templateId);
    if (template?.storage !== "supabase") return;

    const { error } = await supabase.from("custom_reports").update({ active: false }).eq("id", templateId);
    if (error) setMessage(`Report was removed here, but Supabase could not archive it: ${error.message}`);
  }

  async function refreshRows() {
    setLoading(true);
    const result = await loadReportRows(sourceKey);
    if (result.error) {
      setRows([]);
      setMessage(result.error);
    } else {
      setRows(result.rows);
      setMessage(`Loaded ${result.rows.length.toLocaleString()} ${config.label.toLowerCase()} records.`);
    }
    setLoading(false);
  }

  function exportCurrentCsv() {
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`titan-${sourceKey}-${today}.csv`, displayColumns, displayRows);
  }

  return (
    <main className={styles.scope}>
      <section className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Reports</span>
          <h1>Custom Report Builder</h1>
          <p>Create the report you need, save the layout, reload live TITAN data, and export it.</p>
        </div>
        <div className={styles.actions}>
          <Link className="button" href="/home">TITAN Home</Link>
          <button className="button" type="button" onClick={refreshRows} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button className="button primary" type="button" onClick={exportCurrentCsv} disabled={!displayRows.length}>
            Export CSV
          </button>
        </div>
      </section>

      {message && <div className={styles.message}>{message}</div>}

      <section className={styles.layout}>
        <div className={styles.builder}>
          <section className={styles.card}>
            <div className={styles.sectionTitle}>
              <span>01</span>
              <div>
                <h2>Build Report</h2>
                <p>Pick a source, filter it, and choose only the columns you want.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <label>
                Report Name
                <input value={reportName} onChange={(event) => setReportName(event.target.value)} />
              </label>
              <label>
                Data Source
                <select value={sourceKey} onChange={(event) => changeSource(event.target.value as ReportSourceKey)}>
                  {Object.entries(sourceConfigs).map(([key, source]) => (
                    <option key={key} value={key}>{source.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.wide}>
                Lookup
                <input
                  value={filters.search}
                  onChange={(event) => setFilter("search", event.target.value)}
                  placeholder="Search any visible or hidden value..."
                />
              </label>
              {config.statusKey && (
                <label>
                  Status
                  <select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
                    <option value="all">All statuses</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              )}
              {config.dateKey && (
                <>
                  <label>
                    Date From
                    <input type="date" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} />
                  </label>
                  <label>
                    Date To
                    <input type="date" value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} />
                  </label>
                </>
              )}
              <label>
                Group By
                <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
                  <option value="">No grouping</option>
                  {config.columns.map((column) => (
                    <option key={column.key} value={column.key}>{column.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.columnPicker}>
              {config.columns.map((column) => (
                <label key={column.key} className={selectedColumns.includes(column.key) ? styles.checkedColumn : ""}>
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column.key)}
                    onChange={() => toggleColumn(column.key)}
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>

            <div className={styles.builderActions}>
              <button className="button primary" type="button" onClick={saveTemplate}>Save Custom Report</button>
              <button className="button" type="button" onClick={() => {
                setSelectedColumns(config.defaultColumns);
                setFilters(emptyFilters);
                setGroupBy("");
              }}>
                Reset Layout
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionTitle}>
              <span>02</span>
              <div>
                <h2>Saved Reports</h2>
                <p>Saved on this device for quick reuse while the live data refreshes from TITAN.</p>
              </div>
            </div>
            <div className={styles.savedList}>
              {savedReports.map((template) => (
                <article key={template.id}>
                  <button type="button" onClick={() => openTemplate(template)}>
                    <strong>{template.name}</strong>
                    <small>{sourceConfigs[template.sourceKey].label} / {template.selectedColumns.length} columns</small>
                  </button>
                  <button className={styles.deleteButton} type="button" onClick={() => deleteTemplate(template.id)}>Delete</button>
                </article>
              ))}
              {savedReports.length === 0 && <p>No saved custom reports yet.</p>}
            </div>
          </section>
        </div>

        <div className={styles.preview}>
          <section className={styles.kpiGrid}>
            <article>
              <span>Records</span>
              <strong>{filteredRows.length.toLocaleString()}</strong>
              <small>{config.label}</small>
            </article>
            {kpiColumns.map((column) => {
              const total = filteredRows.reduce((sum, row) => sum + numberValue(row[column.key]), 0);
              return (
                <article key={column.key}>
                  <span>{column.label}</span>
                  <strong>{column.type === "money" ? formatMoney(total) : formatNumber(total)}</strong>
                  <small>Filtered total</small>
                </article>
              );
            })}
          </section>

          <section className={styles.card}>
            <div className={styles.previewHeader}>
              <div>
                <h2>{grouped ? `Grouped ${config.label}` : config.label}</h2>
                <p>{config.description}</p>
              </div>
              <span>{displayRows.length.toLocaleString()} rows</span>
            </div>

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    {displayColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.slice(0, 500).map((row, index) => (
                    <tr key={`${textValue(row.id) || index}-${index}`}>
                      {displayColumns.map((column) => (
                        <td key={column.key}>{formatCell(row[column.key], column.type)}</td>
                      ))}
                    </tr>
                  ))}
                  {!displayRows.length && (
                    <tr>
                      <td colSpan={Math.max(displayColumns.length, 1)}>No records match this report.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {displayRows.length > 500 && <p className={styles.note}>Showing first 500 rows on screen. CSV export includes all filtered rows.</p>}
          </section>
        </div>
      </section>
    </main>
  );
}

async function loadReportRows(sourceKey: ReportSourceKey): Promise<{ rows: ReportRow[]; error: string }> {
  try {
    if (sourceKey === "pipe_inventory") {
      const { data, error } = await supabase
        .from("pipe_inventory")
        .select(`
          id,
          afe,
          operator,
          rig,
          part_number,
          size,
          grade,
          connection,
          pipe_range,
          condition,
          status,
          bulk_joints,
          bulk_footage,
          total_footage,
          created_at,
          companies(name),
          racks(rack_code),
          workflow_zones(code, name)
        `)
        .gt("bulk_joints", 0)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error) return { rows: [], error: `Tubular inventory failed: ${error.message}` };

      return {
        rows: ((data || []) as DbRow[]).map((row) => {
          const company = relatedObject(row.companies);
          const rack = relatedObject(row.racks);
          const zone = relatedObject(row.workflow_zones);
          const joints = numberValue(row.bulk_joints);
          return {
            id: textValue(row.id),
            company: textValue(company.name),
            location: textValue(rack.rack_code) || textValue(zone.name) || textValue(zone.code) || "Unassigned",
            operator: textValue(row.operator) || "-",
            rig: textValue(row.rig) || "-",
            partNumber: textValue(row.part_number),
            size: textValue(row.size),
            grade: textValue(row.grade),
            connection: textValue(row.connection),
            range: textValue(row.pipe_range),
            status: textValue(row.status),
            condition: textValue(row.condition),
            joints,
            footage: pipeFootage(row),
            createdAt: dateValue(row.created_at),
          };
        }),
        error: "",
      };
    }

    if (sourceKey === "consumables") {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id, item_code, item_name, category, location, qty_on_hand, min_quantity, max_quantity, unit_price, barcode, uom, active, low_stock, inventory_vendors(vendor_name)")
        .order("item_code")
        .limit(5000);

      if (error) return { rows: [], error: `Consumables failed: ${error.message}` };

      return {
        rows: ((data || []) as DbRow[]).map((row) => {
          const vendor = relatedObject(row.inventory_vendors);
          const qtyOnHand = numberValue(row.qty_on_hand);
          const minQuantity = numberValue(row.min_quantity);
          const unitPrice = numberValue(row.unit_price);
          return {
            id: textValue(row.id),
            itemCode: textValue(row.item_code),
            itemName: textValue(row.item_name),
            category: textValue(row.category),
            location: textValue(row.location),
            vendor: textValue(vendor.vendor_name) || "-",
            barcode: textValue(row.barcode),
            uom: textValue(row.uom),
            qtyOnHand,
            minQuantity,
            maxQuantity: numberValue(row.max_quantity),
            unitPrice,
            inventoryValue: qtyOnHand * unitPrice,
            stockStatus: qtyOnHand <= 0 ? "Out" : Boolean(row.low_stock) || qtyOnHand <= minQuantity ? "Low Stock" : "OK",
          };
        }),
        error: "",
      };
    }

    if (sourceKey === "issue_tickets") {
      const { data, error } = await supabase
        .from("inventory_issue_tickets")
        .select("id, ticket_number, issue_date, issued_to, department, picked_by, unit_truck, job_number, total_value, status, notes, created_at")
        .order("issue_date", { ascending: false })
        .limit(5000);

      if (error) return { rows: [], error: `Issue tickets failed: ${error.message}` };

      return {
        rows: ((data || []) as DbRow[]).map((row) => ({
          id: textValue(row.id),
          ticketNumber: textValue(row.ticket_number),
          issueDate: dateValue(row.issue_date || row.created_at),
          issuedTo: textValue(row.issued_to),
          department: textValue(row.department),
          pickedBy: textValue(row.picked_by),
          unitTruck: textValue(row.unit_truck),
          jobNumber: textValue(row.job_number),
          status: textValue(row.status),
          totalValue: numberValue(row.total_value),
          notes: textValue(row.notes),
        })),
        error: "",
      };
    }

    if (sourceKey === "issue_ticket_lines") {
      const { data, error } = await supabase
        .from("inventory_issue_ticket_lines")
        .select("id, ticket_number, item_code, item_name, department, qty_issued, unit_cost, line_value, unit_truck, picked_by, line_processed, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error) return { rows: [], error: `Issue ticket lines failed: ${error.message}` };

      return {
        rows: ((data || []) as DbRow[]).map((row) => ({
          id: textValue(row.id),
          ticketNumber: textValue(row.ticket_number),
          createdAt: dateValue(row.created_at),
          itemCode: textValue(row.item_code),
          itemName: textValue(row.item_name),
          department: textValue(row.department),
          qtyIssued: numberValue(row.qty_issued),
          unitCost: numberValue(row.unit_cost),
          lineValue: numberValue(row.line_value),
          unitTruck: textValue(row.unit_truck),
          pickedBy: textValue(row.picked_by),
          lineProcessed: Boolean(row.line_processed) ? "Processed" : "Open",
        })),
        error: "",
      };
    }

    if (sourceKey === "purchase_orders") {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_name, order_date, requested_by, department, budget_code, cost_center, status, total_amount, total_value, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error) return { rows: [], error: `Purchase orders failed: ${error.message}` };

      return {
        rows: ((data || []) as DbRow[]).map((row) => ({
          id: textValue(row.id),
          poNumber: textValue(row.po_number),
          orderDate: dateValue(row.order_date || row.created_at),
          vendor: textValue(row.vendor_name),
          requestedBy: textValue(row.requested_by),
          department: textValue(row.department),
          budgetCode: textValue(row.budget_code),
          costCenter: textValue(row.cost_center),
          status: textValue(row.status),
          totalAmount: numberValue(row.total_amount || row.total_value),
          notes: textValue(row.notes),
        })),
        error: "",
      };
    }

    const { data, error } = await supabase
      .from("equipment_repair_work_orders")
      .select("id, work_order_number, status, priority, equipment_number, equipment_name, equipment_type, department, assigned_to, requested_by_name, labor_hours, total_labor_cost, total_parts_cost, total_cost, opened_at, closed_at")
      .order("opened_at", { ascending: false })
      .limit(5000);

    if (error) return { rows: [], error: `Equipment repair work orders failed: ${error.message}` };

    return {
      rows: ((data || []) as DbRow[]).map((row) => ({
        id: textValue(row.id),
        workOrderNumber: textValue(row.work_order_number),
        openedAt: dateValue(row.opened_at),
        closedAt: dateValue(row.closed_at),
        equipmentNumber: textValue(row.equipment_number),
        equipmentName: textValue(row.equipment_name),
        equipmentType: textValue(row.equipment_type),
        department: textValue(row.department),
        assignedTo: textValue(row.assigned_to),
        requestedBy: textValue(row.requested_by_name),
        priority: textValue(row.priority),
        status: textValue(row.status),
        laborHours: numberValue(row.labor_hours),
        totalLaborCost: numberValue(row.total_labor_cost),
        totalPartsCost: numberValue(row.total_parts_cost),
        totalCost: numberValue(row.total_cost),
      })),
      error: "",
    };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : "Reports failed to load.",
    };
  }
}
