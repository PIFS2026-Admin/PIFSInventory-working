"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Company = {
  id: string;
  name: string;
  accountNumber: string;
  isActive: boolean;
};

type Profile = {
  id: string;
  fullName: string;
  role: "admin" | "employee" | "customer";
  companyId: string;
  companyName: string;
};

type Yard = {
  id: string;
  name: string;
  code: string;
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

type AdminUserForm = {
  email: string;
  password: string;
  fullName: string;
  role: "admin" | "employee" | "customer";
  companyId: string;
};

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

export default function AdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState("");
  const [racks, setRacks] = useState<Rack[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [userForm, setUserForm] = useState<AdminUserForm>(emptyUserForm);
  const [rackForm, setRackForm] = useState(emptyRackForm);
  const [zoneForm, setZoneForm] = useState(emptyZoneForm);

  const [message, setMessage] = useState("Loading admin tools...");
  const [loading, setLoading] = useState(false);

  const activeCompanies = useMemo(
    () => companies.filter((company) => company.isActive),
    [companies]
  );

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
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "employee"].includes(profile.role)) {
      setMessage("You do not have access to admin tools.");
      return;
    }

    await Promise.all([loadCompanies(), loadProfiles(), loadYards()]);
    setMessage("");
  }

  async function loadCompanies() {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, account_number, is_active")
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
    const { data, error } = await supabase
      .from("yards")
      .select("id, name, code")
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Yards failed: ${error.message}`);
      return;
    }

    const mapped = (data ?? []).map((yard: any) => ({
      id: yard.id,
      name: yard.name ?? "",
      code: yard.code ?? "",
    }));

    setYards(mapped);

    const nextYardId = selectedYardId || mapped[0]?.id || "";
    setSelectedYardId(nextYardId);

    if (nextYardId) {
      await Promise.all([loadRacks(nextYardId), loadZones(nextYardId)]);
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

    setRacks(
      (data ?? []).map((rack: any) => ({
        id: rack.id,
        rackCode: rack.rack_code ?? "",
        capacityJoints: Number(rack.capacity_joints ?? 500),
        sortOrder: Number(rack.sort_order ?? 0),
        isActive: rack.is_active !== false,
      }))
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
    await Promise.all([loadCompanies(), loadProfiles(), loadYards()]);
    setMessage("Admin tools refreshed.");
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

  async function createUser() {
    setMessage("");

    if (!userForm.email || !userForm.password || !userForm.fullName) {
      setMessage("Email, password, and full name are required.");
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
      body: JSON.stringify(userForm),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error ?? "Could not create user.");
      setLoading(false);
      return;
    }

    setUserForm(emptyUserForm);
    await loadProfiles();
    setMessage(`User created: ${result.email}`);
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

  async function createRack() {
    setMessage("");

    if (!selectedYardId || !rackForm.rackCode.trim()) {
      setMessage("Rack code is required.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("racks").insert({
      yard_id: selectedYardId,
      rack_code: rackForm.rackCode.trim().toUpperCase(),
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
    loadAdmin();
  }, []);

  return (
    <main className="customer-shell">
      <header className="customer-topbar">
        <div className="brand">
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">TITAN Admin</div>
            <div className="brand-subtitle">Companies, users, racks, and work zones</div>
          </div>
        </div>

        <div className="customer-actions">
          <button className="button" onClick={refreshAdmin} disabled={loading}>
            Refresh
          </button>
          <button className="button" onClick={() => (window.location.href = "/")}>
            Yard View
          </button>
          <button className="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      {message && <div className="modal-message">{message}</div>}

      <section className="admin-grid">
        <div className="ticket-card admin-card">
          <h3>Create Company</h3>

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

        <div className="ticket-card admin-card">
          <h3>Create User</h3>

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
            Temporary Password
            <input
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
              placeholder="Temporary password"
            />
          </label>

          <label>
            Role
            <select
              value={userForm.role}
              onChange={(event) =>
                setUserForm({
                  ...userForm,
                  role: event.target.value as AdminUserForm["role"],
                  companyId: event.target.value === "customer" ? userForm.companyId : "",
                })
              }
            >
              <option value="customer">Customer</option>
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

          <button className="button primary" onClick={createUser} disabled={loading}>
            Create User
          </button>
        </div>
      </section>

      <section className="ticket-card admin-card">
        <h3>Companies</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Account</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>{company.name}</td>
                  <td>{company.accountNumber || "-"}</td>
                  <td>{company.isActive ? "Active" : "Disabled"}</td>
                  <td>
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
      </section>

      <section className="ticket-card admin-card">
        <h3>Users</h3>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ticket-card admin-card">
        <h3>Yard Setup</h3>

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
                Rack Code
                <input
                  value={rackForm.rackCode}
                  onChange={(event) => setRackForm({ ...rackForm, rackCode: event.target.value })}
                  placeholder="A1"
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
            <button className="button primary" onClick={createRack} disabled={loading}>
              Add Rack
            </button>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rack</th>
                    <th>Capacity</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {racks.map((rack) => (
                    <tr key={rack.id}>
                      <td>{rack.rackCode}</td>
                      <td>{rack.capacityJoints}</td>
                      <td>{rack.isActive ? "Active" : "Disabled"}</td>
                      <td>
                        <button
                          className="button"
                          onClick={() => {
                            const rackCode = window.prompt("Rack code", rack.rackCode);
                            if (rackCode) updateRack(rack, { rackCode: rackCode.trim().toUpperCase() });
                          }}
                        >
                          Rename
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
      </section>
    </main>
  );
}
