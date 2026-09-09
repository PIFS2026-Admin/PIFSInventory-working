export type DtiEquipmentRow = Record<string, unknown>;

export const dtiEquipmentRequirements = [
  { code: "TRAILER", label: "Inspection unit / trailer", reference: "OMS-103", defaultRequired: true },
  { code: "EMI", label: "EMI system and correct buggy head", reference: "OMS-103 / OMS-108", defaultRequired: true },
  { code: "UT", label: "UT wall thickness gauge and transducer", reference: "OMS-108", defaultRequired: true },
  { code: "CAL", label: "Certified calibration standards / step block", reference: "OMS-108", defaultRequired: true },
  { code: "DIM", label: "Dimensional and thread gauges", reference: "OMS-103", defaultRequired: true },
  { code: "DATA", label: "EMI data-recording system", reference: "OMS-108", defaultRequired: true },
  { code: "MPI", label: "AC yoke / DC coil", reference: "OMS-103", defaultRequired: false },
  { code: "LIGHT", label: "UV / white-light meter", reference: "OMS-103", defaultRequired: false },
  { code: "PT", label: "Liquid penetrant test kit", reference: "OMS-103", defaultRequired: false },
] as const;

function clean(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return clean(value).toLowerCase(); }

export function requiredDtiEquipmentCodes(job: DtiEquipmentRow) {
  const scope = normalized([job.title, job.job_type, job.job_description, JSON.stringify(job.source_snapshot ?? {})].join(" "));
  const result = new Set<string>(dtiEquipmentRequirements.filter((item) => item.defaultRequired).map((item) => item.code));
  if (/mpi|magnetic particle|cat\s*[45]|category\s*[45]|hdls/.test(scope)) { result.add("MPI"); result.add("LIGHT"); }
  if (/blacklight|black light|ultraviolet|\buv\b/.test(scope)) result.add("LIGHT");
  if (/penetrant|\bpt\b/.test(scope)) result.add("PT");
  return result;
}

export function buildDtiEquipmentReadiness(job: DtiEquipmentRow, assignments: DtiEquipmentRow[], assets: DtiEquipmentRow[], calibrations: DtiEquipmentRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  const warningDate = new Date(); warningDate.setDate(warningDate.getDate() + 30);
  const warning = warningDate.toISOString().slice(0, 10);
  const assetById = new Map(assets.map((asset) => [clean(asset.id), asset]));
  const latestByAsset = new Map<string, DtiEquipmentRow>();
  calibrations.forEach((calibration) => { const key = clean(calibration.equipment_asset_id); if (!latestByAsset.has(key)) latestByAsset.set(key, calibration); });
  const required = requiredDtiEquipmentCodes(job);
  const enriched = assignments.map((assignment) => {
    const asset = assetById.get(clean(assignment.equipment_asset_id)) ?? {};
    const calibration = latestByAsset.get(clean(assignment.equipment_asset_id)) ?? null;
    let readiness = clean(assignment.verification_status) === "Verified" ? "Ready" : "Needs Attention";
    let reason = readiness === "Ready" ? "Verified for this job" : "Assignment has not been verified";
    if (clean(assignment.verification_status) === "Out of Service" || asset.is_active === false) { readiness = "Blocked"; reason = "Equipment is out of service"; }
    else if (asset.requires_calibration === true && !calibration) { readiness = "Blocked"; reason = "No calibration record"; }
    else if (asset.requires_calibration === true && clean(calibration?.result) !== "Pass") { readiness = "Blocked"; reason = "Latest calibration did not pass"; }
    else if (asset.requires_calibration === true && clean(calibration?.expires_on) < today) { readiness = "Blocked"; reason = "Calibration expired"; }
    else if (asset.requires_calibration === true && clean(calibration?.expires_on) <= warning && readiness === "Ready") { readiness = "Needs Attention"; reason = "Calibration expires within 30 days"; }
    return { ...assignment, asset, latest_calibration: calibration, readiness, readiness_reason: reason } as DtiEquipmentRow & {
      asset: DtiEquipmentRow;
      latest_calibration: DtiEquipmentRow | null;
      readiness: string;
      readiness_reason: string;
    };
  });
  const missing = [...required].filter((code) => !enriched.some((assignment) => clean(assignment.requirement_code) === code && assignment.is_required !== false));
  const requiredAssignments = enriched.filter((assignment) => assignment.is_required !== false);
  const blocked = requiredAssignments.filter((assignment) => assignment.readiness === "Blocked").length;
  const attention = requiredAssignments.filter((assignment) => assignment.readiness === "Needs Attention").length + missing.length;
  return { status: blocked ? "Blocked" : attention ? "Needs Attention" : "Ready", blocked, attention, missing, required: [...required], assignments: enriched };
}
