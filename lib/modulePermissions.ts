export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "close"
  | "export"
  | "manage_settings"
  | "receive_notifications";

export type PermissionModuleKey =
  | "dashboard"
  | "tubular_inventory"
  | "customer_portal"
  | "release_requests"
  | "receiving"
  | "shipping"
  | "pipe_moves"
  | "consumable_inventory"
  | "purchase_orders"
  | "issue_tickets"
  | "work_orders"
  | "daily_summaries"
  | "dti"
  | "cdt"
  | "hardbanding"
  | "tubing"
  | "lead_scorecards"
  | "reports"
  | "exports"
  | "user_management"
  | "system_settings"
  | "email_notification_settings";

export type RoleGroupKey =
  | "executive"
  | "management"
  | "leads"
  | "field_yard_warehouse"
  | "sales"
  | "customers"
  | "legacy";

export type RoleKey =
  | "admin"
  | "owner"
  | "service_line_manager"
  | "dti_superintendent"
  | "dti_lead"
  | "level_2_inspector"
  | "yard_manager"
  | "yard_hand"
  | "inventory_manager"
  | "warehouse_employee"
  | "sales"
  | "office_admin"
  | "cdt_lead"
  | "cdt_hand"
  | "hardband_lead"
  | "hardband_hand"
  | "tubing_lead"
  | "tubing_hand"
  | "maintenance_lead"
  | "maintenance_hand"
  | "customer"
  | "employee"
  | "operator"
  | "inventory_specialist"
  | "dti_inspector"
  | "lead_inspector";

export type RoleOption = {
  key: RoleKey;
  label: string;
  group: RoleGroupKey;
};

export type PermissionMap = Record<PermissionModuleKey, Record<PermissionAction, boolean>>;

export type ModulePermissionConfig = {
  key: PermissionModuleKey;
  label: string;
  description: string;
};

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

export const permissionActions: PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "close",
  "export",
  "manage_settings",
  "receive_notifications",
];

export const permissionModules: ModulePermissionConfig[] = [
  { key: "dashboard", label: "Dashboard", description: "Internal dashboard, charts, and operating overview." },
  { key: "tubular_inventory", label: "Tubular Inventory", description: "Pipe yard inventory, rack map, and inventory records." },
  { key: "customer_portal", label: "Customer Portal", description: "Customer-facing inventory, tickets, and release forms." },
  { key: "release_requests", label: "Release Requests", description: "Customer release requests and release paperwork." },
  { key: "receiving", label: "Receiving", description: "Receive pipe and create receiving tickets." },
  { key: "shipping", label: "Shipping", description: "Ship pipe and create shipping/BOL tickets." },
  { key: "pipe_moves", label: "Pipe Moves", description: "Move pipe between racks and work stations." },
  { key: "consumable_inventory", label: "Consumable Inventory", description: "Standalone consumables inventory and stock levels." },
  { key: "purchase_orders", label: "Purchase Orders", description: "POs, vendors, receiving, and approval flow." },
  { key: "issue_tickets", label: "Issue Tickets", description: "Pick lists, issue tickets, and issue history." },
  { key: "work_orders", label: "Work Orders / Maintenance", description: "Maintenance work orders and equipment repairs." },
  { key: "daily_summaries", label: "Daily Summaries", description: "DTI daily summaries and inspection summary forms." },
  { key: "dti", label: "DTI", description: "DTI jobs, scorecards, red flags, and inspector activity." },
  { key: "cdt", label: "CDT", description: "CDT jobs, activity, summaries, and reports." },
  { key: "hardbanding", label: "Hardbanding", description: "Hardband jobs, serials, wire usage, and closeout reports." },
  { key: "tubing", label: "Tubing", description: "Tubing jobs, activity, summaries, and production records." },
  { key: "lead_scorecards", label: "Lead Scorecards", description: "Lead performance and scorecard dashboards." },
  { key: "reports", label: "Reports", description: "Internal reports, ticket history, and customer reports." },
  { key: "exports", label: "Exports", description: "CSV/PDF exports and printable records." },
  { key: "user_management", label: "User Management", description: "Users, roles, yards, customers, and access controls." },
  { key: "system_settings", label: "System Settings", description: "System setup, options, and global settings." },
  { key: "email_notification_settings", label: "Email / Notification Settings", description: "Email groups, alerts, and notification preferences." },
];

