"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import { shouldShowPageMessage } from "../../lib/pageMessages";

type Profile = {
  fullName: string;
  role: string;
};

type TransactionRow = {
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

type InventoryRow = {
  id: string;
  company: string;
  status: string;
  condition: string;
  partNumber: string;
  pipeRange: "Range 2" | "Range 3";
  location: string;
  joints: number;
  footage: number;
};

type SummaryLine = {
  label: string;
  joints: number;
  footage: number;
  lines: number;
};

type YardOption = {
  id: string;
  name: string;
  code: string;
};

type SupabaseRelation<T> = T | T[] | null;

type NamedRelation = {
  name: string | null;
};

type RackRelation = {
  rack_code: string | null;
};

type WorkflowZoneRelation = {
  name: string | null;
  code: string | null;
};

type TransactionQueryRow = {
  id: string;
  transaction_type: string | null;
  quantity_joints: number | string | null;
  quantity_footage: number | string | null;
  from_location: string | null;
  to_location: string | null;
  comment: string | null;
  created_at: string | null;
  companies: SupabaseRelation<NamedRelation>;
};

type InventoryQueryRow = {
  id: string;
  part_number: string | null;
  pipe_range: unknown;
  status: string | null;
  condition: string | null;
  bulk_joints: number | string | null;
  companies: SupabaseRelation<NamedRelation>;
  racks: SupabaseRelation<RackRelation>;
  workflow_zones: SupabaseRelation<WorkflowZoneRelation>;
};

type ConsumableIssueTicket = {
  id: string;
  ticketNumber: string;
  issueDate: string;
  issuedTo: string;
  serviceLine: string;
  unitTruck: string;
  totalValue: number;
  lineCount: number;
};

type ConsumableIssueTicketQueryRow = {
  id: string;
  ticket_number: string | null;
  issue_date: string | null;
  issued_to: string | null;
  department: string | null;
  unit_truck: string | null;
  total_value: number | string | null;
  status: string | null;
};

type ConsumableIssueLineQueryRow = {
  issue_ticket_id: string | null;
  line_value: number | string | null;
  qty_issued: number | string | null;
};

type RepairCommandRow = {
  id: string;
  status: string;
  priority: string;
  equipmentName: string;
  equipmentNumber: string;
  assignedTo: string;
  laborHours: number;
  totalLaborCost: number;
  totalPartsCost: number;
  totalCost: number;
  openedAt: string;
  closedAt: string;
  updatedAt: string;
};

type RepairCommandQueryRow = {
  id: string;
  status: string | null;
  priority: string | null;
  equipment_name: string | null;
  equipment_number: string | null;
  assigned_to: string | null;
  labor_hours: number | string | null;
  total_labor_cost: number | string | null;
  total_parts_cost: number | string | null;
  total_cost: number | string | null;
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string | null;
};

const today = new Date();

function formatDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function weekStart() {
  const date = new Date(today);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(date = today) {
  const next = new Date(date);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfQuarter(date = today) {
  const next = new Date(date);
  next.setMonth(Math.floor(next.getMonth() / 3) * 3, 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfYear(date = today) {
  const next = new Date(date);
  next.setMonth(0, 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(value: string, start: Date, end: Date) {
  const date = parseDate(value);
  if (!date) return false;
  const floorStart = new Date(start);
  floorStart.setHours(0, 0, 0, 0);
  const ceilEnd = new Date(end);
  ceilEnd.setHours(23, 59, 59, 999);
  return date >= floorStart && date <= ceilEnd;
}

function calculateRangeFootage(joints: number, pipeRange: string) {
  return Math.round(Number(joints || 0) * (pipeRange === "Range 3" ? 43.5 : 31.5) * 100) / 100;
}

function normalizePipeRange(value: unknown): "Range 2" | "Range 3" {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

function addToSummary(map: Map<string, SummaryLine>, label: string, joints: number, footage: number) {
  const key = label || "Unassigned";
  const current = map.get(key) ?? { label: key, joints: 0, footage: 0, lines: 0 };
  current.joints += joints;
  current.footage += footage;
  current.lines += 1;
  map.set(key, current);
}

function firstRelation<T>(value: SupabaseRelation<T>) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function CommandCenterSnapshotStyles() {
  return (
    <style>{`
      .command-snapshot-hero {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 14px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 14px;
      }

      .command-snapshot-hero h1 {
        margin: 4px 0;
        font-size: clamp(32px, 4vw, 52px);
        line-height: 0.95;
      }

      .command-snapshot-hero p {
        margin: 0;
        color: var(--muted);
      }

      .command-snapshot-hero strong {
        color: var(--orange);
      }

      .command-snapshot-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(220px, 1fr));
        gap: 12px;
        margin-bottom: 12px;
      }

      .command-snapshot-card {
        min-width: 0;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel);
        box-shadow: var(--shadow);
        padding: 15px;
      }

      .command-snapshot-card h2 {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .command-snapshot-value {
        display: block;
        margin-bottom: 10px;
        font-size: clamp(26px, 3vw, 38px);
        font-weight: 900;
        line-height: 1;
      }

      .command-snapshot-list {
        display: grid;
        gap: 8px;
      }

      .command-snapshot-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        border-top: 1px solid rgba(148, 163, 184, 0.18);
        padding-top: 8px;
      }

      .command-snapshot-row:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .command-snapshot-row span,
      .command-snapshot-row small {
        display: block;
        min-width: 0;
        color: var(--muted);
      }

      .command-snapshot-row strong {
        white-space: nowrap;
      }

      .command-activity-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
        gap: 12px;
      }

      .command-operations-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
        gap: 12px;
      }

      .command-period-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(145px, 1fr));
        gap: 10px;
      }

      .command-period-card {
        min-width: 0;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.32);
        padding: 13px;
      }

      .command-period-card span,
      .command-repair-note {
        display: block;
        color: var(--muted);
      }

      .command-period-card span {
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .command-period-card strong {
        display: block;
        margin: 8px 0 4px;
        font-size: clamp(20px, 2vw, 28px);
        line-height: 1;
      }

      .command-period-card small {
        color: var(--muted);
      }

      .command-repair-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .command-repair-tile {
        min-width: 0;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.32);
        padding: 12px;
      }

      .command-repair-tile span {
        display: block;
        color: var(--muted);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }

      .command-repair-tile strong {
        display: block;
        margin-top: 6px;
        font-size: 24px;
        line-height: 1;
      }

      .command-activity-feed {
        max-height: 520px;
        overflow: auto;
      }

      .command-feed-row {
        display: grid;
        grid-template-columns: minmax(160px, 0.35fr) minmax(0, 1fr) auto;
        gap: 14px;
        align-items: start;
        border-top: 1px solid var(--line);
        padding: 12px 0;
      }

      .command-feed-row:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .command-feed-row span,
      .command-feed-row small {
        display: block;
        color: var(--muted);
      }

      .command-empty {
        border: 1px dashed var(--line);
        border-radius: 9px;
        padding: 16px;
        color: var(--muted);
      }

      @media (max-width: 1180px) {
        .command-snapshot-grid {
          grid-template-columns: repeat(2, minmax(220px, 1fr));
        }

        .command-activity-layout {
          grid-template-columns: 1fr;
        }

        .command-operations-grid {
          grid-template-columns: 1fr;
        }

        .command-period-grid {
          grid-template-columns: repeat(2, minmax(145px, 1fr));
        }
      }

      @media (max-width: 720px) {
        .command-snapshot-hero {
          display: grid;
          align-items: start;
        }

        .command-snapshot-grid {
          grid-template-columns: 1fr;
        }

        .command-feed-row {
          grid-template-columns: 1fr;
          gap: 5px;
        }

        .command-period-grid,
        .command-repair-grid {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [yardOptions, setYardOptions] = useState<YardOption[]>([]);
  const [selectedYardId, setSelectedYardId] = useState("");
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [consumableTickets, setConsumableTickets] = useState<ConsumableIssueTicket[]>([]);
  const [repairOrders, setRepairOrders] = useState<RepairCommandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading employee command center...");
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function loadYardOptions() {
    setLoading(true);
    setMessage("Loading employee command center...");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch("/api/yard-options", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(result?.error || "Yard access could not be loaded.");
      setLoading(false);
      return;
    }

    const yards = (result?.yards ?? []) as YardOption[];
    setYardOptions(yards);

    const savedYardId = window.localStorage.getItem("titan_dashboard_yard_id") || "";
    const nextYardId = yards.some((yard) => yard.id === savedYardId) ? savedYardId : yards[0]?.id || "";
    setSelectedYardId(nextYardId);

    if (!nextYardId) {
      setMessage("No Command Center yard access was found for this user.");
      setLoading(false);
    }
  }

  async function loadDashboard() {
    if (!selectedYardId) return;

    setLoading(true);
    setMessage("Loading employee command center...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      setMessage("Profile was not found.");
      setLoading(false);
      return;
    }

    if (profileData.role === "customer") {
      window.location.href = "/customer";
      return;
    }

    setProfile({
      fullName: profileData.full_name ?? "Team Member",
      role: profileData.role ?? "employee",
    });

    const start = weekStart().toISOString();

    const transactionQuery = supabase
      .from("pipe_transactions")
      .select(`
        id,
        transaction_type,
        quantity_joints,
        quantity_footage,
        from_location,
        to_location,
        comment,
        created_at,
        companies(name)
      `)
      .eq("yard_id", selectedYardId)
      .gte("created_at", start)
      .order("created_at", { ascending: false })
      .limit(300);

    const { data: transactionData, error: transactionError } = await transactionQuery;

    if (transactionError) {
      setMessage(`Weekly transactions failed: ${transactionError.message}`);
      setLoading(false);
      return;
    }

    const inventoryQuery = supabase
      .from("pipe_inventory")
      .select(`
        id,
        part_number,
        pipe_range,
        status,
        condition,
        bulk_joints,
        companies(name),
        racks(rack_code),
        workflow_zones(name, code)
      `)
      .eq("yard_id", selectedYardId)
      .neq("status", "Shipped")
      .order("created_at", { ascending: false })
      .limit(1000);

    const { data: inventoryData, error: inventoryError } = await inventoryQuery;

    if (inventoryError) {
      setMessage(`Inventory command center failed: ${inventoryError.message}`);
      setLoading(false);
      return;
    }

    setTransactions(
      ((transactionData ?? []) as TransactionQueryRow[]).map((row) => {
        const company = firstRelation(row.companies);

        return {
          id: row.id,
          type: row.transaction_type ?? "",
          company: company?.name ?? "Unknown",
          joints: Number(row.quantity_joints ?? 0),
          footage: Number(row.quantity_footage ?? 0),
          fromLocation: row.from_location ?? "",
          toLocation: row.to_location ?? "",
          comment: row.comment ?? "",
          createdAt: formatDate(row.created_at ?? ""),
        };
      })
    );

    setInventory(
      ((inventoryData ?? []) as InventoryQueryRow[]).map((row) => {
        const company = firstRelation(row.companies);
        const rack = firstRelation(row.racks);
        const zone = firstRelation(row.workflow_zones);
        const pipeRange = normalizePipeRange(row.pipe_range);
        const joints = Number(row.bulk_joints ?? 0);

        return {
          id: row.id,
          company: company?.name ?? "Unknown",
          status: row.status ?? "",
          condition: row.condition ?? "",
          partNumber: row.part_number ?? "",
          pipeRange,
          location: rack?.rack_code ?? zone?.name ?? zone?.code ?? "Unassigned",
          joints,
          footage: calculateRangeFootage(joints, pipeRange),
        };
      })
    );

    const yearStartValue = dateOnly(startOfYear());
    const primaryIssueTicketResult = await supabase
      .from("inventory_issue_tickets")
      .select("id,ticket_number,issue_date,issued_to,department,unit_truck,total_value,status,yard_id")
      .eq("yard_id", selectedYardId)
      .gte("issue_date", yearStartValue)
      .order("issue_date", { ascending: false })
      .limit(1600);
    let issueTicketData: unknown[] | null = primaryIssueTicketResult.data;
    let issueTicketError = primaryIssueTicketResult.error;

    if (issueTicketError && /yard_id|schema cache|column/i.test(issueTicketError.message)) {
      const retryIssueTicketResult = await supabase
        .from("inventory_issue_tickets")
        .select("id,ticket_number,issue_date,issued_to,department,unit_truck,total_value,status")
        .gte("issue_date", yearStartValue)
        .order("issue_date", { ascending: false })
        .limit(1600);
      issueTicketData = retryIssueTicketResult.data;
      issueTicketError = retryIssueTicketResult.error;
    }

    if (issueTicketError) {
      setConsumableTickets([]);
    } else {
      const ticketRows = (issueTicketData ?? []) as ConsumableIssueTicketQueryRow[];
      const ticketIds = ticketRows.map((row) => row.id).filter(Boolean);
      const lineTotals = new Map<string, number>();
      const lineCounts = new Map<string, number>();

      if (ticketIds.length) {
        const { data: lineData } = await supabase
          .from("inventory_issue_ticket_lines")
          .select("issue_ticket_id,line_value,qty_issued")
          .in("issue_ticket_id", ticketIds)
          .limit(6000);

        ((lineData ?? []) as ConsumableIssueLineQueryRow[]).forEach((line) => {
          const ticketId = line.issue_ticket_id ?? "";
          if (!ticketId) return;
          lineTotals.set(ticketId, (lineTotals.get(ticketId) ?? 0) + numberValue(line.line_value));
          lineCounts.set(ticketId, (lineCounts.get(ticketId) ?? 0) + Math.abs(numberValue(line.qty_issued)));
        });
      }

      setConsumableTickets(
        ticketRows.map((row) => ({
          id: row.id,
          ticketNumber: row.ticket_number ?? "",
          issueDate: formatDate(row.issue_date ?? ""),
          issuedTo: row.issued_to ?? "",
          serviceLine: row.department ?? "",
          unitTruck: row.unit_truck ?? "",
          totalValue: numberValue(row.total_value) || lineTotals.get(row.id) || 0,
          lineCount: lineCounts.get(row.id) ?? 0,
        })),
      );
    }

    const primaryRepairResult = await supabase
      .from("equipment_repair_work_orders")
      .select("id,status,priority,equipment_name,equipment_number,assigned_to,labor_hours,total_labor_cost,total_parts_cost,total_cost,opened_at,closed_at,updated_at,yard_id")
      .eq("yard_id", selectedYardId)
      .order("updated_at", { ascending: false })
      .limit(1000);
    let repairData: unknown[] | null = primaryRepairResult.data;
    let repairError = primaryRepairResult.error;

    if (repairError && /yard_id|schema cache|column/i.test(repairError.message)) {
      const retryRepairResult = await supabase
        .from("equipment_repair_work_orders")
        .select("id,status,priority,equipment_name,equipment_number,assigned_to,labor_hours,total_labor_cost,total_parts_cost,total_cost,opened_at,closed_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(1000);
      repairData = retryRepairResult.data;
      repairError = retryRepairResult.error;
    }

    if (repairError) {
      setRepairOrders([]);
    } else {
      setRepairOrders(
        ((repairData ?? []) as RepairCommandQueryRow[]).map((row) => ({
          id: row.id,
          status: row.status ?? "Open",
          priority: row.priority ?? "Normal",
          equipmentName: row.equipment_name ?? "",
          equipmentNumber: row.equipment_number ?? "",
          assignedTo: row.assigned_to ?? "",
          laborHours: numberValue(row.labor_hours),
          totalLaborCost: numberValue(row.total_labor_cost),
          totalPartsCost: numberValue(row.total_parts_cost),
          totalCost: numberValue(row.total_cost),
          openedAt: row.opened_at ?? "",
          closedAt: row.closed_at ?? "",
          updatedAt: row.updated_at ?? "",
        })),
      );
    }

    setMessage("");
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadYardOptions();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedYardId) loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYardId]);

  const snapshot = useMemo(() => {
    const received = transactions.filter((item) => item.type === "receive");
    const shipped = transactions.filter((item) => item.type === "ship");
    const transfers = transactions.filter((item) => item.type.includes("transfer"));
    const completed = transactions.filter((item) => item.type === "complete" || item.type === "edit_inventory");
    const totalInventory = inventory.reduce((sum, row) => sum + row.joints, 0);
    const totalFootage = inventory.reduce((sum, row) => sum + row.footage, 0);

    return {
      receivedJoints: received.reduce((sum, row) => sum + row.joints, 0),
      receivedLines: received.length,
      shippedJoints: shipped.reduce((sum, row) => sum + row.joints, 0),
      shippedLines: shipped.length,
      transferJoints: transfers.reduce((sum, row) => sum + row.joints, 0),
      transferLines: transfers.length,
      adjustmentLines: completed.length,
      totalInventory,
      totalFootage,
      activeCustomers: new Set(inventory.map((row) => row.company).filter(Boolean)).size,
      activeLocations: new Set(inventory.map((row) => row.location).filter(Boolean)).size,
    };
  }, [inventory, transactions]);

  const workZoneSummary = useMemo(() => {
    const map = new Map<string, SummaryLine>();
    inventory.forEach((row) => addToSummary(map, row.location, row.joints, row.footage));
    return [...map.values()].sort((a, b) => b.joints - a.joints).slice(0, 10);
  }, [inventory]);

  const statusSummary = useMemo(() => {
    const map = new Map<string, SummaryLine>();
    inventory.forEach((row) => addToSummary(map, row.status || "Unknown", row.joints, row.footage));
    return [...map.values()].sort((a, b) => b.joints - a.joints);
  }, [inventory]);

  const attentionSummary = useMemo(() => {
    const priorityWords = ["awaiting", "wip", "hold", "reject", "scrap", "received"];
    const priorityRows = statusSummary.filter((line) =>
      priorityWords.some((word) => line.label.toLowerCase().includes(word))
    );
    return (priorityRows.length ? priorityRows : statusSummary).slice(0, 5);
  }, [statusSummary]);

  const topLocations = workZoneSummary.slice(0, 5);

  const consumableSpendWindows = useMemo(() => {
    const currentWeekStart = weekStart();
    const lastWeekStart = addDays(currentWeekStart, -7);
    const lastWeekEnd = addDays(currentWeekStart, -1);
    const periods = [
      { label: "This Week", start: currentWeekStart, end: today },
      { label: "Last Week", start: lastWeekStart, end: lastWeekEnd },
      { label: "This Month", start: startOfMonth(), end: today },
      { label: "This Quarter", start: startOfQuarter(), end: today },
      { label: "This Year", start: startOfYear(), end: today },
    ];

    return periods.map((period) => {
      const rows = consumableTickets.filter((ticket) => isDateInRange(ticket.issueDate, period.start, period.end));
      return {
        ...period,
        spend: rows.reduce((sum, ticket) => sum + ticket.totalValue, 0),
        tickets: rows.length,
        units: rows.reduce((sum, ticket) => sum + ticket.lineCount, 0),
      };
    });
  }, [consumableTickets]);

  const repairCommandSnapshot = useMemo(() => {
    const activeOrders = repairOrders.filter((order) => !["Closed", "Cancelled"].includes(order.status));
    const monthStart = startOfMonth();
    const yearStart = startOfYear();
    const costDate = (order: RepairCommandRow) => order.closedAt || order.updatedAt || order.openedAt;
    const thisMonthOrders = repairOrders.filter((order) => isDateInRange(costDate(order), monthStart, today));
    const thisYearOrders = repairOrders.filter((order) => isDateInRange(costDate(order), yearStart, today));

    return {
      active: activeOrders.length,
      critical: activeOrders.filter((order) => order.priority === "Critical").length,
      awaitingParts: activeOrders.filter((order) => order.status === "Awaiting Parts").length,
      unassigned: activeOrders.filter((order) => !order.assignedTo.trim()).length,
      openHours: activeOrders.reduce((sum, order) => sum + order.laborHours, 0),
      openCost: activeOrders.reduce((sum, order) => sum + order.totalCost, 0),
      monthCost: thisMonthOrders.reduce((sum, order) => sum + order.totalCost, 0),
      yearCost: thisYearOrders.reduce((sum, order) => sum + order.totalCost, 0),
    };
  }, [repairOrders]);

  const showPageMessage = shouldShowPageMessage(message);

  if (loading) {
    return (
      <main className="dashboard-shell">
        <section className="empty-state">
          <h1>Command Center</h1>
          <p>{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <CommandCenterSnapshotStyles />
      <header className="dashboard-header titan-page-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">TITAN by Pathfinder Inspections</div>
            <div className="brand-subtitle">Command Center</div>
          </div>
        </button>
        <div className="dashboard-actions">
          {yardOptions.length > 0 && (
            <select
              className="filter-select dashboard-yard-select"
              value={selectedYardId}
              onChange={(event) => {
                setSelectedYardId(event.target.value);
                window.localStorage.setItem("titan_dashboard_yard_id", event.target.value);
              }}
            >
              {yardOptions.map((yard) => (
                <option key={yard.id} value={yard.id}>
                  {yard.name}
                </option>
              ))}
            </select>
          )}
          <button className="button" onClick={() => (window.location.href = "/")}>Yard View</button>
          {(profile?.role === "admin" || profile?.role === "employee") && (
            <button className="button" onClick={() => (window.location.href = "/admin")}>Admin</button>
          )}
          <button className="button" onClick={() => setPasswordOpen(true)}>Password</button>
          <button className="button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      {showPageMessage && <div className="modal-message">{message}</div>}

      <section className="command-snapshot-hero">
        <div>
          <span className="dashboard-eyebrow">Command Center</span>
          <h1>Current Activity Snapshot</h1>
          <p>
            {selectedYardId ? "Live operating glance for " : "Select a yard to load "}
            <strong>{yardOptions.find((yard) => yard.id === selectedYardId)?.name ?? "your yard"}</strong>.
          </p>
        </div>
        <button className="button primary" onClick={loadDashboard}>Refresh Snapshot</button>
      </section>

      <section className="command-snapshot-grid">
        <article className="command-snapshot-card">
          <h2>Current Yard</h2>
          <strong className="command-snapshot-value">{snapshot.totalInventory.toLocaleString()}</strong>
          <div className="command-snapshot-list">
            <div className="command-snapshot-row"><span>Calculated footage</span><strong>{Math.round(snapshot.totalFootage).toLocaleString()} ft</strong></div>
            <div className="command-snapshot-row"><span>Customers with pipe</span><strong>{snapshot.activeCustomers.toLocaleString()}</strong></div>
            <div className="command-snapshot-row"><span>Active locations</span><strong>{snapshot.activeLocations.toLocaleString()}</strong></div>
          </div>
        </article>

        <article className="command-snapshot-card">
          <h2>This Weeks Movement</h2>
          <strong className="command-snapshot-value">{transactions.length.toLocaleString()}</strong>
          <div className="command-snapshot-list">
            <div className="command-snapshot-row"><span>Received</span><strong>{snapshot.receivedJoints.toLocaleString()} jts</strong><small>{snapshot.receivedLines} lines</small></div>
            <div className="command-snapshot-row"><span>Shipped</span><strong>{snapshot.shippedJoints.toLocaleString()} jts</strong><small>{snapshot.shippedLines} lines</small></div>
            <div className="command-snapshot-row"><span>Transfers</span><strong>{snapshot.transferJoints.toLocaleString()} jts</strong><small>{snapshot.transferLines} moves</small></div>
            <div className="command-snapshot-row"><span>Completions / edits</span><strong>{snapshot.adjustmentLines.toLocaleString()}</strong></div>
          </div>
        </article>

        <article className="command-snapshot-card">
          <h2>Needs Attention</h2>
          <strong className="command-snapshot-value">{attentionSummary.reduce((sum, row) => sum + row.joints, 0).toLocaleString()}</strong>
          <div className="command-snapshot-list">
            {attentionSummary.length === 0 ? (
              <div className="command-empty">No active status pressure found.</div>
            ) : (
              attentionSummary.map((line) => (
                <div key={line.label} className="command-snapshot-row">
                  <span>{line.label}</span>
                  <strong>{line.joints.toLocaleString()} jts</strong>
                  <small>{line.lines} lines</small>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="command-snapshot-card">
          <h2>Top Locations</h2>
          <strong className="command-snapshot-value">{topLocations.length.toLocaleString()}</strong>
          <div className="command-snapshot-list">
            {topLocations.length === 0 ? (
              <div className="command-empty">No active inventory locations found.</div>
            ) : (
              topLocations.map((line) => (
                <div key={line.label} className="command-snapshot-row">
                  <span>{line.label}</span>
                  <strong>{line.joints.toLocaleString()} jts</strong>
                  <small>{Math.round(line.footage).toLocaleString()} ft</small>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="command-operations-grid">
        <article className="dashboard-card wide">
          <div className="card-heading">
            <h2>Consumables Issue Spend</h2>
            <small>Spend comes from inventory issued on issue tickets.</small>
          </div>
          <div className="command-period-grid">
            {consumableSpendWindows.map((period) => (
              <div key={period.label} className="command-period-card">
                <span>{period.label}</span>
                <strong>{money(period.spend)}</strong>
                <small>{period.tickets.toLocaleString()} tickets / {period.units.toLocaleString()} units</small>
              </div>
            ))}
          </div>
        </article>

        <article className="command-snapshot-card">
          <h2>Equipment Repairs</h2>
          <div className="command-repair-grid">
            <div className="command-repair-tile">
              <span>Active Work Orders</span>
              <strong>{repairCommandSnapshot.active.toLocaleString()}</strong>
            </div>
            <div className="command-repair-tile">
              <span>Critical / Waiting</span>
              <strong>{repairCommandSnapshot.critical.toLocaleString()} / {repairCommandSnapshot.awaitingParts.toLocaleString()}</strong>
            </div>
            <div className="command-repair-tile">
              <span>Open Repair Cost</span>
              <strong>{money(repairCommandSnapshot.openCost)}</strong>
            </div>
            <div className="command-repair-tile">
              <span>This Month Cost</span>
              <strong>{money(repairCommandSnapshot.monthCost)}</strong>
            </div>
          </div>
          <div className="command-snapshot-list" style={{ marginTop: 12 }}>
            <div className="command-snapshot-row"><span>Open repair hours</span><strong>{repairCommandSnapshot.openHours.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
            <div className="command-snapshot-row"><span>Unassigned active work</span><strong>{repairCommandSnapshot.unassigned.toLocaleString()}</strong></div>
            <div className="command-snapshot-row"><span>Year repair cost</span><strong>{money(repairCommandSnapshot.yearCost)}</strong></div>
          </div>
        </article>
      </section>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </main>
  );
}
