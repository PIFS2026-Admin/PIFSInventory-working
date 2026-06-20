import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const defaultDataDir =
  "C:\\Users\\Wade Wisenor\\OneDrive - Pathfinder Inspections\\Documents\\Titan Migration Data";

const dataDir = process.env.TITAN_MIGRATION_DATA_DIR || defaultDataDir;
const dryRun = process.argv.includes("--dry-run");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!supabaseUrl || !serviceKey)) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.");
}

const supabase = dryRun ? null : createClient(supabaseUrl, serviceKey);

function readCsv(fileName) {
  const fullPath = path.join(dataDir, fileName);
  const text = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  const headers = rows.shift()?.map((header) => header.trim()) || [];
  return rows.map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] || "").trim();
    });
    return record;
  });
}

function toBool(value) {
  return ["true", "yes", "1", "active"].includes(String(value || "").trim().toLowerCase());
}

function toNumber(value) {
  const cleaned = String(value || "").replace(/[$,]/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function ticketFromLine(row) {
  if (row.IssueTicketNumber) return row.IssueTicketNumber;
  if (row.Title?.includes(" - ")) return row.Title.split(" - ")[0].trim();
  return row.Title || null;
}

function uniqueBy(rows, keyFn) {
  const unique = new Map();
  rows.forEach((row) => {
    const key = String(keyFn(row) || "").trim().toLowerCase();
    if (key) unique.set(key, row);
  });
  return Array.from(unique.values());
}

function makeDuplicateKeysUnique(rows, fieldName) {
  const seen = new Map();
  return rows.map((row) => {
    const rawKey = String(row[fieldName] || "").trim();
    const key = rawKey.toLowerCase();
    if (!key) return row;

    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count === 1) return row;

    return {
      ...row,
      [fieldName]: `${rawKey}-${count}`,
    };
  });
}

async function upsert(table, rows, options) {
  if (dryRun || rows.length === 0) return { data: rows, error: null };
  const { data, error } = await supabase.from(table).upsert(rows, options).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return { data, error };
}

async function insert(table, rows) {
  if (dryRun || rows.length === 0) return { data: rows, error: null };
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return { data, error };
}

async function main() {
  const vendorsCsv = readCsv("Vendors.csv");
  const itemsCsv = readCsv("Inventory Master.csv");
  const transactionsCsv = readCsv("Inventory Transactions.csv");
  const issueTicketsCsv = readCsv("Issue Tickets.csv");
  const issueLinesCsv = readCsv("Issue Ticket Line Items (1).csv");

  const vendors = uniqueBy(vendorsCsv.map((row) => ({
    vendor_name: row.VendorName,
    contact_name: row.ContactName || null,
    phone: row.Phone || null,
    email: row.Email || null,
    terms: row.Terms || null,
    vendor_code: row.VendorCode || null,
    vendor_type: row.VendorType || null,
    active: toBool(row.Active),
  })).filter((row) => row.vendor_name), (row) => row.vendor_name);

  const vendorResult = await upsert("inventory_vendors", vendors, { onConflict: "vendor_name" });
  const vendorMap = new Map((vendorResult.data || vendors).map((vendor) => [vendor.vendor_name, vendor.id]));

  const items = makeDuplicateKeysUnique(itemsCsv.map((row) => ({
    item_code: row["Item ID"],
    item_name: row["Item Name"],
    category: row.Category || null,
    location: row.Location || null,
    vendor_id: vendorMap.get(row.Vendor) || null,
    vendor_name_raw: row.Vendor || null,
    qty_on_hand: toNumber(row.QtyOnHand),
    min_quantity: toNumber(row.MinQuantity),
    max_quantity: toNumber(row.MaxQuantity),
    unit_price: toNumber(row["Unit Price"]),
    barcode: row.Barcode || null,
    uom: row.UOM || null,
    active: toBool(row.Active),
    low_stock: toBool(row.LowStock),
  })).filter((row) => row.item_code && row.item_name), "item_code");

  const itemResult = await upsert("inventory_items", items, { onConflict: "item_code" });
  const itemMap = new Map((itemResult.data || items).map((item) => [item.item_code, item.id]));

  const issueTickets = makeDuplicateKeysUnique(issueTicketsCsv.map((row) => ({
    ticket_number: row.IssueTicketNumber || row.Title,
    issue_date: (toDate(row.IssueDate) || new Date().toISOString()).slice(0, 10),
    issued_to: row.IssuedTo || null,
    department: row.Department || null,
    picked_by: row.PickedBy || null,
    unit_truck: row.UnitTruck || null,
    job_number: row.JobNumber || null,
    total_value: toNumber(row.TotalValue),
    status: row.Status || "Issued",
    notes: row.Notes || null,
    pdf_link: row.PDFLink || null,
    pdf_generated: toBool(row.PDFGenerated),
  })).filter((row) => row.ticket_number), "ticket_number");

  const ticketResult = await upsert("inventory_issue_tickets", issueTickets, { onConflict: "ticket_number" });
  const ticketMap = new Map((ticketResult.data || issueTickets).map((ticket) => [ticket.ticket_number, ticket.id]));

  const transactions = transactionsCsv.map((row) => ({
    item_id: itemMap.get(row.ItemID) || null,
    item_code: row.ItemID || null,
    transaction_date: toDate(row.TransDate) || new Date().toISOString(),
    transaction_type: row.TransactionType || "Imported",
    quantity: toNumber(row.Quantity),
    reference_type: row.ReferenceType || null,
    reference_number: row.ReferenceNumber || null,
    entered_by: row.EnteredBy || null,
    notes: row.Notes || null,
    transaction_source: row.TransactionSource || null,
    quantity_direction: row.QuantityDirection || null,
  })).filter((row) => row.item_code || row.reference_number);

  const issueLines = issueLinesCsv.map((row) => {
    const ticketNumber = ticketFromLine(row);
    return {
      issue_ticket_id: ticketNumber ? ticketMap.get(ticketNumber) || null : null,
      ticket_number: ticketNumber,
      item_id: itemMap.get(row.ItemID) || null,
      item_code: row.ItemID || null,
      item_name: row.ItemName || row.InventoryItem || "Imported line item",
      department: row.Department || null,
      qty_issued: toNumber(row.QtyIssued),
      unit_cost: toNumber(row.UnitCost),
      line_value: toNumber(row.LineValue),
      unit_truck: row.UnitTruck || null,
      picked_by: row.PickedBy || null,
      line_processed: toBool(row.LineProcessed),
    };
  }).filter((row) => row.ticket_number || row.item_code || row.item_name);

  await insert("inventory_transactions", transactions);
  await insert("inventory_issue_ticket_lines", issueLines);

  console.log(`Mode: ${dryRun ? "dry run" : "live import"}`);
  console.log(`Vendors: ${vendors.length} unique / ${vendorsCsv.length} source rows`);
  console.log(`Inventory items: ${items.length} / ${itemsCsv.length} source rows`);
  console.log(`Inventory transactions: ${transactions.length}`);
  console.log(`Issue tickets: ${issueTickets.length} / ${issueTicketsCsv.length} source rows`);
  console.log(`Issue ticket lines: ${issueLines.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
