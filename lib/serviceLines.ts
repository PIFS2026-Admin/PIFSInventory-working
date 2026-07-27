export const serviceLineOptions = [
  "DTI",
  "Hardbanding",
  "CDT",
  "Tubing",
  "Hotshot",
  "Yard",
  "Shop",
  "Equipment",
  "Mechanic Shop",
  "Sales",
  "Operations",
  "Safety",
  "Inventory",
  "Purchase Orders",
] as const;

export type ServiceLineName = (typeof serviceLineOptions)[number];

const serviceLineAliases: Record<string, ServiceLineName> = {
  dti: "DTI",
  dtii: "DTI",
  hb: "Hardbanding",
  hardband: "Hardbanding",
  hardbanding: "Hardbanding",
  hardbander: "Hardbanding",
  hardbandingservices: "Hardbanding",
  cdt: "CDT",
  casingdrifttally: "CDT",
  tubing: "Tubing",
  tubings: "Tubing",
  hotshot: "Hotshot",
  hotshots: "Hotshot",
  yard: "Yard",
  yards: "Yard",
  shop: "Shop",
  equipment: "Equipment",
  mechanicshop: "Mechanic Shop",
  mechanics: "Mechanic Shop",
  maintenance: "Mechanic Shop",
  sales: "Sales",
  operations: "Operations",
  ops: "Operations",
  safety: "Safety",
  inventory: "Inventory",
  consumables: "Inventory",
  purchaseorders: "Purchase Orders",
  po: "Purchase Orders",
  pos: "Purchase Orders",
};

export function serviceLineKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeServiceLine(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  return serviceLineAliases[serviceLineKey(raw)] ?? raw;
}

export function serviceLineOrFallback(value: unknown, fallback = "Unassigned") {
  return normalizeServiceLine(value) || fallback;
}
