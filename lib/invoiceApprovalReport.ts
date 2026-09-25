import JSZip from "jszip";

export type InvoiceReportCoding = {
  code: string;
  description: string;
  amount: number;
  costCenter: string;
  department: string;
  jobNumber: string;
  lineDescription: string;
};

export type InvoiceReportRow = {
  status: string;
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  aging: string;
  approver: string;
  location: string;
  amount: number;
  codingTotal: number;
  coding: InvoiceReportCoding[];
  uploadedBy: string;
  uploadedAt: string;
  approvedBy: string;
  approvedAt: string;
  apNotes: string;
  approverNotes: string;
  exceptionReason: string;
  postingReference: string;
  postedAt: string;
  paymentDate: string;
  paymentReference: string;
  archivedAt: string;
};

export type InvoiceReport = {
  title: string;
  filterSummary: string;
  generatedBy: string;
  generatedAt: string;
  rows: InvoiceReportRow[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function escapeXml(value: unknown) {
  return text(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function escapeHtml(value: unknown) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function columnName(index: number) {
  let value = index + 1;
  let output = "";
  while (value) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function stringCell(address: string, value: unknown, style = 0) {
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function numberCell(address: string, value: number, style = 5) {
  return `<c r="${address}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
}

function rowXml(number: number, values: Array<{ value: unknown; style?: number; number?: boolean }>, height?: number) {
  const cells = values.map((entry, index) => entry.number
    ? numberCell(`${columnName(index)}${number}`, Number(entry.value), entry.style)
    : stringCell(`${columnName(index)}${number}`, entry.value, entry.style));
  return `<row r="${number}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells.join("")}</row>`;
}

function codingSummary(lines: InvoiceReportCoding[]) {
  return lines.map((line) => {
    const details = [line.costCenter && `CC ${line.costCenter}`, line.department && `Dept ${line.department}`, line.jobNumber && `Job ${line.jobNumber}`, line.lineDescription].filter(Boolean).join("; ");
    return `${line.code}${line.description ? ` - ${line.description}` : ""}: ${line.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}${details ? ` (${details})` : ""}`;
  }).join(" | ");
}

const columns = [
  "Status", "Vendor", "Invoice Number", "Invoice Date", "Due Date", "Aging", "Approver", "Location",
  "Invoice Amount", "Coding Total", "Coding Detail", "Uploaded By", "Uploaded At", "Approved By", "Approved At",
  "AP Notes", "Approver Notes", "Exception / Return Reason", "Posting Reference", "Posted At", "Payment Date",
  "Payment Reference", "Archived At",
];

function reportValues(row: InvoiceReportRow) {
  return [
    row.status, row.vendor, row.invoiceNumber, row.invoiceDate, row.dueDate, row.aging, row.approver, row.location,
    row.amount, row.codingTotal, codingSummary(row.coding), row.uploadedBy, row.uploadedAt, row.approvedBy, row.approvedAt,
    row.apNotes, row.approverNotes, row.exceptionReason, row.postingReference, row.postedAt, row.paymentDate,
    row.paymentReference, row.archivedAt,
  ];
}

export async function buildInvoiceApprovalWorkbook(report: InvoiceReport) {
  const total = report.rows.reduce((sum, row) => sum + row.amount, 0);
  const headerRow = 6;
  const firstDataRow = 7;
  const lastDataRow = Math.max(firstDataRow, firstDataRow + report.rows.length - 1);
  const totalRow = firstDataRow + report.rows.length;
  const rows = [
    rowXml(1, [{ value: report.title, style: 1 }], 30),
    rowXml(2, [{ value: `Generated ${report.generatedAt} by ${report.generatedBy}`, style: 2 }], 21),
    rowXml(3, [{ value: report.filterSummary || "No additional filters", style: 2 }], 21),
    rowXml(4, [{ value: `${report.rows.length} invoice${report.rows.length === 1 ? "" : "s"} | Total ${total.toLocaleString("en-US", { style: "currency", currency: "USD" })}`, style: 6 }], 23),
    rowXml(headerRow, columns.map((value) => ({ value, style: 3 })), 32),
    ...report.rows.map((row, index) => rowXml(firstDataRow + index, reportValues(row).map((value, column) => ({ value, style: column === 8 || column === 9 ? 5 : 4, number: column === 8 || column === 9 })), 30)),
    rowXml(totalRow, columns.map((_, index) => index === 7
      ? { value: "Report Total", style: 6 }
      : index === 8
        ? { value: total, style: 7, number: true }
        : { value: "", style: index === 9 ? 7 : 4 }), 24),
  ].join("");
  const widths = [18, 24, 18, 14, 14, 17, 22, 18, 15, 15, 55, 21, 21, 21, 21, 30, 30, 35, 20, 21, 14, 20, 21];
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rows}</sheetData><mergeCells count="4"><mergeCell ref="A1:W1"/><mergeCell ref="A2:W2"/><mergeCell ref="A3:W3"/><mergeCell ref="A4:W4"/></mergeCells><autoFilter ref="A${headerRow}:W${lastDataRow}"/><pageMargins left="0.2" right="0.2" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Invoice Report" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" calcMode="auto"/></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00;[Red]-$#,##0.00"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF111111"/><name val="Arial"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111820"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF7417"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FF8994A3"/></left><right style="thin"><color rgb="FF8994A3"/></right><top style="thin"><color rgb="FF8994A3"/></top><bottom style="thin"><color rgb="FF8994A3"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  const created = new Date().toISOString();
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(report.title)}</dc:title><dc:creator>TITAN</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>TITAN</Application></Properties>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function invoiceApprovalPrintHtml(report: InvoiceReport) {
  const total = report.rows.reduce((sum, row) => sum + row.amount, 0);
  const rows = report.rows.map((row) => `<tr><td>${escapeHtml(row.status)}</td><td><strong>${escapeHtml(row.vendor)}</strong><br><small>${escapeHtml(row.invoiceNumber)}</small></td><td>${escapeHtml(row.invoiceDate)}<br><small>Due ${escapeHtml(row.dueDate || "-")}</small></td><td>${escapeHtml(row.aging)}</td><td>${escapeHtml(row.approver)}</td><td>${escapeHtml(row.location)}</td><td class="money">${escapeHtml(row.amount.toLocaleString("en-US", { style: "currency", currency: "USD" }))}</td><td>${escapeHtml(codingSummary(row.coding) || "-")}</td><td>${escapeHtml(row.exceptionReason || "-")}</td><td>${escapeHtml(row.postingReference || row.paymentReference || "-")}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>@page{size:landscape;margin:.35in}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#111;margin:0}header{border-bottom:3px solid #f97316;padding:0 0 10px;margin-bottom:12px}h1{font-size:22px;margin:0}p{margin:4px 0;color:#45505f}.summary{display:flex;gap:28px;margin:10px 0;font-size:12px}.summary strong{font-size:16px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #8b95a3;padding:6px;vertical-align:top;overflow-wrap:anywhere}th{background:#111820;color:#fff;text-align:left;font-size:8px;text-transform:uppercase}td:nth-child(2),td:nth-child(8){width:17%}.money{text-align:right;white-space:nowrap}small{color:#596575}.toolbar{display:flex;justify-content:flex-end;margin-bottom:10px}.toolbar button{background:#f97316;border:0;padding:8px 12px;font-weight:700;cursor:pointer}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div><header><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.filterSummary || "No additional filters")}</p><p>Generated ${escapeHtml(report.generatedAt)} by ${escapeHtml(report.generatedBy)}</p></header><div class="summary"><span><strong>${report.rows.length}</strong><br>Invoices</span><span><strong>${escapeHtml(total.toLocaleString("en-US", { style: "currency", currency: "USD" }))}</strong><br>Total amount</span></div><table><thead><tr><th>Status</th><th>Vendor / Invoice</th><th>Invoice / Due</th><th>Aging</th><th>Approver</th><th>Location</th><th>Amount</th><th>Coding</th><th>Exception</th><th>Closeout Reference</th></tr></thead><tbody>${rows || `<tr><td colspan="10">No invoices match this report.</td></tr>`}</tbody></table></body></html>`;
}
