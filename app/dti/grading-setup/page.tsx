"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { shouldShowPageMessage } from "../../../lib/pageMessages";
import { goBackOrFallback } from "../../../lib/navigation";
import { DtiManagementStyles } from "../DtiManagementStyles";

type UserRole =
  | "admin"
  | "employee"
  | "sales"
  | "customer"
  | "operator"
  | "dti_superintendent"
  | "dti_lead"
  | "dti_inspector";

type Profile = {
  id: string;
  fullName: string;
  role: UserRole;
};

type GradingItem = {
  id: string;
  section: string;
  category: string;
  requirement: string;
  definition: string;
  priority: string;
  weight: number | null;
  maxScore: number;
  displayOrder: number;
  isRequired: boolean;
  isRedFlag: boolean;
  commentsRequired: boolean;
  photoRequired: boolean;
  isActive: boolean;
};

type ItemForm = Omit<GradingItem, "id"> & { id?: string };

type DbRecord = Record<string, unknown>;

const allowedRoles: UserRole[] = ["admin", "dti_superintendent"];

const emptyItemForm: ItemForm = {
  section: "Pre-Job",
  category: "",
  requirement: "",
  definition: "",
  priority: "Standard",
  weight: null,
  maxScore: 5,
  displayOrder: 1,
  isRequired: true,
  isRedFlag: false,
  commentsRequired: false,
  photoRequired: false,
  isActive: true,
};

