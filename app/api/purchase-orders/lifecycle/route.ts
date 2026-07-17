/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@supabase/supabase-js";
import {
  approvalPlanForAmount,
  canTransitionPo,
  evaluateInvoiceMatch,
  normalizePoStatus,
  roleCanApproveRoleKey,
  roleCanApproveTier,
  roleCanManagePurchaseOrders,
  roleCanMatchInvoices,
  roleCanReceivePurchaseOrders,
  roleCanRequestPurchaseOrders,
} from "../../../../lib/purchaseOrderLifecycle";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

type Actor = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

type PurchaseOrderRecord = Record<string, any>;
type LineRecord = Record<string, any>;
type ApprovalRouteRow = {
  po_id: string;
  tier: number;
  approver_role: string;
  approver_id: string | null;
  status: string;
  comments: string | null;
  timestamp: string | null;
};

function messageFromError(error: unknown) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function actorCanManageApprovalMatrix(actor: Actor) {
  const normalizedRole = normalizeRole(actor.role);
  const normalizedName = String(actor.fullName ?? "").trim().toLowerCase();
  const normalizedEmail = String(actor.email ?? "").trim().toLowerCase();

  return (
    normalizedRole === "owner" ||
    normalizedName === "wade wisenor" ||
    normalizedName === "nick grant" ||
    normalizedEmail === "wade@pathfinderinspections.com" ||
    normalizedEmail === "nick.grant@pathfinderinspections.com" ||
    normalizedEmail === "ngrant@pathfinderinspections.com"
  );
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function ensureAdminClient() {
  if (!adminClient) throw new Error("Supabase service role is not configured.");
  return adminClient;
}

function fallbackPoNumber() {
  const now = new Date();
  return `PO-${now.getFullYear()}-${String(now.getTime()).slice(-5)}`;
}

async function getActor(request: Request): Promise<Actor> {
  const supabase = ensureAdminClient();
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing authorization token.");

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) throw new Error("Invalid authorization token.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, email")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) throw new Error("User profile not found.");

  return {
    id: authData.user.id,
    email: String(profile.email ?? authData.user.email ?? ""),
    fullName: String(profile.full_name ?? authData.user.email ?? "TITAN user"),
    role: normalizeRole(profile.role),
  };
}

async function writeAudit(
  entityType: string,
  entityId: string,
  action: string,
  actor: Actor,
  beforeValue: unknown,
  afterValue: unknown,
) {
  const supabase = ensureAdminClient();
  await supabase.from("purchase_order_audit_logs").insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    user_id: actor.id,
    user_name: actor.fullName,
    before_value: beforeValue ?? null,
    after_value: afterValue ?? null,
  });
}

async function getOrder(poId: string) {
  const supabase = ensureAdminClient();
  const { data, error } = await supabase.from("purchase_orders").select("*").eq("id", poId).single();
  if (error || !data) throw new Error(error?.message ?? "Purchase order not found.");
  return data as PurchaseOrderRecord;
}

async function getLines(poId: string) {
  const supabase = ensureAdminClient();
  const { data, error } = await supabase.from("purchase_order_lines").select("*").eq("purchase_order_id", poId);
  if (error) throw new Error(error.message);
  return (data ?? []) as LineRecord[];
}

async function recalculateTotal(poId: string) {
  const supabase = ensureAdminClient();
  const { data, error } = await supabase.rpc("recalculate_purchase_order_total", { target_po_id: poId });
  if (!error) return numberValue(data);

  const lines = await getLines(poId);
  const total = lines.reduce(
    (sum, line) => sum + numberValue(line.line_total ?? numberValue(line.quantity_ordered) * numberValue(line.unit_price ?? line.unit_cost)),
    0,
  );
  await supabase.from("purchase_orders").update({ total_value: total, total_amount: total }).eq("id", poId);
  return total;
}

async function getNextPoNumber() {
  const supabase = ensureAdminClient();
  const { data, error } = await supabase.rpc("next_purchase_order_number");
  if (!error && data) return String(data);
  return fallbackPoNumber();
}

