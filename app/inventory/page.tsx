"use client";

import { useEffect, useMemo, useState } from "react";
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
  itemId: string;
  quantity: string;
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
  itemId: "",
  quantity: "1",
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

  const canUseInventory = role === "admin" || role === "employee";
  const selectedItem = items.find((item) => item.id === selectedItemId) || null;

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

    await Promise.all([loadVendors(), loadItems(), loadTransactions(), loadTickets()]);
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
    setIssueForm({ ...emptyIssueForm, itemId: target?.id || "", pickedBy: userName });
    setIssueOpen(true);
  }

  async function saveIssueTicket() {
    const item = items.find((candidate) => candidate.id === issueForm.itemId);
    const qty = numberValue(issueForm.quantity);
    if (!item) {
      setMessage("Choose an inventory item.");
      return;
    }
    if (qty <= 0) {
      setMessage("Issue quantity must be greater than zero.");
      return;
    }
    if (qty > item.qtyOnHand) {
      setMessage("Issue quantity is greater than quantity on hand.");
      return;
    }
    if (!issueForm.issuedTo.trim()) {
      setMessage("Issued To is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const ticketNumber = `ISS-${todayStamp()}`;
    const lineValue = qty * item.unitPrice;

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
        total_value: lineValue,
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

    const { error: lineError } = await supabase.from("inventory_issue_ticket_lines").insert({
      issue_ticket_id: ticket.id,
      ticket_number: ticketNumber,
      item_id: item.id,
      item_code: item.itemCode,
      item_name: item.itemName,
      department: issueForm.department || null,
      qty_issued: qty,
      unit_cost: item.unitPrice,
      line_value: lineValue,
      unit_truck: issueForm.unitTruck || null,
      picked_by: issueForm.pickedBy || userName,
      line_processed: true,
    });

    if (lineError) {
      setMessage(`Issue ticket created, line failed: ${lineError.message}`);
      setSaving(false);
      return;
    }

    const nextQty = item.qtyOnHand - qty;
    const { error: itemError } = await supabase
      .from("inventory_items")
      .update({ qty_on_hand: nextQty, low_stock: nextQty <= item.minQuantity })
      .eq("id", item.id);

    if (itemError) {
      setMessage(`Issue line saved, item quantity failed: ${itemError.message}`);
      setSaving(false);
      return;
    }

    await supabase.from("inventory_transactions").insert({
      item_id: item.id,
      item_code: item.itemCode,
      transaction_type: "Issue",
      quantity: qty,
      reference_type: "Issue Ticket",
      reference_number: ticketNumber,
      entered_by: issueForm.pickedBy || userName,
      notes: issueForm.notes || null,
      transaction_source: "TITAN Inventory",
      quantity_direction: "Out",
    });

    setIssueOpen(false);
    await Promise.all([loadItems(), loadTransactions(), loadTickets()]);
    setMessage(`Issue ticket ${ticketNumber} created.`);
    setSaving(false);
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
          <strong>{money(totalValue)}</strong>
          <span>Total Value</span>
        </article>
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
            {tickets.map((ticket) => (
              <article className="history-row" key={ticket.id}>
                <div>
                  <strong>{ticket.ticketNumber}</strong>
                  <span>{ticket.issuedTo || "-"}</span>
                </div>
                <div>
                  <span>{money(ticket.totalValue)}</span>
                  <small>{ticket.issueDate}</small>
                </div>
              </article>
            ))}
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
                <h2>Issue Inventory</h2>
                <p>Create an issue ticket and reduce inventory.</p>
              </div>
              <button className="icon-button" onClick={() => setIssueOpen(false)}>X</button>
            </div>
            <div className="form-grid">
              <label className="full">Item
                <select value={issueForm.itemId} onChange={(event) => setIssueForm({ ...issueForm, itemId: event.target.value })}>
                  <option value="">Choose item</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.itemCode} - {item.itemName} ({item.qtyOnHand})</option>)}
                </select>
              </label>
              <label>Quantity<input type="number" value={issueForm.quantity} onChange={(event) => setIssueForm({ ...issueForm, quantity: event.target.value })} /></label>
              <label>Issued To<input value={issueForm.issuedTo} onChange={(event) => setIssueForm({ ...issueForm, issuedTo: event.target.value })} /></label>
              <label>Department<input value={issueForm.department} onChange={(event) => setIssueForm({ ...issueForm, department: event.target.value })} /></label>
              <label>Picked By<input value={issueForm.pickedBy} onChange={(event) => setIssueForm({ ...issueForm, pickedBy: event.target.value })} /></label>
              <label>Unit / Truck<input value={issueForm.unitTruck} onChange={(event) => setIssueForm({ ...issueForm, unitTruck: event.target.value })} /></label>
              <label>Job Number<input value={issueForm.jobNumber} onChange={(event) => setIssueForm({ ...issueForm, jobNumber: event.target.value })} /></label>
              <label className="full">Notes<textarea value={issueForm.notes} onChange={(event) => setIssueForm({ ...issueForm, notes: event.target.value })} /></label>
            </div>
            <div className="slide-actions">
              <button className="button" onClick={() => setIssueOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveIssueTicket} disabled={saving}>{saving ? "Saving..." : "Create Issue Ticket"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
