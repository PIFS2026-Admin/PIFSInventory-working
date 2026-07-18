"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { shouldShowPageMessage } from "../../lib/pageMessages";
import {
  canClose,
  canCreate,
  canEdit,
  canExport,
  canView,
  getDefaultPermissionsForRole,
  moduleKeysFromPermissionMap,
  normalizeRole as normalizePermissionRole,
  type ModuleKey,
  type PermissionMap,
} from "../../lib/modulePermissions";
import {
  equipmentAssetLabel,
  equipmentAssetSearchText,
  titanEquipmentAssets,
  type TitanEquipmentAsset,
} from "../../lib/titanEquipmentAssets";
import styles from "./equipment-repairs.module.css";

type InventoryYard = {
  id: string;
  name: string;
  code: string;
};

type WorkOrderStatus = "Draft" | "Open" | "In Repair" | "Awaiting Parts" | "Ready for Review" | "Closed" | "Cancelled";
type WorkOrderPriority = "Low" | "Normal" | "High" | "Critical";
type TabKey = "dashboard" | "orders" | "details";

type WorkOrder = {
  id: string;
  yardId: string;
  workOrderNumber: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  equipmentNumber: string;
  equipmentName: string;
  equipmentType: string;
  department: string;
  assignedTo: string;
  requestedByName: string;
  problemDescription: string;
  repairNotes: string;
  downtimeStart: string;
  downtimeEnd: string;
  laborHours: number;
  totalLaborCost: number;
  totalPartsCost: number;
  totalCost: number;
  createdAt: string;
  openedAt: string;
  completedAt: string;
  closedAt: string;
  updatedAt: string;
};

type WorkOrderPart = {
  id: string;
  workOrderId: string;
  yardId: string;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  category: string;
  uom: string;
  quantityUsed: number;
  unitCost: number;
  lineTotal: number;
  postedToInventory: boolean;
  inventoryTransactionId: string;
  notes: string;
  issuedByName: string;
  issuedAt: string;
};

type LaborEntry = {
  id: string;
  workOrderId: string;
  technicianName: string;
  workDate: string;
  hours: number;
  laborRate: number;
  lineTotal: number;
  notes: string;
};

type InventoryItem = {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  location: string;
  qtyOnHand: number;
  minQuantity: number;
  unitPrice: number;
  uom: string;
  active: boolean;
};

type RepairAssignee = {
  id: string;
  name: string;
  role: string;
  email: string;
  assignmentValue: string;
  label: string;
};

type WorkOrderForm = {
  id: string;
  workOrderNumber: string;
  createdAt: string;
  openedAt: string;
  equipmentNumber: string;
  equipmentName: string;
  equipmentType: string;
  department: string;
  assignedTo: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  problemDescription: string;
  repairNotes: string;
  downtimeStart: string;
  downtimeEnd: string;
};

type PartForm = {
  itemId: string;
  itemCode: string;
  itemName: string;
  category: string;
  uom: string;
  quantity: string;
  unitPrice: string;
  notes: string;
};

type LaborForm = {
  technicianName: string;
  workDate: string;
  hours: string;
  notes: string;
};

const workOrderStatuses: WorkOrderStatus[] = [
  "Draft",
  "Open",
  "In Repair",
  "Awaiting Parts",
  "Ready for Review",
  "Closed",
  "Cancelled",
];
const priorities: WorkOrderPriority[] = ["Low", "Normal", "High", "Critical"];
const repairAssigneeRoles = ["maintenance_manager", "mechanic_manager", "mechanic", "repair_tech"];

const emptyWorkOrderForm: WorkOrderForm = {
  id: "",
  workOrderNumber: "",
  createdAt: "",
  openedAt: "",
  equipmentNumber: "",
  equipmentName: "",
  equipmentType: "",
  department: "",
  assignedTo: "",
  priority: "Normal",
  status: "Open",
  problemDescription: "",
  repairNotes: "",
  downtimeStart: "",
  downtimeEnd: "",
};

const emptyPartForm: PartForm = {
  itemId: "",
  itemCode: "",
  itemName: "",
  category: "",
  uom: "",
  quantity: "1",
  unitPrice: "",
  notes: "",
};

const defaultLaborRate = 40;

const emptyLaborForm: LaborForm = {
  technicianName: "",
  workDate: new Date().toISOString().slice(0, 10),
  hours: "1",
  notes: "",
};

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function whole(value: number) {
  return Math.round(value).toLocaleString();
}

