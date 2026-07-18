import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const defaultCsvPath = "C:\\Users\\Wade Wisenor\\Downloads\\Work Orders (1).csv";
const defaultLaborRate = 40;
const liveRun = process.argv.includes("--live");
const dryRun = !liveRun || process.argv.includes("--dry-run");
const backfillExistingDetails = process.argv.includes("--backfill-existing-details");
const csvPath = valueAfter("--csv") || defaultCsvPath;
const targetYardCode = (valueAfter("--yard-code") || "PIFS").toUpperCase();

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

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function loadEnvFile(fileName) {
  const fullPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return;

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

function readCsv(fullPath) {
  const text = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
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
      if (char === "\r" && next === "\n") index += 1;
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

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compactWorkOrderNumber(row, index) {
  const raw = cleanText(row["Work Order Number"] || row["WO Number"]);
  if (raw) return raw;
  return `LEGACY-WO-${String(index + 1).padStart(5, "0")}`;
}

function parseNumber(value) {
  const cleaned = String(value || "").replace(/[$,]/g, "").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseRepairHours(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return 0;

  let hours = 0;
  let hasUnit = false;
  const hourRegex = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/g;
  const minuteRegex = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/g;

  for (const match of text.matchAll(hourRegex)) {
    hours += Number(match[1]);
    hasUnit = true;
  }

  for (const match of text.matchAll(minuteRegex)) {
    hours += Number(match[1]) / 60;
    hasUnit = true;
  }

  if (hasUnit) return round2(hours);

  const fallback = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(fallback) || fallback <= 0) return 0;
  return round2(fallback > 24 ? fallback / 60 : fallback);
}

function parseParts(rawValue) {
  const raw = cleanText(rawValue);
  if (!raw) return null;
  const costMatch = raw.match(/cost\s*[-:]*\s*\$?\s*(-?\d[\d,]*(?:\.\d+)?)/i);
  const cost = costMatch ? parseNumber(costMatch[1]) : 0;
  const description = cleanText(raw.replace(/cost\s*[-:]*\s*\$?\s*(-?\d[\d,]*(?:\.\d+)?).*/i, ""));
  return {
    raw,
    description: description || raw,
    cost,
  };
}

function mapStatus(value, row) {
  const status = cleanText(value).toLowerCase();
  if (status === "closed") return "Closed";
  if (status === "open") return "Open";
  if (status === "waiting on parts" || status === "awaiting parts") return "Awaiting Parts";
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  if (parseDate(row["Closed Date"])) return "Closed";
  if (parseDate(row["Completed Date"])) return "Ready for Review";
  return "Open";
}

function mapPriority(value) {
  const priority = cleanText(value).toLowerCase();
  if (priority === "low") return "Low";
  if (priority === "high") return "High";
  if (priority === "critical") return "Critical";
  return "Normal";
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function buildRepairNotes(row) {
  const notes = cleanText(row["Repair Notes"]);
  const legacyDetails = [
    ["Location", row.Location],
    ["Lead", row.Lead],
    ["Repaired By", row["Repaired By"]],
    ["PDF Link", row["PDF Link"]],
    ["Days Open", row["Days Open"]],
  ]
    .filter(([, value]) => cleanText(value))
    .map(([label, value]) => `${label}: ${cleanText(value)}`);

  if (!legacyDetails.length) return notes;
  return [notes, `Legacy import details - ${legacyDetails.join(" / ")}`].filter(Boolean).join("\n\n");
}

function mapRow(row, index, yardId) {
  const workOrderNumber = compactWorkOrderNumber(row, index);
  const createdAt = parseDate(row["Date Created"]) || new Date().toISOString();
  const completedAt = parseDate(row["Completed Date"]);
  const closedAt = parseDate(row["Closed Date"]);
  const updatedAt = parseDate(row["Last Updated"]) || closedAt || completedAt || createdAt;
  const repairHours = parseRepairHours(row["Repair Time"]);
  const legacyLaborCost = parseNumber(row["Labor Cost"]);
  const laborCost = repairHours ? round2(repairHours * defaultLaborRate) : 0;
  const partsInfo = parseParts(row["Parts Used / Cost"]);
  const equipmentNumber = cleanText(row["Equipment ID/Unit Number"]);
  const equipmentType = cleanText(row["Equipment Type"]);
  const assignedTo = cleanText(row["Repair Tech"] || row["Repaired By"] || row["Repair Technician"]);
  const technicianName = assignedTo || cleanText(row["Requested By"]) || "Legacy technician";

  return {
    source: row,
    workOrderNumber,
    workOrder: {
      yard_id: yardId,
      work_order_number: workOrderNumber,
      status: mapStatus(row.Status, row),
      priority: mapPriority(row.Priority),
      equipment_number: equipmentNumber,
      equipment_name: equipmentNumber || equipmentType || `Legacy equipment ${workOrderNumber}`,
      equipment_type: equipmentType,
      department: cleanText(row.Department),
      assigned_to: assignedTo,
      requested_by_name: cleanText(row["Requested By"]),
      problem_description: cleanText(row["Issue Description"]),
      repair_notes: buildRepairNotes(row),
      downtime_start: parseDate(row["Work Start Time"]),
      downtime_end: parseDate(row["Work End Time"]),
      labor_hours: repairHours,
      total_labor_cost: laborCost,
      total_parts_cost: partsInfo?.cost || 0,
      total_cost: laborCost + (partsInfo?.cost || 0),
      opened_at: createdAt,
      completed_at: completedAt,
      closed_at: closedAt,
      created_at: createdAt,
      updated_at: updatedAt,
    },
    labor: repairHours
      ? {
          technician_name: technicianName,
          work_date: (completedAt || closedAt || createdAt).slice(0, 10),
          hours: repairHours,
          labor_rate: defaultLaborRate,
          line_total: laborCost,
          notes: `Legacy repair time: ${cleanText(row["Repair Time"])} / Applied rate: $${defaultLaborRate}/hr${
            legacyLaborCost ? ` / Exported labor cost reference: ${legacyLaborCost}` : ""
          }`,
          created_at: createdAt,
          updated_at: updatedAt,
        }
      : null,
    part: partsInfo
      ? {
          yard_id: yardId,
          item_code: "LEGACY-PARTS",
          item_name: partsInfo.description.slice(0, 220),
          category: "Legacy Repair Parts",
          uom: "lot",
          quantity_used: 1,
          unit_cost: partsInfo.cost,
          line_total: partsInfo.cost,
          posted_to_inventory: false,
          notes: `Legacy parts text: ${partsInfo.raw}. Not posted to current consumables inventory.`,
          issued_by_name: technicianName,
          issued_at: completedAt || closedAt || createdAt,
          created_at: createdAt,
          updated_at: updatedAt,
        }
      : null,
    audit: {
      action: "legacy_import",
      user_name: "TITAN Import",
      after_value: {
        source: "Work Orders (1).csv",
        workOrderNumber,
        importedWithoutInventoryPosting: true,
      },
      created_at: new Date().toISOString(),
    },
  };
}

function summarize(mapped, existingNumbers = new Set()) {
  const rowsToImport = mapped.filter((row) => !existingNumbers.has(row.workOrderNumber));
  return {
    csvPath,
    targetYardCode,
    dryRun,
    csvRows: mapped.length,
    existingSkipped: mapped.length - rowsToImport.length,
    workOrdersToImport: rowsToImport.length,
    laborLinesToImport: rowsToImport.filter((row) => row.labor).length,
    partLinesToImport: rowsToImport.filter((row) => row.part).length,
    statusCounts: countBy(rowsToImport.map((row) => row.workOrder.status)),
    priorityCounts: countBy(rowsToImport.map((row) => row.workOrder.priority)),
    missingEquipmentNames: rowsToImport.filter((row) => !row.workOrder.equipment_number && row.workOrder.equipment_name.startsWith("Legacy equipment")).length,
  };
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value || "Blank"] = (counts[value || "Blank"] || 0) + 1;
    return counts;
  }, {});
}

