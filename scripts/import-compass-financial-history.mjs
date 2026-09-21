import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const DEFAULT_SOURCE = "C:\\Users\\Wade Wisenor\\OneDrive - Pathfinder Inspections\\Compass\\COMPASS_Handover_PART_2_of_6_SOURCE_CODE (1)\\COMPASS_source_S49_v3.zip";
const EXPECTED_MD5 = "fba98af24c379c4c76aa5c07fb58af93";
const IMPORT_SOURCE = "compass_s49_import";
const LINES = ["dti", "cdt", "hb", "trs", "wash"];
const BATCH_SIZE = 150;
const LIVE = process.argv.includes("--live");
// The locked COMPASS build spec identifies 70362 as a Jul 31 post-import row
// that is intentionally absent from the S49 historical job seed.
const DOCUMENTED_PMI_MISSES = new Set(["70362"]);

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

function money(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function closeEnough(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) < 0.005;
}

function chunks(values, size = BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function headline(line, inputs) {
  const revenue = line === "dti" ? inputs.revenue_net ?? inputs.revenue : inputs.revenue;
  const manhours = line === "dti" || line === "hb" ? inputs.total_mh : inputs.total_hrs;
  return { revenue: revenue == null ? null : Number(revenue), manhours: manhours == null ? null : Number(manhours) };
}

async function readSeed(zip, fileName) {
  const suffix = `/db/seeds/kpi/${fileName}`.toLowerCase();
  const entry = Object.values(zip.files).find((candidate) => !candidate.dir && `/${candidate.name}`.toLowerCase().endsWith(suffix));
  if (!entry) throw new Error(`The handover archive does not contain db/seeds/kpi/${fileName}.`);
  return JSON.parse(await entry.async("string"));
}

async function allRows(admin, table, columns, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const result = await configure(admin.from(table).select(columns)).range(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) break;
  }
  return rows;
}

async function insertBatches(admin, table, rows) {
  for (const batch of chunks(rows)) {
    const result = await admin.from(table).insert(batch);
    if (result.error) throw result.error;
  }
}

function compareRecord(existing, planned) {
  return existing.yard_id === planned.yard_id &&
    existing.service_line === planned.service_line &&
    existing.job_date === planned.job_date &&
    existing.category_code === planned.category_code &&
    existing.invoice === planned.invoice &&
    closeEnough(existing.revenue, planned.revenue) &&
    closeEnough(existing.computed?.total_cost, planned.computed?.total_cost) &&
    existing.rates_used?.source_row_hash === planned.rates_used.source_row_hash;
}

function tubingConflict(existing, planned, fields) {
  return fields.some((field) => String(existing[field] ?? "") !== String(planned[field] ?? ""));
}

