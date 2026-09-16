export type DtiComponentType = "Drill Pipe" | "HWDP" | "Subs";
export type DtiFieldKind = "text" | "number" | "flag" | "reface";
export type DtiReportField = { key: string; label: string; group: string; kind: DtiFieldKind; end?: "Box" | "Pin" | "Tube" };
export type DtiInspectionItemLike = { row_data: Record<string, unknown> };
export type DtiInspectionSummary = {
  inspected: number;
  premium: number;
  rigReady: number;
  machineShop: number;
  dbr: number;
  boxRefaces: number;
  pinRefaces: number;
  hardbands: number;
  damagedHardbands: number;
  dbrHardbands: number;
  centerPad1: number;
  centerPad2: number;
};

const field = (key: string, label: string, group: string, kind: DtiFieldKind = "number", end?: DtiReportField["end"]): DtiReportField => ({ key, label, group, kind, end });

const connectionDimensions: DtiReportField[] = [
  field("boxOd", "Box OD", "Tool Joint", "number", "Box"),
  field("pinId", "Pin ID", "Tool Joint", "number", "Pin"),
  field("boxTongSpace", "Box Tong Space", "Tool Joint", "number", "Box"),
  field("pinTongSpace", "Pin Tong Space", "Tool Joint", "number", "Pin"),
  field("boxBevelDiameter", "Box Bevel Diameter", "Tool Joint", "number", "Box"),
  field("pinBevelDiameter", "Pin Bevel Diameter", "Tool Joint", "number", "Pin"),
  field("borebackDiameter", "Boreback Diameter", "Critical Dimensions"),
  field("borebackLength", "Boreback Length", "Critical Dimensions"),
  field("stressReliefDiameter", "Stress Relief Groove Diameter", "Critical Dimensions"),
  field("stressReliefLength", "Stress Relief Groove Length", "Critical Dimensions"),
  field("counterboreDepth", "Counterbore Depth", "Critical Dimensions"),
  field("counterboreDiameter", "Counterbore Diameter", "Critical Dimensions"),
  field("sealWidth", "Seal Width", "Critical Dimensions"),
  field("pinNoseDiameter", "Pin Nose Diameter", "Critical Dimensions"),
];

const criticalLengths: DtiReportField[] = [
  field("boxCriticalLength", "Box Critical Length", "Critical Dimensions"),
  field("boxLengthAfterRepair", "Box Length After Repair", "Critical Dimensions"),
  field("pinCriticalLength", "Pin Critical Length", "Critical Dimensions"),
  field("pinLengthAfterRepair", "Pin Length After Repair", "Critical Dimensions"),
];

const refaceFields: DtiReportField[] = [
  field("boxReface", "Box Reface", "Refaces", "flag", "Box"),
  field("boxRefaceType", "Box Reface Type", "Refaces", "reface", "Box"),
  field("pinReface", "Pin Reface", "Refaces", "flag", "Pin"),
  field("pinRefaceType", "Pin Reface Type", "Refaces", "reface", "Pin"),
];

