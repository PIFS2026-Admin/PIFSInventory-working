"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type DocumentDetail = Record<string, unknown>;

const preferredFieldOrder = [
  "id",
  "document_id",
  "title",
  "category",
  "department",
  "related_employee",
  "related_equipment",
  "related_customer",
  "related_vendor",
  "issue_date",
  "expiration_date",
  "renewal_required",
  "status",
  "document_status",
  "approval_status",
  "uploaded_by",
  "uploaded_date",
  "updated_by",
  "last_updated_by",
  "last_updated_date",
  "file_path",
  "file_url",
  "notes",
  "created_at",
  "updated_at",
];

function labelForField(field: string) {
  return field
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
  }

  return text;
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadDocument();
  }, [documentId]);

  async function loadDocument() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).single();

    if (error) {
      setDocument(null);
      setMessage(`Document load failed: ${error.message}`);
    } else {
      setDocument((data ?? null) as DocumentDetail | null);
    }

    setLoading(false);
  }

  const fields = useMemo(() => {
    if (!document) return [];

    const fieldNames = Object.keys(document);
    const orderedFields = preferredFieldOrder.filter((field) => fieldNames.includes(field));
    const remainingFields = fieldNames
      .filter((field) => !preferredFieldOrder.includes(field))
      .sort((a, b) => a.localeCompare(b));

    return [...orderedFields, ...remainingFields];
  }, [document]);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <p className="eyebrow">Document Control</p>
          <h1>{document ? displayValue(document.title) : "Document Detail"}</h1>
          <p className="muted-text">Review document metadata.</p>
        </div>
        <Link className="button" href="/document-control">
          Back to Document Control
        </Link>
      </section>

      {message && <div className="modal-message">{message}</div>}

      <section className="ticket-card">
        <div className="section-title-row">
          <div>
            <h2>Metadata</h2>
            <p className="muted-text">{loading ? "Loading document..." : `${fields.length} fields`}</p>
          </div>
          <button className="button" onClick={loadDocument} type="button">
            Refresh
          </button>
        </div>

        {!loading && document && (
          <div className="detail-grid">
            {fields.map((field) => (
              <div className="detail-row" key={field}>
                <span>{labelForField(field)}</span>
                <strong>{displayValue(document[field])}</strong>
              </div>
            ))}
          </div>
        )}

        {!loading && !document && !message && <p className="muted-text">Document not found.</p>}
      </section>
    </main>
  );
}
