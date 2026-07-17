"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import styles from "./purchase-orders.module.css";
import {
  approvalPlanForAmount,
  evaluateInvoiceMatch,
  formatPoMoney,
  normalizePoStatus,
  poStatuses,
  roleCanManagePurchaseOrders,
  roleCanMatchInvoices,
  roleCanReceivePurchaseOrders,
  roleCanRequestPurchaseOrders,
} from "../../lib/purchaseOrderLifecycle";

type InventoryYard = {
  id: string;
  name: string;
  code: string;
};

type Vendor = {
  id: string;
  vendorName: string;
  email: string;
  contactInfo: string;
  paymentTerms: string;
  taxId: string;
  active: boolean;
};

type InventoryItem = {
  id: string;
  itemCode: string;
  itemName: string;
  unitPrice: number;
  qtyOnHand: number;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  orderDate: string;
  requestedBy: string;
  requesterId: string;
  department: string;
  budgetCode: string;
  costCenter: string;
  status: string;
  notes: string;
  totalAmount: number;
  submittedAt: string;
  approvedAt: string;
  sentAt: string;
  invoicedAt: string;
  closedAt: string;
  rejectionReason: string;
  cancelledReason: string;
};

type PurchaseOrderLine = {
  id: string;
  purchaseOrderId: string;
  itemId: string;
  itemCode: string;
  description: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityInvoiced: number;
  unitPrice: number;
  lineTotal: number;
  glCode: string;
};

type Approval = {
  id: string;
  poId: string;
  approverId: string;
  approverRole: string;
  tier: number;
  status: string;
  comments: string;
  timestamp: string;
};

type Invoice = {
  id: string;
  poId: string;
  vendorInvoiceNumber: string;
  amount: number;
  matchStatus: string;
  exceptionReason: string;
  reviewedAt: string;
  createdAt: string;
};

type AuditLog = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userName: string;
  timestamp: string;
  beforeValue: unknown;
  afterValue: unknown;
};

type PoForm = {
  poId: string;
  poNumber: string;
  vendorId: string;
  orderDate: string;
  requestedBy: string;
  department: string;
  budgetCode: string;
  costCenter: string;
  notes: string;
};

type LineForm = {
  itemId: string;
  itemCode: string;
  description: string;
  quantityOrdered: string;
  unitPrice: string;
  glCode: string;
};

type VendorForm = {
  vendorId: string;
  vendorName: string;
  email: string;
  contactInfo: string;
  paymentTerms: string;
  taxId: string;
  active: boolean;
};

type InvoiceForm = {
  poId: string;
  vendorInvoiceNumber: string;
  amount: string;
  tolerancePercent: string;
};

type TabKey =
  | "dashboard"
  | "list"
  | "edit"
  | "approvals"
  | "receiving"
  | "invoices"
  | "vendors"
  | "budget"
  | "audit";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "list", label: "PO List" },
  { key: "edit", label: "Create / Edit" },
  { key: "approvals", label: "Approval Queue" },
  { key: "receiving", label: "Receiving" },
  { key: "invoices", label: "Invoice Match" },
  { key: "vendors", label: "Vendors" },
  { key: "budget", label: "Budget" },
  { key: "audit", label: "Audit Trail" },
];

const defaultInventoryYardCode = "PIFS";
const inventoryYardCodes = ["PIFS", "GILLETTE", "CASPER", "DICKINSON"];
const wadeInventoryAdminEmail = "wade@pathfinderinspections.com";
const emptyPoForm: PoForm = {
  poId: "",
  poNumber: "",
  vendorId: "",
  orderDate: new Date().toISOString().slice(0, 10),
  requestedBy: "",
  department: "",
  budgetCode: "",
  costCenter: "",
  notes: "",
};
const emptyLineForm: LineForm = {
  itemId: "",
  itemCode: "",
  description: "",
  quantityOrdered: "1",
  unitPrice: "0",
  glCode: "",
};
const emptyVendorForm: VendorForm = {
  vendorId: "",
  vendorName: "",
  email: "",
  contactInfo: "",
  paymentTerms: "",
  taxId: "",
  active: true,
};
const emptyInvoiceForm: InvoiceForm = {
  poId: "",
  vendorInvoiceNumber: "",
  amount: "",
  tolerancePercent: "5",
};

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateText(value: string) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function normalizeRole(role: unknown) {
  return String(role ?? "customer").trim().toLowerCase().replace(/\s+/g, "_");
}