const findingFields: DtiReportField[] = [
  field("damagedSealBox", "Damaged Seal", "Damage", "flag", "Box"), field("damagedSealPin", "Damaged Seal", "Damage", "flag", "Pin"),
  field("damagedThreadsBox", "Damaged Threads", "Damage", "flag", "Box"), field("damagedThreadsPin", "Damaged Threads", "Damage", "flag", "Pin"),
  field("damagedTorqueShoulderBox", "Damaged Torque Shoulder", "Damage", "flag", "Box"), field("damagedTorqueShoulderPin", "Damaged Torque Shoulder", "Damage", "flag", "Pin"),
  field("pittedBox", "Pitted", "Damage", "flag", "Box"), field("pittedPin", "Pitted", "Damage", "flag", "Pin"),
  field("overRefacedBox", "Over Refaced", "Damage", "flag", "Box"), field("overRefacedPin", "Over Refaced", "Damage", "flag", "Pin"),
  field("bentTube", "Bent Tube", "Damage", "flag", "Tube"),
  field("otherDamage1", "Other Damage 1", "Damage", "text"), field("otherDamage2", "Other Damage 2", "Damage", "text"),
  field("otherDamage3", "Other Damage 3", "Damage", "text"), field("otherDamage4", "Other Damage 4", "Damage", "text"),
  field("damagedHardbandBox", "Damaged Hardband", "Hardband", "flag", "Box"), field("damagedHardbandPin", "Damaged Hardband", "Hardband", "flag", "Pin"),
  field("hardbandBox", "Hardband", "Hardband", "flag", "Box"), field("hardbandCenterPad1", "Hardband Center Pad 1", "Hardband", "flag"),
  field("hardbandCenterPad2", "Hardband Center Pad 2", "Hardband", "flag"), field("hardbandPin", "Hardband", "Hardband", "flag", "Pin"),
  field("dbrHardbandBox", "DBR Hardband", "DBR", "flag", "Box"), field("dbrHardbandPin", "DBR Hardband", "DBR", "flag", "Pin"),
  field("minimumWallTube", "Minimum Wall Tube", "DBR", "flag", "Tube"), field("minimumTongBox", "Minimum Tong", "DBR", "flag", "Box"),
  field("minimumTongPin", "Minimum Tong", "DBR", "flag", "Pin"), field("minimumSealBox", "Minimum Seal", "DBR", "flag", "Box"),
  field("minimumSealPin", "Minimum Seal", "DBR", "flag", "Pin"), field("minimumOd", "Minimum OD", "DBR", "flag"),
  field("damagedTube", "Damaged Tube", "DBR", "flag", "Tube"), field("emiReject", "EMI Reject", "DBR", "flag", "Tube"),
  field("otherReject", "Other Reject", "DBR", "text"),
  field("threadReconditionBox", "Thread Recondition", "Repair", "flag", "Box"), field("threadReconditionPin", "Thread Recondition", "Repair", "flag", "Pin"),
  field("bevelRepairBox", "Bevel Repair", "Repair", "flag", "Box"), field("bevelRepairPin", "Bevel Repair", "Repair", "flag", "Pin"),
];

const identification = [field("jointNumber", "Joint Number", "Identification", "text"), field("serialNumber", "Serial Number", "Identification", "text")];

export const dtiInspectionFields: Record<DtiComponentType, DtiReportField[]> = {
  "Drill Pipe": [
    ...identification,
    field("odGage", "OD Gage", "Tube"), field("nominalWallThickness", "Nominal Wall Thickness", "Tube"),
    field("utThickness", "UT Thickness", "Tube"), field("percentNominalWall", "% of Nominal Wall", "Tube"),
    ...connectionDimensions, ...criticalLengths, ...refaceFields, ...findingFields,
  ],
  HWDP: [
    field("jointNumber", "Joint Number", "Identification", "text"), field("description", "Description", "Identification", "text"), field("serialNumber", "Joint Serial Number", "Identification", "text"),
    field("mpiBox", "MPI", "MPI", "flag", "Box"), field("mpiPin", "MPI", "MPI", "flag", "Pin"),
    field("centerWearPadOd", "Center Wear Pad OD", "Tool Joint"), ...connectionDimensions, ...criticalLengths, ...refaceFields,
    ...findingFields.filter((item) => !["pittedBox", "pittedPin", "otherDamage4"].includes(item.key)),
  ],
  Subs: [
    field("jointNumber", "Joint Number", "Identification", "text"), field("description", "Description", "Identification", "text"), field("serialNumber", "Joint Serial Number", "Identification", "text"),
    field("mpiBox", "MPI", "MPI", "flag", "Box"), field("mpiPin", "MPI", "MPI", "flag", "Pin"),
    field("centerWearPadOd", "Center Wear Pad OD", "Tool Joint"), ...connectionDimensions,
    field("comments", "Comments", "Comments", "text"), ...refaceFields,
    ...findingFields.filter((item) => !["pittedBox", "pittedPin", "otherDamage4"].includes(item.key)),
  ],
};

