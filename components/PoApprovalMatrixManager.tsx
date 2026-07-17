"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatPoMoney } from "../lib/purchaseOrderLifecycle";
import styles from "../app/purchase-orders/purchase-orders.module.css";

type InventoryYard = {
  id: string;
  name: string;
  code: string;
};

type InternalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ApprovalMatrixRule = {
  id: string;
  yardId: string;
  department: string;
  costCenter: string;
  minAmount: number;
  maxAmount: number | null;
  tier: number;
  approverRole: string;
  approverId: string;
  approverName: string;
  active: boolean;
  notes: string;
};

type MatrixForm = {
  ruleId: string;
  yardId: string;
  department: string;
  costCenter: string;
  minAmount: string;
  maxAmount: string;
  tier: string;
  approverRole: string;
  approverId: string;
  notes: string;
  active: boolean;
};

const emptyMatrixForm: MatrixForm = {
  ruleId: "",
  yardId: "",
  department: "",
  costCenter: "",
  minAmount: "0",
  maxAmount: "",
  tier: "1",
  approverRole: "manager",
  approverId: "",
  notes: "",
  active: true,
};

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function canManagePoApprovalMatrix(fullName: string, email: string, role: string) {
  const normalizedName = fullName.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = normalizeRole(role);

  return (
    normalizedRole === "owner" ||
    normalizedName === "wade wisenor" ||
    normalizedName === "nick grant" ||
    normalizedEmail === "wade@pathfinderinspections.com" ||
    normalizedEmail === "nick.grant@pathfinderinspections.com" ||
    normalizedEmail === "ngrant@pathfinderinspections.com"
  );
}

