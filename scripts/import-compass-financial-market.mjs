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

function sourceKey(row) {
  return crypto.createHash("sha256").update(String(row.rig || "").trim().toLowerCase()).digest("hex").slice(0, 24);
}

function normalizeKind(cell) {
  const kind = String(cell?.kind || "unknown").toLowerCase();
  if (["pf", "shared", "comp", "unknown", "na"].includes(kind)) return kind;
  if (kind === "none" && String(cell?.name || "").toLowerCase().includes("spud")) return "na";
  if (kind === "none") return "unknown";
  return "unknown";
}

function errorText(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    return [error.message, error.details, error.hint, error.code].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return String(error);
}

async function zipJson(zip, suffix) {
  const entry = Object.values(zip.files).find((item) => !item.dir && item.name.toLowerCase().endsWith(suffix.toLowerCase()));
  if (!entry) throw new Error(`The verified handover does not contain ${suffix}.`);
  return JSON.parse(await entry.async("string"));
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
  const market = await zipJson(zip, "db/seeds/kpi/market_2026-07-01.json");
  const trend = await zipJson(zip, "db/seeds/kpi/market_trend.json");
  const competitors = await zipJson(zip, "db/seeds/kpi/competitors.json");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const requestedYardId = option("--yard-id");
  let yardQuery = admin.from("yards").select("id,name").eq("is_active", true);
  if (requestedYardId) yardQuery = yardQuery.eq("id", requestedYardId);
  else yardQuery = yardQuery.ilike("name", "%Dickinson%");
  const yard = await yardQuery.order("name").limit(1).maybeSingle();
  if (yard.error || !yard.data) throw new Error(requestedYardId ? "The selected TITAN yard was not found." : "The Dickinson TITAN yard was not found.");

  console.log(`\nCOMPASS financial market ${LIVE ? "LIVE IMPORT" : "DRY RUN"}`);
  console.log(`Source: ${path.basename(sourcePath)} (MD5 verified)`);
  console.log(`Yard: ${yard.data.name}`);
  console.log(`Snapshot: ${market.asOf}; ${market.rigs.length} rigs x ${market.services.length} services = ${market.rigs.length * market.services.length} positions.`);
  console.log(`Providers: ${competitors.length}; historical trend points: ${trend.length}.`);

  const schemaProbe = await admin.from("titan_financial_market_services").select("id").limit(1);
  if (schemaProbe.error) {
    const setupMessage = "Run supabase/titan_financial_market.sql in Supabase before importing the market snapshot.";
    if (!LIVE) {
      console.log(`\nSOURCE VERIFICATION PASSED. SETUP REQUIRED: ${setupMessage}`);
      return;
    }
    throw new Error(setupMessage);
  }
  if (!LIVE) {
    console.log("\nDRY RUN PASSED. The market tables are ready; nothing was written.");
    return;
  }

  const serviceRows = market.services.map(([service_key, name], sort_order) => ({
    yard_id: yard.data.id, service_key, name, sort_order, is_visible: true, is_active: true,
  }));
  const savedServices = await admin.from("titan_financial_market_services").upsert(serviceRows, { onConflict: "yard_id,service_key" }).select("id,service_key");
  if (savedServices.error) throw savedServices.error;
  const serviceIds = new Map(savedServices.data.map((row) => [row.service_key, row.id]));

  const rigRows = market.rigs.map((row) => ({
    yard_id: yard.data.id, source_key: sourceKey(row), rig_name: String(row.rig || ""),
    operator: String(row.operator || ""), segment: String(row.segment || "Competitor"), is_active: true,
  }));
  const savedRigs = await admin.from("titan_financial_market_rigs").upsert(rigRows, { onConflict: "yard_id,source_key" }).select("id,source_key");
  if (savedRigs.error) throw savedRigs.error;
  const rigIds = new Map(savedRigs.data.map((row) => [row.source_key, row.id]));

  const cellRows = market.rigs.flatMap((row) => Object.entries(row.services || {}).map(([serviceKey, cell]) => ({
    yard_id: yard.data.id,
    rig_id: rigIds.get(sourceKey(row)),
    service_id: serviceIds.get(serviceKey),
    kind: normalizeKind(cell),
    holder_name: String(cell?.name || "") || null,
    effective_date: market.asOf,
    source_key: `compass-s49:${serviceKey}`,
  })));
  for (let index = 0; index < cellRows.length; index += 250) {
    const saved = await admin.from("titan_financial_market_cells").upsert(cellRows.slice(index, index + 250), { onConflict: "yard_id,rig_id,service_id,effective_date" });
    if (saved.error) throw saved.error;
  }

  const providerRows = competitors.map((row) => ({
    yard_id: yard.data.id, canonical_name: row.canonical, service_keys: row.service_keys || [],
    aliases: row.aliases || [], is_pathfinder: Boolean(row.is_pathfinder), is_active: true,
  }));
  const savedProviders = await admin.from("titan_financial_market_competitors").upsert(providerRows, { onConflict: "yard_id,canonical_name" });
  if (savedProviders.error) throw savedProviders.error;

  const trendRows = trend.map((row) => ({
    yard_id: yard.data.id, service_key: row.service_key, quarter: row.quarter,
    won_pct: row.won_pct, shared_pct: row.shared_pct ?? null, source: "compass-s49",
  }));
  const savedTrend = await admin.from("titan_financial_market_trend").upsert(trendRows, { onConflict: "yard_id,service_key,quarter" });
  if (savedTrend.error) throw savedTrend.error;

  const verification = await Promise.all([
    admin.from("titan_financial_market_services").select("id", { head: true, count: "exact" }).eq("yard_id", yard.data.id).eq("is_active", true),
    admin.from("titan_financial_market_rigs").select("id", { head: true, count: "exact" }).eq("yard_id", yard.data.id).eq("is_active", true),
    admin.from("titan_financial_market_cells").select("id", { head: true, count: "exact" }).eq("yard_id", yard.data.id).eq("effective_date", market.asOf),
    admin.from("titan_financial_market_competitors").select("id", { head: true, count: "exact" }).eq("yard_id", yard.data.id).eq("is_active", true),
    admin.from("titan_financial_market_trend").select("id", { head: true, count: "exact" }).eq("yard_id", yard.data.id),
  ]);
  const verificationError = verification.find((result) => result.error)?.error;
  if (verificationError) throw verificationError;
  const expected = [serviceRows.length, rigRows.length, cellRows.length, providerRows.length, trendRows.length];
  verification.forEach((result, index) => {
    if ((result.count || 0) < expected[index]) throw new Error(`Post-import verification failed for market dataset ${index + 1}.`);
  });
  console.log("\nLIVE IMPORT PASSED. The Dickinson market snapshot, providers, and trends are loaded and verified.");
}

main().catch((error) => {
  console.error(`\nIMPORT STOPPED: ${errorText(error)}`);
  process.exit(1);
});
