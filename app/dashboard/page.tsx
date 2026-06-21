"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import ChangePasswordModal from "../../components/ChangePasswordModal";

type Profile = {
  fullName: string;
  role: string;
};

type TransactionRow = {
  id: string;
  type: string;
  company: string;
  joints: number;
  footage: number;
  fromLocation: string;
  toLocation: string;
  comment: string;
  createdAt: string;
};

type InventoryRow = {
  id: string;
  company: string;
  status: string;
  condition: string;
  partNumber: string;
  pipeRange: "Range 2" | "Range 3";
  location: string;
  joints: number;
  footage: number;
};

type SummaryLine = {
  label: string;
  joints: number;
  footage: number;
  lines: number;
};

const today = new Date();

function formatDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function weekStart() {
  const date = new Date(today);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function calculateRangeFootage(joints: number, pipeRange: string) {
  return Math.round(Number(joints || 0) * (pipeRange === "Range 3" ? 43.5 : 31.5) * 100) / 100;
}

function normalizePipeRange(value: unknown): "Range 2" | "Range 3" {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

function prettyType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function addToSummary(map: Map<string, SummaryLine>, label: string, joints: number, footage: number) {
  const key = label || "Unassigned";
  const current = map.get(key) ?? { label: key, joints: 0, footage: 0, lines: 0 };
  current.joints += joints;
  current.footage += footage;
  current.lines += 1;
  map.set(key, current);
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading employee dashboard...");
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function loadDashboard() {
    setLoading(true);
    setMessage("Loading employee dashboard...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      setMessage("Profile was not found.");
      setLoading(false);
      return;
    }

    if (profileData.role === "customer") {
      window.location.href = "/customer";
      return;
    }

    if (profileData.role === "inventory_specialist" || profileData.role === "inventory_manager") {
      window.location.href = "/home";
      return;
    }

    setProfile({
      fullName: profileData.full_name ?? "Team Member",
      role: profileData.role ?? "employee",
    });

    const start = weekStart().toISOString();

    const { data: transactionData, error: transactionError } = await supabase
      .from("pipe_transactions")
      .select(`
        id,
        transaction_type,
        quantity_joints,
        quantity_footage,
        from_location,
        to_location,
        comment,
        created_at,
        companies(name)
      `)
      .gte("created_at", start)
      .order("created_at", { ascending: false })
      .limit(300);

    if (transactionError) {
      setMessage(`Weekly transactions failed: ${transactionError.message}`);
      setLoading(false);
      return;
    }

    const { data: inventoryData, error: inventoryError } = await supabase
      .from("pipe_inventory")
      .select(`
        id,
        part_number,
        pipe_range,
        status,
        condition,
        bulk_joints,
        companies(name),
        racks(rack_code),
        workflow_zones(name, code)
      `)
      .neq("status", "Shipped")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (inventoryError) {
      setMessage(`Inventory dashboard failed: ${inventoryError.message}`);
      setLoading(false);
      return;
    }

    setTransactions(
      (transactionData ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;

        return {
          id: row.id,
          type: row.transaction_type ?? "",
          company: company?.name ?? "Unknown",
          joints: Number(row.quantity_joints ?? 0),
          footage: Number(row.quantity_footage ?? 0),
          fromLocation: row.from_location ?? "",
          toLocation: row.to_location ?? "",
          comment: row.comment ?? "",
          createdAt: formatDate(row.created_at),
        };
      })
    );

    setInventory(
      (inventoryData ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
        const rack = Array.isArray(row.racks) ? row.racks[0] : row.racks;
        const zone = Array.isArray(row.workflow_zones) ? row.workflow_zones[0] : row.workflow_zones;
        const pipeRange = normalizePipeRange(row.pipe_range);
        const joints = Number(row.bulk_joints ?? 0);

        return {
          id: row.id,
          company: company?.name ?? "Unknown",
          status: row.status ?? "",
          condition: row.condition ?? "",
          partNumber: row.part_number ?? "",
          pipeRange,
          location: rack?.rack_code ?? zone?.name ?? zone?.code ?? "Unassigned",
          joints,
          footage: calculateRangeFootage(joints, pipeRange),
        };
      })
    );

    setMessage("");
    setLoading(false);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const metrics = useMemo(() => {
    const received = transactions.filter((item) => item.type === "receive");
    const shipped = transactions.filter((item) => item.type === "ship");
    const transfers = transactions.filter((item) => item.type.includes("transfer"));
    const completed = transactions.filter((item) => item.type === "complete" || item.type === "edit_inventory");
    const totalInventory = inventory.reduce((sum, row) => sum + row.joints, 0);
    const totalFootage = inventory.reduce((sum, row) => sum + row.footage, 0);

    return [
      { label: "Received This Week", value: received.reduce((sum, row) => sum + row.joints, 0).toLocaleString(), detail: `${received.length} ticket activity lines` },
      { label: "Shipped This Week", value: shipped.reduce((sum, row) => sum + row.joints, 0).toLocaleString(), detail: `${shipped.length} shipment activity lines` },
      { label: "Transfers This Week", value: transfers.reduce((sum, row) => sum + row.joints, 0).toLocaleString(), detail: `${transfers.length} workstation/rack moves` },
      { label: "Completion / Edits", value: completed.length.toLocaleString(), detail: "completed or adjusted records" },
      { label: "Current Yard Joints", value: totalInventory.toLocaleString(), detail: `${Math.round(totalFootage).toLocaleString()} calculated ft` },
    ];
  }, [inventory, transactions]);

  const workZoneSummary = useMemo(() => {
    const map = new Map<string, SummaryLine>();
    inventory.forEach((row) => addToSummary(map, row.location, row.joints, row.footage));
    return [...map.values()].sort((a, b) => b.joints - a.joints).slice(0, 10);
  }, [inventory]);

  const statusSummary = useMemo(() => {
    const map = new Map<string, SummaryLine>();
    inventory.forEach((row) => addToSummary(map, row.status || "Unknown", row.joints, row.footage));
    return [...map.values()].sort((a, b) => b.joints - a.joints);
  }, [inventory]);

  const customerSummary = useMemo(() => {
    const map = new Map<string, SummaryLine>();
    inventory.forEach((row) => addToSummary(map, row.company, row.joints, row.footage));
    return [...map.values()].sort((a, b) => b.joints - a.joints).slice(0, 8);
  }, [inventory]);

  const maxZoneJoints = Math.max(1, ...workZoneSummary.map((line) => line.joints));

  if (loading) {
    return (
      <main className="dashboard-shell">
        <section className="empty-state">
          <h1>TITAN Dashboard</h1>
          <p>{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">TITAN Dashboard</div>
            <div className="brand-subtitle">Weekly transactions, work zones, and yard movement</div>
          </div>
        </button>
        <div className="dashboard-actions">
          <button className="button" onClick={() => (window.location.href = "/")}>Yard View</button>
          {(profile?.role === "admin" || profile?.role === "employee") && (
            <button className="button" onClick={() => (window.location.href = "/admin")}>Admin</button>
          )}
          <button className="button" onClick={() => setPasswordOpen(true)}>Password</button>
          <button className="button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      {message && <div className="modal-message">{message}</div>}

      <section className="dashboard-hero">
        <span>Welcome</span>
        <h1>{profile?.fullName ?? "Team Member"}</h1>
        <p>This screen shows what moved this week and where pipe is sitting right now.</p>
      </section>

      <section className="dashboard-metrics">
        {metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-card">
          <div className="card-heading">
            <h2>Work Zone Load</h2>
            <button className="button" onClick={loadDashboard}>Refresh</button>
          </div>
          {workZoneSummary.length === 0 && <p className="muted-text">No active inventory found.</p>}
          {workZoneSummary.map((line) => (
            <div key={line.label} className="bar-row">
              <div>
                <strong>{line.label}</strong>
                <span>{line.joints.toLocaleString()} joints / {Math.round(line.footage).toLocaleString()} ft</span>
              </div>
              <div className="bar-track">
                <span style={{ width: `${Math.max(4, (line.joints / maxZoneJoints) * 100)}%` }} />
              </div>
            </div>
          ))}
        </article>

        <article className="dashboard-card">
          <h2>Inventory By Status</h2>
          {statusSummary.length === 0 && <p className="muted-text">No status data found.</p>}
          {statusSummary.map((line) => (
            <div key={line.label} className="summary-row">
              <span>{line.label}</span>
              <strong>{line.joints.toLocaleString()} joints</strong>
              <small>{line.lines} lines / {Math.round(line.footage).toLocaleString()} ft</small>
            </div>
          ))}
        </article>

        <article className="dashboard-card">
          <h2>Inventory By Customer</h2>
          {customerSummary.length === 0 && <p className="muted-text">No customer inventory found.</p>}
          {customerSummary.map((line) => (
            <div key={line.label} className="summary-row">
              <span>{line.label}</span>
              <strong>{line.joints.toLocaleString()} joints</strong>
              <small>{line.lines} lines / {Math.round(line.footage).toLocaleString()} ft</small>
            </div>
          ))}
        </article>

        <article className="dashboard-card wide">
          <h2>Weekly Transaction Feed</h2>
          {transactions.length === 0 && <p className="muted-text">No transactions recorded this week.</p>}
          <div className="dashboard-feed">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="feed-row">
                <div>
                  <strong>{prettyType(transaction.type)}</strong>
                  <span>{transaction.company}</span>
                </div>
                <div>
                  <span>{transaction.fromLocation || "-"} to {transaction.toLocation || "-"}</span>
                  <small>{transaction.comment || "No comment"}</small>
                </div>
                <div>
                  <strong>{transaction.joints.toLocaleString()} joints</strong>
                  <span>{Math.round(transaction.footage).toLocaleString()} ft</span>
                  <small>{transaction.createdAt}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </main>
  );
}