export const dtiRefaceOptions = [
  { value: "DS", label: "DS" },
  { value: "SD", label: "SD" },
  { value: "DT", label: "DT" },
  { value: "TD", label: "TD" },
  { value: "DTS", label: "DTS" },
  { value: "PS", label: "PS" },
  { value: "PG", label: "PG" },
  { value: "OL", label: "OL" },
  { value: "CUT", label: "CUT" },
  { value: "RF", label: "RF" },
];

const legacyRefaceCodes: Record<string, string> = { "1": "PG", "2": "CUT", "3": "OL", "4": "SD" };

export function normalizeDtiRefaceCode(value: unknown) {
  const entered = String(value ?? "").trim().toUpperCase();
  if (!entered) return "";
  if (legacyRefaceCodes[entered]) return legacyRefaceCodes[entered];
  const code = entered.replace(/[^A-Z/-]/g, "");
  return code || "RF";
}

export function normalizeDtiRefaceRowData(rowData: Record<string, unknown>) {
  return {
    ...rowData,
    boxRefaceType: normalizeDtiRefaceCode(rowData.boxRefaceType),
    pinRefaceType: normalizeDtiRefaceCode(rowData.pinRefaceType),
  };
}

export const dtiInspectionCategoryOptions = [
  "Cat 2",
  "Cat 2 w/Blacklight",
  "Cat 3",
  "Cat 3-5",
  "Cat 4",
  "Cat 4 w/Blacklight",
  "Cat 5",
  "API RP 7G",
  "Lathe reface",
];

const repairKeys = [
  "damagedSealBox", "damagedSealPin", "damagedThreadsBox", "damagedThreadsPin",
  "damagedTorqueShoulderBox", "damagedTorqueShoulderPin", "pittedBox", "pittedPin",
  "overRefacedBox", "overRefacedPin", "bentTube", "otherDamage1", "otherDamage2",
  "otherDamage3", "otherDamage4", "damagedHardbandBox", "damagedHardbandPin",
];
const dbrKeys = [
  "dbrHardbandBox", "dbrHardbandPin", "minimumWallTube", "minimumTongBox",
  "minimumTongPin", "minimumSealBox", "minimumSealPin", "minimumOd", "damagedTube",
  "emiReject", "otherReject",
];

function marked(value: unknown) {
  return value === true || (typeof value === "string" && value.trim() !== "");
}

function countMarked(items: DtiInspectionItemLike[], key: string) {
  return items.reduce((total, item) => total + (marked(item.row_data[key]) ? 1 : 0), 0);
}

export function summarizeDtiInspection(items: DtiInspectionItemLike[]): DtiInspectionSummary {
  const machineShop = items.filter((item) => repairKeys.some((key) => marked(item.row_data[key]))).length;
  const dbr = items.filter((item) => dbrKeys.some((key) => marked(item.row_data[key]))).length;
  const inspected = items.length;

  return {
    inspected,
    premium: inspected - dbr,
    rigReady: inspected - machineShop - dbr,
    machineShop,
    dbr,
    boxRefaces: countMarked(items, "boxReface"),
    pinRefaces: countMarked(items, "pinReface"),
    hardbands: countMarked(items, "hardbandBox") + countMarked(items, "hardbandPin"),
    damagedHardbands: countMarked(items, "damagedHardbandBox") + countMarked(items, "damagedHardbandPin"),
    dbrHardbands: countMarked(items, "dbrHardbandBox") + countMarked(items, "dbrHardbandPin"),
    centerPad1: countMarked(items, "hardbandCenterPad1"),
    centerPad2: countMarked(items, "hardbandCenterPad2"),
  };
}

export function calculatePercentNominalWall(data: Record<string, unknown>) {
  const nominal = Number(data.nominalWallThickness);
  const measured = Number(data.utThickness);
  return nominal > 0 && Number.isFinite(measured) ? Number((measured / nominal).toFixed(4)) : null;
}
