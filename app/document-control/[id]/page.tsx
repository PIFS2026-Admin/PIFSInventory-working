"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type DocumentDetail = Record<string, unknown>;

type DocumentVersion = {
  id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  change_notes: string | null;
  uploaded_by: string | null;
  created_at: string;
};

const DOCUMENT_BUCKET = "documents";

const preferredFieldOrder = [
  "id",
  "document_number",
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

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function fileNameFromReference(reference: string) {
  const cleanReference = reference.split("?")[0].replace(/^\/+/, "");
  return cleanReference.split("/").pop() || "document";
}

function storageLinkForPath(filePath: string) {
  const fileReference = filePath.trim();

  if (!fileReference) return "";
  if (/^https?:\/\//i.test(fileReference)) return fileReference;

  const cleanPath = fileReference.replace(/^\/+/, "");
  const { data } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(cleanPath);
  return data.publicUrl;
}

function fileLinkForDocument(document: DocumentDetail) {
  const rawFilePath = textValue(document.file_path);
  const rawFileUrl = textValue(document.file_url);
  const fileReference = rawFilePath || rawFileUrl;

  return fileReference ? storageLinkForPath(fileReference) : "";
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementNotes, setReplacementNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [replacing, setReplacing] = useState(false);
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
      setVersions([]);
      setMessage(`Document load failed: ${error.message}`);
    } else {
      setDocument((data ?? null) as DocumentDetail | null);

      const { data: versionData, error: versionError } = await supabase
        .from("document_versions")
        .select("id, document_id, version_number, file_path, file_name, file_type, file_size, change_notes, uploaded_by, created_at")
        .eq("document_id", documentId)
        .order("version_number", { ascending: false });

      if (versionError) {
        setVersions([]);
        setMessage(`Version history load failed: ${versionError.message}`);
      } else {
        setVersions((versionData ?? []) as DocumentVersion[]);
      }
    }

    setLoading(false);
  }

  async function replaceFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!document) return;
    if (!replacementFile) {
      setMessage("Choose a replacement file before saving.");
      return;
    }

    const existingFilePath = textValue(document.file_path);
    const existingFileUrl = textValue(document.file_url);
    const existingFileReference = existingFilePath || existingFileUrl;

    if (!existingFileReference) {
      setMessage("This document has no current file to save into version history.");
      return;
    }

    setReplacing(true);
    setMessage("");

    const safeName = cleanFileName(replacementFile.name || "document");
    const today = new Date().toISOString().slice(0, 10);
    const newFilePath = `document-control/${today}/${crypto.randomUUID()}-${safeName}`;
    const nextVersionNumber = versions.length > 0 ? Math.max(...versions.map((version) => version.version_number)) + 1 : 1;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id ?? null;

      const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(newFilePath, replacementFile, {
        cacheControl: "3600",
        contentType: replacementFile.type || undefined,
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const { error: versionError } = await supabase.from("document_versions").insert({
        document_id: documentId,
        version_number: nextVersionNumber,
        file_path: existingFileReference,
        file_name: textValue(document.file_name) || fileNameFromReference(existingFileReference),
        file_type: textValue(document.file_type) || null,
        file_size: typeof document.file_size === "number" ? document.file_size : null,
        change_notes: replacementNotes.trim() || "Previous file before replacement",
        uploaded_by: textValue(document.uploaded_by) || currentUserId,
      });

      if (versionError) throw versionError;

      const updatePayload: Record<string, unknown> = {
        file_path: newFilePath,
        file_name: replacementFile.name,
        file_type: replacementFile.type || null,
        file_size: replacementFile.size,
        updated_at: new Date().toISOString(),
      };

      if (currentUserId) updatePayload.updated_by = currentUserId;

      const { error: updateError } = await supabase.from("documents").update(updatePayload).eq("id", documentId);

      if (updateError) throw updateError;

      setReplacementFile(null);
      setReplacementNotes("");
      setMessage(`File replaced. Previous file saved as version ${nextVersionNumber}.`);
      await loadDocument();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setMessage(`Replace failed: ${errorMessage}`);
    } finally {
      setReplacing(false);
    }
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

  const fileHref = useMemo(() => (document ? fileLinkForDocument(document) : ""), [document]);
  const currentVersionNumber = useMemo(
    () => (versions.length > 0 ? Math.max(...versions.map((version) => version.version_number)) + 1 : 1),
    [versions],
  );

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
          <div className="ticket-card">
            <h2>Attached File</h2>
            <p className="muted-text">Current version: {currentVersionNumber}</p>
            {fileHref ? (
              <a className="button primary" href={fileHref} rel="noreferrer" target="_blank">
                View / Download File
              </a>
            ) : (
              <p className="muted-text">No file attached.</p>
            )}

            <form className="form-grid" onSubmit={replaceFile}>
              <label>
                Replace File
                <input
                  type="file"
                  onChange={(event) => setReplacementFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="full">
                Replacement Notes
                <textarea
                  placeholder="Optional note for this replacement"
                  value={replacementNotes}
                  onChange={(event) => setReplacementNotes(event.target.value)}
                />
              </label>
              <div className="slide-actions">
                <button className="button primary" disabled={replacing} type="submit">
                  {replacing ? "Replacing..." : "Replace File"}
                </button>
              </div>
            </form>
          </div>
        )}

        {!loading && document && (
          <div className="ticket-card">
            <h2>Version History</h2>
            {versions.length === 0 ? (
              <p className="muted-text">No previous versions saved.</p>
            ) : (
              <div className="stack-list">
                {versions.map((version) => {
                  const versionHref = storageLinkForPath(version.file_path);

                  return (
                    <article className="history-row" key={version.id}>
                      <div>
                        <strong>Version {version.version_number}</strong>
                        <span>{version.file_name || fileNameFromReference(version.file_path)}</span>
                        <small>{displayValue(version.created_at)}</small>
                      </div>
                      <div>
                        <span>{version.change_notes || "No notes"}</span>
                        {versionHref && (
                          <a className="button" href={versionHref} rel="noreferrer" target="_blank">
                            View
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
