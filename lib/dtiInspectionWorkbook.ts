import "server-only";

import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dtiComponentLabel, normalizeDtiRefaceCode, resolveDtiReportComponentType, summarizeDtiInspection, type DtiComponentType } from "./dtiInspectionReport";

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
function marked(value: unknown) {
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  return !["", "false", "no", "0"].includes(value.trim().toLowerCase());
}

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

function countMarked(rows: Item[], key: string) {
  return rows.reduce((total, item) => total + (marked(item.row_data[key]) ? 1 : 0), 0);
}

function inspectionType(report: Report, componentType: DtiComponentType) {
  const scope = record(report.inspection_scope);
  const prefix = componentType === "Drill Pipe" ? "drillPipe" : componentType === "HWDP" ? "hwdp" : "subs";
  const category = text(scope.inspectionCategory);
  return [
    dtiComponentLabel(componentType),
    category === "HDLS" ? "HDLS" : category ? `Category ${category}` : "",
    scope[`${prefix}Additional1`],
    scope[`${prefix}Additional2`],
  ].map(text).filter(Boolean).join(" / ");
}

function writeSummary(sheet: string, report: Report, componentType: DtiComponentType, rows: Item[], remarksCell: string) {
  const summary = summarizeDtiInspection(rows, componentType);
  const scope = record(report.inspection_scope);
  const machineShop = record(report.machine_shop);
  let output = sheet;
  output = writeCell(output, "C1", report.operator_name);
  output = writeCell(output, "F1", report.state);
  output = writeCell(output, "C2", [report.contractor_name, report.rig_number].map(text).filter(Boolean).join(" "));
  const reportDate = text(report.report_date);
  output = writeCell(output, "C3", /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? excelDateSerial(reportDate) : reportDate);
  output = writeCell(output, "C4", report.field_invoice);
  output = writeCell(output, "C5", report.inspection_crew);
  output = writeCell(output, "C6", inspectionType(report, componentType));
  output = writeCell(output, "A8", report.connection_size);
  if (componentType === "Drill Pipe") output = writeCell(output, "B8", scope.criteriaWeightPpf);
  output = writeCell(output, "C8", report.connection_type);
  output = writeCell(output, "E8", report.grade);
  output = writeCell(output, "A11", machineShop.name || "N/A");
  output = writeCell(output, "C11", machineShop.contact || "N/A");
  output = writeCell(output, "D11", machineShop.phone || "N/A");
  output = writeCell(output, "C15", summary.premium);
  output = writeCell(output, "J15", summary.inspected);
  output = writeCell(output, "J16", summary.rigReady);
  output = writeCell(output, "C17", summary.dbr);
  output = writeCell(output, "J17", summary.machineShop);
  output = setIfPresent(output, remarksCell, record(report.remarks)[componentType === "Drill Pipe" ? "drillPipe" : componentType === "HWDP" ? "hwdp" : "subs"]);

  const boxHardbands = countMarked(rows, "hardbandBox");
  const pinHardbands = countMarked(rows, "hardbandPin");
  const damagedBoxHardbands = countMarked(rows, "damagedHardbandBox");
  const damagedPinHardbands = countMarked(rows, "damagedHardbandPin");
  const dbrBoxHardbands = countMarked(rows, "dbrHardbandBox");
  const dbrPinHardbands = countMarked(rows, "dbrHardbandPin");

  if (componentType === "Drill Pipe") {
    output = writeCell(output, "A22", summary.boxRefaces);
    output = writeCell(output, "D22", summary.pinRefaces);
    output = writeCell(output, "G19", boxHardbands + pinHardbands);
    output = writeCell(output, "I20", boxHardbands);
    output = writeCell(output, "K20", pinHardbands);
    output = writeCell(output, "G21", damagedBoxHardbands + damagedPinHardbands);
    output = writeCell(output, "I22", damagedBoxHardbands);
    output = writeCell(output, "K22", damagedPinHardbands);
    output = writeCell(output, "G23", dbrBoxHardbands + dbrPinHardbands);
    output = writeCell(output, "I24", dbrBoxHardbands);
    output = writeCell(output, "K24", dbrPinHardbands);
    return output;
  }

  output = writeCell(output, "F22", summary.boxRefaces);
  output = writeCell(output, "I22", summary.pinRefaces);
  output = writeCell(output, "G25", boxHardbands + pinHardbands);
  output = writeCell(output, "I26", boxHardbands);
  output = writeCell(output, "K26", pinHardbands);
  output = writeCell(output, "G27", damagedBoxHardbands + damagedPinHardbands);
  output = writeCell(output, "I28", damagedBoxHardbands);
  output = writeCell(output, "K28", damagedPinHardbands);
  output = writeCell(output, "G29", dbrBoxHardbands + dbrPinHardbands);
  output = writeCell(output, "I30", dbrBoxHardbands);
  output = writeCell(output, "K30", dbrPinHardbands);
  if (componentType === "HWDP") {
    output = writeCell(output, "F31", "Center Pad 1");
    output = writeCell(output, "G31", summary.centerPad1);
    output = writeCell(output, "I31", "Center Pad 2");
    output = writeCell(output, "K31", summary.centerPad2);
  } else {
    for (const address of ["F31", "G31", "I31", "K31"]) output = clearCell(output, address);
  }
  return output;
}

function showOnlyReportSheets(workbookXml: string, componentType: DtiComponentType) {
  const visibleNames = componentType === "Drill Pipe"
    ? new Set(["Summary Drill Pipe", "Prop Drill Pipe Inp Report"])
    : componentType === "HWDP"
      ? new Set(["Summary HWDP", "Prop HWDP Inp Report"])
      : new Set(["Summary Sub", "Prop Subs Inp Report"]);
  let activeTab = 0;
  let sheetIndex = -1;
  let output = workbookXml.replace(/<sheet\b[^>]*\/>/g, (sheetTag) => {
    sheetIndex += 1;
    const name = sheetTag.match(/\bname="([^"]+)"/)?.[1] ?? "";
    const cleaned = sheetTag.replace(/\s+state="[^"]*"/g, "");
    if (visibleNames.has(name)) {
      if (name.startsWith("Summary ")) activeTab = sheetIndex;
      return cleaned;
    }
    return cleaned.replace(/\/>$/, ' state="hidden"/>');
  });
  output = output.replace(/(<workbookView\b[^>]*?)\s+activeTab="[^"]*"/, `$1 activeTab="${activeTab}"`);
  return output;
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
    const inspectionCategory = String(scope.inspectionCategory ?? "").trim();
    const categoryLabel = inspectionCategory === "HDLS" ? "HDLS" : inspectionCategory ? `Cat ${inspectionCategory}` : scope[`${prefix}Category`];
    dataSheet = setIfPresent(dataSheet, cells[0], categoryLabel);
    dataSheet = setIfPresent(dataSheet, cells[1], scope[`${prefix}Additional1`]);
    dataSheet = setIfPresent(dataSheet, cells[2], scope[`${prefix}Additional2`]);
  }
  saveSheet("DATA SHEET", dataSheet);

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

  const reportRows = items.filter((item) => item.component_type === reportComponentType);
  const summaryName = reportComponentType === "Drill Pipe" ? "Summary Drill Pipe" : reportComponentType === "HWDP" ? "Summary HWDP" : "Summary Sub";
  const summaryRemarksCell = reportComponentType === "Drill Pipe" ? "A55" : "A48";
  saveSheet(summaryName, writeSummary(await readSheet(summaryName), report, reportComponentType, reportRows, summaryRemarksCell));

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
    workbookXml = showOnlyReportSheets(workbookXml, reportComponentType);
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
