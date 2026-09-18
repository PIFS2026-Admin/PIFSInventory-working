import { normalizeDtiRefaceCode, type DtiComponentType } from "./dtiInspectionReport";

export type DtiRefacingItem = {
  id?: string;
  component_type: DtiComponentType;
  sequence_number: number;
  row_data: Record<string, unknown>;
  grading_result?: { areas?: { Final?: { classification?: string | null } } } | null;
};

export const dtiRefacingFields = [
  ["refacePresent", "Present"],
  ["refaceInitialClass", "Initial Class"],
  ["refaceFinalClass", "Final Class"],
  ["refaceClassReject", "Class Reject"],
  ["refaceBoxRepairRequired", "Box Repair Req."],
  ["refaceBoxDepthBefore", "Box Depth Before"],
  ["refaceBoxDepthAfter", "Box Depth After"],
  ["refaceBoxTongBefore", "Box Tong Before"],
  ["refaceBoxTongAfter", "Box Tong After"],
  ["refaceBoxResults", "Box Results"],
  ["refacePinRepairRequired", "Pin Repair Req."],
  ["refacePinLengthBefore", "Pin Length Before"],
  ["refacePinLengthAfter", "Pin Length After"],
  ["refacePinTongBefore", "Pin Tong Before"],
  ["refacePinTongAfter", "Pin Tong After"],
  ["refacePinResults", "Pin Results"],
] as const;

function text(value: unknown) { return String(value ?? "").trim(); }
function marked(value: unknown) {
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  return !["", "false", "no", "0"].includes(value.trim().toLowerCase());
}

export function isDtiRefacingFinding(item: DtiRefacingItem) {
  const row = item.row_data;
  return marked(row.boxReface) || marked(row.pinReface) || marked(row.boxRefaceType) || marked(row.pinRefaceType);
}

export function getDtiRefacingRows<T extends DtiRefacingItem>(items: T[], componentType: DtiComponentType): T[] {
  return items
    .filter((item) => item.component_type === componentType && isDtiRefacingFinding(item))
    .sort((a, b) => a.sequence_number - b.sequence_number);
}

export function getDtiRefacingData(item: DtiRefacingItem): Record<string, unknown> {
  const row = item.row_data;
  const initialClass = text(row.refaceInitialClass) || text(item.grading_result?.areas?.Final?.classification);
  return {
    ...row,
    refacePresent: text(row.refacePresent) || "Yes",
    refaceInitialClass: initialClass,
    refaceFinalClass: text(row.refaceFinalClass),
    refaceClassReject: text(row.refaceClassReject),
    refaceBoxRepairRequired: text(row.refaceBoxRepairRequired) || normalizeDtiRefaceCode(row.boxRefaceType) || (row.boxReface === true ? "Yes" : ""),
    refaceBoxDepthBefore: text(row.refaceBoxDepthBefore) || text(row.boxCriticalLength),
    refaceBoxDepthAfter: text(row.refaceBoxDepthAfter) || text(row.boxLengthAfterRepair),
    refaceBoxTongBefore: text(row.refaceBoxTongBefore) || text(row.boxTongSpace),
    refaceBoxTongAfter: text(row.refaceBoxTongAfter),
    refaceBoxResults: text(row.refaceBoxResults),
    refacePinRepairRequired: text(row.refacePinRepairRequired) || normalizeDtiRefaceCode(row.pinRefaceType) || (row.pinReface === true ? "Yes" : ""),
    refacePinLengthBefore: text(row.refacePinLengthBefore) || text(row.pinCriticalLength),
    refacePinLengthAfter: text(row.refacePinLengthAfter) || text(row.pinLengthAfterRepair),
    refacePinTongBefore: text(row.refacePinTongBefore) || text(row.pinTongSpace),
    refacePinTongAfter: text(row.refacePinTongAfter),
    refacePinResults: text(row.refacePinResults),
  };
}
