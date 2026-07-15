"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabase } from "../../lib/supabase";
import {
  canCreate,
  canDelete,
  canEdit,
  canView,
  getDefaultPermissionsForRole,
  moduleKeysFromPermissionMap,
  normalizeRole as normalizePermissionRole,
  type ModuleKey,
  type PermissionMap,
} from "../../lib/modulePermissions";

type Role = "admin" | "employee" | "customer" | "operator" | "sales" | string;

type InventoryYard = {
  id: string;
  name: string;
  code: string;
};

type Vendor = {
  id: string;
  vendorName: string;
  vendorCode: string;
  vendorType: string;
  contactName: string;
  phone: string;
  email: string;
  terms: string;
  active: boolean;
};

type InventoryItem = {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  location: string;
  vendorId: string;
  vendorName: string;
  qtyOnHand: number;
  minQuantity: number;
  maxQuantity: number;
  unitPrice: number;
  barcode: string;
  uom: string;
  active: boolean;
  lowStock: boolean;
  photoUrl: string;
};

type InventoryTransaction = {
  id: string;
  itemCode: string;
  transactionDate: string;
  transactionType: string;
  quantity: number;
  referenceType: string;
  referenceNumber: string;
  enteredBy: string;
  notes: string;
  quantityDirection: string;
};

type IssueTicket = {
  id: string;
  ticketNumber: string;
  issueDate: string;
  issuedTo: string;
  department: string;
  pickedBy: string;
  unitTruck: string;
  jobNumber: string;
  totalValue: number;
  status: string;
  notes: string;
};

type IssueTicketLine = {
  id: string;
  issueTicketId: string;
  ticketNumber: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  department: string;
  qtyIssued: number;
  unitCost: number;
  lineValue: number;
  unitTruck: string;
  pickedBy: string;
};

type IssueCartLine = {
  itemId: string;
  itemCode: string;
  itemName: string;
  barcode: string;
  location: string;
  quantity: number;
  qtyOnHand: number;
  minQuantity: number;
  unitPrice: number;
  lineValue: number;
};

type InventoryOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  requestedBy: string;
  department: string;
  unitTruck: string;
  jobNumber: string;
  totalValue: number;
  status: string;
  notes: string;
};

type InventoryOrderLine = {
  id: string;
  orderId: string;
  orderNumber: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  qtyRequested: number;
  qtyFulfilled: number;
  unitCost: number;
  lineValue: number;
};

type PurchaseOrderSummary = {
  id: string;
  poNumber: string;
  vendorName: string;
  orderDate: string;
  requestedBy: string;
  totalValue: number;
  status: string;
};

type PurchaseOrderLineSummary = {
  id: string;
  purchaseOrderId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  lineTotal: number;
};

type ItemForm = {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  location: string;
  vendorId: string;
  vendorName: string;
  qtyOnHand: string;
  minQuantity: string;
  maxQuantity: string;
  unitPrice: string;
  barcode: string;
  uom: string;
  active: boolean;
  photoUrl: string;
};

type IssueForm = {
  issuedTo: string;
  department: string;
  pickedBy: string;
  unitTruck: string;
  jobNumber: string;
  notes: string;
};

type OrderForm = {
  requestedBy: string;
  department: string;
  unitTruck: string;
  jobNumber: string;
  notes: string;
  emailTo: string;
};

type InventoryModuleView = "dashboard" | "orders" | "counter" | "approvals" | "reorder" | "items" | "tickets" | "documents" | "vendors";
type DashboardPeriod = "week" | "lastWeek" | "month" | "quarter" | "year" | "all";

const inventoryModuleViews: InventoryModuleView[] = [
  "dashboard",
  "orders",
  "counter",
  "approvals",
  "reorder",
  "items",
  "tickets",
  "documents",
  "vendors",
];

type VendorForm = {
  id: string;
  vendorName: string;
  vendorCode: string;
  vendorType: string;
  contactName: string;
  phone: string;
  email: string;
  terms: string;
  active: boolean;
};

type ReceiveForm = {
  itemId: string;
  quantity: string;
  unitPrice: string;
  referenceNumber: string;
  receivedBy: string;
  notes: string;
};

type PriceForm = {
  itemId: string;
  unitPrice: string;
  notes: string;
};

const emptyItemForm: ItemForm = {
  id: "",
  itemCode: "",
  itemName: "",
  category: "",
  location: "",
  vendorId: "",
  vendorName: "",
  qtyOnHand: "0",
  minQuantity: "0",
  maxQuantity: "0",
  unitPrice: "0",
  barcode: "",
  uom: "Each",
  active: true,
  photoUrl: "",
};

const emptyIssueForm: IssueForm = {
  issuedTo: "",
  department: "",
  pickedBy: "",
  unitTruck: "",
  jobNumber: "",
  notes: "",
};

const emptyOrderForm: OrderForm = {
  requestedBy: "",
  department: "",
  unitTruck: "",
  jobNumber: "",
  notes: "",
  emailTo: "",
};

const inventoryFullRoles = ["admin", "inventory_specialist", "inventory_manager"];
const inventoryOrderRoles = [
  "admin",
  "inventory_specialist",
  "inventory_manager",
  "service_line_manager",
  "dti_superintendent",
  "dti_lead",
  "level_2_inspector",
  "hardband_lead",
  "cdt_lead",
  "employee",
];
const inventoryRoles = inventoryOrderRoles;
const wadeInventoryAdminEmail = "wade@pathfinderinspections.com";
const defaultInventoryYardCode = "PIFS";
const inventoryYardCodes = ["PIFS", "GILLETTE", "CASPER", "DICKINSON"];
const inventoryYardScopedTablesEnabled = true;
const dashboardPeriodOptions: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "week", label: "This Week" },
  { value: "lastWeek", label: "Last Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Records" },
];

const emptyVendorForm: VendorForm = {
  id: "",
  vendorName: "",
  vendorCode: "",
  vendorType: "",
  contactName: "",
  phone: "",
  email: "",
  terms: "",
  active: true,
};

const emptyReceiveForm: ReceiveForm = {
  itemId: "",
  quantity: "1",
  unitPrice: "",
  referenceNumber: "",
  receivedBy: "",
  notes: "",
};

const emptyPriceForm: PriceForm = {
  itemId: "",
  unitPrice: "",
  notes: "",
};

function normalizeRole(role: unknown): Role {
  return normalizePermissionRole(role);
}

function hasInventoryAccess(role: Role, moduleKeys: ModuleKey[], permissions: PermissionMap | null) {
  if (role === "customer") return false;
  if (inventoryRoles.includes(role)) return true;
  if (moduleKeys.includes("inventory") || moduleKeys.includes("purchase_orders")) return true;

  return (
    canView(permissions, "consumable_inventory") ||
    canCreate(permissions, "consumable_inventory") ||
    canView(permissions, "issue_tickets") ||
    canCreate(permissions, "issue_tickets") ||
    canView(permissions, "purchase_orders") ||
    canCreate(permissions, "purchase_orders")
  );
}

function hasInventoryManagementAccess(role: Role, permissions: PermissionMap | null) {
  if (inventoryFullRoles.includes(role)) return true;

  return (
    canCreate(permissions, "consumable_inventory") ||
    canEdit(permissions, "consumable_inventory") ||
    canDelete(permissions, "consumable_inventory") ||
    canCreate(permissions, "purchase_orders") ||
    canEdit(permissions, "purchase_orders") ||
    canDelete(permissions, "purchase_orders")
  );
}

function hasInventoryOrderAccess(role: Role, permissions: PermissionMap | null) {
  if (inventoryOrderRoles.includes(role)) return true;

  return (
    canCreate(permissions, "consumable_inventory") ||
    canCreate(permissions, "issue_tickets") ||
    canView(permissions, "consumable_inventory")
  );
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function normalizeLookupText(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "");
}

function inventoryItemMatchesTerm(item: InventoryItem, rawTerm: string) {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return true;

  const normalized = normalizeLookupText(term);
  const values = [
    item.itemCode,
    item.itemName,
    item.category,
    item.location,
    item.vendorName,
    item.barcode,
  ];

  return (
    values.some((value) => String(value ?? "").toLowerCase().includes(term)) ||
    values.some((value) => normalizeLookupText(value).includes(normalized))
  );
}

function inventoryItemSearchRank(item: InventoryItem, rawTerm: string) {
  const term = rawTerm.trim().toLowerCase();
  const normalized = normalizeLookupText(term);
  const barcode = String(item.barcode ?? "").toLowerCase();
  const code = String(item.itemCode ?? "").toLowerCase();
  const name = String(item.itemName ?? "").toLowerCase();

  if (barcode === term || normalizeLookupText(item.barcode) === normalized) return 0;
  if (code === term || normalizeLookupText(item.itemCode) === normalized) return 1;
  if (name === term) return 2;
  if (name.startsWith(term)) return 3;
  if (barcode.startsWith(term) || code.startsWith(term)) return 4;
  return 5;
}

