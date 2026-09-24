import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase service credentials are not configured.");
}

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "titan_invoice_approval.sql",
);
const migration = await fs.readFile(migrationPath, "utf8");
const preloadBlock = migration.match(
  /insert into public\.titan_ap_accounting_codes[\s\S]*?values([\s\S]*?)on conflict do nothing;/i,
)?.[1];

if (!preloadBlock) {
  throw new Error("The accounting-code preload block was not found.");
}

const tuplePattern =
  /\('(?<code>\d{5})',\s*'(?<description>(?:[^']|'')*)',\s*(?<active>true|false)\)/g;
const rows = [...preloadBlock.matchAll(tuplePattern)].map((match) => ({
  code: match.groups.code,
  description: match.groups.description.replaceAll("''", "'"),
  active: match.groups.active === "true",
}));

if (rows.length !== 128) {
  throw new Error(`Expected 128 accounting-code rows, found ${rows.length}.`);
}

const keyFor = (row) =>
  `${String(row.code).trim().toLowerCase()}|${String(row.description).trim().toLowerCase()}`;
const uniqueRows = new Map(rows.map((row) => [keyFor(row), row]));

if (uniqueRows.size !== rows.length) {
  throw new Error("The accounting-code preload contains duplicate rows.");
}

// The source sheet uses 66100 for both an inactive heading and the usable
// Wages - Other account. Keep the usable row when account numbers repeat.
const rowsByCode = new Map();
for (const row of rows) {
  const current = rowsByCode.get(row.code);
  if (!current || (!current.active && row.active)) rowsByCode.set(row.code, row);
}
const deployRows = [...rowsByCode.values()];

if (deployRows.length !== 127) {
  throw new Error(`Expected 127 unique account numbers, found ${deployRows.length}.`);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const { data: existing, error: existingError } = await admin
  .from("titan_ap_accounting_codes")
  .select("id,code,description,active");

if (existingError) throw existingError;

const existingByCode = new Map((existing ?? []).map((row) => [String(row.code).trim(), row]));
const missing = deployRows.filter((row) => !existingByCode.has(row.code));
const changed = deployRows.filter((row) => {
  const current = existingByCode.get(row.code);
  return (
    current &&
    (current.active !== row.active ||
      String(current.description).trim() !== row.description.trim())
  );
});

for (let index = 0; index < missing.length; index += 100) {
  const { error } = await admin
    .from("titan_ap_accounting_codes")
    .insert(missing.slice(index, index + 100));
  if (error) throw error;
}

for (const row of changed) {
  const current = existingByCode.get(row.code);
  const { error } = await admin
    .from("titan_ap_accounting_codes")
    .update({ description: row.description, active: row.active })
    .eq("id", current.id);
  if (error) throw error;
}

const { count, error: verifyError } = await admin
  .from("titan_ap_accounting_codes")
  .select("id", { count: "exact", head: true });

if (verifyError) throw verifyError;
if ((count ?? 0) < deployRows.length) {
  throw new Error(
    `Accounting-code verification failed: expected at least ${deployRows.length}, found ${count ?? 0}.`,
  );
}

console.log(
  `Accounting codes ready: ${deployRows.length} unique account numbers from ${rows.length} source rows, ${missing.length} inserted, ${changed.length} updates, ${count} total database rows.`,
);
