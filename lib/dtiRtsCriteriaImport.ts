import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

export type DtiImportedRule = {
  ruleName: string;
  fieldKey: string;
  fieldLabel: string;
  inspectionArea: "Tube" | "Box" | "Pin" | "Tool Joint" | "Joint";
  comparison: "Minimum";
  minimumValue: number;
  maximumValue: null;
  expectedValue: null;
  valueUnit: "Inches";
  resultClassification: "Class 2" | "Class 3" | "Class 4";
  reason: string;
  displayOrder: number;
  sourceCell: string;
};

export type DtiRtsCriteriaPreview = {
  template: "RTS Drill Pipe";
  standardType: "API" | "DS-1" | "Class 2 Alternate" | "Customer";
  criteriaLabel: string;
  rules: DtiImportedRule[];
  warnings: string[];
};

type Threshold = { cell: string; labelCell?: string; classification: DtiImportedRule["resultClassification"] };
type FieldMap = {
  fieldKey: string;
  fieldLabel: string;
  inspectionArea: DtiImportedRule["inspectionArea"];
  thresholds: Threshold[];
  fallbackClassification?: DtiImportedRule["resultClassification"];
};

const fieldMaps: FieldMap[] = [
  {
    fieldKey: "utThickness",
    fieldLabel: "UT Thickness",
    inspectionArea: "Tube",
    thresholds: [
      { cell: "Z44", labelCell: "Y42", classification: "Class 2" },
      { cell: "AB44", labelCell: "AA42", classification: "Class 3" },
      { cell: "AD44", labelCell: "AC42", classification: "Class 4" },
    ],
  },
  {
    fieldKey: "boxOd",
    fieldLabel: "Box OD",
    inspectionArea: "Box",
    thresholds: [
      { cell: "Z50", labelCell: "Y48", classification: "Class 2" },
      { cell: "AB50", labelCell: "AA48", classification: "Class 3" },
      { cell: "AD50", labelCell: "AC48", classification: "Class 4" },
    ],
  },
  {
    fieldKey: "boxTongSpace",
    fieldLabel: "Box Tong Space",
    inspectionArea: "Box",
    thresholds: [{ cell: "Z56", classification: "Class 4" }],
    fallbackClassification: "Class 4",
  },
  {
    fieldKey: "pinTongSpace",
    fieldLabel: "Pin Tong Space",
    inspectionArea: "Pin",
    thresholds: [{ cell: "Z60", classification: "Class 4" }],
    fallbackClassification: "Class 4",
  },
];

function array<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function nodeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  const node = value as Record<string, unknown>;
  if (node["#text"] !== undefined) return String(node["#text"]);
  return array(node.r as Record<string, unknown> | Record<string, unknown>[] | undefined).map((part) => nodeText(part.t)).join("") || nodeText(node.t);
}
function text(value: unknown) { return String(value ?? "").trim(); }
function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return value !== null && value !== undefined && text(value) !== "" && Number.isFinite(parsed) ? parsed : null;
}
function unavailableLabel(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes("no class") || normalized === "n/a" || normalized === "na";
}
function standardType(value: string): DtiRtsCriteriaPreview["standardType"] {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "api") return "API";
  if (normalized === "ds1") return "DS-1";
  if (normalized.includes("class2alt")) return "Class 2 Alternate";
  return "Customer";
}

