"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type DocumentRecord = {
  id: string;
  title: string | null;
  category: string | null;
  department: string | null;
  expiration_date: string | null;
  status: string | null;
  approval_status: string | null;
  uploaded_date: string | null;
};

function displayText(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function uniqueOptions(documents: DocumentRecord[], key: keyof DocumentRecord) {
  return Array.from(
    new Set(
      documents
        .map((document) => document[key])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export default function DocumentControlPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function loadDocuments() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("documents")
      .select("id,title,category,department,expiration_date,status,approval_status,uploaded_date")
      .order("uploaded_date", { ascending: false });

    if (error) {
      setDocuments([]);
      setMessage(`Document load failed: ${error.message}`);
    } else {
      setDocuments((data ?? []) as DocumentRecord[]);
    }

    setLoading(false);
  }

  const categoryOptions = useMemo(() => uniqueOptions(documents, "category"), [documents]);
  const departmentOptions = useMemo(() => uniqueOptions(documents, "department"), [documents]);
  const statusOptions = useMemo(() => uniqueOptions(documents, "status"), [documents]);

  const filteredDocuments = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return documents.filter((document) => {
      const matchesSearch = !searchText || (document.title ?? "").toLowerCase().includes(searchText);
      const matchesCategory = category === "all" || document.category === category;
      const matchesDepartment = department === "all" || document.department === department;
      const matchesStatus = status === "all" || document.status === status;

      return matchesSearch && matchesCategory && matchesDepartment && matchesStatus;
    });
  }, [category, department, documents, search, status]);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p className="eyebrow">Document Control</p>
          <h1>Document Library</h1>
          <p className="muted-text">Search and review company document records.</p>
        </div>
        <div className="slide-actions">
          <Link className="button primary" href="/document-control/upload">
            Upload Document
          </Link>
          <button className="button" onClick={loadDocuments} type="button">
            Refresh
          </button>
        </div>
      </section>

      {message && <div className="modal-message">{message}</div>}

      <section className="ticket-card">
        <div className="form-grid">
          <label>
            Search Title
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by document title"
            />
          </label>

          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All Categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Department
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="all">All Departments</option>
              {departmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All Statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="ticket-card">
        <div className="section-title-row">
          <div>
            <h2>Documents</h2>
            <p className="muted-text">
              {loading ? "Loading documents..." : `${filteredDocuments.length} document records`}
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Department</th>
                <th>Expiration Date</th>
                <th>Status</th>
                <th>Approval Status</th>
                <th>Uploaded Date</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                filteredDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <Link className="table-link" href={`/document-control/${document.id}`}>
                        {displayText(document.title)}
                      </Link>
                    </td>
                    <td>{displayText(document.category)}</td>
                    <td>{displayText(document.department)}</td>
                    <td>{formatDate(document.expiration_date)}</td>
                    <td>{displayText(document.status)}</td>
                    <td>{displayText(document.approval_status)}</td>
                    <td>{formatDate(document.uploaded_date)}</td>
                  </tr>
                ))}

              {!loading && filteredDocuments.length === 0 && (
                <tr>
                  <td colSpan={7}>No documents found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
