export type FinancialLine = "dti" | "cdt" | "hb" | "trs" | "wash";
export type FinancialInputs = Record<string, unknown>;
export type FinancialRates = Record<string, number>;
export type FinancialComputed = Record<string, number | null>;

export const financialLineNames: Record<FinancialLine, string> = {
  dti: "Drilling Tubular Inspection",
  cdt: "Clean, Drift & Tally",
  hb: "Hardbanding",
  trs: "Tubular Running Services",
  wash: "Rig Wash",
};

export const financialLineRateKeys: Record<FinancialLine, string[]> = {
  dti: ["vehicle_hr", "fuel_gal", "mpg", "consumables", "dmr", "burden"],
  cdt: ["vehicle_hr", "fuel_gal", "mpg", "consumables", "dmr", "burden", "overhead"],
  hb: ["vehicle_hr", "fuel_gal", "mpg", "consumables", "dmr", "burden", "wire_lb"],
  trs: ["vehicle_hr", "fuel_gal", "mpg", "consumables", "dmr", "burden"],
  wash: ["vehicles", "vehicle_hr", "fuel_gal", "mpg", "consumables", "dmr", "burden", "overhead"],
};

const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const divide = (left: number | null, right: number | null): number | null =>
  left === null || right === null || right === 0 ? null : left / right;

const zero = (value: number | null) => value ?? 0;

export function financialTierQuantity(line: FinancialLine, inputs: FinancialInputs) {
  if (line === "dti") return numeric(inputs.joints) ?? 0;
  if (line === "cdt" || line === "wash") return (numeric(inputs.footage) ?? 0) / 44.2;
  if (line === "hb") {
    return ["dp_box", "dp_pin", "hw_box", "hw_pin", "tub_box", "tub_pin"]
      .reduce((sum, key) => sum + (numeric(inputs[key]) ?? 0), 0);
  }
  return 0;
}

function computeDti(inputs: FinancialInputs, rates: FinancialRates): FinancialComputed {
  const revenue = numeric(inputs.revenue_net) ?? numeric(inputs.revenue);
  const crew = numeric(inputs.crew);
  const days = numeric(inputs.days);
  const totalMh = numeric(inputs.total_mh);
  const refaceMh = numeric(inputs.reface_mh);
  const miles = numeric(inputs.miles);
  const vehicles = numeric(inputs.vehicles);
  const joints = numeric(inputs.joints);
  const refaces = numeric(inputs.refaces);
  const hotels = numeric(inputs.hotels);
  const travelHoursPerMember = miles === null || vehicles === null ? null : divide(divide(miles, vehicles), 65);
  const travelMh = travelHoursPerMember === null || crew === null ? null : travelHoursPerMember * crew;
  const inspectionMh = totalMh === null ? null : totalMh - zero(travelMh) - zero(refaceMh);
  const timeOnLocationPerMember = divide(inspectionMh, crew);
  const fuelGallons = divide(miles, rates.mpg);
  const jointsPerMh = divide(joints, inspectionMh);
  const refacesPerMh = refaces === null || !refaceMh ? null : refaces / refaceMh;
  const labor = totalMh === null ? null : totalMh * rates.burden;
  const travelLabor = travelMh === null ? null : travelMh * rates.burden;
  const consumables = days === null ? null : days * rates.consumables;
  const dmr = totalMh === null ? null : totalMh * rates.dmr;
  const vehicleFuel = fuelGallons === null || miles === null
    ? null
    : rates.fuel_gal * fuelGallons + (miles / 65) * rates.vehicle_hr;
  const totalCost = labor === null
    ? null
    : labor + zero(consumables) + zero(dmr) + zero(vehicleFuel) + zero(hotels);
  const profit = revenue === null || totalCost === null ? null : revenue - totalCost;

  return {
    travel_hrs_member: travelHoursPerMember,
    travel_mh: travelMh,
    insp_mh: inspectionMh,
    time_loc_member: timeOnLocationPerMember,
    fuel_gal: fuelGallons,
    joints_per_mh: jointsPerMh,
    refaces_per_mh: refacesPerMh,
    labor,
    travel_labor: travelLabor,
    consumables,
    dmr,
    vehicle_fuel: vehicleFuel,
    total_cost: totalCost,
    cost_per_joint: divide(totalCost, joints),
    profit,
    rev_per_joint: divide(revenue, joints),
    labor_pct: divide(labor, revenue),
    rev_per_mh: divide(revenue, totalMh),
    margin: divide(profit, revenue),
  };
}