async function readCriteriaCells(input: ArrayBuffer | Uint8Array) {
  const zip = await JSZip.loadAsync(input);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseTagValue: false, trimValues: false });
  const workbookFile = zip.file("xl/workbook.xml");
  const relationshipsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationshipsFile) throw new Error("The uploaded file is not a readable Excel workbook.");
  const workbook = parser.parse(await workbookFile.async("string")) as Record<string, unknown>;
  const relationships = parser.parse(await relationshipsFile.async("string")) as Record<string, unknown>;
  const workbookNode = workbook.workbook as Record<string, unknown>;
  const sheetsNode = workbookNode?.sheets as Record<string, unknown>;
  const sheet = array(sheetsNode?.sheet as Record<string, unknown> | Record<string, unknown>[] | undefined).find((item) => text(item.name) === "Criteria Sheet");
  if (!sheet) throw new Error("This is not a supported RTS Drill Pipe workbook. The Criteria Sheet was not found.");
  const relRoot = relationships.Relationships as Record<string, unknown>;
  const relationship = array(relRoot?.Relationship as Record<string, unknown> | Record<string, unknown>[] | undefined).find((item) => text(item.Id) === text(sheet["r:id"]));
  if (!relationship) throw new Error("The RTS Criteria Sheet could not be located in the workbook package.");
  const target = text(relationship.Target).replace(/^\//, "").replace(/^xl\//, "");
  const sheetFile = zip.file(`xl/${target}`);
  if (!sheetFile) throw new Error("The RTS Criteria Sheet data is missing from the workbook.");

  const shared: string[] = [];
  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (sharedFile) {
    const parsed = parser.parse(await sharedFile.async("string")) as Record<string, unknown>;
    const root = parsed.sst as Record<string, unknown>;
    for (const item of array(root?.si as Record<string, unknown> | Record<string, unknown>[] | undefined)) shared.push(nodeText(item));
  }

  const parsedSheet = parser.parse(await sheetFile.async("string")) as Record<string, unknown>;
  const worksheet = parsedSheet.worksheet as Record<string, unknown>;
  const sheetData = worksheet?.sheetData as Record<string, unknown>;
  const cells = new Map<string, unknown>();
  for (const row of array(sheetData?.row as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    for (const cell of array(row.c as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      const address = text(cell.r);
      const type = text(cell.t);
      const raw = cell.v;
      if (type === "s") cells.set(address, shared[Number(raw)] ?? "");
      else if (type === "inlineStr") cells.set(address, nodeText(cell.is));
      else if (type === "b") cells.set(address, text(raw) === "1");
      else if (type === "str") cells.set(address, text(raw));
      else cells.set(address, numeric(raw) ?? text(raw));
    }
  }
  return cells;
}

export async function parseDtiRtsCriteriaWorkbook(input: ArrayBuffer | Uint8Array): Promise<DtiRtsCriteriaPreview> {
  const cells = await readCriteriaCells(input);
  const cell = (address: string) => cells.get(address);
  if (!text(cell("B2")).toLowerCase().includes("select api")) {
    throw new Error("This is not a supported RTS Drill Pipe workbook. The Criteria Sheet template marker was not found.");
  }

  const alternateCriteria = ["yes", "true", "1"].includes(text(cell("F33")).toLowerCase());
  const selectedStandard = alternateCriteria ? "Customer" : standardType(text(cell("F2")));
  const criteriaLabel = text(cell("W35")) || `${selectedStandard} Criteria`;
  const rules: DtiImportedRule[] = [];
  const warnings: string[] = [];
  let displayOrder = 1;

  for (const field of fieldMaps) {
    const resolved = field.thresholds.map((threshold) => {
      const label = threshold.labelCell ? text(cell(threshold.labelCell)) : "";
      const minimumValue = numeric(cell(threshold.cell));
      return { threshold, minimumValue, available: !unavailableLabel(label) && minimumValue !== null && minimumValue > 0 };
    });
    const available = resolved.filter((item) => item.available);
    if (!available.length) {
      warnings.push(`${field.fieldLabel} has no resolved minimum in the workbook and will not be imported.`);
      continue;
    }

    for (const item of available) {
      const threshold = item.threshold;
      const minimumValue = item.minimumValue;
      if (minimumValue === null || minimumValue <= 0) continue;
      const thresholdIndex = resolved.indexOf(item);
      const resultClassification = field.fallbackClassification
        || (thresholdIndex === 0
          ? resolved[1]?.available ? "Class 2" : resolved[2]?.available ? "Class 3" : "Class 4"
          : thresholdIndex === 1 && resolved[2]?.available ? "Class 3" : "Class 4");
      rules.push({
        ruleName: `${field.fieldLabel} minimum for ${resultClassification}`,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        inspectionArea: field.inspectionArea,
        comparison: "Minimum",
        minimumValue,
        maximumValue: null,
        expectedValue: null,
        valueUnit: "Inches",
        resultClassification,
        reason: `${field.fieldLabel} is below the RTS minimum and is classified ${resultClassification}.`,
        displayOrder: displayOrder++,
        sourceCell: `Criteria Sheet!${threshold.cell}`,
      });
    }
  }

  const pinOd = numeric(cell("Z52"));
  if (pinOd !== null && pinOd > 0) warnings.push("Pin TJ OD criteria was detected but not imported because the current TITAN report does not capture a separate Pin OD measurement.");
  if (!rules.length) throw new Error("The RTS workbook does not contain any resolved criteria values. Open it in Excel, complete the Criteria Sheet, recalculate, save, and upload it again.");

  return { template: "RTS Drill Pipe", standardType: selectedStandard, criteriaLabel, rules, warnings };
}