export default function PoApprovalMatrixManager() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [yards, setYards] = useState<InventoryYard[]>([]);
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([]);
  const [rules, setRules] = useState<ApprovalMatrixRule[]>([]);
  const [form, setForm] = useState<MatrixForm>(emptyMatrixForm);
  const [setupMissing, setSetupMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canManage = useMemo(
    () => canManagePoApprovalMatrix(fullName, email, role),
    [email, fullName, role],
  );

  useEffect(() => {
    void loadManager();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadManager() {
    setLoading(true);
    setMessage("Loading PO approval matrix...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .single();

    const nextFullName = profile?.full_name || user.email || "";
    const nextEmail = profile?.email || user.email || "";
    const nextRole = normalizeRole(profile?.role);
    setFullName(nextFullName);
    setEmail(nextEmail);
    setRole(nextRole);

    if (!canManagePoApprovalMatrix(nextFullName, nextEmail, nextRole)) {
      setMessage("PO Approval Matrix is restricted to Wade Wisenor, Nick Grant, and Owners.");
      setLoading(false);
      return;
    }

    await Promise.all([loadYards(), loadInternalUsers(), loadRules()]);
    setMessage("");
    setLoading(false);
  }

  async function loadYards() {
    const { data, error } = await supabase
      .from("yards")
      .select("id, name, code")
      .order("name");
    if (error) {
      setMessage(`Yards failed: ${error.message}`);
      return;
    }
    setYards((data || []).map((yard) => ({
      id: yard.id,
      name: yard.name || yard.code || "Inventory Yard",
      code: yard.code || "",
    })));
  }

  async function loadInternalUsers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .neq("role", "customer")
      .order("full_name");
    if (error) {
      setMessage(`Internal users failed: ${error.message}`);
      return;
    }
    setInternalUsers((data || []).map((row) => ({
      id: row.id,
      name: row.full_name || row.email || "TITAN User",
      email: row.email || "",
      role: normalizeRole(row.role),
    })));
  }

  async function loadRules() {
    const { data, error } = await supabase
      .from("purchase_order_approval_matrix")
      .select("*")
      .order("tier", { ascending: true })
      .order("min_amount", { ascending: true });
    if (error) {
      setSetupMissing(true);
      setRules([]);
      return;
    }
    setSetupMissing(false);
    setRules((data || []).map((row) => ({
      id: row.id,
      yardId: row.yard_id || "",
      department: row.department || "",
      costCenter: row.cost_center || "",
      minAmount: numberValue(row.min_amount),
      maxAmount: row.max_amount === null || row.max_amount === undefined ? null : numberValue(row.max_amount),
      tier: Number(row.tier || 1),
      approverRole: normalizeRole(row.approver_role || "manager"),
      approverId: row.approver_id || "",
      approverName: row.approver_name || "",
      active: row.active !== false,
      notes: row.notes || "",
    })));
  }

  async function lifecycleAction(action: string, payload: Record<string, unknown> = {}) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your login session expired. Sign in again.");

    const response = await fetch("/api/purchase-orders/lifecycle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "PO approval matrix action failed.");
    return result;
  }

  function editRule(rule: ApprovalMatrixRule) {
    setForm({
      ruleId: rule.id,
      yardId: rule.yardId,
      department: rule.department,
      costCenter: rule.costCenter,
      minAmount: String(rule.minAmount),
      maxAmount: rule.maxAmount === null ? "" : String(rule.maxAmount),
      tier: String(rule.tier),
      approverRole: rule.approverRole || "manager",
      approverId: rule.approverId,
      notes: rule.notes,
      active: rule.active,
    });
  }

  async function saveRule() {
    const approver = internalUsers.find((user) => user.id === form.approverId);
    setSaving(true);
    setMessage("");
    try {
      await lifecycleAction("save_approval_matrix_rule", {
        ...form,
        approverName: approver?.name || "",
      });
      await loadRules();
      setForm(emptyMatrixForm);
      setMessage("Approval matrix rule saved.");
    } catch (error) {
      setMessage(`Approval matrix save failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRule(rule: ApprovalMatrixRule) {
    if (!window.confirm(`Deactivate this approval rule for tier ${rule.tier}?`)) return;
    setSaving(true);
    setMessage("");
    try {
      await lifecycleAction("deactivate_approval_matrix_rule", { ruleId: rule.id });
      await loadRules();
      setMessage("Approval matrix rule deactivated.");
    } catch (error) {
      setMessage(`Approval matrix deactivate failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setSaving(false);
    }
  }

  if (!canManage && !loading) {
    return <p className="modal-message">{message}</p>;
  }

  return (
    <section className={styles.scope}>
      {message && <div className="modal-message">{message}</div>}
      {setupMissing && (
        <p className="po-warning">
          Approval matrix table is not installed yet. Run <strong>supabase/titan_po_approval_matrix.sql</strong>, then refresh.
        </p>
      )}

      <section className="po-two-column wide-left">
        <article className="ticket-card admin-card">
          <div className="detail-title-row">
            <div>
              <h3>Approval Matrix</h3>
              <p>Route approvals by yard, department, cost code, dollar range, tier, role, and named approver.</p>
            </div>
            <button className="button" type="button" onClick={() => setForm(emptyMatrixForm)}>
              Blank Rule
            </button>
          </div>

          <div className="form-grid">
            <label>Yard
              <select value={form.yardId} onChange={(event) => setForm({ ...form, yardId: event.target.value })}>
                <option value="">All yards</option>
                {yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.name}</option>)}
              </select>
            </label>
            <label>Department<input value={form.department} placeholder="Blank = all departments" onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
            <label>Cost Code<input value={form.costCenter} placeholder="Blank = all cost codes" onChange={(event) => setForm({ ...form, costCenter: event.target.value })} /></label>
            <label>Min Amount<input type="number" value={form.minAmount} onChange={(event) => setForm({ ...form, minAmount: event.target.value })} /></label>
            <label>Max Amount<input type="number" value={form.maxAmount} placeholder="No max" onChange={(event) => setForm({ ...form, maxAmount: event.target.value })} /></label>
            <label>Tier<input type="number" value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value })} /></label>
            <label>Approver Role
              <select value={form.approverRole} onChange={(event) => setForm({ ...form, approverRole: event.target.value })}>
                <option value="manager">Manager</option>
                <option value="director">Director</option>
                <option value="finance">Finance / AP</option>
                <option value="inventory_manager">Inventory Manager</option>
                <option value="office_admin">Office Admin</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label>Named Approver
              <select value={form.approverId} onChange={(event) => setForm({ ...form, approverId: event.target.value })}>
                <option value="">Role-based approval</option>
                {internalUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} / {user.role.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-line"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active rule</label>
            <label className="full">Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>

          <div className="slide-actions">
            <button className="button primary" onClick={saveRule} disabled={saving || loading || setupMissing}>
              {form.ruleId ? "Update Rule" : "Save Rule"}
            </button>
            <button className="button" onClick={() => setForm(emptyMatrixForm)}>Clear</button>
            <button className="button" onClick={loadManager} disabled={loading || saving}>Refresh</button>
          </div>
        </article>

        <article className="ticket-card admin-card">
          <h3>Active Routing Rules</h3>
          <div className="po-table-wrap">
            <table className="po-table">
              <thead><tr><th>Scope</th><th>Amount</th><th>Tier</th><th>Approver</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {rules.map((rule) => {
                  const yard = yards.find((item) => item.id === rule.yardId);
                  const user = internalUsers.find((item) => item.id === rule.approverId);
                  return (
                    <tr key={rule.id}>
                      <td>
                        <strong>{yard?.name || "All yards"}</strong><br />
                        <span>{rule.department || "All departments"} / {rule.costCenter || "All cost codes"}</span>
                      </td>
                      <td>{formatPoMoney(rule.minAmount)} - {rule.maxAmount === null ? "No max" : formatPoMoney(rule.maxAmount)}</td>
                      <td>{rule.tier}</td>
                      <td>
                        <strong>{user?.name || rule.approverName || rule.approverRole.replaceAll("_", " ")}</strong><br />
                        <span>{rule.approverRole.replaceAll("_", " ")}</span>
                      </td>
                      <td>{rule.active ? "Active" : "Inactive"}</td>
                      <td className="po-row-actions">
                        <button className="mini-button" onClick={() => editRule(rule)}>Edit</button>
                        {rule.active && <button className="mini-button danger" onClick={() => deactivateRule(rule)}>Deactivate</button>}
                      </td>
                    </tr>
                  );
                })}
                {rules.length === 0 && <tr><td colSpan={6}>No approval matrix rules yet. The dollar-tier fallback is still active.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </section>
  );
}
