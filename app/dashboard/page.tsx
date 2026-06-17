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

type DtiJobRow = {
  id: string;
  jobNumber: string;
  company: string;
  jobDate: string;
  rig: string;
  operator: string;
  leadInspector: string;
  crewLead: string;
  status: string;
  closedAt: string;
};

type DtiScoreRow = {
  dtiJobId: string;
  section: string;
  category: string;
  score: number | null;
  redFlag: boolean;
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

function getJoinedName(value: unknown) {
  const readName = (item: unknown) => {
    if (!item || typeof item !== "object" || !("name" in item)) return "";
    const name = (item as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  };

  if (Array.isArray(value)) return readName(value[0]);
  return readName(value);
}

function letterGrade(score: number) {
  if (!Number.isFinite(score) || score <= 0) return "N/A";
  const rounded = Math.round(score);
  if (rounded >= 5) return "A";
  if (rounded === 4) return "B";
  if (rounded === 3) return "C";
  if (rounded === 2) return "D";
  return "F";
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
  const [dtiJobs, setDtiJobs] = useState<DtiJobRow[]>([]);
  const [dtiScores, setDtiScores] = useState<DtiScoreRow[]>([]);
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

    const { data: dtiJobData, error: dtiJobError } = await supabase
      .from("dti_jobs")
      .select(`
        id,
        job_number,
        job_date,
        rig,
        operator,
        lead_inspector,
        crew_lead,
        status,
        closed_at,
        companies(name)
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    if (dtiJobError) {
      setMessage(`DTI performance failed: ${dtiJobError.message}`);
      setDtiJobs([]);
      setDtiScores([]);
      setLoading(false);
      return;
    }

    const dtiJobIds = (dtiJobData ?? []).map((job: any) => job.id);
    const { data: dtiScoreData, error: dtiScoreError } = dtiJobIds.length
      ? await supabase
          .from("dti_checklist_responses")
          .select("dti_job_id, section, category, score, red_flag")
          .in("dti_job_id", dtiJobIds)
      : { data: [], error: null };

    if (dtiScoreError) {
      setMessage(`DTI scorecards failed: ${dtiScoreError.message}`);
      setDtiJobs([]);
      setDtiScores([]);
      setLoading(false);
      return;
    }

    setDtiJobs(
      (dtiJobData ?? []).map((job: any) => ({
        id: job.id,
        jobNumber: job.job_number ?? "",
        company: getJoinedName(job.companies) || "Unknown",
        jobDate: formatDate(job.job_date),
        rig: job.rig ?? "",
        operator: job.operator ?? "",
        leadInspector: job.lead_inspector ?? "",
        crewLead: job.crew_lead ?? "",
        status: job.status ?? "",
        closedAt: job.closed_at ?? "",
      }))
    );

    setDtiScores(
      (dtiScoreData ?? []).map((score: any) => ({
        dtiJobId: score.dti_job_id ?? "",
        section: score.section ?? "",
        category: score.category ?? "",
        score: score.score === null || score.score === undefined ? null : Number(score.score),
        redFlag: Boolean(score.red_flag),
      }))
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

  const leadInspectorPerformance = useMemo(() => {
    const byLead = new Map<string, DtiJobRow[]>();
    dtiJobs.forEach((job) => {
      const lead = job.leadInspector || "Unassigned";
      byLead.set(lead, [...(byLead.get(lead) ?? []), job]);
    });

    return [...byLead.entries()]
      .map(([lead, leadJobs]) => {
        const jobIds = new Set(leadJobs.map((job) => job.id));
        const scores = dtiScores.filter((score) => jobIds.has(score.dtiJobId));
        const numericScores = scores.filter((score) => score.score !== null);
        const average = numericScores.length
          ? numericScores.reduce((sum, score) => sum + Number(score.score ?? 0), 0) / numericScores.length
          : 0;

        const redFlags = scores.filter((score) => score.redFlag || (score.score !== null && score.score <= 2)).length;

        const categoryMap = new Map<string, number[]>();
        numericScores.forEach((score) => {
          const key = score.category || score.section || "General";
          categoryMap.set(key, [...(categoryMap.get(key) ?? []), Number(score.score)]);
        });

        const categoryAverages = [...categoryMap.entries()]
          .map(([label, values]) => ({
            label,
            average: values.reduce((sum, value) => sum + value, 0) / values.length,
          }))
          .sort((a, b) => b.average - a.average);

        const operatorMap = new Map<string, { scores: number[]; jobs: number }>();
        leadJobs.forEach((job) => {
          const jobScores = dtiScores
            .filter((score) => score.dtiJobId === job.id && score.score !== null)
            .map((score) => Number(score.score));
          const key = job.operator || "Unassigned";
          const current = operatorMap.get(key) ?? { scores: [], jobs: 0 };
          current.scores.push(...jobScores);
          current.jobs += 1;
          operatorMap.set(key, current);
        });

        const bestOperator = [...operatorMap.entries()]
          .map(([operator, item]) => ({
            operator,
            jobs: item.jobs,
            average: item.scores.length
              ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
              : 0,
          }))
          .sort((a, b) => b.average - a.average || b.jobs - a.jobs)[0];

        return {
          lead,
          jobs: leadJobs.length,
          closedJobs: leadJobs.filter((job) => job.status === "Closed").length,
          average,
          grade: letterGrade(average),
          redFlags,
          strength: categoryAverages[0]?.label ?? "No scored categories yet",
          weakness: categoryAverages[categoryAverages.length - 1]?.label ?? "No scored categories yet",
          bestOperator: bestOperator ? `${bestOperator.operator} (${bestOperator.average.toFixed(1)})` : "No operator data yet",
        };
      })
      .sort((a, b) => b.average - a.average || b.jobs - a.jobs || a.lead.localeCompare(b.lead));
  }, [dtiJobs, dtiScores]);

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
          <h2>Lead Inspector Performance</h2>
          <p className="muted-text">
            Rankings are based on DTI scorecards. Strengths and focus areas come from section averages.
          </p>

          {leadInspectorPerformance.length === 0 && (
            <p className="muted-text">No DTI scorecard data found yet.</p>
          )}

          {leadInspectorPerformance.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Lead Inspector</th>
                    <th>Jobs</th>
                    <th>Average</th>
                    <th>Grade</th>
                    <th>Red Flags</th>
                    <th>Strongest Operator</th>
                    <th>Strength</th>
                    <th>Focus Area</th>
                  </tr>
                </thead>
                <tbody>
                  {leadInspectorPerformance.map((lead, index) => (
                    <tr key={lead.lead}>
                      <td>{index + 1}</td>
                      <td>{lead.lead}</td>
                      <td>{lead.jobs}</td>
                      <td>{lead.average.toFixed(1)}</td>
                      <td>{lead.grade}</td>
                      <td>{lead.redFlags}</td>
                      <td>{lead.bestOperator}</td>
                      <td>{lead.strength}</td>
                      <td>{lead.weakness}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