function normalizeRole(value: unknown): UserRole {
  const role = String(value ?? "customer");
  if (
    role === "admin" ||
    role === "employee" ||
    role === "sales" ||
    role === "customer" ||
    role === "operator" ||
    role === "dti_superintendent" ||
    role === "dti_lead" ||
    role === "dti_inspector"
  ) {
    return role;
  }
  return "customer";
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function DtiGradingSetupPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<GradingItem[]>([]);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [sectionFilter, setSectionFilter] = useState("All Sections");
  const [message, setMessage] = useState("Loading DTI grading setup...");
  const [saving, setSaving] = useState(false);

  const canManage = profile ? allowedRoles.includes(profile.role) : false;
  const showPageMessage = shouldShowPageMessage(message);

  const sections = useMemo(
    () => [...new Set(items.map((item) => item.section).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  );

  const visibleItems = useMemo(
    () =>
      items
        .filter((item) => sectionFilter === "All Sections" || item.section === sectionFilter)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.requirement.localeCompare(b.requirement)),
    [items, sectionFilter]
  );

  useEffect(() => {
    loadPage();
  }, []);

  async function loadPage() {
    setMessage("Loading DTI grading setup...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      setMessage(profileError?.message ?? "Profile not found.");
      return;
    }

    const loadedProfile: Profile = {
      id: profileData.id,
      fullName: profileData.full_name ?? user.email ?? "User",
      role: normalizeRole(profileData.role),
    };

    if (!allowedRoles.includes(loadedProfile.role)) {
      window.location.href = "/dti";
      return;
    }

    setProfile(loadedProfile);
    await loadItems();
  }

  async function loadItems() {
    const { data, error } = await supabase
      .from("dti_grading_items")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      setMessage(`Run supabase/dti_management_upgrade.sql first. ${error.message}`);
      return;
    }

    const mappedItems = ((data ?? []) as DbRecord[]).map((item) => ({
      id: textValue(item.id),
      section: textValue(item.section),
      category: textValue(item.category),
      requirement: textValue(item.requirement),
      definition: textValue(item.definition),
      priority: textValue(item.priority) || "Standard",
      weight: item.weight === null || item.weight === undefined ? null : Number(item.weight),
      maxScore: Number(item.max_score ?? 5),
      displayOrder: Number(item.display_order ?? 0),
      isRequired: Boolean(item.is_required),
      isRedFlag: Boolean(item.is_red_flag),
      commentsRequired: Boolean(item.comments_required),
      photoRequired: Boolean(item.photo_required),
      isActive: Boolean(item.is_active),
    }));

    setItems(mappedItems);
    setItemForm((current) => ({ ...current, displayOrder: mappedItems.length + 1 }));
    setMessage("");
  }

  async function saveItem() {
    if (!canManage || saving) return;

    if (!itemForm.section.trim() || !itemForm.requirement.trim()) {
      setMessage("Section and requirement are required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      section: itemForm.section.trim(),
      category: itemForm.category.trim() || null,
      requirement: itemForm.requirement.trim(),
      definition: itemForm.definition.trim() || null,
      priority: itemForm.priority || "Standard",
      weight: itemForm.weight,
      max_score: itemForm.maxScore,
      display_order: itemForm.displayOrder,
      is_required: itemForm.isRequired,
      is_red_flag: itemForm.isRedFlag,
      comments_required: itemForm.commentsRequired,
      photo_required: itemForm.photoRequired,
      is_active: itemForm.isActive,
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = itemForm.id
        ? await supabase.from("dti_grading_items").update(payload).eq("id", itemForm.id)
        : await supabase.from("dti_grading_items").insert(payload);

      if (error) throw error;

      setItemForm({ ...emptyItemForm, displayOrder: items.length + 2 });
      await loadItems();
      setMessage(itemForm.id ? "Grading item updated." : "Grading item added.");
    } catch (error: unknown) {
      setMessage(`Save grading item failed: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: GradingItem) {
    if (!canManage || saving) return;

    setSaving(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("dti_grading_items")
        .update({ is_active: !item.isActive, updated_at: new Date().toISOString() })
        .eq("id", item.id);

      if (error) throw error;
      await loadItems();
      setMessage(!item.isActive ? "Grading item activated." : "Grading item deactivated.");
    } catch (error: unknown) {
      setMessage(`Update failed: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  function editItem(item: GradingItem) {
    setItemForm({
      id: item.id,
      section: item.section,
      category: item.category,
      requirement: item.requirement,
      definition: item.definition,
      priority: item.priority,
      weight: item.weight,
      maxScore: item.maxScore,
      displayOrder: item.displayOrder,
      isRequired: item.isRequired,
      isRedFlag: item.isRedFlag,
      commentsRequired: item.commentsRequired,
      photoRequired: item.photoRequired,
      isActive: item.isActive,
    });
    document.querySelector(".dti-grading-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="dashboard-shell dti-shell">
      <DtiManagementStyles />
      <header className="dashboard-header titan-page-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo-img" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">DTI Grading Setup</div>
            <div className="brand-subtitle">DTI Management</div>
          </div>
        </button>

        <div className="dashboard-actions">
          <button className="button" type="button" onClick={() => goBackOrFallback("/dti")}>Back to DTI Management</button>
          <button className="button" type="button" onClick={loadItems}>Refresh</button>
        </div>
      </header>

      {showPageMessage && <div className="modal-message">{message}</div>}

      <section className="dashboard-hero">
        <span>DTI Management</span>
        <h1>Configurable Grading Form</h1>
        <p>Manage the DTI scorecard used for new jobs. Existing completed jobs keep the checklist rows already saved to them.</p>
      </section>

      <section className="dashboard-card wide dti-grading-form">
        <div className="section-heading">
          <div>
            <h2>{itemForm.id ? "Edit Scorecard Item" : "Add Scorecard Item"}</h2>
            <p>New jobs use active scorecard items in display order.</p>
          </div>
          {itemForm.id && <button className="button" type="button" onClick={() => setItemForm({ ...emptyItemForm, displayOrder: items.length + 1 })}>New Item</button>}
        </div>

        <div className="form-grid dti-create-grid">
          <label>
            Section
            <input list="dti-section-list" value={itemForm.section} onChange={(event) => setItemForm({ ...itemForm, section: event.target.value })} />
            <datalist id="dti-section-list">
              {sections.map((section) => <option key={section} value={section} />)}
            </datalist>
          </label>
          <label>
            Category
            <input value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} />
          </label>
          <label>
            Requirement
            <input value={itemForm.requirement} onChange={(event) => setItemForm({ ...itemForm, requirement: event.target.value })} />
          </label>
          <label>
            Priority
            <select value={itemForm.priority} onChange={(event) => setItemForm({ ...itemForm, priority: event.target.value })}>
              <option>High</option>
              <option>Standard</option>
              <option>Weighted</option>
              <option>Critical</option>
            </select>
          </label>
          <label>
            Display Order
            <input type="number" value={itemForm.displayOrder} onChange={(event) => setItemForm({ ...itemForm, displayOrder: Number(event.target.value) })} />
          </label>
          <label>
            Max Points
            <input type="number" min="1" value={itemForm.maxScore} onChange={(event) => setItemForm({ ...itemForm, maxScore: Number(event.target.value) })} />
          </label>
          <label>
            Weight
            <input
              type="number"
              min="0"
              step="0.01"
              value={itemForm.weight ?? ""}
              onChange={(event) => setItemForm({ ...itemForm, weight: event.target.value === "" ? null : Number(event.target.value) })}
            />
          </label>
          <label className="full">
            Description
            <textarea value={itemForm.definition} onChange={(event) => setItemForm({ ...itemForm, definition: event.target.value })} />
          </label>
        </div>

        <div className="dti-toggle-grid">
          <label><input type="checkbox" checked={itemForm.isRequired} onChange={(event) => setItemForm({ ...itemForm, isRequired: event.target.checked })} /> Required</label>
          <label><input type="checkbox" checked={itemForm.isRedFlag} onChange={(event) => setItemForm({ ...itemForm, isRedFlag: event.target.checked })} /> Critical / Red Flag</label>
          <label><input type="checkbox" checked={itemForm.commentsRequired} onChange={(event) => setItemForm({ ...itemForm, commentsRequired: event.target.checked })} /> Comments Required</label>
          <label><input type="checkbox" checked={itemForm.photoRequired} onChange={(event) => setItemForm({ ...itemForm, photoRequired: event.target.checked })} /> Photo Required</label>
          <label><input type="checkbox" checked={itemForm.isActive} onChange={(event) => setItemForm({ ...itemForm, isActive: event.target.checked })} /> Active</label>
        </div>

        <button className="button primary" type="button" onClick={saveItem} disabled={!canManage || saving}>
          {saving ? "Saving..." : itemForm.id ? "Save Item" : "Add Item"}
        </button>
      </section>

      <section className="dashboard-card wide dti-grading-register">
        <div className="section-heading">
          <div>
            <h2>Scorecard Items</h2>
            <p>{visibleItems.length} items shown / {items.filter((item) => item.isActive).length} active</p>
          </div>
          <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
            <option>All Sections</option>
            {sections.map((section) => <option key={section}>{section}</option>)}
          </select>
        </div>

        <div className="table-wrap">
          <table className="dti-job-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Section</th>
                <th>Category</th>
                <th>Requirement</th>
                <th>Priority</th>
                <th>Rules</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.displayOrder}</td>
                  <td>{item.section}</td>
                  <td>{item.category || "-"}</td>
                  <td>
                    <strong>{item.requirement}</strong>
                    <small>{item.definition || "No description"}</small>
                  </td>
                  <td>{item.priority}</td>
                  <td>
                    <div className="dti-pill-row">
                      {item.isRequired && <span className="dti-pill">Required</span>}
                      {item.isRedFlag && <span className="dti-pill">Red Flag</span>}
                      {item.commentsRequired && <span className="dti-pill">Comments</span>}
                      {item.photoRequired && <span className="dti-pill">Photo</span>}
                    </div>
                  </td>
                  <td>{item.isActive ? "Active" : "Inactive"}</td>
                  <td>
                    <div className="dti-row-actions">
                      <button className="button mini" type="button" onClick={() => editItem(item)}>Edit</button>
                      <button className="button mini" type="button" onClick={() => toggleActive(item)} disabled={saving}>
                        {item.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