async function transitionOrder(poId: string, nextStatus: string, actor: Actor, action: string, extraPayload: Record<string, unknown> = {}) {
  const supabase = ensureAdminClient();
  const before = await getOrder(poId);
  const currentStatus = normalizePoStatus(before.status);
  const normalizedNext = normalizePoStatus(nextStatus);

  if (!canTransitionPo(currentStatus, normalizedNext)) {
    throw new Error(`Cannot move PO from ${currentStatus} to ${normalizedNext}.`);
  }

  const now = new Date().toISOString();
  const timestampFields: Record<string, string> = {};
  if (normalizedNext === "Submitted") timestampFields.submitted_at = now;
  if (normalizedNext === "Approved") timestampFields.approved_at = now;
  if (normalizedNext === "Sent to Vendor") timestampFields.sent_at = now;
  if (normalizedNext === "Invoiced") timestampFields.invoiced_at = now;
  if (normalizedNext === "Closed") timestampFields.closed_at = now;
  if (normalizedNext === "Cancelled") timestampFields.cancelled_at = now;

  const { data, error } = await supabase
    .from("purchase_orders")
    .update({
      status: normalizedNext,
      ...timestampFields,
      ...extraPayload,
      updated_at: now,
    })
    .eq("id", poId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Purchase order update failed.");
  await writeAudit("purchase_order", poId, action, actor, { status: currentStatus }, { status: normalizedNext, ...extraPayload });
  return data as PurchaseOrderRecord;
}

function roleKeyForApprovalLabel(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("finance")) return "finance";
  if (lower.includes("director")) return "director";
  return "manager";
}

function normalizedText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function approvalRuleSpecificity(rule: Record<string, any>, order: PurchaseOrderRecord) {
  let score = 0;
  if (rule.yard_id && rule.yard_id === order.yard_id) score += 8;
  if (normalizedText(rule.department)) score += 4;
  if (normalizedText(rule.cost_center)) score += 2;
  if (rule.approver_id) score += 1;
  return score;
}

async function matrixApprovalRows(poId: string, totalAmount: number, order: PurchaseOrderRecord): Promise<ApprovalRouteRow[] | null> {
  const supabase = ensureAdminClient();
  const { data, error } = await supabase
    .from("purchase_order_approval_matrix")
    .select("*")
    .eq("active", true)
    .order("tier", { ascending: true });

  if (error) return null;

  const orderDepartment = normalizedText(order.department);
  const orderCostCenter = normalizedText(order.cost_center || order.budget_code);
  const matching = (data ?? [])
    .filter((rule) => {
      const minAmount = numberValue(rule.min_amount);
      const maxAmount = rule.max_amount === null || rule.max_amount === undefined ? null : numberValue(rule.max_amount);
      const department = normalizedText(rule.department);
      const costCenter = normalizedText(rule.cost_center);
      return (
        (!rule.yard_id || rule.yard_id === order.yard_id) &&
        (!department || department === orderDepartment) &&
        (!costCenter || costCenter === orderCostCenter) &&
        totalAmount >= minAmount &&
        (maxAmount === null || totalAmount <= maxAmount)
      );
    })
    .sort((a, b) => {
      const tierDelta = numberValue(a.tier) - numberValue(b.tier);
      if (tierDelta !== 0) return tierDelta;
      return approvalRuleSpecificity(b, order) - approvalRuleSpecificity(a, order);
    });

  const selectedByTier = new Map<number, Record<string, any>>();
  matching.forEach((rule) => {
    const tier = Math.max(1, Number(rule.tier || 1));
    if (!selectedByTier.has(tier)) selectedByTier.set(tier, rule);
  });

  const rows: ApprovalRouteRow[] = Array.from(selectedByTier.values())
    .sort((a, b) => Number(a.tier || 1) - Number(b.tier || 1))
    .map((rule) => ({
      po_id: poId,
      tier: Math.max(1, Number(rule.tier || 1)),
      approver_role: normalizeRole(rule.approver_role || "manager"),
      approver_id: rule.approver_id || null,
      status: "pending",
      comments: rule.approver_name ? `Matrix approver: ${rule.approver_name}` : "Matrix approval rule.",
      timestamp: null,
    }));

  return rows.length > 0 ? rows : null;
}

