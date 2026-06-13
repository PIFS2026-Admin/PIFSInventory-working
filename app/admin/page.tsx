"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Company = {
  id: string;
  name: string;
};

type AdminUserForm = {
  email: string;
  password: string;
  fullName: string;
  role: "admin" | "employee" | "customer";
  companyId: string;
};

const emptyForm: AdminUserForm = {
  email: "",
  password: "",
  fullName: "",
  role: "customer",
  companyId: "",
};

export default function AdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompany, setNewCompany] = useState("");
  const [form, setForm] = useState<AdminUserForm>(emptyForm);
  const [message, setMessage] = useState("Loading admin tools...");
  const [loading, setLoading] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function loadAdmin() {
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

    await loadCompanies();
    setMessage("");
  }

  async function loadCompanies() {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setCompanies(data ?? []);
  }

  async function createCompany() {
    setMessage("");

    if (!newCompany.trim()) {
      setMessage("Company name is required.");
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("companies")
      .insert({ name: newCompany.trim() });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setNewCompany("");
    await loadCompanies();
    setMessage("Company created.");
    setLoading(false);
  }

  async function createUser() {
    setMessage("");

    if (!form.email || !form.password || !form.fullName) {
      setMessage("Email, password, and full name are required.");
      return;
    }

    if (form.role === "customer" && !form.companyId) {
      setMessage("Customer users must be assigned to a company.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/admin-users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error ?? "Could not create user.");
      setLoading(false);
      return;
    }

    setForm(emptyForm);
    setMessage(`User created: ${result.email}`);
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
            <div className="brand-title">Admin Management</div>
            <div className="brand-subtitle">Companies, customers, and employee users</div>
          </div>
        </div>

        <div className="customer-actions">
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
              value={newCompany}
              onChange={(event) => setNewCompany(event.target.value)}
              placeholder="CP Energy"
            />
          </label>

          <button className="button primary" onClick={createCompany} disabled={loading}>
            Save Company
          </button>

          <div className="company-list">
            {companies.map((company) => (
              <span key={company.id}>{company.name}</span>
            ))}
          </div>
        </div>

        <div className="ticket-card admin-card">
          <h3>Create User</h3>

          <label>
            Full Name
            <input
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              placeholder="Customer Name"
            />
          </label>

          <label>
            Email
            <input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="customer@company.com"
            />
          </label>

          <label>
            Temporary Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="Temporary password"
            />
          </label>

          <label>
            Role
            <select
              value={form.role}
              onChange={(event) =>
                setForm({
                  ...form,
                  role: event.target.value as AdminUserForm["role"],
                  companyId: event.target.value === "customer" ? form.companyId : "",
                })
              }
            >
              <option value="customer">Customer</option>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          {form.role === "customer" && (
            <label>
              Company
              <select
                value={form.companyId}
                onChange={(event) => setForm({ ...form, companyId: event.target.value })}
              >
                <option value="">Select company</option>
                {companies.map((company) => (
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
    </main>
  );
}
