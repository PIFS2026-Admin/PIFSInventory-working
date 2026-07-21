"use client";

import { useEffect, useMemo, useState } from "react";
import NotificationCenter from "../../components/NotificationCenter";
import { supabase } from "../../lib/supabase";
import styles from "./crm.module.css";

type DiscoveryColumn = {
  id: string;
  title: string;
  type: string;
  archived?: boolean;
};

type DiscoveryGroup = {
  id: string;
  title: string;
  archived?: boolean;
  deleted?: boolean;
};

type DiscoveryItem = {
  id: string;
  name: string;
  state?: string;
  group?: { id: string; title: string } | null;
  column_values?: Array<{ id: string; type: string; text: string; value: string | null }>;
};

type DiscoveryBoard = {
  id: string;
  name: string;
  description?: string;
  state?: string;
  type?: string;
  permissions?: string;
  items_count?: number;
  groups?: DiscoveryGroup[];
  columns?: DiscoveryColumn[];
  owners?: Array<{ id: string; name: string; email?: string }>;
  subscribers?: Array<{ id: string; name: string; email?: string }>;
  items_page?: {
    cursor?: string;
    items?: DiscoveryItem[];
  };
};

type DiscoveryResult = {
  configured?: boolean;
  message?: string;
  boards?: DiscoveryBoard[];
  generatedAt?: string;
  error?: string;
};

type AccessState = {
  loading: boolean;
  allowed: boolean;
  message: string;
  role: string;
};

function countActive<T extends { archived?: boolean; deleted?: boolean }>(rows?: T[]) {
  return (rows ?? []).filter((row) => !row.archived && !row.deleted).length;
}