function computeCdtLike(
  inputs: FinancialInputs,
  rates: FinancialRates,
  options: { joints: boolean; overhead: boolean; fixedVehicles: boolean },
): FinancialComputed {
  const revenue = numeric(inputs.revenue);
  const crew = numeric(inputs.crew);
  const totalHours = numeric(inputs.total_hrs);
  const milesRoundTrip = numeric(inputs.miles_rt);
  const footage = numeric(inputs.footage);
  const vehicles = options.fixedVehicles ? numeric(rates.vehicles) : numeric(inputs.vehicles);
  const travelHoursPerMember = milesRoundTrip === null ? null : milesRoundTrip / 55;
  const travelMh = travelHoursPerMember === null || crew === null ? null : travelHoursPerMember * crew;
  const fuelGallons = milesRoundTrip === null || vehicles === null ? null : (milesRoundTrip * vehicles) / rates.mpg;
  const timeOnLocationPerMember = totalHours === null || crew === null || travelHoursPerMember === null
    ? null
    : totalHours / crew - travelHoursPerMember;
  const locationMh = timeOnLocationPerMember === null || crew === null ? null : timeOnLocationPerMember * crew;
  const joints = options.joints ? divide(footage, 44.2) : null;
  const labor = locationMh === null ? null : rates.burden * locationMh;
  const travelLabor = travelMh === null ? null : travelMh * rates.burden;
  const vehicleFuel = fuelGallons === null || travelHoursPerMember === null || vehicles === null
    ? null
    : rates.fuel_gal * fuelGallons + travelHoursPerMember * vehicles * rates.vehicle_hr;
  const dmr = locationMh === null ? null : locationMh * rates.dmr;
  const consumables = milesRoundTrip === null ? null : rates.consumables;
  const overhead = options.overhead && revenue !== null && milesRoundTrip !== null ? revenue * (rates.overhead ?? 0) : null;
  const totalCost = labor === null
    ? null
    : labor + zero(travelLabor) + zero(vehicleFuel) + zero(dmr) + zero(consumables) + zero(overhead);
  const profit = revenue === null || totalCost === null ? null : revenue - totalCost;
  const computed: FinancialComputed = {
    travel_hrs_member: travelHoursPerMember,
    travel_mh: travelMh,
    fuel_gal: fuelGallons,
    time_loc_member: timeOnLocationPerMember,
    loc_mh: locationMh,
    footage_per_mh: divide(footage, locationMh),
    labor,
    travel_labor: travelLabor,
    vehicle_fuel: vehicleFuel,
    dmr,
    consumables,
    total_cost: totalCost,
    profit,
    labor_pct: revenue === null || labor === null ? null : (labor + zero(travelLabor)) / revenue,
    rev_per_mh: divide(revenue, totalHours),
    margin: divide(profit, revenue),
  };
  if (options.joints) {
    computed.joints = joints;
    computed.joints_per_mh = divide(joints, locationMh);
    computed.cost_per_joint = divide(totalCost, joints);
    computed.cost_per_foot = divide(totalCost, footage);
  }
  if (options.overhead) computed.overhead = overhead;
  return computed;
}

