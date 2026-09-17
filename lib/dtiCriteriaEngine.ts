export const dtiClassifications = ["Premium", "Class 1", "Class 2", "Class 3", "Class 4", "NI", "NC", "DBR"] as const;

export type DtiClassification = (typeof dtiClassifications)[number];
export type DtiGradingStatus = "Graded" | "Pending" | "Not Evaluated";
export type DtiInspectionArea = "Tube" | "Box" | "Pin" | "Tool Joint" | "Joint";

export type DtiCriteriaRule = {
  id?: unknown;
  rule_name?: unknown;
  field_key?: unknown;
  field_label?: unknown;
  inspection_area?: unknown;
  comparison?: unknown;
  minimum_value?: unknown;
  maximum_value?: unknown;
  expected_value?: unknown;
  result_classification?: unknown;
  reason?: unknown;
  value_unit?: unknown;
  is_active?: unknown;
};

export type DtiCriteriaSnapshot = {
  criteriaSet?: Record<string, unknown>;
  version?: Record<string, unknown>;
  rules?: DtiCriteriaRule[];
};

export type DtiRuleFailure = {
  ruleId: string;
  ruleName: string;
  fieldKey: string;
  fieldLabel: string;
  inspectionArea: DtiInspectionArea;
  classification: DtiClassification;
  reason: string;
  actualValue: unknown;
  valueUnit: string;
};

export type DtiAreaGrade = {
  classification: DtiClassification | null;
  status: DtiGradingStatus;
  evaluatedRules: number;
  pendingRules: number;
  reasons: DtiRuleFailure[];
};

export type DtiGradingResult = {
  criteriaVersionId: string;
  criteriaName: string;
  gradedAt: string;
  areas: Record<DtiInspectionArea | "Final", DtiAreaGrade>;
  failures: DtiRuleFailure[];
  pendingFields: string[];
};

const classificationRank = new Map<DtiClassification, number>(dtiClassifications.map((value, index) => [value, index]));
const directAreas: DtiInspectionArea[] = ["Tube", "Box", "Pin", "Tool Joint", "Joint"];

function text(value: unknown) { return String(value ?? "").trim(); }
function isArea(value: unknown): value is DtiInspectionArea { return directAreas.includes(value as DtiInspectionArea); }
function isClassification(value: unknown): value is DtiClassification { return classificationRank.has(value as DtiClassification); }
function isMissing(value: unknown) { return value === null || value === undefined || (typeof value === "string" && value.trim() === ""); }
function normalized(value: unknown) {
  const raw = text(value).toLowerCase();
  if (["yes", "y", "true", "1"].includes(raw)) return "yes";
  if (["no", "n", "false", "0"].includes(raw)) return "no";
  return raw;
}
function numeric(value: unknown) {
  if (typeof value === "boolean" || isMissing(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function worseClassification(values: Array<DtiClassification | null>) {
  return values.reduce<DtiClassification | null>((worst, value) => {
    if (!value) return worst;
    return !worst || (classificationRank.get(value) ?? 0) > (classificationRank.get(worst) ?? 0) ? value : worst;
  }, null);
}

function accepted(rule: DtiCriteriaRule, rawValue: unknown) {
  const comparison = text(rule.comparison);
  const unit = text(rule.value_unit);
  const number = numeric(rawValue);
  const percentValue = unit === "Percent" || text(rule.field_key) === "percentNominalWall";
  const actualNumber = number !== null && percentValue && Math.abs(number) <= 1 ? number * 100 : number;
  if (comparison === "Required") return !isMissing(rawValue);
  if (comparison === "Equals") return normalized(rawValue) === normalized(rule.expected_value);
  if (actualNumber === null) return false;
  if (comparison === "Minimum") return actualNumber >= Number(rule.minimum_value);
  if (comparison === "Maximum") return actualNumber <= Number(rule.maximum_value);
  if (comparison === "Range") return actualNumber >= Number(rule.minimum_value) && actualNumber <= Number(rule.maximum_value);
  return false;
}

function aggregateArea(...areas: DtiAreaGrade[]): DtiAreaGrade {
  const evaluatedRules = areas.reduce((sum, area) => sum + area.evaluatedRules, 0);
  const pendingRules = areas.reduce((sum, area) => sum + area.pendingRules, 0);
  return {
    classification: evaluatedRules ? worseClassification(areas.map((area) => area.classification)) ?? "Premium" : null,
    status: pendingRules ? "Pending" : evaluatedRules ? "Graded" : "Not Evaluated",
    evaluatedRules,
    pendingRules,
    reasons: areas.flatMap((area) => area.reasons),
  };
}

export function evaluateDtiCriteria(
  rowData: Record<string, unknown>,
  snapshot: DtiCriteriaSnapshot | null | undefined,
  gradedAt = new Date().toISOString(),
): DtiGradingResult | null {
  if (!snapshot || !Array.isArray(snapshot.rules)) return null;
  const versionId = text(snapshot.version?.id);
  const criteriaName = text(snapshot.criteriaSet?.name) || "Acceptance Criteria";
  const areas = Object.fromEntries(directAreas.map((area) => [area, { classification: null, status: "Not Evaluated", evaluatedRules: 0, pendingRules: 0, reasons: [] }])) as unknown as Record<DtiInspectionArea, DtiAreaGrade>;
  const pendingFields = new Set<string>();

  for (const rule of snapshot.rules) {
    if (rule.is_active === false || !isArea(rule.inspection_area) || !isClassification(rule.result_classification)) continue;
    const area = areas[rule.inspection_area];
    const fieldKey = text(rule.field_key);
    const rawValue = rowData[fieldKey];
    const required = text(rule.comparison) === "Required";
    if (isMissing(rawValue) && !required) {
      area.pendingRules += 1;
      pendingFields.add(fieldKey);
      continue;
    }

    area.evaluatedRules += 1;
    if (!accepted(rule, rawValue)) {
      const failure: DtiRuleFailure = {
        ruleId: text(rule.id),
        ruleName: text(rule.rule_name) || text(rule.field_label),
        fieldKey,
        fieldLabel: text(rule.field_label) || fieldKey,
        inspectionArea: rule.inspection_area,
        classification: rule.result_classification,
        reason: text(rule.reason) || `${text(rule.field_label) || fieldKey} did not meet acceptance criteria.`,
        actualValue: rawValue,
        valueUnit: text(rule.value_unit),
      };
      area.reasons.push(failure);
      area.classification = worseClassification([area.classification, failure.classification]);
    }
  }

  for (const area of directAreas) {
    const grade = areas[area];
    grade.status = grade.pendingRules ? "Pending" : grade.evaluatedRules ? "Graded" : "Not Evaluated";
    if (grade.evaluatedRules && !grade.classification) grade.classification = "Premium";
  }

  const toolJoint = aggregateArea(areas["Tool Joint"], areas.Box, areas.Pin);
  const final = aggregateArea(areas.Tube, toolJoint, areas.Joint);
  const resultAreas = { ...areas, "Tool Joint": toolJoint, Final: final };
  return {
    criteriaVersionId: versionId,
    criteriaName,
    gradedAt,
    areas: resultAreas,
    failures: final.reasons,
    pendingFields: [...pendingFields],
  };
}
