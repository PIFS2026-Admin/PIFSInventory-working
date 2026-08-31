import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Pass the Trello JSON export path as the first argument.");
}

const root = process.cwd();
const exportData = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const activeLists = (exportData.lists ?? []).filter((list) => !list.closed).sort((a, b) => Number(a.pos) - Number(b.pos));
const activeListIds = new Set(activeLists.map((list) => list.id));
const activeCards = (exportData.cards ?? [])
  .filter((card) => !card.closed && activeListIds.has(card.idList))
  .sort((a, b) => Number(a.pos) - Number(b.pos));
const labelsById = new Map((exportData.labels ?? []).map((label) => [label.id, label]));
const cardsById = new Map(activeCards.map((card) => [card.id, card]));

const laneColors = ["#7dd3fc", "#fb923c", "#facc15", "#a78bfa", "#34d399", "#38bdf8", "#f472b6", "#94a3b8"];
const columnKey = (listId) => `trello_${listId}`;
const cleanText = (value) => String(value ?? "").replaceAll("\u0000", "").trim();
const sqlText = (value) => `'${cleanText(value).replaceAll("'", "''")}'`;
const sqlDate = (value) => (value ? `${sqlText(String(value).slice(0, 10))}::date` : "null::date");
const sqlArray = (values) => {
  const cleaned = values.map(cleanText).filter(Boolean);
  return cleaned.length ? `array[${cleaned.map(sqlText).join(", ")}]::text[]` : "array[]::text[]";
};

function cardLabels(card) {
  const labels = (card.labels?.length ? card.labels : (card.idLabels ?? []).map((id) => labelsById.get(id))).filter(Boolean);
  return [...new Set(labels.map((label) => cleanText(label.name) || cleanText(label.color)).filter(Boolean))];
}