async function insertChunk(table, rows, size = 500) {
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

async function main() {
  if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}`);
  const csvRows = readCsv(csvPath);

  let yardId = "dry-run-yard-id";
  let existingNumbers = new Set();

  if (!dryRun) {
    const { data: yard, error: yardError } = await supabase
      .from("yards")
      .select("id,name,code")
      .eq("code", targetYardCode)
      .maybeSingle();

    if (yardError) throw new Error(`Yard lookup failed: ${yardError.message}`);
    if (!yard?.id) throw new Error(`Could not find target yard code ${targetYardCode}.`);
    yardId = yard.id;
  }

  const mapped = csvRows.map((row, index) => mapRow(row, index, yardId));

  if (!dryRun) {
    const numbers = mapped.map((row) => row.workOrderNumber);
    const { data: existing, error: existingError } = await supabase
      .from("equipment_repair_work_orders")
      .select("work_order_number")
      .in("work_order_number", numbers);

    if (existingError) throw new Error(`Existing work order check failed: ${existingError.message}`);
    existingNumbers = new Set((existing || []).map((row) => row.work_order_number));
  }

  const summary = summarize(mapped, existingNumbers);
  console.log(JSON.stringify(summary, null, 2));

  if (dryRun) return;

  const rowsToImport = mapped.filter((row) => !existingNumbers.has(row.workOrderNumber));
  if (!rowsToImport.length) {
    const backfillResult = backfillExistingDetails ? await backfillDetails(mapped, existingNumbers) : null;
    if (backfillResult) console.log(JSON.stringify(backfillResult, null, 2));
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("equipment_repair_work_orders")
    .insert(rowsToImport.map((row) => row.workOrder))
    .select("id,work_order_number");

  if (insertError) throw new Error(`equipment_repair_work_orders insert failed: ${insertError.message}`);
  const idByNumber = new Map((inserted || []).map((row) => [row.work_order_number, row.id]));

  const laborRows = rowsToImport
    .filter((row) => row.labor && idByNumber.has(row.workOrderNumber))
    .map((row) => ({
      ...row.labor,
      work_order_id: idByNumber.get(row.workOrderNumber),
    }));

  const partRows = rowsToImport
    .filter((row) => row.part && idByNumber.has(row.workOrderNumber))
    .map((row) => ({
      ...row.part,
      work_order_id: idByNumber.get(row.workOrderNumber),
    }));

  const auditRows = rowsToImport
    .filter((row) => idByNumber.has(row.workOrderNumber))
    .map((row) => ({
      ...row.audit,
      work_order_id: idByNumber.get(row.workOrderNumber),
    }));

  await insertChunk("equipment_repair_labor_entries", laborRows);
  await insertChunk("equipment_repair_work_order_parts", partRows);
  await insertChunk("equipment_repair_audit_log", auditRows);

  const backfillResult = backfillExistingDetails ? await backfillDetails(mapped, existingNumbers) : null;

  console.log(
    JSON.stringify(
      {
        importedWorkOrders: inserted?.length || 0,
        importedLaborLines: laborRows.length,
        importedPartLines: partRows.length,
        importedAuditRows: auditRows.length,
        ...(backfillResult || {}),
      },
      null,
      2,
    ),
  );
}

async function backfillDetails(mapped, existingNumbers) {
  const existingMapped = mapped.filter((row) => existingNumbers.has(row.workOrderNumber));
  if (!existingMapped.length) {
    return { backfilledLaborLines: 0, backfilledPartLines: 0 };
  }

  const { data: workOrders, error: workOrderError } = await supabase
    .from("equipment_repair_work_orders")
    .select("id,work_order_number")
    .in(
      "work_order_number",
      existingMapped.map((row) => row.workOrderNumber),
    );

  if (workOrderError) throw new Error(`Backfill work order lookup failed: ${workOrderError.message}`);
  const idByNumber = new Map((workOrders || []).map((row) => [row.work_order_number, row.id]));
  const workOrderIds = [...idByNumber.values()];
  if (!workOrderIds.length) return { backfilledLaborLines: 0, backfilledPartLines: 0 };

  const [{ data: existingLabor, error: laborError }, { data: existingParts, error: partError }] = await Promise.all([
    supabase.from("equipment_repair_labor_entries").select("work_order_id,notes").in("work_order_id", workOrderIds),
    supabase.from("equipment_repair_work_order_parts").select("work_order_id,item_code,notes").in("work_order_id", workOrderIds),
  ]);

  if (laborError) throw new Error(`Backfill labor lookup failed: ${laborError.message}`);
  if (partError) throw new Error(`Backfill parts lookup failed: ${partError.message}`);

  const laborAlreadyBackfilled = new Set(
    (existingLabor || [])
      .filter((row) => String(row.notes || "").includes("Legacy repair time"))
      .map((row) => row.work_order_id),
  );
  const partsAlreadyBackfilled = new Set(
    (existingParts || [])
      .filter((row) => row.item_code === "LEGACY-PARTS" || String(row.notes || "").includes("Legacy parts text"))
      .map((row) => row.work_order_id),
  );

  const laborRows = existingMapped
    .filter((row) => row.labor && idByNumber.has(row.workOrderNumber) && !laborAlreadyBackfilled.has(idByNumber.get(row.workOrderNumber)))
    .map((row) => ({
      ...row.labor,
      work_order_id: idByNumber.get(row.workOrderNumber),
    }));

  const partRows = existingMapped
    .filter((row) => row.part && idByNumber.has(row.workOrderNumber) && !partsAlreadyBackfilled.has(idByNumber.get(row.workOrderNumber)))
    .map((row) => ({
      ...row.part,
      work_order_id: idByNumber.get(row.workOrderNumber),
    }));

  await insertChunk("equipment_repair_labor_entries", laborRows);
  await insertChunk("equipment_repair_work_order_parts", partRows);

  return {
    backfilledLaborLines: laborRows.length,
    backfilledPartLines: partRows.length,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
