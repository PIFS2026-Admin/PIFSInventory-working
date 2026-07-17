export const poStatuses = [
  "Draft",
  "Submitted",
  "Approved",
  "Sent to Vendor",
  "Partially Received",
  "Fully Received",
  "Invoiced",
  "Closed",
  "Rejected",
  "Cancelled",
] as const;

export type PurchaseOrderStatus = (typeof poStatuses)[number];

export type PurchaseOrderAction =
  | "submit"
  | "approve"
  | "reject"
  | "send_vendor"
  | "receive_partial"
  | "receive_full"
  | "invoice"
  | "close"
  | "cancel"
  | "reopen";

export type ApprovalRequirement = {
  tier: number;
  label: string;
  roleKeys: string[];
};

export const approvalRequirements = {
  manager: {
    tier: 1,
    label: "Manager approval",
    roleKeys: ["admin", "owner", "manager", "inventory_manager", "service_line_manager", "office_admin"],
  },
  director: {
    tier: 1,
    label: "Director approval",
    roleKeys: ["admin", "owner", "director", "service_line_manager"],
  },
  finance: {
    tier: 2,
    label: "Finance approval",
    roleKeys: ["admin", "owner", "finance", "accounts_payable", "ap", "office_admin"],
  },
} satisfies Record<string, ApprovalRequirement>;

const transitionMap: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["Approved", "Rejected", "Cancelled"],
  Approved: ["Sent to Vendor", "Cancelled"],
  "Sent to Vendor": ["Partially Received", "Fully Received", "Cancelled"],
  "Partially Received": ["Fully Received", "Cancelled"],
  "Fully Received": ["Invoiced", "Cancelled"],
  Invoiced: ["Closed", "Cancelled"],
  Closed: [],
  Rejected: ["Draft"],
  Cancelled: [],
};

export function normalizePoStatus(value: unknown): PurchaseOrderStatus {
  const raw = String(value ?? "Draft").trim();
  if (poStatuses.includes(raw as PurchaseOrderStatus)) return raw as PurchaseOrderStatus;
  if (raw === "Ordered" || raw === "Sent" || raw === "Approved / Ordered") return "Sent to Vendor";
  if (raw === "Received") return "Fully Received";
  return "Draft";
}

export function allowedNextStatuses(status: unknown) {
  return transitionMap[normalizePoStatus(status)];
}

export function canTransitionPo(fromStatus: unknown, toStatus: unknown) {
  const from = normalizePoStatus(fromStatus);
  const to = normalizePoStatus(toStatus);
  return transitionMap[from].includes(to);
}

export function approvalPlanForAmount(totalAmount: number): ApprovalRequirement[] {
  const total = Number.isFinite(totalAmount) ? totalAmount : 0;
  if (total < 1000) return [];
  if (total <= 10000) return [approvalRequirements.manager];
  return [approvalRequirements.director, approvalRequirements.finance];
}

export function roleCanApproveTier(role: unknown, requirement: Pick<ApprovalRequirement, "roleKeys"> | null | undefined) {
  const normalized = String(role ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return Boolean(requirement?.roleKeys.includes(normalized));
}

export function roleCanApproveRoleKey(role: unknown, approvalRole: unknown) {
  const normalizedRole = String(role ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const normalizedApprovalRole = String(approvalRole ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalizedRole || !normalizedApprovalRole) return false;
  if (normalizedApprovalRole === "manager") return roleCanApproveTier(normalizedRole, approvalRequirements.manager);
  if (normalizedApprovalRole === "director") return roleCanApproveTier(normalizedRole, approvalRequirements.director);
  if (normalizedApprovalRole === "finance") return roleCanApproveTier(normalizedRole, approvalRequirements.finance);
  return normalizedRole === normalizedApprovalRole;
}

export function roleCanManagePurchaseOrders(role: unknown) {
  const normalized = String(role ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return ["admin", "owner", "inventory_manager", "office_admin"].includes(normalized);
}

export function roleCanRequestPurchaseOrders(role: unknown) {
  const normalized = String(role ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return normalized !== "customer" && normalized.length > 0;
}

export function roleCanReceivePurchaseOrders(role: unknown) {
  const normalized = String(role ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return ["admin", "owner", "inventory_manager", "inventory_specialist", "warehouse_employee", "accounts_payable", "ap", "office_admin"].includes(normalized);
}

export function roleCanMatchInvoices(role: unknown) {
  const normalized = String(role ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return ["admin", "owner", "finance", "accounts_payable", "ap", "office_admin", "inventory_manager"].includes(normalized);
}

export type InvoiceMatchInput = {
  poAmount: number;
  invoiceAmount: number;
  orderedQuantity: number;
  receivedQuantity: number;
  invoicedQuantity?: number;
  tolerancePercent?: number;
};

export type InvoiceMatchResult = {
  status: "matched" | "exception" | "pending";
  reasons: string[];
  variancePercent: number;
};

export function evaluateInvoiceMatch(input: InvoiceMatchInput): InvoiceMatchResult {
  const tolerance = input.tolerancePercent ?? 5;
  const poAmount = Math.max(0, Number(input.poAmount) || 0);
  const invoiceAmount = Math.max(0, Number(input.invoiceAmount) || 0);
  const orderedQuantity = Math.max(0, Number(input.orderedQuantity) || 0);
  const receivedQuantity = Math.max(0, Number(input.receivedQuantity) || 0);
  const invoicedQuantity = Math.max(0, Number(input.invoicedQuantity ?? orderedQuantity) || 0);
  const reasons: string[] = [];

  if (poAmount <= 0 || invoiceAmount <= 0) {
    return { status: "pending", reasons: ["Waiting on PO amount or invoice amount."], variancePercent: 0 };
  }

  const variancePercent = Math.abs(invoiceAmount - poAmount) / poAmount * 100;
  if (variancePercent > tolerance) {
    reasons.push(`Price variance ${variancePercent.toFixed(1)}% exceeds ${tolerance}% tolerance.`);
  }

  if (receivedQuantity < invoicedQuantity) {
    reasons.push("Invoice quantity is greater than received quantity.");
  }

  if (receivedQuantity <= 0) {
    reasons.push("No receipt is recorded for this PO.");
  }

  return {
    status: reasons.length === 0 ? "matched" : "exception",
    reasons,
    variancePercent,
  };
}

export function formatPoMoney(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