function decimal(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function dateText(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString();
}

function dateTimeText(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function dateTimeLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoFromLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function rowMissingSchema(errorMessage: string, tableName: string) {
  const message = errorMessage.toLowerCase();
  return (
    message.includes(tableName.toLowerCase()) ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function generateWorkOrderNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
  return `RWO-${stamp.slice(0, 8)}-${stamp.slice(8, 14)}-${stamp.slice(14)}`;
}

function newWorkOrderDraft(): WorkOrderForm {
  const now = new Date().toISOString();
  return {
    ...emptyWorkOrderForm,
    workOrderNumber: generateWorkOrderNumber(),
    createdAt: now,
    openedAt: now,
  };
}

function mapWorkOrder(row: Record<string, unknown>): WorkOrder {
  return {
    id: String(row.id || ""),
    yardId: String(row.yard_id || ""),
    workOrderNumber: String(row.work_order_number || ""),
    status: (String(row.status || "Open") as WorkOrderStatus) || "Open",
    priority: (String(row.priority || "Normal") as WorkOrderPriority) || "Normal",
    equipmentNumber: String(row.equipment_number || ""),
    equipmentName: String(row.equipment_name || ""),
    equipmentType: String(row.equipment_type || ""),
    department: String(row.department || ""),
    assignedTo: String(row.assigned_to || ""),
    requestedByName: String(row.requested_by_name || ""),
    problemDescription: String(row.problem_description || ""),
    repairNotes: String(row.repair_notes || ""),
    downtimeStart: String(row.downtime_start || ""),
    downtimeEnd: String(row.downtime_end || ""),
    laborHours: numberValue(row.labor_hours),
    totalLaborCost: numberValue(row.total_labor_cost),
    totalPartsCost: numberValue(row.total_parts_cost),
    totalCost: numberValue(row.total_cost),
    createdAt: String(row.created_at || ""),
    openedAt: String(row.opened_at || ""),
    completedAt: String(row.completed_at || ""),
    closedAt: String(row.closed_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function mapPart(row: Record<string, unknown>): WorkOrderPart {
  return {
    id: String(row.id || ""),
    workOrderId: String(row.work_order_id || ""),
    yardId: String(row.yard_id || ""),
    inventoryItemId: String(row.inventory_item_id || ""),
    itemCode: String(row.item_code || ""),
    itemName: String(row.item_name || ""),
    category: String(row.category || ""),
    uom: String(row.uom || ""),
    quantityUsed: numberValue(row.quantity_used),
    unitCost: numberValue(row.unit_cost),
    lineTotal: numberValue(row.line_total),
    postedToInventory: Boolean(row.posted_to_inventory),
    inventoryTransactionId: String(row.inventory_transaction_id || ""),
    notes: String(row.notes || ""),
    issuedByName: String(row.issued_by_name || ""),
    issuedAt: String(row.issued_at || ""),
  };
}

function mapLabor(row: Record<string, unknown>): LaborEntry {
  return {
    id: String(row.id || ""),
    workOrderId: String(row.work_order_id || ""),
    technicianName: String(row.technician_name || ""),
    workDate: String(row.work_date || "").slice(0, 10),
    hours: numberValue(row.hours),
    laborRate: numberValue(row.labor_rate),
    lineTotal: numberValue(row.line_total),
    notes: String(row.notes || ""),
  };
}

function mapItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: String(row.id || ""),
    itemCode: String(row.item_code || ""),
    itemName: String(row.item_name || ""),
    category: String(row.category || ""),
    location: String(row.location || ""),
    qtyOnHand: numberValue(row.qty_on_hand),
    minQuantity: numberValue(row.min_quantity),
    unitPrice: numberValue(row.unit_price),
    uom: String(row.uom || ""),
    active: row.active !== false,
  };
}

function repairRoleLabel(role: string) {
  if (role === "maintenance_manager") return "Maintenance Manager";
  if (role === "mechanic_manager") return "Mechanic Manager";
  if (role === "mechanic") return "Mechanic";
  if (role === "repair_tech") return "Repair Tech";
  return role
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapRepairAssignee(row: Record<string, unknown>): RepairAssignee {
  const name = String(row.full_name || row.email || "Unnamed Repair User").trim();
  const email = String(row.email || "").trim();
  const role = String(row.role || "").trim();
  const roleText = repairRoleLabel(role);
  return {
    id: String(row.id || name || email),
    name,
    role,
    email,
    assignmentValue: name,
    label: `${name} / ${roleText}${email ? ` / ${email}` : ""}`,
  };
}

function normalizeEquipmentLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findEquipmentAssetForWorkOrder(form: Pick<WorkOrderForm, "equipmentName" | "equipmentNumber" | "equipmentType">) {
  const equipmentName = normalizeEquipmentLookup(form.equipmentName);
  const equipmentNumber = normalizeEquipmentLookup(form.equipmentNumber);
  const equipmentType = normalizeEquipmentLookup(form.equipmentType);
  if (!equipmentName && !equipmentNumber) return null;

  return (
    titanEquipmentAssets.find((asset) => {
      const nameMatches = equipmentName && normalizeEquipmentLookup(asset.name) === equipmentName;
      const unitMatches = equipmentName && normalizeEquipmentLookup(asset.unitNumber) === equipmentName;
      const tagMatches = equipmentNumber && normalizeEquipmentLookup(asset.assetTag) === equipmentNumber;
      const numberMatches = equipmentNumber && normalizeEquipmentLookup(asset.unitNumber) === equipmentNumber;
      const typeMatches = !equipmentType || normalizeEquipmentLookup(asset.equipmentType) === equipmentType;
      return (nameMatches || unitMatches || tagMatches || numberMatches) && typeMatches;
    }) || null
  );
}

function workOrderDocumentHtml(options: {
  order: WorkOrder;
  parts: WorkOrderPart[];
  labor: LaborEntry[];
  yardName: string;
}) {
  const { order, parts: partLines, labor, yardName } = options;
  const laborTotal = labor.reduce((sum, entry) => sum + entry.lineTotal, 0);
  const laborHours = labor.reduce((sum, entry) => sum + entry.hours, 0);
  const partsTotal = partLines.reduce((sum, part) => sum + part.lineTotal, 0);
  const safeProblem = escapeHtml(order.problemDescription || "No repair request entered.").replace(/\n/g, "<br />");
  const safeNotes = escapeHtml(order.repairNotes || "No repair notes entered.").replace(/\n/g, "<br />");
  const laborRows = labor
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(dateText(entry.workDate))}</td>
        <td>${escapeHtml(entry.technicianName || "-")}</td>
        <td>${escapeHtml(decimal(entry.hours))}</td>
        <td>${escapeHtml(money(entry.laborRate))}</td>
        <td>${escapeHtml(money(entry.lineTotal))}</td>
        <td>${escapeHtml(entry.notes || "-")}</td>
      </tr>`,
    )
    .join("");
  const partRows = partLines
    .map(
      (part) => `<tr>
        <td>${escapeHtml(part.itemCode || "-")}</td>
        <td>${escapeHtml(part.itemName || "-")}</td>
        <td>${escapeHtml(decimal(part.quantityUsed))}</td>
        <td>${escapeHtml(part.uom || "-")}</td>
        <td>${escapeHtml(money(part.unitCost))}</td>
        <td>${escapeHtml(money(part.lineTotal))}</td>
        <td>${part.postedToInventory ? "Posted" : "Pending"}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <title>${escapeHtml(order.workOrderNumber)} - Equipment Repair Work Order</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #f8fafc; color: #111827; font-family: Arial, sans-serif; }
          .actions { display: flex; justify-content: flex-end; gap: 8px; max-width: 1040px; margin: 12px auto; padding: 0 12px; }
          .actions button { border: 0; border-radius: 6px; padding: 10px 14px; font-weight: 800; cursor: pointer; }
          .primary { background: #f97316; color: #111827; }
          .secondary { background: #111827; color: #fff; }
          .sheet { max-width: 1040px; margin: 0 auto 30px; background: #fff; padding: 30px; border: 1px solid #cbd5e1; }
          .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; border-bottom: 3px solid #f97316; padding-bottom: 18px; }
          .brand { display: flex; align-items: center; gap: 14px; }
          .brand img { width: 150px; max-height: 78px; object-fit: contain; }
          h1 { margin: 0; font-size: 28px; letter-spacing: .02em; }
          h2 { margin: 0 0 10px; font-size: 17px; }
          h3 { margin: 22px 0 8px; font-size: 15px; text-transform: uppercase; letter-spacing: .06em; }
          .wo-number { color: #f97316; font-weight: 900; margin-top: 4px; }
          .company { text-align: right; font-size: 13px; line-height: 1.35; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #cbd5e1; border-bottom: 0; margin-top: 18px; }
          .cell { min-height: 56px; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 10px; }
          .cell:nth-child(4n) { border-right: 0; }
          .label { display: block; color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
          .value { display: block; margin-top: 4px; font-size: 14px; font-weight: 800; }
          .notes { border: 1px solid #cbd5e1; padding: 12px; min-height: 74px; line-height: 1.45; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #111827; color: #fff; text-align: left; padding: 8px; }
          td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
          .total-row td { font-weight: 900; background: #f8fafc; }
          .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px; }
          .sig { border-top: 1px solid #111827; padding-top: 7px; font-size: 12px; color: #374151; }
          @media print {
            body { background: #fff; }
            .actions { display: none; }
            .sheet { border: 0; margin: 0; max-width: none; padding: 0.35in; }
            @page { margin: 0.35in; }
          }
        </style>
      </head>
      <body>
        <div class="actions">
          <button class="secondary" onclick="window.close()">Close</button>
          <button class="primary" onclick="window.print()">Print / Save PDF</button>
        </div>
        <main class="sheet">
          <section class="top">
            <div class="brand">
              <img src="/titan_logo.jpg" alt="TITAN" />
              <div>
                <h1>Equipment Repair Work Order</h1>
                <div class="wo-number">${escapeHtml(order.workOrderNumber)}</div>
              </div>
            </div>
            <div class="company">
              <strong>Pathfinder Inspections &amp; Field Services</strong><br />
              7501 Groening St.<br />
              Odessa, TX 79765<br />
              (432) 233-3600<br />
              pifstitan.com
            </div>
          </section>
          <section class="grid">
            <div class="cell"><span class="label">Yard</span><span class="value">${escapeHtml(yardName || "-")}</span></div>
            <div class="cell"><span class="label">Status</span><span class="value">${escapeHtml(order.status)}</span></div>
            <div class="cell"><span class="label">Priority</span><span class="value">${escapeHtml(order.priority)}</span></div>
            <div class="cell"><span class="label">Opened</span><span class="value">${escapeHtml(dateTimeText(order.openedAt))}</span></div>
            <div class="cell"><span class="label">Equipment</span><span class="value">${escapeHtml(order.equipmentName || "-")}</span></div>
            <div class="cell"><span class="label">Equipment #</span><span class="value">${escapeHtml(order.equipmentNumber || "-")}</span></div>
            <div class="cell"><span class="label">Type</span><span class="value">${escapeHtml(order.equipmentType || "-")}</span></div>
            <div class="cell"><span class="label">Department</span><span class="value">${escapeHtml(order.department || "-")}</span></div>
            <div class="cell"><span class="label">Requested By</span><span class="value">${escapeHtml(order.requestedByName || "-")}</span></div>
            <div class="cell"><span class="label">Assigned To</span><span class="value">${escapeHtml(order.assignedTo || "Unassigned")}</span></div>
            <div class="cell"><span class="label">Repair Start</span><span class="value">${escapeHtml(dateTimeText(order.downtimeStart))}</span></div>
            <div class="cell"><span class="label">Repair Complete</span><span class="value">${escapeHtml(dateTimeText(order.downtimeEnd))}</span></div>
            <div class="cell"><span class="label">Labor Hours</span><span class="value">${escapeHtml(decimal(laborHours || order.laborHours))}</span></div>
            <div class="cell"><span class="label">Labor Cost</span><span class="value">${escapeHtml(money(laborTotal || order.totalLaborCost))}</span></div>
            <div class="cell"><span class="label">Parts Cost</span><span class="value">${escapeHtml(money(partsTotal || order.totalPartsCost))}</span></div>
            <div class="cell"><span class="label">Total Cost</span><span class="value">${escapeHtml(money((laborTotal || order.totalLaborCost) + (partsTotal || order.totalPartsCost) || order.totalCost))}</span></div>
          </section>
          <h3>Repair Request</h3>
          <section class="notes">${safeProblem}</section>
          <h3>Repair Notes / Corrective Action</h3>
          <section class="notes">${safeNotes}</section>
          <h3>Labor</h3>
          <table>
            <thead><tr><th>Date</th><th>Technician</th><th>Hours</th><th>Rate</th><th>Total</th><th>Notes</th></tr></thead>
            <tbody>
              ${laborRows || `<tr><td colspan="6">No repair labor entered.</td></tr>`}
              <tr class="total-row"><td colspan="2">Labor Total</td><td>${escapeHtml(decimal(laborHours))}</td><td></td><td>${escapeHtml(money(laborTotal))}</td><td></td></tr>
            </tbody>
          </table>
          <h3>Parts From Consumables</h3>
          <table>
            <thead><tr><th>SKU</th><th>Item</th><th>Qty</th><th>UOM</th><th>Unit Cost</th><th>Total</th><th>Inventory</th></tr></thead>
            <tbody>
              ${partRows || `<tr><td colspan="7">No parts added.</td></tr>`}
              <tr class="total-row"><td colspan="5">Parts Total</td><td>${escapeHtml(money(partsTotal))}</td><td></td></tr>
            </tbody>
          </table>
          <section class="signatures">
            <div class="sig">Requested By / Date</div>
            <div class="sig">Technician / Date</div>
            <div class="sig">Reviewed By / Date</div>
          </section>
        </main>
      </body>
    </html>`;
}

function accessAllowed(role: string, moduleKeys: ModuleKey[], permissions: PermissionMap | null) {
  if (role === "customer") return false;
  if (["admin", "owner", "maintenance_manager", "mechanic_manager", "maintenance_lead", "maintenance_hand", "mechanic", "repair_tech", "employee"].includes(role)) return true;
  return (
    moduleKeys.includes("work_orders") ||
    canView(permissions, "work_orders") ||
    canCreate(permissions, "work_orders") ||
    canEdit(permissions, "work_orders")
  );
}

function personKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function assignedToCurrentUser(order: WorkOrder, userKeys: string[]) {
  const assigned = personKey(order.assignedTo);
  if (!assigned || !userKeys.length) return false;
  return userKeys.some((key) => assigned === key || assigned.includes(key) || key.includes(assigned));
}

const activeBoardStatuses: WorkOrderStatus[] = ["Draft", "Open", "In Repair", "Awaiting Parts", "Ready for Review"];

export default function EquipmentRepairsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [yards, setYards] = useState<InventoryYard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState("");
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [parts, setParts] = useState<WorkOrderPart[]>([]);
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [repairAssignees, setRepairAssignees] = useState<RepairAssignee[]>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderForm>(emptyWorkOrderForm);
  const [partForm, setPartForm] = useState<PartForm>(emptyPartForm);
  const [laborForm, setLaborForm] = useState<LaborForm>(emptyLaborForm);
  const [search, setSearch] = useState("");
  const [equipmentLookup, setEquipmentLookup] = useState("");
  const [selectedEquipmentAssetId, setSelectedEquipmentAssetId] = useState("");
  const [showEquipmentResults, setShowEquipmentResults] = useState(false);
  const [partLookup, setPartLookup] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailingWorkOrderId, setEmailingWorkOrderId] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [userName, setUserName] = useState("TITAN User");
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("employee");
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [moduleKeys, setModuleKeys] = useState<ModuleKey[]>([]);

  const selectedYard = yards.find((yard) => yard.id === selectedYardId);
  const canUseModule = accessAllowed(role, moduleKeys, permissions);
  const canManageWorkOrders =
    role !== "customer" &&
    (["admin", "owner", "maintenance_manager", "mechanic_manager", "maintenance_lead", "maintenance_hand", "mechanic", "repair_tech", "employee"].includes(role) ||
      canCreate(permissions, "work_orders") ||
      canEdit(permissions, "work_orders"));
  const canCloseWorkOrders = ["admin", "owner", "maintenance_manager", "mechanic_manager", "maintenance_lead"].includes(role) || canClose(permissions, "work_orders");
  const canExportWorkOrders = ["admin", "owner", "maintenance_manager", "mechanic_manager", "maintenance_lead"].includes(role) || canExport(permissions, "work_orders");
  const canViewAllWorkOrders = ["admin", "owner", "maintenance_manager", "mechanic_manager", "maintenance_lead"].includes(role) || canCloseWorkOrders || canExportWorkOrders;
  const currentUserAssignmentKeys = useMemo(() => [userName, userEmail].map(personKey).filter(Boolean), [userEmail, userName]);
  const visibleWorkOrders = useMemo(
    () => (canViewAllWorkOrders ? workOrders : workOrders.filter((order) => assignedToCurrentUser(order, currentUserAssignmentKeys))),
    [canViewAllWorkOrders, currentUserAssignmentKeys, workOrders],
  );
  const visibleWorkOrderIds = useMemo(() => new Set(visibleWorkOrders.map((order) => order.id)), [visibleWorkOrders]);
  const visibleParts = useMemo(() => parts.filter((part) => visibleWorkOrderIds.has(part.workOrderId)), [parts, visibleWorkOrderIds]);
  const selectedWorkOrder = visibleWorkOrders.find((order) => order.id === selectedWorkOrderId) || null;
  const selectedParts = selectedWorkOrder ? visibleParts.filter((part) => part.workOrderId === selectedWorkOrder.id) : [];
  const selectedLabor = selectedWorkOrder ? laborEntries.filter((entry) => entry.workOrderId === selectedWorkOrder.id) : [];
  const selectedEquipmentAsset = titanEquipmentAssets.find((asset) => asset.id === selectedEquipmentAssetId) || null;
  const filteredEquipmentAssets = useMemo(() => {
    const term = normalizeEquipmentLookup(equipmentLookup);
    const matches = term
      ? titanEquipmentAssets.filter((asset) => equipmentAssetSearchText(asset).includes(term))
      : titanEquipmentAssets;
    return matches.slice(0, 12);
  }, [equipmentLookup]);
  const assigneeOptions = useMemo(() => {
    const options = [...repairAssignees].sort((left, right) => left.name.localeCompare(right.name));
    const selectedName = workOrderForm.assignedTo.trim();
    if (selectedName && !options.some((assignee) => assignee.assignmentValue.toLowerCase() === selectedName.toLowerCase())) {
      options.unshift({
        id: `legacy-${selectedName}`,
        name: selectedName,
        role: "",
        email: "",
        assignmentValue: selectedName,
        label: `${selectedName} / Current assignment`,
      });
    }
    return options;
  }, [repairAssignees, workOrderForm.assignedTo]);

  const filteredWorkOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return visibleWorkOrders.filter((order) => {
      const activeStatus = !["Closed", "Cancelled"].includes(order.status);
      const statusMatches =
        statusFilter === "all" ||
        (statusFilter === "active" ? activeStatus : order.status.toLowerCase() === statusFilter.toLowerCase());
      const priorityMatches = priorityFilter === "all" || order.priority.toLowerCase() === priorityFilter.toLowerCase();
      const assignedName = order.assignedTo.trim().toLowerCase();
      const technicianMatches =
        technicianFilter === "all" ||
        (technicianFilter === "unassigned" ? !assignedName : assignedName === technicianFilter.toLowerCase());
      const termMatches =
        !term ||
        [
          order.workOrderNumber,
          order.equipmentName,
          order.equipmentNumber,
          order.equipmentType,
          order.department,
          order.assignedTo,
          order.problemDescription,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      return statusMatches && priorityMatches && technicianMatches && termMatches;
    });
  }, [priorityFilter, search, statusFilter, technicianFilter, visibleWorkOrders]);

  const activeBoardOrders = useMemo(
    () => filteredWorkOrders.filter((order) => !["Closed", "Cancelled"].includes(order.status)),
    [filteredWorkOrders],
  );

  const metrics = useMemo(() => {
    const activeOrders = visibleWorkOrders.filter((order) => !["Closed", "Cancelled"].includes(order.status));
    return {
      open: activeOrders.length,
      awaitingParts: activeOrders.filter((order) => order.status === "Awaiting Parts").length,
      critical: activeOrders.filter((order) => order.priority === "Critical").length,
      laborHours: activeOrders.reduce((sum, order) => sum + order.laborHours, 0),
      partsCost: activeOrders.reduce((sum, order) => sum + order.totalPartsCost, 0),
      totalCost: activeOrders.reduce((sum, order) => sum + order.totalCost, 0),
      postedParts: visibleParts.filter((part) => part.postedToInventory).length,
      unpostedParts: visibleParts.filter((part) => !part.postedToInventory).length,
    };
  }, [visibleParts, visibleWorkOrders]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleWorkOrders.forEach((order) => {
      counts.set(order.status, (counts.get(order.status) || 0) + 1);
    });
    counts.set("active", visibleWorkOrders.filter((order) => !["Closed", "Cancelled"].includes(order.status)).length);
    counts.set("all", visibleWorkOrders.length);
    return counts;
  }, [visibleWorkOrders]);

  const priorityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    priorities.forEach((priority) => counts.set(priority, 0));
    visibleWorkOrders.forEach((order) => {
      counts.set(order.priority, (counts.get(order.priority) || 0) + 1);
    });
    counts.set("all", visibleWorkOrders.length);
    return counts;
  }, [visibleWorkOrders]);

  const technicianCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleWorkOrders.forEach((order) => {
      const name = order.assignedTo.trim() || "Unassigned";
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 8);
  }, [visibleWorkOrders]);

  const partSearchResults = useMemo(() => {
    const term = partLookup.trim().toLowerCase();
    if (!term) return [];
    return items
      .filter((item) =>
        [item.itemCode, item.itemName, item.category, item.location, item.uom]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 8);
  }, [items, partLookup]);

  const selectedPartItem = items.find((item) => item.id === partForm.itemId) || null;

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedYardId) {
      window.localStorage.setItem("titan_equipment_repair_yard_id", selectedYardId);
      reloadModuleData(selectedYardId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYardId]);

  async function loadPage() {
    setLoading(true);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      window.location.assign("/login");
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email || "");
    const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();
    const nextUserName = String(profile?.full_name || user.email || "TITAN User");
    let nextRole = normalizePermissionRole(profile?.role || "employee");
    let nextPermissions = getDefaultPermissionsForRole(nextRole);
    let nextModuleKeys = moduleKeysFromPermissionMap(nextPermissions);

    try {
      const token = sessionData.session?.access_token || "";
      if (token) {
        const response = await fetch("/api/my-module-permissions", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          nextRole = normalizePermissionRole(data?.role || profile?.role || "employee");
          nextPermissions = (data?.permissions as PermissionMap | undefined) || getDefaultPermissionsForRole(nextRole);
          nextModuleKeys = Array.isArray(data?.moduleKeys)
            ? (data.moduleKeys.filter((key: unknown) => typeof key === "string") as ModuleKey[])
            : moduleKeysFromPermissionMap(nextPermissions);
        }
      }
    } catch {
      nextPermissions = getDefaultPermissionsForRole(nextRole);
      nextModuleKeys = moduleKeysFromPermissionMap(nextPermissions);
    }

    setRole(nextRole);
    setPermissions(nextPermissions);
    setModuleKeys(nextModuleKeys);
    setUserName(nextUserName);

    if (!accessAllowed(nextRole, nextModuleKeys, nextPermissions)) {
      setMessage("Equipment Repairs is for internal users only.");
      setLoading(false);
      return;
    }

    await loadRepairAssignees();
    const yardOptions = await loadYards(user.id, user.email || "", nextRole);
    setYards(yardOptions);
    const storedYardId = window.localStorage.getItem("titan_equipment_repair_yard_id") || "";
    const preferred = yardOptions.find((yard) => yard.id === storedYardId) || yardOptions[0];
    setSelectedYardId(preferred?.id || "");
    if (preferred?.id) {
      await reloadModuleData(preferred.id);
    }
    setLoading(false);
  }

  async function loadYards(currentUserId: string, email: string, currentRole = role) {
    const { data, error } = await supabase.from("yards").select("id, name, code").order("name");
    if (error) {
      setMessage(`Yards failed: ${error.message}`);
      return [];
    }

    if (["admin", "owner"].includes(currentRole) || email.toLowerCase() === "wade@pathfinderinspections.com") {
      return (data || []).map((yard) => ({ id: yard.id, name: yard.name, code: yard.code }));
    }

    const { data: accessRows, error: accessError } = await supabase
      .from("inventory_user_yards")
      .select("yard_id")
      .eq("user_id", currentUserId);

    if (accessError || !accessRows?.length) {
      return (data || []).map((yard) => ({ id: yard.id, name: yard.name, code: yard.code }));
    }

    const allowed = new Set(accessRows.map((row) => row.yard_id));
    return (data || [])
      .filter((yard) => allowed.has(yard.id))
      .map((yard) => ({ id: yard.id, name: yard.name, code: yard.code }));
  }

  async function loadRepairAssignees() {
    const primary = await supabase
      .from("profiles")
      .select("id, full_name, role, email, is_disabled")
      .in("role", repairAssigneeRoles)
      .order("full_name");

    let data = (primary.data || []) as Record<string, unknown>[];
    let error = primary.error;

    if (error && /email|is_disabled|schema cache|does not exist|column/i.test(error.message)) {
      const retry = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", repairAssigneeRoles)
        .order("full_name");
      data = (retry.data || []) as Record<string, unknown>[];
      error = retry.error;
    }

    if (error) {
      setRepairAssignees([]);
      setMessage(`Repair assignee list failed: ${error.message}`);
      return;
    }

    setRepairAssignees(
      data
        .filter((row) => row.is_disabled !== true)
        .map((row) => mapRepairAssignee(row))
        .filter((assignee) => repairAssigneeRoles.includes(assignee.role)),
    );
  }

  async function reloadModuleData(yardId = selectedYardId) {
    if (!yardId) return;
    setMessage("");
    await Promise.all([loadWorkOrders(yardId), loadItems(yardId)]);
  }

  async function loadWorkOrders(yardId = selectedYardId) {
    let orderQuery = supabase
      .from("equipment_repair_work_orders")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (yardId) orderQuery = orderQuery.eq("yard_id", yardId);
    const { data: orderData, error: orderError } = await orderQuery;

    if (orderError) {
      if (rowMissingSchema(orderError.message, "equipment_repair_work_orders")) {
        setSetupRequired(true);
        setWorkOrders([]);
        setParts([]);
        setLaborEntries([]);
      } else {
        setMessage(`Work orders failed: ${orderError.message}`);
      }
      return;
    }

    setSetupRequired(false);
    const mappedOrders = (orderData || []).map((row) => mapWorkOrder(row as Record<string, unknown>));
    setWorkOrders(mappedOrders);

    const orderIds = mappedOrders.map((order) => order.id);
    if (!orderIds.length) {
      setParts([]);
      setLaborEntries([]);
      setSelectedWorkOrderId("");
      return;
    }

    const [{ data: partData, error: partError }, { data: laborData, error: laborError }] = await Promise.all([
      supabase.from("equipment_repair_work_order_parts").select("*").in("work_order_id", orderIds).order("created_at"),
      supabase.from("equipment_repair_labor_entries").select("*").in("work_order_id", orderIds).order("work_date"),
    ]);

    if (partError) setMessage(`Repair parts failed: ${partError.message}`);
    if (laborError) setMessage(`Repair labor failed: ${laborError.message}`);
    setParts((partData || []).map((row) => mapPart(row as Record<string, unknown>)));
    setLaborEntries((laborData || []).map((row) => mapLabor(row as Record<string, unknown>)));

    if (selectedWorkOrderId && !mappedOrders.some((order) => order.id === selectedWorkOrderId)) {
      setSelectedWorkOrderId("");
    }
  }

  async function loadItems(yardId = selectedYardId) {
    const baseSelect = "id,item_code,item_name,category,location,qty_on_hand,min_quantity,unit_price,uom,active,yard_id";
    let query = supabase.from("inventory_items").select(baseSelect).eq("active", true).order("item_code").limit(3000);
    if (yardId) query = query.eq("yard_id", yardId);
    let result = await query;
    let data = (result.data || []) as Record<string, unknown>[];
    let error = result.error;

    if (error && String(error.message || "").toLowerCase().includes("yard_id")) {
      const retry = await supabase
        .from("inventory_items")
        .select("id,item_code,item_name,category,location,qty_on_hand,min_quantity,unit_price,uom,active")
        .eq("active", true)
        .order("item_code")
        .limit(3000);
      data = (retry.data || []) as Record<string, unknown>[];
      error = retry.error;
    }

    if (error) {
      setMessage(`Consumables failed: ${error.message}`);
      return;
    }

    setItems(data.map((row) => mapItem(row)));
  }

  function startNewWorkOrder() {
    setSelectedWorkOrderId("");
    setWorkOrderForm(newWorkOrderDraft());
    setEquipmentLookup("");
    setSelectedEquipmentAssetId("");
    setPartForm(emptyPartForm);
    setLaborForm({ ...emptyLaborForm, technicianName: userName });
    setActiveTab("details");
  }

  function applyEquipmentAsset(asset: TitanEquipmentAsset) {
    setEquipmentLookup(equipmentAssetLabel(asset));
    setSelectedEquipmentAssetId(asset.id);
    setShowEquipmentResults(false);
    setWorkOrderForm((current) => ({
      ...current,
      equipmentName: asset.name,
      equipmentNumber: asset.assetTag || asset.unitNumber || asset.name,
      equipmentType: asset.equipmentType,
      department: asset.department || current.department,
    }));
  }

  function handleEquipmentLookupChange(value: string) {
    setEquipmentLookup(value);
    setShowEquipmentResults(true);
  }

  function clearEquipmentSelection(options: { clearFields?: boolean } = {}) {
    setEquipmentLookup("");
    setSelectedEquipmentAssetId("");
    setShowEquipmentResults(false);
    if (options.clearFields) {
      setWorkOrderForm((current) => ({
        ...current,
        equipmentName: "",
        equipmentNumber: "",
        equipmentType: "",
        department: "",
      }));
    }
  }

  function editWorkOrder(order: WorkOrder) {
    setSelectedWorkOrderId(order.id);
    const nextForm = {
      id: order.id,
      workOrderNumber: order.workOrderNumber,
      createdAt: order.createdAt,
      openedAt: order.openedAt,
      equipmentNumber: order.equipmentNumber,
      equipmentName: order.equipmentName,
      equipmentType: order.equipmentType,
      department: order.department,
      assignedTo: order.assignedTo,
      priority: order.priority,
      status: order.status,
      problemDescription: order.problemDescription,
      repairNotes: order.repairNotes,
      downtimeStart: dateTimeLocal(order.downtimeStart),
      downtimeEnd: dateTimeLocal(order.downtimeEnd),
    };
    setWorkOrderForm(nextForm);
    const equipmentAsset = findEquipmentAssetForWorkOrder(nextForm);
    setSelectedEquipmentAssetId(equipmentAsset?.id || "");
    setEquipmentLookup(equipmentAsset ? equipmentAssetLabel(equipmentAsset) : "");
    setLaborForm({ ...emptyLaborForm, technicianName: order.assignedTo || userName });
    setActiveTab("details");
  }

  async function writeAudit(workOrderId: string, action: string, afterValue: Record<string, unknown>) {
    await supabase.from("equipment_repair_audit_log").insert({
      work_order_id: workOrderId,
      action,
      user_id: userId || null,
      user_name: userName,
      after_value: afterValue,
    });
  }

  async function saveWorkOrder() {
    if (!selectedYardId) {
      setMessage("Select a yard before creating a work order.");
      return;
    }
    if (!workOrderForm.equipmentName.trim()) {
      setMessage("Equipment name is required.");
      return;
    }

    setSaving(true);
    setMessage("");
    const status = workOrderForm.status;
    const now = new Date().toISOString();
    const draftCreatedAt = workOrderForm.createdAt || now;
    const draftOpenedAt = workOrderForm.openedAt || draftCreatedAt;
    const nextCompletedAt = status === "Ready for Review" || status === "Closed" ? selectedWorkOrder?.completedAt || now : null;
    const nextClosedAt = status === "Closed" ? selectedWorkOrder?.closedAt || now : null;
    const payload = {
      yard_id: selectedYardId,
      status,
      priority: workOrderForm.priority,
      equipment_number: workOrderForm.equipmentNumber.trim() || null,
      equipment_name: workOrderForm.equipmentName.trim(),
      equipment_type: workOrderForm.equipmentType.trim() || null,
      department: workOrderForm.department.trim() || null,
      assigned_to: workOrderForm.assignedTo.trim() || null,
      requested_by_name: userName,
      problem_description: workOrderForm.problemDescription.trim() || null,
      repair_notes: workOrderForm.repairNotes.trim() || null,
      downtime_start: toIsoFromLocal(workOrderForm.downtimeStart),
      downtime_end: toIsoFromLocal(workOrderForm.downtimeEnd),
      completed_at: nextCompletedAt,
      closed_at: nextClosedAt,
    };

    if (workOrderForm.id) {
      const { data, error } = await supabase
        .from("equipment_repair_work_orders")
        .update(payload)
        .eq("id", workOrderForm.id)
        .select("*")
        .single();

      if (error) {
        setMessage(`Work order update failed: ${error.message}`);
        setSaving(false);
        return;
      }

      await writeAudit(workOrderForm.id, "update_work_order", payload).catch(() => undefined);
      const order = mapWorkOrder(data as Record<string, unknown>);
      setSelectedWorkOrderId(order.id);
      setWorkOrderForm({ ...workOrderForm, id: order.id, workOrderNumber: order.workOrderNumber, createdAt: order.createdAt, openedAt: order.openedAt });
    } else {
      const insertPayload = {
        ...payload,
        work_order_number: workOrderForm.workOrderNumber || generateWorkOrderNumber(),
        created_at: draftCreatedAt,
        opened_at: draftOpenedAt,
        requested_by: userId || null,
        created_by: userId || null,
      };
      const { data, error } = await supabase
        .from("equipment_repair_work_orders")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        setMessage(`Work order create failed: ${error.message}`);
        setSaving(false);
        return;
      }

      const order = mapWorkOrder(data as Record<string, unknown>);
      await writeAudit(order.id, "create_work_order", insertPayload).catch(() => undefined);
      setSelectedWorkOrderId(order.id);
      setWorkOrderForm({ ...workOrderForm, id: order.id, workOrderNumber: order.workOrderNumber, createdAt: order.createdAt, openedAt: order.openedAt });
    }

    await loadWorkOrders(selectedYardId);
    setMessage("Work order saved.");
    setSaving(false);
  }

  async function addLaborEntry() {
    if (!selectedWorkOrderId) {
      setMessage("Save or select a work order before adding repair time.");
      return;
    }
    const hours = numberValue(laborForm.hours);
    const rate = defaultLaborRate;
    if (!laborForm.technicianName.trim() || hours <= 0) {
      setMessage("Technician and hours are required.");
      return;
    }

    setSaving(true);
    const payload = {
      work_order_id: selectedWorkOrderId,
      technician_name: laborForm.technicianName.trim(),
      work_date: laborForm.workDate || new Date().toISOString().slice(0, 10),
      hours,
      labor_rate: rate,
      line_total: hours * defaultLaborRate,
      notes: laborForm.notes.trim() || null,
      created_by: userId || null,
    };
    const { error } = await supabase.from("equipment_repair_labor_entries").insert(payload);
    if (error) {
      setMessage(`Labor entry failed: ${error.message}`);
      setSaving(false);
      return;
    }
    await writeAudit(selectedWorkOrderId, "add_labor", payload).catch(() => undefined);
    setLaborForm({ ...emptyLaborForm, technicianName: laborForm.technicianName });
    await loadWorkOrders(selectedYardId);
    setMessage("Repair time added.");
    setSaving(false);
  }

  async function addPartLine() {
    if (!selectedWorkOrderId) {
      setMessage("Save or select a work order before adding parts.");
      return;
    }
    const item = items.find((candidate) => candidate.id === partForm.itemId);
    const quantity = numberValue(partForm.quantity);
    const unitCost = item ? numberValue(partForm.unitPrice || item.unitPrice) : numberValue(partForm.unitPrice);
    const itemName = item?.itemName || partForm.itemName.trim() || partLookup.trim();
    const itemCode = item?.itemCode || partForm.itemCode.trim();
    const category = item?.category || partForm.category.trim() || (itemName ? "Manual" : "");
    const uom = item?.uom || partForm.uom.trim() || "unit";

    if (!itemName || quantity <= 0) {
      setMessage("Enter a part name or choose a consumable item, then enter a quantity.");
      return;
    }

    if (unitCost < 0) {
      setMessage("Unit price cannot be negative.");
      return;
    }

    setSaving(true);
    const payload = {
      work_order_id: selectedWorkOrderId,
      yard_id: selectedYardId || null,
      inventory_item_id: item?.id || null,
      item_code: itemCode || null,
      item_name: itemName,
      category: category || null,
      uom: uom || null,
      quantity_used: quantity,
      unit_cost: unitCost,
      line_total: quantity * unitCost,
      notes: partForm.notes.trim() || null,
    };
    const { error } = await supabase.from("equipment_repair_work_order_parts").insert(payload);
    if (error) {
      setMessage(`Part line failed: ${error.message}`);
      setSaving(false);
      return;
    }
    await writeAudit(selectedWorkOrderId, "add_part_line", payload).catch(() => undefined);
    setPartForm(emptyPartForm);
    setPartLookup("");
    await loadWorkOrders(selectedYardId);
    setMessage(item ? "Part added. Post it when the part is actually used." : "Manual part added to this work order.");
    setSaving(false);
  }

  function setRepairView(next: { status?: string; priority?: string; technician?: string }) {
    setStatusFilter(next.status ?? statusFilter);
    setPriorityFilter(next.priority ?? priorityFilter);
    setTechnicianFilter(next.technician ?? technicianFilter);
    setActiveTab("orders");
  }

  function clearRepairView() {
    setSearch("");
    setStatusFilter("active");
    setPriorityFilter("all");
    setTechnicianFilter("all");
  }

  function handlePartLookupChange(value: string) {
    setPartLookup(value);
    const normalized = value.trim().toLowerCase();
    const exact = items.find((item) => {
      const label = `${item.itemCode} - ${item.itemName}`.toLowerCase();
      return item.itemCode.toLowerCase() === normalized || item.itemName.toLowerCase() === normalized || label === normalized;
    });
    setPartForm((current) =>
      exact
        ? {
            ...current,
            itemId: exact.id,
            itemCode: exact.itemCode,
            itemName: exact.itemName,
            category: exact.category,
            uom: exact.uom,
            unitPrice: String(exact.unitPrice || ""),
          }
        : {
            ...current,
            itemId: "",
            itemName: value.trim(),
            itemCode: current.itemId ? "" : current.itemCode,
            category: current.itemId ? "" : current.category,
            uom: current.itemId ? "" : current.uom,
            unitPrice: current.itemId ? "" : current.unitPrice,
          },
    );
  }

  function selectPartForRepair(item: InventoryItem) {
    setPartLookup(`${item.itemCode} - ${item.itemName}`);
    setPartForm((current) => ({
      ...current,
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      category: item.category,
      uom: item.uom,
      unitPrice: String(item.unitPrice || ""),
    }));
  }

  async function postPartToInventory(part: WorkOrderPart) {
    const item = items.find((candidate) => candidate.id === part.inventoryItemId);
    if (!item) {
      setMessage("This part is not linked to an active consumable item.");
      return;
    }
    if (item.qtyOnHand < part.quantityUsed) {
      setMessage(`${item.itemCode} only has ${decimal(item.qtyOnHand)} on hand. Adjust inventory before posting.`);
      return;
    }

    setSaving(true);
    const nextQty = item.qtyOnHand - part.quantityUsed;
    const { error: itemError } = await supabase
      .from("inventory_items")
      .update({ qty_on_hand: nextQty, low_stock: nextQty <= item.minQuantity })
      .eq("id", item.id);

    if (itemError) {
      setMessage(`Inventory update failed: ${itemError.message}`);
      setSaving(false);
      return;
    }

    const txPayload = {
      yard_id: selectedYardId || null,
      item_id: item.id,
      item_code: item.itemCode,
      transaction_type: "Repair Work Order",
      quantity: part.quantityUsed,
      reference_type: "Equipment Repair",
      reference_number: selectedWorkOrder?.workOrderNumber || "Repair Work Order",
      entered_by: userName,
      notes: part.notes || `Used on ${selectedWorkOrder?.equipmentName || "equipment repair"}`,
      transaction_source: "TITAN Equipment Repairs",
      quantity_direction: "Out",
    };
    const { data: txData, error: txError } = await supabase
      .from("inventory_transactions")
      .insert(txPayload)
      .select("id")
      .single();

    if (txError) {
      await supabase.from("inventory_items").update({ qty_on_hand: item.qtyOnHand, low_stock: item.qtyOnHand <= item.minQuantity }).eq("id", item.id);
      setMessage(`Inventory history failed: ${txError.message}`);
      setSaving(false);
      return;
    }

    const { error: partError } = await supabase
      .from("equipment_repair_work_order_parts")
      .update({
        posted_to_inventory: true,
        inventory_transaction_id: txData?.id || null,
        issued_by: userId || null,
        issued_by_name: userName,
        issued_at: new Date().toISOString(),
      })
      .eq("id", part.id);

    if (partError) {
      setMessage(`Part posted, but work order line update failed: ${partError.message}`);
      setSaving(false);
      return;
    }

    await writeAudit(part.workOrderId, "post_part_to_inventory", { part_id: part.id, ...txPayload }).catch(() => undefined);
    await Promise.all([loadItems(selectedYardId), loadWorkOrders(selectedYardId)]);
    setMessage(`${part.itemCode} posted to consumables inventory.`);
    setSaving(false);
  }

  async function closeWorkOrder() {
    if (!selectedWorkOrder || !canCloseWorkOrders) return;
    setSaving(true);
    const now = new Date().toISOString();
    const closedAt = selectedWorkOrder.closedAt || now;
    const { error } = await supabase
      .from("equipment_repair_work_orders")
      .update({ status: "Closed", closed_at: closedAt, completed_at: selectedWorkOrder.completedAt || closedAt, downtime_end: selectedWorkOrder.downtimeEnd || closedAt })
      .eq("id", selectedWorkOrder.id);
    if (error) {
      setMessage(`Close failed: ${error.message}`);
      setSaving(false);
      return;
    }
    await writeAudit(selectedWorkOrder.id, "close_work_order", { status: "Closed" }).catch(() => undefined);
    await loadWorkOrders(selectedYardId);
    setMessage(`${selectedWorkOrder.workOrderNumber} closed.`);
    setSaving(false);
  }

  function exportCsv() {
    const header = [
      "Work Order",
      "Status",
      "Priority",
      "Equipment",
      "Equipment Number",
      "Department",
      "Assigned To",
      "Labor Hours",
      "Labor Cost",
      "Parts Cost",
      "Total Cost",
      "Opened",
      "Updated",
    ];
    const rows = filteredWorkOrders.map((order) => [
      order.workOrderNumber,
      order.status,
      order.priority,
      order.equipmentName,
      order.equipmentNumber,
      order.department,
      order.assignedTo,
      order.laborHours,
      order.totalLaborCost,
      order.totalPartsCost,
      order.totalCost,
      order.openedAt,
      order.updatedAt,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `equipment-repairs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function printWorkOrder() {
    if (!selectedWorkOrder) {
      setMessage("Save or select a work order before printing.");
      return;
    }
    const printWindow = window.open("", "_blank", "width=1100,height=850");
    if (!printWindow) {
      setMessage("Pop-up blocked. Allow pop-ups to print the work order.");
      return;
    }
    printWindow.document.write(
      workOrderDocumentHtml({
        order: selectedWorkOrder,
        parts: selectedParts,
        labor: selectedLabor,
        yardName: selectedYard?.name || "",
      }),
    );
    printWindow.document.close();
  }

  async function emailWorkOrder() {
    if (!selectedWorkOrder) {
      setMessage("Save or select a work order before emailing.");
      return;
    }
    const recipientEmail = window.prompt("Email this work order to:", "");
    if (!recipientEmail) return;

    setEmailingWorkOrderId(selectedWorkOrder.id);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage("Your login session expired. Sign in again before emailing.");
      setEmailingWorkOrderId("");
      return;
    }

    const response = await fetch("/api/equipment-repair-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ workOrderId: selectedWorkOrder.id, recipientEmail }),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(`Email failed: ${result?.error || "Unknown error."}`);
    } else {
      setMessage(`Work order ${selectedWorkOrder.workOrderNumber} emailed to ${recipientEmail}.`);
    }

    setEmailingWorkOrderId("");
  }

  if (loading) {
    return (
      <main className={`module-shell equipment-repairs-shell consum-scope ${styles.scope}`}>
        <section className="card repair-loading-card">
          <div className="repair-loading-top">
            <div>
              <h2>
                <span className="dot"></span>Equipment Repairs
              </h2>
              <p>Syncing work orders, yard access, consumable parts, and repair totals.</p>
            </div>
            <button className="ci-btn mini" type="button" onClick={() => (window.location.href = "/home")}>
              Home
            </button>
          </div>
          <div className="repair-loading-steps" aria-live="polite" aria-busy="true">
            <div className="repair-loading-step">
              <span>Yard Access</span>
              <div className="repair-loading-line"></div>
            </div>
            <div className="repair-loading-step">
              <span>Work Orders</span>
              <div className="repair-loading-line"></div>
            </div>
            <div className="repair-loading-step">
              <span>Parts Inventory</span>
              <div className="repair-loading-line"></div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!canUseModule) {
    return (
      <main className={`module-shell equipment-repairs-shell consum-scope ${styles.scope}`}>
        <section className="card repair-loading-card">
          <h2>
            <span className="dot"></span>Equipment Repairs
          </h2>
          <p>Equipment repair work orders are for internal users only.</p>
          <a className="ci-btn mini" href="/home">
            Back Home
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className={`module-shell equipment-repairs-shell consum-scope ${styles.scope}`}>
      <section className="page-head no-print">
        <div>
          <div className="pt">Equipment Repairs</div>
          <div className="ps">
            Repair work orders, labor time, parts cost, and consumables usage.{" "}
            <span>{selectedYard?.name || "Syncing yard"}</span>
          </div>
        </div>
        <div className="statusline repair-statusline">
          <span className={`pill ${setupRequired ? "warn" : "ok"}`}>{setupRequired ? "Setup needed" : "Live TITAN data"}</span>
          <label className="branch-inline">
            <span>Yard</span>
            <select value={selectedYardId} onChange={(event) => setSelectedYardId(event.target.value)}>
              {yards.map((yard) => (
                <option key={yard.id} value={yard.id}>
                  {yard.name}
                </option>
              ))}
            </select>
          </label>
          <button className="ci-btn mini" type="button" onClick={() => (window.location.href = "/home")}>
            Home
          </button>
          <button className="ci-btn mini" type="button" onClick={() => reloadModuleData()} disabled={!selectedYardId || saving}>
            Refresh
          </button>
          <button className="ci-btn pri mini" type="button" onClick={startNewWorkOrder} disabled={!canManageWorkOrders || setupRequired}>
            New Work Order
          </button>
          <button className="ci-btn mini" type="button" onClick={exportCsv} disabled={!canExportWorkOrders || !filteredWorkOrders.length}>
            Export CSV
          </button>
        </div>
      </section>

      {shouldShowPageMessage(message) && <div className="status-message">{message}</div>}

      {setupRequired && (
        <section className="card repair-warning">
          <h2>
            <span className="dot"></span>Setup Needed
          </h2>
          <p>
            Run <strong>supabase/equipment_repair_work_orders.sql</strong> in Supabase, then refresh this page.
          </p>
        </section>
      )}

      <section className="repair-command-panel card no-print">
        <div className="repair-command-copy">
          <h2>
            <span className="dot"></span>Repair Command Board
            <span className="ct">{filteredWorkOrders.length.toLocaleString()} visible</span>
          </h2>
          <p>Find the equipment, open the work order, add repair time, and post parts when they come out of consumables.</p>
        </div>
        <div className="repair-filter-row">
          <label className="ci-field">
            <span className="lab">Status</span>
            <select className="ci-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="active">Active Work Orders</option>
              <option value="all">All Work Orders</option>
              {workOrderStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="ci-field">
            <span className="lab">Priority</span>
            <select className="ci-select" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="all">All Priority</option>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label className="ci-field">
            <span className="lab">Technician</span>
            <select className="ci-select" value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)} disabled={!canViewAllWorkOrders}>
              <option value="all">{canViewAllWorkOrders ? "All Techs" : "Assigned to me"}</option>
              {canViewAllWorkOrders && <option value="unassigned">Unassigned</option>}
              {canViewAllWorkOrders &&
                technicianCounts
                  .filter(([technician]) => technician !== "Unassigned")
                  .map(([technician, count]) => (
                    <option key={technician} value={technician}>
                      {technician} ({whole(count)})
                    </option>
                  ))}
            </select>
          </label>
          <label className="ci-field repair-search-field">
            <span className="lab">Lookup</span>
            <input
              className="ci-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search WO#, equipment, department, assigned tech..."
            />
          </label>
        </div>
        <div className="repair-quick-board">
          <div className="repair-quick-head">
            <div className="repair-quick-title">Quick Views</div>
            <button className="repair-clear-view" type="button" onClick={clearRepairView}>
              Clear View
            </button>
          </div>
          <div className="repair-chip-row">
            <button className={`repair-chip ${statusFilter === "active" && priorityFilter === "all" && technicianFilter === "all" ? "on" : ""}`} type="button" onClick={() => setRepairView({ status: "active", priority: "all", technician: "all" })}>
              <span>Active</span>
              <b>{whole(statusCounts.get("active") || 0)}</b>
            </button>
            <button className={`repair-chip ${statusFilter === "Open" ? "on" : ""}`} type="button" onClick={() => setRepairView({ status: "Open", priority: "all", technician: "all" })}>
              <span>Open</span>
              <b>{whole(statusCounts.get("Open") || 0)}</b>
            </button>
            <button className={`repair-chip ${statusFilter === "In Repair" ? "on" : ""}`} type="button" onClick={() => setRepairView({ status: "In Repair", priority: "all", technician: "all" })}>
              <span>In Repair</span>
              <b>{whole(statusCounts.get("In Repair") || 0)}</b>
            </button>
            <button className={`repair-chip ${statusFilter === "Awaiting Parts" ? "on" : ""}`} type="button" onClick={() => setRepairView({ status: "Awaiting Parts", priority: "all", technician: "all" })}>
              <span>Waiting Parts</span>
              <b>{whole(statusCounts.get("Awaiting Parts") || 0)}</b>
            </button>
            <button className={`repair-chip priority-critical ${priorityFilter === "Critical" ? "on" : ""}`} type="button" onClick={() => setRepairView({ status: "active", priority: "Critical", technician: "all" })}>
              <span>Critical</span>
              <b>{whole(priorityCounts.get("Critical") || 0)}</b>
            </button>
            <button className={`repair-chip priority-high ${priorityFilter === "High" ? "on" : ""}`} type="button" onClick={() => setRepairView({ status: "active", priority: "High", technician: "all" })}>
              <span>High</span>
              <b>{whole(priorityCounts.get("High") || 0)}</b>
            </button>
            {canViewAllWorkOrders && (
              <button className={`repair-chip ${technicianFilter === "unassigned" ? "on" : ""}`} type="button" onClick={() => setRepairView({ status: "active", priority: "all", technician: "unassigned" })}>
                <span>Unassigned</span>
                <b>{whole(technicianCounts.find(([name]) => name === "Unassigned")?.[1] || 0)}</b>
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="kpis k5 repair-kpi-strip">
        <article className="kpi warn">
          <div className="lab">Open Work Orders</div>
          <div className="val mono">{whole(metrics.open)}</div>
          <div className="note">Active repair load</div>
        </article>
        <article className="kpi steel">
          <div className="lab">Awaiting Parts</div>
          <div className="val mono">{whole(metrics.awaitingParts)}</div>
          <div className="note">{whole(metrics.unpostedParts)} lines waiting to post</div>
        </article>
        <article className="kpi bad">
          <div className="lab">Critical</div>
          <div className="val mono orange">{whole(metrics.critical)}</div>
          <div className="note">Priority repair work</div>
        </article>
        <article className="kpi">
          <div className="lab">Repair Hours</div>
          <div className="val mono">{decimal(metrics.laborHours)}</div>
          <div className="note">Open work order time</div>
        </article>
        <article className="kpi good">
          <div className="lab">Repair Cost</div>
          <div className="val mono">{money(metrics.totalCost)}</div>
          <div className="note">{money(metrics.partsCost)} parts used</div>
        </article>
      </section>

      <section className="ytabs repair-tabs no-print" aria-label="Equipment repair views">
        <button type="button" className={`ytab ${activeTab === "dashboard" ? "on" : ""}`} onClick={() => setActiveTab("dashboard")}>
          Dashboard
        </button>
        <button type="button" className={`ytab ${activeTab === "orders" ? "on" : ""}`} onClick={() => setActiveTab("orders")}>
          Queue <span className="yc">{filteredWorkOrders.length.toLocaleString()}</span>
        </button>
        <button type="button" className={`ytab ${activeTab === "details" ? "on" : ""}`} onClick={() => setActiveTab("details")}>
          Work Order Form
        </button>
      </section>

      {activeTab === "dashboard" && (
        <section className="repair-dashboard-grid">
          <div className="card repair-queue-card">
            <div className="repair-card-head compact">
              <h2>
                <span className="dot"></span>Active Repair Queue
                <span className="ct">{activeBoardOrders.slice(0, 8).length.toLocaleString()} shown</span>
              </h2>
              <button type="button" className="ci-btn mini" onClick={() => setActiveTab("orders")}>
                View Orders
              </button>
            </div>
            <div className="repair-order-board">
              {activeBoardOrders.slice(0, 8).map((order) => (
                <button key={order.id} className={`repair-order-card priority-${statusClass(order.priority)}`} type="button" onClick={() => editWorkOrder(order)}>
                  <span className={`repair-pill status-${statusClass(order.status)}`}>{order.status}</span>
                  <strong>{order.equipmentName || "Equipment repair"}</strong>
                  <small>{order.workOrderNumber} / {order.equipmentNumber || order.equipmentType || "No asset #"}</small>
                  <em>{order.problemDescription || "No repair notes entered yet."}</em>
                  <div>
                    <span>{order.assignedTo || "Unassigned"}</span>
                    <span>{money(order.totalCost)}</span>
                  </div>
                </button>
              ))}
              {!activeBoardOrders.length && <p>No active repair work orders match the current filters.</p>}
            </div>
          </div>

          <div className="card repair-side-card">
            <h2>
              <span className="dot"></span>Status Breakdown
            </h2>
            <div className="repair-status-list">
              {workOrderStatuses
                .filter((status) => status !== "Draft")
                .map((status) => {
                  const count = visibleWorkOrders.filter((order) => order.status === status).length;
                  return (
                    <button
                      key={status}
                      className="repair-stat-button"
                      type="button"
                      onClick={() => {
                        setStatusFilter(status);
                        setActiveTab("orders");
                      }}
                    >
                      <strong>{status}</strong>
                      <span>{whole(count)}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="card repair-side-card">
            <h2>
              <span className="dot"></span>Parts Control
            </h2>
            <div className="repair-status-list">
              <div>
                <strong>Posted to Inventory</strong>
                <span>{whole(metrics.postedParts)}</span>
              </div>
              <div>
                <strong>Waiting to Post</strong>
                <span>{whole(metrics.unpostedParts)}</span>
              </div>
              <div>
                <strong>Parts Cost</strong>
                <span>{money(metrics.partsCost)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "orders" && (
        <section className="card">
          <div className="repair-card-head">
            <div>
              <h2>
                <span className="dot"></span>Work Order Queue
                <span className="ct">{filteredWorkOrders.length.toLocaleString()} records</span>
              </h2>
              <p>Click any repair card to open the work order, add time, consume parts, or close it out.</p>
            </div>
            <button className="ci-btn pri" type="button" onClick={startNewWorkOrder} disabled={!canManageWorkOrders || setupRequired}>
              New Work Order
            </button>
          </div>
          {statusFilter !== "Closed" && statusFilter !== "Cancelled" ? (
            <div className="repair-job-board">
              {activeBoardOrders.length ? (
                activeBoardStatuses.map((status) => {
                  const columnOrders = activeBoardOrders.filter((order) => order.status === status);
                  return (
                    <section key={status} className="repair-job-column">
                      <div className="repair-job-column-head">
                        <strong>{status}</strong>
                        <span>{whole(columnOrders.length)}</span>
                      </div>
                      <div className="repair-job-list">
                        {columnOrders.map((order) => (
                          <button key={order.id} className={`repair-order-card priority-${statusClass(order.priority)}`} type="button" onClick={() => editWorkOrder(order)}>
                            <span className={`repair-priority priority-${statusClass(order.priority)}`}>{order.priority}</span>
                            <strong>{order.equipmentName || "Equipment repair"}</strong>
                            <small>{order.workOrderNumber} / {order.equipmentNumber || order.equipmentType || "No asset #"}</small>
                            <em>{order.problemDescription || "No repair notes entered yet."}</em>
                            <div>
                              <span>{order.assignedTo || "Unassigned"}</span>
                              <span>{decimal(order.laborHours)} hrs</span>
                            </div>
                          </button>
                        ))}
                        {!columnOrders.length && <div className="repair-job-empty">No work orders.</div>}
                      </div>
                    </section>
                  );
                })
              ) : (
                <p>No active work orders match this view.</p>
              )}
            </div>
          ) : (
            <div className="repair-order-list">
              {filteredWorkOrders.map((order) => (
                <button key={order.id} className="repair-order-row" type="button" onClick={() => editWorkOrder(order)}>
                  <span className={`repair-priority priority-${statusClass(order.priority)}`}>{order.priority}</span>
                  <div className="repair-order-title">
                    <strong>{order.equipmentName || "Equipment repair"}</strong>
                    <small>{order.workOrderNumber} / {order.equipmentNumber || order.equipmentType || "No asset #"}</small>
                  </div>
                  <span className={`repair-pill status-${statusClass(order.status)}`}>{order.status}</span>
                  <span>{order.assignedTo || "Unassigned"}</span>
                  <span>{decimal(order.laborHours)} hrs</span>
                  <span>{money(order.totalCost)}</span>
                  <span>{dateText(order.updatedAt)}</span>
                </button>
              ))}
              {!filteredWorkOrders.length && <p>No work orders match this view.</p>}
            </div>
          )}
        </section>
      )}

      {activeTab === "details" && (
        <section className="repair-detail-grid repair-work-order-grid">
          <div className="card repair-detail-card repair-form-card">
            <div className="repair-card-head repair-work-order-head">
              <div>
                <div className="repair-form-eyebrow">Equipment Repair Work Order</div>
                <h2>
                  <span className="dot"></span>{selectedWorkOrder?.workOrderNumber || workOrderForm.workOrderNumber || "New Work Order"}
                  {selectedWorkOrder && <span className="ct">{selectedWorkOrder.status}</span>}
                </h2>
                <p>{selectedWorkOrder ? `${selectedWorkOrder.equipmentName} repair packet` : "Create the work order form first, then add labor and parts."}</p>
              </div>
              <div className="repair-document-actions no-print">
                <button className="ci-btn mini" type="button" onClick={() => setActiveTab("orders")}>
                  Back to Queue
                </button>
                <button className="ci-btn mini" type="button" onClick={printWorkOrder} disabled={!selectedWorkOrder}>
                  Print / PDF
                </button>
                <button className="ci-btn mini" type="button" onClick={emailWorkOrder} disabled={!selectedWorkOrder || emailingWorkOrderId === selectedWorkOrder.id}>
                  {selectedWorkOrder && emailingWorkOrderId === selectedWorkOrder.id ? "Emailing..." : "Email"}
                </button>
                {selectedWorkOrder && canCloseWorkOrders && selectedWorkOrder.status !== "Closed" && (
                  <button className="ci-btn pri mini" type="button" onClick={closeWorkOrder} disabled={saving}>
                    Close WO
                  </button>
                )}
              </div>
            </div>

            <div className="repair-form-summary no-print">
              <div>
                <span>Work Order #</span>
                <strong>{selectedWorkOrder?.workOrderNumber || workOrderForm.workOrderNumber || "-"}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{dateTimeText(selectedWorkOrder?.createdAt || workOrderForm.createdAt || workOrderForm.openedAt)}</strong>
              </div>
              <div>
                <span>Closed</span>
                <strong>{selectedWorkOrder?.closedAt ? dateTimeText(selectedWorkOrder.closedAt) : "Not closed"}</strong>
              </div>
              <div>
                <span>Requested By</span>
                <strong>{selectedWorkOrder?.requestedByName || userName}</strong>
              </div>
              <div>
                <span>Yard</span>
                <strong>{selectedYard?.name || "-"}</strong>
              </div>
              <div>
                <span>Parts Posted</span>
                <strong>{selectedParts.filter((part) => part.postedToInventory).length} / {selectedParts.length}</strong>
              </div>
            </div>

            <section className="repair-form-section">
              <div className="repair-section-title">
                <span>01</span>
                <strong>Asset / Equipment</strong>
              </div>
              <div className="form-grid repair-form-grid">
                <label className="full">
                  Equipment Lookup
                  <div className="repair-equipment-picker">
                    <div className="repair-equipment-search">
                      <input
                        value={equipmentLookup}
                        onChange={(event) => handleEquipmentLookupChange(event.target.value)}
                        onFocus={() => setShowEquipmentResults(true)}
                        onBlur={() => window.setTimeout(() => setShowEquipmentResults(false), 140)}
                        placeholder="Search TXTRK#220, P78237, loader, DTI, John R..."
                      />
                      <button className="ci-btn mini" type="button" onClick={() => clearEquipmentSelection()}>
                        Manual
                      </button>
                      <button className="ci-btn mini" type="button" onClick={() => clearEquipmentSelection({ clearFields: true })}>
                        Clear
                      </button>
                    </div>
                    {selectedEquipmentAsset && (
                      <div className="repair-equipment-selected">
                        <span>Selected asset</span>
                        <strong>{selectedEquipmentAsset.name}</strong>
                        <em>{selectedEquipmentAsset.assetTag || selectedEquipmentAsset.unitNumber} / {selectedEquipmentAsset.equipmentType} / {selectedEquipmentAsset.department}</em>
                      </div>
                    )}
                    {showEquipmentResults && (
                      <div className="repair-equipment-results">
                        {filteredEquipmentAssets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => applyEquipmentAsset(asset)}
                          >
                            <strong>{asset.name}</strong>
                            <span>{asset.assetTag || asset.unitNumber}</span>
                            <em>{asset.equipmentType} / {asset.department}{asset.currentAssignment ? ` / ${asset.currentAssignment}` : ""}</em>
                          </button>
                        ))}
                        {!filteredEquipmentAssets.length && (
                          <div className="repair-equipment-empty">
                            No match found. Use the manual fields below.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>
                <label>
                  Equipment Name
                  <input
                    value={workOrderForm.equipmentName}
                    onChange={(event) => {
                      setEquipmentLookup("");
                      setSelectedEquipmentAssetId("");
                      setWorkOrderForm({ ...workOrderForm, equipmentName: event.target.value });
                    }}
                    placeholder="Example: Forklift 2, Truck 18, Yard compressor"
                  />
                </label>
                <label>
                  Equipment Number
                  <input
                    value={workOrderForm.equipmentNumber}
                    onChange={(event) => {
                      setEquipmentLookup("");
                      setSelectedEquipmentAssetId("");
                      setWorkOrderForm({ ...workOrderForm, equipmentNumber: event.target.value });
                    }}
                    placeholder="Asset, unit, or truck #"
                  />
                </label>
                <label>
                  Equipment Type
                  <input
                    value={workOrderForm.equipmentType}
                    onChange={(event) => {
                      setEquipmentLookup("");
                      setSelectedEquipmentAssetId("");
                      setWorkOrderForm({ ...workOrderForm, equipmentType: event.target.value });
                    }}
                    placeholder="Truck, forklift, rack, pump"
                  />
                </label>
              </div>
            </section>

            <section className="repair-form-section">
              <div className="repair-section-title">
                <span>02</span>
                <strong>Assignment / Control</strong>
              </div>
              <div className="form-grid repair-form-grid">
                <label>
                  Department
                  <input value={workOrderForm.department} onChange={(event) => setWorkOrderForm({ ...workOrderForm, department: event.target.value })} placeholder="Yard, shop, hardband, DTI..." />
                </label>
                <label>
                  Assigned To
                  <select value={workOrderForm.assignedTo} onChange={(event) => setWorkOrderForm({ ...workOrderForm, assignedTo: event.target.value })}>
                    <option value="">Unassigned</option>
                    {assigneeOptions.map((assignee) => (
                      <option key={assignee.id} value={assignee.assignmentValue}>
                        {assignee.label}
                      </option>
                    ))}
                    {!assigneeOptions.length && <option disabled>No repair users found</option>}
                  </select>
                </label>
                <label>
                  Priority
                  <select value={workOrderForm.priority} onChange={(event) => setWorkOrderForm({ ...workOrderForm, priority: event.target.value as WorkOrderPriority })}>
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={workOrderForm.status} onChange={(event) => setWorkOrderForm({ ...workOrderForm, status: event.target.value as WorkOrderStatus })}>
                    {workOrderStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Repair Start
                  <input type="datetime-local" value={workOrderForm.downtimeStart} onChange={(event) => setWorkOrderForm({ ...workOrderForm, downtimeStart: event.target.value })} />
                </label>
                <label>
                  Repair Complete
                  <input type="datetime-local" value={workOrderForm.downtimeEnd} onChange={(event) => setWorkOrderForm({ ...workOrderForm, downtimeEnd: event.target.value })} />
                </label>
              </div>
            </section>

            <section className="repair-form-section">
              <div className="repair-section-title">
                <span>03</span>
                <strong>Repair Request / Closeout</strong>
              </div>
              <div className="form-grid repair-form-grid">
                <label className="full">
                  Problem / Repair Request
                  <textarea value={workOrderForm.problemDescription} onChange={(event) => setWorkOrderForm({ ...workOrderForm, problemDescription: event.target.value })} placeholder="Describe what is broken, symptoms, location, and safety concerns." />
                </label>
                <label className="full">
                  Repair Notes / Corrective Action
                  <textarea value={workOrderForm.repairNotes} onChange={(event) => setWorkOrderForm({ ...workOrderForm, repairNotes: event.target.value })} placeholder="Document diagnosis, completed repair, next steps, vendor notes, or closeout notes." />
                </label>
              </div>
            </section>

            <div className="repair-actions-row">
              <button className="ci-btn pri" type="button" onClick={saveWorkOrder} disabled={saving || !canManageWorkOrders || setupRequired}>
                {selectedWorkOrder ? "Save Changes" : "Save & Open Work Order"}
              </button>
              <button className="ci-btn" type="button" onClick={startNewWorkOrder}>
                New Blank
              </button>
            </div>
          </div>

          <aside className="card repair-cost-card">
            <h2>
              <span className="dot"></span>Repair Cost
            </h2>
            <div className="repair-cost-stack">
              <div>
                <span>Labor</span>
                <strong>{money(selectedWorkOrder?.totalLaborCost || 0)}</strong>
                <small>{decimal(selectedWorkOrder?.laborHours || 0)} hours</small>
              </div>
              <div>
                <span>Parts</span>
                <strong>{money(selectedWorkOrder?.totalPartsCost || 0)}</strong>
                <small>{selectedParts.length} part lines</small>
              </div>
              <div>
                <span>Total</span>
                <strong>{money(selectedWorkOrder?.totalCost || 0)}</strong>
                <small>{selectedWorkOrder?.status || "Not saved"}</small>
              </div>
            </div>
          </aside>

          <div className="card">
            <h2>
              <span className="dot"></span>Repair Time
            </h2>
            <div className="repair-inline-form">
              <label className="repair-entry-field">
                <span>Technician</span>
                <input value={laborForm.technicianName} onChange={(event) => setLaborForm({ ...laborForm, technicianName: event.target.value })} placeholder="Technician name" />
              </label>
              <label className="repair-entry-field">
                <span>Date</span>
                <input type="date" value={laborForm.workDate} onChange={(event) => setLaborForm({ ...laborForm, workDate: event.target.value })} />
              </label>
              <label className="repair-entry-field">
                <span>Hours</span>
                <input value={laborForm.hours} onChange={(event) => setLaborForm({ ...laborForm, hours: event.target.value })} placeholder="0.00" inputMode="decimal" />
              </label>
              <button className="ci-btn pri" type="button" onClick={addLaborEntry} disabled={!selectedWorkOrderId || saving || !canManageWorkOrders}>
                Add Time
              </button>
            </div>
            <input className="repair-notes-input" value={laborForm.notes} onChange={(event) => setLaborForm({ ...laborForm, notes: event.target.value })} placeholder="Labor notes" />
            <div className="repair-table-wrap compact">
              <table className="repair-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Tech</th>
                    <th>Hours</th>
                    <th>Rate</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLabor.map((entry) => (
                    <tr key={entry.id}>
                      <td>{dateText(entry.workDate)}</td>
                      <td>{entry.technicianName}</td>
                      <td>{decimal(entry.hours)}</td>
                      <td>{money(entry.laborRate)}</td>
                      <td>{money(entry.lineTotal)}</td>
                    </tr>
                  ))}
                  {!selectedLabor.length && (
                    <tr>
                      <td colSpan={5}>No repair time entered.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>
              <span className="dot"></span>Repair Parts
            </h2>
            <p className="muted-text repair-rate-help">Search consumables when the part exists, or type a manual part until inventory is fully loaded.</p>
            <div className="repair-inline-form parts">
              <div className="repair-part-lookup">
                <label className="repair-entry-field">
                  <span>Part Lookup / Manual Description</span>
                  <input
                    value={partLookup}
                    onChange={(event) => handlePartLookupChange(event.target.value)}
                    placeholder="Search SKU, item, category, bin, or type manual part..."
                  />
                </label>
                {!selectedPartItem && partSearchResults.length > 0 && (
                  <div className="repair-part-results">
                    {partSearchResults.map((item) => (
                      <button key={item.id} type="button" onClick={() => selectPartForRepair(item)}>
                        <strong>{item.itemCode}</strong>
                        <span>{item.itemName}</span>
                        <em>{decimal(item.qtyOnHand)} on hand / {money(item.unitPrice)}</em>
                      </button>
                    ))}
                  </div>
                )}
                {partLookup.trim() && partSearchResults.length === 0 && !selectedPartItem && (
                  <div className="repair-part-empty">No matching consumable parts found.</div>
                )}
                {selectedPartItem && (
                  <div className="repair-selected-part">
                    <strong>{selectedPartItem.itemCode}</strong>
                    <span>{selectedPartItem.itemName}</span>
                    <em>{decimal(selectedPartItem.qtyOnHand)} on hand / {money(selectedPartItem.unitPrice)}</em>
                  </div>
                )}
              </div>
              <label className="repair-entry-field">
                <span>Part # / SKU</span>
                <input value={partForm.itemCode} onChange={(event) => setPartForm({ ...partForm, itemCode: event.target.value })} placeholder="Optional" />
              </label>
              <label className="repair-entry-field">
                <span>Qty Used</span>
                <input value={partForm.quantity} onChange={(event) => setPartForm({ ...partForm, quantity: event.target.value })} placeholder="0" inputMode="decimal" />
              </label>
              <label className="repair-entry-field">
                <span>Unit Price</span>
                <input value={partForm.unitPrice} onChange={(event) => setPartForm({ ...partForm, unitPrice: event.target.value })} placeholder="0.00" inputMode="decimal" />
              </label>
              <button className="ci-btn pri" type="button" onClick={addPartLine} disabled={!selectedWorkOrderId || saving || !canManageWorkOrders}>
                Add Part
              </button>
            </div>
            <input className="repair-notes-input" value={partForm.notes} onChange={(event) => setPartForm({ ...partForm, notes: event.target.value })} placeholder="Part notes" />
            <div className="repair-table-wrap compact">
              <table className="repair-table">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Total</th>
                    <th>Inventory</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedParts.map((part) => (
                    <tr key={part.id}>
                      <td>
                        <strong>{part.itemCode || "Manual"}</strong>
                        <span>{part.itemName}</span>
                      </td>
                      <td>{decimal(part.quantityUsed)}</td>
                      <td>{money(part.unitCost)}</td>
                      <td>{money(part.lineTotal)}</td>
                      <td>
                        {part.postedToInventory ? (
                          <span className="repair-pill status-closed">Posted</span>
                        ) : !part.inventoryItemId ? (
                          <span className="repair-pill">Manual</span>
                        ) : (
                          <button className="ci-btn mini" type="button" onClick={() => postPartToInventory(part)} disabled={saving || !canManageWorkOrders}>
                            Post
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!selectedParts.length && (
                    <tr>
                      <td colSpan={5}>No repair parts added.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
