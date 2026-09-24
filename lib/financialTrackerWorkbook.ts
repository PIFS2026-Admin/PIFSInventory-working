import "server-only";

import JSZip from "jszip";
import { financialLineNames, type FinancialLine } from "./financialKpi";

type TrackerJob = {
  id: string;
  service_line: FinancialLine;
  job_date: string;
  category_code: string;
  invoice: string | null;
  operator: string | null;
  rig: string | null;
  lead: string | null;
  revenue: number | string | null;
  manhours: number | string | null;
  computed: Record<string, unknown> | null;
  source: string;
};

type WorkbookOptions = {
  yardName: string;
  dateFrom: string;
  dateTo: string;
  lineLabel: string;
  filterSummary: string;
  jobs: TrackerJob[];
  categoryLabels: Record<string, string>;
};

function text(value: unknown) { return String(value ?? "").trim(); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function escapeXml(value: unknown) {
  return text(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function columnName(index: number) {
  let value = index + 1; let output = "";
  while (value) { const remainder = (value - 1) % 26; output = String.fromCharCode(65 + remainder) + output; value = Math.floor((value - 1) / 26); }
  return output;
}
function stringCell(address: string, value: unknown, style: number) {
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}
function numberCell(address: string, value: unknown, style: number) {
  return `<c r="${address}" s="${style}"><v>${number(value)}</v></c>`;
}
function formulaCell(address: string, formula: string, style: number) {
  return `<c r="${address}" s="${style}"><f>${escapeXml(formula)}</f><v>0</v></c>`;
}
function rowXml(rowNumber: number, cells: string[], height?: number) {
  return `<row r="${rowNumber}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells.join("")}</row>`;
}

export async function buildFinancialTrackerWorkbook(options: WorkbookOptions) {
  const headers = ["Date", "Service Line", "Category", "Invoice", "Operator", "Rig / Yard", "Lead", "Revenue", "Total Cost", "Profit", "Margin", "Manhours", "Source"];
  const firstDataRow = 6;
  const lastDataRow = firstDataRow + options.jobs.length - 1;
  const totalRow = Math.max(firstDataRow, lastDataRow + 1);
  const rows = [
    rowXml(1, [stringCell("A1", "TITAN Financial Job Cost Tracker", 1)], 28),
    rowXml(2, [stringCell("A2", `${options.yardName} | ${options.lineLabel} | ${options.dateFrom} through ${options.dateTo}`, 2)], 21),
    rowXml(3, [stringCell("A3", options.filterSummary || "No additional tracker filters", 2)], 21),
    rowXml(4, [stringCell("A4", `${options.jobs.length} active row${options.jobs.length === 1 ? "" : "s"} exported | Generated ${new Date().toLocaleString("en-US")}`, 2)], 21),
    rowXml(5, headers.map((header, index) => stringCell(`${columnName(index)}5`, header, 3)), 24),
    ...options.jobs.map((job, index) => {
      const row = firstDataRow + index;
      const computed = job.computed || {};
      const category = options.categoryLabels[`${job.service_line}:${job.category_code}`] || job.category_code;
      const values = [job.job_date.slice(0, 10), financialLineNames[job.service_line], category, job.invoice, job.operator, job.rig, job.lead];
      return rowXml(row, [
        ...values.map((value, column) => stringCell(`${columnName(column)}${row}`, value, 4)),
        numberCell(`H${row}`, job.revenue, 5),
        numberCell(`I${row}`, computed.total_cost, 5),
        numberCell(`J${row}`, computed.profit, 5),
        numberCell(`K${row}`, computed.margin, 6),
        numberCell(`L${row}`, job.manhours, 7),
        stringCell(`M${row}`, job.source, 4),
      ], 20);
    }),
    rowXml(totalRow, options.jobs.length ? [
      stringCell(`A${totalRow}`, "FILTERED TOTALS", 8),
      ...Array.from({ length: 6 }, (_, index) => stringCell(`${columnName(index + 1)}${totalRow}`, "", 8)),
      formulaCell(`H${totalRow}`, `SUM(H${firstDataRow}:H${lastDataRow})`, 9),
      formulaCell(`I${totalRow}`, `SUM(I${firstDataRow}:I${lastDataRow})`, 9),
      formulaCell(`J${totalRow}`, `SUM(J${firstDataRow}:J${lastDataRow})`, 9),
      formulaCell(`K${totalRow}`, `IF(H${totalRow}=0,0,J${totalRow}/H${totalRow})`, 10),
      formulaCell(`L${totalRow}`, `SUM(L${firstDataRow}:L${lastDataRow})`, 11),
      stringCell(`M${totalRow}`, "", 8),
    ] : [stringCell(`A${totalRow}`, "NO ROWS MATCHED THE ACTIVE FILTERS", 8)], 23),
  ].join("");

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="3" width="20" customWidth="1"/><col min="4" max="4" width="16" customWidth="1"/><col min="5" max="7" width="20" customWidth="1"/><col min="8" max="10" width="15" customWidth="1"/><col min="11" max="12" width="13" customWidth="1"/><col min="13" max="13" width="22" customWidth="1"/></cols><sheetData>${rows}</sheetData><autoFilter ref="A5:M${Math.max(5, lastDataRow)}"/><mergeCells count="4"><mergeCell ref="A1:M1"/><mergeCell ref="A2:M2"/><mergeCell ref="A3:M3"/><mergeCell ref="A4:M4"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="$#,##0.00;[Red]-$#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%;[Red]-0.0%"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111820"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF7417"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFB4BEC9"/></left><right style="thin"><color rgb="FFB4BEC9"/></right><top style="thin"><color rgb="FFB4BEC9"/></top><bottom style="thin"><color rgb="FFB4BEC9"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0"/><xf numFmtId="164" fontId="3" fillId="4" borderId="1" xfId="0"/><xf numFmtId="165" fontId="3" fillId="4" borderId="1" xfId="0"/><xf numFmtId="166" fontId="3" fillId="4" borderId="1" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Job Cost Tracker" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  zip.file("xl/styles.xml", stylesXml);
  const now = new Date().toISOString();
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>TITAN Financial Job Cost Tracker</dc:title><dc:creator>TITAN</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>TITAN</Application></Properties>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