function cardDescription(card, includeAttachments) {
  const sections = [];
  const description = cleanText(card.desc);
  if (description) sections.push(description);

  if (includeAttachments && card.attachments?.length) {
    const attachmentLines = card.attachments
      .map((attachment) => {
        const name = cleanText(attachment.name || attachment.fileName || "Attachment");
        const url = cleanText(attachment.url);
        return url ? `- ${name}: ${url}` : `- ${name}`;
      })
      .filter(Boolean);
    if (attachmentLines.length) sections.push(`Trello attachments\n${attachmentLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

const columns = activeLists.map((list, index) => ({
  key: columnKey(list.id),
  title: cleanText(list.name),
  description: `Tubing jobs in ${cleanText(list.name)}.`,
  color: laneColors[index % laneColors.length],
}));

const cardsPerList = new Map();
const starterCards = activeCards.map((card) => {
  const index = cardsPerList.get(card.idList) ?? 0;
  cardsPerList.set(card.idList, index + 1);
  const tags = cardLabels(card);
  return {
    title: cleanText(card.name),
    description: cardDescription(card, false),
    priority: tags.some((tag) => tag.toLowerCase() === "on hold") ? "High" : "Normal",
    tags,
    columnKey: columnKey(card.idList),
  };
});

const ts = `// Generated from the WTX Pathfinder Yard Progress Trello export.\n// Re-run scripts/generate-tubing-job-board.mjs when a newer export is provided.\n\nimport type { ServiceLineBoardColumnConfig, ServiceLineBoardStarterCard } from "./serviceLineBoards";\n\nexport const wtxTubingJobBoardColumns: ServiceLineBoardColumnConfig[] = ${JSON.stringify(columns, null, 2)};\n\nexport const wtxTubingJobBoardStarterCards: ServiceLineBoardStarterCard[] = ${JSON.stringify(starterCards, null, 2)};\n`;

const listValues = activeLists.map((list, index) =>
  `    (${sqlText(columnKey(list.id))}, ${sqlText(cleanText(list.name))}, ${sqlText(`Tubing jobs in ${cleanText(list.name)}.`)}, ${sqlText(laneColors[index % laneColors.length])}, ${(index + 1) * 100})`
);

const sqlCardsPerList = new Map();
const cardValues = activeCards.map((card) => {
  const index = sqlCardsPerList.get(card.idList) ?? 0;
  sqlCardsPerList.set(card.idList, index + 1);
  const tags = cardLabels(card);
  const priority = tags.some((tag) => tag.toLowerCase() === "on hold") ? "High" : "Normal";
  return `    (${sqlText(columnKey(card.idList))}, ${sqlText(card.id)}, ${sqlText(cleanText(card.name))}, ${sqlText(cardDescription(card, true))}, ${sqlText(priority)}, ${sqlDate(card.due)}, ${(index + 1) * 100}, ${sqlArray(tags)})`;
});

const checklistValues = [];
for (const checklist of exportData.checklists ?? []) {
  if (!cardsById.has(checklist.idCard)) continue;
  const sortedItems = [...(checklist.checkItems ?? [])].sort((a, b) => Number(a.pos) - Number(b.pos));
  sortedItems.forEach((item, index) => {
    checklistValues.push(
      `    (${sqlText(checklist.idCard)}, ${sqlText(item.id)}, ${sqlText(cleanText(item.name))}, ${item.state === "complete" ? "true" : "false"}, ${(index + 1) * 100})`
    );
  });
}

const sql = `-- Tubing Job Board imported from WTX Pathfinder Yard Progress (Trello).\n-- Run supabase/titan_service_line_boards.sql first. This migration is safe to rerun.\n\nbegin;\n\ninsert into public.service_boards (board_key, service_line_key, name, description, active)\nvalues ('tubing', 'tubing', 'Tubing Job Board', 'Live Tubing job tracking from incoming work through waterblast, inspection, repairs, invoicing, and completion.', true)\non conflict (board_key) do update\nset service_line_key = excluded.service_line_key,\n    name = excluded.name,\n    description = excluded.description,\n    active = true;\n\nwith target_board as (\n  select id from public.service_boards where board_key = 'tubing'\n), lane_seed (column_key, title, description, color, sort_order) as (\n  values\n${listValues.join(",\n")}\n)\ninsert into public.service_board_columns (board_id, column_key, title, description, color, sort_order, active)\nselect target_board.id, lane_seed.column_key, lane_seed.title, lane_seed.description, lane_seed.color, lane_seed.sort_order, true\nfrom target_board\ncross join lane_seed\non conflict (board_id, column_key) do update\nset title = excluded.title,\n    description = excluded.description,\n    color = excluded.color,\n    sort_order = excluded.sort_order,\n    active = true;\n\n-- Preserve any manually created cards from the old placeholder lanes by moving them to the first imported lane.\nwith target_board as (\n  select id from public.service_boards where board_key = 'tubing'\n), incoming_lane as (\n  select c.id\n  from public.service_board_columns c\n  join target_board b on b.id = c.board_id\n  where c.column_key = ${sqlText(columnKey(activeLists[0]?.id ?? "incoming"))}\n)\nupdate public.service_board_cards card\nset column_id = incoming_lane.id\nfrom target_board, incoming_lane, public.service_board_columns old_lane\nwhere card.board_id = target_board.id\n  and old_lane.id = card.column_id\n  and old_lane.column_key in ('requested', 'scheduled', 'in_progress', 'review', 'complete')\n  and coalesce(card.source_type, '') <> 'seed';\n\ndelete from public.service_board_cards card\nusing public.service_boards board\nwhere card.board_id = board.id\n  and board.board_key = 'tubing'\n  and card.source_type = 'seed';\n\nupdate public.service_board_columns lane\nset active = false\nfrom public.service_boards board\nwhere lane.board_id = board.id\n  and board.board_key = 'tubing'\n  and lane.column_key in ('requested', 'scheduled', 'in_progress', 'review', 'complete');\n\nwith target_board as (\n  select id from public.service_boards where board_key = 'tubing'\n), card_seed (column_key, source_id, title, description, priority, due_date, sort_order, tags) as (\n  values\n${cardValues.join(",\n")}\n)\ninsert into public.service_board_cards (\n  board_id, column_id, title, description, priority, assigned_to_name, due_date, sort_order, tags, source_type, source_id, archived_at\n)\nselect board.id, lane.id, seed.title, nullif(seed.description, ''), seed.priority, 'Tubing', seed.due_date, seed.sort_order, seed.tags, 'trello_tubing', seed.source_id, null\nfrom target_board board\njoin card_seed seed on true\njoin public.service_board_columns lane on lane.board_id = board.id and lane.column_key = seed.column_key\non conflict (board_id, source_type, source_id) where source_type is not null and source_id is not null do update\nset column_id = excluded.column_id,\n    title = excluded.title,\n    description = excluded.description,\n    priority = excluded.priority,\n    assigned_to_name = excluded.assigned_to_name,\n    due_date = excluded.due_date,\n    sort_order = excluded.sort_order,\n    tags = excluded.tags,\n    archived_at = null;\n\nalter table public.service_board_card_checklist add column if not exists source_type text;\nalter table public.service_board_card_checklist add column if not exists source_id text;\ncreate unique index if not exists service_board_checklist_source_unique\non public.service_board_card_checklist(card_id, source_type, source_id)\nwhere source_type is not null and source_id is not null;\n\nwith checklist_seed (card_source_id, source_id, label, is_done, sort_order) as (\n  values\n${checklistValues.join(",\n")}\n)\ninsert into public.service_board_card_checklist (card_id, label, is_done, sort_order, source_type, source_id)\nselect card.id, seed.label, seed.is_done, seed.sort_order, 'trello_tubing', seed.source_id\nfrom checklist_seed seed\njoin public.service_boards board on board.board_key = 'tubing'\njoin public.service_board_cards card\n  on card.board_id = board.id\n and card.source_type = 'trello_tubing'\n and card.source_id = seed.card_source_id\non conflict (card_id, source_type, source_id) where source_type is not null and source_id is not null do update\nset label = excluded.label,\n    is_done = excluded.is_done,\n    sort_order = excluded.sort_order;\n\ncommit;\n\nselect\n  board.name,\n  count(distinct lane.id) filter (where lane.active) as active_lanes,\n  count(distinct card.id) filter (where card.archived_at is null) as active_cards,\n  count(distinct item.id) as checklist_items\nfrom public.service_boards board\nleft join public.service_board_columns lane on lane.board_id = board.id\nleft join public.service_board_cards card on card.board_id = board.id and card.source_type = 'trello_tubing'\nleft join public.service_board_card_checklist item on item.card_id = card.id and item.source_type = 'trello_tubing'\nwhere board.board_key = 'tubing'\ngroup by board.name;\n`;

fs.writeFileSync(path.join(root, "lib", "wtxTubingJobBoardSeed.ts"), ts);
fs.writeFileSync(path.join(root, "supabase", "tubing_job_board.sql"), sql);

console.log(`Generated ${columns.length} lanes, ${starterCards.length} cards, and ${checklistValues.length} checklist items.`);
