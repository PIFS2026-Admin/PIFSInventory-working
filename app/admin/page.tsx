"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import PoApprovalMatrixManager from "../../components/PoApprovalMatrixManager";
import { shouldShowPageMessage } from "../../lib/pageMessages";
import styles from "./admin.module.css";
import {
  allRoleOptions,
  ModuleKey,
  defaultModulesForRole,
  getDefaultPermissionsForRole,
  permissionActions,
  PermissionAction,
  PermissionModuleKey,
  permissionModules,
  RoleKey,
  moduleAccessOptions,
} from "../../lib/modulePermissions";

type Company = {
  id: string;
  name: string;
  accountNumber: string;
  logoUrl: string;
  isActive: boolean;
};

type Profile = {
  id: string;
  fullName: string;
  role: UserRole;
  companyId: string;
  companyName: string;
};

type Yard = {
  id: string;
  name: string;
  code: string;
};

type InventoryUserYard = {
  id: string;
  userId: string;
  yardId: string;
};

type UserModulePermission = {
  id: string;
  userId: string;
  moduleKey: ModuleKey;
  canAccess: boolean;
};

type EmailNotificationType = {
  id: string;
  notificationKey: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
};

type EmailNotificationRecipient = {
  id: string;
  notificationTypeId: string;
  userId: string;
  enabled: boolean;
};

type EmailNotificationUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

type Rack = {
  id: string;
  rackCode: string;
  capacityJoints: number;
  sortOrder: number;
  isActive: boolean;
};

type Zone = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
};

type PartNumber = {
  id: string;
  companyId: string;
  companyName: string;
  partNumber: string;
  description: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: "Range 2" | "Range 3";
};

type InspectorRole = "lead_inspector" | "level_2_inspector" | "crew_lead" | "both";

type Inspector = {
  id: string;
  fullName: string;
  role: InspectorRole;
  isActive: boolean;
};

type InventoryOptionType = "status" | "condition";

type InventoryOption = {
  id: string;
  optionType: InventoryOptionType;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

type AdminControlKey =
  | "create-company"
  | "create-user"
  | "inspectors"
  | "part-numbers"
  | "status-condition"
  | "companies"
  | "users"
  | "yard-access"
  | "permissions"
  | "email-notifications"
  | "po-approval-matrix"
  | "yard-setup";

type AdminControlCard = {
  key: AdminControlKey;
  title: string;
  description: string;
  group: string;
};

type AdminUserForm = {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  companyId: string;
};

type UserRole =
  | "owner"
  | "admin"
  | "employee"
  | "customer"
  | "operator"
  | "sales"
  | "service_line_manager"
  | "dti_superintendent"
  | "dti_lead"
  | "dti_inspector"
  | "level_2_inspector"
  | "hardband_lead"
  | "cdt_lead"
  | "inventory_specialist"
  | "inventory_manager";

const emptyUserForm: AdminUserForm = {
  email: "",
  password: "",
  fullName: "",
  role: "customer",
  companyId: "",
};

const emptyCompanyForm = {
  name: "",
  accountNumber: "",
};

const companyLogoBucket = "company-logos";

const defaultInventoryYardOrder = ["PIFS", "GILLETTE", "CASPER", "DICKINSON"];
const inventoryYardAssignableRoles: UserRole[] = [
  "owner",
  "admin",
  "employee",
  "service_line_manager",
  "dti_superintendent",
  "dti_lead",
  "level_2_inspector",
  "hardband_lead",
  "cdt_lead",
  "inventory_specialist",
  "inventory_manager",
];
const inventoryYardSetupMessage =
  "Inventory yard access table is missing. Run supabase/fix_inventory_yard_access.sql in Supabase SQL Editor, then refresh this page.";
const modulePermissionSetupMessage =
  "User module permissions table is missing. Run supabase/user_module_permissions.sql in Supabase SQL Editor, then refresh this page.";
const emailNotificationSetupMessage =
  "Admin email notification tables are missing. Run supabase/admin_security_and_notifications.sql in Supabase SQL Editor, then refresh this page.";

const emptyRackForm = {
  rackCode: "",
  capacityJoints: "500",
  sortOrder: "0",
};

const emptyZoneForm = {
  name: "",
  code: "",
  sortOrder: "0",
};

const emptyPartForm = {
  id: "",
  companyId: "",
  partNumber: "",
  description: "",
  size: "",
  grade: "",
  connection: "",
  pipeRange: "Range 2" as "Range 2" | "Range 3",
};

const emptyInspectorForm = {
  id: "",
  fullName: "",
  role: "lead_inspector" as InspectorRole,
};

const emptyOptionForm = {
  id: "",
  optionType: "status" as InventoryOptionType,
  label: "",
};

const defaultStatusInventoryOptions: InventoryOption[] = [
  "Received",
  "Available",
  "WIP",
  "Awaiting Inspection",
  "Awaiting Ship",
  "Shipped",
  "Rejected",
  "Scrap",
  "On Hold",
].map((label, index) => ({
  id: `default-status-${label}`,
  optionType: "status" as const,
  label,
  sortOrder: index + 1,
  isActive: true,
}));

const defaultConditionInventoryOptions: InventoryOption[] = [
  "New",
  "Used",
  "Premium",
  "Inspected",
  "Repair",
  "Rejected",
  "Scrap",
  "On Hold",
].map((label, index) => ({
    id: `default-condition-${label}`,
    optionType: "condition" as const,
    label,
    sortOrder: index + 1,
    isActive: true,
}));

const permissionActionLabels: Record<PermissionAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  close: "Close",
  export: "Export",
  manage_settings: "Manage",
  receive_notifications: "Notify",
};

const defaultInventoryOptions: InventoryOption[] = [
  ...defaultStatusInventoryOptions,
  ...defaultConditionInventoryOptions,
];

const adminSectionControlKeys: AdminControlKey[] = [
  "create-company",
  "create-user",
  "inspectors",
  "part-numbers",
  "status-condition",
  "companies",
  "users",
  "yard-access",
  "permissions",
  "email-notifications",
  "po-approval-matrix",
  "yard-setup",
];

const adminControls: AdminControlCard[] = [
  {
    key: "create-company",
    title: "Create Company",
    description: "Add customer companies and account numbers.",
    group: "Customers",
  },
  {
    key: "companies",
    title: "Companies",
    description: "Manage company status, names, and logos.",
    group: "Customers",
  },
  {
    key: "create-user",
    title: "Create User",
    description: "Add employees or customers with yard and screen access.",
    group: "Users",
  },
  {
    key: "users",
    title: "Users",
    description: "Update roles, customer company links, and access shortcuts.",
    group: "Users",
  },
  {
    key: "yard-access",
    title: "Inventory / PO Yard Access",
    description: "Assign internal users to the yards they can work in.",
    group: "Users",
  },
  {
    key: "permissions",
    title: "Permission Management",
    description: "Review role defaults and set user screen overrides.",
    group: "Security",
  },
  {
    key: "email-notifications",
    title: "Email Notification Settings",
    description: "Choose recipients for automatic operational emails.",
    group: "Security",
  },
  {
    key: "po-approval-matrix",
    title: "PO Approval Matrix",
    description: "Set who approves purchase orders by yard, department, cost code, amount, and tier.",
    group: "Purchasing",
  },
  {
    key: "inspectors",
    title: "Inspector Manager",
    description: "Maintain approved DTI lead and Level 2 inspector lists.",
    group: "Setup",
  },
  {
    key: "part-numbers",
    title: "Part Number Manager",
    description: "Maintain saved tubular part descriptions.",
    group: "Setup",
  },
  {
    key: "status-condition",
    title: "Status & Condition Manager",
    description: "Maintain inventory dropdown options.",
    group: "Setup",
  },
  {
    key: "yard-setup",
    title: "Yard Setup",
    description: "Manage racks and work zones by yard.",
    group: "Setup",
  },
];

function isAdminControlKey(value: string): value is AdminControlKey {
  return adminSectionControlKeys.includes(value as AdminControlKey);
}

function normalizePipeRange(value: unknown): "Range 2" | "Range 3" {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

function inspectorRoleLabel(role: InspectorRole) {
  if (role === "lead_inspector") return "Lead Inspector";
  if (role === "level_2_inspector" || role === "crew_lead") return "Level 2 Inspector";
  return "Lead Inspector / Level 2 Inspector";
}

function makeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getCompanyName(value: unknown) {
  const readName = (item: unknown) => {
    if (!item || typeof item !== "object" || !("name" in item)) return "";
    const name = (item as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  };

  if (Array.isArray(value)) return readName(value[0]);
  return readName(value);
}

function sortInventoryYards(yards: Yard[]) {
  return [...yards].sort((a, b) => {
    const aIndex = defaultInventoryYardOrder.indexOf(a.code);
    const bIndex = defaultInventoryYardOrder.indexOf(b.code);

    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }

    return a.name.localeCompare(b.name);
  });
}

function canAssignInventoryYards(role: AdminUserForm["role"] | Profile["role"]) {
  return inventoryYardAssignableRoles.includes(role);
}

function canManagePoApprovalMatrix(fullName: string, email: string, role: string) {
  const normalizedName = fullName.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = String(role ?? "").trim().toLowerCase().replace(/\s+/g, "_");

  return (
    normalizedRole === "owner" ||
    normalizedName === "wade wisenor" ||
    normalizedName === "nick grant" ||
    normalizedEmail === "wade@pathfinderinspections.com" ||
    normalizedEmail === "nick.grant@pathfinderinspections.com" ||
    normalizedEmail === "ngrant@pathfinderinspections.com"
  );
}

function mapInventoryUserYards(rows: any[]): InventoryUserYard[] {
  return (rows ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id ?? row.userId ?? "",
    yardId: row.yard_id ?? row.yardId ?? "",
  }));
}