async function rebuildApprovals(poId: string, totalAmount: number, actor: Actor) {
  const supabase = ensureAdminClient();
  const order = await getOrder(poId);
  const matrixRows = await matrixApprovalRows(poId, totalAmount, order);
  const plan = approvalPlanForAmount(totalAmount);

  await supabase
    .from("purchase_order_approvals")
    .update({ status: "skipped", comments: "Replaced by latest approval routing.", timestamp: new Date().toISOString() })
    .eq("po_id", poId)
    .eq("status", "pending");

  if (!matrixRows && plan.length === 0) {
    await supabase.from("purchase_order_approvals").upsert(
      {
        po_id: poId,
        tier: 0,
        approver_role: "auto",
        status: "approved",
        comments: "Auto-approved under $1,000.",
        timestamp: new Date().toISOString(),
      },
      { onConflict: "po_id,tier,approver_role" },
    );
    await writeAudit("purchase_order", poId, "approval_auto_created", actor, null, { totalAmount });
    return [];
  }

  const rows: ApprovalRouteRow[] = matrixRows ?? plan.map((requirement) => ({
    po_id: poId,
    tier: requirement.tier,
    approver_role: roleKeyForApprovalLabel(requirement.label),
    approver_id: null,
    status: "pending",
    comments: null,
    timestamp: null,
  }));

  const { error } = await supabase.from("purchase_order_approvals").upsert(rows, {
    onConflict: "po_id,tier,approver_role",
  });
  if (error) throw new Error(error.message);
  await writeAudit("purchase_order", poId, matrixRows ? "approval_matrix_plan_created" : "approval_plan_created", actor, null, { approvals: rows });
  return rows;
}

async function handleSavePo(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  if (!roleCanRequestPurchaseOrders(actor.role)) throw new Error("You do not have permission to create purchase orders.");

  const poId = String(body.poId ?? body.id ?? "").trim();
  const existing = poId ? await getOrder(poId) : null;
  const existingStatus = existing ? normalizePoStatus(existing.status) : "Draft";
  if (existing && existingStatus !== "Draft" && !roleCanManagePurchaseOrders(actor.role)) {
    throw new Error("Only PO managers can edit a PO after it leaves Draft.");
  }

  const vendorId = String(body.vendorId ?? "").trim() || null;
  let vendorName = String(body.vendorName ?? "").trim() || null;
  let vendorEmail = String(body.vendorEmail ?? "").trim() || null;

  if (vendorId) {
    const { data: vendor } = await supabase
      .from("inventory_vendors")
      .select("vendor_name, email")
      .eq("id", vendorId)
      .single();
    vendorName = vendor?.vendor_name ?? vendorName;
    vendorEmail = vendor?.email ?? vendorEmail;
  }

  const payload: Record<string, unknown> = {
    yard_id: body.yardId || null,
    po_number: String(body.poNumber ?? "").trim() || (existing?.po_number ?? (await getNextPoNumber())),
    vendor_id: vendorId,
    vendor_name: vendorName,
    vendor_email: vendorEmail,
    order_date: body.orderDate || new Date().toISOString().slice(0, 10),
    requested_by: String(body.requestedBy ?? actor.fullName).trim() || actor.fullName,
    requester_id: existing?.requester_id ?? actor.id,
    department: String(body.department ?? "").trim() || null,
    budget_code: String(body.budgetCode ?? "").trim() || null,
    cost_center: String(body.costCenter ?? "").trim() || null,
    notes: String(body.notes ?? "").trim() || null,
    lifecycle_notes: String(body.lifecycleNotes ?? "").trim() || null,
    status: existing?.status ?? "Draft",
  };

  const request = poId
    ? supabase.from("purchase_orders").update(payload).eq("id", poId).select("*").single()
    : supabase.from("purchase_orders").insert(payload).select("*").single();

  const { data, error } = await request;
  if (error || !data) throw new Error(error?.message ?? "PO save failed.");
  await writeAudit("purchase_order", data.id, poId ? "po_updated" : "po_created", actor, existing, data);
  return data;
}

