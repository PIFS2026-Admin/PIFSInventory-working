export type DtiComponentType = "Drill Pipe" | "HWDP" | "Subs";
export type DtiFieldKind = "text" | "number" | "flag" | "reface" | "yesno" | "calculated";
export type DtiInspectionPass = "Box" | "Pin" | "Full";
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
  damagedBoxes: number;
  damagedPins: number;
  hardbandBoxes: number;
  hardbandPins: number;
  hardbands: number;
  damagedHardbands: number;
  dbrHardbands: number;
  centerPad1: number;
  centerPad2: number;
};
export type DtiThresholdMetrics = {
  totalJoints: number;
  dbrJoints: number;
  boxRepairs: number;
  pinRepairs: number;
  totalRepairs: number;
  dbrPercent: number;
  repairPercent: number;
  dbrAlert: boolean;
  repairAlert: boolean;
};

export const DTI_ALERT_THRESHOLD_PERCENT = 10;

export const dtiRefacingReportFieldKeys = [
  "refacePresent",
  "refaceInitialClass",
  "refaceFinalClass",
  "refaceClassReject",
  "refaceBoxRepairRequired",
  "refaceBoxDepthBefore",
  "refaceBoxDepthAfter",
  "refaceBoxTongBefore",
  "refaceBoxTongAfter",
  "refaceBoxResults",
  "refacePinRepairRequired",
  "refacePinLengthBefore",
  "refacePinLengthAfter",
  "refacePinTongBefore",
  "refacePinTongAfter",
  "refacePinResults",
] as const;

const field = (key: string, label: string, group: string, kind: DtiFieldKind = "number", end?: DtiReportField["end"]): DtiReportField => ({ key, label, group, kind, end });

export const dtiComponentTypes: DtiComponentType[] = ["Drill Pipe", "HWDP", "Subs"];

export function dtiComponentLabel(value: DtiComponentType | unknown) {
  return value === "Subs" ? "BHA" : String(value ?? "");
}

export function isDtiComponentType(value: unknown): value is DtiComponentType {
  return dtiComponentTypes.includes(String(value) as DtiComponentType);
}

export function resolveDtiReportComponentType(inspectionScope: Record<string, unknown> | null | undefined, items: Array<{ component_type?: unknown }> = []): DtiComponentType {
  const configured = inspectionScope?.reportComponentType;
  if (isDtiComponentType(configured)) return configured;
  const recorded = items.find((item) => isDtiComponentType(item.component_type))?.component_type;
  return isDtiComponentType(recorded) ? recorded : "Drill Pipe";
}

export function planDtiInspectionRowCount(existingSequences: number[], requestedCount: number) {
  const existing = new Set(existingSequences.filter((sequence) => Number.isInteger(sequence) && sequence > 0));
  return {
    missingSequences: Array.from({ length: requestedCount }, (_, index) => index + 1).filter((sequence) => !existing.has(sequence)),
    surplusSequences: [...existing].filter((sequence) => sequence > requestedCount).sort((a, b) => a - b),
  };
}

const connectionDimensions: DtiReportField[] = [
  field("boxOd", "Box OD", "Tool Joint", "number", "Box"),
  field("pinId", "Pin ID", "Tool Joint", "number", "Pin"),
  field("boxTongSpace", "Box Tong Space", "Tool Joint", "number", "Box"),
  field("pinTongSpace", "Pin Tong Space", "Tool Joint", "number", "Pin"),
  field("boxBevelDiameter", "Box Bevel Diameter", "Tool Joint", "number", "Box"),
  field("pinBevelDiameter", "Pin Bevel Diameter", "Tool Joint", "number", "Pin"),
  field("borebackDiameter", "Boreback Diameter", "Critical Dimensions", "number", "Box"),
  field("borebackLength", "Boreback Length", "Critical Dimensions", "number", "Box"),
  field("stressReliefDiameter", "Stress Relief Groove Diameter", "Critical Dimensions", "number", "Pin"),
  field("stressReliefLength", "Stress Relief Groove Length", "Critical Dimensions", "number", "Pin"),
  field("counterboreDepth", "Counterbore Depth", "Critical Dimensions", "number", "Box"),
  field("counterboreDiameter", "Counterbore Diameter", "Critical Dimensions", "number", "Box"),
  field("sealWidth", "Seal Width", "Critical Dimensions", "number", "Box"),
  field("pinNoseDiameter", "Pin Nose Diameter", "Critical Dimensions", "number", "Pin"),
];