function computeHardband(inputs: FinancialInputs, rates: FinancialRates): FinancialComputed {
  const revenue = numeric(inputs.revenue);
  const crew = numeric(inputs.crew);
  const days = numeric(inputs.days);
  const totalMh = numeric(inputs.total_mh);
  const milesRoundTrip = numeric(inputs.miles_rt);
  const hotels = numeric(inputs.hotels);
  const dpBox = numeric(inputs.dp_box);
  const dpPin = numeric(inputs.dp_pin);
  const hwBox = numeric(inputs.hw_box);
  const hwPin = numeric(inputs.hw_pin);
  const tubingBox = numeric(inputs.tub_box);
  const tubingPin = numeric(inputs.tub_pin);
  const band = String(inputs.band ?? "");
  const travelHoursPerMember = milesRoundTrip === null ? null : milesRoundTrip / 65;
  const travelMh = travelHoursPerMember === null || crew === null ? null : travelHoursPerMember * crew;
  const locationTime = totalMh === null ? null : totalMh - zero(travelMh);
  const fuelGallons = divide(milesRoundTrip, rates.mpg);
  const perMember = divide(locationTime, crew);
  const dpInches = dpBox === null && dpPin === null ? null : zero(dpBox) * 3 + zero(dpPin) * 2;
  const hwInches = hwBox === null && hwPin === null ? null : zero(hwBox) * 7 + zero(hwPin) * 5;
  const tubingInches = tubingBox === null && tubingPin === null ? null : zero(tubingBox) + zero(tubingPin);
  const ends = zero(dpBox) + zero(dpPin) + zero(hwBox) + zero(hwPin) + zero(tubingBox) + zero(tubingPin);
  const labor = totalMh === null ? null : totalMh * rates.burden;
  const consumables = days === null ? null : days * rates.consumables;
  const isFiveThirtySeconds = band === "5/32" || Math.abs(Number(band) - 5 / 32) < 1e-9;
  const wireDp = (zero(dpBox) * 2 + zero(dpPin)) * (isFiveThirtySeconds ? 1.25 : 0.75) * rates.wire_lb;
  const wireHw = (zero(hwBox) * 4 + zero(hwPin) * 3) * 1.25 * rates.wire_lb;
  const wireTubing = (zero(tubingBox) + zero(tubingPin)) * 0.25 * rates.wire_lb;
  const dmr = totalMh === null ? null : rates.dmr * totalMh;
  const vehicleFuel = fuelGallons === null ? null : fuelGallons * rates.fuel_gal;
  const totalCost = labor === null
    ? null
    : labor + zero(consumables) + wireDp + wireHw + wireTubing + zero(dmr) + zero(vehicleFuel) + zero(hotels);
  const profit = revenue === null || totalCost === null ? null : revenue - totalCost;
  const totalInches = zero(dpInches) + zero(hwInches) + zero(tubingInches);

  return {
    travel_mh: travelMh,
    loc_time: locationTime,
    travel_hrs_member: travelHoursPerMember,
    fuel_gal: fuelGallons,
    dp_inches: dpInches,
    dp_eph: perMember ? divide(zero(dpBox) + zero(dpPin), perMember) : null,
    hw_inches: hwInches,
    hw_eph: perMember ? divide(zero(hwBox) + zero(hwPin), perMember) : null,
    tub_inches: tubingInches,
    tub_eph: perMember ? divide(zero(tubingBox) + zero(tubingPin), perMember) : null,
    ends,
    eph: perMember ? divide(ends, perMember) : null,
    labor,
    consumables,
    wire_dp: wireDp,
    wire_hw: wireHw,
    wire_tub: wireTubing,
    dmr,
    vehicle_fuel: vehicleFuel,
    total_cost: totalCost,
    cost_per_end: divide(totalCost, ends || null),
    cost_per_inch: totalInches ? divide(totalCost, totalInches) : null,
    profit,
    labor_pct: divide(labor, revenue),
    rev_per_mh: divide(revenue, totalMh),
    margin: divide(profit, revenue),
  };
}

export function computeFinancialJob(line: FinancialLine, inputs: FinancialInputs, rates: FinancialRates) {
  if (line === "dti") return computeDti(inputs, rates);
  if (line === "cdt") return computeCdtLike(inputs, rates, { joints: true, overhead: true, fixedVehicles: false });
  if (line === "trs") return computeCdtLike(inputs, rates, { joints: false, overhead: false, fixedVehicles: false });
  if (line === "wash") return computeCdtLike(inputs, rates, { joints: true, overhead: true, fixedVehicles: true });
  return computeHardband(inputs, rates);
}

export function financialHeadline(line: FinancialLine, inputs: FinancialInputs) {
  return {
    revenue: line === "dti" ? numeric(inputs.revenue_net) ?? numeric(inputs.revenue) : numeric(inputs.revenue),
    manhours: line === "dti" || line === "hb" ? numeric(inputs.total_mh) : numeric(inputs.total_hrs),
  };
}