async function handleSaveLine(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  const poId = String(body.poId ?? "").trim();
  if (!poId) throw new Error("PO is required.");

  const order = await getOrder(poId);
  const status = normalizePoStatus(order.status);
  if (status !== "Draft" && !roleCanManagePurchaseOrders(actor.role)) {
    throw new Error("Only PO managers can add lines after Draft.");
  }

  const quantity = numberValue(body.quantityOrdered);
  const unitPrice = numberValue(body.unitPrice ?? body.unitCost);
  if (quantity <= 0) throw new Error("Quantity ordered must be greater than zero.");

  const payload = {
    yard_id: body.yardId || order.yard_id || null,
    purchase_order_id: poId,
    item_id: body.itemId || null,
    item_code: String(body.itemCode ?? "").trim() || null,
    item_name: String(body.description ?? body.itemName ?? "").trim(),
    description: String(body.description ?? body.itemName ?? "").trim(),
    quantity_ordered: quantity,
    quantity_received: 0,
    quantity_invoiced: 0,
    unit_cost: unitPrice,
    unit_price: unitPrice,
    line_total: quantity * unitPrice,
    gl_code: String(body.glCode ?? "").trim() || null,
  };

  if (!payload.item_name) throw new Error("Line item description is required.");

  const { data, error } = await supabase.from("purchase_order_lines").insert(payload).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Line save failed.");
  await recalculateTotal(poId);
  await writeAudit("purchase_order_line", data.id, "line_created", actor, null, data);
  return data;
}

async function handleSubmit(poId: string, actor: Actor) {
  if (!roleCanRequestPurchaseOrders(actor.role)) throw new Error("You do not have permission to submit purchase orders.");
  const total = await recalculateTotal(poId);
  const submitted = await transitionOrder(poId, "Submitted", actor, "po_submitted");
  const approvals = await rebuildApprovals(poId, total, actor);

  if (approvals.length === 0) {
    const approved = await transitionOrder(poId, "Approved", actor, "po_auto_approved");
    return { purchaseOrder: approved, autoApproved: true };
  }

  return { purchaseOrder: submitted, autoApproved: false };
}

