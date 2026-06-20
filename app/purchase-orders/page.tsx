"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Role = "admin" | "employee" | "customer" | "operator" | "sales" | string;

type Vendor = {
  id: string;
  vendorName: string;
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

const statusOptions = ["Draft", "Submitted", "Ordered", "Partially Received", "Received", "Closed", "Cancelled"];

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [uploading, setUploading] = useState(false);

  const canUsePurchaseOrders = role === "admin" || role === "employee";
  const selectedOrder = orders.find((order) => order.id === selectedPoId) || null;
  const selectedLines = lines.filter((line) => line.purchaseOrderId === selectedPoId);

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
    setRole(nextRole);
    setUserName(profileData?.full_name || user.email || "TITAN User");

    if (nextRole !== "admin" && nextRole !== "employee") {
      setMessage("Purchase Orders are for internal users only.");
      setLoading(false);
      return;
    }

    await Promise.all([loadVendors(), loadItems(), loadOrders(), loadLines()]);
    setMessage("");
    setLoading(false);
  }

  async function loadVendors() {
    const { data, error } = await supabase
      .from("inventory_vendors")
      .select("id, vendor_name")
      .order("vendor_name");

    if (error) {
      setMessage(`Vendors failed: ${error.message}`);
      return;
    }

    setVendors((data || []).map((row) => ({ id: row.id, vendorName: row.vendor_name || "" })));
  }

  async function loadItems() {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, item_code, item_name, unit_price, qty_on_hand")
      .order("item_code");

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

  async function loadOrders() {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*")
      .order("order_date", { ascending: false });

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
    }));
    setOrders(mapped);
    if (!selectedPoId && mapped.length > 0) setSelectedPoId(mapped[0].id);
  }

  async function loadLines() {
    const { data, error } = await supabase
      .from("purchase_order_lines")
      .select("*")
      .order("created_at");

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
    const payload = {
      po_number: poForm.poNumber.trim(),
      vendor_id: poForm.vendorId || null,
      vendor_name: vendor?.vendorName || poForm.vendorName || null,
      order_date: poForm.orderDate,
      requested_by: poForm.requestedBy || userName,
      status: poForm.status,
      notes: poForm.notes || null,
    };

    const request = poForm.id
      ? supabase.from("purchase_orders").update(payload).eq("id", poForm.id)
      : supabase.from("purchase_orders").insert(payload);

    const { error } = await request;
    if (error) {
      setMessage(`PO save failed: ${error.message}`);
    } else {
      setPoFormOpen(false);
      await loadOrders();
      setMessage("Purchase order saved.");
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
    await Promise.all([loadOrders(), loadLines()]);
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
    await Promise.all([loadItems(), loadOrders(), loadLines()]);
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
            <div className="brand-subtitle">Vendors, orders, receiving, and documents</div>
          </div>
        </button>
        <div className="module-actions no-print">
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
            {filteredOrders.map((order) => (
              <button
                className={`list-card-button ${selectedPoId === order.id ? "active" : ""}`}
                key={order.id}
                onClick={() => setSelectedPoId(order.id)}
              >
                <strong>{order.poNumber}</strong>
                <span>{order.vendorName || "No vendor"} / {order.status}</span>
                <small>{order.orderDate} / {money(order.totalValue)}</small>
              </button>
            ))}
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
                  <label className="mini-button file-button">
                    {uploading ? "Uploading..." : "Attach"}
                    <input type="file" onChange={(event) => uploadDocument(event.target.files)} />
                  </label>
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
                  {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
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