export const roleOptions: RoleOption[] = [
  { key: "admin", label: "Admin", group: "executive" },
  { key: "owner", label: "Owners", group: "executive" },
  { key: "service_line_manager", label: "Service Line Managers", group: "management" },
  { key: "dti_superintendent", label: "DTI Superintendent", group: "management" },
  { key: "dti_lead", label: "DTI Leads", group: "leads" },
  { key: "level_2_inspector", label: "Level 2 Inspector", group: "field_yard_warehouse" },
  { key: "yard_manager", label: "Yard Manager", group: "management" },
  { key: "yard_hand", label: "Yard Hands", group: "field_yard_warehouse" },
  { key: "inventory_manager", label: "Inventory Manager", group: "management" },
  { key: "warehouse_employee", label: "Warehouse Employee", group: "field_yard_warehouse" },
  { key: "sales", label: "Sales", group: "sales" },
  { key: "office_admin", label: "Office Admins", group: "management" },
  { key: "cdt_lead", label: "CDT Leads", group: "leads" },
  { key: "cdt_hand", label: "CDT Hands", group: "field_yard_warehouse" },
  { key: "hardband_lead", label: "Hardband Leads", group: "leads" },
  { key: "hardband_hand", label: "Hardband Hands", group: "field_yard_warehouse" },
  { key: "tubing_lead", label: "Tubing Leads", group: "leads" },
  { key: "tubing_hand", label: "Tubing Hands", group: "field_yard_warehouse" },
  { key: "maintenance_lead", label: "Maintenance Leads", group: "leads" },
  { key: "maintenance_hand", label: "Maintenance Hands", group: "field_yard_warehouse" },
  { key: "customer", label: "Customers", group: "customers" },
];

export const legacyRoleOptions: RoleOption[] = [
  { key: "employee", label: "Employee", group: "legacy" },
  { key: "operator", label: "Operator", group: "legacy" },
  { key: "inventory_specialist", label: "Inventory Specialist", group: "legacy" },
  { key: "dti_inspector", label: "DTI Inspector", group: "legacy" },
  { key: "lead_inspector", label: "Lead Inspector", group: "legacy" },
];

export const allRoleOptions = [...roleOptions, ...legacyRoleOptions];
export const allRoleKeys = allRoleOptions.map((role) => role.key);
export const allPermissionModuleKeys = permissionModules.map((module) => module.key);

export const roleGroups: Record<RoleGroupKey, RoleKey[]> = {
  executive: ["admin", "owner"],
  management: ["service_line_manager", "dti_superintendent", "yard_manager", "inventory_manager", "office_admin"],
  leads: ["dti_lead", "cdt_lead", "hardband_lead", "tubing_lead", "maintenance_lead"],
  field_yard_warehouse: [
    "yard_hand",
    "warehouse_employee",
    "cdt_hand",
    "hardband_hand",
    "tubing_hand",
    "maintenance_hand",
    "level_2_inspector",
  ],
  sales: ["sales"],
  customers: ["customer"],
  legacy: ["employee", "operator", "inventory_specialist", "dti_inspector", "lead_inspector"],
};

const roleAliases: Record<string, RoleKey> = {
  admins: "admin",
  owner: "owner",
  owners: "owner",
  management: "service_line_manager",
  service_line_managers: "service_line_manager",
  dti_superintendents: "dti_superintendent",
  dti_leads: "dti_lead",
  level_2_inspectors: "level_2_inspector",
  yard_managers: "yard_manager",
  yard_hands: "yard_hand",
  inventory_managers: "inventory_manager",
  warehouse_employees: "warehouse_employee",
  office_admins: "office_admin",
  cdt_leads: "cdt_lead",
  cdt_hands: "cdt_hand",
  hardband_leads: "hardband_lead",
  hardband_hands: "hardband_hand",
  tubing_leads: "tubing_lead",
  tubing_hands: "tubing_hand",
  maintenance_leads: "maintenance_lead",
  maintenance_hands: "maintenance_hand",
  customers: "customer",
  inventory_manager: "inventory_manager",
  inventory_specialist: "inventory_specialist",
  dti_inspector: "dti_inspector",
  lead_inspector: "lead_inspector",
};