function mapUserModulePermissions(rows: any[]): UserModulePermission[] {
  return (rows ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id ?? row.userId ?? "",
    moduleKey: row.module_key ?? row.moduleKey,
    canAccess: row.can_access !== false,
  }));
}

function mapEmailNotificationTypes(rows: any[]): EmailNotificationType[] {
  return (rows ?? []).map((row: any) => ({
    id: row.id,
    notificationKey: row.notification_key ?? row.notificationKey ?? "",
    name: row.name ?? "",
    description: row.description ?? "",
    isActive: row.is_active !== false && row.isActive !== false,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
  }));
}

function mapEmailNotificationRecipients(rows: any[]): EmailNotificationRecipient[] {
  return (rows ?? []).map((row: any) => ({
    id: row.id,
    notificationTypeId: row.notification_type_id ?? row.notificationTypeId ?? "",
    userId: row.user_id ?? row.userId ?? "",
    enabled: row.enabled !== false,
  }));
}

function mapEmailNotificationUsers(rows: any[]): EmailNotificationUser[] {
  return (rows ?? []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name ?? row.fullName ?? "",
    email: row.email ?? "",
    role: row.role ?? "",
  }));
}

export default function AdminPage() {
  const [activeControl, setActiveControl] = useState<AdminControlKey | "">("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [inventoryUserYards, setInventoryUserYards] = useState<InventoryUserYard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState("");
  const [racks, setRacks] = useState<Rack[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [partNumbers, setPartNumbers] = useState<PartNumber[]>([]);
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>(defaultInventoryOptions);

  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [userForm, setUserForm] = useState<AdminUserForm>(emptyUserForm);
  const [rackForm, setRackForm] = useState(emptyRackForm);
  const [zoneForm, setZoneForm] = useState(emptyZoneForm);
  const [partForm, setPartForm] = useState(emptyPartForm);
  const [inspectorForm, setInspectorForm] = useState(emptyInspectorForm);
  const [optionForm, setOptionForm] = useState(emptyOptionForm);
  const [selectedRackIds, setSelectedRackIds] = useState<string[]>([]);
  const [yardAccessUserId, setYardAccessUserId] = useState("");
  const [yardAccessSelection, setYardAccessSelection] = useState<string[]>([]);
  const [newUserYardSelection, setNewUserYardSelection] = useState<string[]>([]);
  const [userModulePermissions, setUserModulePermissions] = useState<UserModulePermission[]>([]);
  const [moduleAccessUserId, setModuleAccessUserId] = useState("");
  const [moduleAccessSelection, setModuleAccessSelection] = useState<ModuleKey[]>([]);
  const [newUserModuleSelection, setNewUserModuleSelection] = useState<ModuleKey[]>([]);
  const [permissionRolePreview, setPermissionRolePreview] = useState<RoleKey>("admin");
  const [editableRolePermissions, setEditableRolePermissions] = useState(() =>
    getDefaultPermissionsForRole("admin")
  );
  const [emailNotificationTypes, setEmailNotificationTypes] = useState<EmailNotificationType[]>([]);
  const [emailNotificationRecipients, setEmailNotificationRecipients] = useState<EmailNotificationRecipient[]>([]);
  const [emailNotificationUsers, setEmailNotificationUsers] = useState<EmailNotificationUser[]>([]);

  const [message, setMessage] = useState("Loading admin tools...");
  const [loading, setLoading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("User");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");

  const activeCompanies = useMemo(
    () => companies.filter((company) => company.isActive),
    [companies]
  );

  const statusOptions = useMemo(
    () => inventoryOptions.filter((option) => option.optionType === "status"),
    [inventoryOptions]
  );

  const conditionOptions = useMemo(
    () => inventoryOptions.filter((option) => option.optionType === "condition"),
    [inventoryOptions]
  );

  const yardAccessUsers = useMemo(
    () =>
      profiles.filter((profile) =>
        canAssignInventoryYards(profile.role)
      ),
    [profiles]
  );

  const selectedYardAccessUser = useMemo(
    () => yardAccessUsers.find((profile) => profile.id === yardAccessUserId) || null,
    [yardAccessUsers, yardAccessUserId]
  );

  const moduleAccessUsers = useMemo(
    () => profiles.filter((profile) => profile.role !== "customer"),
    [profiles]
  );

  const selectedModuleAccessUser = useMemo(
    () => moduleAccessUsers.find((profile) => profile.id === moduleAccessUserId) || null,
    [moduleAccessUsers, moduleAccessUserId]
  );

  const rolePermissionPreview = useMemo(
    () => getDefaultPermissionsForRole(permissionRolePreview),
    [permissionRolePreview]
  );

  const canOpenPoApprovalMatrix = useMemo(
    () => canManagePoApprovalMatrix(currentUserName, currentUserEmail, currentUserRole),
    [currentUserEmail, currentUserName, currentUserRole]
  );

  const visibleAdminControls = useMemo(
    () => adminControls.filter((control) => control.key !== "po-approval-matrix" || canOpenPoApprovalMatrix),
    [canOpenPoApprovalMatrix]
  );

  const visibleActiveControl = activeControl === "po-approval-matrix" && !canOpenPoApprovalMatrix ? "" : activeControl;

  const visibleActiveControlDetails = useMemo(
    () => adminControls.find((control) => control.key === visibleActiveControl) || null,
    [visibleActiveControl]
  );

  useEffect(() => {
    setEditableRolePermissions(rolePermissionPreview);
  }, [rolePermissionPreview]);

  function readControlFromUrl() {
    const control = new URLSearchParams(window.location.search).get("control") || "";
    return isAdminControlKey(control) ? control : "";
  }

  function openAdminControl(control: AdminControlKey) {
    setActiveControl(control);
    const url = new URL(window.location.href);
    url.searchParams.set("control", control);
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeAdminControl() {
    setActiveControl("");
    const url = new URL(window.location.href);
    url.searchParams.delete("control");
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function adminControlStat(control: AdminControlKey) {
    if (control === "create-company") return `${activeCompanies.length} active`;
    if (control === "companies") return `${companies.length} companies`;
    if (control === "create-user") return `${profiles.length} users`;
    if (control === "users") return `${profiles.length} users`;
    if (control === "yard-access") return `${yards.length} yards`;
    if (control === "permissions") return `${moduleAccessOptions.length} screens`;
    if (control === "email-notifications") return `${emailNotificationTypes.length} notice types`;
    if (control === "po-approval-matrix") return "Routing rules";
    if (control === "inspectors") return `${inspectors.length} inspectors`;
    if (control === "part-numbers") return `${partNumbers.length} parts`;
    if (control === "status-condition") return `${inventoryOptions.length} options`;
    if (control === "yard-setup") return `${racks.length} racks / ${zones.length} zones`;
    return "";
  }

  function adminControlCardStat(control: AdminControlCard) {
    return adminControlStat(control.key);
  }

  function toggleRolePermission(moduleKey: PermissionModuleKey, action: PermissionAction) {
    setEditableRolePermissions((currentPermissions) => ({
      ...currentPermissions,
      [moduleKey]: {
        ...currentPermissions[moduleKey],
        [action]: !currentPermissions[moduleKey][action],
      },
    }));
  }

  function savePermissionMatrixPreview() {
    console.log("TITAN permission matrix preview", {
      role: permissionRolePreview,
      permissions: editableRolePermissions,
    });
    setMessage("Permission matrix logged to console. Database save is not connected yet.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function loadAdmin() {
    setMessage("Loading admin tools...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "employee", "owner"].includes(profile.role)) {
      setMessage("You do not have access to admin tools.");
      return;
    }

    setCurrentUserName(profile.full_name || user.email || "User");
    setCurrentUserEmail(user.email || "");
    setCurrentUserRole(profile.role || "");
    await Promise.all([
      loadCompanies(),
      loadProfiles(),
      loadYards(),
      loadPartNumbers(),
      loadInspectors(),
      loadInventoryOptions(),
      loadModulePermissions(),
      loadEmailNotifications(),
    ]);
    setMessage((current) => (current === "Loading admin tools..." ? "" : current));
  }

  async function loadCompanies() {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, account_number, logo_url, is_active")
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Companies failed: ${error.message}`);
      return;
    }

    setCompanies(
      (data ?? []).map((company: any) => ({
        id: company.id,
        name: company.name ?? "",
        accountNumber: company.account_number ?? "",
        logoUrl: company.logo_url ?? "",
        isActive: company.is_active !== false,
      }))
    );
  }

  async function loadProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, company_id, companies(name)")
      .order("full_name", { ascending: true });

    if (error) {
      setMessage(`Users failed: ${error.message}`);
      return;
    }

    setProfiles(
      (data ?? []).map((profile: any) => ({
        id: profile.id,
        fullName: profile.full_name ?? "",
        role: profile.role ?? "customer",
        companyId: profile.company_id ?? "",
        companyName: getCompanyName(profile.companies),
      }))
    );
  }

  async function loadYards() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (token) {
      const response = await fetch("/api/admin-inventory-yards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "list" }),
      }).catch(() => null);

      if (response?.ok) {
        const result = await response.json();
        const mapped = sortInventoryYards((result.yards ?? []).map((yard: any) => ({
          id: yard.id,
          name: yard.name ?? "",
          code: yard.code ?? "",
        })));

        setYards(mapped);
        setInventoryUserYards(mapInventoryUserYards(result.assignments ?? []));

        if (result.setupRequired) {
          setMessage(result.setupMessage || inventoryYardSetupMessage);
        }

        const selectedStillExists = mapped.some((yard) => yard.id === selectedYardId);
        const nextYardId = selectedStillExists
          ? selectedYardId
          : mapped.find((yard) => yard.code === "PIFS")?.id || mapped[0]?.id || "";
        setSelectedYardId(nextYardId);

        if (nextYardId) {
          await Promise.all([loadRacks(nextYardId), loadZones(nextYardId)]);
        }

        return;
      }
    }

    const { data, error } = await supabase
      .from("yards")
      .select("id, name, code");

    if (error) {
      setMessage(`Yards failed: ${error.message}`);
      return;
    }

    const mapped = sortInventoryYards((data ?? []).map((yard: any) => ({
      id: yard.id,
      name: yard.name ?? "",
      code: yard.code ?? "",
    })));

    setYards(mapped);

    const selectedStillExists = mapped.some((yard) => yard.id === selectedYardId);
    const nextYardId = selectedStillExists
      ? selectedYardId
      : mapped.find((yard) => yard.code === "PIFS")?.id || mapped[0]?.id || "";
    setSelectedYardId(nextYardId);

    if (nextYardId) {
      await Promise.all([loadRacks(nextYardId), loadZones(nextYardId)]);
    }
  }

  async function loadInventoryUserYards() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setInventoryUserYards([]);
      return;
    }

    const response = await fetch("/api/admin-inventory-yards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "list" }),
    }).catch(() => null);

    if (!response) {
      setInventoryUserYards([]);
      setMessage("Yard access failed: Could not reach the yard access service.");
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      setInventoryUserYards([]);
      setMessage(result.error || result.setupMessage || "Yard access failed.");
      return;
    }

    if (result.yards) {
      setYards(sortInventoryYards((result.yards ?? []).map((yard: any) => ({
        id: yard.id,
        name: yard.name ?? "",
        code: yard.code ?? "",
      }))));
    }

    if (result.setupRequired) {
      setMessage(result.setupMessage || inventoryYardSetupMessage);
    }

    setInventoryUserYards(mapInventoryUserYards(result.assignments ?? []));
  }

  async function loadModulePermissions() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setUserModulePermissions([]);
      return;
    }

    const response = await fetch("/api/admin-module-permissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "list" }),
    }).catch(() => null);

    if (!response) {
      setUserModulePermissions([]);
      setMessage("Screen permissions failed: Could not reach the permission service.");
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      setUserModulePermissions([]);
      setMessage(result.error || result.setupMessage || "Screen permissions failed.");
      return;
    }

    if (result.setupRequired) {
      setMessage(result.setupMessage || modulePermissionSetupMessage);
    }

    setUserModulePermissions(mapUserModulePermissions(result.permissions ?? []));
  }

  async function loadEmailNotifications() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setEmailNotificationTypes([]);
      setEmailNotificationRecipients([]);
      setEmailNotificationUsers([]);
      return;
    }

    const response = await fetch("/api/admin-email-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "list" }),
    }).catch(() => null);

    if (!response) {
      setEmailNotificationTypes([]);
      setEmailNotificationRecipients([]);
      setEmailNotificationUsers([]);
      setMessage("Email notification settings failed: Could not reach the notification service.");
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      setEmailNotificationTypes([]);
      setEmailNotificationRecipients([]);
      setEmailNotificationUsers([]);
      setMessage(result.error || result.setupMessage || "Email notification settings failed.");
      return;
    }

    if (result.setupRequired) {
      setMessage(result.setupMessage || emailNotificationSetupMessage);
    }

    setEmailNotificationTypes(mapEmailNotificationTypes(result.notificationTypes ?? []));
    setEmailNotificationRecipients(mapEmailNotificationRecipients(result.notificationRecipients ?? []));
    setEmailNotificationUsers(mapEmailNotificationUsers(result.users ?? []));
  }

  function emailRecipientIdsForType(notificationTypeId: string) {
    return emailNotificationRecipients
      .filter((recipient) => recipient.notificationTypeId === notificationTypeId && recipient.enabled)
      .map((recipient) => recipient.userId);
  }

  function toggleEmailNotificationRecipient(notificationTypeId: string, userId: string) {
    setEmailNotificationRecipients((current) => {
      const exists = current.some(
        (recipient) =>
          recipient.notificationTypeId === notificationTypeId && recipient.userId === userId
      );

      if (exists) {
        return current.filter(
          (recipient) =>
            !(
              recipient.notificationTypeId === notificationTypeId &&
              recipient.userId === userId
            )
        );
      }

      return [
        ...current,
        {
          id: `local-${notificationTypeId}-${userId}`,
          notificationTypeId,
          userId,
          enabled: true,
        },
      ];
    });
  }

  async function saveEmailNotificationRecipients(notificationTypeId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage("You must be signed in to save email notification settings.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin-email-notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "save-recipients",
          notificationTypeId,
          userIds: emailRecipientIdsForType(notificationTypeId),
        }),
      });
      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || result.setupMessage || "Email notification settings failed.");
      }

      setEmailNotificationTypes(mapEmailNotificationTypes(result.notificationTypes ?? []));
      setEmailNotificationRecipients(mapEmailNotificationRecipients(result.notificationRecipients ?? []));
      setEmailNotificationUsers(mapEmailNotificationUsers(result.users ?? []));
      setMessage("Email notification recipients saved.");
    } catch (error: any) {
      setMessage(`Email notification save failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadRacks(yardId = selectedYardId) {
    if (!yardId) return;

    const { data, error } = await supabase
      .from("racks")
      .select("id, rack_code, capacity_joints, sort_order, is_active")
      .eq("yard_id", yardId)
      .order("sort_order", { ascending: true });

    if (error) {
      setMessage(`Racks failed: ${error.message}`);
      return;
    }

    const mappedRacks = (data ?? []).map((rack: any) => ({
      id: rack.id,
      rackCode: rack.rack_code ?? "",
      capacityJoints: Number(rack.capacity_joints ?? 500),
      sortOrder: Number(rack.sort_order ?? 0),
      isActive: rack.is_active !== false,
    }));

    setRacks(mappedRacks);
    setSelectedRackIds((current) =>
      current.filter((id) => mappedRacks.some((rack: Rack) => rack.id === id))
    );
  }

  async function loadZones(yardId = selectedYardId) {
    if (!yardId) return;

    const { data, error } = await supabase
      .from("workflow_zones")
      .select("id, name, code, sort_order, is_active")
      .eq("yard_id", yardId)
      .order("sort_order", { ascending: true });

    if (error) {
      setMessage(`Work zones failed: ${error.message}`);
      return;
    }

    setZones(
      (data ?? []).map((zone: any) => ({
        id: zone.id,
        name: zone.name ?? "",
        code: zone.code ?? "",
        sortOrder: Number(zone.sort_order ?? 0),
        isActive: zone.is_active !== false,
      }))
    );
  }

  async function refreshAdmin() {
    await Promise.all([
      loadCompanies(),
      loadProfiles(),
      loadYards(),
      loadPartNumbers(),
      loadInspectors(),
      loadInventoryOptions(),
      loadModulePermissions(),
      loadEmailNotifications(),
    ]);
    setMessage("Admin tools refreshed.");
  }

  async function loadInventoryOptions() {
    const { data, error } = await supabase
      .from("inventory_options")
      .select("id, option_type, label, sort_order, is_active")
      .order("option_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

    if (error) {
      setInventoryOptions(defaultInventoryOptions);
      return;
    }

    const mapped = (data ?? []).map((option: any) => ({
      id: option.id,
      optionType: option.option_type as InventoryOptionType,
      label: option.label ?? "",
      sortOrder: Number(option.sort_order ?? 0),
      isActive: option.is_active !== false,
    })).filter((option: InventoryOption) => option.label && option.isActive);

    setInventoryOptions(mapped.length > 0 ? mapped : defaultInventoryOptions);
  }

  async function saveInventoryOption() {
    const label = optionForm.label.trim();

    if (!label) {
      setMessage("Option label is required.");
      return;
    }

    setMessage("");
    setLoading(true);

    const payload = {
      option_type: optionForm.optionType,
      label,
      sort_order: inventoryOptions.filter((option) => option.optionType === optionForm.optionType).length + 1,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = optionForm.id && !optionForm.id.startsWith("default-")
      ? await supabase.from("inventory_options").update(payload).eq("id", optionForm.id)
      : await supabase.from("inventory_options").insert(payload);

    if (error) {
      setMessage(`Option save failed: ${error.message}`);
      setLoading(false);
      return;
    }

    setOptionForm(emptyOptionForm);
    await loadInventoryOptions();
    setMessage("Status/condition option saved.");
    setLoading(false);
  }

  function editInventoryOption(option: InventoryOption) {
    setOptionForm({
      id: option.id,
      optionType: option.optionType,
      label: option.label,
    });
  }

  async function deleteInventoryOption(option: InventoryOption) {
    const confirmed = window.confirm(`Delete ${option.label}? Existing inventory keeps the saved text, but this removes it from dropdowns.`);
    if (!confirmed) return;

    setMessage("");
    setLoading(true);

    if (option.id.startsWith("default-")) {
      setInventoryOptions((current) => current.filter((item) => item.id !== option.id));
      setLoading(false);
      setMessage("Default option hidden for this session. Save custom options in Supabase for permanent changes.");
      return;
    }

    const { error } = await supabase.from("inventory_options").delete().eq("id", option.id);

    if (error) {
      setMessage(`Option delete failed: ${error.message}`);
      setLoading(false);
      return;
    }

    if (optionForm.id === option.id) setOptionForm(emptyOptionForm);
    await loadInventoryOptions();
    setMessage("Status/condition option deleted.");
    setLoading(false);
  }

  async function loadInspectors() {
    const { data, error } = await supabase
      .from("inspectors")
      .select("id, full_name, role, is_active")
      .order("full_name", { ascending: true });

    if (error) {
      setMessage(`Inspectors failed: ${error.message}`);
      return;
    }

    setInspectors(
      (data ?? []).map((inspector: any) => ({
        id: inspector.id,
        fullName: inspector.full_name ?? "",
        role: (inspector.role ?? "lead_inspector") as InspectorRole,
        isActive: Boolean(inspector.is_active),
      }))
    );
  }

  async function saveInspector() {
    if (!inspectorForm.fullName.trim()) {
      setMessage("Inspector name is required.");
      return;
    }

    setMessage("");
    setLoading(true);

    const payload = {
      full_name: inspectorForm.fullName.trim(),
      role: inspectorForm.role,
      updated_at: new Date().toISOString(),
    };

    const { error } = inspectorForm.id
      ? await supabase.from("inspectors").update(payload).eq("id", inspectorForm.id)
      : await supabase.from("inspectors").insert(payload);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setInspectorForm(emptyInspectorForm);
    await loadInspectors();
    setMessage(inspectorForm.id ? "Inspector updated." : "Inspector created.");
    setLoading(false);
  }

  function editInspector(inspector: Inspector) {
    setInspectorForm({
      id: inspector.id,
      fullName: inspector.fullName,
      role: inspector.role,
    });
  }

  async function toggleInspector(inspector: Inspector) {
    setMessage("");
    setLoading(true);

    const { error } = await supabase
      .from("inspectors")
      .update({ is_active: !inspector.isActive, updated_at: new Date().toISOString() })
      .eq("id", inspector.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await loadInspectors();
    setMessage(`${inspector.fullName} ${inspector.isActive ? "disabled" : "enabled"}.`);
    setLoading(false);
  }

  async function deleteInspector(inspector: Inspector) {
    const confirmed = window.confirm(`Delete inspector ${inspector.fullName}? Existing DTI jobs will keep the saved name.`);
    if (!confirmed) return;

    setMessage("");
    setLoading(true);

    const { error } = await supabase.from("inspectors").delete().eq("id", inspector.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (inspectorForm.id === inspector.id) setInspectorForm(emptyInspectorForm);
    await loadInspectors();
    setMessage("Inspector deleted.");
    setLoading(false);
  }

  async function loadPartNumbers() {
    const { data, error } = await supabase
      .from("part_numbers")
      .select("id, company_id, part_number, description, size, grade, connection, pipe_range, companies(name)")
      .order("part_number", { ascending: true });

    if (error) {
      setMessage(`Part numbers failed: ${error.message}`);
      return;
    }

    setPartNumbers(
      (data ?? []).map((part: any) => {
        const company = Array.isArray(part.companies) ? part.companies[0] : part.companies;

        return {
          id: part.id,
          companyId: part.company_id ?? "",
          companyName: company?.name ?? "Global",
          partNumber: part.part_number ?? "",
          description: part.description ?? "",
          size: part.size ?? "",
          grade: part.grade ?? "",
          connection: part.connection ?? "",
          pipeRange: normalizePipeRange(part.pipe_range),
        };
      })
    );
  }

  async function savePartNumber() {
    setMessage("");

    if (!partForm.partNumber.trim()) {
      setMessage("Part number is required.");
      return;
    }

    setLoading(true);

    const payload = {
      company_id: partForm.companyId || null,
      part_number: partForm.partNumber.trim(),
      description: partForm.description.trim() || null,
      size: partForm.size.trim() || null,
      grade: partForm.grade.trim() || null,
      connection: partForm.connection.trim() || null,
      pipe_range: partForm.pipeRange,
    };

    let error;

    if (partForm.id) {
      ({ error } = await supabase.from("part_numbers").update(payload).eq("id", partForm.id));
    } else {
      const duplicateQuery = supabase
        .from("part_numbers")
        .select("id")
        .eq("part_number", payload.part_number)
        .limit(1);

      if (payload.company_id) {
        duplicateQuery.eq("company_id", payload.company_id);
      } else {
        duplicateQuery.is("company_id", null);
      }

      const { data: duplicate, error: duplicateError } = await duplicateQuery;

      if (duplicateError) {
        setMessage(duplicateError.message);
        setLoading(false);
        return;
      }

      if (duplicate && duplicate.length > 0) {
        setMessage("That part number already exists for this company.");
        setLoading(false);
        return;
      }

      ({ error } = await supabase.from("part_numbers").insert(payload));
    }

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setPartForm(emptyPartForm);
    await loadPartNumbers();
    setMessage(partForm.id ? "Part number updated." : "Part number created.");
    setLoading(false);
  }

  function editPartNumber(part: PartNumber) {
    setPartForm({
      id: part.id,
      companyId: part.companyId,
      partNumber: part.partNumber,
      description: part.description,
      size: part.size,
      grade: part.grade,
      connection: part.connection,
      pipeRange: part.pipeRange,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deletePartNumber(part: PartNumber) {
    const confirmed = window.confirm(`Delete saved part number ${part.partNumber}?`);
    if (!confirmed) return;

    setMessage("");
    setLoading(true);

    const { error } = await supabase.from("part_numbers").delete().eq("id", part.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (partForm.id === part.id) setPartForm(emptyPartForm);
    await loadPartNumbers();
    setMessage("Part number deleted.");
    setLoading(false);
  }

  async function createCompany() {
    setMessage("");

    if (!companyForm.name.trim()) {
      setMessage("Company name is required.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("companies").insert({
      name: companyForm.name.trim(),
      account_number: companyForm.accountNumber.trim() || null,
      is_active: true,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setCompanyForm(emptyCompanyForm);
    await loadCompanies();
    setMessage("Company created.");
    setLoading(false);
  }

  async function updateCompany(company: Company, changes: Partial<Company>) {
    setMessage("");
    setLoading(true);

    const { error } = await supabase
      .from("companies")
      .update({
        name: changes.name ?? company.name,
        account_number: changes.accountNumber ?? company.accountNumber,
        logo_url: changes.logoUrl ?? company.logoUrl,
        is_active: changes.isActive ?? company.isActive,
      })
      .eq("id", company.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await loadCompanies();
    await loadProfiles();
    setMessage("Company updated.");
    setLoading(false);
  }

  async function uploadCompanyLogo(company: Company, file: File | null) {
    setMessage("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Company logo must be an image file.");
      return;
    }

    setLoading(true);

    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const cleanCompanyName = makeCode(company.name) || company.id;
    const filePath = `${company.id}/${cleanCompanyName}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(companyLogoBucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      setMessage(`Logo upload failed: ${uploadError.message}`);
      setLoading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from(companyLogoBucket)
      .getPublicUrl(filePath);

    const logoUrl = publicUrlData.publicUrl;

    if (!logoUrl) {
      setMessage("Logo uploaded, but no public URL was returned.");
      setLoading(false);
      return;
    }

    await updateCompany(company, { logoUrl });
    setMessage(`Logo saved for ${company.name}.`);
    setLoading(false);
  }

  async function removeCompanyLogo(company: Company) {
    await updateCompany(company, { logoUrl: "" });
    setMessage(`Logo removed for ${company.name}.`);
  }

  async function createUser() {
    setMessage("");

    if (!userForm.email || !userForm.fullName) {
      setMessage("Email and full name are required.");
      return;
    }

    if (userForm.role === "customer" && !userForm.companyId) {
      setMessage("Customer users must be assigned to a company.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/admin-users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...userForm,
        yardIds: canAssignInventoryYards(userForm.role) ? newUserYardSelection : [],
        moduleKeys: userForm.role === "customer" ? [] : newUserModuleSelection,
      }),
    });

    const result = await response.json();
    const resultError =
      typeof result.error === "string"
        ? result.error
        : result.error
          ? JSON.stringify(result.error)
          : "";

    if (!response.ok) {
      setMessage(resultError || "Could not create user.");
      setLoading(false);
      return;
    }

    setUserForm(emptyUserForm);
    setNewUserYardSelection([]);
    setNewUserModuleSelection([]);
    await Promise.all([
      loadProfiles(),
      loadInventoryUserYards(),
      loadModulePermissions(),
      loadEmailNotifications(),
    ]);
    setMessage(result.warning || `User created and login email sent: ${result.email}`);
    setLoading(false);
  }

  async function updateProfile(profile: Profile, changes: Partial<Profile>) {
    setMessage("");
    setLoading(true);

    const nextRole = changes.role ?? profile.role;
    const nextCompanyId = nextRole === "customer" ? changes.companyId ?? profile.companyId : null;

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: changes.fullName ?? profile.fullName,
        role: nextRole,
        company_id: nextCompanyId || null,
      })
      .eq("id", profile.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await loadProfiles();
    setMessage("User profile updated.");
    setLoading(false);
  }

  function openYardAccess(profileId: string) {
    setYardAccessUserId(profileId);
    setYardAccessSelection(
      inventoryUserYards
        .filter((assignment) => assignment.userId === profileId)
        .map((assignment) => assignment.yardId)
    );
  }

  function permissionsForProfile(profile: Profile) {
    const explicitPermissions = userModulePermissions
      .filter((permission) => permission.userId === profile.id && permission.canAccess)
      .map((permission) => permission.moduleKey);

    return explicitPermissions.length > 0
      ? explicitPermissions
      : defaultModulesForRole(profile.role);
  }

  function openModuleAccess(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    setModuleAccessUserId(profileId);
    setModuleAccessSelection(profile ? permissionsForProfile(profile) : []);
  }

  function toggleModuleAccess(moduleKey: ModuleKey) {
    setModuleAccessSelection((current) =>
      current.includes(moduleKey)
        ? current.filter((key) => key !== moduleKey)
        : [...current, moduleKey]
    );
  }

  async function saveModuleAccess() {
    if (!moduleAccessUserId) {
      setMessage("Select a user before saving screen permissions.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage("Screen permissions failed: Sign in again before saving permissions.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin-module-permissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "save-user-modules",
        userId: moduleAccessUserId,
        moduleKeys: moduleAccessSelection,
      }),
    }).catch(() => null);

    if (!response) {
      setMessage("Screen permissions failed: Could not reach the permission service.");
      setLoading(false);
      return;
    }

    const result = await response.json();

    if (!response.ok || result.error) {
      setUserModulePermissions(mapUserModulePermissions(result.permissions ?? []));
      setMessage(result.error || result.setupMessage || "Screen permissions failed.");
      setLoading(false);
      return;
    }

    setUserModulePermissions(mapUserModulePermissions(result.permissions ?? []));
    setMessage(`Screen permissions saved for ${selectedModuleAccessUser?.fullName || "user"}.`);
    setLoading(false);
  }

  function toggleYardAccess(yardId: string) {
    setYardAccessSelection((current) =>
      current.includes(yardId)
        ? current.filter((id) => id !== yardId)
        : [...current, yardId]
    );
  }

  async function saveYardAccess() {
    if (!yardAccessUserId) {
      setMessage("Select a user before saving yard access.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage("Yard access failed: Sign in again before saving yard access.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin-inventory-yards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "save-user-yards",
        userId: yardAccessUserId,
        yardIds: yardAccessSelection,
      }),
    }).catch(() => null);

    if (!response) {
      setMessage("Yard access failed: Could not reach the yard access service.");
      setLoading(false);
      return;
    }

    const result = await response.json();

    if (!response.ok || result.error) {
      setInventoryUserYards(mapInventoryUserYards(result.assignments ?? []));
      setMessage(result.error || result.setupMessage || "Yard access failed.");
      setLoading(false);
      return;
    }

    setInventoryUserYards(mapInventoryUserYards(result.assignments ?? []));
    setMessage(`Yard access saved for ${selectedYardAccessUser?.fullName || "user"}.`);
    setLoading(false);
  }

  async function createRack() {
    setMessage("");

    if (!selectedYardId || !rackForm.rackCode.trim()) {
      setMessage("Rack name is required.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("racks").insert({
      yard_id: selectedYardId,
      rack_code: rackForm.rackCode.trim(),
      capacity_joints: Number(rackForm.capacityJoints || 500),
      sort_order: Number(rackForm.sortOrder || 0),
      is_active: true,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setRackForm(emptyRackForm);
    await loadRacks();
    setMessage("Rack created.");
    setLoading(false);
  }

  async function updateRack(rack: Rack, changes: Partial<Rack>) {
    setMessage("");
    setLoading(true);

    const { error } = await supabase
      .from("racks")
      .update({
        rack_code: changes.rackCode ?? rack.rackCode,
        capacity_joints: changes.capacityJoints ?? rack.capacityJoints,
        sort_order: changes.sortOrder ?? rack.sortOrder,
        is_active: changes.isActive ?? rack.isActive,
      })
      .eq("id", rack.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await loadRacks();
    setMessage("Rack updated.");
    setLoading(false);
  }

  function toggleRackSelection(id: string) {
    setSelectedRackIds((current) =>
      current.includes(id) ? current.filter((rackId) => rackId !== id) : [...current, id]
    );
  }

  function toggleAllRackSelection() {
    setSelectedRackIds((current) =>
      current.length === racks.length ? [] : racks.map((rack) => rack.id)
    );
  }

  async function deleteSelectedRacks() {
    if (selectedRackIds.length === 0) {
      setMessage("Select at least one rack to delete.");
      return;
    }

    const deleteCount = selectedRackIds.length;
    const confirmed = window.confirm(
      `Delete ${deleteCount} selected rack${deleteCount === 1 ? "" : "s"}? This cannot be undone.`
    );

    if (!confirmed) return;

    setMessage("");
    setLoading(true);

    const { error } = await supabase
      .from("racks")
      .delete()
      .in("id", selectedRackIds);

    if (error) {
      setMessage(`Rack delete failed: ${error.message}`);
      setLoading(false);
      return;
    }

    setSelectedRackIds([]);
    await loadRacks();
    setMessage(`${deleteCount} rack${deleteCount === 1 ? "" : "s"} deleted.`);
    setLoading(false);
  }

  async function createZone() {
    setMessage("");

    if (!selectedYardId || !zoneForm.name.trim()) {
      setMessage("Work zone name is required.");
      return;
    }

    const code = zoneForm.code.trim() || makeCode(zoneForm.name);

    if (!code) {
      setMessage("Work zone code is required.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("workflow_zones").insert({
      yard_id: selectedYardId,
      name: zoneForm.name.trim(),
      code,
      sort_order: Number(zoneForm.sortOrder || 0),
      is_active: true,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setZoneForm(emptyZoneForm);
    await loadZones();
    setMessage("Work zone created.");
    setLoading(false);
  }

  async function updateZone(zone: Zone, changes: Partial<Zone>) {
    setMessage("");
    setLoading(true);

    const { error } = await supabase
      .from("workflow_zones")
      .update({
        name: changes.name ?? zone.name,
        code: changes.code ?? zone.code,
        sort_order: changes.sortOrder ?? zone.sortOrder,
        is_active: changes.isActive ?? zone.isActive,
      })
      .eq("id", zone.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await loadZones();
    setMessage("Work zone updated.");
    setLoading(false);
  }

  useEffect(() => {
    const syncControlFromUrl = () => {
      setActiveControl(readControlFromUrl());
    };

    window.setTimeout(syncControlFromUrl, 0);
    window.setTimeout(() => {
      void loadAdmin();
    }, 0);
    window.addEventListener("popstate", syncControlFromUrl);
    return () => window.removeEventListener("popstate", syncControlFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showPageMessage = shouldShowPageMessage(message);

  return (
    <main className={`customer-shell ${styles.scope}`} data-active-control={visibleActiveControl || "home"}>
      <header className="customer-topbar">
        <button className="brand brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">TITAN Admin</div>
            <div className="brand-subtitle">Companies, users, racks, and work zones</div>
          </div>
        </button>

        <div className="customer-actions">
          <button className="button" onClick={refreshAdmin} disabled={loading}>
            Refresh
          </button>
          <button className="button" onClick={() => (window.location.href = "/")}>
            Yard View
          </button>
          <button className="button" onClick={() => setPasswordOpen(true)}>
            Change Password
          </button>
          <button className="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      {showPageMessage && <div className="modal-message">{message}</div>}

      <section className="customer-welcome">
        <span>{visibleActiveControlDetails ? "Admin Control" : "Welcome"}</span>
        <h1>{visibleActiveControlDetails?.title || currentUserName}</h1>
        <p>
          {visibleActiveControlDetails?.description ||
            "Choose one admin control below. Each area opens on its own focused page so you are not fighting one giant scrolling admin screen."}
        </p>
      </section>

      {!visibleActiveControl && (
        <section className="admin-control-launch-grid">
          {visibleAdminControls.map((control) => (
            <button
              key={control.key}
              type="button"
              className="ticket-card admin-control-launch-card"
              onClick={() => openAdminControl(control.key)}
            >
              <span>{control.group}</span>
              <strong>{control.title}</strong>
              <p>{control.description}</p>
              <small>{adminControlCardStat(control)}</small>
            </button>
          ))}
        </section>
      )}

      {visibleActiveControlDetails && (
        <section className="ticket-card admin-active-control-bar">
          <button className="button" type="button" onClick={closeAdminControl}>
            Back to Admin Controls
          </button>
          <div>
            <strong>{visibleActiveControlDetails.title}</strong>
            <span>{visibleActiveControlDetails.group}</span>
          </div>
        </section>
      )}

      <section className="admin-grid">
        <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="create-company" open={activeControl === "create-company"}>
          <summary>
            <h3>Create Company</h3>
            <span>Open / close</span>
          </summary>
          <div className="admin-collapsible-body">

          <label>
            Company Name
            <input
              value={companyForm.name}
              onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })}
              placeholder="CP Energy"
            />
          </label>

          <label>
            Account Number
            <input
              value={companyForm.accountNumber}
              onChange={(event) => setCompanyForm({ ...companyForm, accountNumber: event.target.value })}
              placeholder="Optional"
            />
          </label>

          <button className="button primary" onClick={createCompany} disabled={loading}>
            Save Company
          </button>
          </div>
        </details>

        <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="create-user" open={activeControl === "create-user"}>
          <summary>
            <h3>Create User</h3>
            <span>Open / close</span>
          </summary>
          <div className="admin-collapsible-body">

          <label>
            Full Name
            <input
              value={userForm.fullName}
              onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })}
              placeholder="Customer Name"
            />
          </label>

          <label>
            Email
            <input
              value={userForm.email}
              onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
              placeholder="customer@company.com"
            />
          </label>

          <label>
            Temporary Password (optional)
            <input
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
              placeholder="Leave blank to let user set password"
            />
          </label>

          <label>
            Role
            <select
              value={userForm.role}
              onChange={(event) => {
                const nextRole = event.target.value as AdminUserForm["role"];
                if (!canAssignInventoryYards(nextRole)) {
                  setNewUserYardSelection([]);
                }
                setNewUserModuleSelection(
                  nextRole === "customer" ? [] : defaultModulesForRole(nextRole)
                );

                setUserForm({
                  ...userForm,
                  role: nextRole,
                  companyId: nextRole === "customer" ? userForm.companyId : "",
                });
              }}
            >
              <option value="customer">Customer</option>
              <option value="sales">Sales</option>
              <option value="service_line_manager">Service Line Manager</option>
              <option value="dti_superintendent">DTI Superintendent</option>
              <option value="dti_lead">DTI Lead</option>
              <option value="dti_inspector">DTI Inspector</option>
              <option value="level_2_inspector">Level 2 Inspector</option>
              <option value="hardband_lead">Hardband Lead</option>
              <option value="cdt_lead">CDT Lead</option>
              <option value="inventory_specialist">Inventory Specialist</option>
              <option value="inventory_manager">Inventory Manager</option>
              <option value="operator">Hardband Operator</option>
              <option value="owner">Owner</option>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          {userForm.role === "customer" && (
            <label>
              Company
              <select
                value={userForm.companyId}
                onChange={(event) => setUserForm({ ...userForm, companyId: event.target.value })}
              >
                <option value="">Select company</option>
                {activeCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {canAssignInventoryYards(userForm.role) && (
            <div className="create-user-yard-box">
              <div className="admin-section-title compact-title">
                <div>
                  <h4>Inventory / PO Yard Access</h4>
                  <p>Choose the yard or yards this user can work in.</p>
                </div>
              </div>

              <div className="yard-access-grid">
                {yards.map((yard) => (
                  <label key={yard.id} className="yard-access-card">
                    <input
                      type="checkbox"
                      checked={newUserYardSelection.includes(yard.id)}
                      onChange={() =>
                        setNewUserYardSelection((current) =>
                          current.includes(yard.id)
                            ? current.filter((id) => id !== yard.id)
                            : [...current, yard.id]
                        )
                      }
                    />
                    <span>
                      <strong>{yard.name}</strong>
                      <small>{yard.code}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="yard-access-actions">
                <button
                  className="button"
                  onClick={() => setNewUserYardSelection(yards.map((yard) => yard.id))}
                  disabled={loading || yards.length === 0}
                >
                  Select All
                </button>
                <button
                  className="button"
                  onClick={() => setNewUserYardSelection([])}
                  disabled={loading}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {userForm.role !== "customer" && (
            <div className="create-user-yard-box">
              <div className="admin-section-title compact-title">
                <div>
                  <h4>Screen Permissions</h4>
                  <p>Choose which TITAN screens this user can open.</p>
                </div>
              </div>

              <div className="yard-access-grid">
                {moduleAccessOptions.map((option) => (
                  <label key={option.key} className="yard-access-card">
                    <input
                      type="checkbox"
                      checked={newUserModuleSelection.includes(option.key)}
                      onChange={() =>
                        setNewUserModuleSelection((current) =>
                          current.includes(option.key)
                            ? current.filter((key) => key !== option.key)
                            : [...current, option.key]
                        )
                      }
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="yard-access-actions">
                <button
                  className="button"
                  onClick={() => setNewUserModuleSelection(defaultModulesForRole(userForm.role))}
                  disabled={loading}
                >
                  Default For Role
                </button>
                <button
                  className="button"
                  onClick={() => setNewUserModuleSelection(moduleAccessOptions.map((option) => option.key))}
                  disabled={loading}
                >
                  Select All
                </button>
                <button
                  className="button"
                  onClick={() => setNewUserModuleSelection([])}
                  disabled={loading}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <button className="button primary" onClick={createUser} disabled={loading}>
            Create User
          </button>
          </div>
        </details>
      </section>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="inspectors" open={activeControl === "inspectors"}>
        <summary>
          <div>
            <h3>Inspector Manager</h3>
            <p>Create the approved Lead Inspector and Level 2 Inspector lists used on DTI jobs.</p>
          </div>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
        <div className="admin-section-title compact-title">
          {inspectorForm.id && (
            <button className="button" onClick={() => setInspectorForm(emptyInspectorForm)}>
              New Inspector
            </button>
          )}
        </div>

        <div className="form-grid admin-form-grid">
          <label>
            Inspector Name
            <input
              value={inspectorForm.fullName}
              onChange={(event) => setInspectorForm({ ...inspectorForm, fullName: event.target.value })}
              placeholder="Inspector name"
            />
          </label>

          <label>
            Inspector Role
            <select
              value={inspectorForm.role}
              onChange={(event) => setInspectorForm({ ...inspectorForm, role: event.target.value as InspectorRole })}
            >
              <option value="lead_inspector">Lead Inspector</option>
              <option value="level_2_inspector">Level 2 Inspector</option>
            </select>
          </label>
        </div>

        <button className="button primary" onClick={saveInspector} disabled={loading}>
          {inspectorForm.id ? "Save Inspector" : "Add Inspector"}
        </button>

        <div className="part-number-list">
          {inspectors.length === 0 && <p className="muted-text">No inspectors created yet.</p>}
          {inspectors.map((inspector) => (
            <article key={inspector.id} className="part-number-row">
              <div>
                <strong>{inspector.fullName}</strong>
                <span>{inspectorRoleLabel(inspector.role)}</span>
                <small>{inspector.isActive ? "Active" : "Disabled"}</small>
              </div>
              <div className="part-number-actions">
                <button className="button" onClick={() => editInspector(inspector)}>
                  Edit
                </button>
                <button className="button" onClick={() => toggleInspector(inspector)}>
                  {inspector.isActive ? "Disable" : "Enable"}
                </button>
                <button className="button danger" onClick={() => deleteInspector(inspector)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="part-numbers" open={activeControl === "part-numbers"}>
        <summary>
          <div>
            <h3>Part Number Manager</h3>
            <p>Save common tubular descriptions so receiving and inventory edits can auto-fill pipe details.</p>
          </div>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
        <div className="admin-section-title compact-title">
          {partForm.id && (
            <button className="button" onClick={() => setPartForm(emptyPartForm)}>
              New Part
            </button>
          )}
        </div>

        <div className="form-grid admin-form-grid">
          <label>
            Company
            <select
              value={partForm.companyId}
              onChange={(event) => setPartForm({ ...partForm, companyId: event.target.value })}
            >
              <option value="">Global part</option>
              {activeCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Part Number
            <input
              value={partForm.partNumber}
              onChange={(event) => setPartForm({ ...partForm, partNumber: event.target.value })}
              placeholder="2 3/8 J55 PH6"
            />
          </label>

          <label>
            Size
            <input
              value={partForm.size}
              onChange={(event) => setPartForm({ ...partForm, size: event.target.value })}
              placeholder="2 3/8"
            />
          </label>

          <label>
            Grade
            <input
              value={partForm.grade}
              onChange={(event) => setPartForm({ ...partForm, grade: event.target.value })}
              placeholder="J55"
            />
          </label>

          <label>
            Connection
            <input
              value={partForm.connection}
              onChange={(event) => setPartForm({ ...partForm, connection: event.target.value })}
              placeholder="PH6, NC50, 8rd EUE"
            />
          </label>

          <label>
            Range
            <select
              value={partForm.pipeRange}
              onChange={(event) => setPartForm({ ...partForm, pipeRange: normalizePipeRange(event.target.value) })}
            >
              <option>Range 2</option>
              <option>Range 3</option>
            </select>
          </label>

          <label>
            Description
            <input
              value={partForm.description}
              onChange={(event) => setPartForm({ ...partForm, description: event.target.value })}
              placeholder="Optional internal description"
            />
          </label>
        </div>

        <button className="button primary" onClick={savePartNumber} disabled={loading}>
          {partForm.id ? "Save Part Number" : "Add Part Number"}
        </button>

        <div className="part-number-list">
          {partNumbers.length === 0 && <p className="muted-text">No saved part numbers yet.</p>}
          {partNumbers.map((part) => (
            <article key={part.id} className="part-number-row">
              <div>
                <strong>{part.partNumber}</strong>
                <span>{[part.size, part.grade, part.connection, part.pipeRange].filter(Boolean).join(" / ") || "No pipe details saved"}</span>
                <small>{part.companyName}{part.description ? ` / ${part.description}` : ""}</small>
              </div>
              <div className="part-number-actions">
                <button className="button" onClick={() => editPartNumber(part)}>
                  Edit
                </button>
                <button className="button danger" onClick={() => deletePartNumber(part)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="status-condition" open={activeControl === "status-condition"}>
        <summary>
          <div>
            <h3>Status & Condition Manager</h3>
            <p>Add, edit, or delete the dropdown options used by receiving, edits, and filters.</p>
          </div>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
          <div className="form-grid admin-form-grid">
            <label>
              Option Type
              <select
                value={optionForm.optionType}
                onChange={(event) => setOptionForm({ ...optionForm, optionType: event.target.value as InventoryOptionType })}
              >
                <option value="status">Status</option>
                <option value="condition">Condition</option>
              </select>
            </label>

            <label>
              Label
              <input
                value={optionForm.label}
                onChange={(event) => setOptionForm({ ...optionForm, label: event.target.value })}
                placeholder={optionForm.optionType === "status" ? "Available" : "Used"}
              />
            </label>
          </div>

          <button className="button primary" onClick={saveInventoryOption} disabled={loading}>
            {optionForm.id ? "Save Option" : "Add Option"}
          </button>
          {optionForm.id && (
            <button className="button" onClick={() => setOptionForm(emptyOptionForm)}>
              New Option
            </button>
          )}

          <div className="option-manager-grid">
            <div>
              <h4>Statuses</h4>
              <div className="part-number-list option-list">
                {statusOptions.map((option) => (
                  <article key={option.id} className="part-number-row">
                    <strong>{option.label}</strong>
                    <div className="part-number-actions">
                      <button className="button" onClick={() => editInventoryOption(option)}>Edit</button>
                      <button className="button danger" onClick={() => deleteInventoryOption(option)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h4>Conditions</h4>
              <div className="part-number-list option-list">
                {conditionOptions.map((option) => (
                  <article key={option.id} className="part-number-row">
                    <strong>{option.label}</strong>
                    <div className="part-number-actions">
                      <button className="button" onClick={() => editInventoryOption(option)}>Edit</button>
                      <button className="button danger" onClick={() => deleteInventoryOption(option)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="companies" open={activeControl === "companies"}>
        <summary>
          <h3>Companies</h3>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Logo</th>
                <th>Company</th>
                <th>Account</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>
                    <div className="company-logo-cell">
                      {company.logoUrl ? (
                        <img src={company.logoUrl} alt={`${company.name} logo`} />
                      ) : (
                        <span>No logo</span>
                      )}
                    </div>
                  </td>
                  <td>{company.name}</td>
                  <td>{company.accountNumber || "-"}</td>
                  <td>{company.isActive ? "Active" : "Disabled"}</td>
                  <td>
                    <label className="button file-button">
                      Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          uploadCompanyLogo(company, event.target.files?.[0] ?? null);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {company.logoUrl && (
                      <button
                        className="button"
                        onClick={() => removeCompanyLogo(company)}
                      >
                        Remove Logo
                      </button>
                    )}
                    <button
                      className="button"
                      onClick={() => {
                        const name = window.prompt("Company name", company.name);
                        if (name) updateCompany(company, { name: name.trim() });
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="button"
                      onClick={() => updateCompany(company, { isActive: !company.isActive })}
                    >
                      {company.isActive ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="users" open={activeControl === "users"}>
        <summary>
          <h3>Users</h3>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Company</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>{profile.fullName}</td>
                  <td>{profile.role}</td>
                  <td>{profile.companyName || "-"}</td>
                  <td>
                    <button
                      className="button"
                      onClick={() => {
                        const fullName = window.prompt("Full name", profile.fullName);
                        if (fullName) updateProfile(profile, { fullName: fullName.trim() });
                      }}
                    >
                      Rename
                    </button>
                    <select
                      value={profile.role}
                      onChange={(event) =>
                        updateProfile(profile, { role: event.target.value as Profile["role"] })
                      }
                    >
                      <option value="customer">Customer</option>
                      <option value="sales">Sales</option>
                      <option value="service_line_manager">Service Line Manager</option>
                      <option value="dti_superintendent">DTI Superintendent</option>
                      <option value="dti_lead">DTI Lead</option>
                      <option value="dti_inspector">DTI Inspector</option>
                      <option value="level_2_inspector">Level 2 Inspector</option>
                      <option value="hardband_lead">Hardband Lead</option>
                      <option value="cdt_lead">CDT Lead</option>
                      <option value="inventory_specialist">Inventory Specialist</option>
                      <option value="inventory_manager">Inventory Manager</option>
                      <option value="operator">Hardband Operator</option>
                      <option value="owner">Owner</option>
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                    {profile.role === "customer" && (
                      <select
                        value={profile.companyId}
                        onChange={(event) => updateProfile(profile, { companyId: event.target.value })}
                      >
                        <option value="">No company</option>
                        {activeCompanies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {canAssignInventoryYards(profile.role) && (
                      <button className="button" onClick={() => openYardAccess(profile.id)}>
                        Yards
                      </button>
                    )}
                    {profile.role !== "customer" && (
                      <button className="button" onClick={() => openModuleAccess(profile.id)}>
                        Permissions
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="yard-access" open={activeControl === "yard-access"}>
        <summary>
          <div>
            <h3>Inventory / PO Yard Access</h3>
            <p>Assign one or more inventory yards to internal users. Wade still sees every yard by default.</p>
          </div>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
          <label>
            User
            <select
              value={yardAccessUserId}
              onChange={(event) => openYardAccess(event.target.value)}
            >
              <option value="">Select user</option>
              {yardAccessUsers.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.fullName || profile.id} ({profile.role})
                </option>
              ))}
            </select>
          </label>

          {yardAccessUserId && (
            <>
              <div className="yard-access-grid">
                {yards.map((yard) => (
                  <label key={yard.id} className="yard-access-card">
                    <input
                      type="checkbox"
                      checked={yardAccessSelection.includes(yard.id)}
                      onChange={() => toggleYardAccess(yard.id)}
                    />
                    <span>
                      <strong>{yard.name}</strong>
                      <small>{yard.code}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="yard-access-actions">
                <button
                  className="button"
                  onClick={() => setYardAccessSelection(yards.map((yard) => yard.id))}
                  disabled={loading}
                >
                  Select All
                </button>
                <button
                  className="button"
                  onClick={() => setYardAccessSelection([])}
                  disabled={loading}
                >
                  Clear
                </button>
                <button className="button primary" onClick={saveYardAccess} disabled={loading}>
                  Save Yard Access
                </button>
              </div>
            </>
          )}

          {!yardAccessUserId && (
            <p className="muted-text">Choose a user to assign Gillette, Casper, Dickinson, or any other inventory yard.</p>
          )}
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="permissions" open={activeControl === "permissions"}>
        <summary>
          <div>
            <h3>Permission Management</h3>
            <p>Review role defaults and assign exactly which TITAN screens each internal user can open.</p>
          </div>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
          <section className="ticket-card admin-card">
            <div className="admin-section-title">
              <div>
                <h4>Role Defaults</h4>
                <p className="muted-text">Pick a role to see which modules and actions are enabled by default.</p>
              </div>
              <label>
                Role
                <select
                  value={permissionRolePreview}
                  onChange={(event) => setPermissionRolePreview(event.target.value as RoleKey)}
                >
                  {allRoleOptions.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button primary" type="button" onClick={savePermissionMatrixPreview}>
                Save Matrix
              </button>
            </div>

            <div className="table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    {permissionActions.map((action) => (
                      <th key={action}>{permissionActionLabels[action]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionModules.map((module) => (
                    <tr key={module.key}>
                      <td>
                        <strong>{module.label}</strong>
                        <small className="muted-text">{module.description}</small>
                      </td>
                      {permissionActions.map((action) => (
                        <td key={action}>
                          <input
                            type="checkbox"
                            aria-label={`${module.label} ${permissionActionLabels[action]}`}
                            checked={editableRolePermissions[module.key]?.[action] ?? false}
                            onChange={() => toggleRolePermission(module.key, action)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ticket-card admin-card">
            <div className="admin-section-title">
              <div>
                <h4>User Screen Overrides</h4>
                <p className="muted-text">Use this for special cases where one person needs more or less access than their role normally gives.</p>
              </div>
            </div>

            <label>
              User
              <select
                value={moduleAccessUserId}
                onChange={(event) => openModuleAccess(event.target.value)}
              >
                <option value="">Select user</option>
                {moduleAccessUsers.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.fullName || profile.id} ({profile.role})
                  </option>
                ))}
              </select>
            </label>

            {moduleAccessUserId && (
              <>
                <div className="yard-access-grid">
                  {moduleAccessOptions.map((option) => (
                    <label key={option.key} className="yard-access-card">
                      <input
                        type="checkbox"
                        checked={moduleAccessSelection.includes(option.key)}
                        onChange={() => toggleModuleAccess(option.key)}
                        disabled={selectedModuleAccessUser?.role === "admin"}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="yard-access-actions">
                  <button
                    className="button"
                    onClick={() =>
                      setModuleAccessSelection(
                        selectedModuleAccessUser
                          ? defaultModulesForRole(selectedModuleAccessUser.role)
                          : []
                      )
                    }
                    disabled={loading || selectedModuleAccessUser?.role === "admin"}
                  >
                    Default For Role
                  </button>
                  <button
                    className="button"
                    onClick={() => setModuleAccessSelection(moduleAccessOptions.map((option) => option.key))}
                    disabled={loading}
                  >
                    Select All
                  </button>
                  <button
                    className="button"
                    onClick={() => setModuleAccessSelection([])}
                    disabled={loading || selectedModuleAccessUser?.role === "admin"}
                  >
                    Clear
                  </button>
                  <button className="button primary" onClick={saveModuleAccess} disabled={loading}>
                    Save User Permissions
                  </button>
                </div>
              </>
            )}

            {!moduleAccessUserId && (
              <p className="muted-text">Choose a user to control Inventory, Yard View, DTI, Hardbanding, Admin, Reports, and Dashboard access.</p>
            )}
          </section>
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="email-notifications" open={activeControl === "email-notifications"}>
        <summary>
          <div>
            <h3>Email Notification Settings</h3>
            <p>Choose who receives automatic emails from release requests, consumable orders, POs, reports, and alerts.</p>
          </div>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
          {emailNotificationTypes.length === 0 && (
            <p className="muted-text">{emailNotificationSetupMessage}</p>
          )}

          {emailNotificationTypes.map((notificationType) => {
            const selectedRecipientIds = emailRecipientIdsForType(notificationType.id);

            return (
              <section key={notificationType.id} className="ticket-card admin-card">
                <div className="admin-section-header">
                  <div>
                    <h4>{notificationType.name}</h4>
                    <p className="muted-text">{notificationType.description}</p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => saveEmailNotificationRecipients(notificationType.id)}
                    disabled={loading}
                  >
                    Save Recipients
                  </button>
                </div>

                <div className="yard-access-grid">
                  {emailNotificationUsers.map((user) => (
                    <label key={`${notificationType.id}-${user.id}`} className="yard-access-card">
                      <input
                        type="checkbox"
                        checked={selectedRecipientIds.includes(user.id)}
                        onChange={() => toggleEmailNotificationRecipient(notificationType.id, user.id)}
                      />
                      <span>
                        <strong>{user.fullName || user.email || user.id}</strong>
                        <small>{user.email || "No email"} / {user.role || "No role"}</small>
                      </span>
                    </label>
                  ))}
                </div>

                {emailNotificationUsers.length === 0 && (
                  <p className="muted-text">No users found for email notifications.</p>
                )}
              </section>
            );
          })}
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="po-approval-matrix" open={visibleActiveControl === "po-approval-matrix"}>
        <summary>
          <div>
            <h3>PO Approval Matrix</h3>
            <p>Set who approves purchase orders by yard, department, cost code, amount, and tier.</p>
          </div>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">
          <PoApprovalMatrixManager />
        </div>
      </details>

      <details className="ticket-card admin-card admin-collapsible admin-control-section" data-admin-control="yard-setup" open={activeControl === "yard-setup"}>
        <summary>
          <h3>Yard Setup</h3>
          <span>Open / close</span>
        </summary>
        <div className="admin-collapsible-body">

        <label>
          Yard
          <select
            value={selectedYardId}
            onChange={async (event) => {
              setSelectedYardId(event.target.value);
              await Promise.all([loadRacks(event.target.value), loadZones(event.target.value)]);
            }}
          >
            {yards.map((yard) => (
              <option key={yard.id} value={yard.id}>
                {yard.name}
              </option>
            ))}
          </select>
        </label>

        <div className="admin-grid">
          <div className="ticket-card admin-card">
            <h3>Racks</h3>
            <div className="form-grid">
              <label>
                Rack Name
                <input
                  value={rackForm.rackCode}
                  onChange={(event) => setRackForm({ ...rackForm, rackCode: event.target.value })}
                  placeholder="A1, North Row, Receiving 1..."
                />
              </label>
              <label>
                Capacity
                <input
                  type="number"
                  value={rackForm.capacityJoints}
                  onChange={(event) => setRackForm({ ...rackForm, capacityJoints: event.target.value })}
                />
              </label>
              <label>
                Sort Order
                <input
                  type="number"
                  value={rackForm.sortOrder}
                  onChange={(event) => setRackForm({ ...rackForm, sortOrder: event.target.value })}
                />
              </label>
            </div>
            <div className="admin-rack-actions">
              <button className="button primary" onClick={createRack} disabled={loading}>
                Add Rack
              </button>
              <button
                className="button danger"
                onClick={deleteSelectedRacks}
                disabled={loading || selectedRackIds.length === 0}
              >
                Delete Selected ({selectedRackIds.length})
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={racks.length > 0 && selectedRackIds.length === racks.length}
                        onChange={toggleAllRackSelection}
                        aria-label="Select all racks"
                      />
                    </th>
                    <th>Rack</th>
                    <th>Capacity</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {racks.map((rack) => (
                    <tr key={rack.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedRackIds.includes(rack.id)}
                          onChange={() => toggleRackSelection(rack.id)}
                          aria-label={`Select rack ${rack.rackCode}`}
                        />
                      </td>
                      <td>{rack.rackCode}</td>
                      <td>{rack.capacityJoints}</td>
                      <td>{rack.isActive ? "Active" : "Disabled"}</td>
                      <td>
                        <button
                          className="button"
                          onClick={() => {
                            const rackCode = window.prompt("Rack name", rack.rackCode);
                            if (rackCode) updateRack(rack, { rackCode: rackCode.trim() });
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="button"
                          onClick={() => {
                            const capacity = window.prompt("Rack capacity", String(rack.capacityJoints));
                            if (capacity === null) return;

                            const nextCapacity = Number(capacity);
                            if (!Number.isFinite(nextCapacity) || nextCapacity <= 0) {
                              setMessage("Rack capacity must be a number greater than zero.");
                              return;
                            }

                            updateRack(rack, { capacityJoints: Math.round(nextCapacity) });
                          }}
                        >
                          Capacity
                        </button>
                        <button
                          className="button"
                          onClick={() => updateRack(rack, { isActive: !rack.isActive })}
                        >
                          {rack.isActive ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ticket-card admin-card">
            <h3>Work Zones</h3>
            <div className="form-grid">
              <label>
                Name
                <input
                  value={zoneForm.name}
                  onChange={(event) =>
                    setZoneForm({
                      ...zoneForm,
                      name: event.target.value,
                      code: zoneForm.code || makeCode(event.target.value),
                    })
                  }
                  placeholder="Inspection"
                />
              </label>
              <label>
                Code
                <input
                  value={zoneForm.code}
                  onChange={(event) => setZoneForm({ ...zoneForm, code: makeCode(event.target.value) })}
                  placeholder="inspection"
                />
              </label>
              <label>
                Sort Order
                <input
                  type="number"
                  value={zoneForm.sortOrder}
                  onChange={(event) => setZoneForm({ ...zoneForm, sortOrder: event.target.value })}
                />
              </label>
            </div>
            <button className="button primary" onClick={createZone} disabled={loading}>
              Add Work Zone
            </button>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => (
                    <tr key={zone.id}>
                      <td>{zone.name}</td>
                      <td>{zone.code}</td>
                      <td>{zone.isActive ? "Active" : "Disabled"}</td>
                      <td>
                        <button
                          className="button"
                          onClick={() => {
                            const name = window.prompt("Work zone name", zone.name);
                            if (name) updateZone(zone, { name: name.trim(), code: makeCode(name) });
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="button"
                          onClick={() => updateZone(zone, { isActive: !zone.isActive })}
                        >
                          {zone.isActive ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      </details>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </main>
  );
}
