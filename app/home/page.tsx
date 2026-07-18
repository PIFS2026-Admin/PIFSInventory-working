"use client";

import { useEffect, useMemo, useState } from "react";
import NotificationCenter from "../../components/NotificationCenter";
import { supabase } from "../../lib/supabase";
import {
  ModuleKey,
  defaultModulesForRole,
  moduleHrefToKey,
} from "../../lib/modulePermissions";

type Profile = {
  fullName: string;
  role: string;
  modules: ModuleKey[];
};

type YardOption = {
  id: string;
  name: string;
  code: string;
};

type LaunchCard = {
  title: string;
  href: string;
};

type BreakdownLine = {
  label: string;
  value: number;
  valueText?: string;
  subText?: string;
};

type ActivityLine = {
  id: string;
  title: string;
  detail: string;
  meta: string;
};

type PipeInventoryLine = {
  id: string;
  company: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  status: string;
  location: string;
  joints: number;
  footage: number;
  createdAt: string;
};

type PipeActivityLine = {
  id: string;
  type: string;
  company: string;
  joints: number;
  footage: number;
  fromLocation: string;
  toLocation: string;
  comment: string;
  createdAt: string;
};

type ConsumableItemLine = {
  id: string;
  itemId: string;
  name: string;
  category: string;
  vendor: string;
  location: string;
  qtyOnHand: number;
  minQty: number;
  unitPrice: number;
  lowStock: boolean;
};

type ConsumableTransactionLine = {
  id: string;
  itemName: string;
  category: string;
  vendor: string;
  type: string;
  quantity: number;
  value: number;
  date: string;
  reference: string;
};

type InventoryIssueTicketLine = {
  id: string;
  ticketNumber: string;
  issueDate: string;
  issuedTo: string;
  department: string;
  pickedBy: string;
  unitTruck: string;
  totalValue: number;
  status: string;
};

type InventoryIssueTicketDetailLine = {
  id: string;
  ticketId: string;
  ticketNumber: string;
  issueDate: string;
  itemCode: string;
  itemName: string;
  category: string;
  vendor: string;
  department: string;
  unitTruck: string;
  pickedBy: string;
  quantity: number;
  unitCost: number;
  value: number;
};

type PurchaseOrderLine = {
  id: string;
  poNumber: string;
  vendor: string;
  status: string;
  totalValue: number;
  orderDate: string;
};

type ConsumableStoreRequestLine = {
  id: string;
  orderNumber: string;
  orderDate: string;
  requestedBy: string;
  department: string;
  unitTruck: string;
  status: string;
  totalValue: number;
  lineCount: number;
};

type LeadPerformanceLine = {
  name: string;
  jobs: number;
  closed: number;
  average: number;
  grade: string;
  redFlags: number;
  strongestOperator: string;
  strength: string;
  focusArea: string;
};

type DtiChecklistResponseLine = {
  id: string;
  dtiJobId: string;
  section: string;
  category: string;
  score: number | null;
  redFlag: boolean;
};

type DashboardData = {
  pipeInventory: PipeInventoryLine[];
  pipeActivity: PipeActivityLine[];
  consumableItems: ConsumableItemLine[];
  consumableTransactions: ConsumableTransactionLine[];
  issueTickets: InventoryIssueTicketLine[];
  issueTicketLines: InventoryIssueTicketDetailLine[];
  storeRequests: ConsumableStoreRequestLine[];
  purchaseOrders: PurchaseOrderLine[];
  leadPerformance: LeadPerformanceLine[];
  preJobPerformance: LeadPerformanceLine[];
  warnings: string[];
};

type DashboardFilters = {
  startDate: string;
  endDate: string;
  customer: string;
  department: string;
  lead: string;
};

type ProfileNameMap = Map<string, string>;

const PRE_JOB_MANAGEMENT_NAMES = new Set([
  "shawn leblanc",
  "jesus de los santos",
  "adrian adame",
  "jonathan alvarado",
]);

const emptyData: DashboardData = {
  pipeInventory: [],
  pipeActivity: [],
  consumableItems: [],
  consumableTransactions: [],
  issueTickets: [],
  issueTicketLines: [],
  storeRequests: [],
  purchaseOrders: [],
  leadPerformance: [],
  preJobPerformance: [],
  warnings: [],
};

const launchCards: LaunchCard[] = [
  {
    title: "Command Center",
    href: "/dashboard",
  },
  {
    title: "Yard View",
    href: "/",
  },
  {
    title: "Consumables",
    href: "/inventory",
  },
  {
    title: "Purchase Orders",
    href: "/purchase-orders",
  },
  {
    title: "Equipment Repairs",
    href: "/equipment-repairs",
  },
  {
    title: "Document Control",
    href: "/document-control",
  },
  {
    title: "Service Lines",
    href: "/service-lines",
  },
  {
    title: "Communications",
    href: "/communications",
  },
  {
    title: "Financials",
    href: "/financials",
  },
  {
    title: "Reports",
    href: "/?open=reports",
  },
  {
    title: "Admin Controls",
    href: "/admin",
  },
];

const mobileLaunchCards: LaunchCard[] = [
  {
    title: "Command Center",
    href: "/dashboard",
  },
  {
    title: "Yard View",
    href: "/",
  },
  {
    title: "Consumables",
    href: "/inventory",
  },
  {
    title: "Consumables Store",
    href: "/inventory?view=orders",
  },
  {
    title: "Purchase Orders",
    href: "/purchase-orders",
  },
  {
    title: "Equipment Repairs",
    href: "/equipment-repairs",
  },
  {
    title: "Document Control",
    href: "/document-control",
  },
  {
    title: "Service Lines",
    href: "/service-lines",
  },
  {
    title: "Communications",
    href: "/communications",
  },
  {
    title: "Financials",
    href: "/financials",
  },
  {
    title: "Reports",
    href: "/?open=reports",
  },
  {
    title: "Admin Controls",
    href: "/admin",
  },
];

const departmentOptions = ["All Departments", "Yard", "Inventory", "Purchase Orders", "DTI", "Hardband"];
const serviceLineModuleKeys: ModuleKey[] = ["dti", "dti_summary", "hardband"];

function normalizeRole(role: unknown) {
  return typeof role === "string" ? role.toLowerCase() : "customer";
}

function canOpenHref(modules: ModuleKey[], href?: string) {
  if (!href) return false;
  if (href === "/home" || href.startsWith("/home#")) return true;
  if (href === "/service-lines") return modules.some((module) => serviceLineModuleKeys.includes(module));
  if (href.startsWith("/inventory?")) return modules.includes("inventory");
  const moduleKey = moduleHrefToKey(href);
  return !moduleKey || modules.includes(moduleKey);
}

