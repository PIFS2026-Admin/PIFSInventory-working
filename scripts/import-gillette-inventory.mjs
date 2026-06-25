import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const defaultDataDir =
  "C:\\Users\\Wade Wisenor\\OneDrive - Pathfinder Inspections\\Documents\\Titan Migration Data";

const dataDir = process.env.TITAN_MIGRATION_DATA_DIR || defaultDataDir;
const csvFileName = "Gillette Inventory.csv";
const targetYardCode = "GILLETTE";
const targetYardName = "Gillette Yard";
const liveRun = process.argv.includes("--live");
const dryRun = !liveRun || process.argv.includes("--dry-run");
const replaceGillette = process.argv.includes("--replace");

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!supabaseUrl || !serviceKey)) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running --live.");
}

const supabase = dryRun
  ? null
  : createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

function loadEnvFile(fileName) {
  const fullPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(fullPath)) return;
  if (!fs.statSync(fullPath).isFile()) return;

  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 1) continue;

    const key = trimmed.slice(0, equalsIndex).trim().replace(/^\uFEFF/, "");
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

function toNumber(value) {
  const cleaned = String(value || "").replace(/[$,]/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolWithDefault(value, fallback = true) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return fallback;
  return ["true", "yes", "1", "active", "ok"].includes(clean);
}

function lowStockBool(value, qtyOnHand, minQuantity) {
  const clean = String(value || "").trim().toLowerCase();
  if (["true", "yes", "1", "low", "low stock"].includes(clean)) return true;
  if (["false", "no", "0", "ok"].includes(clean)) return false;
  return minQuantity > 0 && qtyOnHand <= minQuantity;
}

function uniqueBy(rows, keyFn) {
  const unique = new Map();
  rows.forEach((row) => {
    const key = String(keyFn(row) || "").trim().toLowerCase();
    if (key && !unique.has(key)) unique.set(key, row);
  });
  return Array.from(unique.values());
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
  if (dryRun) return { id: "dry-run-gillette-yard-id", name: targetYardName, code: targetYardCode };

  const { data: yard } = await queryOrThrow(
    "Gillette yard lookup",
    supabase.from("yards").select("id, name, code").eq("code", targetYardCode).maybeSingle(),
  );

  if (yard) return yard;

  const { data: created } = await queryOrThrow(
    "Gillette yard create",
    supabase
      .from("yards")
      .insert({ name: targetYardName, code: targetYardCode })
      .select("id, name, code")
      .single(),
  );
  return created;
}

async function clearGilletteInventory(yardId) {
  if (dryRun || !replaceGillette) return;

  const { data: existingTickets } = await queryOrThrow(
    "Gillette issue tickets lookup",
    supabase.from("inventory_issue_tickets").select("id").eq("yard_id", yardId),
  );
  const { data: existingItems } = await queryOrThrow(
    "Gillette inventory items lookup",
    supabase.from("inventory_items").select("id").eq("yard_id", yardId),
  );

  const ticketIds = (existingTickets || []).map((row) => row.id);
  const itemIds = (existingItems || []).map((row) => row.id);

  const directLineDelete = await supabase.from("inventory_issue_ticket_lines").delete().eq("yard_id", yardId);
  if (directLineDelete.error) {
    const missingYardColumn = directLineDelete.error.message
      .toLowerCase()
      .includes("yard_id");
    if (!missingYardColumn) {
      throw new Error(`clear Gillette inventory_issue_ticket_lines: ${directLineDelete.error.message}`);
    }

    if (ticketIds.length > 0) {
      await queryOrThrow(
        "clear Gillette issue lines by ticket",
        supabase.from("inventory_issue_ticket_lines").delete().in("issue_ticket_id", ticketIds),
      );
    }

    if (itemIds.length > 0) {
      await queryOrThrow(
        "clear Gillette issue lines by item",
        supabase.from("inventory_issue_ticket_lines").delete().in("item_id", itemIds),
      );
    }
  }

  const deletes = [
    ["inventory_transactions", supabase.from("inventory_transactions").delete().eq("yard_id", yardId)],
    ["inventory_issue_tickets", supabase.from("inventory_issue_tickets").delete().eq("yard_id", yardId)],
    ["inventory_items", supabase.from("inventory_items").delete().eq("yard_id", yardId)],
    ["inventory_vendors", supabase.from("inventory_vendors").delete().eq("yard_id", yardId)],
  ];

  for (const [label, request] of deletes) {
    await queryOrThrow(`clear Gillette ${label}`, request);
  }
}

function normalizeItem(row) {
  const explicitQty = toNumber(row.QtyOnHand);
  const fallbackQty = toNumber(row.MinQuantity);
  const qtyOnHand = explicitQty > 0 ? explicitQty : fallbackQty;
  const minQuantity = explicitQty > 0 ? fallbackQty : 0;
  const maxQuantity = toNumber(row.MaxQuantity);
  const unitPrice = toNumber(row["Unit Price"]);

  return {
    item_code: row["Item ID"],
    item_name: row["Item Name"],
    category: row.Category || null,
    location: row.Location || null,
    vendor_id: null,
    vendor_name_raw: row.Vendor || null,
    qty_on_hand: qtyOnHand,
    min_quantity: minQuantity,
    max_quantity: maxQuantity,
    unit_price: unitPrice,
    barcode: row.Barcode || row["Part #"] || null,
    uom: "EA",
    active: toBoolWithDefault(row.Active, true),
    low_stock: lowStockBool(row.LowStock, qtyOnHand, minQuantity),
  };
}

async function main() {
  const sourceRows = readCsv(csvFileName);
  const yard = await getTargetYard();

  const vendors = uniqueBy(
    sourceRows
      .map((row) => ({
        yard_id: yard.id,
        vendor_name: row.Vendor,
        active: true,
      }))
      .filter((row) => row.vendor_name),
    (row) => row.vendor_name,
  );

  const items = sourceRows
    .map(normalizeItem)
    .filter((row) => row.item_code && row.item_name)
    .map((row) => ({ ...row, yard_id: yard.id }));

  const openingTransactions = items
    .filter((item) => Number(item.qty_on_hand) !== 0)
    .map((item) => ({
      yard_id: yard.id,
      item_code: item.item_code,
      transaction_date: new Date().toISOString(),
      transaction_type: "Opening Balance",
      quantity: item.qty_on_hand,
      reference_type: "Gillette Import",
      reference_number: "Gillette Inventory.csv",
      entered_by: "TITAN import",
      notes: "Starting Gillette consumable inventory import.",
      transaction_source: "CSV import",
      quantity_direction: "In",
    }));

  console.log(`Mode: ${dryRun ? "dry run" : "LIVE IMPORT"}`);
  console.log(`Target yard: ${yard.name} (${yard.code})`);
  console.log(`Data folder: ${dataDir}`);
  console.log(`Source rows: ${sourceRows.length}`);
  console.log(`Vendors: ${vendors.length}`);
  console.log(`Inventory items: ${items.length}`);
  console.log(`Opening balance transactions: ${openingTransactions.length}`);
  console.log(`Replace Gillette first: ${replaceGillette ? "yes" : "no"}`);

  if (dryRun) {
    console.log("Dry run complete. Run with --live --replace to reload Gillette only.");
    return;
  }

  await clearGilletteInventory(yard.id);

  const vendorRows = await chunked(
    "vendors",
    vendors,
    (chunk) =>
      supabase
        .from("inventory_vendors")
        .insert(chunk)
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
        .insert(chunk)
        .select("id, item_code"),
  );
  const itemMap = new Map(itemRows.map((item) => [item.item_code, item.id]));

  const transactionsWithItems = openingTransactions.map((transaction) => ({
    ...transaction,
    item_id: itemMap.get(transaction.item_code) || null,
  }));

  await chunked("opening transactions", transactionsWithItems, (chunk) =>
    supabase.from("inventory_transactions").insert(chunk).select("id"),
  );

  console.log("Gillette import complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