function fieldTypeCounts(boards: DiscoveryBoard[]) {
  const counts = new Map<string, number>();

  boards.forEach((board) => {
    (board.columns ?? []).forEach((column) => {
      if (column.archived) return;
      counts.set(column.type || "unknown", (counts.get(column.type || "unknown") ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function sampleValues(board: DiscoveryBoard, columnId: string) {
  const values = (board.items_page?.items ?? [])
    .map((item) => item.column_values?.find((column) => column.id === columnId)?.text?.trim())
    .filter(Boolean) as string[];

  return Array.from(new Set(values)).slice(0, 3).join(" / ") || "-";
}

function moduleCanOpen(moduleKeys: unknown[], role: string) {
  if (["admin", "owner"].includes(role)) return true;
  return moduleKeys.map(String).includes("crm");
}

export default function CrmPage() {
  const [access, setAccess] = useState<AccessState>({
    loading: true,
    allowed: false,
    message: "Checking CRM access...",
    role: "",
  });
  const [boardIds, setBoardIds] = useState("");
  const [itemLimit, setItemLimit] = useState("25");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [runningDiscovery, setRunningDiscovery] = useState(false);

  const boards = useMemo(() => result?.boards ?? [], [result?.boards]);
  const totals = useMemo(() => {
    return {
      boards: boards.length,
      groups: boards.reduce((sum, board) => sum + countActive(board.groups), 0),
      columns: boards.reduce((sum, board) => sum + countActive(board.columns), 0),
      items: boards.reduce((sum, board) => sum + Number(board.items_count ?? board.items_page?.items?.length ?? 0), 0),
    };
  }, [boards]);
  const columnTypeCounts = useMemo(() => fieldTypeCounts(boards), [boards]);

  useEffect(() => {
    async function loadAccess() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/my-module-permissions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAccess({
          loading: false,
          allowed: false,
          message: payload.error || "CRM access could not be checked.",
          role: "",
        });
        return;
      }

      const role = String(payload.role ?? "");
      const allowed = moduleCanOpen(payload.moduleKeys ?? [], role);
      setAccess({
        loading: false,
        allowed,
        message: allowed ? "" : "You do not have CRM access yet. Ask an admin to enable the CRM module for your user.",
        role,
      });
    }

    loadAccess();
  }, []);

  async function runDiscovery() {
    setRunningDiscovery(true);
    setResult(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch("/api/monday/discovery", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        boardIds,
        itemLimit: Number(itemLimit || 25),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    setResult(response.ok ? payload : { error: payload.error || "Monday discovery failed." });
    setRunningDiscovery(false);
  }

  if (access.loading) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>CRM</span>
          <h1>Loading CRM...</h1>
        </section>
      </main>
    );
  }

  if (!access.allowed) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>CRM</span>
          <h1>CRM Access Needed</h1>
          <p>{access.message}</p>
          <button className="button" type="button" onClick={() => (window.location.href = "/home")}>
            Back to Home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <button className={styles.brand} type="button" onClick={() => (window.location.href = "/home")}>
          <img src="/titan_logo.jpg" alt="" />
          <span>TITAN by Pathfinder Inspections</span>
        </button>
        <div className={styles.headerActions}>
          <NotificationCenter />
          <button className="button" type="button" onClick={() => (window.location.href = "/home")}>
            Home
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>CRM Migration Command Center</span>
          <h1>Build TITAN CRM from Monday without risking live customer data.</h1>
          <p>
            This page is the safe first step: discover Monday boards, columns, groups, and sample records before any import or overwrite happens.
          </p>
        </div>
        <div className={styles.safeBox}>
          <strong>Read-only mode</strong>
          <span>No TITAN customers, companies, contacts, or opportunities are created from this screen.</span>
        </div>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.dot} />
            <h2>Monday Discovery</h2>
          </div>
          <p>
            Enter the Monday board IDs for your CRM boards. Leave blank to let Monday return the first available boards your API token can see.
          </p>
          <label className={styles.field}>
            <span>Monday board IDs</span>
            <textarea
              value={boardIds}
              onChange={(event) => setBoardIds(event.target.value)}
              placeholder="Example: 1234567890, 9876543210"
              rows={3}
            />
          </label>
          <label className={styles.field}>
            <span>Sample items per board</span>
            <input value={itemLimit} onChange={(event) => setItemLimit(event.target.value)} inputMode="numeric" />
          </label>
          <button className="button primary" type="button" onClick={runDiscovery} disabled={runningDiscovery}>
            {runningDiscovery ? "Running Discovery..." : "Run Read-Only Discovery"}
          </button>
          {access.role && <small className={styles.muted}>Signed in as {access.role.replace(/_/g, " ")}.</small>}
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>
            <span className={styles.dot} />
            <h2>Migration Rules</h2>
          </div>
          <ul className={styles.ruleList}>
            <li>Existing TITAN customers stay untouched until mapping is approved.</li>
            <li>Monday columns become mapped CRM fields, not random one-off database columns.</li>
            <li>Every future import gets a batch ID and reconciliation report.</li>
            <li>Automation and notifications stay server-controlled and auditable.</li>
          </ul>
        </article>
      </section>

      {result?.error && <section className={styles.errorBox}>{result.error}</section>}

      {result && !result.error && (
        <>
          <section className={styles.metrics}>
            <article>
              <span>Boards</span>
              <strong>{totals.boards}</strong>
            </article>
            <article>
              <span>Groups</span>
              <strong>{totals.groups}</strong>
            </article>
            <article>
              <span>Columns</span>
              <strong>{totals.columns}</strong>
            </article>
            <article>
              <span>Items</span>
              <strong>{totals.items}</strong>
            </article>
          </section>

          <section className={styles.card}>
            <div className={styles.cardTitle}>
              <span className={styles.dot} />
              <h2>Discovery Results</h2>
            </div>
            <p>{result.message}</p>
            {!result.configured && (
              <p className={styles.warning}>
                Add MONDAY_API_TOKEN to the deployed server environment before running live discovery.
              </p>
            )}
            {columnTypeCounts.length > 0 && (
              <div className={styles.chips}>
                {columnTypeCounts.map(([type, count]) => (
                  <span key={type}>{type}: {count}</span>
                ))}
              </div>
            )}
          </section>

          {boards.map((board) => (
            <section className={styles.boardCard} key={board.id}>
              <div className={styles.boardHeader}>
                <div>
                  <span className={styles.eyebrow}>Monday Board {board.id}</span>
                  <h2>{board.name}</h2>
                  <p>{board.description || "No board description returned."}</p>
                </div>
                <div className={styles.boardStats}>
                  <span>{board.items_count ?? board.items_page?.items?.length ?? 0} items</span>
                  <span>{countActive(board.groups)} groups</span>
                  <span>{countActive(board.columns)} columns</span>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Monday Column</th>
                      <th>Type</th>
                      <th>Likely TITAN CRM Field</th>
                      <th>Sample Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(board.columns ?? []).filter((column) => !column.archived).map((column) => (
                      <tr key={column.id}>
                        <td>{column.title}</td>
                        <td>{column.type}</td>
                        <td>{column.title.toLowerCase().includes("phone") ? "Contact phone" : column.title.toLowerCase().includes("email") ? "Contact email" : "Custom field / mapping needed"}</td>
                        <td>{sampleValues(board, column.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