function canOpenLaunchCard(modules: ModuleKey[], card: LaunchCard) {
  return canOpenHref(modules, card.href);
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function whole(value: number) {
  return Math.round(value).toLocaleString();
}

function moduleInitials(title: string) {
  return title
    .split(/[\s/&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function isUuidLike(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

function cleanPersonValue(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return "";
  return trimmed;
}

function normalizePerformanceName(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function resolvePersonValue(value: unknown, profileNamesById: ProfileNameMap) {
  const cleaned = cleanPersonValue(value);
  if (!cleaned) return "";
  return profileNamesById.get(cleaned) ?? cleaned;
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatInputDate(date: Date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function getSundayWeekRange(offsetWeeks = 0) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: formatInputDate(start),
    end: formatInputDate(end),
  };
}

function isDateWithinRange(value: string, start: string, end: string) {
  if (!value || value === "-") return false;
  const date = value.slice(0, 10);
  return date >= start && date <= end;
}

function getMonthStartInputValue() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function getYearStartInputValue() {
  return `${new Date().getFullYear()}-01-01`;
}

function isWithinDateRange(value: string, filters: DashboardFilters) {
  if (!value || value === "-") return true;
  const date = value.slice(0, 10);
  return date >= filters.startDate && date <= filters.endDate;
}

function relationName(value: any) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.name ?? "";
}

function relationCode(value: any) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.rack_code ?? relation?.name ?? relation?.code ?? "";
}

function buildBreakdown<T>(
  rows: T[],
  labelGetter: (row: T) => string,
  valueGetter: (row: T) => number,
  limit = 8
) {
  const map = new Map<string, number>();

  rows.forEach((row) => {
    const label = labelGetter(row) || "Unassigned";
    map.set(label, (map.get(label) ?? 0) + valueGetter(row));
  });

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function buildQuantityValueBreakdown<T>(
  rows: T[],
  labelGetter: (row: T) => string,
  quantityGetter: (row: T) => number,
  valueGetter: (row: T) => number,
  limit = 10
): BreakdownLine[] {
  const map = new Map<string, { quantity: number; value: number }>();

  rows.forEach((row) => {
    const label = labelGetter(row) || "Unassigned";
    const current = map.get(label) ?? { quantity: 0, value: 0 };
    current.quantity += Math.abs(quantityGetter(row));
    current.value += Math.abs(valueGetter(row));
    map.set(label, current);
  });

  return Array.from(map.entries())
    .map(([label, totals]) => ({
      label,
      value: totals.quantity,
      valueText: `${whole(totals.quantity)} / ${money(totals.value)}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function averageRangeFootage(joints: number, pipeRange: string) {
  return Math.round(joints * (pipeRange === "Range 3" ? 43.5 : 31.5) * 100) / 100;
}

function isIssueTransaction(type: string) {
  const normalized = type.toLowerCase();
  return normalized.includes("issue") || normalized.includes("out") || normalized.includes("used");
}

function isPurchaseTransaction(type: string) {
  const normalized = type.toLowerCase();
  return normalized.includes("purchase") || normalized.includes("receive") || normalized.includes("in");
}

async function loadModuleAccess(role: string, token: string | undefined) {
  if (!token) return defaultModulesForRole(role);

  const response = await fetch("/api/my-module-permissions", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => null);

  if (!response?.ok) return defaultModulesForRole(role);

  const result = await response.json();
  return Array.isArray(result.moduleKeys)
    ? (result.moduleKeys.map(String) as ModuleKey[])
    : defaultModulesForRole(role);
}

async function loadYardOptions(token: string) {
  const response = await fetch("/api/yard-options", {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!response?.ok) return [];

  const result = await response.json().catch(() => null);
  return Array.isArray(result?.yards) ? (result.yards as YardOption[]) : [];
}

function DashboardMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="dashboard-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function BreakdownList({ title, rows, suffix = "" }: { title: string; rows: BreakdownLine[]; suffix?: string }) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <article className="dashboard-panel">
      <div className="dashboard-panel-title">
        <h3>{title}</h3>
      </div>
      <div className="dashboard-breakdown-list">
        {rows.length === 0 && <p className="muted-text">No data found for this filter.</p>}
        {rows.map((row) => (
          <div key={row.label} className="dashboard-breakdown-row">
            <div>
              <strong>{row.label}</strong>
              <span>{row.valueText ?? `${whole(row.value)}${suffix}`}</span>
            </div>
            <div className="dashboard-bar-track">
              <span style={{ width: `${Math.max(8, (row.value / maxValue) * 100)}%` }} />
            </div>
            {row.subText && <small>{row.subText}</small>}
          </div>
        ))}
      </div>
    </article>
  );
}

function ActivityTable({ title, rows }: { title: string; rows: ActivityLine[] }) {
  return (
    <article className="dashboard-panel">
      <div className="dashboard-panel-title">
        <h3>{title}</h3>
      </div>
      <div className="dashboard-activity-list">
        {rows.length === 0 && <p className="muted-text">No recent activity found.</p>}
        {rows.map((row) => (
          <div key={row.id} className="dashboard-activity-row">
            <div>
              <strong>{row.title}</strong>
              <span>{row.detail}</span>
            </div>
            <small>{row.meta}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function PlaceholderPanel({ title, children }: { title: string; children: string }) {
  return (
    <article className="dashboard-panel dashboard-placeholder">
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function TubularInventorySection({
  inventory,
  activity,
}: {
  inventory: PipeInventoryLine[];
  activity: PipeActivityLine[];
}) {
  const totalJoints = inventory.reduce((sum, row) => sum + row.joints, 0);
  const totalFootage = inventory.reduce((sum, row) => sum + row.footage, 0);
  const activeCustomers = new Set(inventory.map((row) => row.company).filter(Boolean)).size;
  const activeLocations = new Set(inventory.map((row) => row.location).filter(Boolean)).size;

  const recentActivity = activity.slice(0, 8).map((row) => ({
    id: row.id,
    title: `${row.type || "Inventory"} - ${row.company}`,
    detail: `${whole(row.joints)} joints from ${row.fromLocation || "-"} to ${row.toLocation || "-"}`,
    meta: row.createdAt,
  }));

  return (
    <DashboardSection
      title="Tubular Inventory Breakdown"
      subtitle="Live pipe inventory by customer, specs, status, and yard location."
    >
      <div className="dashboard-metric-grid">
        <DashboardMetricCard label="Total joints on yard" value={whole(totalJoints)} />
        <DashboardMetricCard label="Total footage" value={whole(totalFootage)} />
        <DashboardMetricCard label="Customers with pipe" value={whole(activeCustomers)} />
        <DashboardMetricCard label="Active locations" value={whole(activeLocations)} />
      </div>

      <div className="dashboard-widget-grid">
        <BreakdownList title="Inventory by Customer" rows={buildBreakdown(inventory, (row) => row.company, (row) => row.joints)} suffix=" joints" />
        <BreakdownList title="Inventory by Pipe Size" rows={buildBreakdown(inventory, (row) => row.size, (row) => row.joints)} suffix=" joints" />
        <BreakdownList title="Inventory by Connection" rows={buildBreakdown(inventory, (row) => row.connection, (row) => row.joints)} suffix=" joints" />
        <BreakdownList title="Inventory by Grade" rows={buildBreakdown(inventory, (row) => row.grade, (row) => row.joints)} suffix=" joints" />
        <BreakdownList title="Inventory by Status" rows={buildBreakdown(inventory, (row) => row.status, (row) => row.joints)} suffix=" joints" />
        <BreakdownList title="Inventory by Location" rows={buildBreakdown(inventory, (row) => row.location, (row) => row.joints)} suffix=" joints" />
      </div>

      <ActivityTable title="Recent Inventory Activity" rows={recentActivity} />
    </DashboardSection>
  );
}

function ConsumableInventorySection({
  items,
  issueTickets,
  issueTicketLines,
  storeRequests,
  filters,
}: {
  items: ConsumableItemLine[];
  issueTickets: InventoryIssueTicketLine[];
  issueTicketLines: InventoryIssueTicketDetailLine[];
  storeRequests: ConsumableStoreRequestLine[];
  filters: DashboardFilters;
}) {
  const monthStart = getMonthStartInputValue();
  const yearStart = getYearStartInputValue();
  const today = getTodayInputValue();
  const currentWeek = getSundayWeekRange(0);
  const previousWeek = getSundayWeekRange(-1);
  const lineMatchesDepartment = (row: { department: string }) =>
    filters.department === "All Departments" || row.department === filters.department;
  const ticketMatchesDepartment = (row: { department: string }) =>
    filters.department === "All Departments" || row.department === filters.department;

  const currentWeekLines = issueTicketLines.filter(
    (row) => isDateWithinRange(row.issueDate, currentWeek.start, currentWeek.end) && lineMatchesDepartment(row)
  );
  const previousWeekLines = issueTicketLines.filter(
    (row) => isDateWithinRange(row.issueDate, previousWeek.start, previousWeek.end) && lineMatchesDepartment(row)
  );
  const monthLines = issueTicketLines.filter(
    (row) => row.issueDate >= monthStart && row.issueDate <= today && lineMatchesDepartment(row)
  );
  const ytdLines = issueTicketLines.filter(
    (row) => row.issueDate >= yearStart && row.issueDate <= today && lineMatchesDepartment(row)
  );
  const issueLinesInRange = issueTicketLines.filter(
    (row) => isWithinDateRange(row.issueDate, filters) && lineMatchesDepartment(row)
  );
  const weekIssueTickets = issueTickets.filter(
    (row) => isWithinDateRange(row.issueDate, filters) && ticketMatchesDepartment(row)
  );
  const storeRequestsInRange = storeRequests.filter(
    (row) => isWithinDateRange(row.orderDate, filters) && ticketMatchesDepartment(row)
  );
  const issueTicketIdsInRange = new Set(issueLinesInRange.map((row) => row.ticketId).filter(Boolean));
  const currentWeekSpend = currentWeekLines.reduce((sum, row) => sum + Math.abs(row.value), 0);
  const previousWeekSpend = previousWeekLines.reduce((sum, row) => sum + Math.abs(row.value), 0);
  const monthSpend = monthLines
    .reduce((sum, row) => sum + Math.abs(row.value), 0);
  const ytdSpend = ytdLines
    .reduce((sum, row) => sum + Math.abs(row.value), 0);
  const issuedQuantity = issueLinesInRange.reduce((sum, row) => sum + Math.abs(row.quantity), 0);
  const lowStock = items.filter((row) => row.lowStock || row.qtyOnHand <= 0 || (row.minQty > 0 && row.qtyOnHand <= row.minQty));
  const openStoreRequests = storeRequests.filter(
    (row) => !["fulfilled", "cancelled", "canceled", "rejected"].includes(row.status.toLowerCase())
  );
  const recentActivity = [
    ...storeRequestsInRange.map((order) => ({
      id: `store-${order.id}`,
      title: `${order.orderNumber} - ${order.requestedBy || "Store Request"}`,
      detail: `${order.status || "Submitted"} / ${money(order.totalValue)} / ${order.lineCount} lines`,
      meta: `${order.orderDate} ${order.unitTruck || ""}`.trim(),
    })),
    ...weekIssueTickets.map((ticket) => ({
      id: `ticket-${ticket.id}`,
      title: `${ticket.ticketNumber} - ${ticket.issuedTo || "Issue Ticket"}`,
      detail: `${ticket.status || "Issued"} / ${money(ticket.totalValue)} / ${ticket.department || "No department"}`,
      meta: `${ticket.issueDate} ${ticket.unitTruck || ""}`.trim(),
    })),
  ].sort((left, right) => right.meta.localeCompare(left.meta)).slice(0, 12);

  return (
    <DashboardSection
      title="Consumable Inventory Spending Breakdown"
      subtitle="Spend, issue velocity, vendor/category mix, and reorder pressure."
    >
      <div className="dashboard-metric-grid">
        <DashboardMetricCard label="Current week spend" value={money(currentWeekSpend)} detail={`${currentWeek.start} to ${currentWeek.end}`} />
        <DashboardMetricCard label="Previous week spend" value={money(previousWeekSpend)} detail={`${previousWeek.start} to ${previousWeek.end}`} />
        <DashboardMetricCard label="Spend this month" value={money(monthSpend)} />
        <DashboardMetricCard label="Spend year-to-date" value={money(ytdSpend)} />
        <DashboardMetricCard label="Low stock alerts" value={whole(lowStock.length)} />
        <DashboardMetricCard label="Issue tickets in range" value={whole(issueTicketIdsInRange.size || weekIssueTickets.length)} />
        <DashboardMetricCard label="Items issued in range" value={whole(issuedQuantity)} />
        <DashboardMetricCard label="Open store requests" value={whole(openStoreRequests.length)} />
        <DashboardMetricCard label="Store requests in range" value={whole(storeRequestsInRange.length)} />
      </div>

      <div className="dashboard-widget-grid">
        <BreakdownList title="Spend by Category" rows={buildBreakdown(issueLinesInRange, (row) => row.category, (row) => Math.abs(row.value))} />
        <BreakdownList title="Spend by Vendor" rows={buildBreakdown(issueLinesInRange, (row) => row.vendor, (row) => Math.abs(row.value))} />
        <BreakdownList
          title="Top Issued Consumables"
          rows={buildQuantityValueBreakdown(
            issueLinesInRange,
            (row) => `${row.itemCode} ${row.itemName}`.trim(),
            (row) => row.quantity,
            (row) => row.value,
            10
          )}
        />
        <BreakdownList title="Issue Tickets by Department" rows={buildBreakdown(weekIssueTickets, (row) => row.department, () => 1, 10)} />
        <BreakdownList title="Store Requests by Department" rows={buildBreakdown(storeRequestsInRange, (row) => row.department, () => 1, 10)} />
        <BreakdownList
          title="Issue Tickets by Unit / Truck"
          rows={buildQuantityValueBreakdown(
            issueLinesInRange,
            (row) => row.unitTruck,
            (row) => row.quantity,
            (row) => row.value,
            10
          )}
        />
        <BreakdownList
          title="Low Stock / Reorder Alerts"
          rows={lowStock.slice(0, 10).map((row) => ({
            label: row.name,
            value: Math.max(0, row.minQty - row.qtyOnHand),
            subText: `${whole(row.qtyOnHand)} on hand / min ${whole(row.minQty)} - ${row.location}`,
          }))}
        />
      </div>

      <ActivityTable
        title="Recent Purchases and Issues"
        rows={recentActivity}
      />
    </DashboardSection>
  );
}

function PurchaseOrderSection({ orders, filters }: { orders: PurchaseOrderLine[]; filters: DashboardFilters }) {
  const monthStart = getMonthStartInputValue();
  const yearStart = getYearStartInputValue();
  const today = getTodayInputValue();
  const filteredOrders = orders.filter((row) => isWithinDateRange(row.orderDate, filters));
  const monthSpend = orders
    .filter((row) => row.orderDate >= monthStart && row.orderDate <= today)
    .reduce((sum, row) => sum + row.totalValue, 0);
  const ytdSpend = orders
    .filter((row) => row.orderDate >= yearStart && row.orderDate <= today)
    .reduce((sum, row) => sum + row.totalValue, 0);

  const countStatus = (status: string) =>
    orders.filter((row) => row.status.toLowerCase() === status.toLowerCase()).length;
  const openCount = orders.filter((row) => !["closed", "cancelled", "received"].includes(row.status.toLowerCase())).length;

  return (
    <DashboardSection
      title="PO Breakdown"
      subtitle="Open order pressure, purchasing status, and vendor spend."
    >
      <div className="dashboard-metric-grid">
        <DashboardMetricCard label="Open POs" value={whole(openCount)} />
        <DashboardMetricCard label="Draft POs" value={whole(countStatus("Draft"))} />
        <DashboardMetricCard label="Sent / Ordered POs" value={whole(countStatus("Ordered") + countStatus("Sent") + countStatus("Submitted"))} />
        <DashboardMetricCard label="Partially received" value={whole(countStatus("Partially Received"))} />
        <DashboardMetricCard label="Closed POs" value={whole(countStatus("Closed") + countStatus("Received"))} />
        <DashboardMetricCard label="PO spend this month" value={money(monthSpend)} />
        <DashboardMetricCard label="PO spend year-to-date" value={money(ytdSpend)} />
      </div>

      <div className="dashboard-widget-grid">
        <BreakdownList title="PO Spend by Vendor" rows={buildBreakdown(filteredOrders, (row) => row.vendor, (row) => row.totalValue)} />
        <BreakdownList title="POs by Status" rows={buildBreakdown(orders, (row) => row.status, () => 1)} />
      </div>

      <ActivityTable
        title="Recent PO Activity"
        rows={orders.slice(0, 10).map((row) => ({
          id: row.id,
          title: `${row.poNumber} - ${row.vendor}`,
          detail: `${row.status} / ${money(row.totalValue)}`,
          meta: row.orderDate,
        }))}
      />
    </DashboardSection>
  );
}

function LeadScorecardSection({
  leads,
  title = "Lead Inspector Performance",
  subtitle = "Rankings are based on DTI scorecards. Strengths and focus areas come from checklist category averages.",
  nameLabel = "Lead Inspector",
}: {
  leads: LeadPerformanceLine[];
  title?: string;
  subtitle?: string;
  nameLabel?: string;
}) {
  return (
    <DashboardSection
      title={title}
      subtitle={subtitle}
    >
      {leads.length === 0 ? (
        <PlaceholderPanel title={`${nameLabel} performance data`}>
          DTI jobs are loaded, but no matching scorecards were found for this filter.
        </PlaceholderPanel>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>{nameLabel}</th>
                <th>Jobs</th>
                <th>Closed</th>
                <th>Average</th>
                <th>Grade</th>
                <th>Red Flags</th>
                <th>Strongest Operator</th>
                <th>Strength</th>
                <th>Focus Area</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, index) => (
                <tr key={lead.name}>
                  <td>{index + 1}</td>
                  <td><strong>{lead.name}</strong></td>
                  <td>{whole(lead.jobs)}</td>
                  <td>{whole(lead.closed)}</td>
                  <td>{lead.average.toFixed(1)}</td>
                  <td>{lead.grade}</td>
                  <td>{whole(lead.redFlags)}</td>
                  <td>{lead.strongestOperator}</td>
                  <td>{lead.strength}</td>
                  <td>{lead.focusArea}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardSection>
  );
}

function DashboardSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function InternalHomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [yardOptions, setYardOptions] = useState<YardOption[]>([]);
  const [selectedYardId, setSelectedYardId] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const currentWeek = getSundayWeekRange(0);
    return {
      startDate: currentWeek.start,
      endDate: currentWeek.end,
      customer: "All Customers",
      department: "All Departments",
      lead: "All Leads",
    };
  });
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading TITAN command center...");

  useEffect(() => {
    loadProfileAndYards();
  }, []);

  const selectedYard = yardOptions.find((yard) => yard.id === selectedYardId);

  const filteredPipeInventory = useMemo(() => {
    return data.pipeInventory.filter((row) => {
      const customerMatch = filters.customer === "All Customers" || row.company === filters.customer;
      return customerMatch;
    });
  }, [data.pipeInventory, filters.customer]);

  const filteredPipeActivity = useMemo(() => {
    return data.pipeActivity.filter((row) => {
      const customerMatch = filters.customer === "All Customers" || row.company === filters.customer;
      return customerMatch && isWithinDateRange(row.createdAt, filters);
    });
  }, [data.pipeActivity, filters]);

  const filteredLeads = useMemo(() => {
    return data.leadPerformance.filter((lead) => filters.lead === "All Leads" || lead.name === filters.lead);
  }, [data.leadPerformance, filters.lead]);

  const filteredPreJobPerformance = useMemo(() => {
    return data.preJobPerformance.filter((lead) => filters.lead === "All Leads" || lead.name === filters.lead);
  }, [data.preJobPerformance, filters.lead]);

  const customerOptions = useMemo(() => {
    const customers = new Set(data.pipeInventory.map((row) => row.company).filter(Boolean));
    return ["All Customers", ...Array.from(customers).sort()];
  }, [data.pipeInventory]);

  const leadOptions = useMemo(() => {
    const leads = new Set(
      [...data.leadPerformance.map((row) => row.name), ...data.preJobPerformance.map((row) => row.name)].filter(Boolean)
    );
    return ["All Leads", ...Array.from(leads).sort()];
  }, [data.leadPerformance, data.preJobPerformance]);

  const visibleNavCards = useMemo(() => {
    if (!profile) return launchCards;
    return launchCards.filter((card) => canOpenLaunchCard(profile.modules, card));
  }, [profile]);

  const visibleMobileLaunchCards = useMemo(() => {
    if (!profile) return mobileLaunchCards;
    return mobileLaunchCards.filter((card) => canOpenLaunchCard(profile.modules, card));
  }, [profile]);

  async function loadProfileAndYards() {
    setLoading(true);
    setMessage("Loading TITAN command center...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (error || !profileData) {
      setMessage("Your profile is missing. Ask an admin to check your user setup.");
      setLoading(false);
      return;
    }

    const role = normalizeRole(profileData.role);

    if (role === "customer") {
      window.location.href = "/customer";
      return;
    }

    const modules = await loadModuleAccess(role, sessionData.session?.access_token);
    const yards = sessionData.session?.access_token ? await loadYardOptions(sessionData.session.access_token) : [];
    const savedYardId = window.localStorage.getItem("titan_internal_dashboard_yard_id") || "";
    const nextYardId = yards.some((yard) => yard.id === savedYardId) ? savedYardId : yards[0]?.id || "";

    setProfile({
      fullName: profileData.full_name ?? user.email ?? "Team Member",
      role,
      modules,
    });
    setYardOptions(yards);
    setSelectedYardId(nextYardId);

    if (!nextYardId) {
      setMessage("No yard access was found for this Command Center user.");
      setLoading(false);
    } else {
      setMessage("");
    }
  }

  async function loadDashboardData(yardId: string) {
    setLoading(true);
    setMessage("");

    const warnings: string[] = [];

    const [
      pipeInventoryResult,
      pipeActivityResult,
      consumableItemsResult,
      consumableTransactionsResult,
      issueTicketsResult,
      storeRequestsResult,
      storeRequestLinesResult,
      purchaseOrdersResult,
      purchaseOrderLinesResult,
      dtiJobsResult,
      dtiSummariesResult,
      dtiResponsesResult,
    ] = await Promise.all([
      supabase
        .from("pipe_inventory")
        .select(`
          id,
          created_at,
          part_number,
          size,
          grade,
          connection,
          status,
          bulk_joints,
          bulk_footage,
          total_joints,
          total_footage,
          pipe_range,
          companies(name),
          racks(rack_code),
          workflow_zones(name, code)
        `)
        .eq("yard_id", yardId)
        .neq("status", "Shipped")
        .limit(2500),
      supabase
        .from("pipe_transactions")
        .select(`
          id,
          created_at,
          transaction_type,
          quantity_joints,
          quantity_footage,
          from_location,
          to_location,
          comment,
          companies(name)
        `)
        .eq("yard_id", yardId)
        .gte("created_at", filters.startDate)
        .lte("created_at", `${filters.endDate}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("inventory_items").select("*").limit(5000),
      supabase
        .from("inventory_transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .limit(5000),
      supabase
        .from("inventory_issue_tickets")
        .select("*")
        .order("issue_date", { ascending: false })
        .limit(5000),
      supabase
        .from("inventory_orders")
        .select("*")
        .order("order_date", { ascending: false })
        .limit(5000),
      supabase
        .from("inventory_order_lines")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase.from("purchase_orders").select("*").order("order_date", { ascending: false }).limit(1000),
      supabase.from("purchase_order_lines").select("*").limit(5000),
      supabase.from("dti_jobs").select("*").gte("created_at", filters.startDate).lte("created_at", `${filters.endDate}T23:59:59`).limit(1000),
      supabase.from("dti_daily_summaries").select("*").gte("summary_date", filters.startDate).lte("summary_date", filters.endDate).limit(1000),
      supabase.from("dti_checklist_responses").select("id, dti_job_id, section, category, score, red_flag").limit(5000),
    ]);

    if (pipeInventoryResult.error) warnings.push(`Tubular inventory: ${pipeInventoryResult.error.message}`);
    if (pipeActivityResult.error) warnings.push(`Recent inventory activity: ${pipeActivityResult.error.message}`);
    if (consumableItemsResult.error) warnings.push(`Consumable items: ${consumableItemsResult.error.message}`);
    if (consumableTransactionsResult.error) {
      warnings.push("Consumable spending needs inventory_transactions.transaction_date and yard_id fields.");
    }
    if (issueTicketsResult.error) warnings.push(`Inventory issue tickets: ${issueTicketsResult.error.message}`);
    if (storeRequestsResult.error) warnings.push(`Consumables Store requests: ${storeRequestsResult.error.message}`);
    if (storeRequestLinesResult.error) warnings.push(`Consumables Store request lines: ${storeRequestLinesResult.error.message}`);
    if (purchaseOrdersResult.error) warnings.push(`Purchase orders: ${purchaseOrdersResult.error.message}`);
    if (purchaseOrderLinesResult.error) warnings.push(`Purchase order lines: ${purchaseOrderLinesResult.error.message}`);
    if (dtiJobsResult.error) warnings.push(`DTI jobs: ${dtiJobsResult.error.message}`);
    if (dtiSummariesResult.error) warnings.push(`DTI daily summaries: ${dtiSummariesResult.error.message}`);
    if (dtiResponsesResult.error) warnings.push(`DTI scorecards: ${dtiResponsesResult.error.message}`);

    const pipeInventory = ((pipeInventoryResult.data ?? []) as any[]).map((row) => {
      const joints = toNumber(row.total_joints ?? row.bulk_joints);
      const pipeRange = String(row.pipe_range ?? "Range 2");
      const footage = toNumber(row.total_footage ?? row.bulk_footage) || averageRangeFootage(joints, pipeRange);

      return {
        id: String(row.id),
        company: relationName(row.companies) || "Unknown",
        partNumber: row.part_number ?? "",
        size: row.size ?? "Unknown",
        grade: row.grade ?? "Unknown",
        connection: row.connection ?? "Unknown",
        status: row.status ?? "Unknown",
        location: relationCode(row.racks) || relationCode(row.workflow_zones) || "Unassigned",
        joints,
        footage,
        createdAt: formatDate(row.created_at),
      };
    });

    const pipeActivity = ((pipeActivityResult.data ?? []) as any[]).map((row) => ({
      id: String(row.id),
      type: row.transaction_type ?? "Activity",
      company: relationName(row.companies) || "Unknown",
      joints: toNumber(row.quantity_joints),
      footage: toNumber(row.quantity_footage),
      fromLocation: row.from_location ?? "",
      toLocation: row.to_location ?? "",
      comment: row.comment ?? "",
      createdAt: formatDate(row.created_at),
    }));

    const selectedYard = yardOptions.find((yard) => yard.id === yardId);
    const selectedYardText = `${selectedYard?.name ?? ""} ${selectedYard?.code ?? ""}`.toLowerCase();
    const selectedYardIsWtx =
      selectedYardText.includes("wtx") ||
      selectedYardText.includes("pathfinder") ||
      selectedYardText.includes("pifs");

    const belongsToSelectedInventoryYard = (row: any) => {
      const rowYardId = String(row.yard_id ?? row.inventory_yard_id ?? "").trim();
      if (rowYardId) return rowYardId === yardId;
      return selectedYardIsWtx;
    };

    const rawConsumableItems = ((consumableItemsResult.data ?? []) as any[]).filter(belongsToSelectedInventoryYard);
    const rawConsumableTransactions = ((consumableTransactionsResult.data ?? []) as any[]).filter(
      belongsToSelectedInventoryYard
    );
    const rawIssueTickets = ((issueTicketsResult.data ?? []) as any[]).filter(belongsToSelectedInventoryYard);
    const rawStoreRequests = ((storeRequestsResult.data ?? []) as any[]).filter(belongsToSelectedInventoryYard);
    const rawStoreRequestLines = ((storeRequestLinesResult.data ?? []) as any[]).filter(belongsToSelectedInventoryYard);

    const consumableItems = rawConsumableItems.map((row) => ({
      id: String(row.id),
      itemId: row.item_id ?? row.item_number ?? "",
      name: row.item_name ?? row.description ?? row.name ?? "Unknown item",
      category: row.category ?? "Unassigned",
      vendor: row.vendor ?? row.vendor_name ?? "Unassigned",
      location: row.location ?? "",
      qtyOnHand: toNumber(row.qty_on_hand ?? row.quantity_on_hand),
      minQty: toNumber(row.min_qty ?? row.minimum_qty ?? row.reorder_point),
      unitPrice: toNumber(row.unit_price ?? row.unit_cost),
      lowStock: Boolean(row.low_stock ?? row.is_low_stock ?? row.low_stock_flag),
    }));

    const consumableTransactions = rawConsumableTransactions.map((row) => {
      const quantity = Math.abs(toNumber(row.quantity ?? row.qty ?? row.quantity_issued));
      const unitPrice = toNumber(row.unit_price ?? row.unit_cost ?? row.cost);
      const value = toNumber(row.total_value ?? row.line_value ?? row.value) || quantity * unitPrice;

      return {
        id: String(row.id),
        itemName: row.item_name ?? row.description ?? row.item_id ?? "Unknown item",
        category: row.category ?? "Unassigned",
        vendor: row.vendor ?? row.vendor_name ?? "Unassigned",
        type: row.transaction_type ?? row.type ?? row.direction ?? "Transaction",
        quantity,
        value,
        date: formatDate(row.transaction_date ?? row.date ?? row.created_at),
        reference: row.reference_number ?? row.reference ?? "",
      };
    });

    const issueTickets = rawIssueTickets.map((row) => ({
      id: String(row.id),
      ticketNumber: row.ticket_number ?? "",
      issueDate: formatDate(row.issue_date ?? row.created_at),
      issuedTo: row.issued_to ?? "",
      department: row.department ?? "Unassigned",
      pickedBy: row.picked_by ?? "",
      unitTruck: row.unit_truck ?? "",
      totalValue: toNumber(row.total_value),
      status: row.status ?? "Issued",
    }));

    const storeRequestLineCounts = new Map<string, number>();
    rawStoreRequestLines.forEach((row) => {
      const orderId = String(row.order_id ?? "").trim();
      if (!orderId) return;
      storeRequestLineCounts.set(orderId, (storeRequestLineCounts.get(orderId) ?? 0) + 1);
    });

    const storeRequests = rawStoreRequests.map((row) => ({
      id: String(row.id),
      orderNumber: row.order_number ?? "",
      orderDate: formatDate(row.order_date ?? row.created_at),
      requestedBy: row.requested_by ?? "",
      department: row.department ?? "Unassigned",
      unitTruck: row.unit_truck ?? "",
      status: row.status ?? "Submitted",
      totalValue: toNumber(row.total_value),
      lineCount: storeRequestLineCounts.get(String(row.id)) ?? 0,
    }));

    let issueTicketLineRows: any[] = [];
    const issueTicketIds = issueTickets.map((ticket) => ticket.id).filter(Boolean);
    if (issueTicketIds.length > 0) {
      const issueTicketLinesResult = await supabase
        .from("inventory_issue_ticket_lines")
        .select("*")
        .in("issue_ticket_id", issueTicketIds)
        .limit(10000);

      if (issueTicketLinesResult.error) {
        warnings.push(`Inventory issue ticket lines: ${issueTicketLinesResult.error.message}`);
      } else {
        issueTicketLineRows = (issueTicketLinesResult.data ?? []) as any[];
      }
    }

    const itemById = new Map(consumableItems.map((item) => [item.id, item]));
    const itemByCode = new Map(consumableItems.map((item) => [item.itemId, item]));
    const ticketById = new Map(issueTickets.map((ticket) => [ticket.id, ticket]));
    const issueTicketLines = issueTicketLineRows.map((row) => {
      const ticketId = String(row.issue_ticket_id ?? row.ticket_id ?? row.issue_id ?? "");
      const ticket = ticketById.get(ticketId);
      const itemId = String(row.item_id ?? row.inventory_item_id ?? "");
      const rawItemCode = String(row.item_code ?? row.item_number ?? "").trim();
      const item = itemById.get(itemId) ?? itemByCode.get(rawItemCode);
      const itemCode = item?.itemId || rawItemCode || String(row.item_id ?? "");
      const quantity = Math.abs(toNumber(row.qty_issued ?? row.quantity_issued ?? row.quantity ?? row.qty));
      const unitCost = toNumber(row.unit_cost ?? row.unit_price ?? item?.unitPrice);
      const value = toNumber(row.line_value ?? row.total_value ?? row.value) || quantity * unitCost;

      return {
        id: String(row.id),
        ticketId,
        ticketNumber: ticket?.ticketNumber ?? row.ticket_number ?? "",
        issueDate: ticket?.issueDate ?? formatDate(row.issue_date ?? row.created_at),
        itemCode,
        itemName: row.item_name ?? row.description ?? item?.name ?? "Unknown item",
        category: row.category ?? item?.category ?? "Unassigned",
        vendor: row.vendor ?? item?.vendor ?? "Unassigned",
        department: row.department ?? ticket?.department ?? "Unassigned",
        unitTruck: row.unit_truck ?? ticket?.unitTruck ?? "Unassigned",
        pickedBy: row.picked_by ?? ticket?.pickedBy ?? "",
        quantity,
        unitCost,
        value,
      };
    });

    const purchaseOrderLineRows = (purchaseOrderLinesResult.data ?? []) as any[];
    const purchaseOrderLinesByOrderId = new Map<string, any[]>();

    purchaseOrderLineRows.forEach((line) => {
      const orderId = String(line.purchase_order_id ?? line.po_id ?? line.purchase_order ?? "").trim();
      if (!orderId) return;
      const lines = purchaseOrderLinesByOrderId.get(orderId) ?? [];
      lines.push(line);
      purchaseOrderLinesByOrderId.set(orderId, lines);
    });

    const purchaseOrders = ((purchaseOrdersResult.data ?? []) as any[])
      .map((row) => {
        const orderId = String(row.id);
        const orderYardId = String(row.yard_id ?? row.inventory_yard_id ?? "").trim();
        const lines = purchaseOrderLinesByOrderId.get(orderId) ?? [];
        const lineYardIds = new Set(
          lines.map((line) => String(line.yard_id ?? line.inventory_yard_id ?? "").trim()).filter(Boolean)
        );
        const legacyNoYard = !orderYardId && lineYardIds.size === 0;
        const belongsToSelectedYard = orderYardId === yardId || lineYardIds.has(yardId) || (legacyNoYard && selectedYardIsWtx);

        if (!belongsToSelectedYard) return null;

        const yardLines = orderYardId === yardId || (legacyNoYard && selectedYardIsWtx)
          ? lines
          : lines.filter((line) => String(line.yard_id ?? line.inventory_yard_id ?? "").trim() === yardId);

        const lineTotal = yardLines.reduce((sum, line) => {
          const explicitTotal = toNumber(line.line_total ?? line.total_value ?? line.extended_cost ?? line.amount);
          if (explicitTotal) return sum + explicitTotal;

          const quantity = toNumber(line.quantity_ordered ?? line.qty_ordered ?? line.quantity ?? line.qty);
          const unitCost = toNumber(line.unit_cost ?? line.unit_price ?? line.cost);
          return sum + quantity * unitCost;
        }, 0);
        const headerTotal = toNumber(row.total_value ?? row.total ?? row.amount ?? row.po_total ?? row.total_amount ?? row.estimated_total);

        return {
          id: orderId,
          poNumber: String(row.po_number ?? row.purchase_order_number ?? row.po ?? "PO"),
          vendor: String(row.vendor_name ?? row.vendor ?? row.vendor_company ?? row.vendor_id ?? "Unassigned"),
          status: String(row.status ?? "Draft"),
          totalValue: lineTotal || headerTotal,
          orderDate: formatDate(row.order_date ?? row.submitted_at ?? row.created_at),
        };
      })
      .filter((row): row is PurchaseOrderLine => Boolean(row));

    const dtiResponses: DtiChecklistResponseLine[] = ((dtiResponsesResult.data ?? []) as any[]).map((row) => {
      const rawScore = row.score;
      return {
        id: String(row.id),
        dtiJobId: String(row.dti_job_id ?? ""),
        section: String(row.section ?? ""),
        category: String(row.category ?? ""),
        score: rawScore === null || rawScore === undefined || rawScore === "" ? null : toNumber(rawScore),
        redFlag: Boolean(row.red_flag),
      };
    });

    const dtiRows = ((dtiJobsResult.data ?? []) as any[]).concat((dtiSummariesResult.data ?? []) as any[]);
    const preJobProfileIds = Array.from(
      new Set(
        dtiRows
          .flatMap((row) => [
            row.pre_job_completed_by,
            row.pre_job_manager,
            row.pre_job_owner,
            row.management_pre_job_by,
            row.created_by,
          ])
          .filter(isUuidLike)
          .map((value) => String(value).trim())
      )
    );
    const profileNamesById: ProfileNameMap = new Map();

    if (preJobProfileIds.length > 0) {
      const { data: preJobProfiles, error: preJobProfileError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", preJobProfileIds);

      if (preJobProfileError) {
        warnings.push(`Pre-job owner names: ${preJobProfileError.message}`);
      } else {
        ((preJobProfiles ?? []) as any[]).forEach((profileRow) => {
          const id = cleanPersonValue(profileRow.id);
          const name = cleanPersonValue(profileRow.full_name);
          if (id && name) profileNamesById.set(id, name);
        });
      }
    }

    const leadPerformance = buildLeadPerformance(dtiRows, dtiResponses);
    const preJobPerformance = buildPreJobPerformance(dtiRows, dtiResponses, profileNamesById);

    setData({
      pipeInventory,
      pipeActivity,
      consumableItems,
      consumableTransactions,
      issueTickets,
      issueTicketLines,
      storeRequests,
      purchaseOrders,
      leadPerformance,
      preJobPerformance,
      warnings,
    });
    setLoading(false);
  }

  function getDtiLeadName(row: any) {
    return String(row.lead_inspector_name ?? row.lead_inspector ?? row.crew_lead ?? "").trim();
  }

  function getDtiPreJobOwnerName(row: any, profileNamesById: ProfileNameMap = new Map()) {
    const candidates = [
      row.pre_job_completed_by_name,
      row.pre_job_manager_name,
      row.pre_job_owner_name,
      row.management_pre_job_by_name,
      row.field_ers_superintendent,
      row.superintendent,
      row.manager,
      row.created_by_name,
      row.created_by_email,
      row.pre_job_completed_by,
      row.pre_job_manager,
      row.pre_job_owner,
      row.management_pre_job_by,
      row.created_by,
    ];
    let uuidFallback = "";

    for (const candidate of candidates) {
      const resolved = resolvePersonValue(candidate, profileNamesById);
      if (!resolved) continue;
      if (!isUuidLike(resolved)) return resolved;
      uuidFallback = uuidFallback || resolved;
    }

    return uuidFallback ? "Unassigned" : "";
  }

  function normalizeChecklistText(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function isPreJobResponse(response: DtiChecklistResponseLine) {
    const label = normalizeChecklistText(`${response.section} ${response.category}`);
    return label.includes("pre job") || label.includes("prejob");
  }

  function leadGrade(average: number) {
    if (average >= 4.5) return "A";
    if (average >= 3.5) return "B";
    if (average >= 2.5) return "C";
    if (average >= 1.5) return "D";
    if (average > 0) return "F";
    return "-";
  }

  function isClosedDtiJob(row: any) {
    const status = String(row.status ?? "").toLowerCase();
    return status.includes("closed") || status.includes("complete");
  }

  function buildPerformanceRows(
    dtiJobs: any[],
    responses: DtiChecklistResponseLine[],
    getOwnerName: (job: any) => string,
    includeResponse: (response: DtiChecklistResponseLine) => boolean,
  ) {
    const byOwner = new Map<string, any[]>();

    dtiJobs.forEach((job) => {
      const ownerName = getOwnerName(job);
      if (!ownerName) return;
      byOwner.set(ownerName, [...(byOwner.get(ownerName) ?? []), job]);
    });

    return Array.from(byOwner.entries())
      .map(([name, ownerJobs]) => {
        const jobIds = new Set(ownerJobs.map((job) => String(job.id)));
        const ownerResponses = responses.filter((response) => jobIds.has(response.dtiJobId) && includeResponse(response));
        const scored = ownerResponses.filter((response) => response.score !== null);
        const average = scored.length
          ? scored.reduce((sum, response) => sum + Number(response.score ?? 0), 0) / scored.length
          : 0;

        const redFlags = ownerResponses.filter(
          (response) => response.redFlag || (response.score !== null && Number(response.score) <= 2)
        ).length;

        const categoryMap = new Map<string, number[]>();
        scored.forEach((response) => {
          const key = response.category || response.section || "General";
          categoryMap.set(key, [...(categoryMap.get(key) ?? []), Number(response.score)]);
        });

        const categoryAverages = Array.from(categoryMap.entries())
          .map(([label, values]) => ({
            label,
            average: values.reduce((sum, value) => sum + value, 0) / values.length,
          }))
          .sort((a, b) => b.average - a.average || a.label.localeCompare(b.label));

        const operatorMap = new Map<string, { scores: number[]; jobs: number }>();
        ownerJobs.forEach((job) => {
          const jobId = String(job.id);
          const operator = String(job.operator ?? "Unassigned").trim() || "Unassigned";
          const jobScores = responses
            .filter((response) => response.dtiJobId === jobId && includeResponse(response) && response.score !== null)
            .map((response) => Number(response.score));
          const current = operatorMap.get(operator) ?? { scores: [], jobs: 0 };
          current.scores.push(...jobScores);
          current.jobs += 1;
          operatorMap.set(operator, current);
        });

        const bestOperator = Array.from(operatorMap.entries())
          .map(([operator, item]) => ({
            operator,
            jobs: item.jobs,
            average: item.scores.length
              ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
              : 0,
          }))
          .sort((a, b) => b.average - a.average || b.jobs - a.jobs || a.operator.localeCompare(b.operator))[0];

        return {
          name,
          jobs: ownerJobs.length,
          closed: ownerJobs.filter(isClosedDtiJob).length,
          average,
          grade: leadGrade(average),
          redFlags,
          strongestOperator: bestOperator ? `${bestOperator.operator} (${bestOperator.average.toFixed(1)})` : "No operator data",
          strength: categoryAverages[0]?.label ?? "No scored categories",
          focusArea: categoryAverages[categoryAverages.length - 1]?.label ?? "No scored categories",
        };
      })
      .sort((a, b) => b.average - a.average || b.jobs - a.jobs || a.name.localeCompare(b.name));
  }

  function buildLeadPerformance(dtiJobs: any[], responses: DtiChecklistResponseLine[]) {
    return buildPerformanceRows(dtiJobs, responses, getDtiLeadName, (response) => !isPreJobResponse(response));
  }

  function buildPreJobPerformance(
    dtiJobs: any[],
    responses: DtiChecklistResponseLine[],
    profileNamesById: ProfileNameMap,
  ) {
    return buildPerformanceRows(
      dtiJobs,
      responses,
      (job) => getDtiPreJobOwnerName(job, profileNamesById),
      isPreJobResponse
    ).filter((row) => PRE_JOB_MANAGEMENT_NAMES.has(normalizePerformanceName(row.name)));
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function updateFilter(key: keyof DashboardFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function changeYard(yardId: string) {
    window.localStorage.setItem("titan_internal_dashboard_yard_id", yardId);
    setSelectedYardId(yardId);
  }

  async function refreshCommandCenter() {
    await loadProfileAndYards();
  }

  function openMobileLaunchCard(card: LaunchCard) {
    window.location.href = card.href;
  }

  return (
    <main className="internal-dashboard-shell">
      <aside className="internal-sidebar">
        <button className="brand compact brand-home-link internal-sidebar-brand" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">TITAN by Pathfinder Inspections</div>
          </div>
        </button>

        <div className="internal-sidebar-profile">
          <span>Welcome</span>
          <strong>{profile?.fullName ?? "TITAN"}</strong>
          <small>{profile?.role?.replace(/_/g, " ") ?? "Loading"}</small>
        </div>

        <nav className="internal-sidebar-nav" aria-label="TITAN modules">
          {visibleNavCards.map((card) => (
            <button
              key={card.href}
              className={`internal-sidebar-link ${card.href === "/home" ? "active" : ""}`}
              type="button"
              onClick={() => (window.location.href = card.href)}
            >
              <span>{card.title}</span>
            </button>
          ))}

        </nav>

        <div className="internal-sidebar-footer">
          <button className="button" type="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </aside>

      <section className="mobile-home-landing" aria-label="TITAN mobile home">
        <header className="mobile-home-hero">
          <button className="brand compact brand-home-link mobile-home-brand" type="button" onClick={() => (window.location.href = "/home")}>
            <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
            <div>
              <div className="brand-title">TITAN by Pathfinder Inspections</div>
            </div>
          </button>

          <div className="mobile-home-welcome">
            <span>Welcome</span>
            <strong>{profile?.fullName ?? "TITAN"}</strong>
            <small>{selectedYard?.name ?? "Select a yard"} / {profile?.role?.replace(/_/g, " ") ?? "Loading"}</small>
          </div>
        </header>

        <section className="mobile-home-grid" aria-label="Available TITAN modules">
          {visibleMobileLaunchCards.map((card) => (
            <button
              key={card.href}
              className="mobile-home-module"
              type="button"
              onClick={() => openMobileLaunchCard(card)}
            >
              <span className="mobile-home-module-mark">{moduleInitials(card.title)}</span>
              <strong>{card.title}</strong>
            </button>
          ))}
        </section>

        <div className="mobile-home-actions">
          <NotificationCenter />
          <button className="button" type="button" onClick={refreshCommandCenter} disabled={loading}>
            Refresh
          </button>
          <button className="button" type="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </section>
    </main>
  );
}