function normalizeRoleInput(role: unknown) {
  return String(role ?? "customer")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const moduleAccessOptions: ModuleAccessOption[] = [
  {
    key: "yard_view",
    label: "Yard View",
    description: "Rack map, pipe inventory, receiving, shipping, transfers, and tickets.",
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Standalone consumables inventory, pick lists, items, vendors, and reports.",
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

const legacyModuleRequirements: Record<ModuleKey, PermissionModuleKey[]> = {
  yard_view: ["tubular_inventory", "receiving", "shipping", "pipe_moves"],
  inventory: ["consumable_inventory", "issue_tickets"],
  purchase_orders: ["purchase_orders"],
  dti: ["dti", "lead_scorecards"],
  dti_summary: ["daily_summaries"],
  hardband: ["hardbanding"],
  admin: ["user_management", "system_settings", "email_notification_settings"],
  reports: ["reports", "exports"],
  dashboard: ["dashboard"],
};

function blankActionMap(value = false): Record<PermissionAction, boolean> {
  return permissionActions.reduce(
    (map, action) => ({ ...map, [action]: value }),
    {} as Record<PermissionAction, boolean>
  );
}

export function createEmptyPermissionMap(): PermissionMap {
  return permissionModules.reduce((map, module) => {
    map[module.key] = blankActionMap(false);
    return map;
  }, {} as PermissionMap);
}

export function createFullPermissionMap(): PermissionMap {
  return permissionModules.reduce((map, module) => {
    map[module.key] = blankActionMap(true);
    return map;
  }, {} as PermissionMap);
}

function allow(map: PermissionMap, modules: PermissionModuleKey[], actions: PermissionAction[]) {
  modules.forEach((module) => {
    actions.forEach((action) => {
      map[module][action] = true;
    });
  });
}

function allowViewExport(map: PermissionMap, modules: PermissionModuleKey[]) {
  allow(map, modules, ["view", "export"]);
}

export function normalizeRole(role: unknown): RoleKey {
  const raw = normalizeRoleInput(role);

  if (allRoleKeys.includes(raw as RoleKey)) return raw as RoleKey;
  return roleAliases[raw] ?? "customer";
}

export function isKnownRole(role: unknown) {
  const raw = normalizeRoleInput(role);
  return allRoleKeys.includes(raw as RoleKey) || Boolean(roleAliases[raw]);
}

export function roleLabel(role: unknown) {
  const normalized = normalizeRole(role);
  return allRoleOptions.find((option) => option.key === normalized)?.label ?? "Customer";
}

export function getDefaultPermissionsForRole(roleValue: unknown): PermissionMap {
  const role = normalizeRole(roleValue);
  const permissions = createEmptyPermissionMap();

  if (role === "admin" || role === "owner") {
    return createFullPermissionMap();
  }

  if (role === "customer") {
    allow(permissions, ["customer_portal", "release_requests", "reports", "exports"], ["view", "create", "export"]);
    return permissions;
  }

  if (role === "employee") {
    allow(permissions, allPermissionModuleKeys.filter((module) => !["user_management", "system_settings"].includes(module)), [
      "view",
      "create",
      "edit",
      "close",
      "export",
      "receive_notifications",
    ]);
    return permissions;
  }

  if (role === "service_line_manager") {
    allowViewExport(permissions, ["dashboard", "reports", "exports", "lead_scorecards"]);
    allow(permissions, ["dti", "cdt", "hardbanding", "tubing", "daily_summaries", "work_orders"], ["view", "edit", "approve", "close", "export", "receive_notifications"]);
    allow(permissions, ["consumable_inventory", "purchase_orders", "issue_tickets"], ["view", "create", "approve", "export", "receive_notifications"]);
  }

  if (role === "dti_superintendent") {
    allow(permissions, ["dashboard", "dti", "daily_summaries", "lead_scorecards", "reports", "exports"], [
      "view",
      "create",
      "edit",
      "approve",
      "close",
      "export",
      "receive_notifications",
    ]);
    allow(permissions, ["consumable_inventory", "issue_tickets"], ["view", "create"]);
  }

  if (role === "dti_lead") {
    allow(permissions, ["dti", "daily_summaries", "consumable_inventory", "issue_tickets"], ["view", "create", "edit", "close", "receive_notifications"]);
    allow(permissions, ["reports", "exports"], ["view", "export"]);
  }

  if (role === "dti_inspector" || role === "level_2_inspector") {
    allow(permissions, ["daily_summaries", "dti", "consumable_inventory", "issue_tickets"], ["view", "create", "edit"]);
    allow(permissions, ["reports"], ["view"]);
  }

  if (role === "yard_manager") {
    allow(permissions, ["dashboard", "tubular_inventory", "release_requests", "receiving", "shipping", "pipe_moves", "reports", "exports"], [
      "view",
      "create",
      "edit",
      "delete",
      "approve",
      "close",
      "export",
      "receive_notifications",
    ]);
  }

  if (role === "yard_hand") {
    allow(permissions, ["tubular_inventory", "receiving", "shipping", "pipe_moves", "release_requests"], ["view", "create", "edit", "receive_notifications"]);
    allow(permissions, ["reports"], ["view"]);
  }

  if (role === "inventory_manager" || role === "inventory_specialist") {
    allow(permissions, ["dashboard", "consumable_inventory", "purchase_orders", "issue_tickets", "reports", "exports"], [
      "view",
      "create",
      "edit",
      "approve",
      "close",
      "export",
      "manage_settings",
      "receive_notifications",
    ]);
    if (role === "inventory_manager") allow(permissions, ["purchase_orders", "issue_tickets"], ["delete"]);
  }

  if (role === "warehouse_employee") {
    allow(permissions, ["consumable_inventory", "issue_tickets"], ["view", "create", "edit", "receive_notifications"]);
    allow(permissions, ["purchase_orders"], ["view", "create"]);
  }

  if (role === "sales") {
    allow(permissions, ["dashboard", "tubular_inventory", "customer_portal", "release_requests", "reports", "exports"], ["view", "export", "receive_notifications"]);
  }

  if (role === "office_admin") {
    allow(permissions, ["dashboard", "customer_portal", "daily_summaries", "reports", "exports", "purchase_orders", "user_management", "email_notification_settings"], [
      "view",
      "create",
      "edit",
      "approve",
      "export",
      "receive_notifications",
    ]);
  }

  if (role === "cdt_lead" || role === "hardband_lead" || role === "tubing_lead") {
    const module = role === "cdt_lead" ? "cdt" : role === "hardband_lead" ? "hardbanding" : "tubing";
    allow(permissions, [module, "daily_summaries", "consumable_inventory", "issue_tickets", "reports", "exports"], ["view", "create", "edit", "close", "export", "receive_notifications"]);
  }

  if (role === "cdt_hand" || role === "hardband_hand" || role === "tubing_hand") {
    const module = role === "cdt_hand" ? "cdt" : role === "hardband_hand" ? "hardbanding" : "tubing";
    allow(permissions, [module, "daily_summaries", "consumable_inventory", "issue_tickets"], ["view", "create", "edit"]);
  }

  if (role === "maintenance_lead") {
    allow(permissions, ["dashboard", "work_orders", "consumable_inventory", "issue_tickets", "reports", "exports"], ["view", "create", "edit", "approve", "close", "export", "receive_notifications"]);
  }

  if (role === "maintenance_hand") {
    allow(permissions, ["work_orders", "consumable_inventory", "issue_tickets"], ["view", "create", "edit"]);
  }

  if (role === "operator") {
    allow(permissions, ["hardbanding"], ["view", "create", "edit", "close"]);
  }

  if (role === "lead_inspector") {
    allow(permissions, ["dti", "daily_summaries", "lead_scorecards"], ["view", "create", "edit", "close"]);
  }

  return permissions;
}

export function hasPermission(permissionMap: PermissionMap | null | undefined, module: PermissionModuleKey, action: PermissionAction) {
  return Boolean(permissionMap?.[module]?.[action]);
}

export const canView = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "view");
export const canCreate = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "create");
export const canEdit = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "edit");
export const canDelete = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "delete");
export const canApprove = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "approve");
export const canClose = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "close");
export const canExport = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "export");
export const canManageSettings = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "manage_settings");
export const canReceiveNotifications = (permissions: PermissionMap | null | undefined, module: PermissionModuleKey) =>
  hasPermission(permissions, module, "receive_notifications");

