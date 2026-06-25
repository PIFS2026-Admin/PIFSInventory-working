export type ModuleKey =
  | "yard_view"
  | "inventory"
  | "purchase_orders"
  | "dti"
  | "dti_summary"
  | "hardband"
  | "admin"
  | "reports"
  | "dashboard";

export type ModuleAccessOption = {
  key: ModuleKey;
  label: string;
  description: string;
};

export const moduleAccessOptions: ModuleAccessOption[] = [
  {
    key: "yard_view",
    label: "Yard View",
    description: "Rack map, pipe inventory, receiving, shipping, transfers, and tickets.",
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Standalone consumables inventory, issue counter, items, vendors, and reports.",
  },
  {
    key: "purchase_orders",
    label: "Purchase Orders",
    description: "Vendor purchase orders, receiving, approvals, and PO reports.",
  },
  {
    key: "dti",
    label: "DTI",
    description: "DTI jobs, scorecards, red flags, and lead inspector performance.",
  },
  {
    key: "dti_summary",
    label: "DTI Daily Summary",
    description: "Daily inspection summary form, print, email, and saved summaries.",
  },
  {
    key: "hardband",
    label: "Hardbanding",
    description: "Hardband work orders, serial numbers, closeout, and reports.",
  },
  {
    key: "admin",
    label: "Admin Controls",
    description: "Companies, users, roles, yards, racks, options, and setup tools.",
  },
  {
    key: "reports",
    label: "Reports",
    description: "Pipe inventory reports, ticket searches, and exports.",
  },
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Weekly activity, transaction counts, and management overview.",
  },
];

export const allModuleKeys = moduleAccessOptions.map((option) => option.key);

const roleDefaults: Record<string, ModuleKey[]> = {
  admin: allModuleKeys,
  employee: ["yard_view", "inventory", "purchase_orders", "dti", "dti_summary", "hardband", "reports", "dashboard"],
  inventory_manager: ["yard_view", "inventory", "purchase_orders"],
  inventory_specialist: ["inventory", "purchase_orders"],
  dti_superintendent: ["dti", "dti_summary"],
  dti_inspector: ["dti_summary"],
  operator: ["hardband"],
  sales: ["yard_view", "reports", "dashboard"],
  customer: [],
};

export function defaultModulesForRole(role: string) {
  return [...(roleDefaults[role.toLowerCase()] ?? [])];
}

export function cleanModuleKeys(values: unknown[]) {
  const allowed = new Set<ModuleKey>(allModuleKeys);
  return Array.from(
    new Set(
      values
        .map((value) => String(value))
        .filter((value): value is ModuleKey => allowed.has(value as ModuleKey))
    )
  );
}

export function moduleHrefToKey(href: string): ModuleKey | null {
  if (href === "/") return "yard_view";
  if (href === "/inventory") return "inventory";
  if (href === "/purchase-orders") return "purchase_orders";
  if (href === "/dti") return "dti";
  if (href === "/dti-summary") return "dti_summary";
  if (href === "/hardband") return "hardband";
  if (href === "/admin") return "admin";
  if (href === "/dashboard") return "dashboard";
  if (href.startsWith("/?open=reports")) return "reports";
  return null;
}
