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
  description: string;
  href: string;
};

type BreakdownLine = {
  label: string;
  value: number;
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

type PurchaseOrderLine = {
  id: string;
  poNumber: string;
  vendor: string;
  status: string;
  totalValue: number;
  orderDate: string;
};

type LeadPerformanceLine = {
  name: string;
  jobsCompleted: number;
  dailySummaries: number;
  inventoryMoves: number;
  issueActivity: number;
  incompleteEntries: number;
  score: number;
  detail: string;
};

type DashboardData = {
  pipeInventory: PipeInventoryLine[];
  pipeActivity: PipeActivityLine[];
  consumableItems: ConsumableItemLine[];
  consumableTransactions: ConsumableTransactionLine[];
  issueTickets: InventoryIssueTicketLine[];
  purchaseOrders: PurchaseOrderLine[];
  leadPerformance: LeadPerformanceLine[];
  warnings: string[];
};

type DashboardFilters = {
  startDate: string;
  endDate: string;
  customer: string;
  department: string;
  lead: string;
};

const emptyData: DashboardData = {
  pipeInventory: [],
  pipeActivity: [],
  consumableItems: [],
  consumableTransactions: [],
  issueTickets: [],
  purchaseOrders: [],
  leadPerformance: [],
  warnings: [],
};

const launchCards: LaunchCard[] = [
  {
    title: "Dashboard",
    description: "Internal command center and live operating metrics.",
    href: "/home",
  },
  {
    title: "Yard View",
    description: "Inventory, racks, receiving, shipping, transfers, and tickets.",
    href: "/",
  },
  {
    title: "Inventory",
    description: "Consumables, issue counter, items, vendors, and stock adjustments.",
    href: "/inventory",
  },
  {
    title: "Purchase Orders",
    description: "Vendor purchase orders, receiving, approvals, and PO reports.",
    href: "/purchase-orders",
  },
  {
    title: "DTI",
    description: "Field inspection jobs, scorecards, red flags, and DTI reports.",
    href: "/dti",
  },
  {
    title: "DTI Daily Summary",
    description: "Daily inspection summary form, print, email, and saved summaries.",
    href: "/dti-summary",
  },
  {
    title: "Hardbanding",
    description: "Hardband work orders, serial numbers, closeout, and reports.",
    href: "/hardband",
  },
  {
    title: "Reports",
    description: "Pipe inventory reports, ticket searches, and exports.",
    href: "/?open=reports",
  },
  {
    title: "Employee Activity",
    description: "Weekly activity, transaction counts, and management overview.",
    href: "/dashboard",
  },
  {
    title: "Admin Controls",
    description: "Companies, users, roles, yards, racks, options, and setup tools.",
    href: "/admin",
  },
];

const departmentOptions = ["All Departments", "Yard", "Inventory", "Purchase Orders", "DTI", "Hardband"];

function normalizeRole(role: unknown) {
  return typeof role === "string" ? role.toLowerCase() : "customer";
}

function canOpenLaunchCard(modules: ModuleKey[], card: LaunchCard) {
  if (card.href === "/home") return true;
  const moduleKey = moduleHrefToKey(card.href);
  return !moduleKey || modules.includes(moduleKey);
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

function formatDate(value: unknown) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
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
              <span>{whole(row.value)}{suffix}</span>
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
  transactions,
  issueTickets,
  filters,
}: {
  items: ConsumableItemLine[];
  transactions: ConsumableTransactionLine[];
  issueTickets: InventoryIssueTicketLine[];
  filters: DashboardFilters;
}) {
  const monthStart = getMonthStartInputValue();
  const yearStart = getYearStartInputValue();
  const today = getTodayInputValue();

  const monthSpend = transactions
    .filter((row) => row.date >= monthStart && row.date <= today)
    .reduce((sum, row) => sum + Math.abs(row.value), 0);
  const ytdSpend = transactions
    .filter((row) => row.date >= yearStart && row.date <= today)
    .reduce((sum, row) => sum + Math.abs(row.value), 0);
  const weekTransactions = transactions.filter((row) => isWithinDateRange(row.date, filters));
  const weekIssueTickets = issueTickets.filter((row) => isWithinDateRange(row.issueDate, filters));
  const issued = weekTransactions.filter((row) => isIssueTransaction(row.type));
  const lowStock = items.filter((row) => row.qtyOnHand <= row.minQty);
  const recentActivity = [
    ...weekIssueTickets.map((ticket) => ({
      id: `ticket-${ticket.id}`,
      title: `${ticket.ticketNumber} - ${ticket.issuedTo || "Issue Ticket"}`,
      detail: `${ticket.status || "Issued"} / ${money(ticket.totalValue)} / ${ticket.department || "No department"}`,
      meta: `${ticket.issueDate} ${ticket.unitTruck || ""}`.trim(),
    })),
    ...weekTransactions.map((row) => ({
      id: `transaction-${row.id}`,
      title: `${row.type || "Transaction"} - ${row.itemName}`,
      detail: `${whole(row.quantity)} units / ${money(Math.abs(row.value))}`,
      meta: `${row.date} ${row.reference}`.trim(),
    })),
  ].slice(0, 12);

  return (
    <DashboardSection
      title="Consumable Inventory Spending Breakdown"
      subtitle="Spend, issue velocity, vendor/category mix, and reorder pressure."
    >
      <div className="dashboard-metric-grid">
        <DashboardMetricCard label="Spend this month" value={money(monthSpend)} />
        <DashboardMetricCard label="Spend year-to-date" value={money(ytdSpend)} />
        <DashboardMetricCard label="Low stock alerts" value={whole(lowStock.length)} />
        <DashboardMetricCard label="Issue tickets in range" value={whole(weekIssueTickets.length)} />
        <DashboardMetricCard label="Inventory transactions in range" value={whole(weekTransactions.length)} />
      </div>

      <div className="dashboard-widget-grid">
        <BreakdownList title="Spend by Category" rows={buildBreakdown(weekTransactions, (row) => row.category, (row) => Math.abs(row.value))} />
        <BreakdownList title="Spend by Vendor" rows={buildBreakdown(weekTransactions, (row) => row.vendor, (row) => Math.abs(row.value))} />
        <BreakdownList title="Top Issued Consumables" rows={buildBreakdown(issued, (row) => row.itemName, (row) => row.quantity, 10)} />
        <BreakdownList title="Issue Tickets by Department" rows={buildBreakdown(weekIssueTickets, (row) => row.department, () => 1, 10)} />
        <BreakdownList title="Issue Tickets by Unit / Truck" rows={buildBreakdown(weekIssueTickets, (row) => row.unitTruck, (row) => Math.abs(row.totalValue), 10)} />
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

function LeadScorecardSection({ leads }: { leads: LeadPerformanceLine[] }) {
  return (
    <DashboardSection
      title="Lead Scorecard Breakdown"
      subtitle="Job completion, daily summaries, operating activity, and incomplete entries by lead."
    >
      <div className="dashboard-lead-grid">
        {leads.length === 0 && (
          <PlaceholderPanel title="Lead performance data">
            DTI jobs and daily summaries are loaded, but no lead names were found for this filter.
          </PlaceholderPanel>
        )}
        {leads.map((lead, index) => (
          <article key={lead.name} className="dashboard-lead-card">
            <div className="dashboard-lead-rank">#{index + 1}</div>
            <div>
              <h3>{lead.name}</h3>
              <strong>{lead.score.toFixed(1)}</strong>
              <span>Performance score</span>
            </div>
            <dl>
              <div><dt>Jobs completed</dt><dd>{whole(lead.jobsCompleted)}</dd></div>
              <div><dt>Daily summaries</dt><dd>{whole(lead.dailySummaries)}</dd></div>
              <div><dt>Inventory moves</dt><dd>{whole(lead.inventoryMoves)}</dd></div>
              <div><dt>PO / issue activity</dt><dd>{whole(lead.issueActivity)}</dd></div>
              <div><dt>Needs attention</dt><dd>{whole(lead.incompleteEntries)}</dd></div>
            </dl>
            <p>{lead.detail}</p>
          </article>
        ))}
      </div>
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
  const [filters, setFilters] = useState<DashboardFilters>({
    startDate: getMonthStartInputValue(),
    endDate: getTodayInputValue(),
    customer: "All Customers",
    department: "All Departments",
    lead: "All Leads",
  });
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading TITAN dashboard...");

  useEffect(() => {
    loadProfileAndYards();
  }, []);

  useEffect(() => {
    if (selectedYardId) {
      loadDashboardData(selectedYardId);
    }
  }, [selectedYardId, filters.startDate, filters.endDate]);

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

  const customerOptions = useMemo(() => {
    const customers = new Set(data.pipeInventory.map((row) => row.company).filter(Boolean));
    return ["All Customers", ...Array.from(customers).sort()];
  }, [data.pipeInventory]);

  const leadOptions = useMemo(() => {
    const leads = new Set(data.leadPerformance.map((row) => row.name).filter(Boolean));
    return ["All Leads", ...Array.from(leads).sort()];
  }, [data.leadPerformance]);

  const visibleNavCards = useMemo(() => {
    if (!profile) return launchCards;
    return launchCards.filter((card) => canOpenLaunchCard(profile.modules, card));
  }, [profile]);

  async function loadProfileAndYards() {
    setLoading(true);
    setMessage("Loading TITAN dashboard...");

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
      setMessage("No yard access was found for this dashboard user.");
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
      purchaseOrdersResult,
      dtiJobsResult,
      dtiSummariesResult,
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
      supabase.from("inventory_items").select("*").eq("yard_id", yardId).limit(5000),
      supabase
        .from("inventory_transactions")
        .select("*")
        .eq("yard_id", yardId)
        .gte("transaction_date", getYearStartInputValue())
        .order("transaction_date", { ascending: false })
        .limit(1000),
      supabase
        .from("inventory_issue_tickets")
        .select("*")
        .eq("yard_id", yardId)
        .gte("issue_date", getYearStartInputValue())
        .order("issue_date", { ascending: false })
        .limit(1000),
      supabase.from("purchase_orders").select("*").eq("yard_id", yardId).order("order_date", { ascending: false }).limit(500),
      supabase.from("dti_jobs").select("*").gte("created_at", filters.startDate).lte("created_at", `${filters.endDate}T23:59:59`).limit(1000),
      supabase.from("dti_daily_summaries").select("*").gte("summary_date", filters.startDate).lte("summary_date", filters.endDate).limit(1000),
    ]);

    if (pipeInventoryResult.error) warnings.push(`Tubular inventory: ${pipeInventoryResult.error.message}`);
    if (pipeActivityResult.error) warnings.push(`Recent inventory activity: ${pipeActivityResult.error.message}`);
    if (consumableItemsResult.error) warnings.push(`Consumable items: ${consumableItemsResult.error.message}`);
    if (consumableTransactionsResult.error) {
      warnings.push("Consumable spending needs inventory_transactions.transaction_date and yard_id fields.");
    }
    if (issueTicketsResult.error) warnings.push(`Inventory issue tickets: ${issueTicketsResult.error.message}`);
    if (purchaseOrdersResult.error) warnings.push(`Purchase orders: ${purchaseOrdersResult.error.message}`);
    if (dtiJobsResult.error) warnings.push(`DTI jobs: ${dtiJobsResult.error.message}`);
    if (dtiSummariesResult.error) warnings.push(`DTI daily summaries: ${dtiSummariesResult.error.message}`);

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

    const consumableItems = ((consumableItemsResult.data ?? []) as any[]).map((row) => ({
      id: String(row.id),
      itemId: row.item_id ?? row.item_number ?? "",
      name: row.item_name ?? row.description ?? row.name ?? "Unknown item",
      category: row.category ?? "Unassigned",
      vendor: row.vendor ?? row.vendor_name ?? "Unassigned",
      location: row.location ?? "",
      qtyOnHand: toNumber(row.qty_on_hand ?? row.quantity_on_hand),
      minQty: toNumber(row.min_qty ?? row.minimum_qty ?? row.reorder_point),
      unitPrice: toNumber(row.unit_price ?? row.unit_cost),
    }));

    const consumableTransactions = ((consumableTransactionsResult.data ?? []) as any[]).map((row) => {
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

    const issueTickets = ((issueTicketsResult.data ?? []) as any[]).map((row) => ({
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

    const purchaseOrders = ((purchaseOrdersResult.data ?? []) as any[]).map((row) => ({
      id: String(row.id),
      poNumber: row.po_number ?? row.purchase_order_number ?? "PO",
      vendor: row.vendor_name ?? row.vendor ?? "Unassigned",
      status: row.status ?? "Draft",
      totalValue: toNumber(row.total_value ?? row.total ?? row.amount),
      orderDate: formatDate(row.order_date ?? row.created_at),
    }));

    const leadPerformance = buildLeadPerformance(
      (dtiJobsResult.data ?? []) as any[],
      (dtiSummariesResult.data ?? []) as any[],
      pipeActivity,
      consumableTransactions,
      issueTickets
    );

    setData({
      pipeInventory,
      pipeActivity,
      consumableItems,
      consumableTransactions,
      issueTickets,
      purchaseOrders,
      leadPerformance,
      warnings,
    });
    setLoading(false);
  }

  function buildLeadPerformance(
    dtiJobs: any[],
    summaries: any[],
    moves: PipeActivityLine[],
    consumableActivity: ConsumableTransactionLine[],
    issueTickets: InventoryIssueTicketLine[]
  ) {
    const map = new Map<string, LeadPerformanceLine>();

    function ensureLead(name: string) {
      const key = name || "Unassigned";
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          jobsCompleted: 0,
          dailySummaries: 0,
          inventoryMoves: 0,
          issueActivity: 0,
          incompleteEntries: 0,
          score: 0,
          detail: "Score uses completed DTI jobs, daily summaries, activity, and missing-entry indicators.",
        });
      }
      return map.get(key)!;
    }

    dtiJobs.forEach((job) => {
      const leadName = job.lead_inspector_name ?? job.lead_inspector ?? job.crew_lead ?? job.inspected_by ?? "Unassigned";
      const lead = ensureLead(leadName);
      const status = String(job.status ?? "").toLowerCase();
      if (status.includes("closed") || status.includes("complete")) lead.jobsCompleted += 1;
      lead.incompleteEntries += toNumber(job.red_flags_count ?? job.incomplete_entries ?? job.missing_paperwork_count);
      lead.score += toNumber(job.average_score ?? job.overall_score ?? job.score);
    });

    summaries.forEach((summary) => {
      const leadName = summary.lead_inspector_name ?? summary.lead_inspector ?? summary.inspected_by ?? "Unassigned";
      const lead = ensureLead(leadName);
      lead.dailySummaries += 1;
    });

    moves.forEach((move: any) => {
      const leadName = move.enteredBy ?? move.createdBy ?? "";
      if (!leadName) return;
      const lead = ensureLead(leadName);
      lead.inventoryMoves += 1;
    });

    issueTickets.forEach((ticket) => {
      const leadName = ticket.pickedBy || ticket.issuedTo || "";
      if (!leadName) return;
      const lead = ensureLead(leadName);
      lead.issueActivity += 1;
    });

    // Future dashboard widget note:
    // Inventory transactions without an entered_by/picked_by style owner remain in the activity tables,
    // but they are not assigned to a lead score until an owner field is present.
    consumableActivity.forEach((row: any) => {
      const leadName = row.enteredBy ?? row.pickedBy ?? "";
      if (!leadName || !isIssueTransaction(row.type)) return;
      const lead = ensureLead(leadName);
      lead.issueActivity += 1;
    });

    return Array.from(map.values())
      .map((lead) => {
        const scoredItems = lead.jobsCompleted + lead.dailySummaries + lead.inventoryMoves + lead.issueActivity;
        const explicitScore = lead.score > 0 ? lead.score : 0;
        const derivedScore = Math.min(100, scoredItems * 12 - lead.incompleteEntries * 5);
        return {
          ...lead,
          score: explicitScore || Math.max(0, derivedScore),
        };
      })
      .sort((a, b) => b.score - a.score);
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

  return (
    <main className="internal-dashboard-shell">
      <aside className="internal-sidebar">
        <button className="brand compact brand-home-link internal-sidebar-brand" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">TITAN</div>
            <div className="brand-subtitle">Tubular Inventory Tracking & Asset Navigation</div>
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
              <small>{card.description}</small>
            </button>
          ))}
        </nav>

        <div className="internal-sidebar-footer">
          <NotificationCenter />
          <button className="button" type="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </aside>

      <section className="internal-dashboard-content">
        <header className="internal-dashboard-header">
          <div>
            <span className="dashboard-eyebrow">Internal Dashboard</span>
            <h1>TITAN Command Center</h1>
            <p>{selectedYard?.name ?? "Select a yard"} live operating snapshot.</p>
          </div>
          <div className="internal-dashboard-actions">
            <button className="button" type="button" onClick={loadProfileAndYards} disabled={loading}>
              Refresh Access
            </button>
            <button className="button primary" type="button" onClick={() => selectedYardId && loadDashboardData(selectedYardId)} disabled={loading || !selectedYardId}>
              Refresh Data
            </button>
          </div>
        </header>

        {message && <div className="modal-message dashboard-message">{message}</div>}
        {data.warnings.length > 0 && (
          <div className="dashboard-warning-stack">
            {data.warnings.map((warning) => (
              <div key={warning} className="modal-message dashboard-message">
                {warning}
              </div>
            ))}
          </div>
        )}

        <section className="dashboard-filter-bar">
          <label>
            Yard
            <select value={selectedYardId} onChange={(event) => changeYard(event.target.value)}>
              {yardOptions.map((yard) => (
                <option key={yard.id} value={yard.id}>
                  {yard.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start Date
            <input type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} />
          </label>
          <label>
            End Date
            <input type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} />
          </label>
          <label>
            Customer
            <select value={filters.customer} onChange={(event) => updateFilter("customer", event.target.value)}>
              {customerOptions.map((customer) => (
                <option key={customer} value={customer}>
                  {customer}
                </option>
              ))}
            </select>
          </label>
          <label>
            Department
            <select value={filters.department} onChange={(event) => updateFilter("department", event.target.value)}>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lead
            <select value={filters.lead} onChange={(event) => updateFilter("lead", event.target.value)}>
              {leadOptions.map((lead) => (
                <option key={lead} value={lead}>
                  {lead}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Add future dashboard widgets by appending another reusable DashboardSection below. */}
        <TubularInventorySection inventory={filteredPipeInventory} activity={filteredPipeActivity} />
        <ConsumableInventorySection
          items={data.consumableItems}
          transactions={data.consumableTransactions}
          issueTickets={data.issueTickets}
          filters={filters}
        />
        <PurchaseOrderSection orders={data.purchaseOrders} filters={filters} />
        <LeadScorecardSection leads={filteredLeads} />
      </section>
    </main>
  );
}