function resolvePmiRows(cdtRows, seed) {
  const matchedIndexes = new Set();
  const details = [];
  const misses = [];
  for (const pmi of seed.rows) {
    const matches = cdtRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        const tokens = String(row.inputs.invoice ?? "").trim().split(/\s+/).filter(Boolean);
        return tokens.some((token) => pmi.invoices.includes(token));
      });
    if (matches.length === 0 && pmi.invoices.every((invoice) => DOCUMENTED_PMI_MISSES.has(invoice))) {
      misses.push(pmi);
      continue;
    }
    if (matches.length !== 1) throw new Error(`PMI invoice [${pmi.invoices.join(" ")}] matched ${matches.length} CDT rows; expected exactly one.`);
    const match = matches[0];
    const revenue = headline("cdt", match.row.inputs).revenue;
    if (!closeEnough(revenue, pmi.invoice_amount)) {
      throw new Error(`PMI invoice [${pmi.invoices.join(" ")}] is ${money(revenue)} in CDT but ${money(pmi.invoice_amount)} in the PMI seed.`);
    }
    if (matchedIndexes.has(match.index)) throw new Error(`More than one PMI seed row matched CDT row ${match.index + 1}.`);
    matchedIndexes.add(match.index);
    details.push({ invoices: pmi.invoices.join(" "), revenue });
  }
  const matchedTotal = details.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const missedTotal = misses.reduce((sum, row) => sum + Number(row.invoice_amount || 0), 0);
  if (matchedIndexes.size + misses.length !== seed.row_count || !closeEnough(matchedTotal + missedTotal, seed.workbook_invoice_total)) {
    throw new Error(`PMI reconciliation failed: matched ${matchedIndexes.size} / ${money(matchedTotal)}, documented misses ${misses.length} / ${money(missedTotal)}; expected ${seed.row_count} / ${money(seed.workbook_invoice_total)}.`);
  }
  return { matchedIndexes, matchedTotal, misses, missedTotal };
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env.local"));
  loadEnv(path.join(process.cwd(), ".env"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

  const sourcePath = path.resolve(option("--source", process.env.COMPASS_SOURCE_ZIP || DEFAULT_SOURCE));
  if (!fs.existsSync(sourcePath)) throw new Error(`Compass source archive not found: ${sourcePath}`);
  const archive = fs.readFileSync(sourcePath);
  const actualMd5 = crypto.createHash("md5").update(archive).digest("hex");
  if (actualMd5 !== EXPECTED_MD5) throw new Error(`Compass archive checksum is ${actualMd5}; expected ${EXPECTED_MD5}. Refusing an unverified source.`);
  const zip = await JSZip.loadAsync(archive);
  const seeds = {};
  for (const line of LINES) seeds[line] = await readSeed(zip, `${line}_jobs.json`);
  const pmiSeed = await readSeed(zip, "pmi_invoices.json");
  const tubing = await readSeed(zip, "tu.json");
  const tubingRevenue = await readSeed(zip, "tu_revenue.json");
  const pmi = resolvePmiRows(seeds.cdt, pmiSeed);

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const yardsResult = await admin.from("yards").select("id,name,is_active").eq("is_active", true).order("name");
  if (yardsResult.error) throw yardsResult.error;
  const requestedYard = option("--yard-id");
  const yard = requestedYard
    ? (yardsResult.data ?? []).find((item) => item.id === requestedYard)
    : (yardsResult.data ?? []).find((item) => item.name.toLowerCase().includes("dickinson"));
  if (!yard) throw new Error(requestedYard ? `Active yard ${requestedYard} was not found.` : "An active Dickinson yard was not found.");

  const plannedJobs = [];
  const expectedByLine = {};
  for (const line of LINES) {
    expectedByLine[line] = { rows: seeds[line].length, revenue: 0, cost: 0 };
    seeds[line].forEach((row, index) => {
      const values = headline(line, row.inputs);
      expectedByLine[line].revenue += Number(values.revenue || 0);
      expectedByLine[line].cost += Number(row.computed?.total_cost || 0);
      const sourceRowHash = sha256({ line, row });
      plannedJobs.push({
        yard_id: yard.id,
        service_line: line,
        job_date: row.date,
        category_code: line === "cdt" && pmi.matchedIndexes.has(index) ? "pmi" : "standard",
        operator: row.inputs.operator ?? null,
        rig: row.inputs.rig ?? null,
        lead: row.inputs.lead ?? null,
        state: row.inputs.state ?? null,
        invoice: row.inputs.invoice == null ? null : String(row.inputs.invoice),
        revenue: values.revenue,
        crew: row.inputs.crew ?? null,
        manhours: values.manhours,
        comments: row.inputs.comments ?? null,
        inputs: row.inputs,
        computed: row.computed,
        rates_used: {
          historical_import: true,
          source_archive: path.basename(sourcePath),
          source_archive_md5: actualMd5,
          source_row_hash: sourceRowHash,
          note: "Values frozen from the COMPASS S49 workbook handover.",
        },
        source: IMPORT_SOURCE,
        source_key: `compass-s49:${line}:${String(index + 1).padStart(4, "0")}`,
      });
    });
  }

  const existingJobs = await allRows(
    admin,
    "titan_financial_jobs",
    "yard_id,service_line,job_date,category_code,invoice,revenue,computed,rates_used,source,source_key",
    (query) => query.eq("source", IMPORT_SOURCE),
  );
  const existingByKey = new Map(existingJobs.map((row) => [row.source_key, row]));
  const conflicts = plannedJobs.filter((row) => existingByKey.has(row.source_key) && !compareRecord(existingByKey.get(row.source_key), row));
  const missingJobs = plannedJobs.filter((row) => !existingByKey.has(row.source_key));
  const unexpected = existingJobs.filter((row) => !plannedJobs.some((planned) => planned.source_key === row.source_key));
  if (conflicts.length || unexpected.length) {
    throw new Error(`Existing COMPASS import data conflicts with the verified archive (${conflicts.length} changed keys, ${unexpected.length} unexpected keys). Nothing was written.`);
  }

  const plannedWeeks = tubing.weeks.map((row) => ({ yard_id: yard.id, week_start: row.week, manhours: row.manhours ?? null, is_active: true }));
  const plannedEntries = tubing.entries.map((row) => ({ yard_id: yard.id, week_start: row.week, customer: row.customer, joints: row.joints ?? null, jobs: row.jobs ?? null, trucks_in: row.trucks_in ?? null, trucks_out: row.trucks_out ?? null, is_active: true }));
  const plannedRevenue = tubingRevenue.map((row) => ({ yard_id: yard.id, revenue_month: row.month, customer: row.customer ?? null, amount: row.amount, source: row.source, is_active: true }));
  const [currentWeeks, currentEntries, currentRevenue] = await Promise.all([
    allRows(admin, "titan_financial_tubing_weeks", "yard_id,week_start,manhours,is_active", (query) => query.eq("yard_id", yard.id)),
    allRows(admin, "titan_financial_tubing_entries", "yard_id,week_start,customer,joints,jobs,trucks_in,trucks_out,is_active", (query) => query.eq("yard_id", yard.id)),
    allRows(admin, "titan_financial_tubing_revenue", "yard_id,revenue_month,customer,amount,source,is_active", (query) => query.eq("yard_id", yard.id)),
  ]);
  const weekMap = new Map(currentWeeks.map((row) => [row.week_start, row]));
  const entryMap = new Map(currentEntries.map((row) => [`${row.week_start}|${row.customer}`, row]));
  const revenueMap = new Map(currentRevenue.map((row) => [`${row.revenue_month}|${row.customer ?? "(total)"}`, row]));
  const missingWeeks = plannedWeeks.filter((row) => !weekMap.has(row.week_start));
  const missingEntries = plannedEntries.filter((row) => !entryMap.has(`${row.week_start}|${row.customer}`));
  const missingRevenue = plannedRevenue.filter((row) => !revenueMap.has(`${row.revenue_month}|${row.customer ?? "(total)"}`));
  const tubingConflicts = [
    ...plannedWeeks.filter((row) => weekMap.has(row.week_start) && tubingConflict(weekMap.get(row.week_start), row, ["manhours", "is_active"])),
    ...plannedEntries.filter((row) => entryMap.has(`${row.week_start}|${row.customer}`) && tubingConflict(entryMap.get(`${row.week_start}|${row.customer}`), row, ["joints", "jobs", "trucks_in", "trucks_out", "is_active"])),
    ...plannedRevenue.filter((row) => revenueMap.has(`${row.revenue_month}|${row.customer ?? "(total)"}`) && tubingConflict(revenueMap.get(`${row.revenue_month}|${row.customer ?? "(total)"}`), row, ["amount", "source", "is_active"])),
  ];
  if (tubingConflicts.length) throw new Error(`${tubingConflicts.length} existing Tubing rows disagree with the handover. Nothing was written.`);

  console.log(`\nCOMPASS S49 financial history ${LIVE ? "LIVE IMPORT" : "DRY RUN"}`);
  console.log(`Source: ${path.basename(sourcePath)} (MD5 verified)`);
  console.log(`TITAN yard: ${yard.name}`);
  console.log("\nService line reconciliation:");
  for (const line of LINES) {
    const totals = expectedByLine[line];
    const already = existingJobs.filter((row) => row.service_line === line).length;
    console.log(`  ${line.toUpperCase().padEnd(4)} ${String(totals.rows).padStart(4)} rows | revenue ${money(totals.revenue).padStart(15)} | cost ${money(totals.cost).padStart(15)} | already ${already}`);
  }
  console.log(`  PMI    ${pmi.matchedIndexes.size} CDT rows | revenue ${money(pmi.matchedTotal)} (matched exactly)`);
  for (const miss of pmi.misses) {
    console.log(`         documented post-import miss: invoice [${miss.invoices.join(" ")}] ${money(miss.invoice_amount)} dated ${miss.job_date}`);
  }
  console.log(`  TU     ${plannedEntries.length} entries | ${plannedWeeks.length} weeks | ${plannedRevenue.length} revenue months | revenue ${money(plannedRevenue.reduce((sum, row) => sum + Number(row.amount), 0))}`);
  console.log(`\nPending: ${missingJobs.length} jobs, ${missingWeeks.length} Tubing weeks, ${missingEntries.length} Tubing entries, ${missingRevenue.length} Tubing revenue rows.`);

  if (!LIVE) {
    console.log("\nDRY RUN PASSED. Nothing was written. Run npm run import:compass-financials to perform the verified import.");
    return;
  }

  await insertBatches(admin, "titan_financial_jobs", missingJobs);
  await insertBatches(admin, "titan_financial_tubing_weeks", missingWeeks);
  await insertBatches(admin, "titan_financial_tubing_entries", missingEntries);
  await insertBatches(admin, "titan_financial_tubing_revenue", missingRevenue);

  const savedJobs = await allRows(
    admin,
    "titan_financial_jobs",
    "service_line,revenue,computed,source,source_key",
    (query) => query.eq("yard_id", yard.id).eq("source", IMPORT_SOURCE),
  );
  for (const line of LINES) {
    const saved = savedJobs.filter((row) => row.service_line === line);
    const revenue = saved.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const cost = saved.reduce((sum, row) => sum + Number(row.computed?.total_cost || 0), 0);
    const expected = expectedByLine[line];
    if (saved.length !== expected.rows || !closeEnough(revenue, expected.revenue) || !closeEnough(cost, expected.cost)) {
      throw new Error(`Post-import ${line.toUpperCase()} reconciliation failed: ${saved.length} rows, ${money(revenue)} revenue, ${money(cost)} cost.`);
    }
  }
  const [savedWeeks, savedEntries, savedRevenue] = await Promise.all([
    allRows(admin, "titan_financial_tubing_weeks", "week_start", (query) => query.eq("yard_id", yard.id)),
    allRows(admin, "titan_financial_tubing_entries", "week_start,customer", (query) => query.eq("yard_id", yard.id)),
    allRows(admin, "titan_financial_tubing_revenue", "amount", (query) => query.eq("yard_id", yard.id)),
  ]);
  const revenueTotal = savedRevenue.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  if (savedWeeks.length !== plannedWeeks.length || savedEntries.length !== plannedEntries.length || savedRevenue.length !== plannedRevenue.length ||
      !closeEnough(revenueTotal, plannedRevenue.reduce((sum, row) => sum + Number(row.amount), 0))) {
    throw new Error("Post-import Tubing reconciliation failed.");
  }
  console.log("\nLIVE IMPORT PASSED. Every job row, revenue total, cost total, PMI classification, and Tubing total matches the verified handover.");
}

main().catch((error) => {
  console.error(`\nIMPORT STOPPED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