function numberValue(value: string) {
  const parsed = Number(String(value || "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function chunkArray<T>(values: T[], chunkSize = 100) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function todayStamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function dateOnly(value: string) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayStart(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getDashboardPeriodRange(period: DashboardPeriod) {
  if (period === "all") {
    return { start: new Date(0), end: new Date(8640000000000000) };
  }

  const today = localDayStart();
  const end = new Date(today);
  end.setDate(end.getDate() + 1);

  if (period === "lastWeek") {
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay() - 7);
    const lastWeekEnd = new Date(start);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
    return { start, end: lastWeekEnd };
  }

  const start = new Date(today);
  if (period === "week") {
    start.setDate(start.getDate() - start.getDay());
  } else if (period === "month") {
    start.setDate(1);
  } else if (period === "quarter") {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  } else {
    start.setMonth(0, 1);
  }

  return { start, end };
}

function dateInRange(value: string, start: Date, end: Date) {
  const date = dateOnly(value);
  return Boolean(date && date >= start && date < end);
}

function downloadCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "");
          return text.includes(",") || text.includes('"') || text.includes("\n")
            ? `"${text.replace(/"/g, '""')}"`
            : text;
        })
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function InventoryModulePage() {
  const [role, setRole] = useState<Role>("customer");
  const [moduleKeys, setModuleKeys] = useState<ModuleKey[]>([]);
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [inventoryYards, setInventoryYards] = useState<InventoryYard[]>([]);
  const [selectedInventoryYardId, setSelectedInventoryYardId] = useState("");
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [tickets, setTickets] = useState<IssueTicket[]>([]);
  const [ticketLines, setTicketLines] = useState<IssueTicketLine[]>([]);
  const [orders, setOrders] = useState<InventoryOrder[]>([]);
  const [orderLines, setOrderLines] = useState<InventoryOrderLine[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [purchaseOrderLines, setPurchaseOrderLines] = useState<PurchaseOrderLineSummary[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [activeView, setActiveView] = useState<InventoryModuleView>("dashboard");
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>("week");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [dashboardDepartment, setDashboardDepartment] = useState("all");
  const [dashboardCategory, setDashboardCategory] = useState("all");
  const [dashboardVendor, setDashboardVendor] = useState("all");
  const [storeSearch, setStoreSearch] = useState("");
  const [storeCategory, setStoreCategory] = useState("all");
  const [storeQuantities, setStoreQuantities] = useState<Record<string, string>>({});
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [vendorForm, setVendorForm] = useState<VendorForm>(emptyVendorForm);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>(emptyReceiveForm);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceForm, setPriceForm] = useState<PriceForm>(emptyPriceForm);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState<IssueForm>(emptyIssueForm);
  const [scanInput, setScanInput] = useState("");
  const [issueCart, setIssueCart] = useState<IssueCartLine[]>([]);
  const [orderCart, setOrderCart] = useState<IssueCartLine[]>([]);
  const [orderSearchOpen, setOrderSearchOpen] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrderForm);
  const [expandedTicketId, setExpandedTicketId] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [expandedPoId, setExpandedPoId] = useState("");
  const [itemPhotoDraft, setItemPhotoDraft] = useState("");
  const [emailingTicketId, setEmailingTicketId] = useState("");
  const [emailingOrderId, setEmailingOrderId] = useState("");
  const [orderFulfillmentDrafts, setOrderFulfillmentDrafts] = useState<Record<string, string>>({});
  const [cameraScanMessage, setCameraScanMessage] = useState("");
  const [cameraScanning, setCameraScanning] = useState(false);
  const scanFieldRef = useRef<HTMLInputElement | null>(null);
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const itemPhotoUploadRef = useRef<HTMLInputElement | null>(null);
  const itemPhotoCameraRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const barcodeControlsRef = useRef<{ stop: () => void } | null>(null);

  function activateInventoryView(view: InventoryModuleView, syncUrl = true) {
    setActiveView(view);

    if (!syncUrl || typeof window === "undefined") return;

    const nextUrl = new URL(window.location.href);
    if (view === "dashboard") {
      nextUrl.searchParams.delete("view");
    } else {
      nextUrl.searchParams.set("view", view);
    }
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    window.dispatchEvent(new Event("titan-route-change"));
  }

  const canUseInventory = hasInventoryAccess(role, moduleKeys, permissions);
  const canManageInventory = hasInventoryManagementAccess(role, permissions);
  const canPlaceInventoryOrders = hasInventoryOrderAccess(role, permissions);
  const selectedItem = items.find((item) => item.id === selectedItemId) || null;
  const selectedInventoryYard = inventoryYards.find((yard) => yard.id === selectedInventoryYardId) || null;

  function applyInventoryYardScope<T extends { eq: (column: string, value: string) => T; or: (filters: string) => T }>(
    query: T,
    yardId = selectedInventoryYardId,
    yardList = inventoryYards,
  ) {
    if (!inventoryYardScopedTablesEnabled || !yardId) return query;
    const yard = yardList.find((candidate) => candidate.id === yardId);
    if (yard?.code === defaultInventoryYardCode) {
      return query.or(`yard_id.eq.${yardId},yard_id.is.null`);
    }
    return query.eq("yard_id", yardId);
  }

  function renderProductPhoto(item: InventoryItem, className = "ci-product-photo") {
    if (item.photoUrl) {
      return <img className={`${className} ci-product-img`} src={item.photoUrl} alt={item.itemName || item.itemCode} />;
    }

    return <div className={`${className} generated-product-tile`}>{productInitials(item)}</div>;
  }

  useEffect(() => {
    if (!issueOpen) return;
    const timer = window.setTimeout(() => scanFieldRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [issueOpen, issueCart.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyViewFromUrl = () => {
      const requestedView = new URLSearchParams(window.location.search).get("view") as InventoryModuleView | null;
      if (requestedView && inventoryModuleViews.includes(requestedView)) {
        setActiveView(requestedView);
      }
    };

    applyViewFromUrl();
    window.addEventListener("popstate", applyViewFromUrl);

    return () => window.removeEventListener("popstate", applyViewFromUrl);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(),
    [items],
  );
  const locations = useMemo(
    () => Array.from(new Set(items.map((item) => item.location).filter(Boolean))).sort(),
    [items],
  );
  const dashboardDepartments = useMemo(
    () => Array.from(new Set(tickets.map((ticket) => ticket.department).filter(Boolean))).sort(),
    [tickets],
  );
  const dashboardVendors = useMemo(
    () => Array.from(new Set(items.map((item) => item.vendorName).filter(Boolean))).sort(),
    [items],
  );
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const itemByCode = useMemo(() => new Map(items.map((item) => [item.itemCode, item])), [items]);
  const purchaseOrderLookup = useMemo(
    () => new Map(purchaseOrders.map((order) => [order.id, order])),
    [purchaseOrders],
  );

  const filteredItems = useMemo(() => {
    const term = search.trim();
    return items.filter((item) => {
      const matchesSearch = !term || inventoryItemMatchesTerm(item, term);
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchesLocation = locationFilter === "all" || item.location === locationFilter;
      const matchesVendor = vendorFilter === "all" || item.vendorName === vendorFilter;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "low" && (item.lowStock || item.qtyOnHand <= item.minQuantity)) ||
        (stockFilter === "active" && item.active) ||
        (stockFilter === "inactive" && !item.active);
      return matchesSearch && matchesCategory && matchesLocation && matchesVendor && matchesStock;
    });
  }, [items, search, categoryFilter, locationFilter, vendorFilter, stockFilter]);

  const orderSearchMatches = useMemo(() => {
    const term = scanInput.trim();
    if (!term || activeView !== "orders") return [];

    return items
      .filter((item) => {
        if (!item.active) return false;
        return inventoryItemMatchesTerm(item, term);
      })
      .sort((left, right) => {
        const leftScore = inventoryItemSearchRank(left, term);
        const rightScore = inventoryItemSearchRank(right, term);

        if (leftScore !== rightScore) return leftScore - rightScore;
        return left.itemName.localeCompare(right.itemName);
      })
      .slice(0, 12);
  }, [activeView, items, scanInput]);

  const storeItems = useMemo(() => {
    const term = storeSearch.trim();
    return items
      .filter((item) => item.active)
      .filter((item) => (storeCategory === "all" ? true : item.category === storeCategory))
      .filter((item) => !term || inventoryItemMatchesTerm(item, term))
      .sort((left, right) => {
        const leftLow = left.lowStock || left.qtyOnHand <= left.minQuantity ? 0 : 1;
        const rightLow = right.lowStock || right.qtyOnHand <= right.minQuantity ? 0 : 1;
        if (leftLow !== rightLow) return leftLow - rightLow;
        return left.itemName.localeCompare(right.itemName);
      });
  }, [items, storeCategory, storeSearch]);

  const itemTransactions = useMemo(() => {
    if (!selectedItem) return transactions.slice(0, 25);
    return transactions.filter((transaction) => transaction.itemCode === selectedItem.itemCode).slice(0, 25);
  }, [selectedItem, transactions]);

  const totalValue = useMemo(
    () => items.reduce((sum, item) => sum + item.qtyOnHand * item.unitPrice, 0),
    [items],
  );
  const lowStockCount = useMemo(
    () => items.filter((item) => item.lowStock || item.qtyOnHand <= item.minQuantity).length,
    [items],
  );
  const outOfStockCount = useMemo(() => items.filter((item) => item.qtyOnHand <= 0).length, [items]);
  const activeItemCount = useMemo(() => items.filter((item) => item.active).length, [items]);
  const reorderItems = useMemo(
    () =>
      items
        .filter((item) => item.lowStock || item.qtyOnHand <= item.minQuantity)
        .sort((a, b) => {
          const leftGap = Math.max(0, a.minQuantity - a.qtyOnHand);
          const rightGap = Math.max(0, b.minQuantity - b.qtyOnHand);
          if (leftGap !== rightGap) return rightGap - leftGap;
          return a.itemName.localeCompare(b.itemName);
        }),
    [items],
  );
  const lowStockItems = useMemo(() => reorderItems.slice(0, 8), [reorderItems]);
  const cartQuantity = useMemo(
    () => issueCart.reduce((sum, line) => sum + line.quantity, 0),
    [issueCart],
  );
  const cartValue = useMemo(
    () => issueCart.reduce((sum, line) => sum + line.lineValue, 0),
    [issueCart],
  );
  const orderQuantity = useMemo(
    () => orderCart.reduce((sum, line) => sum + line.quantity, 0),
    [orderCart],
  );
  const orderValue = useMemo(
    () => orderCart.reduce((sum, line) => sum + line.lineValue, 0),
    [orderCart],
  );
  const dashboardRange = useMemo(() => getDashboardPeriodRange(dashboardPeriod), [dashboardPeriod]);
  const dashboardPeriodLabel = dashboardPeriodOptions.find((option) => option.value === dashboardPeriod)?.label || "Selected Period";
  const ticketLookup = useMemo(
    () => new Map(tickets.map((ticket) => [ticket.id, ticket])),
    [tickets],
  );
  const selectedItemWeeklyUse = useMemo(() => {
    const code = itemForm.itemCode || selectedItem?.itemCode || "";
    const id = itemForm.id || selectedItem?.id || "";
    if (!code && !id) return 0;
    const since = localDayStart();
    since.setDate(since.getDate() - 84);
    const qty = ticketLines.reduce((sum, line) => {
      const ticket = ticketLookup.get(line.issueTicketId);
      const date = dateOnly(ticket?.issueDate || "");
      if (!date || date < since) return sum;
      if (line.itemId !== id && line.itemCode !== code) return sum;
      return sum + line.qtyIssued;
    }, 0);
    return Math.round((qty / 12) * 10) / 10;
  }, [itemForm.id, itemForm.itemCode, selectedItem?.id, selectedItem?.itemCode, ticketLines, ticketLookup]);
  const dashboardIssueSourceRows = useMemo(() => {
    const term = dashboardSearch.trim().toLowerCase();
    return ticketLines
      .map((line) => {
        const ticket = ticketLookup.get(line.issueTicketId);
        const item = itemById.get(line.itemId) || itemByCode.get(line.itemCode);
        return {
          id: line.id,
          date: ticket?.issueDate || "",
          ref: line.ticketNumber || ticket?.ticketNumber || "",
          sku: line.itemCode || item?.itemCode || "",
          item: line.itemName || item?.itemName || "",
          category: item?.category || "",
          vendor: item?.vendorName || "",
          costCenter: line.department || ticket?.department || "",
          party: ticket?.issuedTo || "",
          qty: line.qtyIssued,
          amount: line.lineValue,
        };
      })
      .filter((row) => dashboardDepartment === "all" || row.costCenter === dashboardDepartment)
      .filter((row) => dashboardCategory === "all" || row.category === dashboardCategory)
      .filter((row) => dashboardVendor === "all" || row.vendor === dashboardVendor)
      .filter((row) => {
        if (!term) return true;
        return [row.ref, row.sku, row.item, row.category, row.vendor, row.costCenter, row.party]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [
    dashboardCategory,
    dashboardDepartment,
    dashboardSearch,
    dashboardVendor,
    itemByCode,
    itemById,
    ticketLines,
    ticketLookup,
  ]);
  const dashboardIssueRows = useMemo(
    () => dashboardIssueSourceRows.filter((row) => dateInRange(row.date, dashboardRange.start, dashboardRange.end)),
    [dashboardIssueSourceRows, dashboardRange.end, dashboardRange.start],
  );
  const dashboardPoSourceRows = useMemo(() => {
    const term = dashboardSearch.trim().toLowerCase();
    return purchaseOrderLines
      .map((line) => {
        const order = purchaseOrderLookup.get(line.purchaseOrderId);
        const item = itemById.get(line.itemId) || itemByCode.get(line.itemCode);
        return {
          id: line.id,
          date: order?.orderDate || "",
          ref: order?.poNumber || "",
          sku: line.itemCode || item?.itemCode || "",
          item: line.itemName || item?.itemName || "",
          category: item?.category || "",
          vendor: order?.vendorName || item?.vendorName || "",
          requestedBy: order?.requestedBy || "",
          status: order?.status || "",
          qty: line.quantityOrdered,
          amount: line.lineTotal,
        };
      })
      .filter((row) => {
        const status = row.status.toLowerCase();
        return status !== "cancelled" && status !== "canceled";
      })
      .filter((row) => dashboardCategory === "all" || row.category === dashboardCategory)
      .filter((row) => dashboardVendor === "all" || row.vendor === dashboardVendor)
      .filter((row) => {
        if (!term) return true;
        return [row.ref, row.sku, row.item, row.category, row.vendor, row.requestedBy, row.status]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [
    dashboardCategory,
    dashboardSearch,
    dashboardVendor,
    itemByCode,
    itemById,
    purchaseOrderLines,
    purchaseOrderLookup,
  ]);
  const dashboardPoRows = useMemo(
    () => dashboardPoSourceRows.filter((row) => dateInRange(row.date, dashboardRange.start, dashboardRange.end)),
    [dashboardPoSourceRows, dashboardRange.end, dashboardRange.start],
  );
  const dashboardTicketRefs = useMemo(
    () => new Set(dashboardIssueRows.map((row) => row.ref).filter(Boolean)),
    [dashboardIssueRows],
  );
  const dashboardPoRefs = useMemo(
    () => new Set(dashboardPoRows.map((row) => row.ref).filter(Boolean)),
    [dashboardPoRows],
  );
  const dashboardIssueSpend = useMemo(
    () => dashboardIssueRows.reduce((sum, row) => sum + row.amount, 0),
    [dashboardIssueRows],
  );
  const dashboardIssueQuantity = useMemo(
    () => dashboardIssueRows.reduce((sum, row) => sum + row.qty, 0),
    [dashboardIssueRows],
  );
  const dashboardPoSpend = useMemo(
    () => dashboardPoRows.reduce((sum, row) => sum + row.amount, 0),
    [dashboardPoRows],
  );
  const dashboardPeriodSnapshots = useMemo(
    () =>
      dashboardPeriodOptions.map((option) => {
        const range = getDashboardPeriodRange(option.value);
        const issueRows = dashboardIssueSourceRows.filter((row) => dateInRange(row.date, range.start, range.end));
        const poRows = dashboardPoSourceRows.filter((row) => dateInRange(row.date, range.start, range.end));
        return {
          ...option,
          issueSpend: issueRows.reduce((sum, row) => sum + row.amount, 0),
          issueTickets: new Set(issueRows.map((row) => row.ref).filter(Boolean)).size,
          issueQty: issueRows.reduce((sum, row) => sum + row.qty, 0),
          poSpend: poRows.reduce((sum, row) => sum + row.amount, 0),
          poCount: new Set(poRows.map((row) => row.ref).filter(Boolean)).size,
        };
      }),
    [dashboardIssueSourceRows, dashboardPoSourceRows],
  );
  const dashboardSpendMax = useMemo(
    () => Math.max(1, ...dashboardPeriodSnapshots.map((period) => Math.max(period.issueSpend, period.poSpend))),
    [dashboardPeriodSnapshots],
  );
  const pendingOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = (order.status || "").toLowerCase();
        return status !== "fulfilled" && status !== "cancelled" && status !== "canceled" && status !== "rejected";
      }),
    [orders],
  );
  const pendingPoCount = useMemo(
    () => purchaseOrders.filter((order) => !["received", "closed", "cancelled", "canceled"].includes((order.status || "").toLowerCase())).length,
    [purchaseOrders],
  );
  const purchaseOrdersForApproval = useMemo(
    () =>
      purchaseOrders.filter((order) => {
        const status = (order.status || "").toLowerCase();
        return !["received", "closed", "cancelled", "canceled"].includes(status);
      }),
    [purchaseOrders],
  );
  const purchaseOrderLineCounts = useMemo(() => {
    const counts = new Map<string, number>();
    purchaseOrderLines.forEach((line) => {
      counts.set(line.purchaseOrderId, (counts.get(line.purchaseOrderId) || 0) + 1);
    });
    return counts;
  }, [purchaseOrderLines]);
  const inventoryDocuments = useMemo(() => {
    const poDocs = purchaseOrders.map((order) => ({
      id: `po-${order.id}`,
      sourceId: order.id,
      date: order.orderDate,
      type: "Purchase Order",
      number: order.poNumber || "-",
      party: order.vendorName || "-",
      status: order.status || "Open",
      lines: purchaseOrderLineCounts.get(order.id) || 0,
      value: order.totalValue,
      action: "purchase-orders",
    }));
    const issueDocs = tickets.map((ticket) => ({
      id: `issue-${ticket.id}`,
      sourceId: ticket.id,
      date: ticket.issueDate,
      type: "Issue Ticket",
      number: ticket.ticketNumber || "-",
      party: ticket.issuedTo || "-",
      status: ticket.status || "Issued",
      lines: linesForTicket(ticket).length,
      value: ticket.totalValue,
      action: "tickets",
    }));
    const requestDocs = orders.map((order) => ({
      id: `request-${order.id}`,
      sourceId: order.id,
      date: order.orderDate,
      type: "Consumables Store",
      number: order.orderNumber || "-",
      party: order.requestedBy || "-",
      status: order.status || "Submitted",
      lines: linesForOrder(order).length,
      value: order.totalValue,
      action: "orders",
    }));
    return [...poDocs, ...issueDocs, ...requestDocs]
      .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
  }, [orders, orderLines, purchaseOrderLineCounts, purchaseOrders, tickets, ticketLines]);
  const topIssuedItems = useMemo(() => {
    const totals = new Map<string, { label: string; qty: number; value: number }>();
    dashboardIssueRows.forEach((row) => {
      const key = row.sku || row.item || row.id;
      const current = totals.get(key) || { label: `${row.sku || "-"} ${row.item || ""}`.trim(), qty: 0, value: 0 };
      current.qty += row.qty;
      current.value += row.amount;
      totals.set(key, current);
    });
    return Array.from(totals.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [dashboardIssueRows]);
  const topIssuedUnits = useMemo(() => {
    const totals = new Map<string, { label: string; qty: number; value: number }>();
    dashboardIssueRows.forEach((row) => {
      const key = row.costCenter || "No cost center";
      const current = totals.get(key) || { label: key, qty: 0, value: 0 };
      current.qty += row.qty;
      current.value += row.amount;
      totals.set(key, current);
    });
    return Array.from(totals.values()).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [dashboardIssueRows]);
  const recentIssueTickets = useMemo(() => tickets.slice(0, 8), [tickets]);
  const recentDashboardIssueRows = useMemo(
    () => dashboardIssueRows.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
    [dashboardIssueRows],
  );
  const recentDashboardPoRows = useMemo(
    () => dashboardPoRows.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
    [dashboardPoRows],
  );

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    return () => stopCameraScanner();
  }, []);

  async function loadPage() {
    setLoading(true);
    setMessage("Loading inventory...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    const nextEmail = user.email || "";
    let nextRole = normalizeRole(profileData?.role);
    let nextPermissions = getDefaultPermissionsForRole(nextRole);
    let nextModuleKeys = moduleKeysFromPermissionMap(nextPermissions);

    try {
      const token = sessionData.session?.access_token || "";
      if (token) {
        const accessResponse = await fetch("/api/my-module-permissions", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (accessResponse.ok) {
          const accessData = await accessResponse.json();
          nextRole = normalizeRole(accessData?.role || profileData?.role);
          nextPermissions =
            (accessData?.permissions as PermissionMap | undefined) || getDefaultPermissionsForRole(nextRole);
          nextModuleKeys = Array.isArray(accessData?.moduleKeys)
            ? (accessData.moduleKeys.filter((key: unknown) => typeof key === "string") as ModuleKey[])
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
    setUserEmail(nextEmail);
    setUserName(profileData?.full_name || user.email || "TITAN User");

    if (!hasInventoryAccess(nextRole, nextModuleKeys, nextPermissions)) {
      setMessage("Inventory is for internal users only.");
      setLoading(false);
      return;
    }

    const yards = await loadInventoryYards(user.id, nextEmail);
    setInventoryYards(yards);
    const preferredYard = yards.find((yard) => yard.code === defaultInventoryYardCode) || yards[0];
    const nextYardId = preferredYard?.id || "";
    setSelectedInventoryYardId(nextYardId);

    await reloadInventoryData(nextYardId, yards);
    setMessage("");
    setLoading(false);
  }

  async function loadInventoryYards(userId: string, email: string) {
    const { data, error } = await supabase
      .from("yards")
      .select("id, name, code")
      .in("code", inventoryYardCodes)
      .order("name");

    if (error) {
      setMessage(`Inventory yards failed: ${error.message}`);
      return [];
    }

    const yards = (data || []).map((yard) => ({
      id: yard.id,
      name: yard.name || yard.code || "Inventory Yard",
      code: yard.code || "",
    }));

    const isWade = email.trim().toLowerCase() === wadeInventoryAdminEmail;
    if (isWade) return yards;

    const { data: assignments, error: assignmentError } = await supabase
      .from("inventory_user_yards")
      .select("yard_id")
      .eq("user_id", userId);

    if (assignmentError) {
      setMessage(`Inventory yard access failed: ${assignmentError.message}`);
      return [];
    }

    const assignedYardIds = new Set((assignments || []).map((row) => row.yard_id));
    return yards.filter((yard) => assignedYardIds.has(yard.id));
  }

  async function reloadInventoryData(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    setSelectedItemId("");
    setIssueCart([]);
    setOrderCart([]);
    const yard = yardList.find((candidate) => candidate.id === yardId);
    if (yard && yard.code !== defaultInventoryYardCode && !inventoryYardScopedTablesEnabled) {
      setVendors([]);
      setItems([]);
      setTransactions([]);
      setTickets([]);
      setTicketLines([]);
      setOrders([]);
      setOrderLines([]);
      setPurchaseOrders([]);
      setPurchaseOrderLines([]);
      return;
    }
    const [, , , loadedTickets] = await Promise.all([
      loadVendors(yardId, yardList),
      loadItems(yardId, yardList),
      loadTransactions(yardId, yardList),
      loadTickets(yardId, yardList),
      loadOrders(yardId, yardList),
      loadOrderLines(yardId, yardList),
      loadPurchaseOrders(yardId, yardList),
      loadPurchaseOrderLines(yardId, yardList),
    ]);
    await loadIssueTicketLines(yardId, yardList, loadedTickets);
  }

  async function handleInventoryYardChange(yardId: string) {
    setSelectedInventoryYardId(yardId);
    setMessage("Loading selected yard...");
    await reloadInventoryData(yardId);
    setMessage("");
  }

  async function loadVendors(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("inventory_vendors")
      .select("id, vendor_name, vendor_code, vendor_type, contact_name, phone, email, terms, active")
      .order("vendor_name");
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setMessage(`Vendors failed: ${error.message}`);
      return;
    }

    setVendors(
      (data || []).map((vendor) => ({
        id: vendor.id,
        vendorName: vendor.vendor_name || "",
        vendorCode: vendor.vendor_code || "",
        vendorType: vendor.vendor_type || "",
        contactName: vendor.contact_name || "",
        phone: vendor.phone || "",
        email: vendor.email || "",
        terms: vendor.terms || "",
        active: Boolean(vendor.active),
      })),
    );
  }

  async function loadItems(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("inventory_items")
      .select("*, inventory_vendors(vendor_name)")
      .order("item_code");
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setMessage(`Inventory failed: ${error.message}`);
      return;
    }

    let photoQuery = supabase
      .from("inventory_documents")
      .select("linked_record_id, file_url, uploaded_at")
      .eq("linked_record_type", "item")
      .order("uploaded_at", { ascending: false })
      .limit(5000);
    photoQuery = applyInventoryYardScope(photoQuery, yardId, yardList);

    const { data: photoData, error: photoError } = await photoQuery;
    const photoByItemId = new Map<string, string>();
    if (!photoError) {
      (photoData || []).forEach((photo) => {
        const itemId = String(photo.linked_record_id || "");
        if (itemId && photo.file_url && !photoByItemId.has(itemId)) {
          photoByItemId.set(itemId, photo.file_url);
        }
      });
    }

    setItems(
      (data || []).map((row) => {
        const vendor = Array.isArray(row.inventory_vendors)
          ? row.inventory_vendors[0]
          : row.inventory_vendors;
        return {
          id: row.id,
          itemCode: row.item_code || "",
          itemName: row.item_name || "",
          category: row.category || "",
          location: row.location || "",
          vendorId: row.vendor_id || "",
          vendorName: vendor?.vendor_name || row.vendor_name_raw || "",
          qtyOnHand: Number(row.qty_on_hand || 0),
          minQuantity: Number(row.min_quantity || 0),
          maxQuantity: Number(row.max_quantity || 0),
          unitPrice: Number(row.unit_price || 0),
          barcode: row.barcode || "",
          uom: row.uom || "",
          active: Boolean(row.active),
          lowStock: Boolean(row.low_stock),
          photoUrl: photoByItemId.get(row.id) || "",
        };
      }),
    );

    if (photoError && !String(photoError.message || "").includes("inventory_documents")) {
      setMessage(`Item photos failed: ${photoError.message}`);
    }
  }

  async function loadTransactions(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("inventory_transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .limit(5000);
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setMessage(`Transactions failed: ${error.message}`);
      return;
    }

    setTransactions(
      (data || []).map((row) => ({
        id: row.id,
        itemCode: row.item_code || "",
        transactionDate: String(row.transaction_date || "").slice(0, 10),
        transactionType: row.transaction_type || "",
        quantity: Number(row.quantity || 0),
        referenceType: row.reference_type || "",
        referenceNumber: row.reference_number || "",
        enteredBy: row.entered_by || "",
        notes: row.notes || "",
        quantityDirection: row.quantity_direction || "",
      })),
    );
  }

  async function loadTickets(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("inventory_issue_tickets")
      .select("*")
      .order("issue_date", { ascending: false })
      .limit(500);
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setMessage(`Issue tickets failed: ${error.message}`);
      return [];
    }

    const mappedTickets = (data || []).map((row) => ({
      id: row.id,
      ticketNumber: row.ticket_number || "",
      issueDate: String(row.issue_date || "").slice(0, 10),
      issuedTo: row.issued_to || "",
      department: row.department || "",
      pickedBy: row.picked_by || "",
      unitTruck: row.unit_truck || "",
      jobNumber: row.job_number || "",
      totalValue: Number(row.total_value || 0),
      status: row.status || "",
      notes: row.notes || "",
    }));

    setTickets(mappedTickets);
    return mappedTickets;
  }

  async function loadIssueTicketLines(
    yardId = selectedInventoryYardId,
    yardList = inventoryYards,
    scopedTickets = tickets,
  ) {
    const mapLine = (row: any): IssueTicketLine => ({
      id: row.id,
      issueTicketId: row.issue_ticket_id || "",
      ticketNumber: row.ticket_number || "",
      itemId: row.item_id || "",
      itemCode: row.item_code || "",
      itemName: row.item_name || "",
      department: row.department || "",
      qtyIssued: Number(row.qty_issued || 0),
      unitCost: Number(row.unit_cost || 0),
      lineValue: Number(row.line_value || 0),
      unitTruck: row.unit_truck || "",
      pickedBy: row.picked_by || "",
    });
    const lineMap = new Map<string, IssueTicketLine>();
    const errors: string[] = [];
    const addRows = (rows: any[] | null) => {
      (rows || []).forEach((row) => {
        const mapped = mapLine(row);
        lineMap.set(mapped.id, mapped);
      });
    };
    const ticketIds = Array.from(new Set(scopedTickets.map((ticket) => ticket.id).filter(Boolean)));
    const ticketNumbers = Array.from(new Set(scopedTickets.map((ticket) => ticket.ticketNumber).filter(Boolean)));

    if (ticketIds.length > 0 || ticketNumbers.length > 0) {
      for (const batch of chunkArray(ticketIds, 100)) {
        const { data, error } = await supabase
          .from("inventory_issue_ticket_lines")
          .select("*")
          .in("issue_ticket_id", batch)
          .order("created_at", { ascending: true })
          .limit(5000);

        if (error) {
          errors.push(error.message);
        } else {
          addRows(data);
        }
      }

      for (const batch of chunkArray(ticketNumbers, 100)) {
        const { data, error } = await supabase
          .from("inventory_issue_ticket_lines")
          .select("*")
          .in("ticket_number", batch)
          .order("created_at", { ascending: true })
          .limit(5000);

        if (error) {
          errors.push(error.message);
        } else {
          addRows(data);
        }
      }
    } else {
      let query = supabase
        .from("inventory_issue_ticket_lines")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(5000);
      query = applyInventoryYardScope(query, yardId, yardList);

      const { data, error } = await query;
      if (error) {
        errors.push(error.message);
      } else {
        addRows(data);
      }
    }

    if (errors.length > 0 && lineMap.size === 0) {
      setMessage(`Issue ticket lines failed: ${errors[0]}`);
    }

    setTicketLines(Array.from(lineMap.values()));
  }

  async function loadOrders(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("inventory_orders")
      .select("*")
      .order("order_date", { ascending: false })
      .limit(200);
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setOrders([]);
      if (!String(error.message || "").includes("schema cache")) {
        setMessage(`Consumable orders failed: ${error.message}`);
      }
      return;
    }

    setOrders(
      (data || []).map((row) => ({
        id: row.id,
        orderNumber: row.order_number || "",
        orderDate: String(row.order_date || "").slice(0, 10),
        requestedBy: row.requested_by || "",
        department: row.department || "",
        unitTruck: row.unit_truck || "",
        jobNumber: row.job_number || "",
        totalValue: Number(row.total_value || 0),
        status: row.status || "Submitted",
        notes: row.notes || "",
      })),
    );
  }

  async function loadOrderLines(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("inventory_order_lines")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(5000);
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setOrderLines([]);
      if (!String(error.message || "").includes("schema cache")) {
        setMessage(`Consumable order lines failed: ${error.message}`);
      }
      return;
    }

    setOrderLines(
      (data || []).map((row) => ({
        id: row.id,
        orderId: row.order_id || "",
        orderNumber: row.order_number || "",
        itemId: row.item_id || "",
        itemCode: row.item_code || "",
        itemName: row.item_name || "",
        qtyRequested: Number(row.qty_requested || 0),
        qtyFulfilled: Number(row.qty_fulfilled || 0),
        unitCost: Number(row.unit_cost || 0),
        lineValue: Number(row.line_value || 0),
      })),
    );
  }

  async function loadPurchaseOrders(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("purchase_orders")
      .select("id, po_number, vendor_name, order_date, requested_by, total_value, status")
      .order("order_date", { ascending: false })
      .limit(250);
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setPurchaseOrders([]);
      setMessage(`Purchase order summary failed: ${error.message}`);
      return;
    }

    setPurchaseOrders(
      (data || []).map((row) => ({
        id: row.id,
        poNumber: row.po_number || "",
        vendorName: row.vendor_name || "",
        orderDate: String(row.order_date || "").slice(0, 10),
        requestedBy: row.requested_by || "",
        totalValue: Number(row.total_value || 0),
        status: row.status || "",
      })),
    );
  }

  async function loadPurchaseOrderLines(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("purchase_order_lines")
      .select("id, purchase_order_id, item_id, item_code, item_name, quantity_ordered, quantity_received, unit_cost, line_total")
      .order("created_at", { ascending: false })
      .limit(5000);
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setPurchaseOrderLines([]);
      setMessage(`Purchase order line summary failed: ${error.message}`);
      return;
    }

    setPurchaseOrderLines(
      (data || []).map((row) => ({
        id: row.id,
        purchaseOrderId: row.purchase_order_id || "",
        itemId: row.item_id || "",
        itemCode: row.item_code || "",
        itemName: row.item_name || "",
        quantityOrdered: Number(row.quantity_ordered || 0),
        quantityReceived: Number(row.quantity_received || 0),
        unitCost: Number(row.unit_cost || 0),
        lineTotal: Number(row.line_total || 0),
      })),
    );
  }

  function openNewItem() {
    setSelectedItemId("");
    setItemForm(emptyItemForm);
    setItemPhotoDraft("");
    if (activeView === "items") {
      setMessage("Blank item setup is ready.");
      return;
    }
    setItemFormOpen(true);
  }

  function selectItemForSetup(item: InventoryItem) {
    setSelectedItemId(item.id);
    setItemPhotoDraft("");
    setItemForm({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      category: item.category,
      location: item.location,
      vendorId: item.vendorId,
      vendorName: item.vendorName,
      qtyOnHand: String(item.qtyOnHand),
      minQuantity: String(item.minQuantity),
      maxQuantity: String(item.maxQuantity),
      unitPrice: String(item.unitPrice),
      barcode: item.barcode,
      uom: item.uom,
      active: item.active,
      photoUrl: item.photoUrl,
    });
    setItemPhotoDraft(item.photoUrl);
  }

  function openNewVendor() {
    setVendorForm(emptyVendorForm);
    setVendorFormOpen(true);
  }

  function openEditVendor(vendor: Vendor) {
    setVendorForm({
      id: vendor.id,
      vendorName: vendor.vendorName,
      vendorCode: vendor.vendorCode,
      vendorType: vendor.vendorType,
      contactName: vendor.contactName,
      phone: vendor.phone,
      email: vendor.email,
      terms: vendor.terms,
      active: vendor.active,
    });
    setVendorFormOpen(true);
  }

  async function saveVendor() {
    if (!vendorForm.vendorName.trim()) {
      setMessage("Vendor name is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      vendor_name: vendorForm.vendorName.trim(),
      vendor_code: vendorForm.vendorCode.trim() || null,
      vendor_type: vendorForm.vendorType.trim() || null,
      contact_name: vendorForm.contactName.trim() || null,
      phone: vendorForm.phone.trim() || null,
      email: vendorForm.email.trim() || null,
      terms: vendorForm.terms.trim() || null,
      active: vendorForm.active,
    };

    const request = vendorForm.id
      ? supabase.from("inventory_vendors").update(payload).eq("id", vendorForm.id)
      : supabase.from("inventory_vendors").insert(payload);

    const { error } = await request;
    if (error) {
      setMessage(`Vendor save failed: ${error.message}`);
    } else {
      setVendorFormOpen(false);
      await loadVendors();
      setMessage("Vendor saved.");
    }

    setSaving(false);
  }

  function openEditItem(item: InventoryItem) {
    selectItemForSetup(item);
    if (activeView === "items") {
      setMessage(`${item.itemCode} loaded into item setup.`);
      return;
    }
    setItemFormOpen(true);
  }

  async function saveItem() {
    if (!itemForm.itemCode.trim() || !itemForm.itemName.trim()) {
      setMessage("Item ID and item name are required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const vendor = vendors.find((candidate) => candidate.id === itemForm.vendorId);
    const qty = numberValue(itemForm.qtyOnHand);
    const minQty = numberValue(itemForm.minQuantity);

    const payload = {
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      item_code: itemForm.itemCode.trim(),
      item_name: itemForm.itemName.trim(),
      category: itemForm.category.trim() || null,
      location: itemForm.location.trim() || null,
      vendor_id: itemForm.vendorId || null,
      vendor_name_raw: vendor?.vendorName || itemForm.vendorName || null,
      qty_on_hand: qty,
      min_quantity: minQty,
      max_quantity: numberValue(itemForm.maxQuantity),
      unit_price: numberValue(itemForm.unitPrice),
      barcode: itemForm.barcode.trim() || null,
      uom: itemForm.uom.trim() || null,
      active: itemForm.active,
      low_stock: qty <= minQty,
    };

    const request = itemForm.id
      ? supabase.from("inventory_items").update(payload).eq("id", itemForm.id).select("id").single()
      : supabase.from("inventory_items").insert(payload).select("id").single();

    const { data: savedItem, error } = await request;
    if (error || !savedItem) {
      setMessage(`Save failed: ${error?.message || "item was not returned."}`);
    } else {
      let photoMessage = "";
      if (itemPhotoDraft.trim() && itemPhotoDraft.trim() !== itemForm.photoUrl) {
        const photoError = await saveItemPhotoUrl(savedItem.id, itemPhotoDraft.trim(), itemForm.itemCode.trim() || "item-photo");
        if (photoError) photoMessage = ` Photo link failed: ${photoError}`;
      }
      setItemFormOpen(false);
      await loadItems();
      setMessage(`Inventory item saved.${photoMessage}`);
    }
    setSaving(false);
  }

  async function saveItemPhotoUrl(itemId: string, photoUrl: string, fileName = "item-photo") {
    const cleanUrl = photoUrl.trim();
    if (!itemId || !cleanUrl) return "";

    const { error } = await supabase.from("inventory_documents").insert({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      linked_record_type: "item",
      linked_record_id: itemId,
      file_name: fileName,
      file_url: cleanUrl,
      file_path: cleanUrl.startsWith("http") ? null : cleanUrl,
      mime_type: "image/*",
      file_size: null,
    });
    return error?.message || "";
  }

  async function handleItemPhotoFile(file?: File | null) {
    if (!file) return;
    if (!itemForm.id) {
      setMessage("Save the inventory item first, then attach a product photo.");
      return;
    }

    setSaving(true);
    setMessage("");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "item-photo.jpg";
    const filePath = `inventory-items/${selectedInventoryYardId || "yard"}/${itemForm.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("ticket-attachments").upload(filePath, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

    if (uploadError) {
      setMessage(`Photo upload failed: ${uploadError.message}`);
      setSaving(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("ticket-attachments").getPublicUrl(filePath);
    const publicUrl = publicUrlData.publicUrl;
    const { error: docError } = await supabase.from("inventory_documents").insert({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      linked_record_type: "item",
      linked_record_id: itemForm.id,
      file_name: file.name || safeName,
      file_url: publicUrl,
      file_path: filePath,
      mime_type: file.type || "image/jpeg",
      file_size: file.size,
    });

    if (docError) {
      setMessage(`Photo uploaded, but item link failed: ${docError.message}`);
      setSaving(false);
      return;
    }

    setItemPhotoDraft(publicUrl);
    setItemForm((current) => ({ ...current, photoUrl: publicUrl }));
    await loadItems(selectedInventoryYardId);
    setMessage("Product photo saved.");
    setSaving(false);
  }

  async function clearItemPhoto() {
    const targetId = itemForm.id || selectedItem?.id || "";
    setItemPhotoDraft("");
    setItemForm((current) => ({ ...current, photoUrl: "" }));
    if (!targetId) {
      setMessage("Photo cleared from the form.");
      return;
    }

    setSaving(true);
    const deleteQuery = supabase
      .from("inventory_documents")
      .delete()
      .eq("linked_record_type", "item")
      .eq("linked_record_id", targetId);
    const { error } = await deleteQuery;
    if (error) {
      setMessage(`Photo clear failed: ${error.message}`);
    } else {
      await loadItems(selectedInventoryYardId);
      setMessage("Product photo cleared.");
    }
    setSaving(false);
  }

  function openManualReceive(item?: InventoryItem) {
    const target = item || selectedItem;
    setReceiveForm({
      ...emptyReceiveForm,
      itemId: target?.id || "",
      quantity: "",
      unitPrice: target ? String(target.unitPrice) : "",
      referenceNumber: "",
      notes: "",
    });
    setReceiveOpen(true);
  }

  async function saveManualReceive() {
    const item = items.find((candidate) => candidate.id === receiveForm.itemId);
    const quantity = numberValue(receiveForm.quantity);
    const unitPrice = numberValue(receiveForm.unitPrice);

    if (!item) {
      setMessage("Choose an inventory item to receive.");
      return;
    }
    if (quantity <= 0) {
      setMessage("Receive quantity must be greater than zero.");
      return;
    }

    setSaving(true);
    setMessage("");

    const nextQty = item.qtyOnHand + quantity;
    const updatePayload: Record<string, number | boolean> = {
      qty_on_hand: nextQty,
      low_stock: nextQty <= item.minQuantity,
    };
    if (unitPrice > 0) updatePayload.unit_price = unitPrice;

    const { error: updateError } = await supabase
      .from("inventory_items")
      .update(updatePayload)
      .eq("id", item.id);

    if (updateError) {
      setMessage(`Receive failed: ${updateError.message}`);
      setSaving(false);
      return;
    }

    const { error: txError } = await supabase.from("inventory_transactions").insert({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      item_id: item.id,
      item_code: item.itemCode,
      transaction_type: "Manual Receive",
      quantity,
      reference_type: "Manual Receive",
      reference_number: receiveForm.referenceNumber || "Non-PO Receive",
      entered_by: userName,
      notes: receiveForm.notes || null,
      transaction_source: "TITAN Inventory",
      quantity_direction: "In",
    });

    await Promise.all([loadItems(selectedInventoryYardId), loadTransactions(selectedInventoryYardId)]);
    setReceiveOpen(false);
    setSaving(false);
    setMessage(txError ? `Received, but history failed: ${txError.message}` : "Inventory received.");
  }

  function openPriceAdjust(item?: InventoryItem) {
    const target = item || selectedItem;
    if (!target) {
      setMessage("Select an item before changing price.");
      return;
    }
    setPriceForm({
      itemId: target.id,
      unitPrice: String(target.unitPrice),
      notes: "",
    });
    setPriceOpen(true);
  }

  async function savePriceAdjustment() {
    const item = items.find((candidate) => candidate.id === priceForm.itemId);
    const unitPrice = numberValue(priceForm.unitPrice);

    if (!item) {
      setMessage("Choose an inventory item before changing price.");
      return;
    }
    if (unitPrice < 0) {
      setMessage("Unit price cannot be negative.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("inventory_items")
      .update({ unit_price: unitPrice })
      .eq("id", item.id);

    if (error) {
      setMessage(`Price update failed: ${error.message}`);
      setSaving(false);
      return;
    }

    await supabase.from("inventory_transactions").insert({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      item_id: item.id,
      item_code: item.itemCode,
      transaction_type: "Price Update",
      quantity: 0,
      reference_type: "Manual Price",
      reference_number: "Price Adjustment",
      entered_by: userName,
      notes: priceForm.notes || `Unit price changed to ${money(unitPrice)}`,
      transaction_source: "TITAN Inventory",
      quantity_direction: "Neutral",
    });

    await Promise.all([loadItems(selectedInventoryYardId), loadTransactions(selectedInventoryYardId)]);
    setPriceOpen(false);
    setSaving(false);
    setMessage("Unit price updated.");
  }

  function openAdjust(item: InventoryItem) {
    setSelectedItemId(item.id);
    setAdjustQty("");
    setAdjustNotes("");
    setAdjustOpen(true);
  }

  async function saveAdjustment() {
    if (!selectedItem) return;
    const delta = numberValue(adjustQty);
    const nextQty = selectedItem.qtyOnHand + delta;
    if (!delta) {
      setMessage("Enter an adjustment quantity.");
      return;
    }
    if (nextQty < 0) {
      setMessage("Adjustment would create negative inventory.");
      return;
    }
    if (!adjustNotes.trim()) {
      setMessage("Adjustment notes are required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({
        qty_on_hand: nextQty,
        low_stock: nextQty <= selectedItem.minQuantity,
      })
      .eq("id", selectedItem.id);

    if (updateError) {
      setMessage(`Adjustment failed: ${updateError.message}`);
      setSaving(false);
      return;
    }

    const { error: txError } = await supabase.from("inventory_transactions").insert({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      item_id: selectedItem.id,
      item_code: selectedItem.itemCode,
      transaction_type: "Adjustment",
      quantity: Math.abs(delta),
      reference_type: "Manual",
      reference_number: "Inventory Adjustment",
      entered_by: userName,
      notes: adjustNotes,
      transaction_source: "TITAN Inventory",
      quantity_direction: delta > 0 ? "In" : "Out",
    });

    if (txError) {
      setMessage(`Adjustment saved, transaction failed: ${txError.message}`);
    } else {
      setAdjustOpen(false);
      setMessage("Quantity adjusted.");
    }

    await Promise.all([loadItems(selectedInventoryYardId), loadTransactions(selectedInventoryYardId)]);
    setSaving(false);
  }

  function openIssue(item?: InventoryItem) {
    const target = item || selectedItem;
    setIssueForm((current) => ({ ...current, pickedBy: current.pickedBy || userName }));
    if (target) addItemToCart(target);
    setIssueOpen(true);
  }

  function findItemForCounter(value: string) {
    const term = value.trim();
    const normalized = normalizeLookupText(term);
    if (!term) return null;

    return (
      items.find((item) => item.barcode && normalizeLookupText(item.barcode) === normalized) ||
      items.find((item) => normalizeLookupText(item.itemCode) === normalized) ||
      items.find((item) => inventoryItemMatchesTerm(item, term)) ||
      null
    );
  }

  function addBarcodeToActiveCart(barcode: string) {
    const item = findItemForCounter(barcode);
    if (!item) {
      setScanInput(barcode);
      setCameraScanMessage(`Scanned ${barcode}, but no inventory item matched it.`);
      scanFieldRef.current?.focus();
      return false;
    }

    if (activeView === "orders") {
      addItemToOrderCart(item);
      setOrderSearchOpen(false);
      setCameraScanMessage(`Added ${item.itemCode} to order from barcode ${barcode}.`);
    } else {
      addItemToCart(item);
      setCameraScanMessage(`Added ${item.itemCode} from barcode ${barcode}.`);
    }

    setScanInput("");
    window.setTimeout(() => scanFieldRef.current?.focus(), 25);
    return true;
  }

  function addItemToCart(item: InventoryItem, quantity = 1) {
    if (!item.active) {
      setMessage(`${item.itemCode} is inactive.`);
      return;
    }
    if (item.qtyOnHand <= 0) {
      setMessage(`${item.itemCode} has no inventory on hand.`);
      return;
    }

    setMessage("");
    setIssueCart((current) => {
      const existing = current.find((line) => line.itemId === item.id);
      const existingQty = existing?.quantity || 0;
      const nextQty = Math.min(item.qtyOnHand, existingQty + quantity);
      if (existing && nextQty === existingQty) {
        setMessage(`${item.itemCode} cannot exceed quantity on hand.`);
        return current;
      }
      if (existing) {
        return current.map((line) =>
          line.itemId === item.id
            ? { ...line, quantity: nextQty, lineValue: nextQty * line.unitPrice }
            : line,
        );
      }
      return current.concat({
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        barcode: item.barcode,
        location: item.location,
        quantity: Math.min(item.qtyOnHand, quantity),
        qtyOnHand: item.qtyOnHand,
        minQuantity: item.minQuantity,
        unitPrice: item.unitPrice,
        lineValue: Math.min(item.qtyOnHand, quantity) * item.unitPrice,
      });
    });
  }

  function addScannedItem() {
    const item = findItemForCounter(scanInput);
    if (!item) {
      setMessage("No item matched that barcode, item ID, or search text.");
      scanFieldRef.current?.focus();
      return;
    }
    addItemToCart(item);
    setScanInput("");
    setCameraScanMessage("");
    window.setTimeout(() => scanFieldRef.current?.focus(), 25);
  }

  function stopCameraScanner() {
    barcodeControlsRef.current?.stop?.();
    barcodeControlsRef.current = null;
    setCameraScanning(false);
  }

  async function openCameraScanner() {
    setCameraScanMessage("");
    stopCameraScanner();
    const video = cameraVideoRef.current;
    const canUseLiveCamera =
      typeof window !== "undefined" &&
      window.isSecureContext &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia);

    if (!canUseLiveCamera) {
      setCameraScanMessage("Live camera scanning needs HTTPS. Opening photo scanner instead.");
      cameraFileRef.current?.click();
      return;
    }

    if (!video) {
      setCameraScanMessage("Opening photo scanner because the camera preview is not available.");
      cameraFileRef.current?.click();
      return;
    }

    try {
      if (!barcodeReaderRef.current) {
        barcodeReaderRef.current = new BrowserMultiFormatReader();
      }

      setCameraScanning(true);
      setCameraScanMessage("Point the camera at the barcode.");
      const controls = await (barcodeReaderRef.current as any).decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        video,
        (result: any) => {
          const barcode = result?.getText?.().trim();
          if (!barcode) return;

          addBarcodeToActiveCart(barcode);
          stopCameraScanner();
        },
      );
      barcodeControlsRef.current = controls as { stop: () => void };
    } catch (error: any) {
      stopCameraScanner();
      setCameraScanning(false);
      setCameraScanMessage("Camera scanning is not available in this browser. Opening photo scanner instead.");
      cameraFileRef.current?.click();
    }
  }

  async function handleCameraBarcode(file: File | undefined) {
    if (!file) return;

    stopCameraScanner();
    setCameraScanning(true);
    setCameraScanMessage("Reading barcode...");
    const imageUrl = URL.createObjectURL(file);

    try {
      if (!barcodeReaderRef.current) {
        barcodeReaderRef.current = new BrowserMultiFormatReader();
      }

      const result = await barcodeReaderRef.current.decodeFromImageUrl(imageUrl);
      const barcode = result.getText().trim();

      if (!barcode) {
        setCameraScanMessage("No barcode found in that photo. Try again with the barcode centered and well lit.");
        return;
      }

      addBarcodeToActiveCart(barcode);
    } catch (error: any) {
      setCameraScanMessage("No barcode was found. Try a closer, brighter photo with the barcode filling most of the screen.");
    } finally {
      setCameraScanning(false);
      URL.revokeObjectURL(imageUrl);
      if (cameraFileRef.current) cameraFileRef.current.value = "";
    }
  }

  function updateCartQuantity(itemId: string, value: string) {
    const qty = Math.max(0, Math.floor(numberValue(value)));
    setIssueCart((current) =>
      current
        .map((line) => {
          if (line.itemId !== itemId) return line;
          const nextQty = Math.min(qty, line.qtyOnHand);
          return { ...line, quantity: nextQty, lineValue: nextQty * line.unitPrice };
        })
        .filter((line) => line.quantity > 0),
    );
  }

  function removeCartLine(itemId: string) {
    setIssueCart((current) => current.filter((line) => line.itemId !== itemId));
  }

  function clearIssueCart() {
    setIssueCart([]);
    setScanInput("");
    setMessage("");
  }

  function openOrder(item?: InventoryItem) {
    const target = item || selectedItem;
    setOrderForm((current) => ({ ...current, requestedBy: current.requestedBy || userName }));
    if (target) addItemToOrderCart(target);
    setActiveView("orders");
  }

  function addItemToOrderCart(item: InventoryItem, quantity = 1) {
    if (!item.active) {
      setMessage(`${item.itemCode} is inactive.`);
      return;
    }

    setMessage("");
    setOrderCart((current) => {
      const existing = current.find((line) => line.itemId === item.id);
      const nextQty = (existing?.quantity || 0) + quantity;
      if (existing) {
        return current.map((line) =>
          line.itemId === item.id
            ? { ...line, quantity: nextQty, lineValue: nextQty * line.unitPrice }
            : line,
        );
      }
      return current.concat({
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        barcode: item.barcode,
        location: item.location,
        quantity,
        qtyOnHand: item.qtyOnHand,
        minQuantity: item.minQuantity,
        unitPrice: item.unitPrice,
        lineValue: quantity * item.unitPrice,
      });
    });
  }

  function stockStatus(item: InventoryItem) {
    if (item.qtyOnHand <= 0) return "Out";
    if (item.lowStock || item.qtyOnHand <= item.minQuantity) return "Reorder";
    return "Available";
  }

  function productInitials(item: InventoryItem) {
    const source = item.category || item.itemName || item.itemCode || "CI";
    return source
      .split(/\s|-/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "CI";
  }

  function suggestedReorderQuantity(item: InventoryItem) {
    const targetGap = item.maxQuantity > item.qtyOnHand ? item.maxQuantity - item.qtyOnHand : 0;
    const minGap = item.minQuantity > item.qtyOnHand ? item.minQuantity - item.qtyOnHand : 0;
    return Math.max(1, Math.ceil(targetGap || minGap || item.minQuantity || 1));
  }

  function seedPurchaseOrderItem(item: InventoryItem, quantity = suggestedReorderQuantity(item)) {
    window.sessionStorage.setItem("titanInventoryPoSeedItem", JSON.stringify({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      vendorName: item.vendorName,
      unitPrice: item.unitPrice,
      quantityOrdered: quantity,
    }));
    window.location.href = "/purchase-orders";
  }

  function addStoreItemToCart(item: InventoryItem) {
    const qty = Math.max(1, Math.floor(numberValue(storeQuantities[item.id] || "1")));
    addItemToOrderCart(item, qty);
    setStoreQuantities((current) => ({ ...current, [item.id]: "1" }));
  }

  function addScannedItemToOrder() {
    const item = findItemForCounter(scanInput);
    if (!item) {
      setMessage("No item matched that barcode, item ID, or search text.");
      scanFieldRef.current?.focus();
      return;
    }
    addItemToOrderCart(item);
    setScanInput("");
    setOrderSearchOpen(false);
    setCameraScanMessage("");
    window.setTimeout(() => scanFieldRef.current?.focus(), 25);
  }

  function chooseOrderSearchItem(item: InventoryItem) {
    addItemToOrderCart(item);
    setScanInput("");
    setOrderSearchOpen(false);
    setCameraScanMessage("");
    window.setTimeout(() => scanFieldRef.current?.focus(), 25);
  }

  function updateOrderCartQuantity(itemId: string, value: string) {
    const qty = Math.max(0, Math.floor(numberValue(value)));
    setOrderCart((current) =>
      current
        .map((line) => {
          if (line.itemId !== itemId) return line;
          return { ...line, quantity: qty, lineValue: qty * line.unitPrice };
        })
        .filter((line) => line.quantity > 0),
    );
  }

  function removeOrderCartLine(itemId: string) {
    setOrderCart((current) => current.filter((line) => line.itemId !== itemId));
  }

  function clearOrderCart() {
    setOrderCart([]);
    setScanInput("");
    setOrderSearchOpen(false);
    setMessage("");
  }

  async function saveInventoryOrder() {
    if (orderCart.length === 0) {
      setMessage("Add at least one item to the order cart.");
      return;
    }
    if (!orderForm.requestedBy.trim()) {
      setMessage("Requested By is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const orderNumber = `ORD-${todayStamp()}`;
    const { data: order, error: orderError } = await supabase
      .from("inventory_orders")
      .insert({
        ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
        order_number: orderNumber,
        order_date: new Date().toISOString().slice(0, 10),
        requested_by: orderForm.requestedBy,
        department: orderForm.department || null,
        unit_truck: orderForm.unitTruck || null,
        job_number: orderForm.jobNumber || null,
        total_value: orderValue,
        status: "Submitted",
        notes: orderForm.notes || null,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      setMessage(`Order failed: ${orderError?.message || "order was not created"}`);
      setSaving(false);
      return;
    }

    const linePayload = orderCart.map((line) => ({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      order_id: order.id,
      order_number: orderNumber,
      item_id: line.itemId,
      item_code: line.itemCode,
      item_name: line.itemName,
      qty_requested: line.quantity,
      qty_fulfilled: 0,
      unit_cost: line.unitPrice,
      line_value: line.lineValue,
    }));

    const { error: lineError } = await supabase.from("inventory_order_lines").insert(linePayload);
    if (lineError) {
      setMessage(`Order created, line items failed: ${lineError.message}`);
      setSaving(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch("/api/inventory-order-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: order.id, recipientEmail: orderForm.emailTo || undefined }),
      }).catch(() => null);
    }

    setOrderForm({ ...emptyOrderForm, requestedBy: userName });
    setOrderCart([]);
    await Promise.all([loadOrders(selectedInventoryYardId), loadOrderLines(selectedInventoryYardId)]);
    setExpandedOrderId(order.id);
    setMessage(`Consumable order ${orderNumber} submitted.`);
    setSaving(false);
  }

  function linesForOrder(order: InventoryOrder) {
    return orderLines.filter((line) => line.orderId === order.id || line.orderNumber === order.orderNumber);
  }

  function linesForPurchaseOrder(order: PurchaseOrderSummary) {
    return purchaseOrderLines.filter((line) => line.purchaseOrderId === order.id);
  }

  function openInventoryDocument(document: { action: string; sourceId: string }) {
    if (document.action === "tickets") {
      setExpandedTicketId(document.sourceId);
      setActiveView("tickets");
      return;
    }
    if (document.action === "orders") {
      setExpandedOrderId(document.sourceId);
      setActiveView("orders");
      return;
    }
    window.location.href = "/purchase-orders";
  }

  function printInventoryDocument(document: { action: string; sourceId: string }) {
    if (document.action === "tickets") {
      const ticket = tickets.find((candidate) => candidate.id === document.sourceId);
      if (ticket) printIssueTicket(ticket);
      return;
    }
    if (document.action === "orders") {
      const order = orders.find((candidate) => candidate.id === document.sourceId);
      if (order) printOrder(order);
      return;
    }
    window.location.href = "/purchase-orders";
  }

  function pickTicketNumber(order: InventoryOrder) {
    return order.orderNumber.replace(/^ORD-/, "PICK-");
  }

  function orderHtml(order: InventoryOrder, lines: InventoryOrderLine[], title = "Consumable Order") {
    const totalQty = lines.reduce((sum, line) => sum + line.qtyRequested, 0);
    const totalValue = lines.reduce((sum, line) => sum + line.lineValue, 0);
    const documentNumber = title === "Pick Ticket" ? pickTicketNumber(order) : order.orderNumber;

    return `<!doctype html>
      <html>
        <head>
          <title>${order.orderNumber}</title>
          <style>
            @page { size: letter; margin: 0.45in; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; background: #fff; }
            .sheet { max-width: 980px; margin: 0 auto; }
            .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #f97316; padding-bottom: 18px; margin-bottom: 22px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .brand img { width: 150px; max-height: 80px; object-fit: contain; }
            h1 { margin: 0 0 6px; font-size: 26px; }
            h2 { margin: 0; font-size: 20px; }
            .company { text-align: right; font-size: 13px; line-height: 1.35; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #cbd5e1; margin: 18px 0; }
            .cell { border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 10px; min-height: 54px; }
            .cell:nth-child(4n) { border-right: 0; }
            .label { display: block; color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
            .value { font-size: 14px; font-weight: 800; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
            th { background: #111827; color: #fff; text-align: left; padding: 8px; }
            td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
            .total td { font-weight: 800; }
            .notes { border: 1px solid #cbd5e1; padding: 12px; margin-top: 18px; min-height: 80px; white-space: pre-wrap; }
            .print-actions { display: flex; justify-content: flex-end; gap: 8px; margin: 12px auto; max-width: 980px; }
            .print-actions button { border: 0; border-radius: 6px; padding: 10px 14px; font-weight: 800; cursor: pointer; }
            .primary { background: #f97316; color: #111827; }
            .secondary { background: #111827; color: #fff; }
            @media print { .print-actions { display: none; } body { background: #fff; } }
          </style>
        </head>
        <body>
          <div class="print-actions">
            <button class="secondary" onclick="window.close()">Close</button>
            <button class="primary" onclick="window.print()">Print / Save PDF</button>
          </div>
          <main class="sheet">
            <section class="top">
              <div class="brand">
                <img src="/titan_logo.jpg" alt="TITAN" />
                <div>
                  <h1>${title}</h1>
                  <h2>${documentNumber}</h2>
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
              <div class="cell"><span class="label">Date</span><span class="value">${order.orderDate || "-"}</span></div>
              <div class="cell"><span class="label">Requested By</span><span class="value">${order.requestedBy || "-"}</span></div>
              <div class="cell"><span class="label">Department</span><span class="value">${order.department || "-"}</span></div>
              <div class="cell"><span class="label">Status</span><span class="value">${order.status || "Submitted"}</span></div>
              <div class="cell"><span class="label">Unit / Truck</span><span class="value">${order.unitTruck || "-"}</span></div>
              <div class="cell"><span class="label">Job Number</span><span class="value">${order.jobNumber || "-"}</span></div>
              <div class="cell"><span class="label">Total Qty</span><span class="value">${totalQty.toLocaleString()}</span></div>
              <div class="cell"><span class="label">Estimated Value</span><span class="value">${money(totalValue || order.totalValue)}</span></div>
            </section>
            <table>
              <thead>
                <tr><th>Item ID</th><th>Item Name</th><th>Qty Requested</th><th>Qty Fulfilled</th><th>Unit Cost</th><th>Line Value</th></tr>
              </thead>
              <tbody>
                ${lines
                  .map(
                    (line) => `<tr>
                      <td>${line.itemCode || "-"}</td>
                      <td>${line.itemName || "-"}</td>
                      <td>${line.qtyRequested.toLocaleString()}</td>
                      <td>${line.qtyFulfilled.toLocaleString()}</td>
                      <td>${money(line.unitCost)}</td>
                      <td>${money(line.lineValue)}</td>
                    </tr>`,
                  )
                  .join("")}
                <tr class="total"><td colspan="2">Totals</td><td>${totalQty.toLocaleString()}</td><td></td><td></td><td>${money(totalValue || order.totalValue)}</td></tr>
              </tbody>
            </table>
            <section class="notes"><strong>Notes</strong><br />${order.notes || "No notes."}</section>
          </main>
        </body>
      </html>`;
  }

  function printOrder(order: InventoryOrder) {
    const printWindow = window.open("", "_blank", "width=1100,height=850");
    if (!printWindow) {
      setMessage("Pop-up blocked. Allow pop-ups to print the order.");
      return;
    }
    printWindow.document.write(orderHtml(order, linesForOrder(order)));
    printWindow.document.close();
  }

  function printPickTicket(order: InventoryOrder) {
    const printWindow = window.open("", "_blank", "width=1100,height=850");
    if (!printWindow) {
      setMessage("Pop-up blocked. Allow pop-ups to print the pick ticket.");
      return;
    }
    printWindow.document.write(orderHtml(order, linesForOrder(order), "Pick Ticket"));
    printWindow.document.close();
  }

  async function emailOrder(order: InventoryOrder) {
    const recipientEmail = window.prompt("Email this consumable order to:", orderForm.emailTo || "");
    if (!recipientEmail) return;

    setEmailingOrderId(order.id);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage("Your login session expired. Sign in again before emailing.");
      setEmailingOrderId("");
      return;
    }

    const response = await fetch("/api/inventory-order-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId: order.id, recipientEmail }),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(`Email failed: ${result?.error || "Unknown error."}`);
    } else {
      setMessage(`Consumable order ${order.orderNumber} emailed to ${recipientEmail}.`);
    }

    setEmailingOrderId("");
  }

  function orderIsFulfilled(order: InventoryOrder) {
    return (order.status || "").toLowerCase() === "fulfilled";
  }

  function orderIsRejected(order: InventoryOrder) {
    return (order.status || "").toLowerCase() === "rejected";
  }

  function orderIsCancelled(order: InventoryOrder) {
    const status = (order.status || "").toLowerCase();
    return status === "cancelled" || status === "canceled";
  }

  function orderIsClosed(order: InventoryOrder) {
    return orderIsFulfilled(order) || orderIsCancelled(order) || orderIsRejected(order);
  }

  function issueTicketForOrder(order: InventoryOrder) {
    const orderNeedle = order.orderNumber.toLowerCase();
    return tickets.find((ticket) => String(ticket.notes || "").toLowerCase().includes(orderNeedle)) || null;
  }

  async function updateOrderStatus(order: InventoryOrder, status: string) {
    if (!canManageInventory || orderIsClosed(order)) return;

    const reason = status === "Rejected" ? window.prompt("Optional rejection reason:", "") : "";
    if (reason === null) return;

    setSaving(true);
    setMessage("");

    const nextNotes = reason.trim()
      ? `${order.notes ? `${order.notes}\n` : ""}${status}: ${reason.trim()}`
      : order.notes || null;

    const { error } = await supabase
      .from("inventory_orders")
      .update({
        status,
        notes: nextNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (error) {
      setMessage(`Request status failed: ${error.message}`);
    } else {
      await loadOrders(selectedInventoryYardId);
      setExpandedOrderId(order.id);
      setMessage(`${order.orderNumber} moved to ${status}.`);
    }

    setSaving(false);
  }

  function fulfillmentQtyForLine(line: InventoryOrderLine) {
    const draftValue = orderFulfillmentDrafts[line.id];
    const sourceValue = draftValue ?? String(line.qtyFulfilled || line.qtyRequested || 0);
    return Math.max(0, Math.min(line.qtyRequested, numberValue(sourceValue)));
  }

  function updateFulfillmentDraft(line: InventoryOrderLine, value: string) {
    const numericValue = Math.max(0, Math.min(line.qtyRequested, numberValue(value)));
    setOrderFulfillmentDrafts((current) => ({ ...current, [line.id]: String(numericValue) }));
  }

  async function saveFulfillmentAmounts(order: InventoryOrder) {
    if (!canManageInventory || orderIsClosed(order)) return;
    const lines = linesForOrder(order);
    if (lines.length === 0) {
      setMessage("No line items found for this order.");
      return;
    }

    setSaving(true);
    setMessage("");

    for (const line of lines) {
      const qtyToFulfill = fulfillmentQtyForLine(line);
      const { error } = await supabase
        .from("inventory_order_lines")
        .update({ qty_fulfilled: qtyToFulfill })
        .eq("id", line.id);

      if (error) {
        setMessage(`Could not save fulfilled amount for ${line.itemCode}: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    await loadOrderLines(selectedInventoryYardId);
    setMessage(`Fulfilled amounts saved for ${order.orderNumber}.`);
    setSaving(false);
  }

  async function cancelOrder(order: InventoryOrder) {
    if (!canManageInventory || orderIsFulfilled(order)) return;

    const reason = window.prompt("Optional cancellation reason:", "");
    if (reason === null) return;

    setSaving(true);
    setMessage("");

    const cancellationNote = reason.trim();
    const nextNotes = cancellationNote
      ? `${order.notes ? `${order.notes}\n` : ""}Cancelled: ${cancellationNote}`
      : order.notes || null;

    const { error } = await supabase
      .from("inventory_orders")
      .update({
        status: "Cancelled",
        notes: nextNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (error) {
      setMessage(`Cancel failed: ${error.message}`);
      setSaving(false);
      return;
    }

    await loadOrders(selectedInventoryYardId);
    setMessage(`Consumable order ${order.orderNumber} cancelled.`);
    setSaving(false);
  }

  async function fulfillOrder(order: InventoryOrder) {
    if (!canManageInventory) return;
    if (orderIsClosed(order)) {
      setMessage("Closed requests cannot be fulfilled.");
      return;
    }

    const lines = linesForOrder(order);
    if (lines.length === 0) {
      setMessage("No line items found for this order.");
      return;
    }

    setSaving(true);
    setMessage("");

    const targetLines = lines
      .map((line) => {
        const item = items.find((candidate) => candidate.id === line.itemId);
        return { line, item, qtyToFulfill: fulfillmentQtyForLine(line) };
      })
      .filter((entry) => entry.qtyToFulfill > 0);
    const totalToFulfill = targetLines.reduce((sum, entry) => sum + entry.qtyToFulfill, 0);

    if (totalToFulfill <= 0) {
      setMessage("Enter at least one fulfilled quantity before marking the order fulfilled.");
      setSaving(false);
      return;
    }

    for (const { line, item, qtyToFulfill } of targetLines) {
      if (!item) {
        setMessage(`${line.itemCode || line.itemName} is no longer tied to an inventory item.`);
        setSaving(false);
        return;
      }
      if (item.qtyOnHand < qtyToFulfill) {
        setMessage(`${item.itemCode} does not have enough quantity to fulfill this order.`);
        setSaving(false);
        return;
      }
    }

    const ticketNumber = `ISS-${todayStamp()}`;
    const totalIssueValue = targetLines.reduce((sum, entry) => sum + entry.qtyToFulfill * entry.line.unitCost, 0);

    const { data: ticket, error: ticketError } = await supabase
      .from("inventory_issue_tickets")
      .insert({
        ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
        ticket_number: ticketNumber,
        issue_date: new Date().toISOString().slice(0, 10),
        issued_to: order.requestedBy || "Consumables Store",
        department: order.department || null,
        picked_by: userName,
        unit_truck: order.unitTruck || null,
        job_number: order.jobNumber || null,
        total_value: totalIssueValue,
        status: "Issued",
        notes: `Fulfilled from Consumables Store request ${order.orderNumber}.${order.notes ? `\n${order.notes}` : ""}`,
      })
      .select("id")
      .single();

    if (ticketError || !ticket) {
      setMessage(`Issue ticket failed: ${ticketError?.message || "ticket was not created"}`);
      setSaving(false);
      return;
    }

    const issueLinePayload = targetLines.map(({ line, qtyToFulfill }) => ({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      issue_ticket_id: ticket.id,
      ticket_number: ticketNumber,
      item_id: line.itemId,
      item_code: line.itemCode,
      item_name: line.itemName,
      department: order.department || null,
      qty_issued: qtyToFulfill,
      unit_cost: line.unitCost,
      line_value: qtyToFulfill * line.unitCost,
      unit_truck: order.unitTruck || null,
      picked_by: userName,
      line_processed: true,
    }));

    const { error: issueLineError } = await supabase.from("inventory_issue_ticket_lines").insert(issueLinePayload);
    if (issueLineError) {
      setMessage(`Issue ticket created, but lines failed: ${issueLineError.message}`);
      setSaving(false);
      return;
    }

    for (const { line, item, qtyToFulfill } of targetLines) {
      if (!item) continue;
      const nextQty = item.qtyOnHand - qtyToFulfill;
      const { error: itemError } = await supabase
        .from("inventory_items")
        .update({ qty_on_hand: nextQty, low_stock: nextQty <= item.minQuantity })
        .eq("id", item.id);

      if (itemError) {
        setMessage(`Fulfillment failed for ${item.itemCode}: ${itemError.message}`);
        setSaving(false);
        return;
      }

      await supabase
        .from("inventory_order_lines")
        .update({ qty_fulfilled: qtyToFulfill, fulfilled_at: new Date().toISOString(), fulfilled_by: userName })
        .eq("id", line.id);

      await supabase.from("inventory_transactions").insert({
        ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
        item_id: item.id,
        item_code: item.itemCode,
        transaction_type: "Issue",
        quantity: qtyToFulfill,
        reference_type: "Issue Ticket",
        reference_number: ticketNumber,
        entered_by: userName,
        notes: `Fulfilled from Consumables Store request ${order.orderNumber}`,
        transaction_source: "TITAN Inventory",
        quantity_direction: "Out",
      });
    }

    const nextOrderNotes = `${order.notes ? `${order.notes}\n` : ""}Fulfilled by issue ticket ${ticketNumber}`;
    await supabase
      .from("inventory_orders")
      .update({
        status: "Fulfilled",
        fulfilled_at: new Date().toISOString(),
        fulfilled_by: userName,
        notes: nextOrderNotes,
      })
      .eq("id", order.id);

    const [, , , , loadedTickets] = await Promise.all([
      loadItems(selectedInventoryYardId),
      loadTransactions(selectedInventoryYardId),
      loadOrders(selectedInventoryYardId),
      loadOrderLines(selectedInventoryYardId),
      loadTickets(selectedInventoryYardId),
    ]);
    await loadIssueTicketLines(selectedInventoryYardId, inventoryYards, loadedTickets);
    setOrderFulfillmentDrafts({});
    setExpandedTicketId(ticket.id);
    setActiveView("tickets");
    setMessage(`Consumables Store request ${order.orderNumber} fulfilled and issue ticket ${ticketNumber} created.`);
    setSaving(false);
  }

  async function saveIssueTicket() {
    if (issueCart.length === 0) {
      setMessage("Add at least one item to the issue cart.");
      return;
    }

    const invalidLine = issueCart.find((line) => line.quantity <= 0 || line.quantity > line.qtyOnHand);
    if (invalidLine) {
      setMessage(`${invalidLine.itemCode} has an invalid issue quantity.`);
      return;
    }

    if (!issueForm.issuedTo.trim()) {
      setMessage("Issued To is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const ticketNumber = `ISS-${todayStamp()}`;

    const { data: ticket, error: ticketError } = await supabase
      .from("inventory_issue_tickets")
      .insert({
        ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
        ticket_number: ticketNumber,
        issue_date: new Date().toISOString().slice(0, 10),
        issued_to: issueForm.issuedTo,
        department: issueForm.department || null,
        picked_by: issueForm.pickedBy || userName,
        unit_truck: issueForm.unitTruck || null,
        job_number: issueForm.jobNumber || null,
        total_value: cartValue,
        status: "Issued",
        notes: issueForm.notes || null,
      })
      .select("id")
      .single();

    if (ticketError || !ticket) {
      setMessage(`Issue failed: ${ticketError?.message || "ticket was not created"}`);
      setSaving(false);
      return;
    }

    const linePayload = issueCart.map((line) => ({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      issue_ticket_id: ticket.id,
      ticket_number: ticketNumber,
      item_id: line.itemId,
      item_code: line.itemCode,
      item_name: line.itemName,
      department: issueForm.department || null,
      qty_issued: line.quantity,
      unit_cost: line.unitPrice,
      line_value: line.lineValue,
      unit_truck: issueForm.unitTruck || null,
      picked_by: issueForm.pickedBy || userName,
      line_processed: true,
    }));

    const { error: lineError } = await supabase.from("inventory_issue_ticket_lines").insert(linePayload);

    if (lineError) {
      setMessage(`Issue ticket created, line failed: ${lineError.message}`);
      setSaving(false);
      return;
    }

    for (const line of issueCart) {
      const nextQty = line.qtyOnHand - line.quantity;
      const { error: itemError } = await supabase
        .from("inventory_items")
        .update({ qty_on_hand: nextQty, low_stock: nextQty <= line.minQuantity })
        .eq("id", line.itemId);

      if (itemError) {
        setMessage(`Issue line saved, ${line.itemCode} quantity failed: ${itemError.message}`);
        setSaving(false);
        return;
      }
    }

    const transactionPayload = issueCart.map((line) => ({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      item_id: line.itemId,
      item_code: line.itemCode,
      transaction_type: "Issue",
      quantity: line.quantity,
      reference_type: "Issue Ticket",
      reference_number: ticketNumber,
      entered_by: issueForm.pickedBy || userName,
      notes: issueForm.notes || null,
      transaction_source: "TITAN Inventory",
      quantity_direction: "Out",
    }));

    await supabase.from("inventory_transactions").insert(transactionPayload);

    setIssueOpen(false);
    setIssueForm({ ...emptyIssueForm, pickedBy: userName });
    setIssueCart([]);
    setScanInput("");
    const [, , loadedTickets] = await Promise.all([
      loadItems(selectedInventoryYardId),
      loadTransactions(selectedInventoryYardId),
      loadTickets(selectedInventoryYardId),
    ]);
    await loadIssueTicketLines(selectedInventoryYardId, inventoryYards, loadedTickets);
    setMessage(`Issue ticket ${ticketNumber} created with ${issueCart.length} line items.`);
    setSaving(false);
  }

  function linesForTicket(ticket: IssueTicket) {
    return ticketLines.filter((line) => line.issueTicketId === ticket.id || line.ticketNumber === ticket.ticketNumber);
  }

  function issueTicketHtml(ticket: IssueTicket, lines: IssueTicketLine[]) {
    const totalQty = lines.reduce((sum, line) => sum + line.qtyIssued, 0);
    const totalValue = lines.reduce((sum, line) => sum + line.lineValue, 0);

    return `<!doctype html>
      <html>
        <head>
          <title>${ticket.ticketNumber}</title>
          <style>
            @page { size: letter; margin: 0.45in; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; background: #fff; }
            .sheet { max-width: 980px; margin: 0 auto; }
            .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #f97316; padding-bottom: 18px; margin-bottom: 22px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .brand img { width: 150px; max-height: 80px; object-fit: contain; }
            h1 { margin: 0 0 6px; font-size: 26px; }
            h2 { margin: 0; font-size: 20px; }
            .company { text-align: right; font-size: 13px; line-height: 1.35; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #cbd5e1; margin: 18px 0; }
            .cell { border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 10px; min-height: 54px; }
            .cell:nth-child(4n) { border-right: 0; }
            .label { display: block; color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
            .value { font-size: 14px; font-weight: 800; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
            th { background: #111827; color: #fff; text-align: left; padding: 8px; }
            td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
            .total td { font-weight: 800; }
            .notes { border: 1px solid #cbd5e1; padding: 12px; margin-top: 18px; min-height: 80px; white-space: pre-wrap; }
            .print-actions { display: flex; justify-content: flex-end; gap: 8px; margin: 12px auto; max-width: 980px; }
            .print-actions button { border: 0; border-radius: 6px; padding: 10px 14px; font-weight: 800; cursor: pointer; }
            .primary { background: #f97316; color: #111827; }
            .secondary { background: #111827; color: #fff; }
            @media print { .print-actions { display: none; } body { background: #fff; } }
          </style>
        </head>
        <body>
          <div class="print-actions">
            <button class="secondary" onclick="window.close()">Close</button>
            <button class="primary" onclick="window.print()">Print / Save PDF</button>
          </div>
          <main class="sheet">
            <section class="top">
              <div class="brand">
                <img src="/titan_logo.jpg" alt="TITAN" />
                <div>
                  <h1>Issue Ticket</h1>
                  <h2>${ticket.ticketNumber}</h2>
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
              <div class="cell"><span class="label">Date</span><span class="value">${ticket.issueDate || "-"}</span></div>
              <div class="cell"><span class="label">Issued To</span><span class="value">${ticket.issuedTo || "-"}</span></div>
              <div class="cell"><span class="label">Department</span><span class="value">${ticket.department || "-"}</span></div>
              <div class="cell"><span class="label">Status</span><span class="value">${ticket.status || "Issued"}</span></div>
              <div class="cell"><span class="label">Picked By</span><span class="value">${ticket.pickedBy || "-"}</span></div>
              <div class="cell"><span class="label">Unit / Truck</span><span class="value">${ticket.unitTruck || "-"}</span></div>
              <div class="cell"><span class="label">Job Number</span><span class="value">${ticket.jobNumber || "-"}</span></div>
              <div class="cell"><span class="label">Total Value</span><span class="value">${money(totalValue || ticket.totalValue)}</span></div>
            </section>
            <table>
              <thead>
                <tr><th>Item ID</th><th>Item Name</th><th>Department</th><th>Qty</th><th>Unit Cost</th><th>Line Value</th></tr>
              </thead>
              <tbody>
                ${lines
                  .map(
                    (line) => `<tr>
                      <td>${line.itemCode || "-"}</td>
                      <td>${line.itemName || "-"}</td>
                      <td>${line.department || "-"}</td>
                      <td>${line.qtyIssued.toLocaleString()}</td>
                      <td>${money(line.unitCost)}</td>
                      <td>${money(line.lineValue)}</td>
                    </tr>`,
                  )
                  .join("")}
                <tr class="total"><td colspan="3">Totals</td><td>${totalQty.toLocaleString()}</td><td></td><td>${money(totalValue || ticket.totalValue)}</td></tr>
              </tbody>
            </table>
            <section class="notes"><strong>Notes</strong><br />${ticket.notes || "No notes."}</section>
          </main>
        </body>
      </html>`;
  }

  function printIssueTicket(ticket: IssueTicket) {
    const printWindow = window.open("", "_blank", "width=1100,height=850");
    if (!printWindow) {
      setMessage("Pop-up blocked. Allow pop-ups to print the issue ticket.");
      return;
    }
    printWindow.document.write(issueTicketHtml(ticket, linesForTicket(ticket)));
    printWindow.document.close();
  }

  async function emailIssueTicket(ticket: IssueTicket) {
    const recipientEmail = window.prompt("Email this issue ticket to:");
    if (!recipientEmail) return;
    const note = window.prompt("Optional message to include:") || "";

    setEmailingTicketId(ticket.id);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage("Your login session expired. Sign in again before emailing.");
      setEmailingTicketId("");
      return;
    }

    const response = await fetch("/api/inventory-issue-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ticketId: ticket.id, recipientEmail, note }),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(`Email failed: ${result?.error || "Unknown error."}`);
    } else {
      setMessage(`Issue ticket ${ticket.ticketNumber} emailed to ${recipientEmail}.`);
    }

    setEmailingTicketId("");
  }

  function exportInventory() {
    downloadCsv(
      "titan-inventory.csv",
      ["Item ID", "Item Name", "Category", "Location", "Vendor", "Qty On Hand", "Min Qty", "Max Qty", "Unit Price", "Value", "UOM", "Active"],
      filteredItems.map((item) => [
        item.itemCode,
        item.itemName,
        item.category,
        item.location,
        item.vendorName,
        item.qtyOnHand,
        item.minQuantity,
        item.maxQuantity,
        item.unitPrice,
        item.qtyOnHand * item.unitPrice,
        item.uom,
        item.active ? "Yes" : "No",
      ]),
    );
  }

  if (!canUseInventory && !loading) {
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
    <main className={`module-shell inventory-module consum-scope ${activeView === "orders" ? "store-mode" : ""}`}>
      <section className="page-head no-print">
        <div>
          <div className="pt">Consumables — Inventory Control</div>
          <div className="ps">
            Live TITAN warehouse and shop inventory.{" "}
            <span>{selectedInventoryYard?.name || "Loading yard"}</span>
          </div>
        </div>
        <div className="statusline">
          <span className="pill ok">Live TITAN data</span>
          <label className="branch-inline">
            <span>Yard</span>
            <select
              value={selectedInventoryYardId}
              onChange={(event) => handleInventoryYardChange(event.target.value)}
              disabled={loading || inventoryYards.length <= 1}
            >
              {inventoryYards.map((yard) => (
                <option key={yard.id} value={yard.id}>
                  {yard.name}
                </option>
              ))}
            </select>
          </label>
          <button className="ci-btn mini" onClick={() => (window.location.href = "/home")}>Home</button>
          <button className="ci-btn mini" onClick={loadPage} disabled={loading}>Refresh</button>
          <button className="ci-btn mini" onClick={() => window.print()}>Print</button>
          <button className="ci-btn mini" onClick={exportInventory}>Export CSV</button>
        </div>
      </section>

      {message && <div className="modal-message">{message}</div>}

      {activeView !== "orders" && (
        <section className="kpis k5 inventory-top-kpis">
          <article className="kpi warn">
            <div className="lab">Issue tickets</div>
            <div className="val mono">{dashboardTicketRefs.size.toLocaleString()}</div>
            <div className="note">{dashboardPeriodLabel} · {dashboardIssueQuantity.toLocaleString()} units issued</div>
          </article>
          <article className="kpi steel">
            <div className="lab">Purchase orders</div>
            <div className="val mono">{dashboardPoRefs.size.toLocaleString()}</div>
            <div className="note">{dashboardPeriodLabel} PO activity</div>
          </article>
          <article className="kpi good">
            <div className="lab">Consumables store</div>
            <div className="val mono">{pendingOrders.length.toLocaleString()}</div>
            <div className="note">Waiting on warehouse action</div>
          </article>
          <article className="kpi">
            <div className="lab">Inventory value</div>
            <div className="val mono">{money(totalValue)}</div>
            <div className="note">{activeItemCount.toLocaleString()} active items</div>
          </article>
          <article className="kpi bad">
            <div className="lab">Reorder alerts</div>
            <div className="val mono orange">{lowStockCount.toLocaleString()}</div>
            <div className="note">{outOfStockCount.toLocaleString()} out of stock · {pendingPoCount.toLocaleString()} open POs</div>
          </article>
        </section>
      )}

      <section className="ytabs ci-tabs no-print">
        {([
          ["dashboard", "Dashboard", ""],
          ...(canPlaceInventoryOrders ? [["orders", "Consumables Store", pendingOrders.length.toLocaleString()]] : []),
          ...(canManageInventory ? [["counter", "Issue Tickets", issueCart.length ? issueCart.length.toLocaleString() : ""] as [InventoryModuleView, string, string]] : []),
          ...(canManageInventory ? [["approvals", "PO Approvals", purchaseOrdersForApproval.length.toLocaleString()] as [InventoryModuleView, string, string]] : []),
          ...(canManageInventory ? [["reorder", "Reorder Queue", reorderItems.length.toLocaleString()] as [InventoryModuleView, string, string]] : []),
          ["items", "Item Master", activeItemCount.toLocaleString()],
          ...(canManageInventory ? [["tickets", "History", tickets.length.toLocaleString()], ["documents", "Documents", inventoryDocuments.length.toLocaleString()], ["vendors", "Vendors", vendors.length.toLocaleString()]] : []),
        ] as Array<[InventoryModuleView, string, string]>).map(([view, label, count]) => (
          <button
            key={view}
            className={`ytab ${activeView === view ? "on" : ""}`}
            type="button"
            onClick={() => activateInventoryView(view)}
          >
            {label}
            {count && <span className="yc">{count}</span>}
          </button>
        ))}
      </section>

      {activeView === "dashboard" && (
        <section className="ci-dashboard no-print">
          <div className="card">
            <h2><span className="dot"></span>Dashboard filters<span className="ct">{selectedInventoryYard?.name || "yard"}</span></h2>
            <div className="ci-dash-filters">
              <div className="ci-field">
                <div className="lab">Lookup</div>
                <input
                  className="ci-input"
                  value={dashboardSearch}
                  onChange={(event) => setDashboardSearch(event.target.value)}
                  placeholder="Search ticket, PO, item, vendor, crew..."
                />
              </div>
              <div className="ci-field">
                <div className="lab">Focus period</div>
                <select
                  className="ci-select"
                  value={dashboardPeriod}
                  onChange={(event) => setDashboardPeriod(event.target.value as DashboardPeriod)}
                >
                  {dashboardPeriodOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="ci-field">
                <div className="lab">Cost center</div>
                <select className="ci-select" value={dashboardDepartment} onChange={(event) => setDashboardDepartment(event.target.value)}>
                  <option value="all">All cost centers</option>
                  {dashboardDepartments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </div>
              <div className="ci-field">
                <div className="lab">Category</div>
                <select className="ci-select" value={dashboardCategory} onChange={(event) => setDashboardCategory(event.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="ci-field">
                <div className="lab">Vendor</div>
                <select className="ci-select" value={dashboardVendor} onChange={(event) => setDashboardVendor(event.target.value)}>
                  <option value="all">All vendors</option>
                  {dashboardVendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}
                </select>
              </div>
            </div>
            <div className="ci-sub">Issued spend is calculated only from issue tickets. PO spend is calculated from purchase order line value in the same date window.</div>
          </div>

          <div className="ci-spend-grid">
            {dashboardPeriodSnapshots.map((period) => (
              <button
                className={`ci-spend-card ${dashboardPeriod === period.value ? "focus" : ""}`}
                type="button"
                key={period.value}
                onClick={() => setDashboardPeriod(period.value)}
              >
                <div className="lab">{period.label} issued spend</div>
                <div className="val">{money(period.issueSpend)}</div>
                <div className="sub">PO spend {money(period.poSpend)}</div>
                <div className="sub">{period.issueTickets.toLocaleString()} issue tickets · {period.poCount.toLocaleString()} POs</div>
              </button>
            ))}
          </div>

          <div className="grid g2">
            <div className="card">
              <h2><span className="dot"></span>Spend by period<span className="ct">same filters</span></h2>
              <div className="ci-table-wrap compact-table-wrap">
                <table className="dt">
                  <thead>
                    <tr><th>Period</th><th className="num">Issued</th><th className="num">Tickets</th><th className="num">PO spend</th><th className="num">POs</th></tr>
                  </thead>
                  <tbody>
                    {dashboardPeriodSnapshots.map((period) => (
                      <tr key={period.value}>
                        <td><b>{period.label}</b><div className="ci-sub">{period.issueQty.toLocaleString()} units issued</div></td>
                        <td className="mono num">{money(period.issueSpend)}</td>
                        <td className="mono num">{period.issueTickets.toLocaleString()}</td>
                        <td className="mono num">{money(period.poSpend)}</td>
                        <td className="mono num">{period.poCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h2><span className="dot"></span>Spend breakdown<span className="ct">{dashboardPeriodLabel}</span></h2>
              <div className="sec-label">Issued by cost center</div>
              <div className="ci-dash-bars">
                {topIssuedUnits.length === 0 && <p className="muted-text">No issue ticket spend for this period.</p>}
                {topIssuedUnits.slice(0, 4).map((unit) => (
                  <div className="bar-row" key={unit.label}>
                    <div className="bn">{unit.label}</div>
                    <div className="bar-track"><span style={{ width: `${Math.max(4, Math.round((unit.value / dashboardSpendMax) * 100))}%` }} /></div>
                    <div className="bv">{money(unit.value)}</div>
                  </div>
                ))}
              </div>
              <div className="sec-label">Top items issued</div>
              <div className="ci-dash-bars">
                {topIssuedItems.length === 0 && <p className="muted-text">No items issued for this period.</p>}
                {topIssuedItems.slice(0, 4).map((item) => (
                  <div className="bar-row" key={item.label}>
                    <div className="bn">{item.label}</div>
                    <div className="bar-track"><span style={{ width: `${Math.max(4, Math.round((item.value / dashboardSpendMax) * 100))}%` }} /></div>
                    <div className="bv">{money(item.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid g2">
            <div className="card">
              <h2><span className="dot"></span>Consumables Store requests<span className="ct">{pendingOrders.length.toLocaleString()} open</span></h2>
              <div className="ci-queue">
                {pendingOrders.length === 0 && <p className="muted-text">No Consumables Store requests are waiting.</p>}
                {pendingOrders.slice(0, 6).map((order) => {
                  const lines = linesForOrder(order);
                  const requestedQty = lines.reduce((sum, line) => sum + line.qtyRequested, 0);
                  return (
                    <button
                      className="ci-line click-row"
                      type="button"
                      key={order.id}
                      onClick={() => {
                        setActiveView("orders");
                        setExpandedOrderId(order.id);
                      }}
                    >
                      <div>
                        <b>{order.orderNumber}</b>
                        <span>{order.requestedBy || "-"} · {order.department || "-"} · {order.orderDate || "-"}</span>
                      </div>
                      <div className="ci-num">
                        {requestedQty.toLocaleString()} req
                        <span>{money(order.totalValue)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h2><span className="dot"></span>Reorder attention<span className="ct">{lowStockItems.length.toLocaleString()} lines</span></h2>
              <div className="ci-queue">
                {lowStockItems.length === 0 && <p className="muted-text">All branch stock is above reorder minimum.</p>}
                {lowStockItems.slice(0, 6).map((item) => (
                  <button
                    className="ci-line click-row"
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setStockFilter("low");
                      setActiveView("items");
                    }}
                  >
                    <div>
                      <b>{item.itemCode}</b>
                      <span>{item.itemName} · {item.vendorName || "No vendor"}</span>
                    </div>
                    <div className="ci-num">
                      {item.qtyOnHand.toLocaleString()}
                      <span>min {item.minQuantity.toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid g2">
          <div className="card">
            <h2><span className="dot"></span>Issue-ticket spend detail<span className="ct">{dashboardIssueRows.length.toLocaleString()} lines</span></h2>
            {recentDashboardIssueRows.length === 0 ? (
              <p className="muted-text">No issue lines match the current filters.</p>
            ) : (
              <div className="ci-table-wrap compact-table-wrap">
                <table className="dt">
                  <thead><tr><th>Date</th><th>Ticket</th><th>Item</th><th>Cost Center</th><th>Qty</th><th>Spend</th></tr></thead>
                  <tbody>
                    {recentDashboardIssueRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.date || "-"}</td>
                        <td className="mono">{row.ref || "-"}</td>
                        <td><b>{row.sku || "-"}</b><div className="ci-sub">{row.item || "-"}</div></td>
                        <td>{row.costCenter || "-"}</td>
                        <td className="mono num">{row.qty.toLocaleString()}</td>
                        <td className="mono num">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2><span className="dot"></span>PO spend detail<span className="ct">{dashboardPoRows.length.toLocaleString()} lines</span></h2>
            {recentDashboardPoRows.length === 0 ? (
              <p className="muted-text">No PO lines match the current filters.</p>
            ) : (
              <div className="ci-table-wrap compact-table-wrap">
                <table className="dt">
                  <thead><tr><th>Date</th><th>PO</th><th>Item</th><th>Vendor</th><th>Qty</th><th>Spend</th></tr></thead>
                  <tbody>
                    {recentDashboardPoRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.date || "-"}</td>
                        <td className="mono">{row.ref || "-"}</td>
                        <td><b>{row.sku || "-"}</b><div className="ci-sub">{row.item || "-"}</div></td>
                        <td>{row.vendor || "-"}</td>
                        <td className="mono num">{row.qty.toLocaleString()}</td>
                        <td className="mono num">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>

          <div className="card">
            <h2><span className="dot"></span>Recent issue tickets<span className="ct">audit trail</span></h2>
            <div className="ci-queue">
            {recentIssueTickets.length === 0 && <p className="muted-text">No issue tickets found.</p>}
            {recentIssueTickets.map((ticket) => (
              <button
                className="ci-line click-row"
                type="button"
                key={ticket.id}
                onClick={() => {
                  setExpandedTicketId(ticket.id);
                  setActiveView("tickets");
                }}
              >
                <div>
                  <b>{ticket.ticketNumber}</b>
                  <span>{ticket.issuedTo || "-"} · {ticket.department || "-"} · {ticket.issueDate || "-"}</span>
                </div>
                <div className="ci-num">{money(ticket.totalValue)}<span>{ticket.status || "Issued"}</span></div>
              </button>
            ))}
            </div>
          </div>
        </section>
      )}

      {activeView === "orders" && (
        <>
          <section className="ci-layout ci-storefront-layout no-print">
            <div className="card ci-storefront-card">
              <div className="ci-store-shopping-head">
                <div>
                  <span>TITAN Store</span>
                  <h2>Consumables</h2>
                  <small>{selectedInventoryYard?.name || "Yard"} warehouse</small>
                </div>
                <div className="ci-store-cart-mini">
                  <span>Cart</span>
                  <b>{orderCart.length.toLocaleString()}</b>
                  <small>{money(orderValue)}</small>
                </div>
              </div>

              <div className="ci-store-search-row">
                <div className="ci-store-search-pill">
                  <span>Search</span>
                  <input
                    value={storeSearch}
                    onChange={(event) => setStoreSearch(event.target.value)}
                    placeholder="Search TITAN store"
                  />
                </div>
                <button className="ci-store-scan-btn" type="button" onClick={openCameraScanner} disabled={cameraScanning}>
                  {cameraScanning ? "Scanning" : "Scan"}
                </button>
              </div>

              <details className="ci-store-quick-add">
                <summary>Quick add by SKU or barcode</summary>
                <div className="ci-scanbar">
                  <div className="order-search-picker">
                  <input
                    ref={scanFieldRef}
                    className="ci-input scan-field"
                    value={scanInput}
                    onChange={(event) => {
                      setScanInput(event.target.value);
                      setOrderSearchOpen(true);
                    }}
                    onFocus={() => setOrderSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setOrderSearchOpen(false), 180)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addScannedItemToOrder();
                      }
                      if (event.key === "Escape") {
                        setOrderSearchOpen(false);
                      }
                    }}
                    placeholder="Scan barcode or type item ID, barcode, or item name"
                    autoComplete="off"
                  />
                    {orderSearchOpen && orderSearchMatches.length > 0 && (
                      <div className="order-search-menu">
                        {orderSearchMatches.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="order-search-option"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              chooseOrderSearchItem(item);
                            }}
                          >
                            <strong>{item.itemCode}</strong>
                            <span>{item.itemName}</span>
                            <small>
                              {item.barcode || "No barcode"} / {item.location || "No location"} / {item.qtyOnHand.toLocaleString()} on hand
                            </small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="ci-btn pri" onClick={addScannedItemToOrder}>Add</button>
                </div>
              </details>

              <div className="ci-store-category-strip">
                <button
                  className={storeCategory === "all" ? "on" : ""}
                  type="button"
                  onClick={() => setStoreCategory("all")}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    className={storeCategory === category ? "on" : ""}
                    key={category}
                    type="button"
                    onClick={() => setStoreCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <input
                ref={cameraFileRef}
                className="hidden-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => handleCameraBarcode(event.target.files?.[0])}
              />
              {cameraScanning ? (
                <video ref={cameraVideoRef} className="barcode-video" muted playsInline />
              ) : (
                <video ref={cameraVideoRef} className="barcode-video hidden-video" muted playsInline />
              )}
              <div className="ci-actions">
                {cameraScanning && <button className="ci-btn" onClick={stopCameraScanner}>Stop scan</button>}
                <button className="ci-btn" onClick={clearOrderCart} disabled={orderCart.length === 0}>Clear cart</button>
                {(storeSearch || storeCategory !== "all") && (
                  <button className="ci-btn" type="button" onClick={() => {
                    setStoreSearch("");
                    setStoreCategory("all");
                  }}>Clear search</button>
                )}
              </div>
              {cameraScanMessage && <div className="ci-notice">{cameraScanMessage}</div>}
              <div className="ci-store-results-row">
                <span>{storeItems.length.toLocaleString()} items</span>
                <span>{storeCategory === "all" ? "All categories" : storeCategory}</span>
              </div>

              {storeItems.length === 0 ? (
                <div className="empty-pos-cart">
                  <strong>No store items match this lookup.</strong>
                  <span>Try another item ID, name, vendor, barcode, or category.</span>
                </div>
              ) : (
                <div className="ci-store-grid">
                  {storeItems.slice(0, 48).map((item) => {
                    const status = stockStatus(item);
                    const inCart = orderCart.find((line) => line.itemId === item.id);
                    const pillClass = status === "Available" ? "ok" : status === "Reorder" ? "warn" : "bad";
                    return (
                      <article className="ci-store-item ci-store-product-card" key={item.id}>
                        <div className="ci-store-photo-stage">
                          {renderProductPhoto(item, "ci-product-photo ci-storefront-photo")}
                          <span className={`pill ${pillClass}`}>{status}</span>
                        </div>
                        <div className="ci-store-card-body">
                          <div className="ci-store-sku">{item.itemCode}</div>
                          <div className="ci-name" title={item.itemName}>{item.itemName}</div>
                          <div className="ci-store-meta">{item.category || "Uncategorized"} · {item.vendorName || "No vendor"}</div>
                          <div className="ci-store-price-row">
                            <b>{money(item.unitPrice)}</b>
                            <span>{item.qtyOnHand.toLocaleString()} on hand</span>
                          </div>
                          <div className="ci-store-fulfillment-row">
                            <span>Bin {item.location || "-"}</span>
                            <span>Min {item.minQuantity.toLocaleString()}</span>
                            <span>{item.uom || "unit"}</span>
                          </div>
                          <div className="request ci-store-buy-row">
                            <input
                              className="ci-input mono"
                              type="number"
                              min="1"
                              value={storeQuantities[item.id] || "1"}
                              onChange={(event) => setStoreQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                            />
                            <button className="ci-btn pri" type="button" onClick={() => addStoreItemToCart(item)}>Add to Cart</button>
                          </div>
                          {inCart && <div className="ci-store-cart-note">In cart: {inCart.quantity.toLocaleString()} {item.uom || "units"}</div>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ci-store-side">
              <div className="card ci-store-cart-card">
                <h2><span className="dot"></span>Request cart<span className="ct">employee order</span></h2>
                <div className="ci-request-summary">
                  <div className="ci-micro"><div className="lab">Lines</div><div className="val">{orderCart.length.toLocaleString()}</div></div>
                  <div className="ci-micro"><div className="lab">Quantity</div><div className="val">{orderQuantity.toLocaleString()}</div></div>
                  <div className="ci-micro"><div className="lab">Est. value</div><div className="val">{money(orderValue)}</div></div>
                </div>
                {orderCart.length === 0 ? (
                  <div className="empty-pos-cart">
                    <strong>No items in this request yet.</strong>
                    <span>Add items from the warehouse store catalog.</span>
                  </div>
                ) : (
                  <div className="ci-table-wrap compact-table-wrap">
                    <table className="dt">
                      <thead>
                        <tr><th>Item</th><th className="num">On hand</th><th className="num">Request</th><th className="num">Value</th><th></th></tr>
                      </thead>
                      <tbody>
                        {orderCart.map((line) => (
                          <tr key={line.itemId}>
                            <td><b>{line.itemCode}</b><div className="ci-sub">{line.itemName} · {line.location || "-"}</div></td>
                            <td className="mono num">{line.qtyOnHand.toLocaleString()}</td>
                            <td className="mono num">
                              <input
                                className="qty-input"
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={(event) => updateOrderCartQuantity(line.itemId, event.target.value)}
                              />
                            </td>
                            <td className="mono num">{money(line.lineValue)}</td>
                            <td><button className="ci-btn mini" onClick={() => removeOrderCartLine(line.itemId)}>Remove</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="ci-ticket-grid request-form-grid">
                  <input className="ci-input" value={orderForm.requestedBy} onChange={(event) => setOrderForm({ ...orderForm, requestedBy: event.target.value })} placeholder="Requested by / crew lead" />
                  <input className="ci-input" value={orderForm.department} onChange={(event) => setOrderForm({ ...orderForm, department: event.target.value })} placeholder="Department" />
                  <input className="ci-input" value={orderForm.unitTruck} onChange={(event) => setOrderForm({ ...orderForm, unitTruck: event.target.value })} placeholder="Unit / truck" />
                  <input className="ci-input" value={orderForm.jobNumber} onChange={(event) => setOrderForm({ ...orderForm, jobNumber: event.target.value })} placeholder="Job number" />
                  <input className="ci-input" value={orderForm.emailTo} onChange={(event) => setOrderForm({ ...orderForm, emailTo: event.target.value })} placeholder="Optional email recipient" />
                  <input className="ci-input" value={orderForm.notes} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} placeholder="Notes" />
                </div>
                <div className="ci-actions">
                  <button className="ci-btn" onClick={clearOrderCart} disabled={orderCart.length === 0}>Clear cart</button>
                  <button className="ci-btn pri" onClick={saveInventoryOrder} disabled={saving || orderCart.length === 0}>
                    {saving ? "Submitting..." : "Submit consumable order"}
                  </button>
                </div>
              </div>

              <div className="card request-queue-card">
                <h2><span className="dot"></span>Consumables Store queue<span className="ct">{pendingOrders.length.toLocaleString()} open</span></h2>
                <div className="ci-queue">
                  {orders.length === 0 && <p className="muted-text">No consumable orders found for this yard.</p>}
                  {orders.map((order) => {
                    const lines = linesForOrder(order);
                    const expanded = expandedOrderId === order.id;
                    const requestedQty = lines.reduce((sum, line) => sum + line.qtyRequested, 0);
                    const fulfilledQty = lines.reduce((sum, line) => sum + (expanded ? fulfillmentQtyForLine(line) : line.qtyFulfilled), 0);
                    const closedOrder = orderIsClosed(order);
                    const relatedIssueTicket = issueTicketForOrder(order);
                    const orderStatus = (order.status || "Submitted").toLowerCase();

                    return (
                      <article className={`ci-request-card ${expanded ? "focus" : ""}`} key={order.id}>
                        <button className="ci-detail-head request-summary-button" type="button" onClick={() => setExpandedOrderId(expanded ? "" : order.id)}>
                          <div>
                            <div className="ci-detail-title">{order.orderNumber}</div>
                            <div className="ci-sub">{order.requestedBy || "-"} · {order.department || "-"} · {order.orderDate || "-"}</div>
                          </div>
                          <span className={`pill ${closedOrder ? "neu" : orderStatus === "rejected" ? "bad" : orderStatus === "fulfilled" ? "ok" : "warn"}`}>{order.status || "Submitted"}</span>
                        </button>
                        <div className="ci-status-rail">
                          <span className="pill neu">{lines.length.toLocaleString()} lines</span>
                          <span className="pill neu">{requestedQty.toLocaleString()} requested</span>
                          <span className="pill neu">{fulfilledQty.toLocaleString()} fulfilled</span>
                          {relatedIssueTicket && <span className="pill ok">{relatedIssueTicket.ticketNumber}</span>}
                        </div>
                        {expanded && (
                          <>
                            <div className="ci-table-wrap compact-table-wrap">
                              <table className="dt">
                                <thead><tr><th>Line</th><th className="num">Requested</th><th className="num">Fulfilled</th><th className="num">Value</th></tr></thead>
                                <tbody>
                                  {lines.length === 0 && <tr><td colSpan={4}>No line items found for this order.</td></tr>}
                                  {lines.map((line) => (
                                    <tr key={line.id}>
                                      <td><b>{line.itemCode || "-"}</b><div className="ci-sub">{line.itemName || "-"}</div></td>
                                      <td className="mono num">{line.qtyRequested.toLocaleString()}</td>
                                      <td className="mono num">
                                        {canManageInventory && !closedOrder ? (
                                          <input
                                            className="qty-input fulfillment-qty-input"
                                            type="number"
                                            min="0"
                                            max={line.qtyRequested}
                                            value={orderFulfillmentDrafts[line.id] ?? String(line.qtyFulfilled || line.qtyRequested || 0)}
                                            onChange={(event) => updateFulfillmentDraft(line, event.target.value)}
                                          />
                                        ) : (
                                          line.qtyFulfilled.toLocaleString()
                                        )}
                                      </td>
                                      <td className="mono num">{money(line.lineValue)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {order.notes && <div className="ci-notice">{order.notes}</div>}
                            <div className="ci-actions">
                              <button className="ci-btn mini" type="button" onClick={() => printOrder(order)}>Print request</button>
                              <button className="ci-btn mini" type="button" onClick={() => emailOrder(order)} disabled={emailingOrderId === order.id}>
                                {emailingOrderId === order.id ? "Emailing..." : "Email"}
                              </button>
                              {relatedIssueTicket && (
                                <button className="ci-btn mini" type="button" onClick={() => {
                                  setExpandedTicketId(relatedIssueTicket.id);
                                  setActiveView("tickets");
                                }}>View issue ticket</button>
                              )}
                              {canManageInventory && !closedOrder && (
                                <>
                                  {orderStatus === "submitted" && (
                                    <>
                                      <button className="ci-btn mini green" type="button" onClick={() => updateOrderStatus(order, "Approved")} disabled={saving}>Approve</button>
                                      <button className="ci-btn mini red" type="button" onClick={() => updateOrderStatus(order, "Rejected")} disabled={saving}>Reject</button>
                                    </>
                                  )}
                                  {orderStatus === "approved" && (
                                    <button className="ci-btn mini" type="button" onClick={() => updateOrderStatus(order, "Picking")} disabled={saving}>Create pick ticket</button>
                                  )}
                                  {orderStatus === "picking" && (
                                    <>
                                      <button className="ci-btn mini" type="button" onClick={() => printPickTicket(order)}>Print pick ticket</button>
                                      <button className="ci-btn mini" type="button" onClick={() => saveFulfillmentAmounts(order)} disabled={saving}>Save amounts</button>
                                      <button className="ci-btn mini green" type="button" onClick={() => fulfillOrder(order)} disabled={saving}>Fulfill &amp; open receipt</button>
                                    </>
                                  )}
                                  <button className="ci-btn mini red" type="button" onClick={() => cancelOrder(order)} disabled={saving}>Cancel request</button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {activeView === "counter" && (
      <section className="inventory-dashboard no-print">
        <article className="ticket-card pos-card">
          <div className="detail-title-row">
            <div>
              <h3>Pick List</h3>
              <p className="muted-text">Scan a barcode, enter an item ID, or search by item name. Add several items, then create one issue ticket.</p>
            </div>
            <div className="pos-total">
              <strong>{cartQuantity.toLocaleString()}</strong>
              <span>items in cart / {money(cartValue)}</span>
            </div>
          </div>

          <div className="pos-scan-row">
            <input
              ref={scanFieldRef}
              className="field scan-field"
              value={scanInput}
              onChange={(event) => setScanInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addScannedItem();
                }
              }}
              placeholder="Scan barcode or type item ID"
              autoComplete="off"
            />
            <input
              ref={cameraFileRef}
              className="hidden-file-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => handleCameraBarcode(event.target.files?.[0])}
            />
            {cameraScanning && <video ref={cameraVideoRef} className="barcode-video" muted playsInline />}
            {!cameraScanning && <video ref={cameraVideoRef} className="barcode-video hidden-video" muted playsInline />}
            <button className="button" onClick={openCameraScanner} disabled={cameraScanning}>
              {cameraScanning ? "Scanning..." : "Scan Camera"}
            </button>
            {cameraScanning && <button className="button ghost" onClick={stopCameraScanner}>Stop Scan</button>}
            <button className="button primary" onClick={addScannedItem}>Add to Cart</button>
            <button className="button" onClick={() => openIssue()}>Complete Issue</button>
            <button className="button ghost" onClick={clearIssueCart} disabled={issueCart.length === 0}>Clear</button>
          </div>
          {cameraScanMessage && <div className="modal-message compact">{cameraScanMessage}</div>}

          {issueCart.length === 0 ? (
            <div className="empty-pos-cart">
              <strong>No items in issue cart.</strong>
              <span>Select Issue from the item table or scan an item to begin.</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Barcode</th>
                    <th>Location</th>
                    <th>On Hand</th>
                    <th>Issue Qty</th>
                    <th>Value</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {issueCart.map((line) => (
                    <tr key={line.itemId}>
                      <td>{line.itemCode}</td>
                      <td>{line.itemName}</td>
                      <td>{line.barcode || "-"}</td>
                      <td>{line.location || "-"}</td>
                      <td>{line.qtyOnHand.toLocaleString()}</td>
                      <td>
                        <input
                          className="qty-input"
                          type="number"
                          min="1"
                          max={line.qtyOnHand}
                          value={line.quantity}
                          onChange={(event) => updateCartQuantity(line.itemId, event.target.value)}
                        />
                      </td>
                      <td>{money(line.lineValue)}</td>
                      <td><button className="mini-button" onClick={() => removeCartLine(line.itemId)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <aside className="ticket-card stock-watch-card">
          <h3>Stock Watch</h3>
          <div className="stock-watch-metrics">
            <div><strong>{activeItemCount}</strong><span>Active</span></div>
            <div><strong>{lowStockCount}</strong><span>Low</span></div>
            <div><strong>{outOfStockCount}</strong><span>Out</span></div>
          </div>
          {lowStockItems.length === 0 ? (
            <p className="muted-text">No low stock items right now.</p>
          ) : (
            lowStockItems.map((item) => (
              <button className="list-card-button compact-list-button" key={item.id} onClick={() => setSelectedItemId(item.id)}>
                <strong>{item.itemCode}</strong>
                <span>{item.itemName}</span>
                <small>{item.qtyOnHand.toLocaleString()} on hand / min {item.minQuantity.toLocaleString()}</small>
              </button>
            ))
          )}
        </aside>
      </section>
      )}

      {activeView === "items" && (
        <>
          <section className="card item-setup-card no-print">
            <h2><span className="dot"></span>Item Setup<span className="ct">Create / update SKU</span></h2>
            <div className="item-setup-photo-row">
              <div className="item-setup-photo">
                {itemPhotoDraft ? (
                  <img className="item-setup-photo-img" src={itemPhotoDraft} alt={itemForm.itemName || itemForm.itemCode || "Product photo"} />
                ) : (
                <div className="item-setup-photo-initials">{productInitials({
                  id: itemForm.id,
                  itemCode: itemForm.itemCode || "SKU",
                  itemName: itemForm.itemName || "New Item",
                  category: itemForm.category || "Item",
                  location: itemForm.location,
                  vendorId: itemForm.vendorId,
                  vendorName: itemForm.vendorName,
                  qtyOnHand: numberValue(itemForm.qtyOnHand),
                  minQuantity: numberValue(itemForm.minQuantity),
                  maxQuantity: numberValue(itemForm.maxQuantity),
                  unitPrice: numberValue(itemForm.unitPrice),
                  barcode: itemForm.barcode,
                  uom: itemForm.uom,
                  active: itemForm.active,
                  lowStock: numberValue(itemForm.qtyOnHand) <= numberValue(itemForm.minQuantity),
                  photoUrl: itemPhotoDraft,
                })}</div>
                )}
                <div className="item-setup-photo-band" />
                <strong>{itemForm.category || "Category"}</strong>
              </div>
              <div className="item-setup-photo-control">
                <label className="ci-field full">
                  <div className="lab">Product photo</div>
                  <input
                    className="ci-input"
                    value={itemPhotoDraft}
                    onChange={(event) => setItemPhotoDraft(event.target.value)}
                    placeholder="Photo URL or upload from device"
                  />
                </label>
                <div className="ci-sub">Use a product photo URL, upload from files, or take a photo with a mobile device camera.</div>
                <input
                  ref={itemPhotoUploadRef}
                  className="hidden-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleItemPhotoFile(event.target.files?.[0])}
                />
                <input
                  ref={itemPhotoCameraRef}
                  className="hidden-file-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handleItemPhotoFile(event.target.files?.[0])}
                />
                <div className="ci-actions">
                  <button className="ci-btn" type="button" onClick={() => itemPhotoCameraRef.current?.click()} disabled={saving || !itemForm.id}>Take Photo</button>
                  <button className="ci-btn" type="button" onClick={() => itemPhotoUploadRef.current?.click()} disabled={saving || !itemForm.id}>Upload Photo</button>
                  <button className="ci-btn" type="button" onClick={clearItemPhoto} disabled={saving}>Clear Photo</button>
                </div>
                <div className="ci-sub">{itemPhotoDraft ? "This photo will appear in the Consumables Store and Item Master." : "No saved photo yet. The store will show a generated category tile until one is added."}</div>
              </div>
            </div>

            <div className="item-setup-grid">
              <label className="ci-field"><div className="lab">SKU / Item ID</div><input className="ci-input" value={itemForm.itemCode} onChange={(event) => setItemForm({ ...itemForm, itemCode: event.target.value })} /><div className="ci-sub">Unique item code used for lookup, scanning, tickets, and imports.</div></label>
              <label className="ci-field"><div className="lab">Item Name</div><input className="ci-input" value={itemForm.itemName} onChange={(event) => setItemForm({ ...itemForm, itemName: event.target.value })} /><div className="ci-sub">Plain-English product name employees will see in the store.</div></label>
              <label className="ci-field"><div className="lab">Category</div><input className="ci-input" value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} /><div className="ci-sub">Groups items for filtering and dashboard spend.</div></label>
              <label className="ci-field"><div className="lab">Unit of Measure</div><input className="ci-input" value={itemForm.uom} onChange={(event) => setItemForm({ ...itemForm, uom: event.target.value })} /><div className="ci-sub">How the item is counted or issued: can, pair, pail, each, spool.</div></label>
              <label className="ci-field"><div className="lab">Bin Location</div><input className="ci-input" value={itemForm.location} onChange={(event) => setItemForm({ ...itemForm, location: event.target.value })} /><div className="ci-sub">Where warehouse staff physically find it.</div></label>
              <label className="ci-field"><div className="lab">Barcode</div><input className="ci-input" value={itemForm.barcode} onChange={(event) => setItemForm({ ...itemForm, barcode: event.target.value })} /><div className="ci-sub">Scanner code. If blank, TITAN can use the SKU.</div></label>
              <label className="ci-field"><div className="lab">Preferred Vendor</div><select className="ci-select" value={itemForm.vendorId} onChange={(event) => setItemForm({ ...itemForm, vendorId: event.target.value })}><option value="">No vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}</select><div className="ci-sub">Supplier normally used when this item needs purchased.</div></label>
              <label className="ci-field"><div className="lab">Qty On Hand</div><input className="ci-input" type="number" value={itemForm.qtyOnHand} onChange={(event) => setItemForm({ ...itemForm, qtyOnHand: event.target.value })} /><div className="ci-sub">Actual usable quantity currently in this branch warehouse.</div></label>
              <label className="ci-field"><div className="lab">Reorder Min</div><input className="ci-input" type="number" value={itemForm.minQuantity} onChange={(event) => setItemForm({ ...itemForm, minQuantity: event.target.value })} /><div className="ci-sub">When on-hand drops below this number, item appears in Reorder Queue.</div></label>
              <label className="ci-field"><div className="lab">Max Target</div><input className="ci-input" type="number" value={itemForm.maxQuantity} onChange={(event) => setItemForm({ ...itemForm, maxQuantity: event.target.value })} /><div className="ci-sub">Ideal stocked amount after reordering.</div></label>
              <label className="ci-field"><div className="lab">Avg Weekly Use</div><input className="ci-input" value={selectedItemWeeklyUse.toLocaleString()} readOnly /><div className="ci-sub">Calculated from issue tickets over the last 12 weeks.</div></label>
              <label className="ci-field"><div className="lab">Average Cost</div><input className="ci-input" type="number" value={itemForm.unitPrice} onChange={(event) => setItemForm({ ...itemForm, unitPrice: event.target.value })} /><div className="ci-sub">Estimated cost per unit for issue spend, PO value, and inventory value.</div></label>
            </div>

            <div className="ci-actions item-setup-actions">
              <button className="ci-btn pri" onClick={saveItem} disabled={saving}>{saving ? "Saving..." : "Save Item"}</button>
              <button className="ci-btn" onClick={openNewItem}>New Blank Item</button>
              <button
                className="ci-btn"
                disabled={!selectedItem}
                onClick={() => {
                  if (!selectedItem) return;
                  seedPurchaseOrderItem(selectedItem);
                }}
              >
                Add Selected To PO
              </button>
              <label className="checkbox-row item-active-toggle"><input type="checkbox" checked={itemForm.active} onChange={(event) => setItemForm({ ...itemForm, active: event.target.checked })} /> Active SKU</label>
            </div>
            <div className="ci-sub">Select a row below to edit, or blank the form to create a new SKU for this branch.</div>
          </section>

          <section className="ci-layout item-master-layout">
            <div className="card">
              <h2><span className="dot"></span>Inventory Items<span className="ct">{filteredItems.length.toLocaleString()} shown</span></h2>
              <div className="ci-toolbar item-master-toolbar">
                <input className="ci-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, item, barcode, category..." />
                <select className="ci-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">All Categories</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select className="ci-select" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
                  <option value="all">All Bins</option>
                  {locations.map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
                <select className="ci-select" value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
                  <option value="all">All Vendors</option>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.vendorName}>{vendor.vendorName}</option>)}
                </select>
                <select className="ci-select" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
                  <option value="all">All Stock</option>
                  <option value="low">Low Stock</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
              <div className="ci-table-wrap item-master-table-wrap">
                <table className="dt item-master-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Bin</th>
                      <th>Vendor</th>
                      <th className="num">On Hand</th>
                      <th className="num">Min</th>
                      <th className="num">Max</th>
                      <th className="num">Cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const needsReorder = item.lowStock || item.qtyOnHand <= item.minQuantity;
                      return (
                        <tr
                          key={item.id}
                          className={`click-row ${selectedItemId === item.id ? "selected-row" : ""}`}
                          onClick={() => selectItemForSetup(item)}
                        >
                          <td className="mono"><b>{item.itemCode}</b><div className="ci-sub">{item.barcode || "No barcode"}</div></td>
                          <td>{item.itemName}</td>
                          <td>{item.category || "-"}</td>
                          <td>{item.location || "-"}</td>
                          <td>{item.vendorName || "-"}</td>
                          <td className="mono num">{item.qtyOnHand.toLocaleString()}</td>
                          <td className="mono num">{item.minQuantity.toLocaleString()}</td>
                          <td className="mono num">{item.maxQuantity.toLocaleString()}</td>
                          <td className="mono num">{money(item.unitPrice)}</td>
                          <td><span className={`pill ${!item.active ? "neu" : needsReorder ? "warn" : "ok"}`}>{!item.active ? "Inactive" : needsReorder ? "Reorder" : "OK"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="module-side-stack">
              <section className="card selected-item-card">
                <h2><span className="dot"></span>{selectedItem ? "Selected Item" : "Item Actions"}<span className="ct">{selectedItem ? selectedItem.itemCode : "select row"}</span></h2>
                {!selectedItem ? (
                  <div className="empty-pos-cart">
                    <strong>No item selected.</strong>
                    <span>Click any row in the inventory table to load setup, movement history, and item actions.</span>
                  </div>
                ) : (
                  <>
                    <div className="ci-detail-title">{selectedItem.itemName}</div>
                    <div className="ci-status-rail">
                      <span className="pill neu">{selectedItem.category || "No category"}</span>
                      <span className="pill neu">{selectedItem.location || "No bin"}</span>
                      <span className={`pill ${selectedItem.qtyOnHand <= selectedItem.minQuantity ? "warn" : "ok"}`}>{selectedItem.qtyOnHand.toLocaleString()} on hand</span>
                    </div>
                    <div className="ci-microgrid">
                      <div className="ci-micro"><div className="lab">Min</div><div className="val">{selectedItem.minQuantity.toLocaleString()}</div></div>
                      <div className="ci-micro"><div className="lab">Max</div><div className="val">{selectedItem.maxQuantity.toLocaleString()}</div></div>
                      <div className="ci-micro"><div className="lab">Cost</div><div className="val">{money(selectedItem.unitPrice)}</div></div>
                    </div>
                    <div className="ci-actions selected-item-actions">
                      <button className="ci-btn mini" onClick={() => selectItemForSetup(selectedItem)}>Edit Setup</button>
                      {canManageInventory && <button className="ci-btn mini" onClick={() => openAdjust(selectedItem)}>Adjust Qty</button>}
                      {canManageInventory && <button className="ci-btn mini" onClick={() => openManualReceive(selectedItem)}>Receive</button>}
                      {canManageInventory && <button className="ci-btn mini" onClick={() => openPriceAdjust(selectedItem)}>Price</button>}
                      {canManageInventory && <button className="ci-btn mini" onClick={() => openIssue(selectedItem)}>Issue</button>}
                      {canPlaceInventoryOrders && <button className="ci-btn mini" onClick={() => openOrder(selectedItem)}>Consumables Store</button>}
                    </div>
                  </>
                )}
              </section>

              <section className="card">
                <h2><span className="dot"></span>{selectedItem ? "Movement History" : "Recent Transactions"}<span className="ct">{itemTransactions.length.toLocaleString()} rows</span></h2>
                <div className="ci-queue item-history-list">
                  {itemTransactions.length === 0 && <p className="muted-text">No transactions found.</p>}
                  {itemTransactions.map((transaction) => (
                    <article className="ci-line" key={transaction.id}>
                      <div>
                        <b>{transaction.transactionType}</b>
                        <span>{transaction.itemCode} · {transaction.referenceNumber || transaction.notes || "-"}</span>
                      </div>
                      <div className="ci-num">
                        {transaction.quantityDirection || "-"} {transaction.quantity.toLocaleString()}
                        <span>{transaction.transactionDate}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        </>
      )}

      {activeView === "approvals" && (
        <section className="inventory-control-page no-print">
          <div className="grid g2 approval-overview-grid">
            <article className="card">
              <h2><span className="dot"></span>PO Approval Center<span className="ct">{purchaseOrdersForApproval.length.toLocaleString()} active</span></h2>
              <div className="ci-microgrid">
                <div className="ci-micro"><div className="lab">Submitted</div><div className="val">{purchaseOrdersForApproval.filter((order) => (order.status || "").toLowerCase() === "submitted").length.toLocaleString()}</div></div>
                <div className="ci-micro"><div className="lab">Ordered</div><div className="val">{purchaseOrdersForApproval.filter((order) => (order.status || "").toLowerCase() === "ordered").length.toLocaleString()}</div></div>
                <div className="ci-micro"><div className="lab">Open Value</div><div className="val">{money(purchaseOrdersForApproval.reduce((sum, order) => sum + order.totalValue, 0))}</div></div>
              </div>
              <div className="ci-sub">This page gives inventory a focused approval queue. Final PO edits, approval status changes, receiving, and vendor emails stay in the live Purchase Orders module.</div>
              <div className="ci-actions">
                <button className="ci-btn pri" type="button" onClick={() => (window.location.href = "/purchase-orders")}>Open Purchase Orders</button>
              </div>
            </article>

            <article className="card">
              <h2><span className="dot"></span>Approval Rules</h2>
              <div className="approval-rule-list">
                <div><b>Draft</b><span>Buyer is still building the PO.</span></div>
                <div><b>Submitted</b><span>Ready for manager review before ordering.</span></div>
                <div><b>Ordered</b><span>Approved and sent to vendor.</span></div>
                <div><b>Received</b><span>Inventory has been brought into stock.</span></div>
              </div>
            </article>
          </div>

          <article className="card">
            <h2><span className="dot"></span>POs Needing Review<span className="ct">{purchaseOrdersForApproval.length.toLocaleString()} rows</span></h2>
            <div className="ci-queue approval-queue">
              {purchaseOrdersForApproval.length === 0 && (
                <div className="empty-pos-cart">
                  <strong>No purchase orders need attention.</strong>
                  <span>Submitted, ordered, and partially received POs will show here.</span>
                </div>
              )}
              {purchaseOrdersForApproval.map((order) => {
                const lines = linesForPurchaseOrder(order);
                const expanded = expandedPoId === order.id;
                const orderedQty = lines.reduce((sum, line) => sum + line.quantityOrdered, 0);
                const receivedQty = lines.reduce((sum, line) => sum + line.quantityReceived, 0);
                const status = (order.status || "Draft").toLowerCase();
                const statusClass = status === "ordered" || status === "partially received" ? "ok" : status === "submitted" ? "warn" : "neu";

                return (
                  <article className={`ci-request-card ${expanded ? "focus" : ""}`} key={order.id}>
                    <button className="ci-detail-head request-summary-button" type="button" onClick={() => setExpandedPoId(expanded ? "" : order.id)}>
                      <div>
                        <div className="ci-detail-title">{order.poNumber || "Unnumbered PO"}</div>
                        <div className="ci-sub">{order.vendorName || "No vendor"} · {order.requestedBy || "-"} · {order.orderDate || "-"}</div>
                      </div>
                      <span className={`pill ${statusClass}`}>{order.status || "Draft"}</span>
                    </button>
                    <div className="ci-status-rail">
                      <span className="pill neu">{lines.length.toLocaleString()} lines</span>
                      <span className="pill neu">{orderedQty.toLocaleString()} ordered</span>
                      <span className="pill neu">{receivedQty.toLocaleString()} received</span>
                      <span className="pill neu">{money(order.totalValue)}</span>
                    </div>
                    {expanded && (
                      <>
                        <div className="ci-table-wrap compact-table-wrap">
                          <table className="dt">
                            <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Unit</th><th className="num">Line</th></tr></thead>
                            <tbody>
                              {lines.length === 0 && <tr><td colSpan={5}>No line items found for this PO.</td></tr>}
                              {lines.map((line) => (
                                <tr key={line.id}>
                                  <td><b>{line.itemCode || "-"}</b><div className="ci-sub">{line.itemName || "-"}</div></td>
                                  <td className="mono num">{line.quantityOrdered.toLocaleString()}</td>
                                  <td className="mono num">{line.quantityReceived.toLocaleString()}</td>
                                  <td className="mono num">{money(line.unitCost)}</td>
                                  <td className="mono num">{money(line.lineTotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="ci-actions">
                          <button className="ci-btn mini pri" type="button" onClick={() => (window.location.href = "/purchase-orders")}>Review / Approve PO</button>
                          <button className="ci-btn mini" type="button" onClick={() => (window.location.href = "/purchase-orders")}>Receive Against PO</button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </article>
        </section>
      )}

      {activeView === "reorder" && (
        <section className="inventory-control-page no-print">
          <article className="card reorder-command-card">
            <h2><span className="dot"></span>Reorder Queue<span className="ct">{reorderItems.length.toLocaleString()} items below min</span></h2>
            <div className="ci-microgrid">
              <div className="ci-micro"><div className="lab">Low / Out</div><div className="val">{lowStockCount.toLocaleString()} / {outOfStockCount.toLocaleString()}</div></div>
              <div className="ci-micro"><div className="lab">Suggested PO Value</div><div className="val">{money(reorderItems.reduce((sum, item) => sum + suggestedReorderQuantity(item) * item.unitPrice, 0))}</div></div>
              <div className="ci-micro"><div className="lab">Vendors</div><div className="val">{new Set(reorderItems.map((item) => item.vendorName).filter(Boolean)).size.toLocaleString()}</div></div>
            </div>
            <div className="ci-sub">Suggested quantity fills each SKU back to max target when available, otherwise to the reorder minimum. Click a row to load it into Item Setup.</div>
          </article>

          <article className="card">
            <h2><span className="dot"></span>Actionable Reorder Lines<span className="ct">click row for setup</span></h2>
            <div className="ci-table-wrap reorder-table-wrap">
              <table className="dt reorder-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th>Vendor</th>
                    <th className="num">On Hand</th>
                    <th className="num">Min</th>
                    <th className="num">Max</th>
                    <th className="num">Suggested</th>
                    <th className="num">Value</th>
                    <th className="no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderItems.length === 0 && <tr><td colSpan={9}>All active inventory is above reorder minimum.</td></tr>}
                  {reorderItems.map((item) => {
                    const suggestedQty = suggestedReorderQuantity(item);
                    const out = item.qtyOnHand <= 0;
                    return (
                      <tr
                        key={item.id}
                        className={`click-row ${selectedItemId === item.id ? "selected-row" : ""}`}
                        onClick={() => {
                          selectItemForSetup(item);
                          setActiveView("items");
                        }}
                      >
                        <td className="mono"><b>{item.itemCode}</b><div className="ci-sub">{item.barcode || "No barcode"}</div></td>
                        <td>{item.itemName}<div className="ci-sub">{item.category || "Uncategorized"} · {item.location || "No bin"}</div></td>
                        <td>{item.vendorName || "No vendor"}</td>
                        <td className="mono num"><span className={`pill ${out ? "bad" : "warn"}`}>{item.qtyOnHand.toLocaleString()}</span></td>
                        <td className="mono num">{item.minQuantity.toLocaleString()}</td>
                        <td className="mono num">{item.maxQuantity.toLocaleString()}</td>
                        <td className="mono num">{suggestedQty.toLocaleString()}</td>
                        <td className="mono num">{money(suggestedQty * item.unitPrice)}</td>
                        <td className="row-actions no-print">
                          <button className="ci-btn mini" type="button" onClick={(event) => { event.stopPropagation(); seedPurchaseOrderItem(item, suggestedQty); }}>Add To PO</button>
                          <button className="ci-btn mini" type="button" onClick={(event) => { event.stopPropagation(); openManualReceive(item); }}>Receive</button>
                          <button className="ci-btn mini" type="button" onClick={(event) => { event.stopPropagation(); selectItemForSetup(item); setActiveView("items"); }}>Edit</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {activeView === "tickets" && (
        <section className="ticket-card">
          <h3>Issue Tickets</h3>
          {tickets.length === 0 && <p className="muted-text">No issue tickets found.</p>}
          {tickets.map((ticket) => {
            const lines = linesForTicket(ticket);
            const expanded = expandedTicketId === ticket.id;

            return (
              <article className={`document-card ${expanded ? "open" : ""}`} key={ticket.id}>
                <button className="document-card-summary" type="button" onClick={() => setExpandedTicketId(expanded ? "" : ticket.id)}>
                  <div>
                    <strong>{ticket.ticketNumber}</strong>
                    <span>{ticket.issuedTo || "-"} / {ticket.department || "-"}</span>
                    <small>{lines.length} lines / {ticket.issueDate} / {money(ticket.totalValue)}</small>
                  </div>
                  <span className="document-status">{ticket.status || "Issued"}</span>
                </button>
                {expanded && (
                  <div className="document-card-detail">
                    <div className="document-detail-grid">
                      <span><strong>Picked By:</strong> {ticket.pickedBy || "-"}</span>
                      <span><strong>Unit / Truck:</strong> {ticket.unitTruck || "-"}</span>
                      <span><strong>Job Number:</strong> {ticket.jobNumber || "-"}</span>
                      <span><strong>Total:</strong> {money(ticket.totalValue)}</span>
                    </div>
                    <div className="table-wrap">
                      <table className="document-line-table">
                        <thead><tr><th>Item ID</th><th>Item Name</th><th>Qty</th><th>Value</th></tr></thead>
                        <tbody>
                          {lines.length === 0 && <tr><td colSpan={4}>No line items found for this ticket.</td></tr>}
                          {lines.map((line) => (
                            <tr key={line.id}>
                              <td>{line.itemCode || "-"}</td>
                              <td>{line.itemName || "-"}</td>
                              <td>{line.qtyIssued.toLocaleString()}</td>
                              <td>{money(line.lineValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {ticket.notes && <p className="muted-text">{ticket.notes}</p>}
                    <div className="document-actions">
                      <button className="mini-button" type="button" onClick={() => printIssueTicket(ticket)}>Print / PDF</button>
                      <button className="mini-button" type="button" onClick={() => emailIssueTicket(ticket)} disabled={emailingTicketId === ticket.id}>
                        {emailingTicketId === ticket.id ? "Emailing..." : "Email"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {activeView === "documents" && (
        <section className="inventory-control-page no-print">
          <article className="card">
            <h2><span className="dot"></span>Documents<span className="ct">{inventoryDocuments.length.toLocaleString()} recent</span></h2>
            <div className="ci-sub">A single register for issue tickets, Consumables Store requests, and purchase orders. Click a document to open its detail screen.</div>
            <div className="ci-table-wrap document-register-wrap">
              <table className="dt document-register-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Party</th>
                    <th>Status</th>
                    <th className="num">Lines</th>
                    <th className="num">Value</th>
                    <th className="no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryDocuments.length === 0 && <tr><td colSpan={8}>No inventory documents found.</td></tr>}
                  {inventoryDocuments.map((document) => (
                    <tr className="click-row" key={document.id} onClick={() => openInventoryDocument(document)}>
                      <td>{document.date || "-"}</td>
                      <td><b>{document.number}</b><div className="ci-sub">{document.id}</div></td>
                      <td>{document.type}</td>
                      <td>{document.party || "-"}</td>
                      <td><span className="pill neu">{document.status || "-"}</span></td>
                      <td className="mono num">{document.lines.toLocaleString()}</td>
                      <td className="mono num">{money(document.value)}</td>
                      <td className="row-actions no-print">
                        <button className="ci-btn mini" type="button" onClick={(event) => { event.stopPropagation(); openInventoryDocument(document); }}>Open</button>
                        <button className="ci-btn mini" type="button" onClick={(event) => { event.stopPropagation(); printInventoryDocument(document); }}>
                          {document.action === "purchase-orders" ? "PO Module" : "Print"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {activeView === "vendors" && (
        <section className="ticket-card">
          <div className="detail-title-row">
            <div>
              <h3>Vendors</h3>
              <p className="muted-text">Manage vendor contact details for purchase orders.</p>
            </div>
            <button className="button primary" onClick={openNewVendor}>Add Vendor</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Terms</th>
                  <th>Status</th>
                  <th className="no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id}>
                    <td>{vendor.vendorName}</td>
                    <td>{vendor.vendorCode || "-"}</td>
                    <td>{vendor.vendorType || "-"}</td>
                    <td>{vendor.contactName || "-"}</td>
                    <td>{vendor.phone || "-"}</td>
                    <td>{vendor.email || "-"}</td>
                    <td>{vendor.terms || "-"}</td>
                    <td><span className={vendor.active ? "badge green" : "badge red"}>{vendor.active ? "Active" : "Inactive"}</span></td>
                    <td className="no-print"><button className="mini-button" onClick={() => openEditVendor(vendor)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {itemFormOpen && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>{itemForm.id ? "Edit Inventory Item" : "Add Inventory Item"}</h2>
                <p>Standalone shop, office, and consumable inventory.</p>
              </div>
              <button className="icon-button" onClick={() => setItemFormOpen(false)}>X</button>
            </div>
            <div className="form-grid">
              <label>Item ID<input value={itemForm.itemCode} onChange={(event) => setItemForm({ ...itemForm, itemCode: event.target.value })} /></label>
              <label>Item Name<input value={itemForm.itemName} onChange={(event) => setItemForm({ ...itemForm, itemName: event.target.value })} /></label>
              <label>Category<input value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} /></label>
              <label>Location<input value={itemForm.location} onChange={(event) => setItemForm({ ...itemForm, location: event.target.value })} /></label>
              <label>Vendor
                <select value={itemForm.vendorId} onChange={(event) => setItemForm({ ...itemForm, vendorId: event.target.value })}>
                  <option value="">No vendor</option>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}
                </select>
              </label>
              <label>Qty On Hand<input type="number" value={itemForm.qtyOnHand} onChange={(event) => setItemForm({ ...itemForm, qtyOnHand: event.target.value })} /></label>
              <label>Min Qty<input type="number" value={itemForm.minQuantity} onChange={(event) => setItemForm({ ...itemForm, minQuantity: event.target.value })} /></label>
              <label>Max Qty<input type="number" value={itemForm.maxQuantity} onChange={(event) => setItemForm({ ...itemForm, maxQuantity: event.target.value })} /></label>
              <label>Unit Price<input type="number" value={itemForm.unitPrice} onChange={(event) => setItemForm({ ...itemForm, unitPrice: event.target.value })} /></label>
              <label>Barcode<input value={itemForm.barcode} onChange={(event) => setItemForm({ ...itemForm, barcode: event.target.value })} /></label>
              <label>UOM<input value={itemForm.uom} onChange={(event) => setItemForm({ ...itemForm, uom: event.target.value })} /></label>
              <label className="checkbox-row"><input type="checkbox" checked={itemForm.active} onChange={(event) => setItemForm({ ...itemForm, active: event.target.checked })} /> Active</label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setItemFormOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveItem} disabled={saving}>{saving ? "Saving..." : "Save Item"}</button>
            </div>
          </section>
        </div>
      )}

      {vendorFormOpen && (
        <div className="modal-backdrop">
          <section className="slide-over compact-slide">
            <div className="slide-header">
              <div>
                <h2>{vendorForm.id ? "Edit Vendor" : "Add Vendor"}</h2>
                <p>Vendor details are used on purchase orders.</p>
              </div>
              <button className="icon-button" onClick={() => setVendorFormOpen(false)}>X</button>
            </div>
            <div className="form-grid">
              <label>Vendor Name<input value={vendorForm.vendorName} onChange={(event) => setVendorForm({ ...vendorForm, vendorName: event.target.value })} /></label>
              <label>Vendor Code<input value={vendorForm.vendorCode} onChange={(event) => setVendorForm({ ...vendorForm, vendorCode: event.target.value })} /></label>
              <label>Vendor Type<input value={vendorForm.vendorType} onChange={(event) => setVendorForm({ ...vendorForm, vendorType: event.target.value })} /></label>
              <label>Contact Name<input value={vendorForm.contactName} onChange={(event) => setVendorForm({ ...vendorForm, contactName: event.target.value })} /></label>
              <label>Phone<input value={vendorForm.phone} onChange={(event) => setVendorForm({ ...vendorForm, phone: event.target.value })} /></label>
              <label>Email<input value={vendorForm.email} onChange={(event) => setVendorForm({ ...vendorForm, email: event.target.value })} /></label>
              <label className="full">Terms<textarea value={vendorForm.terms} onChange={(event) => setVendorForm({ ...vendorForm, terms: event.target.value })} /></label>
              <label className="checkbox-row"><input type="checkbox" checked={vendorForm.active} onChange={(event) => setVendorForm({ ...vendorForm, active: event.target.checked })} /> Active</label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setVendorFormOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveVendor} disabled={saving}>{saving ? "Saving..." : "Save Vendor"}</button>
            </div>
          </section>
        </div>
      )}

      {receiveOpen && (
        <div className="modal-backdrop">
          <section className="slide-over compact-slide">
            <div className="slide-header">
              <div>
                <h2>Manual Receive</h2>
                <p>Receive non-PO stock directly into inventory.</p>
              </div>
              <button className="icon-button" onClick={() => setReceiveOpen(false)}>X</button>
            </div>
            <div className="form-grid single-column">
              <label>Inventory Item
                <select value={receiveForm.itemId} onChange={(event) => setReceiveForm({ ...receiveForm, itemId: event.target.value })}>
                  <option value="">Choose item</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.itemCode} - {item.itemName}</option>)}
                </select>
              </label>
              <label>Quantity Received<input type="number" value={receiveForm.quantity} onChange={(event) => setReceiveForm({ ...receiveForm, quantity: event.target.value })} /></label>
              <label>Unit Price<input type="number" value={receiveForm.unitPrice} onChange={(event) => setReceiveForm({ ...receiveForm, unitPrice: event.target.value })} /></label>
              <label>Reference Number<input value={receiveForm.referenceNumber} onChange={(event) => setReceiveForm({ ...receiveForm, referenceNumber: event.target.value })} placeholder="Packing slip, invoice, or manual reference" /></label>
              <label>Notes<textarea value={receiveForm.notes} onChange={(event) => setReceiveForm({ ...receiveForm, notes: event.target.value })} /></label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setReceiveOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveManualReceive} disabled={saving}>{saving ? "Saving..." : "Receive Stock"}</button>
            </div>
          </section>
        </div>
      )}

      {priceOpen && (
        <div className="modal-backdrop">
          <section className="slide-over compact-slide">
            <div className="slide-header">
              <div>
                <h2>Adjust Unit Price</h2>
                <p>Manual price changes are saved on the item and logged to history.</p>
              </div>
              <button className="icon-button" onClick={() => setPriceOpen(false)}>X</button>
            </div>
            <div className="form-grid single-column">
              <label>Inventory Item
                <select value={priceForm.itemId} onChange={(event) => {
                  const item = items.find((candidate) => candidate.id === event.target.value);
                  setPriceForm({ ...priceForm, itemId: event.target.value, unitPrice: item ? String(item.unitPrice) : priceForm.unitPrice });
                }}>
                  <option value="">Choose item</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.itemCode} - {item.itemName}</option>)}
                </select>
              </label>
              <label>Unit Price<input type="number" value={priceForm.unitPrice} onChange={(event) => setPriceForm({ ...priceForm, unitPrice: event.target.value })} /></label>
              <label>Notes<textarea value={priceForm.notes} onChange={(event) => setPriceForm({ ...priceForm, notes: event.target.value })} placeholder="Reason for pricing change" /></label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setPriceOpen(false)}>Cancel</button>
              <button className="button primary" onClick={savePriceAdjustment} disabled={saving}>{saving ? "Saving..." : "Save Price"}</button>
            </div>
          </section>
        </div>
      )}

      {adjustOpen && selectedItem && (
        <div className="modal-backdrop">
          <section className="slide-over compact-slide">
            <div className="slide-header">
              <div>
                <h2>Adjust Quantity</h2>
                <p>{selectedItem.itemCode} / {selectedItem.itemName}</p>
              </div>
              <button className="icon-button" onClick={() => setAdjustOpen(false)}>X</button>
            </div>
            <div className="form-grid single-column">
              <label>Adjustment Quantity<input type="number" value={adjustQty} onChange={(event) => setAdjustQty(event.target.value)} placeholder="Use negative number to reduce" /></label>
              <label>Notes<textarea value={adjustNotes} onChange={(event) => setAdjustNotes(event.target.value)} placeholder="Required reason for adjustment" /></label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setAdjustOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveAdjustment} disabled={saving}>{saving ? "Saving..." : "Save Adjustment"}</button>
            </div>
          </section>
        </div>
      )}

      {issueOpen && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>Complete Issue Ticket</h2>
                <p>{issueCart.length} line items / {cartQuantity.toLocaleString()} total quantity / {money(cartValue)}</p>
              </div>
              <button className="icon-button" onClick={() => setIssueOpen(false)}>X</button>
            </div>

            <section className="ticket-card issue-cart-review">
              <h3>Issue Cart</h3>
              {issueCart.length === 0 ? (
                <p className="muted-text">No items are in the issue cart.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Unit Cost</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issueCart.map((line) => (
                        <tr key={line.itemId}>
                          <td>{line.itemCode}</td>
                          <td>{line.itemName}</td>
                          <td>{line.quantity.toLocaleString()}</td>
                          <td>{money(line.unitPrice)}</td>
                          <td>{money(line.lineValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="form-grid">
              <label>Issued To<input value={issueForm.issuedTo} onChange={(event) => setIssueForm({ ...issueForm, issuedTo: event.target.value })} /></label>
              <label>Department<input value={issueForm.department} onChange={(event) => setIssueForm({ ...issueForm, department: event.target.value })} /></label>
              <label>Picked By<input value={issueForm.pickedBy} onChange={(event) => setIssueForm({ ...issueForm, pickedBy: event.target.value })} /></label>
              <label>Unit / Truck<input value={issueForm.unitTruck} onChange={(event) => setIssueForm({ ...issueForm, unitTruck: event.target.value })} /></label>
              <label>Job Number<input value={issueForm.jobNumber} onChange={(event) => setIssueForm({ ...issueForm, jobNumber: event.target.value })} /></label>
              <label className="full">Notes<textarea value={issueForm.notes} onChange={(event) => setIssueForm({ ...issueForm, notes: event.target.value })} /></label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setIssueOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveIssueTicket} disabled={saving || issueCart.length === 0}>{saving ? "Saving..." : "Create Issue Ticket"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
