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

type WorkOrderForm = {
  id: string;
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
  quantity: string;
  notes: string;
};

type LaborForm = {
  technicianName: string;
  workDate: string;
  hours: string;
  laborRate: string;
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

const emptyWorkOrderForm: WorkOrderForm = {
  id: "",
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
  quantity: "1",
  notes: "",
};

const emptyLaborForm: LaborForm = {
  technicianName: "",
  workDate: new Date().toISOString().slice(0, 10),
  hours: "1",
  laborRate: "0",
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
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `RWO-${stamp}`;
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

function accessAllowed(role: string, moduleKeys: ModuleKey[], permissions: PermissionMap | null) {
  if (role === "customer") return false;
  if (["admin", "owner", "maintenance_lead", "maintenance_hand", "employee"].includes(role)) return true;
  return (
    moduleKeys.includes("work_orders") ||
    canView(permissions, "work_orders") ||
    canCreate(permissions, "work_orders") ||
    canEdit(permissions, "work_orders")
  );
}

export default function EquipmentRepairsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [yards, setYards] = useState<InventoryYard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState("");
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [parts, setParts] = useState<WorkOrderPart[]>([]);
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderForm>(emptyWorkOrderForm);
  const [partForm, setPartForm] = useState<PartForm>(emptyPartForm);
  const [laborForm, setLaborForm] = useState<LaborForm>(emptyLaborForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [userName, setUserName] = useState("TITAN User");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("employee");
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [moduleKeys, setModuleKeys] = useState<ModuleKey[]>([]);

  const selectedYard = yards.find((yard) => yard.id === selectedYardId);
  const selectedWorkOrder = workOrders.find((order) => order.id === selectedWorkOrderId) || null;
  const selectedParts = parts.filter((part) => part.workOrderId === selectedWorkOrderId);
  const selectedLabor = laborEntries.filter((entry) => entry.workOrderId === selectedWorkOrderId);
  const canUseModule = accessAllowed(role, moduleKeys, permissions);
  const canManageWorkOrders =
    role !== "customer" &&
    (["admin", "owner", "maintenance_lead", "maintenance_hand", "employee"].includes(role) ||
      canCreate(permissions, "work_orders") ||
      canEdit(permissions, "work_orders"));
  const canCloseWorkOrders = ["admin", "owner", "maintenance_lead"].includes(role) || canClose(permissions, "work_orders");
  const canExportWorkOrders = ["admin", "owner", "maintenance_lead"].includes(role) || canExport(permissions, "work_orders");

  const filteredWorkOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return workOrders.filter((order) => {
      const activeStatus = !["Closed", "Cancelled"].includes(order.status);
      const statusMatches =
        statusFilter === "all" ||
        (statusFilter === "active" ? activeStatus : order.status.toLowerCase() === statusFilter.toLowerCase());
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
      return statusMatches && termMatches;
    });
  }, [search, statusFilter, workOrders]);

  const metrics = useMemo(() => {
    const activeOrders = workOrders.filter((order) => !["Closed", "Cancelled"].includes(order.status));
    return {
      open: activeOrders.length,
      awaitingParts: activeOrders.filter((order) => order.status === "Awaiting Parts").length,
      critical: activeOrders.filter((order) => order.priority === "Critical").length,
      laborHours: activeOrders.reduce((sum, order) => sum + order.laborHours, 0),
      partsCost: activeOrders.reduce((sum, order) => sum + order.totalPartsCost, 0),
      totalCost: activeOrders.reduce((sum, order) => sum + order.totalCost, 0),
      postedParts: parts.filter((part) => part.postedToInventory).length,
      unpostedParts: parts.filter((part) => !part.postedToInventory).length,
    };
  }, [parts, workOrders]);

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
    setWorkOrderForm(emptyWorkOrderForm);
    setPartForm(emptyPartForm);
    setLaborForm({ ...emptyLaborForm, technicianName: userName });
    setActiveTab("details");
  }

  function editWorkOrder(order: WorkOrder) {
    setSelectedWorkOrderId(order.id);
    setWorkOrderForm({
      id: order.id,
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
    });
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
      completed_at: status === "Ready for Review" || status === "Closed" ? now : null,
      closed_at: status === "Closed" ? now : null,
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
      setWorkOrderForm({ ...workOrderForm, id: order.id });
    } else {
      const insertPayload = {
        ...payload,
        work_order_number: generateWorkOrderNumber(),
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
      setWorkOrderForm({ ...workOrderForm, id: order.id });
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
    const rate = numberValue(laborForm.laborRate);
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
      line_total: hours * rate,
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
    setLaborForm({ ...emptyLaborForm, technicianName: laborForm.technicianName, laborRate: laborForm.laborRate });
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
    if (!item || quantity <= 0) {
      setMessage("Choose a consumable item and enter a quantity.");
      return;
    }

    setSaving(true);
    const payload = {
      work_order_id: selectedWorkOrderId,
      yard_id: selectedYardId || null,
      inventory_item_id: item.id,
      item_code: item.itemCode,
      item_name: item.itemName,
      category: item.category || null,
      uom: item.uom || null,
      quantity_used: quantity,
      unit_cost: item.unitPrice,
      line_total: quantity * item.unitPrice,
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
    await loadWorkOrders(selectedYardId);
    setMessage("Part added. Post it when the part is actually used.");
    setSaving(false);
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
    const { error } = await supabase
      .from("equipment_repair_work_orders")
      .update({ status: "Closed", closed_at: now, completed_at: selectedWorkOrder.completedAt || now, downtime_end: selectedWorkOrder.downtimeEnd || now })
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

  if (loading) {
    return (
      <main className={`module-shell equipment-repairs-shell consum-scope ${styles.scope}`}>
        <section className="card repair-loading-card">
          <h2>
            <span className="dot"></span>Equipment Repairs
          </h2>
          <p>Loading TITAN repair work orders.</p>
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
          Parts & Labor
        </button>
      </section>

      {activeTab === "dashboard" && (
        <section className="repair-dashboard-grid">
          <div className="card repair-queue-card">
            <div className="repair-card-head compact">
              <h2>
                <span className="dot"></span>Active Repair Queue
                <span className="ct">{filteredWorkOrders.slice(0, 8).length.toLocaleString()} shown</span>
              </h2>
              <button type="button" className="ci-btn mini" onClick={() => setActiveTab("orders")}>
                View Orders
              </button>
            </div>
            <div className="repair-order-board">
              {filteredWorkOrders.slice(0, 8).map((order) => (
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
              {!filteredWorkOrders.length && <p>No repair work orders match the current filters.</p>}
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
                  const count = workOrders.filter((order) => order.status === status).length;
                  return (
                    <div key={status}>
                      <strong>{status}</strong>
                      <span>{whole(count)}</span>
                    </div>
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
        </section>
      )}

      {activeTab === "details" && (
        <section className="repair-detail-grid">
          <div className="card repair-detail-card">
            <div className="repair-card-head">
              <div>
                <h2>
                  <span className="dot"></span>{selectedWorkOrder ? selectedWorkOrder.workOrderNumber : "New Work Order"}
                  {selectedWorkOrder && <span className="ct">{selectedWorkOrder.status}</span>}
                </h2>
                <p>{selectedWorkOrder ? `${selectedWorkOrder.equipmentName} repair detail` : "Create a repair order before adding time or parts."}</p>
              </div>
              {selectedWorkOrder && canCloseWorkOrders && selectedWorkOrder.status !== "Closed" && (
                <button className="ci-btn pri" type="button" onClick={closeWorkOrder} disabled={saving}>
                  Close WO
                </button>
              )}
            </div>
            <div className="form-grid repair-form-grid">
              <label>
                Equipment Name
                <input value={workOrderForm.equipmentName} onChange={(event) => setWorkOrderForm({ ...workOrderForm, equipmentName: event.target.value })} />
              </label>
              <label>
                Equipment Number
                <input value={workOrderForm.equipmentNumber} onChange={(event) => setWorkOrderForm({ ...workOrderForm, equipmentNumber: event.target.value })} />
              </label>
              <label>
                Equipment Type
                <input value={workOrderForm.equipmentType} onChange={(event) => setWorkOrderForm({ ...workOrderForm, equipmentType: event.target.value })} placeholder="Truck, forklift, rack, pump" />
              </label>
              <label>
                Department
                <input value={workOrderForm.department} onChange={(event) => setWorkOrderForm({ ...workOrderForm, department: event.target.value })} />
              </label>
              <label>
                Assigned To
                <input value={workOrderForm.assignedTo} onChange={(event) => setWorkOrderForm({ ...workOrderForm, assignedTo: event.target.value })} />
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
                Downtime Start
                <input type="datetime-local" value={workOrderForm.downtimeStart} onChange={(event) => setWorkOrderForm({ ...workOrderForm, downtimeStart: event.target.value })} />
              </label>
              <label>
                Downtime End
                <input type="datetime-local" value={workOrderForm.downtimeEnd} onChange={(event) => setWorkOrderForm({ ...workOrderForm, downtimeEnd: event.target.value })} />
              </label>
              <label className="full">
                Problem / Repair Request
                <textarea value={workOrderForm.problemDescription} onChange={(event) => setWorkOrderForm({ ...workOrderForm, problemDescription: event.target.value })} />
              </label>
              <label className="full">
                Repair Notes
                <textarea value={workOrderForm.repairNotes} onChange={(event) => setWorkOrderForm({ ...workOrderForm, repairNotes: event.target.value })} />
              </label>
            </div>
            <div className="repair-actions-row">
              <button className="ci-btn pri" type="button" onClick={saveWorkOrder} disabled={saving || !canManageWorkOrders || setupRequired}>
                Save Work Order
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
              <input value={laborForm.technicianName} onChange={(event) => setLaborForm({ ...laborForm, technicianName: event.target.value })} placeholder="Technician" />
              <input type="date" value={laborForm.workDate} onChange={(event) => setLaborForm({ ...laborForm, workDate: event.target.value })} />
              <input value={laborForm.hours} onChange={(event) => setLaborForm({ ...laborForm, hours: event.target.value })} placeholder="Hours" inputMode="decimal" />
              <input value={laborForm.laborRate} onChange={(event) => setLaborForm({ ...laborForm, laborRate: event.target.value })} placeholder="Rate" inputMode="decimal" />
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
              <span className="dot"></span>Parts From Consumables
            </h2>
            <div className="repair-inline-form parts">
              <select value={partForm.itemId} onChange={(event) => setPartForm({ ...partForm, itemId: event.target.value })}>
                <option value="">Select part from consumables inventory</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemCode} - {item.itemName} ({decimal(item.qtyOnHand)} on hand)
                  </option>
                ))}
              </select>
              <input value={partForm.quantity} onChange={(event) => setPartForm({ ...partForm, quantity: event.target.value })} placeholder="Qty" inputMode="decimal" />
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
                        <strong>{part.itemCode}</strong>
                        <span>{part.itemName}</span>
                      </td>
                      <td>{decimal(part.quantityUsed)}</td>
                      <td>{money(part.unitCost)}</td>
                      <td>{money(part.lineTotal)}</td>
                      <td>
                        {part.postedToInventory ? (
                          <span className="repair-pill status-closed">Posted</span>
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
