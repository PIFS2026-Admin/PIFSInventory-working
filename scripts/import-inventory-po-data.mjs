import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const defaultDataDir =
  "C:\\Users\\Wade Wisenor\\OneDrive - Pathfinder Inspections\\Documents\\Titan Migration Data";

const dataDir = process.env.TITAN_MIGRATION_DATA_DIR || defaultDataDir;
const targetYardCode = process.env.TITAN_IMPORT_YARD_CODE || "PIFS";
const targetYardName = process.env.TITAN_IMPORT_YARD_NAME || "Pathfinder Yard WTX";
const liveRun = process.argv.includes("--live");
const dryRun = !liveRun || process.argv.includes("--dry-run");

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!supabaseUrl || !serviceKey)) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running --live.");
}

const supabase = dryRun ? null : createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function loadEnvFile(fileName) {
  const fullPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(fullPath)) return;

  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

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
  const clean = String(value || "").trim().toLowerCase();
  return ["true", "yes", "1", "active", "ok"].includes(clean);
}

function lowStockBool(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean || clean === "ok") return false;
  return ["true", "yes", "1", "low", "low stock"].includes(clean);
}

function toNumber(value) {
  const cleaned = String(value || "").replace(/[$,]/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDate(value) {
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
    if (key && !unique.has(key)) unique.set(key, row);
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

async function queryOrThrow(label, request) {
  const { data, error, count } = await request;
  if (error) throw new Error(`${label}: ${error.message}`);
  return { data, count };
}

async function chunked(label, rows, handler, chunkSize = 500) {
  if (dryRun || rows.length === 0) return [];

  const allData = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data } = await queryOrThrow(`${label} rows ${index + 1}-${index + chunk.length}`, handler(chunk));
    allData.push(...(data || []));
  }
  return allData;
}

async function getTargetYard() {
  if (dryRun) return { id: "dry-run-yard-id", name: targetYardName, code: targetYardCode };

  const { data: yard } = await queryOrThrow(
    "yard lookup",
    supabase.from("yards").select("id, name, code").eq("code", targetYardCode).maybeSingle(),
  );

  if (yard) return yard;

  const { data: created } = await queryOrThrow(
    "yard create",
    supabase
      .from("yards")
      .insert({ name: targetYardName, code: targetYardCode })
      .select("id, name, code")
      .single(),
  );
  return created;
}

async function clearTargetYard(yardId) {
  if (dryRun) return;

  const deletes = [
    ["inventory_issue_ticket_lines", supabase.from("inventory_issue_ticket_lines").delete().eq("yard_id", yardId)],
    ["inventory_transactions", supabase.from("inventory_transactions").delete().eq("yard_id", yardId)],
    ["inventory_issue_tickets", supabase.from("inventory_issue_tickets").delete().eq("yard_id", yardId)],
    ["inventory_items", supabase.from("inventory_items").delete().eq("yard_id", yardId)],
    ["inventory_vendors", supabase.from("inventory_vendors").delete().eq("yard_id", yardId)],
  ];

  for (const [label, request] of deletes) {
    await queryOrThrow(`clear ${label}`, request);
  }
}

async function countRows(table, yardId) {
  if (dryRun) return 0;
  const { count } = await queryOrThrow(
    `count ${table}`,
    supabase.from(table).select("id", { count: "exact", head: true }).eq("yard_id", yardId),
  );
  return count || 0;
}

async function main() {
  const vendorsCsv = readCsv("Vendors.csv");
  const itemsCsv = readCsv("Inventory Master.csv");
  const transactionsCsv = readCsv("Inventory Transactions.csv");
  const issueTicketsCsv = readCsv("Issue Tickets.csv");
  const issueLinesCsv = readCsv("Issue Ticket Line Items (1).csv");

  const yard = await getTargetYard();

  const vendors = uniqueBy(
    vendorsCsv
      .map((row) => ({
        yard_id: yard.id,
        vendor_name: row.VendorName,
        contact_name: row.ContactName || null,
        phone: row.Phone || null,
        email: row.Email || null,
        terms: row.Terms || null,
        vendor_code: row.VendorCode || null,
        vendor_type: row.VendorType || null,
        active: toBool(row.Active),
      }))
      .filter((row) => row.vendor_name),
    (row) => row.vendor_name,
  );

  const items = makeDuplicateKeysUnique(
    itemsCsv
      .map((row) => ({
        yard_id: yard.id,
        item_code: row["Item ID"],
        item_name: row["Item Name"],
        category: row.Category || null,
        location: row.Location || null,
        vendor_id: null,
        vendor_name_raw: row.Vendor || null,
        qty_on_hand: toNumber(row.QtyOnHand),
        min_quantity: toNumber(row.MinQuantity),
        max_quantity: toNumber(row.MaxQuantity),
        unit_price: toNumber(row["Unit Price"]),
        barcode: row.Barcode || null,
        uom: row.UOM || null,
        active: toBool(row.Active),
        low_stock: lowStockBool(row.LowStock),
      }))
      .filter((row) => row.item_code && row.item_name),
    "item_code",
  );

  const issueTickets = makeDuplicateKeysUnique(
    issueTicketsCsv
      .map((row) => ({
        yard_id: yard.id,
        ticket_number: row.IssueTicketNumber || row.Title,
        issue_date: (toIsoDate(row.IssueDate) || new Date().toISOString()).slice(0, 10),
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
      }))
      .filter((row) => row.ticket_number),
    "ticket_number",
  );

  console.log(`Mode: ${dryRun ? "dry run" : "LIVE RESTORE"}`);
  console.log(`Target yard: ${yard.name} (${yard.code})`);
  console.log(`Data folder: ${dataDir}`);
  console.log(`Vendors: ${vendors.length} unique / ${vendorsCsv.length} source rows`);
  console.log(`Inventory items: ${items.length} / ${itemsCsv.length} source rows`);
  console.log(`Inventory transactions: ${transactionsCsv.length}`);
  console.log(`Issue tickets: ${issueTickets.length} / ${issueTicketsCsv.length} source rows`);
  console.log(`Issue ticket lines: ${issueLinesCsv.length}`);

  if (dryRun) {
    console.log("Dry run complete. Run with --live to clear and reload only this yard.");
    return;
  }

  await clearTargetYard(yard.id);

  const vendorRows = await chunked(
    "vendors",
    vendors,
    (chunk) =>
      supabase
        .from("inventory_vendors")
        .upsert(chunk, { onConflict: "yard_id,vendor_name" })
        .select("id, vendor_name"),
  );
  const vendorMap = new Map(vendorRows.map((vendor) => [vendor.vendor_name, vendor.id]));

  const itemsWithVendors = items.map((item) => ({
    ...item,
    vendor_id: item.vendor_name_raw ? vendorMap.get(item.vendor_name_raw) || null : null,
  }));

  const itemRows = await chunked(
    "items",
    itemsWithVendors,
    (chunk) =>
      supabase
        .from("inventory_items")
        .upsert(chunk, { onConflict: "yard_id,item_code" })
        .select("id, item_code"),
  );
  const itemMap = new Map(itemRows.map((item) => [item.item_code, item.id]));

  const ticketRows = await chunked(
    "issue tickets",
    issueTickets,
    (chunk) =>
      supabase
        .from("inventory_issue_tickets")
        .upsert(chunk, { onConflict: "ticket_number" })
        .select("id, ticket_number"),
  );
  const ticketMap = new Map(ticketRows.map((ticket) => [ticket.ticket_number, ticket.id]));

  const transactions = transactionsCsv
    .map((row) => ({
      yard_id: yard.id,
      item_id: itemMap.get(row.ItemID) || null,
      item_code: row.ItemID || null,
      transaction_date: toIsoDate(row.TransDate) || new Date().toISOString(),
      transaction_type: row.TransactionType || "Imported",
      quantity: toNumber(row.Quantity),
      reference_type: row.ReferenceType || null,
      reference_number: row.ReferenceNumber || null,
      entered_by: row.EnteredBy || null,
      notes: row.Notes || null,
      transaction_source: row.TransactionSource || null,
      quantity_direction: row.QuantityDirection || null,
    }))
    .filter((row) => row.item_code || row.reference_number);

  const issueLines = issueLinesCsv
    .map((row) => {
      const ticketNumber = ticketFromLine(row);
      return {
        yard_id: yard.id,
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
    })
    .filter((row) => row.ticket_number || row.item_code || row.item_name);

  await chunked("transactions", transactions, (chunk) =>
    supabase.from("inventory_transactions").insert(chunk).select("id"),
  );
  await chunked("issue lines", issueLines, (chunk) =>
    supabase.from("inventory_issue_ticket_lines").insert(chunk).select("id"),
  );

  console.log("Restore complete.");
  console.log(`WTX vendors in database: ${await countRows("inventory_vendors", yard.id)}`);
  console.log(`WTX items in database: ${await countRows("inventory_items", yard.id)}`);
  console.log(`WTX transactions in database: ${await countRows("inventory_transactions", yard.id)}`);
  console.log(`WTX issue tickets in database: ${await countRows("inventory_issue_tickets", yard.id)}`);
  console.log(`WTX issue lines in database: ${await countRows("inventory_issue_ticket_lines", yard.id)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