function statusClass(status: string) {
  return `po-status-pill status-${normalizePoStatus(status).toLowerCase().replace(/\s+/g, "-")}`;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return text.includes(",") || text.includes("\"") || text.includes("\n") ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(fileName: string, headers: string[], rows: unknown[][]) {
  const csv = [headers.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function auditSummary(value: unknown) {
  if (!value) return "-";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function PurchaseOrdersPage() {
  const [role, setRole] = useState("customer");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [yards, setYards] = useState<InventoryYard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [receiptCount, setReceiptCount] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [poForm, setPoForm] = useState<PoForm>(emptyPoForm);
  const [lineForm, setLineForm] = useState<LineForm>(emptyLineForm);
  const [vendorForm, setVendorForm] = useState<VendorForm>(emptyVendorForm);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoiceForm);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [receiveNotes, setReceiveNotes] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState({ status: "all", vendor: "all", department: "all", dateFrom: "", dateTo: "", search: "" });
  const [auditSearch, setAuditSearch] = useState("");

  const canUsePurchaseOrders = roleCanRequestPurchaseOrders(role);
  const canManagePo = roleCanManagePurchaseOrders(role);
  const canReceivePo = roleCanReceivePurchaseOrders(role);
  const canMatchPo = roleCanMatchInvoices(role);
  const selectedYard = yards.find((yard) => yard.id === selectedYardId) || null;
  const selectedLines = lines.filter((line) => line.purchaseOrderId === selectedPoId);

  const departments = useMemo(
    () => Array.from(new Set(orders.map((order) => order.department).filter(Boolean))).sort(),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return orders.filter((order) => {
      const status = normalizePoStatus(order.status);
      const matchesStatus = filters.status === "all" || status === filters.status;
      const matchesVendor = filters.vendor === "all" || order.vendorId === filters.vendor || order.vendorName === filters.vendor;
      const matchesDepartment = filters.department === "all" || order.department === filters.department;
      const matchesDateFrom = !filters.dateFrom || order.orderDate >= filters.dateFrom;
      const matchesDateTo = !filters.dateTo || order.orderDate <= filters.dateTo;
      const haystack = [order.poNumber, order.vendorName, order.requestedBy, order.department, order.costCenter, order.notes]
        .join(" ")
        .toLowerCase();
      return matchesStatus && matchesVendor && matchesDepartment && matchesDateFrom && matchesDateTo && (!term || haystack.includes(term));
    });
  }, [filters, orders]);

  const orderLinesByPo = useMemo(() => {
    const map = new Map<string, PurchaseOrderLine[]>();
    lines.forEach((line) => {
      const next = map.get(line.purchaseOrderId) ?? [];
      next.push(line);
      map.set(line.purchaseOrderId, next);
    });
    return map;
  }, [lines]);

  const currentApprovalRows = useMemo(() => {
    return orders
      .filter((order) => normalizePoStatus(order.status) === "Submitted")
      .flatMap((order) => {
        const pending = approvals
          .filter((approval) => approval.poId === order.id && approval.status === "pending")
          .sort((a, b) => a.tier - b.tier)[0];
        if (!pending) return [];
        const plan = approvalPlanForAmount(order.totalAmount);
        const requirement = plan.find((item) => item.tier === pending.tier && item.label.toLowerCase().includes(pending.approverRole || "manager"));
        const isMine = canManagePo || !requirement || requirement.roleKeys.includes(role);
        return isMine ? [{ order, approval: pending }] : [];
      });
  }, [approvals, canManagePo, orders, role]);

  const dashboard = useMemo(() => {
    const openStatuses = new Set(["Draft", "Submitted", "Approved", "Sent to Vendor", "Partially Received", "Fully Received", "Invoiced"]);
    const openOrders = orders.filter((order) => openStatuses.has(normalizePoStatus(order.status)));
    const pendingApproval = orders.filter((order) => normalizePoStatus(order.status) === "Submitted").length;
    const committed = orders
      .filter((order) => ["Approved", "Sent to Vendor", "Partially Received", "Fully Received"].includes(normalizePoStatus(order.status)))
      .reduce((sum, order) => sum + order.totalAmount, 0);
    const invoiceExceptions = invoices.filter((invoice) => invoice.matchStatus === "exception").length;
    const closed = orders.filter((order) => normalizePoStatus(order.status) === "Closed").length;
    return {
      openCount: openOrders.length,
      pendingApproval,
      committed,
      invoiceExceptions,
      closed,
      receiptCount,
      totalValue: orders.reduce((sum, order) => sum + order.totalAmount, 0),
    };
  }, [invoices, orders, receiptCount]);

  const budgetRows = useMemo(() => {
    const map = new Map<string, { department: string; costCenter: string; committed: number; actual: number; open: number; count: number }>();
    orders.forEach((order) => {
      const key = `${order.department || "Unassigned"}|${order.costCenter || order.budgetCode || "No Cost Center"}`;
      const row = map.get(key) ?? {
        department: order.department || "Unassigned",
        costCenter: order.costCenter || order.budgetCode || "No Cost Center",
        committed: 0,
        actual: 0,
        open: 0,
        count: 0,
      };
      const status = normalizePoStatus(order.status);
      row.count += 1;
      if (["Approved", "Sent to Vendor", "Partially Received", "Fully Received"].includes(status)) row.committed += order.totalAmount;
      if (["Invoiced", "Closed"].includes(status)) row.actual += order.totalAmount;
      if (!["Closed", "Cancelled"].includes(status)) row.open += order.totalAmount;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.open - a.open);
  }, [orders]);

  const filteredAuditLogs = useMemo(() => {
    const term = auditSearch.trim().toLowerCase();
    if (!term) return auditLogs;
    return auditLogs.filter((log) =>
      [log.entityType, log.action, log.userName, auditSummary(log.beforeValue), auditSummary(log.afterValue)].join(" ").toLowerCase().includes(term),
    );
  }, [auditLogs, auditSearch]);

  async function loadPage() {
    setLoading(true);
    setMessage("Loading purchase orders...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      window.location.assign("/login");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    const nextRole = normalizeRole(profileData?.role);
    const nextUserName = profileData?.full_name || user.email || "TITAN User";
    setRole(nextRole);
    setUserName(nextUserName);
    setPoForm((current) => ({ ...current, requestedBy: current.requestedBy || nextUserName }));

    if (!roleCanRequestPurchaseOrders(nextRole)) {
      setMessage("Purchase Orders are for internal users only.");
      setLoading(false);
      return;
    }

    const nextYards = await loadInventoryYards(user.id, user.email || "");
    setYards(nextYards);
    const preferred = nextYards.find((yard) => yard.code === defaultInventoryYardCode) ?? nextYards[0];
    const yardId = preferred?.id || "";
    setSelectedYardId(yardId);
    await reloadData(yardId, nextYards);
    setMessage("");
    setLoading(false);
  }

  async function loadInventoryYards(nextUserId: string, email: string) {
    const { data, error } = await supabase
      .from("yards")
      .select("id, name, code")
      .in("code", inventoryYardCodes)
      .order("name");

    if (error) {
      setMessage(`Inventory yards failed: ${error.message}`);
      return [];
    }

    const allYards = (data || []).map((yard) => ({
      id: yard.id,
      name: yard.name || yard.code || "Inventory Yard",
      code: yard.code || "",
    }));

    if (email.trim().toLowerCase() === wadeInventoryAdminEmail) return allYards;

    const { data: assignments, error: assignmentError } = await supabase
      .from("inventory_user_yards")
      .select("yard_id")
      .eq("user_id", nextUserId);

    if (assignmentError) return allYards;
    const allowed = new Set((assignments || []).map((row) => row.yard_id));
    return allYards.filter((yard) => allowed.has(yard.id));
  }

  function applyYardScope<T extends { eq: (column: string, value: string) => T; or: (filters: string) => T }>(
    query: T,
    yardId = selectedYardId,
    yardList = yards,
  ) {
    if (!yardId) return query;
    const yard = yardList.find((candidate) => candidate.id === yardId);
    if (yard?.code === defaultInventoryYardCode) return query.or(`yard_id.eq.${yardId},yard_id.is.null`);
    return query.eq("yard_id", yardId);
  }

  async function reloadData(yardId = selectedYardId, yardList = yards) {
    await Promise.all([
      loadVendors(yardId, yardList),
      loadItems(yardId, yardList),
      loadOrders(yardId, yardList),
      loadLines(yardId, yardList),
      loadApprovals(),
      loadReceipts(),
      loadInvoices(),
      loadAuditLogs(),
    ]);
  }

  async function loadVendors(yardId = selectedYardId, yardList = yards) {
    let query = supabase
      .from("inventory_vendors")
      .select("*")
      .order("vendor_name");
    query = applyYardScope(query, yardId, yardList);
    const { data, error } = await query;
    if (error) {
      setMessage(`Vendors failed: ${error.message}`);
      return;
    }
    setVendors(
      (data || []).map((row) => ({
        id: row.id,
        vendorName: row.vendor_name || "",
        email: row.email || "",
        contactInfo: row.contact_info || row.contact_name || "",
        paymentTerms: row.payment_terms || row.terms || "",
        taxId: row.tax_id || "",
        active: row.active !== false,
      })),
    );
  }

  async function loadItems(yardId = selectedYardId, yardList = yards) {
    let query = supabase
      .from("inventory_items")
      .select("id, item_code, item_name, unit_price, qty_on_hand")
      .order("item_code");
    query = applyYardScope(query, yardId, yardList);
    const { data, error } = await query;
    if (error) {
      setMessage(`Inventory items failed: ${error.message}`);
      return;
    }
    setItems(
      (data || []).map((row) => ({
        id: row.id,
        itemCode: row.item_code || "",
        itemName: row.item_name || "",
        unitPrice: numberValue(row.unit_price),
        qtyOnHand: numberValue(row.qty_on_hand),
      })),
    );
  }

  async function loadOrders(yardId = selectedYardId, yardList = yards) {
    let query = supabase.from("purchase_orders").select("*").order("created_at", { ascending: false });
    query = applyYardScope(query, yardId, yardList);
    const { data, error } = await query;
    if (error) {
      setMessage(`Purchase orders failed: ${error.message}. Run supabase/titan_po_lifecycle.sql if the lifecycle columns are missing.`);
      return;
    }
    const mapped = (data || []).map((row) => ({
      id: row.id,
      poNumber: row.po_number || "",
      vendorId: row.vendor_id || "",
      vendorName: row.vendor_name || "",
      vendorEmail: row.vendor_email || "",
      orderDate: dateText(row.order_date),
      requestedBy: row.requested_by || "",
      requesterId: row.requester_id || "",
      department: row.department || "",
      budgetCode: row.budget_code || "",
      costCenter: row.cost_center || "",
      status: normalizePoStatus(row.status),
      notes: row.notes || "",
      totalAmount: numberValue(row.total_amount ?? row.total_value),
      submittedAt: row.submitted_at || "",
      approvedAt: row.approved_at || "",
      sentAt: row.sent_at || row.ordered_at || "",
      invoicedAt: row.invoiced_at || "",
      closedAt: row.closed_at || "",
      rejectionReason: row.rejection_reason || "",
      cancelledReason: row.cancelled_reason || "",
    }));
    setOrders(mapped);
    if (!selectedPoId && mapped.length) setSelectedPoId(mapped[0].id);
  }

  async function loadLines(yardId = selectedYardId, yardList = yards) {
    let query = supabase.from("purchase_order_lines").select("*").order("created_at");
    query = applyYardScope(query, yardId, yardList);
    const { data, error } = await query;
    if (error) {
      setMessage(`PO lines failed: ${error.message}`);
      return;
    }
    setLines(
      (data || []).map((row) => ({
        id: row.id,
        purchaseOrderId: row.purchase_order_id,
        itemId: row.item_id || "",
        itemCode: row.item_code || "",
        description: row.description || row.item_name || "",
        quantityOrdered: numberValue(row.quantity_ordered),
        quantityReceived: numberValue(row.quantity_received),
        quantityInvoiced: numberValue(row.quantity_invoiced),
        unitPrice: numberValue(row.unit_price ?? row.unit_cost),
        lineTotal: numberValue(row.line_total),
        glCode: row.gl_code || "",
      })),
    );
  }

  async function loadApprovals() {
    const { data, error } = await supabase.from("purchase_order_approvals").select("*").order("tier");
    if (error) return;
    setApprovals(
      (data || []).map((row) => ({
        id: row.id,
        poId: row.po_id,
        approverId: row.approver_id || "",
        approverRole: row.approver_role || "",
        tier: Number(row.tier || 0),
        status: row.status || "pending",
        comments: row.comments || "",
        timestamp: row.timestamp || "",
      })),
    );
  }

  async function loadReceipts() {
    const { data, error } = await supabase.from("purchase_order_receipts").select("*").order("received_at", { ascending: false });
    if (error) return;
    setReceiptCount((data || []).length);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInvoices() {
    const { data, error } = await supabase.from("purchase_order_invoices").select("*").order("created_at", { ascending: false });
    if (error) return;
    setInvoices(
      (data || []).map((row) => ({
        id: row.id,
        poId: row.po_id,
        vendorInvoiceNumber: row.vendor_invoice_number || "",
        amount: numberValue(row.amount),
        matchStatus: row.match_status || "pending",
        exceptionReason: row.exception_reason || "",
        reviewedAt: row.reviewed_at || "",
        createdAt: row.created_at || "",
      })),
    );
  }

  async function loadAuditLogs() {
    const { data, error } = await supabase
      .from("purchase_order_audit_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(250);
    if (error) return;
    setAuditLogs(
      (data || []).map((row) => ({
        id: row.id,
        entityType: row.entity_type || "",
        entityId: row.entity_id || "",
        action: row.action || "",
        userName: row.user_name || "",
        timestamp: row.timestamp || "",
        beforeValue: row.before_value,
        afterValue: row.after_value,
      })),
    );
  }

  async function handleYardChange(yardId: string) {
    setSelectedYardId(yardId);
    setSelectedPoId("");
    setMessage("Loading selected yard...");
    await reloadData(yardId);
    setMessage("");
  }

  async function lifecycleAction(action: string, payload: Record<string, unknown> = {}) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your login session expired. Sign in again.");

    const response = await fetch("/api/purchase-orders/lifecycle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, yardId: selectedYardId, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "PO action failed.");
    return result;
  }

  function editOrder(order: PurchaseOrder) {
    setSelectedPoId(order.id);
    setPoForm({
      poId: order.id,
      poNumber: order.poNumber,
      vendorId: order.vendorId,
      orderDate: order.orderDate,
      requestedBy: order.requestedBy,
      department: order.department,
      budgetCode: order.budgetCode,
      costCenter: order.costCenter,
      notes: order.notes,
    });
    setLineForm(emptyLineForm);
    setActiveTab("edit");
  }

  function startNewPo() {
    setSelectedPoId("");
    setPoForm({ ...emptyPoForm, requestedBy: userName });
    setLineForm(emptyLineForm);
    setActiveTab("edit");
  }

  async function savePo() {
    setSaving(true);
    setMessage("");
    try {
      const result = await lifecycleAction("save_po", {
        poId: poForm.poId || undefined,
        poNumber: poForm.poNumber || undefined,
        vendorId: poForm.vendorId,
        orderDate: poForm.orderDate,
        requestedBy: poForm.requestedBy,
        department: poForm.department,
        budgetCode: poForm.budgetCode,
        costCenter: poForm.costCenter,
        notes: poForm.notes,
      });
      const savedId = result.purchaseOrder?.id;
      await reloadData(selectedYardId);
      if (savedId) {
        setSelectedPoId(savedId);
        const saved = result.purchaseOrder;
        setPoForm((current) => ({ ...current, poId: savedId, poNumber: saved.po_number || current.poNumber }));
      }
      setMessage("Purchase order saved as Draft.");
    } catch (error) {
      setMessage(`PO save failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  }

  function selectLineItem(itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId);
    setLineForm({
      ...lineForm,
      itemId,
      itemCode: item?.itemCode || "",
      description: item?.itemName || "",
      unitPrice: String(item?.unitPrice ?? 0),
    });
  }

  async function saveLine() {
    const poId = poForm.poId || selectedPoId;
    if (!poId) {
      setMessage("Save the PO header before adding line items.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await lifecycleAction("save_line", {
        poId,
        itemId: lineForm.itemId,
        itemCode: lineForm.itemCode,
        description: lineForm.description,
        quantityOrdered: lineForm.quantityOrdered,
        unitPrice: lineForm.unitPrice,
        glCode: lineForm.glCode,
      });
      await reloadData(selectedYardId);
      setLineForm(emptyLineForm);
      setMessage("Line item added.");
    } catch (error) {
      setMessage(`Line save failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  }

  async function runPoAction(action: string, poId: string, success: string, extra: Record<string, unknown> = {}) {
    setSaving(true);
    setMessage("");
    try {
      await lifecycleAction(action, { poId, ...extra });
      await reloadData(selectedYardId);
      setMessage(success);
    } catch (error) {
      setMessage(`${success.replace(/\.$/, "")} failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  }

  async function approvalDecision(poId: string, decision: "approve" | "reject") {
    const comments = decision === "reject" ? window.prompt("Rejection reason:") : window.prompt("Optional approval comment:");
    if (decision === "reject" && !comments?.trim()) {
      setMessage("A rejection reason is required.");
      return;
    }
    await runPoAction("approval_decision", poId, decision === "approve" ? "PO approved." : "PO rejected and returned to Draft.", {
      decision,
      comments: comments || "",
    });
  }

  async function receiveLine(line: PurchaseOrderLine) {
    const quantity = receiveQuantities[line.id] || String(line.quantityOrdered - line.quantityReceived);
    await runPoAction("receive_line", line.purchaseOrderId, "Receipt recorded.", {
      lineId: line.id,
      quantityReceived: quantity,
      discrepancyNote: receiveNotes[line.id] || "",
    });
    setReceiveQuantities((current) => ({ ...current, [line.id]: "" }));
    setReceiveNotes((current) => ({ ...current, [line.id]: "" }));
  }

  async function createInvoice() {
    if (!invoiceForm.poId) {
      setMessage("Choose a fully received PO.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await lifecycleAction("create_invoice", invoiceForm);
      await reloadData(selectedYardId);
      setInvoiceForm(emptyInvoiceForm);
      setMessage("Invoice recorded and matched if it met tolerance.");
    } catch (error) {
      setMessage(`Invoice save failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  }

  async function overrideInvoice(invoice: Invoice) {
    const comments = window.prompt("Override reason for this invoice exception:");
    if (!comments?.trim()) {
      setMessage("Override reason is required.");
      return;
    }
    await runPoAction("override_invoice", invoice.poId, "Invoice exception overridden.", { invoiceId: invoice.id, comments });
  }

  function editVendor(vendor: Vendor) {
    setVendorForm({
      vendorId: vendor.id,
      vendorName: vendor.vendorName,
      email: vendor.email,
      contactInfo: vendor.contactInfo,
      paymentTerms: vendor.paymentTerms,
      taxId: vendor.taxId,
      active: vendor.active,
    });
    setActiveTab("vendors");
  }

  async function saveVendor() {
    setSaving(true);
    setMessage("");
    try {
      await lifecycleAction("save_vendor", vendorForm);
      await loadVendors(selectedYardId);
      setVendorForm(emptyVendorForm);
      setMessage("Vendor saved.");
    } catch (error) {
      setMessage(`Vendor save failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateVendor(vendor: Vendor) {
    if (!window.confirm(`Deactivate ${vendor.vendorName}? Existing POs will keep their vendor history.`)) return;
    await runPoAction("deactivate_vendor", "", "Vendor deactivated.", { vendorId: vendor.id });
    await loadVendors(selectedYardId);
  }

  function exportOrders() {
    downloadCsv(
      "titan-purchase-orders.csv",
      ["PO Number", "Status", "Vendor", "Department", "Cost Center", "Date", "Requested By", "Total", "Notes"],
      filteredOrders.map((order) => [
        order.poNumber,
        order.status,
        order.vendorName,
        order.department,
        order.costCenter,
        order.orderDate,
        order.requestedBy,
        order.totalAmount,
        order.notes,
      ]),
    );
  }

  if (!canUsePurchaseOrders && !loading) {
    return (
      <main className="module-shell">
        <section className="module-header">
          <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
            <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
            <div>
              <div className="brand-title">TITAN</div>
              <div className="brand-subtitle">Tubular Inventory Tracking & Asset Navigation</div>
            </div>
          </button>
        </section>
        <div className="modal-message">{message}</div>
      </main>
    );
  }

  return (
    <main className={`module-shell po-module po-lifecycle ${styles.scope}`}>
      <section className="module-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">Purchase Orders</div>
            <div className="brand-subtitle">Full PO lifecycle / {selectedYard?.name || "Loading yard"}</div>
          </div>
        </button>
        <div className="module-actions no-print">
          <select className="field" value={selectedYardId} onChange={(event) => handleYardChange(event.target.value)} disabled={loading || yards.length <= 1}>
            {yards.map((yard) => (
              <option key={yard.id} value={yard.id}>{yard.name}</option>
            ))}
          </select>
          <button className="button" onClick={() => (window.location.href = "/home")}>Home</button>
          <button className="button" onClick={loadPage} disabled={loading}>Refresh</button>
          <button className="button" onClick={exportOrders}>Export CSV</button>
          <button className="button primary" onClick={startNewPo}>New PO</button>
        </div>
      </section>

      {message && <div className="modal-message">{message}</div>}

      <section className="po-tab-bar no-print">
        {tabs.map((tab) => (
          <button key={tab.key} className={activeTab === tab.key ? "active" : ""} type="button" onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </section>

      <section className="module-metrics po-kpi-grid">
        <article className="metric-card"><strong>{dashboard.openCount}</strong><span>Open POs</span></article>
        <article className="metric-card"><strong>{dashboard.pendingApproval}</strong><span>Pending approval</span></article>
        <article className="metric-card"><strong>{formatPoMoney(dashboard.committed)}</strong><span>Committed spend</span></article>
        <article className="metric-card"><strong>{dashboard.invoiceExceptions}</strong><span>Invoice exceptions</span></article>
        <article className="metric-card"><strong>{dashboard.receiptCount}</strong><span>Receipt entries</span></article>
      </section>

      {activeTab === "dashboard" && (
        <section className="po-two-column">
          <article className="ticket-card">
            <h3>Lifecycle Snapshot</h3>
            <div className="po-status-flow">
              {poStatuses.filter((status) => !["Rejected", "Cancelled"].includes(status)).map((status) => (
                <div key={status}>
                  <strong>{orders.filter((order) => normalizePoStatus(order.status) === status).length}</strong>
                  <span>{status}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="ticket-card">
            <h3>Recent Activity</h3>
            <div className="po-list-mini">
              {auditLogs.slice(0, 8).map((log) => (
                <button key={log.id} type="button" onClick={() => setActiveTab("audit")}>
                  <strong>{log.action.replaceAll("_", " ")}</strong>
                  <span>{log.userName || "System"} / {new Date(log.timestamp).toLocaleString()}</span>
                </button>
              ))}
              {auditLogs.length === 0 && <p className="muted-text">No audit activity yet.</p>}
            </div>
          </article>
        </section>
      )}

      {activeTab === "list" && (
        <section className="ticket-card">
          <div className="detail-title-row">
            <div>
              <h3>PO List View</h3>
              <p>Filterable source of truth for all purchase orders.</p>
            </div>
            <button className="button primary" type="button" onClick={startNewPo}>Create PO</button>
          </div>
          <FilterBar vendors={vendors} departments={departments} filters={filters} setFilters={setFilters} />
          <div className="po-table-wrap">
            <table className="po-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Status</th>
                  <th>Vendor</th>
                  <th>Department</th>
                  <th>Cost Center</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.poNumber}</strong><br /><span>{order.requestedBy || "-"}</span></td>
                    <td><span className={statusClass(order.status)}>{order.status}</span></td>
                    <td>{order.vendorName || "-"}</td>
                    <td>{order.department || "-"}</td>
                    <td>{order.costCenter || order.budgetCode || "-"}</td>
                    <td>{order.orderDate}</td>
                    <td>{formatPoMoney(order.totalAmount)}</td>
                    <td className="po-row-actions">
                      <button className="mini-button" onClick={() => editOrder(order)}>Open</button>
                      {normalizePoStatus(order.status) === "Draft" && <button className="mini-button" onClick={() => runPoAction("submit_po", order.id, "PO submitted.")}>Submit</button>}
                      {normalizePoStatus(order.status) === "Approved" && canManagePo && <button className="mini-button" onClick={() => runPoAction("send_vendor", order.id, "PO sent to vendor.")}>Send</button>}
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && <tr><td colSpan={8}>No purchase orders match the current filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "edit" && (
        <section className="po-two-column wide-left">
          <article className="ticket-card">
            <div className="detail-title-row">
              <div>
                <h3>{poForm.poId ? "Edit PO Draft" : "Create PO Draft"}</h3>
                <p>{poForm.poNumber || "PO number is assigned when saved."}</p>
              </div>
              <button className="button" type="button" onClick={startNewPo}>Blank PO</button>
            </div>
            <div className="form-grid">
              <label>PO Number<input value={poForm.poNumber} placeholder="Auto-generated" onChange={(event) => setPoForm({ ...poForm, poNumber: event.target.value })} /></label>
              <label>Vendor
                <select value={poForm.vendorId} onChange={(event) => setPoForm({ ...poForm, vendorId: event.target.value })}>
                  <option value="">Select vendor</option>
                  {vendors.filter((vendor) => vendor.active).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}
                </select>
              </label>
              <label>Order Date<input type="date" value={poForm.orderDate} onChange={(event) => setPoForm({ ...poForm, orderDate: event.target.value })} /></label>
              <label>Requester<input value={poForm.requestedBy} onChange={(event) => setPoForm({ ...poForm, requestedBy: event.target.value })} /></label>
              <label>Department<input value={poForm.department} placeholder="Inventory, DTI, Hardband..." onChange={(event) => setPoForm({ ...poForm, department: event.target.value })} /></label>
              <label>Budget Code<input value={poForm.budgetCode} onChange={(event) => setPoForm({ ...poForm, budgetCode: event.target.value })} /></label>
              <label>Cost Center<input value={poForm.costCenter} onChange={(event) => setPoForm({ ...poForm, costCenter: event.target.value })} /></label>
              <label className="full">Notes<textarea value={poForm.notes} onChange={(event) => setPoForm({ ...poForm, notes: event.target.value })} /></label>
            </div>
            <div className="slide-actions">
              <button className="button primary" onClick={savePo} disabled={saving}>{saving ? "Saving..." : "Save Draft"}</button>
              {poForm.poId && <button className="button" onClick={() => runPoAction("submit_po", poForm.poId, "PO submitted.")}>Submit for Approval</button>}
            </div>
          </article>

          <article className="ticket-card">
            <h3>Line Items</h3>
            <div className="form-grid compact">
              <label className="full">Inventory Item
                <select value={lineForm.itemId} onChange={(event) => selectLineItem(event.target.value)}>
                  <option value="">Manual line</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.itemCode} - {item.itemName}</option>)}
                </select>
              </label>
              <label>Item ID<input value={lineForm.itemCode} onChange={(event) => setLineForm({ ...lineForm, itemCode: event.target.value })} /></label>
              <label>Description<input value={lineForm.description} onChange={(event) => setLineForm({ ...lineForm, description: event.target.value })} /></label>
              <label>Qty<input type="number" value={lineForm.quantityOrdered} onChange={(event) => setLineForm({ ...lineForm, quantityOrdered: event.target.value })} /></label>
              <label>Unit Price<input type="number" value={lineForm.unitPrice} onChange={(event) => setLineForm({ ...lineForm, unitPrice: event.target.value })} /></label>
              <label>GL Code<input value={lineForm.glCode} onChange={(event) => setLineForm({ ...lineForm, glCode: event.target.value })} /></label>
            </div>
            <button className="button primary" onClick={saveLine} disabled={saving || !(poForm.poId || selectedPoId)}>Add Line</button>
            <LineItemTable lines={selectedLines} />
          </article>
        </section>
      )}

      {activeTab === "approvals" && (
        <section className="ticket-card">
          <h3>Approval Queue</h3>
          <p className="muted-text">Only the current pending tier is actionable.</p>
          <div className="po-table-wrap">
            <table className="po-table">
              <thead><tr><th>PO</th><th>Tier</th><th>Vendor</th><th>Amount</th><th>Requester</th><th>Action</th></tr></thead>
              <tbody>
                {currentApprovalRows.map(({ order, approval }) => (
                  <tr key={approval.id}>
                    <td><strong>{order.poNumber}</strong><br /><span>{order.department || "-"}</span></td>
                    <td>{approval.approverRole || "manager"} / tier {approval.tier}</td>
                    <td>{order.vendorName || "-"}</td>
                    <td>{formatPoMoney(order.totalAmount)}</td>
                    <td>{order.requestedBy || "-"}</td>
                    <td className="po-row-actions">
                      <button className="mini-button" onClick={() => approvalDecision(order.id, "approve")}>Approve</button>
                      <button className="mini-button danger" onClick={() => approvalDecision(order.id, "reject")}>Reject</button>
                    </td>
                  </tr>
                ))}
                {currentApprovalRows.length === 0 && <tr><td colSpan={6}>No POs are waiting on your approval tier.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "receiving" && (
        <section className="ticket-card">
          <h3>Receiving Screen</h3>
          <p className="muted-text">Receive at the line level. Partial receipts stay open and are fully auditable.</p>
          {orders.filter((order) => ["Sent to Vendor", "Partially Received"].includes(normalizePoStatus(order.status))).map((order) => (
            <article className="po-receive-card" key={order.id}>
              <div className="detail-title-row">
                <div><h4>{order.poNumber}</h4><p>{order.vendorName || "-"} / {formatPoMoney(order.totalAmount)}</p></div>
                <span className={statusClass(order.status)}>{order.status}</span>
              </div>
              <div className="po-table-wrap">
                <table className="po-table">
                  <thead><tr><th>Line</th><th>Ordered</th><th>Received</th><th>Receive Now</th><th>Discrepancy Note</th><th>Action</th></tr></thead>
                  <tbody>
                    {(orderLinesByPo.get(order.id) ?? []).map((line) => (
                      <tr key={line.id}>
                        <td><strong>{line.itemCode || "-"}</strong><br />{line.description}</td>
                        <td>{line.quantityOrdered.toLocaleString()}</td>
                        <td>{line.quantityReceived.toLocaleString()}</td>
                        <td><input className="field compact-field" value={receiveQuantities[line.id] ?? String(Math.max(0, line.quantityOrdered - line.quantityReceived))} onChange={(event) => setReceiveQuantities({ ...receiveQuantities, [line.id]: event.target.value })} /></td>
                        <td><input className="field" value={receiveNotes[line.id] || ""} onChange={(event) => setReceiveNotes({ ...receiveNotes, [line.id]: event.target.value })} placeholder="Optional" /></td>
                        <td><button className="mini-button" onClick={() => receiveLine(line)} disabled={saving || !canReceivePo || line.quantityReceived >= line.quantityOrdered}>Receive</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      )}

      {activeTab === "invoices" && (
        <section className="po-two-column wide-left">
          <article className="ticket-card">
            <h3>Invoice Matching / Exceptions</h3>
            <div className="form-grid">
              <label>PO
                <select value={invoiceForm.poId} onChange={(event) => setInvoiceForm({ ...invoiceForm, poId: event.target.value })}>
                  <option value="">Select fully received PO</option>
                  {orders.filter((order) => ["Fully Received", "Invoiced"].includes(normalizePoStatus(order.status))).map((order) => (
                    <option key={order.id} value={order.id}>{order.poNumber} - {order.vendorName} - {formatPoMoney(order.totalAmount)}</option>
                  ))}
                </select>
              </label>
              <label>Vendor Invoice #<input value={invoiceForm.vendorInvoiceNumber} onChange={(event) => setInvoiceForm({ ...invoiceForm, vendorInvoiceNumber: event.target.value })} /></label>
              <label>Invoice Amount<input type="number" value={invoiceForm.amount} onChange={(event) => setInvoiceForm({ ...invoiceForm, amount: event.target.value })} /></label>
              <label>Tolerance %<input type="number" value={invoiceForm.tolerancePercent} onChange={(event) => setInvoiceForm({ ...invoiceForm, tolerancePercent: event.target.value })} /></label>
            </div>
            <button className="button primary" onClick={createInvoice} disabled={saving || !canMatchPo}>Record Invoice</button>
            <InvoicePreview invoiceForm={invoiceForm} orders={orders} lines={lines} />
          </article>
          <article className="ticket-card">
            <h3>Exceptions Queue</h3>
            <div className="po-list-mini">
              {invoices.filter((invoice) => invoice.matchStatus === "exception").map((invoice) => {
                const order = orders.find((item) => item.id === invoice.poId);
                return (
                  <button key={invoice.id} type="button" onClick={() => setSelectedPoId(invoice.poId)}>
                    <strong>{invoice.vendorInvoiceNumber} / {order?.poNumber || "PO"}</strong>
                    <span>{formatPoMoney(invoice.amount)} / {invoice.exceptionReason || "Review required"}</span>
                    {canMatchPo && <em onClick={(event) => { event.stopPropagation(); overrideInvoice(invoice); }}>Override</em>}
                  </button>
                );
              })}
              {invoices.filter((invoice) => invoice.matchStatus === "exception").length === 0 && <p className="muted-text">No invoice exceptions.</p>}
            </div>
          </article>
        </section>
      )}

      {activeTab === "vendors" && (
        <section className="po-two-column wide-left">
          <article className="ticket-card">
            <h3>Vendor Management</h3>
            <div className="form-grid">
              <label>Vendor Name<input value={vendorForm.vendorName} onChange={(event) => setVendorForm({ ...vendorForm, vendorName: event.target.value })} /></label>
              <label>Email<input value={vendorForm.email} onChange={(event) => setVendorForm({ ...vendorForm, email: event.target.value })} /></label>
              <label>Contact Info<input value={vendorForm.contactInfo} onChange={(event) => setVendorForm({ ...vendorForm, contactInfo: event.target.value })} /></label>
              <label>Payment Terms<input value={vendorForm.paymentTerms} onChange={(event) => setVendorForm({ ...vendorForm, paymentTerms: event.target.value })} /></label>
              <label>Tax ID<input value={vendorForm.taxId} onChange={(event) => setVendorForm({ ...vendorForm, taxId: event.target.value })} /></label>
              <label className="checkbox-line"><input type="checkbox" checked={vendorForm.active} onChange={(event) => setVendorForm({ ...vendorForm, active: event.target.checked })} /> Active vendor</label>
            </div>
            <div className="slide-actions">
              <button className="button primary" onClick={saveVendor} disabled={saving || !canManagePo}>Save Vendor</button>
              <button className="button" onClick={() => setVendorForm(emptyVendorForm)}>Blank Vendor</button>
            </div>
          </article>
          <article className="ticket-card">
            <h3>Vendor List</h3>
            <div className="po-table-wrap">
              <table className="po-table">
                <thead><tr><th>Name</th><th>Email</th><th>Terms</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.id}>
                      <td>{vendor.vendorName}</td>
                      <td>{vendor.email || "-"}</td>
                      <td>{vendor.paymentTerms || "-"}</td>
                      <td>{vendor.active ? "Active" : "Inactive"}</td>
                      <td className="po-row-actions">
                        <button className="mini-button" onClick={() => editVendor(vendor)}>Edit</button>
                        {vendor.active && <button className="mini-button danger" onClick={() => deactivateVendor(vendor)} disabled={!canManagePo}>Deactivate</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {activeTab === "budget" && (
        <section className="ticket-card">
          <h3>Budget Dashboard</h3>
          <p className="muted-text">Committed spend is approved/sent/received PO value. Actual is invoiced/closed PO value.</p>
          <div className="po-table-wrap">
            <table className="po-table">
              <thead><tr><th>Department</th><th>Cost Center</th><th>POs</th><th>Committed</th><th>Actual</th><th>Open Exposure</th></tr></thead>
              <tbody>
                {budgetRows.map((row) => (
                  <tr key={`${row.department}-${row.costCenter}`}>
                    <td>{row.department}</td>
                    <td>{row.costCenter}</td>
                    <td>{row.count}</td>
                    <td>{formatPoMoney(row.committed)}</td>
                    <td>{formatPoMoney(row.actual)}</td>
                    <td>{formatPoMoney(row.open)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "audit" && (
        <section className="ticket-card">
          <div className="detail-title-row">
            <div><h3>Audit Trail Viewer</h3><p>Every lifecycle action is logged with before/after values.</p></div>
            <input className="field" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Search user, action, values..." />
          </div>
          <div className="po-table-wrap">
            <table className="po-table">
              <thead><tr><th>When</th><th>User</th><th>Entity</th><th>Action</th><th>Before</th><th>After</th></tr></thead>
              <tbody>
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                    <td>{log.userName || "System"}</td>
                    <td>{log.entityType}</td>
                    <td>{log.action.replaceAll("_", " ")}</td>
                    <td className="audit-cell">{auditSummary(log.beforeValue)}</td>
                    <td className="audit-cell">{auditSummary(log.afterValue)}</td>
                  </tr>
                ))}
                {filteredAuditLogs.length === 0 && <tr><td colSpan={6}>No audit entries found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function FilterBar({
  vendors,
  departments,
  filters,
  setFilters,
}: {
  vendors: Vendor[];
  departments: string[];
  filters: { status: string; vendor: string; department: string; dateFrom: string; dateTo: string; search: string };
  setFilters: (filters: { status: string; vendor: string; department: string; dateFrom: string; dateTo: string; search: string }) => void;
}) {
  return (
    <div className="po-filter-grid">
      <input className="field" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search PO, vendor, requester..." />
      <select className="field" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
        <option value="all">All Statuses</option>
        {poStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <select className="field" value={filters.vendor} onChange={(event) => setFilters({ ...filters, vendor: event.target.value })}>
        <option value="all">All Vendors</option>
        {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}
      </select>
      <select className="field" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}>
        <option value="all">All Departments</option>
        {departments.map((department) => <option key={department} value={department}>{department}</option>)}
      </select>
      <input className="field" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
      <input className="field" type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
    </div>
  );
}

function LineItemTable({ lines }: { lines: PurchaseOrderLine[] }) {
  return (
    <div className="po-table-wrap compact-table">
      <table className="po-table">
        <thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th><th>GL</th></tr></thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.itemCode || "-"}</td>
              <td>{line.description}</td>
              <td>{line.quantityOrdered.toLocaleString()}</td>
              <td>{formatPoMoney(line.unitPrice)}</td>
              <td>{formatPoMoney(line.lineTotal)}</td>
              <td>{line.glCode || "-"}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={6}>No line items yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function InvoicePreview({ invoiceForm, orders, lines }: { invoiceForm: InvoiceForm; orders: PurchaseOrder[]; lines: PurchaseOrderLine[] }) {
  const order = orders.find((item) => item.id === invoiceForm.poId);
  if (!order) return null;
  const orderLines = lines.filter((line) => line.purchaseOrderId === order.id);
  const orderedQuantity = orderLines.reduce((sum, line) => sum + line.quantityOrdered, 0);
  const receivedQuantity = orderLines.reduce((sum, line) => sum + line.quantityReceived, 0);
  const match = evaluateInvoiceMatch({
    poAmount: order.totalAmount,
    invoiceAmount: numberValue(invoiceForm.amount),
    orderedQuantity,
    receivedQuantity,
    tolerancePercent: numberValue(invoiceForm.tolerancePercent || 5),
  });

  return (
    <div className={`invoice-preview ${match.status}`}>
      <strong>Match Preview: {match.status}</strong>
      <span>Variance {match.variancePercent.toFixed(1)}% / Received {receivedQuantity.toLocaleString()} of {orderedQuantity.toLocaleString()}</span>
      {match.reasons.map((reason) => <small key={reason}>{reason}</small>)}
    </div>
  );
}