const criticalLengths: DtiReportField[] = [
  field("boxCriticalLength", "Box Critical Length", "Critical Dimensions", "number", "Box"),
  field("boxLengthAfterRepair", "Box Length After Repair", "Critical Dimensions", "number", "Box"),
  field("pinCriticalLength", "Pin Critical Length", "Critical Dimensions", "number", "Pin"),
  field("pinLengthAfterRepair", "Pin Length After Repair", "Critical Dimensions", "number", "Pin"),
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
  field("hardbandBox", "Hardband", "Hardband", "flag", "Box"), field("hardbandPin", "Hardband", "Hardband", "flag", "Pin"),
  field("dbrHardbandBox", "DBR Hardband", "DBR", "flag", "Box"), field("dbrHardbandPin", "DBR Hardband", "DBR", "flag", "Pin"),
  field("minimumWallTube", "Minimum Wall Tube", "DBR", "flag", "Tube"), field("minimumTongBox", "Minimum Tong", "DBR", "flag", "Box"),
  field("minimumTongPin", "Minimum Tong", "DBR", "flag", "Pin"), field("minimumSealBox", "Minimum Seal", "DBR", "flag", "Box"),
  field("minimumSealPin", "Minimum Seal", "DBR", "flag", "Pin"), field("minimumOd", "Minimum OD", "DBR", "flag"),
  field("damagedTube", "Damaged Tube", "DBR", "flag", "Tube"), field("emiReject", "EMI Reject", "DBR", "flag", "Tube"),
  field("otherReject", "Other Reject", "DBR", "text"),
  field("threadReconditionBox", "Thread Recondition", "Repair", "flag", "Box"), field("threadReconditionPin", "Thread Recondition", "Repair", "flag", "Pin"),
  field("bevelRepairBox", "Bevel Repair", "Repair", "flag", "Box"), field("bevelRepairPin", "Bevel Repair", "Repair", "flag", "Pin"),
];

const centerPadFields: DtiReportField[] = [
  field("hardbandCenterPad1", "Hardband Center Pad 1", "Hardband", "flag"),
  field("hardbandCenterPad2", "Hardband Center Pad 2", "Hardband", "flag"),
];

const boxDamageKeys = findingFields.filter((item) => item.group === "Damage" && item.end === "Box").map((item) => item.key);
const pinDamageKeys = findingFields.filter((item) => item.group === "Damage" && item.end === "Pin").map((item) => item.key);

const hwdpFindingFields = findingFields.flatMap((item) => item.key === "hardbandBox" ? [item, ...centerPadFields] : [item]);

const identification = [field("jointNumber", "Joint Number", "Identification", "text"), field("serialNumber", "Serial Number", "Identification", "text")];

export const dtiInspectionFields: Record<DtiComponentType, DtiReportField[]> = {
  "Drill Pipe": [
    ...identification,
    field("odGage", "OD Gauge", "Tube", "yesno"), field("nominalWallThickness", "Nominal Wall Thickness", "Tube"),
    field("utThickness", "UT Thickness", "Tube"), field("percentNominalWall", "% of Nominal Wall", "Tube", "calculated"),
    ...connectionDimensions, ...criticalLengths, ...refaceFields, ...findingFields,
  ],
  HWDP: [
    field("jointNumber", "Joint Number", "Identification", "text"), field("description", "Description", "Identification", "text"), field("serialNumber", "Joint Serial Number", "Identification", "text"),
    field("mpiBox", "MPI", "MPI", "flag", "Box"), field("mpiPin", "MPI", "MPI", "flag", "Pin"),
    field("centerWearPadOd", "Center Wear Pad OD", "Tool Joint"), ...connectionDimensions, ...criticalLengths, ...refaceFields,
    ...hwdpFindingFields.filter((item) => !["pittedBox", "pittedPin", "otherDamage4"].includes(item.key)),
  ],
  Subs: [
    field("jointNumber", "Joint Number", "Identification", "text"), field("description", "Description", "Identification", "text"), field("serialNumber", "Joint Serial Number", "Identification", "text"),
    field("mpiBox", "MPI", "MPI", "flag", "Box"), field("mpiPin", "MPI", "MPI", "flag", "Pin"),
    ...connectionDimensions,
    field("comments", "Comments", "Comments", "text"), ...refaceFields,
    ...findingFields.filter((item) => !["pittedBox", "pittedPin", "otherDamage4"].includes(item.key)),
  ],
};

export function dtiInspectionFieldsForPass(componentType: DtiComponentType, pass: DtiInspectionPass) {
  const fields = dtiInspectionFields[componentType];
  if (pass === "Full") return fields;
  return fields.filter((item) => item.group === "Identification" || item.end === pass);
}

