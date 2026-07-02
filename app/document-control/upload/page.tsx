"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useState } from "react";
import { supabase } from "../../../lib/supabase";

const DOCUMENT_BUCKET = "documents";

type UploadForm = {
  title: string;
  category: string;
  department: string;
  issueDate: string;
  expirationDate: string;
  renewalRequired: boolean;
  status: string;
  approvalStatus: string;
  notes: string;
};

const initialForm: UploadForm = {
  title: "",
  category: "",
  department: "",
  issueDate: "",
  expirationDate: "",
  renewalRequired: false,
  status: "Active",
  approvalStatus: "Draft",
  notes: "",
};

const categoryOptions = [
  "HSE",
  "SOPs",
  "Certifications",
  "Calibrations",
  "Equipment Documents",
  "Employee Documents",
  "Customer Documents",
  "Vendor Documents",
  "Forms",
  "Policies",
  "Training Documents",
  "Other",
];

const statusOptions = ["Active", "Expiring Soon", "Expired", "Archived"];
const approvalStatusOptions = ["Draft", "Pending Review", "Approved", "Archived"];

function cleanFileName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function UploadDocumentPage() {
  const router = useRouter();
  const [form, setForm] = useState<UploadForm>(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function updateField<K extends keyof UploadForm>(field: K, value: UploadForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!form.title.trim() || !form.category.trim() || !form.department.trim() || !file) {
      setMessage("Title, category, department, and file are required.");
      return;
    }

    setSaving(true);

    try {
      const safeName = cleanFileName(file.name) || "document";
      const filePath = `document-control/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(filePath);

      const { error: insertError } = await supabase.from("documents").insert({
        title: form.title.trim(),
        category: form.category.trim(),
        department: form.department.trim(),
        issue_date: form.issueDate || null,
        expiration_date: form.expirationDate || null,
        renewal_required: form.renewalRequired,
        status: form.status,
        approval_status: form.approvalStatus,
        uploaded_date: new Date().toISOString(),
        file_path: filePath,
        file_url: publicUrlData.publicUrl,
        notes: form.notes.trim() || null,
      });

      if (insertError) throw insertError;

      router.push("/document-control");
      router.refresh();
    } catch (error) {
      setMessage(`Upload failed: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p className="eyebrow">Document Control</p>
          <h1>Upload Document</h1>
          <p className="muted-text">Upload a file and save its document record.</p>
        </div>
        <Link className="button" href="/document-control">
          Back to Documents
        </Link>
      </section>

      {message && <div className="modal-message">{message}</div>}

      <form className="ticket-card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Title
            <input
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Document title"
              required
              value={form.title}
            />
          </label>

          <label>
            Category
            <select
              onChange={(event) => updateField("category", event.target.value)}
              required
              value={form.category}
            >
              <option value="">Choose category</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Department
            <input
              onChange={(event) => updateField("department", event.target.value)}
              placeholder="Department"
              required
              value={form.department}
            />
          </label>

          <label>
            File
            <input onChange={handleFileChange} required type="file" />
          </label>

          <label>
            Issue Date
            <input
              onChange={(event) => updateField("issueDate", event.target.value)}
              type="date"
              value={form.issueDate}
            />
          </label>

          <label>
            Expiration Date
            <input
              onChange={(event) => updateField("expirationDate", event.target.value)}
              type="date"
              value={form.expirationDate}
            />
          </label>

          <label>
            Status
            <select onChange={(event) => updateField("status", event.target.value)} value={form.status}>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Approval Status
            <select
              onChange={(event) => updateField("approvalStatus", event.target.value)}
              value={form.approvalStatus}
            >
              {approvalStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="full">
            <span>
              <input
                checked={form.renewalRequired}
                onChange={(event) => updateField("renewalRequired", event.target.checked)}
                type="checkbox"
              />{" "}
              Renewal required
            </span>
          </label>

          <label className="full">
            Notes
            <textarea
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Notes"
              value={form.notes}
            />
          </label>
        </div>

        <div className="slide-actions">
          <Link className="button" href="/document-control">
            Cancel
          </Link>
          <button className="button primary" disabled={saving} type="submit">
            {saving ? "Uploading..." : "Upload Document"}
          </button>
        </div>
      </form>
    </main>
  );
}
