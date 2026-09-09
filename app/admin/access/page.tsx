"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  allRoleOptions,
  defaultModulesForRole,
  getDefaultPermissionsForRole,
  moduleAccessOptions,
  permissionActions,
  permissionModules,
  type ModuleKey,
  type PermissionAction,
  type PermissionModuleKey,
  type RoleKey,
} from "../../../lib/modulePermissions";
import { serviceLineOptions } from "../../../lib/serviceLines";
import { goBackOrFallback } from "../../../lib/navigation";
import styles from "./access.module.css";
type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: RoleKey;
  department: string | null;
  service_line: string | null;
  access_configured: boolean;
  company_id: string | null;
  is_disabled: boolean;
};
type ModuleRow = {
  user_id: string;
  module_key: ModuleKey;
  can_access: boolean;
  active: boolean;
};
type ExtraRow = {
  user_id: string;
  module_key: PermissionModuleKey;
  action_key: PermissionAction;
  is_allowed: boolean;
  active: boolean;
};
type YardRow = {
  user_id: string;
  yard_id: string;
  can_access: boolean;
  active: boolean;
};
type Location = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  owner_company_id: string | null;
};
type Event = {
  id: string;
  target_user_id: string;
  summary: string;
  created_at: string;
};
type Data = {
  profiles: Profile[];
  modules: ModuleRow[];
  extras: ExtraRow[];
  yards: YardRow[];
  locations: Location[];
  events: Event[];
  error?: string;
};
const actionLabels: Record<PermissionAction, string> = {
  view: "View",
  create: "Add",
  edit: "Change",
  delete: "Delete",
  approve: "Approve",
  close: "Close",
  export: "Export",
  manage_settings: "Manage settings",
  receive_notifications: "Receive notifications",
};
export default function AccessPage() {
  const [data, setData] = useState<Data | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<RoleKey>("customer");
  const [serviceLine, setServiceLine] = useState("");
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [yardIds, setYardIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading people and access...");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch("/api/admin-person-access", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await request.json()) as Data;
      if (!request.ok)
        throw new Error(body.error || "TITAN could not load access records.");
      setData(body);
      setMessage("");
      const requested =
        new URLSearchParams(window.location.search).get("user") || "";
      if (
        requested &&
        body.profiles.some((profile) => profile.id === requested)
      )
        setUserId(requested);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "TITAN could not load access records.",
      );
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const selected =
    data?.profiles.find((profile) => profile.id === userId) || null;
  const isCustomer = role === "customer";
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.profiles ?? []).filter(
      (profile) =>
        !q ||
        `${profile.full_name} ${profile.email} ${profile.role} ${profile.service_line}`
          .toLowerCase()
          .includes(q),
    );
  }, [data, search]);
  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      setRole(selected.role);
      setServiceLine(selected.service_line || "");
      const saved = (data?.modules ?? [])
        .filter(
          (row) => row.user_id === selected.id && row.active && row.can_access,
        )
        .map((row) => row.module_key);
      const selectedModules = selected.access_configured
        ? saved
        : defaultModulesForRole(selected.role);
      setModules(
        selected.role === "customer"
          ? selectedModules.filter((moduleKey) =>
              ["yard_view", "reports"].includes(moduleKey),
            )
          : selectedModules,
      );
      setExtras(
        selected.role === "customer"
          ? []
          : (data?.extras ?? [])
              .filter(
                (row) =>
                  row.user_id === selected.id && row.active && row.is_allowed,
              )
              .map((row) => `${row.module_key}:${row.action_key}`),
      );
      setYardIds(
        (data?.yards ?? [])
          .filter(
            (row) =>
              row.user_id === selected.id && row.active && row.can_access,
          )
          .map((row) => row.yard_id),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data, selected]);
  function toggle<T extends string>(
    value: T,
    setter: React.Dispatch<React.SetStateAction<T[]>>,
  ) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }
  function roleLabel(value: string) {
    return (
      allRoleOptions.find((item) => item.key === value)?.label ||
      value.replaceAll("_", " ")
    );
  }
  function chooseRole(value: RoleKey) {
    setRole(value);
    setModules(defaultModulesForRole(value));
    setExtras([]);
  }
  async function save() {
    if (!selected) return;
    const crossingCustomerBoundary =
      (selected.role === "customer") !== (role === "customer");
    const confirmRoleConversion = crossingCustomerBoundary
      ? window.confirm(
          `Change ${selected.full_name} from ${roleLabel(selected.role)} to ${roleLabel(role)}? This changes whether the account is treated as a customer or an internal employee.`,
        )
      : false;
    if (crossingCustomerBoundary && !confirmRoleConversion) return;
    setSaving(true);
    setMessage("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const request = await fetch("/api/admin-person-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          userId: selected.id,
          role,
          serviceLine,
          modules,
          yardIds,
          confirmRoleConversion,
          extras: extras.map((value) => {
            const [moduleKey, actionKey] = value.split(":");
            return { moduleKey, actionKey };
          }),
        }),
      });
      const body = await request.json();
      if (!request.ok)
        throw new Error(
          body.error || "TITAN could not save this access record.",
        );
      await load();
      setMessage(`Access saved for ${selected.full_name}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "TITAN could not save this access record.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className={styles.shell}>
      <header className={`${styles.header} titan-page-header`}>
        <div className={styles.brand}>
          <Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} />
          <div>
            <span>Administration</span>
            <h1>People & Access</h1>
          </div>
        </div>
        <div className={styles.actions}>
          <button onClick={() => goBackOrFallback("/admin")}>Back</button>
          <button
            className={styles.primary}
            disabled={!selected || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : "Save Access"}
          </button>
        </div>
      </header>
      {message ? <div className={styles.message}>{message}</div> : null}
      <div className={styles.layout}>
        <aside className={styles.people}>
          <label>
            <span>Find person</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, role..."
            />
          </label>
          {filtered.map((profile) => (
            <button
              key={profile.id}
              className={userId === profile.id ? styles.selected : ""}
              onClick={() => setUserId(profile.id)}
            >
              <strong>{profile.full_name || profile.email}</strong>
              <span>
                {roleLabel(profile.role)}
                {profile.service_line ? ` / ${profile.service_line}` : ""}
              </span>
              {profile.is_disabled ? <b>Disabled</b> : null}
            </button>
          ))}
        </aside>
        <section className={styles.content}>
          {!selected ? (
            <div className={styles.empty}>
              Choose a person to review and change their access.
            </div>
          ) : (
            <>
              <div className={styles.personHead}>
                <div>
                  <span>Access belongs to the person</span>
                  <h2>{selected.full_name}</h2>
                  <p>{selected.email}</p>
                </div>
                <div>
                  <label>
                    <span>Role</span>
                    <select
                      value={role}
                      onChange={(event) =>
                        chooseRole(event.target.value as RoleKey)
                      }
                    >
                      {allRoleOptions.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Service Line</span>
                    <select
                      value={serviceLine}
                      onChange={(event) => setServiceLine(event.target.value)}
                    >
                      <option value="">All / Not scoped</option>
                      {serviceLineOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {isCustomer && !selected.company_id ? (
                <div className={styles.warning}>
                  This customer has no company assigned. Assign a company in
                  User Management before saving access.
                </div>
              ) : null}
              <section className={styles.section}>
                <div>
                  <h3>Modules</h3>
                  <p>
                    {roleLabel(role)} provides the starting selection. These are
                    the TITAN areas this person can open.
                  </p>
                </div>
                <div className={styles.moduleGrid}>
                  {moduleAccessOptions
                    .filter(
                      (item) =>
                        !isCustomer ||
                        ["yard_view", "reports"].includes(item.key),
                    )
                    .map((item) => (
                      <label key={item.key}>
                        <input
                          type="checkbox"
                          checked={modules.includes(item.key)}
                          onChange={() => toggle(item.key, setModules)}
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                      </label>
                    ))}
                </div>
              </section>
              {!isCustomer ? (
                <section className={styles.section}>
                  <div>
                    <h3>Anything Extra?</h3>
                    <p>
                      Add abilities beyond the role. Extras never remove
                      something the role already provides.
                    </p>
                  </div>
                  <div className={styles.extraList}>
                    {permissionModules.map((module) => {
                      const defaults =
                        getDefaultPermissionsForRole(role)[module.key];
                      const choices = permissionActions.filter(
                        (action) => !defaults[action],
                      );
                      if (!choices.length) return null;
                      return (
                        <div key={module.key}>
                          <strong>{module.label}</strong>
                          <span>
                            {choices.map((action) => {
                              const key = `${module.key}:${action}`;
                              return (
                                <label key={key}>
                                  <input
                                    type="checkbox"
                                    checked={extras.includes(key)}
                                    onChange={() => toggle(key, setExtras)}
                                  />
                                  {actionLabels[action]}
                                </label>
                              );
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              <section className={styles.section}>
                <div>
                  <h3>Yards</h3>
                  <p>Only selected yards are available to this person.</p>
                </div>
                <div className={styles.yards}>
                  {(data?.locations ?? [])
                    .filter(
                      (yard) =>
                        (!isCustomer ||
                          yard.owner_company_id === selected.company_id) &&
                        (yard.is_active || yardIds.includes(yard.id)),
                    )
                    .map((yard) => (
                      <label key={yard.id}>
                        <input
                          type="checkbox"
                          checked={yardIds.includes(yard.id)}
                          onChange={() => toggle(yard.id, setYardIds)}
                        />
                        <span>
                          <strong>{yard.name}</strong>
                          <small>{yard.code}</small>
                        </span>
                      </label>
                    ))}
                </div>
              </section>
              <section className={styles.section}>
                <div>
                  <h3>Recent Access Changes</h3>
                </div>
                <div className={styles.audit}>
                  {(data?.events ?? [])
                    .filter((event) => event.target_user_id === selected.id)
                    .slice(0, 12)
                    .map((event) => (
                      <div key={event.id}>
                        <strong>{event.summary}</strong>
                        <time>
                          {new Date(event.created_at).toLocaleString()}
                        </time>
                      </div>
                    ))}
                  {!(data?.events ?? []).some(
                    (event) => event.target_user_id === selected.id,
                  ) ? (
                    <p>No access changes have been recorded yet.</p>
                  ) : null}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
