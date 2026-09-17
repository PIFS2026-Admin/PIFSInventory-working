import "server-only";

import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeDtiRefaceCode, resolveDtiReportComponentType, type DtiComponentType } from "./dtiInspectionReport";

type Report = Record<string, unknown>;
type Item = { component_type: DtiComponentType; sequence_number: number; row_data: Record<string, unknown> };
type ProveUp = Record<string, unknown>;

const commonFindingColumns: Record<string, string> = {
  boxReface: "Z", boxRefaceType: "AA", pinReface: "AB", pinRefaceType: "AC",
  damagedSealBox: "AD", damagedSealPin: "AE", damagedThreadsBox: "AF", damagedThreadsPin: "AG",
  damagedTorqueShoulderBox: "AH", damagedTorqueShoulderPin: "AI",
};

const drillPipeColumns: Record<string, string> = {
  jointNumber: "B", serialNumber: "C", odGage: "D", nominalWallThickness: "E", utThickness: "F", percentNominalWall: "G",
  boxOd: "H", pinId: "I", boxBevelDiameter: "J", pinBevelDiameter: "K", boxTongSpace: "L", pinTongSpace: "M",
  borebackDiameter: "N", borebackLength: "O", stressReliefDiameter: "P", stressReliefLength: "Q", counterboreDepth: "R",
  counterboreDiameter: "S", sealWidth: "T", pinNoseDiameter: "U", boxCriticalLength: "V", boxLengthAfterRepair: "W",
  pinCriticalLength: "X", pinLengthAfterRepair: "Y", ...commonFindingColumns,
  pittedBox: "AJ", pittedPin: "AK", overRefacedBox: "AL", overRefacedPin: "AM", bentTube: "AN",
  otherDamage1: "AO", otherDamage2: "AP", otherDamage3: "AQ", otherDamage4: "AR",
  damagedHardbandBox: "AS", damagedHardbandPin: "AT", hardbandBox: "AU", hardbandPin: "AX", dbrHardbandBox: "AY", dbrHardbandPin: "AZ",
  minimumWallTube: "BA", minimumTongBox: "BB", minimumTongPin: "BC", minimumSealBox: "BD", minimumSealPin: "BE",
  minimumOd: "BF", damagedTube: "BG", emiReject: "BH", otherReject: "BI", threadReconditionBox: "BJ",
  threadReconditionPin: "BK", bevelRepairBox: "BL", bevelRepairPin: "BM",
};

const toolColumns: Record<string, string> = {
  jointNumber: "B", description: "C", mpiBox: "E", mpiPin: "F", boxOd: "G", pinId: "H", centerWearPadOd: "I",
  boxTongSpace: "J", pinTongSpace: "K", boxBevelDiameter: "L", pinBevelDiameter: "M", borebackDiameter: "N",
  borebackLength: "O", stressReliefDiameter: "P", stressReliefLength: "Q", counterboreDepth: "R", counterboreDiameter: "S",
  sealWidth: "T", pinNoseDiameter: "U", boxCriticalLength: "V", boxLengthAfterRepair: "W", pinCriticalLength: "X",
  pinLengthAfterRepair: "Y", ...commonFindingColumns, overRefacedBox: "AJ", overRefacedPin: "AK", bentTube: "AL",
  otherDamage1: "AM", otherDamage2: "AN", otherDamage3: "AO", damagedHardbandBox: "AP", damagedHardbandPin: "AQ",
  hardbandBox: "AR", hardbandCenterPad1: "AS", hardbandCenterPad2: "AT", hardbandPin: "AU", dbrHardbandBox: "AV",
  dbrHardbandPin: "AW", minimumWallTube: "AX", minimumTongBox: "AY", minimumTongPin: "AZ", minimumSealBox: "BA",
  minimumSealPin: "BB", minimumOd: "BC", damagedTube: "BD", emiReject: "BE", otherReject: "BF",
  threadReconditionBox: "BG", threadReconditionPin: "BH", bevelRepairBox: "BI", bevelRepairPin: "BJ",
};

const subsColumns = Object.fromEntries(Object.entries(toolColumns).filter(([key]) => !["centerWearPadOd", "hardbandCenterPad1", "hardbandCenterPad2"].includes(key))) as Record<string, string>;
subsColumns.comments = "V";

function text(value: unknown) { return String(value ?? "").trim(); }
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function excelValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  if (value === true) return key === "mpiBox" || key === "mpiPin" ? "OK" : "X";
  if (key.endsWith("RefaceType")) return normalizeDtiRefaceCode(value);
  if (key === "percentNominalWall") return Number(value);
  return value;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cellXml(address: string, originalAttributes: string, value: unknown) {
  const attributes = originalAttributes.replace(/\s+t="[^"]*"/g, "");
  if (typeof value === "number" && Number.isFinite(value)) return `<c${attributes}><v>${value}</v></c>`;
  const rendered = escapeXml(text(value));
  return `<c${attributes} t="inlineStr"><is><t xml:space="preserve">${rendered}</t></is></c>`;
}

