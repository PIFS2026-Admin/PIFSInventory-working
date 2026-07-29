"use client";

export function DtiManagementStyles() {
  return (
    <style>{`
      .dti-job-register {
        margin-top: 16px;
      }

      .dti-register-heading {
        align-items: flex-start;
      }

      .dti-filter-toolbar {
        display: grid;
        grid-template-columns: repeat(4, minmax(180px, 1fr));
        gap: 12px;
        margin: 14px 0;
      }

      .dti-filter-toolbar label,
      .dti-grading-form label {
        display: grid;
        gap: 6px;
        min-width: 0;
        color: var(--muted);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .dti-filter-toolbar input,
      .dti-filter-toolbar select,
      .dti-grading-register select {
        min-width: 0;
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #101318;
        color: var(--text);
        padding: 10px 11px;
        font: inherit;
        text-transform: none;
      }

      .dti-active-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0 0 14px;
      }

      .dti-active-filters button {
        border: 1px solid rgba(255, 106, 26, 0.55);
        border-radius: 999px;
        background: rgba(255, 106, 26, 0.12);
        color: var(--text);
        padding: 7px 10px;
        font-weight: 900;
        cursor: pointer;
      }

      .dti-active-filters button.clear {
        border-color: var(--line);
        background: var(--panel-2);
      }

      .dti-job-table-wrap {
        max-height: 62vh;
      }

      .dti-job-table {
        min-width: 1180px;
        width: 100%;
        border-collapse: collapse;
      }

      .dti-job-table th,
      .dti-job-table td {
        border-bottom: 1px solid var(--line);
        padding: 10px 9px;
        text-align: left;
        vertical-align: top;
      }

      .dti-job-table th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: #111720;
        color: #bfd3f1;
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .dti-job-table tr.selected td {
        background: rgba(255, 106, 26, 0.08);
      }

      .dti-table-open {
        border: 0;
        background: transparent;
        color: var(--orange);
        font: inherit;
        font-weight: 900;
        text-align: left;
        cursor: pointer;
      }

      .dti-row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .button.mini {
        min-height: 0;
        padding: 7px 9px;
        font-size: 12px;
      }

      .dti-empty-state {
        border: 1px dashed var(--line);
        border-radius: 8px;
        padding: 18px;
        color: var(--muted);
      }

      .dti-empty-state h3 {
        margin: 0 0 6px;
        color: var(--text);
      }

      .dti-pagination {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        margin-top: 12px;
        color: var(--muted);
        font-weight: 900;
      }

      .dti-create-page-card,
      .dti-grading-form,
      .dti-grading-register {
        margin-top: 16px;
      }

      .dti-create-actions {
        justify-content: flex-end;
      }

      .dti-toggle-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(160px, 1fr));
        gap: 10px;
        margin: 12px 0;
      }

      .dti-toggle-grid label {
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel-2);
        padding: 10px;
        color: var(--text);
        font-weight: 900;
      }

      @media (max-width: 760px) {
        .dti-filter-toolbar,
        .dti-toggle-grid {
          grid-template-columns: 1fr;
        }

        .dti-register-heading {
          display: grid;
          gap: 12px;
        }

        .dti-job-table-wrap {
          max-height: 68vh;
        }
      }
    `}</style>
  );
}