async function handleApprovalDecision(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  const poId = String(body.poId ?? "").trim();
  const decision = String(body.decision ?? "").trim().toLowerCase();
  const comments = String(body.comments ?? "").trim();
  if (!["approve", "reject"].includes(decision)) throw new Error("Approval decision is required.");
  if (decision === "reject" && !comments) throw new Error("A rejection reason is required.");

  const order = await getOrder(poId);
  if (normalizePoStatus(order.status) !== "Submitted") throw new Error("Only submitted POs can be approved or rejected.");

  const { data: approvals, error } = await supabase
    .from("purchase_order_approvals")
    .select("*")
    .eq("po_id", poId)
    .order("tier", { ascending: true });
  if (error) throw new Error(error.message);

  const pending = (approvals ?? []).find((approval) => approval.status === "pending");
  if (!pending) throw new Error("This PO has no pending approval tier.");

  const requirement = approvalPlanForAmount(numberValue(order.total_amount ?? order.total_value)).find(
    (item) => item.tier === Number(pending.tier) && roleKeyForApprovalLabel(item.label) === pending.approver_role,
  );
  const isNamedApprover = pending.approver_id && pending.approver_id === actor.id;
  const isRoleApprover = requirement
    ? roleCanApproveTier(actor.role, requirement)
    : roleCanApproveRoleKey(actor.role, pending.approver_role);
  if (!isNamedApprover && !isRoleApprover && !roleCanManagePurchaseOrders(actor.role)) {
    throw new Error("This PO is not waiting on your approval tier.");
  }

  const nextApprovalStatus = decision === "approve" ? "approved" : "rejected";
  const { data: approval, error: updateError } = await supabase
    .from("purchase_order_approvals")
    .update({
      status: nextApprovalStatus,
      approver_id: actor.id,
      comments,
      timestamp: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .select("*")
    .single();
  if (updateError || !approval) throw new Error(updateError?.message ?? "Approval update failed.");

  await writeAudit("purchase_order_approval", approval.id, `approval_${nextApprovalStatus}`, actor, pending, approval);

  if (decision === "reject") {
    const rejected = await transitionOrder(poId, "Rejected", actor, "po_rejected", { rejection_reason: comments });
    const draft = await transitionOrder(poId, "Draft", actor, "po_returned_to_draft", { rejection_reason: comments });
    return { purchaseOrder: draft, rejection: rejected };
  }

  const remaining = (approvals ?? []).filter((item) => item.id !== pending.id && item.status === "pending");
  if (remaining.length === 0) {
    const approvedOrder = await transitionOrder(poId, "Approved", actor, "po_approved");
    return { purchaseOrder: approvedOrder };
  }

  return { purchaseOrder: order, approval };
}

async function handleReceiveLine(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  if (!roleCanReceivePurchaseOrders(actor.role)) throw new Error("You do not have permission to receive purchase orders.");

  const poId = String(body.poId ?? "").trim();
  const lineId = String(body.lineId ?? "").trim();
  const receivedNow = numberValue(body.quantityReceived);
  if (!poId || !lineId) throw new Error("PO and line item are required.");
  if (receivedNow <= 0) throw new Error("Received quantity must be greater than zero.");

  const order = await getOrder(poId);
  const status = normalizePoStatus(order.status);
  if (!["Sent to Vendor", "Partially Received"].includes(status)) {
    throw new Error("A PO must be sent to vendor before it can be received.");
  }

  const { data: line, error: lineFetchError } = await supabase
    .from("purchase_order_lines")
    .select("*")
    .eq("id", lineId)
    .single();
  if (lineFetchError || !line) throw new Error(lineFetchError?.message ?? "PO line not found.");

  const nextReceived = numberValue(line.quantity_received) + receivedNow;
  if (nextReceived > numberValue(line.quantity_ordered)) {
    throw new Error("Received quantity cannot exceed quantity ordered.");
  }

  const discrepancyFlag = Boolean(body.discrepancyFlag) || nextReceived !== numberValue(line.quantity_ordered);
  const { data: receipt, error: receiptError } = await supabase
    .from("purchase_order_receipts")
    .insert({
      po_id: poId,
      line_item_id: lineId,
      quantity_received: receivedNow,
      received_by: actor.id,
      received_by_name: actor.fullName,
      discrepancy_flag: discrepancyFlag,
      discrepancy_note: String(body.discrepancyNote ?? "").trim() || null,
    })
    .select("*")
    .single();
  if (receiptError || !receipt) throw new Error(receiptError?.message ?? "Receipt failed.");

  const { data: updatedLine, error: updateError } = await supabase
    .from("purchase_order_lines")
    .update({ quantity_received: nextReceived })
    .eq("id", lineId)
    .select("*")
    .single();
  if (updateError || !updatedLine) throw new Error(updateError?.message ?? "Line receipt update failed.");

  if (line.item_id) {
    const { data: item } = await supabase.from("inventory_items").select("*").eq("id", line.item_id).single();
    if (item) {
      const nextQty = numberValue(item.qty_on_hand) + receivedNow;
      await supabase.from("inventory_items").update({ qty_on_hand: nextQty }).eq("id", item.id);
      await supabase.from("inventory_transactions").insert({
        yard_id: order.yard_id ?? line.yard_id ?? null,
        item_id: item.id,
        item_code: item.item_code,
        transaction_type: "PO Receipt",
        quantity: receivedNow,
        reference_type: "Purchase Order",
        reference_number: order.po_number,
        entered_by: actor.fullName,
        notes: `Received against ${order.po_number}`,
        transaction_source: "TITAN Purchase Orders",
        quantity_direction: "In",
      });
    }
  }

  const lines = await getLines(poId);
  const ordered = lines.reduce((sum, item) => sum + numberValue(item.quantity_ordered), 0);
  const received = lines.reduce((sum, item) => sum + numberValue(item.quantity_received), 0);
  const nextStatus = ordered > 0 && received >= ordered ? "Fully Received" : "Partially Received";
  const beforeStatus = normalizePoStatus(order.status);
  let purchaseOrder = order;
  if (beforeStatus !== nextStatus) {
    purchaseOrder = await transitionOrder(poId, nextStatus, actor, nextStatus === "Fully Received" ? "po_fully_received" : "po_partially_received");
  }
  await writeAudit("purchase_order_receipt", receipt.id, "receipt_created", actor, null, receipt);
  return { purchaseOrder, receipt, line: updatedLine };
}

async function handleCreateInvoice(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  if (!roleCanMatchInvoices(actor.role)) throw new Error("You do not have permission to match invoices.");

  const poId = String(body.poId ?? "").trim();
  const vendorInvoiceNumber = String(body.vendorInvoiceNumber ?? "").trim();
  const amount = numberValue(body.amount);
  const manualOverride = Boolean(body.manualOverride);
  if (!poId || !vendorInvoiceNumber) throw new Error("PO and vendor invoice number are required.");
  if (amount <= 0) throw new Error("Invoice amount must be greater than zero.");

  const order = await getOrder(poId);
  const status = normalizePoStatus(order.status);
  if (status !== "Fully Received" && status !== "Invoiced") {
    throw new Error("A PO must be fully received before invoice matching.");
  }

  const lines = await getLines(poId);
  const orderedQuantity = lines.reduce((sum, line) => sum + numberValue(line.quantity_ordered), 0);
  const receivedQuantity = lines.reduce((sum, line) => sum + numberValue(line.quantity_received), 0);
  const match = evaluateInvoiceMatch({
    poAmount: numberValue(order.total_amount ?? order.total_value),
    invoiceAmount: amount,
    orderedQuantity,
    receivedQuantity,
    invoicedQuantity: orderedQuantity,
    tolerancePercent: numberValue(body.tolerancePercent || 5),
  });
  const matchStatus = manualOverride ? "matched" : match.status;

  const { data: invoice, error } = await supabase
    .from("purchase_order_invoices")
    .insert({
      po_id: poId,
      vendor_invoice_number: vendorInvoiceNumber,
      amount,
      match_status: matchStatus,
      exception_reason: match.reasons.join(" ") || null,
      reviewed_by: manualOverride ? actor.id : null,
      reviewed_at: manualOverride ? new Date().toISOString() : null,
      created_by: actor.id,
    })
    .select("*")
    .single();
  if (error || !invoice) throw new Error(error?.message ?? "Invoice save failed.");

  await Promise.all(
    lines.map((line) =>
      supabase
        .from("purchase_order_lines")
        .update({ quantity_invoiced: numberValue(line.quantity_ordered) })
        .eq("id", line.id),
    ),
  );

  let purchaseOrder = order;
  if (matchStatus === "matched" && status !== "Invoiced") {
    purchaseOrder = await transitionOrder(poId, "Invoiced", actor, manualOverride ? "invoice_override_matched" : "invoice_matched");
  }

  await writeAudit("purchase_order_invoice", invoice.id, "invoice_created", actor, null, { invoice, match });
  return { purchaseOrder, invoice, match };
}

async function handleOverrideInvoice(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  if (!roleCanMatchInvoices(actor.role)) throw new Error("You do not have permission to override invoice exceptions.");

  const invoiceId = String(body.invoiceId ?? "").trim();
  const comments = String(body.comments ?? "").trim();
  if (!invoiceId || !comments) throw new Error("Invoice and override comment are required.");

  const { data: invoice, error: invoiceError } = await supabase
    .from("purchase_order_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (invoiceError || !invoice) throw new Error(invoiceError?.message ?? "Invoice not found.");

  const { data: updatedInvoice, error } = await supabase
    .from("purchase_order_invoices")
    .update({
      match_status: "matched",
      exception_reason: comments,
      reviewed_by: actor.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .select("*")
    .single();
  if (error || !updatedInvoice) throw new Error(error?.message ?? "Invoice override failed.");

  const order = await getOrder(invoice.po_id);
  let purchaseOrder = order;
  if (normalizePoStatus(order.status) === "Fully Received") {
    purchaseOrder = await transitionOrder(invoice.po_id, "Invoiced", actor, "invoice_exception_overridden");
  }

  await writeAudit("purchase_order_invoice", invoiceId, "invoice_exception_overridden", actor, invoice, updatedInvoice);
  return { purchaseOrder, invoice: updatedInvoice };
}

async function handleSaveVendor(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  if (!roleCanManagePurchaseOrders(actor.role)) throw new Error("Only admins and PO managers can manage vendors.");

  const vendorId = String(body.vendorId ?? "").trim();
  const payload = {
    yard_id: body.yardId || null,
    vendor_name: String(body.name ?? body.vendorName ?? "").trim(),
    contact_info: String(body.contactInfo ?? "").trim() || null,
    contact_name: String(body.contactName ?? "").trim() || null,
    phone: String(body.phone ?? "").trim() || null,
    email: String(body.email ?? "").trim() || null,
    payment_terms: String(body.paymentTerms ?? "").trim() || null,
    terms: String(body.paymentTerms ?? "").trim() || null,
    tax_id: String(body.taxId ?? "").trim() || null,
    active: body.active !== false,
  };
  if (!payload.vendor_name) throw new Error("Vendor name is required.");

  const before = vendorId
    ? (await supabase.from("inventory_vendors").select("*").eq("id", vendorId).single()).data
    : null;

  const request = vendorId
    ? supabase.from("inventory_vendors").update(payload).eq("id", vendorId).select("*").single()
    : supabase.from("inventory_vendors").insert(payload).select("*").single();

  const { data, error } = await request;
  if (error || !data) throw new Error(error?.message ?? "Vendor save failed.");
  await writeAudit("vendor", data.id, vendorId ? "vendor_updated" : "vendor_created", actor, before, data);
  return data;
}

async function handleSaveApprovalMatrixRule(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  if (!actorCanManageApprovalMatrix(actor)) {
    throw new Error("Only Wade Wisenor, Nick Grant, and Owners can manage approval routing.");
  }

  const ruleId = String(body.ruleId ?? "").trim();
  const approverId = String(body.approverId ?? "").trim() || null;
  let approverName = String(body.approverName ?? "").trim() || null;

  if (approverId && !approverName) {
    const { data: approver } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", approverId)
      .single();
    approverName = String(approver?.full_name ?? approver?.email ?? "").trim() || null;
  }

  const payload = {
    yard_id: String(body.yardId ?? "").trim() || null,
    department: String(body.department ?? "").trim() || null,
    cost_center: String(body.costCenter ?? "").trim() || null,
    min_amount: Math.max(0, numberValue(body.minAmount)),
    max_amount: String(body.maxAmount ?? "").trim() ? Math.max(0, numberValue(body.maxAmount)) : null,
    tier: Math.max(1, Math.round(numberValue(body.tier || 1))),
    approver_role: normalizeRole(body.approverRole || "manager"),
    approver_id: approverId,
    approver_name: approverName,
    active: body.active !== false,
    notes: String(body.notes ?? "").trim() || null,
    created_by: actor.id,
  };

  if (!payload.approver_role && !payload.approver_id) {
    throw new Error("Choose an approver role or a named approver.");
  }

  const before = ruleId
    ? (await supabase.from("purchase_order_approval_matrix").select("*").eq("id", ruleId).single()).data
    : null;

  const request = ruleId
    ? supabase.from("purchase_order_approval_matrix").update(payload).eq("id", ruleId).select("*").single()
    : supabase.from("purchase_order_approval_matrix").insert(payload).select("*").single();

  const { data, error } = await request;
  if (error || !data) {
    throw new Error(error?.message ?? "Approval matrix save failed. Run supabase/titan_po_approval_matrix.sql if the table is missing.");
  }

  await writeAudit("purchase_order_approval_matrix", data.id, ruleId ? "approval_matrix_rule_updated" : "approval_matrix_rule_created", actor, before, data);
  return data;
}

async function handleDeactivateApprovalMatrixRule(body: Record<string, any>, actor: Actor) {
  const supabase = ensureAdminClient();
  if (!actorCanManageApprovalMatrix(actor)) {
    throw new Error("Only Wade Wisenor, Nick Grant, and Owners can manage approval routing.");
  }

  const ruleId = String(body.ruleId ?? "").trim();
  if (!ruleId) throw new Error("Approval matrix rule is required.");

  const { data: before } = await supabase.from("purchase_order_approval_matrix").select("*").eq("id", ruleId).single();
  const { data, error } = await supabase
    .from("purchase_order_approval_matrix")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", ruleId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Approval matrix deactivation failed.");

  await writeAudit("purchase_order_approval_matrix", data.id, "approval_matrix_rule_deactivated", actor, before, data);
  return data;
}

export async function POST(request: Request) {
  try {
    ensureAdminClient();
    const actor = await getActor(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim().toLowerCase();
    const poId = String(body.poId ?? body.id ?? "").trim();

    if (!roleCanRequestPurchaseOrders(actor.role)) {
      return Response.json({ error: "Purchase Orders are for internal users only." }, { status: 403 });
    }

    if (action === "save_po") {
      return Response.json({ purchaseOrder: await handleSavePo(body, actor) });
    }

    if (action === "save_line") {
      return Response.json({ line: await handleSaveLine(body, actor) });
    }

    if (action === "submit_po") {
      if (!poId) return Response.json({ error: "PO is required." }, { status: 400 });
      return Response.json(await handleSubmit(poId, actor));
    }

    if (action === "approval_decision") {
      return Response.json(await handleApprovalDecision(body, actor));
    }

    if (action === "send_vendor") {
      if (!roleCanManagePurchaseOrders(actor.role)) return Response.json({ error: "Only PO managers can send POs to vendors." }, { status: 403 });
      return Response.json({ purchaseOrder: await transitionOrder(poId, "Sent to Vendor", actor, "po_sent_to_vendor") });
    }

    if (action === "receive_line") {
      return Response.json(await handleReceiveLine(body, actor));
    }

    if (action === "create_invoice") {
      return Response.json(await handleCreateInvoice(body, actor));
    }

    if (action === "override_invoice") {
      return Response.json(await handleOverrideInvoice(body, actor));
    }

    if (action === "close_po") {
      if (!roleCanMatchInvoices(actor.role)) return Response.json({ error: "Only AP/Admin can close POs." }, { status: 403 });
      return Response.json({ purchaseOrder: await transitionOrder(poId, "Closed", actor, "po_closed", { payment_status: "closed" }) });
    }

    if (action === "cancel_po") {
      const reason = String(body.reason ?? "").trim();
      if (!roleCanManagePurchaseOrders(actor.role)) return Response.json({ error: "Only PO managers can cancel POs." }, { status: 403 });
      if (!reason) return Response.json({ error: "Cancellation reason is required." }, { status: 400 });
      return Response.json({ purchaseOrder: await transitionOrder(poId, "Cancelled", actor, "po_cancelled", { cancelled_reason: reason }) });
    }

    if (action === "save_vendor") {
      return Response.json({ vendor: await handleSaveVendor(body, actor) });
    }

    if (action === "save_approval_matrix_rule") {
      return Response.json({ rule: await handleSaveApprovalMatrixRule(body, actor) });
    }

    if (action === "deactivate_approval_matrix_rule") {
      return Response.json({ rule: await handleDeactivateApprovalMatrixRule(body, actor) });
    }

    if (action === "deactivate_vendor") {
      if (!roleCanManagePurchaseOrders(actor.role)) return Response.json({ error: "Only PO managers can deactivate vendors." }, { status: 403 });
      const vendorId = String(body.vendorId ?? "").trim();
      const { data: before } = await ensureAdminClient().from("inventory_vendors").select("*").eq("id", vendorId).single();
      const { data, error } = await ensureAdminClient()
        .from("inventory_vendors")
        .update({ active: false })
        .eq("id", vendorId)
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Vendor deactivate failed.");
      await writeAudit("vendor", vendorId, "vendor_deactivated", actor, before, data);
      return Response.json({ vendor: data });
    }

    return Response.json({ error: "Unknown PO action." }, { status: 400 });
  } catch (error) {
    const status = messageFromError(error).toLowerCase().includes("permission") ? 403 : 500;
    return Response.json({ error: messageFromError(error) }, { status });
  }
}