export function dtiPhotoEvidenceFields(componentType: DtiComponentType) {
  return dtiInspectionFields[componentType].filter((item) =>
    item.group === "Damage"
    || item.key === "boxReface"
    || item.key === "pinReface"
    || item.key.startsWith("damaged"),
  );
}

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

export function normalizeDtiYesNo(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) return "Yes";
  if (["no", "n", "false", "0"].includes(normalized)) return "No";
  return "";
}

export function normalizeDtiInspectionRowData(rowData: Record<string, unknown>) {
  return {
    ...rowData,
    odGage: normalizeDtiYesNo(rowData.odGage),
    boxRefaceType: normalizeDtiRefaceCode(rowData.boxRefaceType),
    pinRefaceType: normalizeDtiRefaceCode(rowData.pinRefaceType),
    percentNominalWall: calculatePercentNominalWall(rowData),
  };
}

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
const boxRepairAlertKeys = [
  "damagedSealBox", "damagedThreadsBox", "damagedTorqueShoulderBox", "pittedBox",
  "overRefacedBox", "threadReconditionBox", "bevelRepairBox",
];
const pinRepairAlertKeys = [
  "damagedSealPin", "damagedThreadsPin", "damagedTorqueShoulderPin", "pittedPin",
  "overRefacedPin", "threadReconditionPin", "bevelRepairPin",
];

function marked(value: unknown) {
  return value === true || (typeof value === "string" && value.trim() !== "");
}

function countMarked(items: DtiInspectionItemLike[], key: string) {
  return items.reduce((total, item) => total + (marked(item.row_data[key]) ? 1 : 0), 0);
}

export function summarizeDtiInspection(items: DtiInspectionItemLike[], componentType?: DtiComponentType): DtiInspectionSummary {
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
    damagedBoxes: items.filter((item) => boxDamageKeys.some((key) => marked(item.row_data[key]))).length,
    damagedPins: items.filter((item) => pinDamageKeys.some((key) => marked(item.row_data[key]))).length,
    hardbandBoxes: countMarked(items, "hardbandBox"),
    hardbandPins: countMarked(items, "hardbandPin"),
    hardbands: countMarked(items, "hardbandBox") + countMarked(items, "hardbandPin"),
    damagedHardbands: countMarked(items, "damagedHardbandBox") + countMarked(items, "damagedHardbandPin"),
    dbrHardbands: countMarked(items, "dbrHardbandBox") + countMarked(items, "dbrHardbandPin"),
    centerPad1: componentType === "HWDP" ? countMarked(items, "hardbandCenterPad1") : 0,
    centerPad2: componentType === "HWDP" ? countMarked(items, "hardbandCenterPad2") : 0,
  };
}

export function calculateDtiThresholdMetrics(
  items: DtiInspectionItemLike[],
  totalJointCount = items.length,
): DtiThresholdMetrics {
  const totalJoints = Math.max(0, Math.trunc(totalJointCount));
  const dbrJoints = items.filter((item) => dbrKeys.some((key) => marked(item.row_data[key]))).length;
  const boxRepairs = items.filter((item) => boxRepairAlertKeys.some((key) => marked(item.row_data[key]))).length;
  const pinRepairs = items.filter((item) => pinRepairAlertKeys.some((key) => marked(item.row_data[key]))).length;
  const totalRepairs = boxRepairs + pinRepairs;
  const dbrPercent = totalJoints > 0 ? (dbrJoints / totalJoints) * 100 : 0;
  const repairPercent = totalJoints > 0 ? (totalRepairs / totalJoints) * 100 : 0;

  return {
    totalJoints,
    dbrJoints,
    boxRepairs,
    pinRepairs,
    totalRepairs,
    dbrPercent,
    repairPercent,
    // Use integer math so an exact 10% (for example, 50 of 500) always alerts.
    dbrAlert: totalJoints > 0 && dbrJoints * 10 >= totalJoints,
    repairAlert: totalJoints > 0 && totalRepairs * 10 >= totalJoints,
  };
}

export function calculatePercentNominalWall(data: Record<string, unknown>) {
  if (data.nominalWallThickness === "" || data.nominalWallThickness === null || data.nominalWallThickness === undefined) return null;
  if (data.utThickness === "" || data.utThickness === null || data.utThickness === undefined) return null;
  const nominal = Number(data.nominalWallThickness);
  const measured = Number(data.utThickness);
  return nominal > 0 && measured >= 0 && Number.isFinite(measured) ? Number((measured / nominal).toFixed(4)) : null;
}