export type PermissionOverrideInput = {
  module_key?: unknown;
  moduleKey?: unknown;
  action_key?: unknown;
  actionKey?: unknown;
  is_allowed?: unknown;
  isAllowed?: unknown;
};

export function moduleKeysFromPermissionMap(permissionMap: PermissionMap | null | undefined) {
  if (!permissionMap) return [];

  return moduleAccessOptions
    .filter((option) => legacyModuleRequirements[option.key].some((module) => canView(permissionMap, module)))
    .map((option) => option.key);
}

export function applyPermissionOverrides(permissionMap: PermissionMap, overrides: PermissionOverrideInput[] = []) {
  const next = permissionModules.reduce((map, module) => {
    map[module.key] = { ...permissionMap[module.key] };
    return map;
  }, {} as PermissionMap);
  const modules = new Set(allPermissionModuleKeys);
  const actions = new Set(permissionActions);

  overrides.forEach((override) => {
    const moduleKey = String(override.module_key ?? override.moduleKey ?? "");
    const actionKey = String(override.action_key ?? override.actionKey ?? "");

    if (!modules.has(moduleKey as PermissionModuleKey) || !actions.has(actionKey as PermissionAction)) return;

    next[moduleKey as PermissionModuleKey][actionKey as PermissionAction] = Boolean(
      override.is_allowed ?? override.isAllowed
    );
  });

  return next;
}

export function defaultModulesForRole(role: string) {
  return moduleKeysFromPermissionMap(getDefaultPermissionsForRole(role));
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
  if (href === "/home" || href === "/dashboard") return "dashboard";
  if (href === "/inventory") return "inventory";
  if (href === "/purchase-orders") return "purchase_orders";
  if (href === "/dti") return "dti";
  if (href === "/dti-summary") return "dti_summary";
  if (href === "/hardband") return "hardband";
  if (href === "/admin") return "admin";
  if (href.startsWith("/?open=reports")) return "reports";
  return null;
}