function writeCell(xml: string, address: string, value: unknown) {
  if (value === null || value === undefined || value === "") return xml;
  const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<c\\b(?=[^>]*\\br="${escapedAddress}")[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const existing = xml.match(pattern)?.[0];
  if (!existing) throw new Error(`The original DTI workbook has no writable cell ${address}.`);
  const tagEnd = existing.indexOf(">");
  const attributes = tagEnd > 2 ? existing.slice(2, tagEnd).replace(/\s*\/$/, "") : "";
  if (!attributes) throw new Error(`The original DTI workbook cell ${address} could not be read.`);
  return xml.replace(pattern, cellXml(address, attributes, value));
}

function clearCell(xml: string, address: string) {
  const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<c\\b(?=[^>]*\\br="${escapedAddress}")[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const existing = xml.match(pattern)?.[0];
  if (!existing) throw new Error(`The original DTI workbook has no cell ${address}.`);
  const tagEnd = existing.indexOf(">");
  const attributes = tagEnd > 2
    ? existing.slice(2, tagEnd).replace(/\s+t="[^"]*"/g, "").replace(/\s*\/$/, "")
    : "";
  if (!attributes) throw new Error(`The original DTI workbook cell ${address} could not be read.`);
  return xml.replace(pattern, `<c${attributes}/>`);
}

function setIfPresent(sheet: string, address: string, value: unknown) {
  const cleaned = text(value);
  return cleaned === "" ? sheet : writeCell(sheet, address, value);
}

function excelDateSerial(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function writeInspectionRows(sheet: string, rows: Item[], columns: Record<string, string>, serialSplitColumn?: string, defaults: Record<string, unknown> = {}) {
  let output = sheet;
  rows.sort((a, b) => a.sequence_number - b.sequence_number).forEach((item, index) => {
    const rowNumber = 9 + index;
    for (const [key, column] of Object.entries(columns)) {
      const value = excelValue(key, item.row_data[key] ?? defaults[key]);
      if (value !== null) output = writeCell(output, `${column}${rowNumber}`, value);
    }
    if (serialSplitColumn && text(item.row_data.serialNumber)) output = writeCell(output, `${serialSplitColumn}${rowNumber}`, text(item.row_data.serialNumber));
  });
  return output;
}

export async function buildDtiInspectionWorkbook(report: Report, items: Item[], proveUps: ProveUp[]) {
  const template = await readFile(path.join(process.cwd(), "templates", "Blank Report.xlsx"));
  const zip = await JSZip.loadAsync(template);
  const sheetPaths: Record<string, string> = {
    "DATA SHEET": "xl/worksheets/sheet1.xml",
    "Summary Drill Pipe": "xl/worksheets/sheet3.xml",
    "Prop Drill Pipe Inp Report": "xl/worksheets/sheet4.xml",
    "Summary HWDP": "xl/worksheets/sheet8.xml",
    "Prop HWDP Inp Report": "xl/worksheets/sheet9.xml",
    "Summary Sub": "xl/worksheets/sheet11.xml",
    "Prop Subs Inp Report": "xl/worksheets/sheet12.xml",
    "EMI Prove Up Tap": "xl/worksheets/sheet13.xml",
  };
  const readSheet = async (name: string) => {
    const file = zip.file(sheetPaths[name]);
    if (!file) throw new Error(`The DTI workbook template is missing ${name}.`);
    return file.async("string");
  };
  const saveSheet = (name: string, xml: string) => zip.file(sheetPaths[name], xml, { createFolders: false });

  let dataSheet = await readSheet("DATA SHEET");
  dataSheet = setIfPresent(dataSheet, "B2", report.operator_name);
  dataSheet = setIfPresent(dataSheet, "B3", report.contractor_name);
  dataSheet = setIfPresent(dataSheet, "B4", report.rig_number);
  const reportDate = text(report.report_date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) dataSheet = writeCell(dataSheet, "B5", excelDateSerial(reportDate));
  dataSheet = setIfPresent(dataSheet, "B6", report.field_invoice);
  dataSheet = setIfPresent(dataSheet, "B7", report.inspection_crew);
  dataSheet = setIfPresent(dataSheet, "B9", report.connection_size);
  dataSheet = setIfPresent(dataSheet, "B10", report.connection_type);
  dataSheet = setIfPresent(dataSheet, "B11", report.grade);
  dataSheet = setIfPresent(dataSheet, "B13", report.state);

  const scope = record(report.inspection_scope);
  const reportComponentType = resolveDtiReportComponentType(scope, items);
  const scopeCells = {
    drillPipe: ["E3", "E5", "E7"],
    hwdp: ["E10", "E12", "E14"],
    subs: ["E17", "E19", "E21"],
  } as const;
  for (const [prefix, cells] of Object.entries(scopeCells)) {
    dataSheet = setIfPresent(dataSheet, cells[0], scope[`${prefix}Category`]);
    dataSheet = setIfPresent(dataSheet, cells[1], scope[`${prefix}Additional1`]);
    dataSheet = setIfPresent(dataSheet, cells[2], scope[`${prefix}Additional2`]);
  }
  saveSheet("DATA SHEET", dataSheet);

  const machineShop = record(report.machine_shop);
  const remarks = record(report.remarks);
  for (const [sheetName, prefix, remarksCell] of [["Summary Drill Pipe", "drillPipe", "A55"], ["Summary HWDP", "hwdp", "A48"], ["Summary Sub", "subs", "A48"]] as const) {
    let sheet = await readSheet(sheetName);
    sheet = setIfPresent(sheet, "A11", machineShop.name || "N/A");
    sheet = setIfPresent(sheet, "C11", machineShop.contact);
    sheet = setIfPresent(sheet, "D11", machineShop.phone);
    sheet = setIfPresent(sheet, remarksCell, remarks[prefix]);
    saveSheet(sheetName, sheet);
  }

  const tubularSpec = record(record(report.criteria_snapshot).tubularSpec);
  const drillPipeDefaults = Number(tubularSpec.new_wall_inches) > 0 ? { nominalWallThickness: Number(tubularSpec.new_wall_inches) } : {};
  let drillPipe = writeInspectionRows(await readSheet("Prop Drill Pipe Inp Report"), reportComponentType === "Drill Pipe" ? items.filter((item) => item.component_type === "Drill Pipe") : [], drillPipeColumns, undefined, drillPipeDefaults);
  const hwdp = writeInspectionRows(await readSheet("Prop HWDP Inp Report"), reportComponentType === "HWDP" ? items.filter((item) => item.component_type === "HWDP") : [], toolColumns, "BL");
  let subs = writeInspectionRows(await readSheet("Prop Subs Inp Report"), reportComponentType === "Subs" ? items.filter((item) => item.component_type === "Subs") : [], subsColumns, "BL");
  for (const address of ["AV8", "AW8"]) drillPipe = clearCell(drillPipe, address);
  for (const address of ["I8", "AS8", "AT8"]) subs = clearCell(subs, address);
  saveSheet("Prop Drill Pipe Inp Report", drillPipe);
  saveSheet("Prop HWDP Inp Report", hwdp);
  saveSheet("Prop Subs Inp Report", subs);

  let proveUpSheet = await readSheet("EMI Prove Up Tap");
  proveUpSheet = setIfPresent(proveUpSheet, "B1", report.inspection_crew);
  proveUpSheet = setIfPresent(proveUpSheet, "F1", report.rig_number);
  proveUpSheet = setIfPresent(proveUpSheet, "B2", [report.connection_size, report.connection_type, report.grade].map(text).filter(Boolean).join(" / "));
  const proveUpColumns = ["A", "B", "C", "D", "E", "F", "G", "H"];
  proveUps.sort((a, b) => Number(a.sequence_number) - Number(b.sequence_number)).forEach((item, index) => {
    const row = 5 + index;
    [item.joint_number, item.serial_number, item.flaw, item.depth_inches, item.adjacent_wall_inches, item.remaining_body_wall_inches, item.distance_from_end, item.prove_up_result].forEach((entry, column) => {
      if (entry !== null && entry !== undefined && entry !== "") proveUpSheet = writeCell(proveUpSheet, `${proveUpColumns[column]}${row}`, entry);
    });
  });
  saveSheet("EMI Prove Up Tap", proveUpSheet);

  const workbookFile = zip.file("xl/workbook.xml");
  if (workbookFile) {
    let workbookXml = await workbookFile.async("string");
    workbookXml = workbookXml.replace(/<calcPr\b([^>]*)\/?\s*>/, (_match, attrs: string) => {
      const cleaned = attrs.replace(/\s+(calcMode|fullCalcOnLoad|forceFullCalc)="[^"]*"/g, "").replace(/\s*\/$/, "");
      return `<calcPr${cleaned} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
    });
    zip.file("xl/workbook.xml", workbookXml, { createFolders: false });
  }

  if (reportComponentType === "Subs") {
    const replacements = [
      ["Prop Subs Inp Report", "Prop BHA Inp Report"],
      ["Summary Sub", "Summary BHA"],
      ["Data Sheet Subs", "Data Sheet BHA"],
      ["Sub Count", "BHA Count"],
      ["DynPrint_Subs", "DynPrint_BHA"],
      ["SUBS INSPECTION", "BHA INSPECTION"],
    ] as const;
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (file.dir || !fileName.endsWith(".xml")) continue;
      const original = await file.async("string");
      const updated = replacements.reduce((xml, [from, to]) => xml.replaceAll(from, to), original);
      if (updated !== original) zip.file(fileName, updated, { createFolders: false });
    }
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
