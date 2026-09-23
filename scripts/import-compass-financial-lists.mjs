import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const DEFAULT_SOURCE = "C:\\Users\\Wade Wisenor\\OneDrive - Pathfinder Inspections\\Compass\\COMPASS_Handover_PART_2_of_6_SOURCE_CODE (1)\\COMPASS_source_S49_v3.zip";
const EXPECTED_MD5 = "fba98af24c379c4c76aa5c07fb58af93";
const LIVE = process.argv.includes("--live");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function allRows(admin, yardIds) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const result = await admin.from("titan_financial_pick_list_values")
      .select("yard_id,service_line,list_key,list_value,is_active")
      .in("yard_id", yardIds)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) break;
  }
  return rows;
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env.local"));
  loadEnv(path.join(process.cwd(), ".env"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

  const sourcePath = path.resolve(option("--source", process.env.COMPASS_SOURCE_ZIP || DEFAULT_SOURCE));
  const archive = fs.readFileSync(sourcePath);
  const actualMd5 = crypto.createHash("md5").update(archive).digest("hex");
  if (actualMd5 !== EXPECTED_MD5) throw new Error(`Compass archive checksum is ${actualMd5}; expected ${EXPECTED_MD5}.`);
  const zip = await JSZip.loadAsync(archive);
  const entry = Object.values(zip.files).find((item) => !item.dir && item.name.toLowerCase().endsWith("db/seeds/kpi/rates_lists.json"));
  if (!entry) throw new Error("The verified handover does not contain rates_lists.json.");
  const seed = JSON.parse(await entry.async("string"));

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let yardsQuery = admin.from("yards").select("id,name").eq("is_active", true).order("name");
  const yardId = option("--yard-id");
  if (yardId) yardsQuery = yardsQuery.eq("id", yardId);
  const yards = await yardsQuery;
  if (yards.error) throw yards.error;
  if (!yards.data?.length) throw new Error("No matching active TITAN yards were found.");

  const planned = yards.data.flatMap((yard) => Object.entries(seed.lists).flatMap(([serviceLine, lists]) =>
    Object.entries(lists).flatMap(([listKey, values]) => values.map((listValue, index) => ({
      yard_id: yard.id, service_line: serviceLine, list_key: listKey, list_value: String(listValue), sort_order: index, is_active: true,
    }))),
  ));
  const yardIds = yards.data.map((yard) => yard.id);
  const current = await allRows(admin, yardIds);
  const existing = new Set(current.map((row) => `${row.yard_id}|${row.service_line}|${row.list_key}|${row.list_value}`));
  const missing = planned.filter((row) => !existing.has(`${row.yard_id}|${row.service_line}|${row.list_key}|${row.list_value}`));

  console.log(`\nCOMPASS financial pick lists ${LIVE ? "LIVE IMPORT" : "DRY RUN"}`);
  console.log(`Source: ${path.basename(sourcePath)} (MD5 verified)`);
  console.log(`Yards: ${yards.data.map((yard) => yard.name).join(", ")}`);
  console.log(`Verified values: ${planned.length}; already present: ${planned.length - missing.length}; pending: ${missing.length}.`);
  if (!LIVE) {
    console.log("\nDRY RUN PASSED. Nothing was written.");
    return;
  }

  for (let index = 0; index < planned.length; index += 250) {
    const saved = await admin.from("titan_financial_pick_list_values").upsert(planned.slice(index, index + 250), {
      onConflict: "yard_id,service_line,list_key,list_value",
    });
    if (saved.error) throw saved.error;
  }
  const verification = (await allRows(admin, yardIds)).filter((row) => row.is_active);
  const verified = new Set(verification.map((row) => `${row.yard_id}|${row.service_line}|${row.list_key}|${row.list_value}`));
  const misses = planned.filter((row) => !verified.has(`${row.yard_id}|${row.service_line}|${row.list_key}|${row.list_value}`));
  if (misses.length) throw new Error(`Post-import verification is missing ${misses.length} values.`);
  console.log("\nLIVE IMPORT PASSED. Every verified Compass pick-list value is active in each selected yard.");
}

main().catch((error) => {
  console.error(`\nIMPORT STOPPED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
