import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this setup.");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const yardCode = "GILLETTE";
const yardName = "Gillette Yard";

const zones = [
  ["Shipping", "shipping", 10],
  ["Receiving", "receiving", 20],
  ["Water Blaster", "water_blaster", 30],
  ["Inspection", "inspection", 40],
  ["Hardband", "hardband", 50],
  ["Machine Shop", "machine_shop", 60],
];

const racks = [
  ["Tower DBR Rack", 72, 70, 112, 44, 0, 1],
  ["Rack 9", 210, 70, 116, 76, 0, 2],
  ["Rack 8", 352, 70, 116, 76, 0, 3],
  ["Rack 7", 496, 70, 116, 76, 0, 4],
  ["Rack 6", 640, 70, 116, 76, 0, 5],
  ["North Gate", 782, 70, 226, 26, 0, 6],
  ["Rack 5", 1030, 70, 94, 66, 0, 7],
  ["Rack 4", 1150, 70, 94, 66, 0, 8],
  ["Rack 3", 1270, 70, 94, 66, 0, 9],
  ["Rack 2", 1360, 224, 48, 112, 90, 10],
  ["Rack 1", 1338, 356, 72, 104, 90, 11],
  ["Rack 10", 44, 224, 52, 112, 90, 12],
  ["Rack 11", 82, 356, 72, 104, 90, 13],
  ["Rack 12", 82, 486, 72, 104, 90, 14],
  ["Rack 13", 82, 616, 72, 86, 90, 15],
  ["Board Bunks", 40, 706, 84, 42, 0, 16],
  ["Rack 18", 210, 224, 116, 90, 0, 17],
  ["Rack 17", 352, 224, 116, 90, 0, 18],
  ["Rack 19", 210, 356, 116, 90, 0, 19],
  ["Rack 20", 352, 356, 116, 90, 0, 20],
  ["Rack 14", 112, 754, 116, 76, 0, 21],
  ["Rack 15", 252, 754, 116, 76, 0, 22],
  ["Rack 16", 414, 754, 116, 76, 0, 23],
  ["Helicopter Rack", 1115, 642, 118, 78, 0, 24],
  ["Waist High Racks", 1262, 642, 120, 64, 0, 25],
];

const descriptionCodes = [
  ["DP4XT39", 'DRILL PIPE 4" XT-39', '4"', "XT-39"],
  ["DP4XT39YB", 'DRILL PIPE 4" XT-39 YELLOW BAND', '4"', "XT-39"],
  ["DP4DS38", 'DRILL PIPE 4" DS-38', '4"', "DS-38"],
  ["DP4DS38B", 'DRILL PIPE 4" DS-38 BAOSHAN', '4"', "DS-38"],
  ["DP45DS42", 'DRILL PIPE 4.5" DS-42', '4.5"', "DS-42"],
  ["HW4DS38", 'HEAVY WEIGHT 4" DS-38', '4"', "DS-38"],
  ["HW4XT39", 'HEAVY WEIGHT 4" XT-39', '4"', "XT-39"],
  ["HW5NC50", 'HEAVY WEIGHT 5" NC-50 CONVENTIONAL', '5"', "NC-50"],
  ["HW5NC50S", 'HEAVY WEIGHT 5" NC-50 SPIRAL', '5"', "NC-50"],
  ["TU2875PH6", 'TUBING 2.875" PH6 CONNECTIONS', '2.875"', "PH6"],
  ["TU2375PH6", 'TUBING 2.375" PH6 CONNECTIONS', '2.375"', "PH6"],
];

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

async function queryOrThrow(label, request) {
  const { data, error } = await request;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function upsertWithColumnFallback(label, table, rows, onConflict, optionalKeys) {
  const result = await supabase.from(table).upsert(rows, { onConflict }).select("id");
  if (!result.error) return result.data || [];

  const missingOptionalColumn = optionalKeys.some((key) =>
    result.error.message.toLowerCase().includes(`'${key.toLowerCase()}'`) ||
    result.error.message.toLowerCase().includes(`${key.toLowerCase()} column`) ||
    result.error.message.toLowerCase().includes(`column ${table}.${key.toLowerCase()} does not exist`),
  );

  if (!missingOptionalColumn) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  const strippedRows = rows.map((row) => {
    const clean = { ...row };
    optionalKeys.forEach((key) => delete clean[key]);
    return clean;
  });

  return queryOrThrow(
    `${label} without optional layout columns`,
    supabase.from(table).upsert(strippedRows, { onConflict }).select("id"),
  );
}

async function main() {
  const yard = await queryOrThrow(
    "Gillette yard",
    supabase
      .from("yards")
      .upsert({ name: yardName, code: yardCode, is_active: true }, { onConflict: "code" })
      .select("id, name, code")
      .single(),
  );

  await queryOrThrow(
    "Gillette workflow zones",
    supabase
      .from("workflow_zones")
      .upsert(
        zones.map(([name, code, sortOrder]) => ({
          yard_id: yard.id,
          name,
          code,
          sort_order: sortOrder,
          is_active: true,
        })),
        { onConflict: "yard_id,code" },
      )
      .select("id"),
  );

  await upsertWithColumnFallback(
    "Gillette racks",
    "racks",
    racks.map(([rackCode, layoutX, layoutY, layoutWidth, layoutHeight, rotation, sortOrder]) => ({
      yard_id: yard.id,
      rack_code: rackCode,
      capacity_joints: 500,
      sort_order: sortOrder,
      layout_x: layoutX,
      layout_y: layoutY,
      layout_width: layoutWidth,
      layout_height: layoutHeight,
      layout_group: "Gillette",
      rotation,
      is_active: true,
    })),
    "yard_id,rack_code",
    ["layout_width", "layout_height"],
  );

  for (const [partNumber, description, size, connection] of descriptionCodes) {
    const existing = await queryOrThrow(
      `part lookup ${partNumber}`,
      supabase
        .from("part_numbers")
        .select("id")
        .is("company_id", null)
        .eq("part_number", partNumber)
        .maybeSingle(),
    );

    if (existing) continue;

    await queryOrThrow(
      `part create ${partNumber}`,
      supabase
        .from("part_numbers")
        .insert({
          company_id: null,
          part_number: partNumber,
          description,
          size,
          grade: null,
          connection,
          pipe_range: "Range 2",
        })
        .select("id")
        .single(),
    );
  }

  console.log(`Gillette yard setup complete: ${yard.name}`);
  console.log(`Racks prepared: ${racks.length}`);
  console.log(`Description codes prepared: ${descriptionCodes.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
