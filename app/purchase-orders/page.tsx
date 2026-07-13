"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Role = "admin" | "employee" | "customer" | "operator" | "sales" | string;

type InventoryYard = {
  id: string;
  name: string;
  code: string;
};

type Vendor = {
  id: string;
  vendorName: string;
  email: string;
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
  orderDate: string;
  requestedBy: string;
  status: string;
  notes: string;
  totalValue: number;
  vendorEmail: string;
  submittedAt: string;
  approvedAt: string;
  orderedAt: string;
};

type PurchaseOrderLine = {
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

type PoForm = {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  orderDate: string;
  requestedBy: string;
  status: string;
  notes: string;
};

type LineForm = {
  itemId: string;
  itemCode: string;
  itemName: string;
  quantityOrdered: string;
  unitCost: string;
};

type InventoryPoSeed = {
  id?: string;
  itemCode?: string;
  itemName?: string;
  vendorName?: string;
  unitPrice?: number;
  quantityOrdered?: number;
};

const statusOptions = ["Draft", "Submitted", "Ordered", "Partially Received", "Received", "Closed", "Cancelled"];
const inventoryRoles = ["admin", "inventory_specialist", "inventory_manager"];
const managementRoles = ["admin", "inventory_manager"];
const wadeInventoryAdminEmail = "wade@pathfinderinspections.com";
const defaultInventoryYardCode = "PIFS";
const inventoryYardCodes = ["PIFS", "GILLETTE", "CASPER", "DICKINSON"];
const inventoryYardScopedTablesEnabled = true;

const emptyPoForm: PoForm = {
  id: "",
  poNumber: "",
  vendorId: "",
  vendorName: "",
  orderDate: new Date().toISOString().slice(0, 10),
  requestedBy: "",
  status: "Draft",
  notes: "",
};

const emptyLineForm: LineForm = {
  itemId: "",
  itemCode: "",
  itemName: "",
  quantityOrdered: "1",
  unitCost: "0",
};

function normalizeRole(role: unknown): Role {
  return typeof role === "string" ? role.toLowerCase() : "customer";
}

function numberValue(value: string) {
  const parsed = Number(String(value || "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function poNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `PO-${yyyy}${mm}${dd}-${hh}${mi}`;
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

export default function PurchaseOrdersPage() {
  const [role, setRole] = useState<Role>("customer");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [poFormOpen, setPoFormOpen] = useState(false);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [poForm, setPoForm] = useState<PoForm>(emptyPoForm);
  const [lineForm, setLineForm] = useState<LineForm>(emptyLineForm);
  const [pendingSeedLine, setPendingSeedLine] = useState<LineForm | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [expandedPoId, setExpandedPoId] = useState("");
  const [emailingPoId, setEmailingPoId] = useState("");
  const [inventoryYards, setInventoryYards] = useState<InventoryYard[]>([]);
  const [selectedInventoryYardId, setSelectedInventoryYardId] = useState("");

  const canUsePurchaseOrders = inventoryRoles.includes(role);
  const canManagePurchaseOrders = managementRoles.includes(role);
  const selectedOrder = orders.find((order) => order.id === selectedPoId) || null;
  const selectedLines = lines.filter((line) => line.purchaseOrderId === selectedPoId);
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

  function linesForOrder(order: PurchaseOrder) {
    return lines.filter((line) => line.purchaseOrderId === order.id);
  }

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesSearch =
        !term ||
        order.poNumber.toLowerCase().includes(term) ||
        order.vendorName.toLowerCase().includes(term) ||
        order.requestedBy.toLowerCase().includes(term) ||
        order.notes.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const openValue = useMemo(
    () => orders.filter((order) => !["Received", "Closed", "Cancelled"].includes(order.status)).reduce((sum, order) => sum + order.totalValue, 0),
    [orders],
  );

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    if (loading || !canUsePurchaseOrders || items.length === 0) return;

    const seedText = window.sessionStorage.getItem("titanInventoryPoSeedItem");
    if (!seedText) return;
    window.sessionStorage.removeItem("titanInventoryPoSeedItem");

    try {
      const seed = JSON.parse(seedText) as InventoryPoSeed;
      const item =
        items.find((candidate) => candidate.id === seed.id) ||
        items.find((candidate) => candidate.itemCode === seed.itemCode);
      const vendor = vendors.find((candidate) => candidate.vendorName.toLowerCase() === String(seed.vendorName || "").toLowerCase());
      const seedLine: LineForm = {
        itemId: item?.id || seed.id || "",
        itemCode: item?.itemCode || seed.itemCode || "",
        itemName: item?.itemName || seed.itemName || "",
        quantityOrdered: String(seed.quantityOrdered || 1),
        unitCost: String(seed.unitPrice ?? item?.unitPrice ?? 0),
      };

      setPendingSeedLine(seedLine);
      setPoForm({
        ...emptyPoForm,
        poNumber: poNumber(),
        vendorId: vendor?.id || "",
        vendorName: seed.vendorName || vendor?.vendorName || "",
        requestedBy: userName,
        notes: `Seeded from inventory reorder for ${seedLine.itemCode || seedLine.itemName}.`,
      });
      setPoFormOpen(true);
      setMessage(`${seedLine.itemCode || seedLine.itemName} is ready. Save the PO, then review and add the prepared line.`);
    } catch {
      setMessage("The inventory PO handoff could not be read. Create the PO manually.");
    }
  }, [canUsePurchaseOrders, items, loading, userName, vendors]);

  async function loadPage() {
    setLoading(true);
    setMessage("Loading purchase orders...");

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
    const nextEmail = user.email || "";
    setRole(nextRole);
    setUserEmail(nextEmail);
    setUserName(profileData?.full_name || user.email || "TITAN User");

    if (!inventoryRoles.includes(nextRole)) {
      setMessage("Purchase Orders are for internal users only.");
      setLoading(false);
      return;
    }

    const yards = await loadInventoryYards(user.id, nextEmail);
    setInventoryYards(yards);
    const preferredYard = yards.find((yard) => yard.code === defaultInventoryYardCode) || yards[0];
    const nextYardId = preferredYard?.id || "";
    setSelectedInventoryYardId(nextYardId);

    await reloadPurchaseOrderData(nextYardId, yards);
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

  async function reloadPurchaseOrderData(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    setSelectedPoId("");
    const yard = yardList.find((candidate) => candidate.id === yardId);
    if (yard && yard.code !== defaultInventoryYardCode && !inventoryYardScopedTablesEnabled) {
      setVendors([]);
      setItems([]);
      setOrders([]);
      setLines([]);
      return;
    }
    await Promise.all([loadVendors(yardId, yardList), loadItems(yardId, yardList), loadOrders(yardId, yardList), loadLines(yardId, yardList)]);
  }

  async function handleInventoryYardChange(yardId: string) {
    setSelectedInventoryYardId(yardId);
    setMessage("Loading selected yard...");
    await reloadPurchaseOrderData(yardId);
    setMessage("");
  }

  async function loadVendors(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("inventory_vendors")
      .select("id, vendor_name, email")
      .order("vendor_name");
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setMessage(`Vendors failed: ${error.message}`);
      return;
    }

    setVendors((data || []).map((row) => ({ id: row.id, vendorName: row.vendor_name || "", email: row.email || "" })));
  }

  async function loadItems(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("inventory_items")
      .select("id, item_code, item_name, unit_price, qty_on_hand")
      .order("item_code");
    query = applyInventoryYardScope(query, yardId, yardList);

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
        unitPrice: Number(row.unit_price || 0),
        qtyOnHand: Number(row.qty_on_hand || 0),
      })),
    );
  }

  async function loadOrders(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("purchase_orders")
      .select("*")
      .order("order_date", { ascending: false });
    query = applyInventoryYardScope(query, yardId, yardList);

    const { data, error } = await query;

    if (error) {
      setMessage(`Purchase orders failed: ${error.message}`);
      return;
    }

    const mapped = (data || []).map((row) => ({
      id: row.id,
      poNumber: row.po_number || "",
      vendorId: row.vendor_id || "",
      vendorName: row.vendor_name || "",
      orderDate: String(row.order_date || "").slice(0, 10),
      requestedBy: row.requested_by || "",
      status: row.status || "Draft",
      notes: row.notes || "",
      totalValue: Number(row.total_value || 0),
      vendorEmail: row.vendor_email || "",
      submittedAt: row.submitted_at || "",
      approvedAt: row.approved_at || "",
      orderedAt: row.ordered_at || "",
    }));
    setOrders(mapped);
    if (!selectedPoId && mapped.length > 0) setSelectedPoId(mapped[0].id);
  }

  async function loadLines(yardId = selectedInventoryYardId, yardList = inventoryYards) {
    let query = supabase
      .from("purchase_order_lines")
      .select("*")
      .order("created_at");
    query = applyInventoryYardScope(query, yardId, yardList);

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
        itemName: row.item_name || "",
        quantityOrdered: Number(row.quantity_ordered || 0),
        quantityReceived: Number(row.quantity_received || 0),
        unitCost: Number(row.unit_cost || 0),
        lineTotal: Number(row.line_total || 0),
      })),
    );
  }

  function openNewPo() {
    setPoForm({ ...emptyPoForm, poNumber: poNumber(), requestedBy: userName });
    setPoFormOpen(true);
  }

  function openEditPo(order: PurchaseOrder) {
    setPoForm({
      id: order.id,
      poNumber: order.poNumber,
      vendorId: order.vendorId,
      vendorName: order.vendorName,
      orderDate: order.orderDate,
      requestedBy: order.requestedBy,
      status: order.status,
      notes: order.notes,
    });
    setPoFormOpen(true);
  }

  async function savePo() {
    if (!poForm.poNumber.trim()) {
      setMessage("PO number is required.");
      return;
    }

    setSaving(true);
    setMessage("");
    const vendor = vendors.find((candidate) => candidate.id === poForm.vendorId);
    const existingOrder = orders.find((order) => order.id === poForm.id);
    const movedToSubmitted = poForm.status === "Submitted" && existingOrder?.status !== "Submitted";
    const movedToOrdered = poForm.status === "Ordered" && existingOrder?.status !== "Ordered";

    if (poForm.status === "Ordered" && !canManagePurchaseOrders) {
      setMessage("Only admins and inventory managers can approve and order purchase orders.");
      setSaving(false);
      return;
    }

    const payload: Record<string, string | null> = {
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      po_number: poForm.poNumber.trim(),
      vendor_id: poForm.vendorId || null,
      vendor_name: vendor?.vendorName || poForm.vendorName || null,
      vendor_email: vendor?.email || null,
      order_date: poForm.orderDate,
      requested_by: poForm.requestedBy || userName,
      status: poForm.status,
      notes: poForm.notes || null,
    };
    if (movedToSubmitted) {
      payload.submitted_at = new Date().toISOString();
      payload.submitted_by = userName;
    }
    if (movedToOrdered) {
      payload.approved_at = new Date().toISOString();
      payload.approved_by = userName;
      payload.ordered_at = new Date().toISOString();
      payload.ordered_by = userName;
    }

    const request = poForm.id
      ? supabase.from("purchase_orders").update(payload).eq("id", poForm.id).select("id").single()
      : supabase.from("purchase_orders").insert(payload).select("id").single();

    const { data: savedOrder, error } = await request;
    if (error || !savedOrder) {
      setMessage(`PO save failed: ${error?.message || "purchase order was not returned."}`);
    } else {
      setPoFormOpen(false);
      await loadOrders(selectedInventoryYardId);
      setSelectedPoId(savedOrder.id);
      if (pendingSeedLine && !poForm.id) {
        setLineForm(pendingSeedLine);
        setPendingSeedLine(null);
        setLineFormOpen(true);
        setMessage("Purchase order saved. Review the prepared inventory line and click Add Line.");
      } else if (movedToOrdered && vendor?.email) {
        await sendPurchaseOrderEmail(savedOrder.id, vendor.email, "Attached is your TITAN purchase order.", "Purchase order saved and emailed to vendor.");
      } else {
        setMessage(movedToOrdered && !vendor?.email ? "Purchase order saved. Vendor email is missing, so it was not emailed." : "Purchase order saved.");
      }
    }
    setSaving(false);
  }

  function openLineForm() {
    if (!selectedOrder) {
      setMessage("Choose or create a purchase order first.");
      return;
    }
    setLineForm(emptyLineForm);
    setLineFormOpen(true);
  }

  function selectLineItem(itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId);
    setLineForm({
      ...lineForm,
      itemId,
      itemCode: item?.itemCode || "",
      itemName: item?.itemName || "",
      unitCost: String(item?.unitPrice || 0),
    });
  }

  async function saveLine() {
    if (!selectedOrder) return;
    const qty = numberValue(lineForm.quantityOrdered);
    const unitCost = numberValue(lineForm.unitCost);
    if (!lineForm.itemName.trim()) {
      setMessage("Line item name is required.");
      return;
    }
    if (qty <= 0) {
      setMessage("Quantity ordered must be greater than zero.");
      return;
    }

    setSaving(true);
    setMessage("");
    const lineTotal = qty * unitCost;
    const { error } = await supabase.from("purchase_order_lines").insert({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      purchase_order_id: selectedOrder.id,
      item_id: lineForm.itemId || null,
      item_code: lineForm.itemCode || null,
      item_name: lineForm.itemName,
      quantity_ordered: qty,
      quantity_received: 0,
      unit_cost: unitCost,
      line_total: lineTotal,
    });

    if (error) {
      setMessage(`Line save failed: ${error.message}`);
      setSaving(false);
      return;
    }

    await recalcPoTotal(selectedOrder.id);
    setLineFormOpen(false);
    await Promise.all([loadOrders(selectedInventoryYardId), loadLines(selectedInventoryYardId)]);
    setMessage("PO line added.");
    setSaving(false);
  }

  async function recalcPoTotal(orderId: string) {
    const { data } = await supabase
      .from("purchase_order_lines")
      .select("line_total")
      .eq("purchase_order_id", orderId);
    const total = (data || []).reduce((sum, row) => sum + Number(row.line_total || 0), 0);
    await supabase.from("purchase_orders").update({ total_value: total }).eq("id", orderId);
  }

  async function receiveLine(line: PurchaseOrderLine) {
    const input = window.prompt(`Quantity received for ${line.itemName}`, String(line.quantityOrdered - line.quantityReceived));
    if (input === null) return;
    const receivedNow = numberValue(input);
    if (receivedNow <= 0) {
      setMessage("Received quantity must be greater than zero.");
      return;
    }
    const nextReceived = line.quantityReceived + receivedNow;
    if (nextReceived > line.quantityOrdered) {
      setMessage("Received quantity cannot exceed quantity ordered.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error: lineError } = await supabase
      .from("purchase_order_lines")
      .update({ quantity_received: nextReceived })
      .eq("id", line.id);

    if (lineError) {
      setMessage(`Receive failed: ${lineError.message}`);
      setSaving(false);
      return;
    }

    const item = items.find((candidate) => candidate.id === line.itemId);
    if (item) {
      const nextQty = item.qtyOnHand + receivedNow;
      await supabase.from("inventory_items").update({ qty_on_hand: nextQty }).eq("id", item.id);
      await supabase.from("inventory_transactions").insert({
        ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
        item_id: item.id,
        item_code: item.itemCode,
        transaction_type: "PO Receipt",
        quantity: receivedNow,
        reference_type: "Purchase Order",
        reference_number: selectedOrder?.poNumber || "",
        entered_by: userName,
        notes: `Received against ${selectedOrder?.poNumber || "PO"}`,
        transaction_source: "TITAN Purchase Orders",
        quantity_direction: "In",
      });
    }

    await refreshPoStatus(line.purchaseOrderId);
    await Promise.all([
      loadItems(selectedInventoryYardId),
      loadOrders(selectedInventoryYardId),
      loadLines(selectedInventoryYardId),
    ]);
    setMessage("PO line received.");
    setSaving(false);
  }

  async function refreshPoStatus(orderId: string) {
    const { data } = await supabase
      .from("purchase_order_lines")
      .select("quantity_ordered, quantity_received")
      .eq("purchase_order_id", orderId);
    const poLines = data || [];
    const ordered = poLines.reduce((sum, row) => sum + Number(row.quantity_ordered || 0), 0);
    const received = poLines.reduce((sum, row) => sum + Number(row.quantity_received || 0), 0);
    let status = "Ordered";
    if (ordered > 0 && received >= ordered) status = "Received";
    else if (received > 0) status = "Partially Received";
    await supabase.from("purchase_orders").update({ status }).eq("id", orderId);
  }

  async function uploadDocument(files: FileList | null) {
    if (!selectedOrder || !files || files.length === 0) return;
    setUploading(true);
    setMessage("");

    const file = files[0];
    const filePath = `purchase-orders/${selectedOrder.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("ticket-attachments").upload(filePath, file, {
      upsert: true,
    });

    if (uploadError) {
      setMessage(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("ticket-attachments").getPublicUrl(filePath);
    const { error: docError } = await supabase.from("inventory_documents").insert({
      ...(inventoryYardScopedTablesEnabled ? { yard_id: selectedInventoryYardId || null } : {}),
      linked_record_type: "purchase_order",
      linked_record_id: selectedOrder.id,
      file_name: file.name,
      file_url: publicUrlData.publicUrl,
      file_path: filePath,
      mime_type: file.type || null,
      file_size: file.size,
    });

    if (docError) setMessage(`Upload saved, document record failed: ${docError.message}`);
    else setMessage("Document attached.");
    setUploading(false);
  }

  function purchaseOrderHtml(order: PurchaseOrder, orderLines: PurchaseOrderLine[]) {
    const rows = orderLines.length
      ? orderLines
          .map(
            (line) => `
              <tr>
                <td>${line.itemCode || "-"}</td>
                <td>${line.itemName || "-"}</td>
                <td>${line.quantityOrdered.toLocaleString()}</td>
                <td>${line.quantityReceived.toLocaleString()}</td>
                <td>${money(line.unitCost)}</td>
                <td>${money(line.lineTotal)}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="6">No line items found for this purchase order.</td></tr>`;

    const totalOrdered = orderLines.reduce((sum, line) => sum + line.quantityOrdered, 0);
    const totalReceived = orderLines.reduce((sum, line) => sum + line.quantityReceived, 0);

    return `<!doctype html>
      <html>
        <head>
          <title>${order.poNumber}</title>
          <style>
            @page { size: letter; margin: 0.35in; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #e5e7eb; color: #111827; font-family: Arial, sans-serif; }
            .toolbar { display: flex; justify-content: flex-end; gap: 8px; max-width: 980px; margin: 14px auto; }
            .toolbar button { border: 0; border-radius: 6px; padding: 10px 14px; font-weight: 800; cursor: pointer; }
            .primary { background: #f97316; color: #111827; }
            .page { max-width: 980px; margin: 0 auto 28px; background: white; padding: 34px; box-shadow: 0 18px 50px rgba(0,0,0,.18); }
            .letterhead { display: grid; grid-template-columns: 220px 1fr; gap: 28px; align-items: start; border-bottom: 3px solid #f97316; padding-bottom: 18px; }
            .letterhead img { max-width: 190px; max-height: 82px; object-fit: contain; }
            .company h2 { margin: 0 0 8px; font-size: 22px; }
            .title-row { display: grid; grid-template-columns: 1fr 190px; gap: 18px; margin: 24px 0; align-items: start; }
            .title-row h1 { margin: 0 0 10px; font-size: 26px; }
            .date-box, .info-grid div, .notes { border: 1px solid #d1d5db; padding: 12px; }
            .label { display: block; color: #64748b; font-size: 11px; text-transform: uppercase; }
            .value { display: block; font-size: 15px; font-weight: 800; }
            .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #d1d5db; border-right: 0; border-bottom: 0; margin-bottom: 22px; }
            .info-grid div { border-left: 0; border-top: 0; min-height: 58px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th { background: #111827; color: white; text-align: left; padding: 10px; }
            td { border: 1px solid #d1d5db; padding: 9px 10px; vertical-align: top; }
            tfoot td { font-weight: 800; }
            .notes { margin-top: 22px; min-height: 80px; }
            @media print {
              body { background: white; }
              .toolbar { display: none; }
              .page { box-shadow: none; margin: 0; max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button onclick="window.close()">Back</button>
            <button class="primary" onclick="window.print()">Print / Save PDF</button>
          </div>
          <main class="page">
            <section class="letterhead">
              <img src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" />
              <div class="company">
                <h2>Pathfinder Inspections &amp; Field Services</h2>
                <div>7501 Groening St.<br />Odessa, TX 79765<br />(432) 233-3600</div>
              </div>
            </section>
            <section class="title-row">
              <div>
                <h1>Purchase Order</h1>
                <strong>${order.poNumber}</strong>
              </div>
              <div class="date-box">
                <span class="label">Date</span>
                <span class="value">${order.orderDate || "-"}</span>
                <span class="label">Status</span>
                <span class="value">${order.status || "-"}</span>
              </div>
            </section>
            <section class="info-grid">
              <div><span class="label">Vendor</span><span class="value">${order.vendorName || "-"}</span></div>
              <div><span class="label">Requested By</span><span class="value">${order.requestedBy || "-"}</span></div>
              <div><span class="label">Total Value</span><span class="value">${money(order.totalValue)}</span></div>
            </section>
            <table>
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Item Name</th>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th>Unit Cost</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Totals</td>
                  <td>${totalOrdered.toLocaleString()}</td>
                  <td>${totalReceived.toLocaleString()}</td>
                  <td></td>
                  <td>${money(order.totalValue)}</td>
                </tr>
              </tfoot>
            </table>
            <section class="notes">
              <strong>Notes</strong>
              <p>${order.notes || "No notes."}</p>
            </section>
          </main>
        </body>
      </html>`;
  }

  function printPurchaseOrder(order: PurchaseOrder) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setMessage("Popup blocked. Allow popups to print this purchase order.");
      return;
    }

    printWindow.document.write(purchaseOrderHtml(order, linesForOrder(order)));
    printWindow.document.close();
    printWindow.focus();
  }

  async function sendPurchaseOrderEmail(poId: string, recipientEmail: string, note: string, successMessage: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage("Your login session expired. Sign in again before emailing.");
      return false;
    }

    const response = await fetch("/api/purchase-order-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ poId, recipientEmail, note }),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(`Email failed: ${result?.error || "Unknown error."}`);
      return false;
    }

    setMessage(successMessage);
    return true;
  }

  async function emailPurchaseOrder(order: PurchaseOrder) {
    const recipientEmail = window.prompt("Email this purchase order to:");
    if (!recipientEmail) return;
    const note = window.prompt("Optional message to include:") || "";

    setEmailingPoId(order.id);
    setMessage("");
    await sendPurchaseOrderEmail(order.id, recipientEmail, note, `Purchase order ${order.poNumber} emailed to ${recipientEmail}.`);
    setEmailingPoId("");
  }

  async function deletePurchaseOrder(order: PurchaseOrder) {
    if (!canManagePurchaseOrders) {
      setMessage("Only admins and inventory managers can delete purchase orders.");
      return;
    }

    const confirmed = window.confirm(`Delete ${order.poNumber}? This also removes its line items and attached document links.`);
    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    const { error: documentError } = await supabase
      .from("inventory_documents")
      .delete()
      .eq("linked_record_type", "purchase_order")
      .eq("linked_record_id", order.id);

    if (documentError) {
      setMessage(`Delete failed: ${documentError.message}`);
      setSaving(false);
      return;
    }

    const { error: lineError } = await supabase
      .from("purchase_order_lines")
      .delete()
      .eq("purchase_order_id", order.id);

    if (lineError) {
      setMessage(`Delete failed: ${lineError.message}`);
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("purchase_orders").delete().eq("id", order.id);
    if (error) {
      setMessage(`Delete failed: ${error.message}`);
    } else {
      if (selectedPoId === order.id) {
        setSelectedPoId("");
      }
      if (expandedPoId === order.id) {
        setExpandedPoId("");
      }
      await loadOrders(selectedInventoryYardId);
      setMessage(`${order.poNumber} deleted.`);
    }

    setSaving(false);
  }

  function exportOrders() {
    downloadCsv(
      "titan-purchase-orders.csv",
      ["PO Number", "Vendor", "Order Date", "Requested By", "Status", "Total Value", "Notes"],
      filteredOrders.map((order) => [
        order.poNumber,
        order.vendorName,
        order.orderDate,
        order.requestedBy,
        order.status,
        order.totalValue,
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
    <main className="module-shell po-module">
      <section className="module-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">Purchase Orders</div>
            <div className="brand-subtitle">
              Vendors, orders, receiving, and documents / {selectedInventoryYard?.name || "Loading yard"}
            </div>
          </div>
        </button>
        <div className="module-actions no-print">
          <select
            className="field"
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
          <button className="button" onClick={() => (window.location.href = "/home")}>Home</button>
          <button className="button" onClick={loadPage} disabled={loading}>Refresh</button>
          <button className="button" onClick={() => window.print()}>Print</button>
          <button className="button" onClick={exportOrders}>Export CSV</button>
          <button className="button primary" onClick={openNewPo}>New PO</button>
        </div>
      </section>

      {message && <div className="modal-message">{message}</div>}

      <section className="module-metrics">
        <article className="metric-card"><strong>{orders.length}</strong><span>Purchase Orders</span></article>
        <article className="metric-card"><strong>{orders.filter((order) => order.status === "Draft").length}</strong><span>Draft</span></article>
        <article className="metric-card"><strong>{orders.filter((order) => order.status === "Partially Received").length}</strong><span>Partial</span></article>
        <article className="metric-card"><strong>{money(openValue)}</strong><span>Open Value</span></article>
      </section>

      <section className="filter-grid no-print">
        <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PO, vendor, requested by..." />
        <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All Statuses</option>
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </section>

      <section className="module-grid">
        <aside className="module-side-stack">
          <section className="ticket-card">
            <h3>Purchase Orders</h3>
            {filteredOrders.length === 0 && <p className="muted-text">No purchase orders found.</p>}
            {filteredOrders.map((order) => {
              const orderLines = linesForOrder(order);
              const expanded = expandedPoId === order.id;

              return (
                <article className={`document-card ${expanded ? "open" : ""}`} key={order.id}>
                  <button
                    className="document-card-summary"
                    type="button"
                    onClick={() => {
                      setSelectedPoId(order.id);
                      setExpandedPoId(expanded ? "" : order.id);
                    }}
                  >
                    <div>
                      <strong>{order.poNumber}</strong>
                      <span>{order.vendorName || "No vendor"} / {order.requestedBy || "-"}</span>
                      <small>{orderLines.length} lines / {order.orderDate} / {money(order.totalValue)}</small>
                    </div>
                    <span className="document-status">{order.status}</span>
                  </button>

                  {expanded && (
                    <div className="document-card-detail">
                      <div className="document-detail-grid">
                        <span><strong>Requested By:</strong> {order.requestedBy || "-"}</span>
                        <span><strong>Status:</strong> {order.status || "-"}</span>
                        <span><strong>Total:</strong> {money(order.totalValue)}</span>
                        <span><strong>Notes:</strong> {order.notes || "-"}</span>
                      </div>

                      <div className="table-wrap">
                        <table className="document-line-table">
                          <thead>
                            <tr>
                              <th>Item ID</th>
                              <th>Item Name</th>
                              <th>Ordered</th>
                              <th>Received</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orderLines.length === 0 && (
                              <tr><td colSpan={5}>No line items found for this PO.</td></tr>
                            )}
                            {orderLines.map((line) => (
                              <tr key={line.id}>
                                <td>{line.itemCode || "-"}</td>
                                <td>{line.itemName || "-"}</td>
                                <td>{line.quantityOrdered.toLocaleString()}</td>
                                <td>{line.quantityReceived.toLocaleString()}</td>
                                <td>{money(line.lineTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="document-actions">
                        <button className="mini-button" type="button" onClick={() => printPurchaseOrder(order)}>Print / PDF</button>
                        <button
                          className="mini-button"
                          type="button"
                          onClick={() => emailPurchaseOrder(order)}
                          disabled={emailingPoId === order.id}
                        >
                          {emailingPoId === order.id ? "Emailing..." : "Email"}
                        </button>
                        <button className="mini-button" type="button" onClick={() => openEditPo(order)}>Edit PO</button>
                        <button className="mini-button" type="button" onClick={openLineForm}>Add Line</button>
                        {canManagePurchaseOrders && (
                          <button className="mini-button danger" type="button" onClick={() => deletePurchaseOrder(order)} disabled={saving}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </aside>

        <article className="ticket-card module-main-card">
          {!selectedOrder ? (
            <p className="muted-text">Select or create a purchase order.</p>
          ) : (
            <>
              <div className="detail-title-row">
                <div>
                  <h3>{selectedOrder.poNumber}</h3>
                  <p>{selectedOrder.vendorName || "No vendor"} / {selectedOrder.status}</p>
                </div>
                <div className="row-actions no-print">
                  <button className="mini-button" onClick={() => openEditPo(selectedOrder)}>Edit PO</button>
                  <button className="mini-button" onClick={openLineForm}>Add Line</button>
                  <button className="mini-button" onClick={() => printPurchaseOrder(selectedOrder)}>Print / PDF</button>
                  <button
                    className="mini-button"
                    onClick={() => emailPurchaseOrder(selectedOrder)}
                    disabled={emailingPoId === selectedOrder.id}
                  >
                    {emailingPoId === selectedOrder.id ? "Emailing..." : "Email"}
                  </button>
                  <label className="mini-button file-button">
                    {uploading ? "Uploading..." : "Attach"}
                    <input type="file" onChange={(event) => uploadDocument(event.target.files)} />
                  </label>
                  {canManagePurchaseOrders && (
                    <button className="mini-button danger" onClick={() => deletePurchaseOrder(selectedOrder)} disabled={saving}>
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="po-detail-grid">
                <span><strong>Order Date:</strong> {selectedOrder.orderDate}</span>
                <span><strong>Requested By:</strong> {selectedOrder.requestedBy || "-"}</span>
                <span><strong>Total:</strong> {money(selectedOrder.totalValue)}</span>
                <span><strong>Notes:</strong> {selectedOrder.notes || "-"}</span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item ID</th>
                      <th>Item Name</th>
                      <th>Ordered</th>
                      <th>Received</th>
                      <th>Unit Cost</th>
                      <th>Total</th>
                      <th className="no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.itemCode || "-"}</td>
                        <td>{line.itemName}</td>
                        <td>{line.quantityOrdered.toLocaleString()}</td>
                        <td>{line.quantityReceived.toLocaleString()}</td>
                        <td>{money(line.unitCost)}</td>
                        <td>{money(line.lineTotal)}</td>
                        <td className="no-print">
                          <button
                            className="mini-button"
                            onClick={() => receiveLine(line)}
                            disabled={saving || line.quantityReceived >= line.quantityOrdered}
                          >
                            Receive
                          </button>
                        </td>
                      </tr>
                    ))}
                    {selectedLines.length === 0 && (
                      <tr><td colSpan={7}>No line items on this PO.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>
      </section>

      {poFormOpen && (
        <div className="modal-backdrop">
          <section className="slide-over compact-slide">
            <div className="slide-header">
              <div>
                <h2>{poForm.id ? "Edit Purchase Order" : "Create Purchase Order"}</h2>
                <p>POs start clean and can be received into inventory.</p>
              </div>
              <button className="icon-button" onClick={() => setPoFormOpen(false)}>X</button>
            </div>
            <div className="form-grid">
              <label>PO Number<input value={poForm.poNumber} onChange={(event) => setPoForm({ ...poForm, poNumber: event.target.value })} /></label>
              <label>Vendor
                <select value={poForm.vendorId} onChange={(event) => setPoForm({ ...poForm, vendorId: event.target.value })}>
                  <option value="">No vendor</option>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}
                </select>
              </label>
              <label>Order Date<input type="date" value={poForm.orderDate} onChange={(event) => setPoForm({ ...poForm, orderDate: event.target.value })} /></label>
              <label>Requested By<input value={poForm.requestedBy} onChange={(event) => setPoForm({ ...poForm, requestedBy: event.target.value })} /></label>
              <label>Status
                <select value={poForm.status} onChange={(event) => setPoForm({ ...poForm, status: event.target.value })}>
                  {statusOptions.map((status) => (
                    <option key={status} value={status} disabled={status === "Ordered" && !canManagePurchaseOrders}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full">Notes<textarea value={poForm.notes} onChange={(event) => setPoForm({ ...poForm, notes: event.target.value })} /></label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setPoFormOpen(false)}>Cancel</button>
              <button className="button primary" onClick={savePo} disabled={saving}>{saving ? "Saving..." : "Save PO"}</button>
            </div>
          </section>
        </div>
      )}

      {lineFormOpen && (
        <div className="modal-backdrop">
          <section className="slide-over compact-slide">
            <div className="slide-header">
              <div>
                <h2>Add PO Line</h2>
                <p>{selectedOrder?.poNumber}</p>
              </div>
              <button className="icon-button" onClick={() => setLineFormOpen(false)}>X</button>
            </div>
            <div className="form-grid">
              <label className="full">Inventory Item
                <select value={lineForm.itemId} onChange={(event) => selectLineItem(event.target.value)}>
                  <option value="">Manual line item</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.itemCode} - {item.itemName}</option>)}
                </select>
              </label>
              <label>Item ID<input value={lineForm.itemCode} onChange={(event) => setLineForm({ ...lineForm, itemCode: event.target.value })} /></label>
              <label>Item Name<input value={lineForm.itemName} onChange={(event) => setLineForm({ ...lineForm, itemName: event.target.value })} /></label>
              <label>Quantity Ordered<input type="number" value={lineForm.quantityOrdered} onChange={(event) => setLineForm({ ...lineForm, quantityOrdered: event.target.value })} /></label>
              <label>Unit Cost<input type="number" value={lineForm.unitCost} onChange={(event) => setLineForm({ ...lineForm, unitCost: event.target.value })} /></label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setLineFormOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveLine} disabled={saving}>{saving ? "Saving..." : "Add Line"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
