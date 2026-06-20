"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type Role = "admin" | "employee" | "customer" | "operator" | "sales" | string;

type Vendor = {
  id: string;
  vendorName: string;
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
};

type IssueForm = {
  issuedTo: string;
  department: string;
  pickedBy: string;
  unitTruck: string;
  jobNumber: string;
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
};

const emptyIssueForm: IssueForm = {
  issuedTo: "",
  department: "",
  pickedBy: "",
  unitTruck: "",
  jobNumber: "",
  notes: "",
};

function normalizeRole(role: unknown): Role {
  return typeof role === "string" ? role.toLowerCase() : "customer";
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function numberValue(value: string) {
  const parsed = Number(String(value || "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [tickets, setTickets] = useState<IssueTicket[]>([]);
  const [ticketLines, setTicketLines] = useState<IssueTicketLine[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState<IssueForm>(emptyIssueForm);
  const [scanInput, setScanInput] = useState("");
  const [issueCart, setIssueCart] = useState<IssueCartLine[]>([]);
  const [expandedTicketId, setExpandedTicketId] = useState("");
  const [emailingTicketId, setEmailingTicketId] = useState("");
  const [cameraScanMessage, setCameraScanMessage] = useState("");
  const [cameraScanning, setCameraScanning] = useState(false);
  const scanFieldRef = useRef<HTMLInputElement | null>(null);
  const cameraFileRef = useRef<HTMLInputElement | null>(null);

  const canUseInventory = role === "admin" || role === "employee";
  const selectedItem = items.find((item) => item.id === selectedItemId) || null;

  useEffect(() => {
    if (!issueOpen) return;
    const timer = window.setTimeout(() => scanFieldRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [issueOpen, issueCart.length]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(),
    [items],
  );
  const locations = useMemo(
    () => Array.from(new Set(items.map((item) => item.location).filter(Boolean))).sort(),
    [items],
  );

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !term ||
        item.itemCode.toLowerCase().includes(term) ||
        item.itemName.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        item.location.toLowerCase().includes(term) ||
        item.vendorName.toLowerCase().includes(term) ||
        item.barcode.toLowerCase().includes(term);
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
  const lowStockItems = useMemo(
    () =>
      items
        .filter((item) => item.lowStock || item.qtyOnHand <= item.minQuantity)
        .sort((a, b) => a.qtyOnHand - b.qtyOnHand)
        .slice(0, 8),
    [items],
  );
  const cartQuantity = useMemo(
    () => issueCart.reduce((sum, line) => sum + line.quantity, 0),
    [issueCart],
  );
  const cartValue = useMemo(
    () => issueCart.reduce((sum, line) => sum + line.lineValue, 0),
    [issueCart],
  );

  useEffect(() => {
    loadPage();
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

    const nextRole = normalizeRole(profileData?.role);
    setRole(nextRole);
    setUserName(profileData?.full_name || user.email || "TITAN User");

    if (nextRole !== "admin" && nextRole !== "employee") {
      setMessage("Inventory is for internal users only.");
      setLoading(false);
      return;
    }

    await Promise.all([loadVendors(), loadItems(), loadTransactions(), loadTickets(), loadIssueTicketLines()]);
    setMessage("");
    setLoading(false);
  }

  async function loadVendors() {
    const { data, error } = await supabase
      .from("inventory_vendors")
      .select("id, vendor_name, active")
      .order("vendor_name");

    if (error) {
      setMessage(`Vendors failed: ${error.message}`);
      return;
    }

    setVendors(
      (data || []).map((vendor) => ({
        id: vendor.id,
        vendorName: vendor.vendor_name || "",
        active: Boolean(vendor.active),
      })),
    );
  }

  async function loadItems() {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*, inventory_vendors(vendor_name)")
      .order("item_code");

    if (error) {
      setMessage(`Inventory failed: ${error.message}`);
      return;
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
        };
      }),
    );
  }

  async function loadTransactions() {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .limit(250);

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

  async function loadTickets() {
    const { data, error } = await supabase
      .from("inventory_issue_tickets")
      .select("*")
      .order("issue_date", { ascending: false })
      .limit(50);

    if (error) {
      setMessage(`Issue tickets failed: ${error.message}`);
      return;
    }

    setTickets(
      (data || []).map((row) => ({
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
      })),
    );
  }

  async function loadIssueTicketLines() {
    const { data, error } = await supabase
      .from("inventory_issue_ticket_lines")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Issue ticket lines failed: ${error.message}`);
      return;
    }

    setTicketLines(
      (data || []).map((row) => ({
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
      })),
    );
  }

  function openNewItem() {
    setItemForm(emptyItemForm);
    setItemFormOpen(true);
  }

  function openEditItem(item: InventoryItem) {
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
    });
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
      ? supabase.from("inventory_items").update(payload).eq("id", itemForm.id)
      : supabase.from("inventory_items").insert(payload);

    const { error } = await request;
    if (error) {
      setMessage(`Save failed: ${error.message}`);
    } else {
      setItemFormOpen(false);
      await loadItems();
      setMessage("Inventory item saved.");
    }
    setSaving(false);
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

    await Promise.all([loadItems(), loadTransactions()]);
    setSaving(false);
  }

  function openIssue(item?: InventoryItem) {
    const target = item || selectedItem;
    setIssueForm((current) => ({ ...current, pickedBy: current.pickedBy || userName }));
    if (target) addItemToCart(target);
    setIssueOpen(true);
  }

  function findItemForCounter(value: string) {
    const term = value.trim().toLowerCase();
    if (!term) return null;
    return (
      items.find((item) => item.barcode && item.barcode.toLowerCase() === term) ||
      items.find((item) => item.itemCode.toLowerCase() === term) ||
      items.find((item) => item.itemName.toLowerCase() === term || item.itemName.toLowerCase().includes(term)) ||
      null
    );
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

  function openCameraScanner() {
    setCameraScanMessage("");
    const detectorSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

    if (!detectorSupported) {
      setCameraScanMessage("Camera barcode scanning is not supported in this browser yet. USB scanners and typed barcodes still work.");
      scanFieldRef.current?.focus();
      return;
    }

    cameraFileRef.current?.click();
  }

  async function handleCameraBarcode(file: File | undefined) {
    if (!file) return;

    setCameraScanning(true);
    setCameraScanMessage("Reading barcode...");

    try {
      const BarcodeDetectorConstructor = (window as typeof window & {
        BarcodeDetector?: new (options?: { formats?: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
        };
      }).BarcodeDetector;

      if (!BarcodeDetectorConstructor) {
        setCameraScanMessage("Camera barcode scanning is not supported in this browser yet.");
        return;
      }

      const bitmap = await createImageBitmap(file);
      const detector = new BarcodeDetectorConstructor({
        formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
      });
      const results = await detector.detect(bitmap);
      bitmap.close();

      const barcode = results[0]?.rawValue?.trim() || "";
      if (!barcode) {
        setCameraScanMessage("No barcode found in that photo. Try again with the barcode centered and well lit.");
        return;
      }

      const item = findItemForCounter(barcode);
      if (!item) {
        setScanInput(barcode);
        setCameraScanMessage(`Scanned ${barcode}, but no inventory item matched it.`);
        scanFieldRef.current?.focus();
        return;
      }

      addItemToCart(item);
      setScanInput("");
      setCameraScanMessage(`Added ${item.itemCode} from barcode ${barcode}.`);
      window.setTimeout(() => scanFieldRef.current?.focus(), 25);
    } catch (error: any) {
      setCameraScanMessage(`Barcode scan failed: ${error.message}`);
    } finally {
      setCameraScanning(false);
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
    await Promise.all([loadItems(), loadTransactions(), loadTickets(), loadIssueTicketLines()]);
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
    <main className="module-shell inventory-module">
      <section className="module-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">TITAN Inventory</div>
            <div className="brand-subtitle">Standalone warehouse and shop inventory</div>
          </div>
        </button>
        <div className="module-actions no-print">
          <button className="button" onClick={() => (window.location.href = "/home")}>Home</button>
          <button className="button" onClick={loadPage} disabled={loading}>Refresh</button>
          <button className="button" onClick={() => window.print()}>Print</button>
          <button className="button" onClick={exportInventory}>Export CSV</button>
          <button className="button" onClick={() => openIssue()}>Issue Inventory</button>
          <button className="button primary" onClick={openNewItem}>Add Item</button>
        </div>
      </section>

      {message && <div className="modal-message">{message}</div>}

      <section className="module-metrics">
        <article className="metric-card">
          <strong>{items.length}</strong>
          <span>Inventory Items</span>
        </article>
        <article className="metric-card">
          <strong>{filteredItems.length}</strong>
          <span>Visible Items</span>
        </article>
        <article className="metric-card">
          <strong>{lowStockCount}</strong>
          <span>Low Stock</span>
        </article>
        <article className="metric-card">
          <strong>{outOfStockCount}</strong>
          <span>Out of Stock</span>
        </article>
        <article className="metric-card">
          <strong>{money(totalValue)}</strong>
          <span>Total Value</span>
        </article>
      </section>

      <section className="inventory-dashboard no-print">
        <article className="ticket-card pos-card">
          <div className="detail-title-row">
            <div>
              <h3>Inventory Counter</h3>
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
            <button className="button" onClick={openCameraScanner} disabled={cameraScanning}>
              {cameraScanning ? "Scanning..." : "Scan Camera"}
            </button>
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

      <section className="filter-grid no-print">
        <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item ID, name, barcode, category..." />
        <select className="field" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All Categories</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select className="field" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
          <option value="all">All Locations</option>
          {locations.map((location) => <option key={location} value={location}>{location}</option>)}
        </select>
        <select className="field" value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
          <option value="all">All Vendors</option>
          {vendors.map((vendor) => <option key={vendor.id} value={vendor.vendorName}>{vendor.vendorName}</option>)}
        </select>
        <select className="field" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
          <option value="all">All Stock</option>
          <option value="low">Low Stock</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </section>

      <section className="module-grid">
        <article className="ticket-card module-main-card">
          <h3>Inventory Items</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Barcode</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Vendor</th>
                  <th>Qty</th>
                  <th>Min</th>
                  <th>Unit Price</th>
                  <th>Status</th>
                  <th className="no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className={selectedItemId === item.id ? "selected-row" : ""}>
                    <td>{item.itemCode}</td>
                    <td>{item.barcode || "-"}</td>
                    <td>{item.itemName}</td>
                    <td>{item.category || "-"}</td>
                    <td>{item.location || "-"}</td>
                    <td>{item.vendorName || "-"}</td>
                    <td>{item.qtyOnHand.toLocaleString()}</td>
                    <td>{item.minQuantity.toLocaleString()}</td>
                    <td>{money(item.unitPrice)}</td>
                    <td>
                      <span className={item.lowStock || item.qtyOnHand <= item.minQuantity ? "badge red" : "badge green"}>
                        {item.lowStock || item.qtyOnHand <= item.minQuantity ? "Low" : item.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="row-actions no-print">
                      <button className="mini-button" onClick={() => setSelectedItemId(item.id)}>History</button>
                      <button className="mini-button" onClick={() => openEditItem(item)}>Edit</button>
                      <button className="mini-button" onClick={() => openAdjust(item)}>Adjust</button>
                      <button className="mini-button" onClick={() => openIssue(item)}>Issue</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="module-side-stack">
          <section className="ticket-card">
            <h3>{selectedItem ? selectedItem.itemName : "Recent Transactions"}</h3>
            {itemTransactions.length === 0 && <p className="muted-text">No transactions found.</p>}
            {itemTransactions.map((transaction) => (
              <article className="history-row" key={transaction.id}>
                <div>
                  <strong>{transaction.transactionType}</strong>
                  <span>{transaction.itemCode}</span>
                </div>
                <div>
                  <span>{transaction.quantityDirection || "-"} {transaction.quantity.toLocaleString()}</span>
                  <small>{transaction.transactionDate}</small>
                </div>
                <small>{transaction.referenceNumber || transaction.notes || "-"}</small>
              </article>
            ))}
          </section>

          <section className="ticket-card">
            <h3>Recent Issue Tickets</h3>
            {tickets.length === 0 && <p className="muted-text">No issue tickets found.</p>}
            {tickets.map((ticket) => {
              const lines = linesForTicket(ticket);
              const expanded = expandedTicketId === ticket.id;

              return (
                <article className={`document-card ${expanded ? "open" : ""}`} key={ticket.id}>
                  <button
                    className="document-card-summary"
                    type="button"
                    onClick={() => setExpandedTicketId(expanded ? "" : ticket.id)}
                  >
                    <div>
                      <strong>{ticket.ticketNumber}</strong>
                      <span>{ticket.issuedTo || "-"} / {ticket.department || "-"}</span>
                      <small>{lines.length} lines / {ticket.issueDate}</small>
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
                          <thead>
                            <tr>
                              <th>Item ID</th>
                              <th>Item Name</th>
                              <th>Qty</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.length === 0 && (
                              <tr><td colSpan={4}>No line items found for this ticket.</td></tr>
                            )}
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
                        <button
                          className="mini-button"
                          type="button"
                          onClick={() => emailIssueTicket(ticket)}
                          disabled={emailingTicketId === ticket.id}
                        >
                          {emailingTicketId === ticket.id ? "Emailing..." : "Email"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </aside>
      </section>

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
